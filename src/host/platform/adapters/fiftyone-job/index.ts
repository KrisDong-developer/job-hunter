/**
 * 前程无忧（51job）适配器。
 *
 * 三条设计要点：
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
 * 3. **判墙只有一份实现**（`detectBlockOf`）：`guard.detectBlock`（采集主链）与
 *    `assertActionPage`（动作链）共用 —— 各写一遍会出现"采集认得这道墙、动作不认得"，
 *    而动作那边恰恰是**会真发东西**的一侧。
 *
 * ── 功能深度（2026-09-21 对标 zhipin 补齐）───────────────────────────
 *
 * * `detail.extract`：详情页 JD/字段解析（`./page/detail.ts`）。
 *   ⚠️ 详情页选择器是**候选链、未实测**（本仓没有详情页夹具）：锚不到留空 + 记 note，
 *   可经 DB 覆盖校准 —— 校准入口见 `./page/detail.ts` 文件头。
 * * `actions`（五个高危动作，`./actions.ts`）：sayHello / reply / sendResume /
 *   readInbox / detectStage。证据分层（✅ 实测 / ⚠️ 候选）逐条见 `./config.ts`：
 *   投递链路与「去聊聊」的未登录扫码形态来自真实夹具；登录态会话 DOM 与消息页地址
 *   待真机校准，路径上**fail-closed**。
 *   （此前 `capabilities` 声明 `supportsGreeting: true` 而 `actions` 是 `undefined` ——
 *   契约两个字段互相矛盾、界面撒谎，正是 `adapterImplementationOf` 拆分时要治的那类。）
 * * `auth.isLoggedIn`：升级为**结构性登录锚点**（`.loginBtnClick` 实测未登录侧），
 *   替代旧的"整页判墙反推"（51job 搜索不需要登录，旧法在未登录页上恒判"已登录"）。
 *
 * ── 本目录分工 ──────────────────────────────────────────────────────
 * * `./config.ts`：选择器集、URL 参数映射、默认值与合并、排序/时间窗取值域、
 *   城市码表、页数上限、平台判墙信号常量 —— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的搜索 URL 构造（不碰 `document`）；
 * * `./page/list.ts`：列表解析 / 翻页 / 元素定位 / 登录锚点（自包含）；
 * * `./page/detail.ts`：详情页解析（自包含）；
 * * `./page/chat.ts`：沟通入口形态 / 投递弹窗状态 / 消息送达判读（自包含）；
 * * `./page/inbox.ts`：收件箱解析 / 接触阶段判定（自包含）；
 * * `./actions.ts`：五个高危动作与交互工具；
 * * `./index.ts`：本文件 —— 适配器装配（`createFiftyOneAdapter`）、`criteriaDimensions`
 *   表与判墙的唯一实现。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { platformFacts } from '../../platform-facts.js'
import { actionBlockOf, PlatformBlockedError } from '../../types.js'
import type { CriteriaDimension, PageLike, RawJob, RawJobDetail, SiteAdapter } from '../../types.js'
import { createFiftyOneActions } from './actions.js'
import {
  DEFAULT_FIFTYONE_CONFIG,
  FIFTYONE_BLOCK_SIGNALS,
  FIFTYONE_FILTER_OPTIONS,
  FIFTYONE_MAX_PAGES,
  POSTED_WITHIN_OPTIONS,
  SORT_OPTIONS,
} from './config.js'
import type { FiftyOneConfig } from './config.js'
import { extractDetailInPage } from './page/detail.js'
import {
  extractJobsInPage,
  hasNextPageInPage,
  isLoggedInByMarkersInPage,
} from './page/list.js'
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
   * 判墙的**唯一实现**（采集与动作链共用）。
   *
   * 信号带 51job 特有的两处（get_jobs 实战特征）：阿里云 WAF 滑块
   * （`.waf-nc-title` 文案 + `aliyunwaf_` 脚本名）与很宽的登录词表 ——
   * 完整理由见 `./config.ts` 的 `FIFTYONE_BLOCK_SIGNALS`。
   */
  const detectBlockOf = async (page: PageLike): Promise<BlockKind | null> =>
    await page.evaluate(detectBlockWithSignals, {
      signals: signalsOf(FIFTYONE_BLOCK_SIGNALS),
      card: config.selectors.card,
    })

  /**
   * 动作链上的判墙：命中就抛 `PlatformBlockedError`（由 `guard.run()` 写平台级暂停）。
   *
   * `blank` **不算**风控（见 `types.ts` 的 `actionBlockOf`）：会话页/详情页上 0 张岗位
   * 卡片本来就是常态，照单全收等于每同步一次就白白暂停一次平台。
   */
  const assertActionPage = async (page: PageLike): Promise<void> => {
    const kind = actionBlockOf(await detectBlockOf(page).catch(() => null))
    if (kind !== null) throw new PlatformBlockedError(kind, '动作页面上看到风控页面')
  }

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
      key: 'degree',
      label: '学历',
      values: [...FIFTYONE_FILTER_OPTIONS.degree],
      hint: '取值域 2026-09-23 点击探针全量补齐（逐项点击读 search-pc 请求；01/02/07 为补齐端点，03-06 与 2026-09-21 实测一致）',
      wire: { target: 'url', param: config.urlParams.degreeParam },
    },
    {
      key: 'workYear',
      label: '工作经验',
      values: [...FIFTYONE_FILTER_OPTIONS.workYear],
      hint: '取值域 2026-09-23 点击探针全量补齐（02-05 与 2026-09-21 实测一致；01 应届生 / 06 无需经验 为补齐端点）',
      wire: { target: 'url', param: config.urlParams.workYearParam },
    },
    {
      key: 'companyType',
      label: '公司性质',
      values: [...FIFTYONE_FILTER_OPTIONS.companyType],
      hint: '取值域 2026-09-23 点击探针全量补齐（05 民营 / 06 外企代表处 / 09 非营利 / 10 已上市 / 11 创业公司 为新增）',
      wire: { target: 'url', param: config.urlParams.companyTypeParam },
    },
    {
      key: 'companySize',
      label: '公司规模',
      values: [...FIFTYONE_FILTER_OPTIONS.companySize],
      hint: '取值域 2026-09-23 点击探针全量补齐（此前只有 04 一档，现 01-07 全量）',
      wire: { target: 'url', param: config.urlParams.companySizeParam },
    },
    {
      key: 'jobType',
      label: '职位类型',
      values: [...FIFTYONE_FILTER_OPTIONS.jobType],
      hint: '取值域 2026-09-23 点击探针全量补齐（02 兼职 / 03 实习 为新增）',
      wire: { target: 'url', param: config.urlParams.jobTypeParam },
    },
    {
      key: 'salary',
      label: '月薪范围',
      values: [...FIFTYONE_FILTER_OPTIONS.salary],
      hint: '2026-09-23 点击探针新接入（点「8千以下」→ salary=201）；URL 通道经 search-pc 响应验证：total 907 → 201 档得 159',
      wire: { target: 'url', param: config.urlParams.salaryParam },
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
      // 检测判**搜索页**：登录锚点是在搜索页夹具上校准的（页头 `.loginBtnClick`），
      // 登录页上跑会两边锚点都不中、恒判未登录 —— 见 `auth.checkUrl` 的说明。
      checkUrl: buildSearchUrl(config, {}),
      async isLoggedIn(page): Promise<boolean> {
        // 页头是 SPA 异步挂载的：先等两个锚点**任一**出现再判；
        // 等不到（超时 / 离线夹具没有 waitForSelector）就按原样 evaluate。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(
            `${config.loginSelectors.loggedIn}, ${config.loginSelectors.notLoggedIn}`,
            options.waitForListMs ?? 15_000,
          )
        }
        const verdict = await page.evaluate(isLoggedInByMarkersInPage, {
          loggedIn: config.loginSelectors.loggedIn,
          notLoggedIn: config.loginSelectors.notLoggedIn,
        })
        // 判不出来时按"未登录"处理（保守：宁可漏判已登录，也不要把被登录墙
        // 挡住当成"今天没有新岗位"。旧判据"整页判墙反推"在未登录搜索页上恒判已登录）。
        return verdict ?? false
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

    /**
     * 详情页解析（P2 详情抓取）。
     *
     * ⚠️ 选择器是**候选链、未实测**（见 `./page/detail.ts` 文件头的证据状态）：
     * 锚不到的字段留空 + 记 note，`crawl.ts` 对空 JD 有现成降级（warn + 留空）。
     * 好处是选择器可经 DB 覆盖校准（ADR-19），不必等发版。
     */
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    guard: {
      // 判墙的实现只有一份（`detectBlockOf`）—— 动作链与采集共用它。
      detectBlock: detectBlockOf,
    },

    /**
     * 高危动作（§4.2.2 的 `actions`）。
     *
     * ⚠️ 这些方法**不允许被 domain 直接调用** —— 实现放在 `./actions.ts`，但必须由
     * `guard.run()` 签发一次性令牌后经 `guard/actions/` 调用（§4.4.1）。适配器只负责"怎么点"。
     * 判墙断言（`assertActionPage`）与 `guard.detectBlock` 共用 `detectBlockOf` ——
     * 一处实现两个消费者。
     */
    actions: createFiftyOneActions({ config, assertActionPage }),
  }
}
