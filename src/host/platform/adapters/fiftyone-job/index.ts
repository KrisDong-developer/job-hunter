/**
 * 前程无忧（51job）适配器。
 *
 * 两条设计要点：
 *
 * 1. **选择器与字段→URL 映射是配置，不是硬编码**（ADR-19 / D-18）。
 *    代码里带一份默认值，DB 里的覆盖优先（`setting` 表：scope='platform'、scope_ref='51job'、
 *    key='adapter-config'）。选择器坏了自己在 UI 改，不用等发版（J2 / R5）。
 *
 * 2. **解析函数是自包含的**，因为它在真路径上会被序列化后送进浏览器执行
 *    （`page.evaluate`）。它只读全局 `document`、只依赖入参 `config`，
 *    绝不引用模块作用域的自由变量 —— 否则真路径会 ReferenceError。
 *    离线测试用 jsdom 提供同一个 `document`，于是**同一份代码**在两条路径上跑。
 *
 * ── 本目录分工（2026-09-20 拆成目录）─────────────────────────────────
 * * `./config.ts`：选择器集、URL 参数映射、默认值与合并、排序/时间窗取值域、
 *   城市码表、页数上限、平台判墙信号常量 —— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的搜索 URL 构造（不碰 `document`）；
 * * `./page.ts`：页面上下文函数（`extractJobsInPage` / `hasNextPageInPage`），自包含；
 * * `./index.ts`：本文件 —— 适配器装配（`createFiftyOneAdapter`）与 `criteriaDimensions` 表。
 * 上面第 1、2 条设计要点依然成立，只是分别落到了 `./config.ts` 与 `./page.ts` 里。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, SiteAdapter } from '../../types.js'
import {
  DEFAULT_FIFTYONE_CONFIG,
  FIFTYONE_BLOCK_SIGNALS,
  FIFTYONE_MAX_PAGES,
  POSTED_WITHIN_OPTIONS,
  SORT_OPTIONS,
} from './config.js'
import type { FiftyOneConfig } from './config.js'
import { extractJobsInPage, hasNextPageInPage } from './page.js'
import { buildSearchUrl } from './urls.js'

export interface FiftyOneAdapterOptions {
  config?: FiftyOneConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 51job 适配器。 */
export function createFiftyOneAdapter(options: FiftyOneAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_FIFTYONE_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * SR-41/42：**声明**本适配器支持的筛选维度。
   *
   * 这张表就是"能力驱动的 UI"的唯一来源：界面据它渲染、
   * 校验据它拒绝（SR-45 三条入口共用同一份）。
   */
  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，平台原样接收',
      wire: { target: 'url', param: config.urlParams.keywordParam },
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '只有这张表里的城市有对应的平台城市码；其它城市无法构造搜索 URL',
      wire: { target: 'url', param: config.urlParams.cityParam },
    },
    {
      key: 'sort',
      label: '排序方式',
      values: SORT_OPTIONS,
      hint: '实测：综合/活跃/最新/薪资四档有实值（sortType 分别为 0/5/1/3）；「距离优先」平台未启用、无实值，故不提供',
      wire: { target: 'url', param: config.urlParams.sortParam },
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: POSTED_WITHIN_OPTIONS,
      // ⚠️ `closed: true` 是**必须**的，不是修饰：空值域 + 缺省 `closed`
      //（= `values.length > 0` = false）= **自由文本**，界面会把它渲染成一个能填的
      // 数字框、校验也放行 —— 而这里的事实是"一个取值都不收"（issueDate 恒为空）。
      // 单测早就写着"空值域 → 界面据此禁用"（test/platform/fiftyone.test.ts），
      // 但缺了这一个 flag，界面做的事刚好相反：用户填了 7 天，平台上什么都没筛。
      closed: true,
      hint: '探针实测本页面无「发布时间」筛选控件（API 的 issueDate 恒为空），该维度不可用',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: FIFTYONE_MAX_PAGES,
      hint: `最多 ${String(FIFTYONE_MAX_PAGES)} 页 —— 再多不会更全，只会更容易触发风控`,
    },
  ]

  return {
    id: '51job',
    // 成熟度与登录需求来自统一事实表（platform-facts.ts）——见该文件头的填表纪律
    ...platformFacts('51job'),
    displayName: '前程无忧',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: true,
      supportsReadReceipt: false,
      supportsInbox: true,
      supportsGreeting: true,
      fieldCompleteness: 'high',
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段。这里是协议里的四个核心字段。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    // SR-41/42：声明支持的筛选维度（界面与校验的唯一来源）
    criteriaDimensions: dimensions,
    maxPages: FIFTYONE_MAX_PAGES,
    // 没有站点侧依据的"默认多抓几页"不编：留 1（hint 也只说了上限 5 页）。
    defaultMaxPages: 1,

    // P3 登录态：只回答「当前页会不会被登录墙挡住」。
    // 51job 的搜索本身不需要登录（capabilities.searchWithoutLogin），
    // 所以这里主要服务于打招呼/投递（P5）与「别把登录墙当成没有新岗位」这条要求。
    auth: {
      loginUrl: 'https://login.51job.com/login.php',
      // 检测判**搜索页**：判据是"0 卡片 + 文本里有『登录/注册/扫码』"，
      // 它是按结果页校准的 —— 在登录页上跑会恒判未登录（那一页本来就没有卡片、
      // 又到处都是"登录"）。见 `auth.checkUrl` 的说明。
      checkUrl: buildSearchUrl(config, {}),
      async isLoggedIn(page): Promise<boolean> {
        const block = await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(FIFTYONE_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
        return block !== 'login-required'
      },
    },

    criteria: { buildSearchUrl: (criteria) => buildSearchUrl(config, criteria) },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`51job: 无法为城市「${criteria.city ?? ''}」构造搜索 URL（城市码未配置）`)
        }
        await page.goto(url)

        // 51job 的搜索页是 SPA：`load` 时列表还没渲染。
        // 先等卡片容器出现（最可靠的信号），再叠一层随机延时（P5：请求间随机延时）。
        // 少了这一步，页面「打开正常」却解析出 0 条 —— 最容易被误读成「今天没有新岗位」。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        // 只读页面原先一次输入事件都不产生，而真人看列表一定会滚动。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {})
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(FIFTYONE_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
      },
    },
  }
}
