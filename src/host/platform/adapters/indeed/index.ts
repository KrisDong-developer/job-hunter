/**
 * Indeed（cn.indeed.com）适配器。
 *
 * ## ⚠️ 2026-09-18 真实调研结论：中国大陆站已停运（必须先读，再决定怎么用）
 *
 * * 直接请求 `cn.indeed.com/jobs?q=…&l=…`：被 **302 重定向到全球站 `www.indeed.com`**，
 *   随后被 **Cloudflare 验证墙拦截**（页面文案「需要进行其他验证」，响应带 `Ray ID`）。
 * * 站点自身也印证停运：全球站首页直接引导「For jobs in China, visit cn.indeed.com」，
 *   但 cn 站首页已变成通用跳转页，职位搜索入口不再返回岗位数据 —— 与 Indeed
 *   2022 年起退出中国大陆市场的事实一致。
 * * 因此**本适配器没有一个可信的「中国大陆岗位列表」真实夹具可校准**。
 *   ADAPTERS.md §6 铁律（不编选择器、未验证不猜）在这里直接适用。
 *
 * ## 那么这份适配器是什么 / 不是什么
 *
 * * **是**：对 Indeed 全球通行的职位搜索页（JCS，job search）真实结构的适配器。
 *   该结构的核心语义锚点（`data-testid` / 类名）在所有 Indeed 国家域上**多年稳定**，
 *   是社区公开文档描述的形态。选择器与 URL 约定全部进配置（DB 可覆盖，ADR-19），
 *   留了后续换域（`host` 可配）即可在仍运营的 Indeed 国家站上校准的余地。
 * * **不是**：对「中国大陆 Indeed 在营数据源」的承诺。默认 `host=cn.indeed.com` 只是
 *   尊重用户原意的默认值 —— 它当前会命中 Cloudflare 墙或重定向，判墙即停（C12）。
 *
 * 诚实边界：因为拿不到可信的中国大陆夹具，`capabilities.fieldCompleteness='low'`、
 * `antiBot='high'`，未锚定字段**留空 + notes**，由字段级断言隔离进 pending_repair，不编。
 *
 * ✍️ 换一个仍运营的域来启用真实采集（示例）：
 *   在 `setting` 表写一条
 *   `scope='platform', scope_ref='indeed', key='adapter-config'` 的 JSON：
 *   `{"host":"de.indeed.com"}`（德国）或 `{"host":"sg.indeed.com"}`（新加坡）等，
 *   再把 `test/fixtures/indeed-search.html` 换成对应域用手动浏览器保存的搜索结果页，
 *   跑 `npm run probe:*` 校准锚点后，本适配器即可变成真实在用的适配器。
 *
 * ## Indeed JCS 结构（社区文档描述的稳定形态，2026-09-18 据此实现，待校准）
 *
 * * 搜索 URL：`https://{host}/jobs?q={关键词}&l={地点}&start={第几批}`；
 *   `start` 每页偏移一个定长（`pageSize`，默认 15）—— Indeed 免费版没有页码按钮，
 *   只有「下一页」，`start=0,15,30…`；
 * * 地点是**自由文本**（`l=` 直接吃中文/英文地名），不依赖城市码映射；
 * * 卡片：职位标题锚 `a.jcs-JobTitle`（就业界稳定类名），href 内带 `jk=<jobkey>`，
 *   `jobkey` 就是平台 id（幂等 upsert 键）；公司 `[data-testid="company-name"]`、
 *   地点 `[data-testid="text-location"]`、薪资 `[data-testid="attribute_snippet_testid"]`、
 *   发布日期 `[data-testid="jobListingDate"]`；
 * * 翻页：分页区 `a[data-testid="pagination-page-next"]`，被禁用时打 `aria-disabled`。
 *
 * 以上锚点**只是实现依据，不是验证证据**（拿不到中国大陆夹具）。锚不中就留空，
 * 靠 `pp()` 架构里已有的字段级断言隔离，绝不假装抓到。
 *
 * ── 本目录分工（2026-09-20 拆成目录）─────────────────────────────────
 * * `./config.ts`：结构锚点集、字段 → URL 参数映射、默认值与合并、jobkey / 薪资正则、
 *   页数上下限、平台判墙信号与开关（`expectedHost` / `skipLoginWall`）—— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的搜索 URL 构造（`start` = (page-1) * pageSize，不碰 `document`）；
 * * `./page.ts`：页面上下文函数（`extractJobsInPage` / `hasNextPageInPage`），自包含；
 * * `./index.ts`：本文件 —— 适配器装配（`createIndeedAdapter`）与 `criteriaDimensions` 表。
 * 换域启用真实采集的做法（改 `host` + 换夹具 + 校准锚点）仍然照上面的说明走。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../../types.js'
import {
  DEFAULT_INDEED_CONFIG,
  INDEED_BLOCK_SIGNALS,
  INDEED_DEFAULT_MAX_PAGES,
  INDEED_MAX_PAGES,
  indeedBlockFlags,
} from './config.js'
import type { IndeedConfig } from './config.js'
import { extractJobsInPage, hasNextPageInPage } from './page.js'
import { buildIndeedSearchUrl } from './urls.js'

export interface IndeedAdapterOptions {
  config?: IndeedConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 Indeed 适配器。 */
export function createIndeedAdapter(options: IndeedAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_INDEED_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    { key: 'city', label: '地点', values: [], hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码' },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: INDEED_MAX_PAGES,
      hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；Indeed 免费版无页码按钮 + Cloudflare 风控，刻意保守。注意：中国大陆站已停运，默认 host 会命中重定向/验证墙`,
    },
  ]

  return {
    id: 'indeed',
    ...platformFacts('indeed'),
    displayName: 'Indeed',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 无可信中国大陆夹具：锚点来自公开描述的稳定结构，未校准 → 如实标 low。
      fieldCompleteness: 'low',
      antiBot: 'high',
    },
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: INDEED_MAX_PAGES,
    defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildIndeedSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildIndeedSearchUrl(config, criteria)
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.titleLink, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          host: config.host,
          jobKeyPattern: config.jobKeyPattern,
          salaryPattern: config.salaryPattern,
        })
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {
          pagination: config.selectors.pagination,
          nextPage: config.selectors.nextPage,
          disabledAttr: config.selectors.nextPageDisabledAttr,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(INDEED_BLOCK_SIGNALS),
          card: config.selectors.titleLink,
          flags: indeedBlockFlags(config.host),
        })
      },
    },

    // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：Indeed 中国站已停运，
    //   无法实测打招呼/投递契约，fail-closed 而不是假装能发（与猎聘同策略）。
  }
}
