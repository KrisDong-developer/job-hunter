/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上 + probe 夹具实证，非二手资料）
 *
 * * **列表页**：真实路由 `/jobList?keyword=<明文>` **302 到 `/job?keyword=Java`**
 *   （probe 实证，2026-09-18）。未登录可看、服务端 SSR。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（WebFetch 实证命中
 *   「财税管理岗（校招）」详情页）。页面含标题 / 更新于 / 薪资 / 公司 / 职位性质 /
 *   招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / **报名截止** / 职位介绍（度量 JD）。
 * * **列表卡片真实 DOM**（probe 实证，`test/fixtures/guopin-search.html`）：
 *
 *   ```html
 *   <div class="job-card">
 *     <div class="job-title" title="java后端 「北京-东城区」">   ← 标题+城市（全角书名号）
 *       <div class="job-name">java后端</div>
 *     </div>
 *     <div class="job-info">     ← 3 个 tag：「性质/经验/学历」（顺序不固定，经验偶缺）
 *       <span class="tag-item">校招</span><span>应届生</span><span>本科</span>
 *     </div>
 *     <div class="job-tag"><span class="ant-tag">Java工程师</span>…</div>
 *     <a class="company-name" href="/company?id=…" title="…">…</a>  ← 公司（文本可能省略号截断）
 *     <div class="company-info">  ← 顺序固定 ×3：性质/规模/行业
 *       <span class="company-info-item">国企</span><span>1000-2000人</span><span>软件和信息技术服务业</span>
 *     </div>
 *   </div>
 *   ```
 *
 * ## ⚠️ 两个 phase-1 就被 probe 推翻的事实（决定本适配器形态）
 *
 * 1. **列表卡片无薪资**：`.job-info` 只有性质/经验/学历，薪资只出现在详情页。
 *    因此 `requiredFields` **不含 `salary_raw`**（否则每条都被隔离）；`salaryRaw` 留空，
 *    由详情抓取（detail.extract）补。
 * 2. **列表页无平台 id**：无 `/job/detail?id=` 链接、无 `__NEXT_DATA__`/`jobId`/`positionId`
 *    持久化载荷。id 只在详情页。⇒ **upsert 幂等键用内容哈希**（用户拍板）：
 *    `platformJobId = "ch:" + FNV1a(title|company|city|district)`，deterministic，
 *    同岗位重复抓不重复；`sourceUrl` 存列表页 URL（不编详情 URL）。
 *
 * ## 分页 / 城市码：仍未确证（**不编**）
 *
 * * **分页参数未确证**：真实路由 `/job?keyword=` 无页码参数；从页面底部数字分页拿到
 *   真实 href 前，`hasNextPage` 恒 false、`maxPages=1`（单页采集，绝不去猜参数）。
 * * **城市码未实测**：筛选栏有北京/上海…，但 URL 城市参数未实证 → `cityCodes` 置空，
 *   未列出城市 `buildSearchUrl` 返回 null（入口层拒绝）。
 *
 * ## 判定墙
 *
 * 国聘是政府背景平台，未观测到 CDP 检测（对应 §7.1「51job/智联/神仙外企」那一档）。
 * `detectBlock` 走通用文案判定：验证控件 → 频控 → 登录墙 → 空页。列表页未登录可看
 * （投递才要登录），所以 `searchWithoutLogin: true`；antiBot 如实定 `low`。
 *
 * ── 本目录分工（2026-09-20 拆成目录）─────────────────────────────────
 * * `./config.ts`：结构锚点集、字段 → URL 参数映射、默认值与合并、城市码表、
 *   各字段正则常量、页数上限、平台判墙信号 —— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的列表页 / 详情页 URL 构造（不碰 `document`）；
 * * `./page.ts`：页面上下文函数（`extractJobsInPage` / `extractDetailInPage`），自包含；
 * * `./index.ts`：本文件 —— 适配器装配（`createGuopinAdapter`）与 `criteriaDimensions` 表。
 * 上面这些实测结论（无薪资 / 无平台 id / 分页与城市码不编）依然有效，只是实现各归其位。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import { DEFAULT_GUOPIN_CONFIG, GUOPIN_BLOCK_SIGNALS, GUOPIN_MAX_PAGES } from './config.js'
import type { GuopinConfig } from './config.js'
import { extractDetailInPage, extractJobsInPage } from './page.js'
import { buildGuopinSearchUrl } from './urls.js'

export interface GuopinAdapterOptions {
  config?: GuopinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造国聘网适配器。 */
export function createGuopinAdapter(options: GuopinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_GUOPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      // 空表 ≠ 自由文本：`buildGuopinSearchUrl` 带城市但表里没有就返回 null（**不猜**）。
      closed: true,
      hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: GUOPIN_MAX_PAGES,
      hint: '分页参数未确证（?p=2 未翻页），v1 单页采集；探针夹具确认分页契约后放开',
    },
  ]

  return {
    id: 'guopin',
    ...platformFacts('guopin'),
    displayName: '国聘网',
    capabilities: {
      // 列表页未登录可看（投递才要登录）。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 列表卡片**无薪资**（probe 实证）→ salary_raw 不在必需字段里；其余核心字段齐全。
      fieldCompleteness: 'medium',
      antiBot: 'low',
    },
    // 列表卡片无薪资、无平台 id（幂等键用内容哈希）→ 核心必需字段只声名 title/company/source_url。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: GUOPIN_MAX_PAGES,
    // 分页契约未确证（hasNextPage 恒 false）—— 默认就 1 页。
    defaultMaxPages: 1,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildGuopinSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildGuopinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`国聘网：城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        await page.goto(url)
        // 页面服务端可渲染，但仍等一次卡片容器存在：0 条最易被误读成「今天没有新岗位」。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      async hasNextPage(): Promise<boolean> {
        // 分页参数未确证（见文件头）—— 恒 false；probe:guopin 夹具确认后补真实分页契约。
        return false
      },
    },

    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
          deadlinePattern: config.deadlinePattern,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(GUOPIN_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
      },
    },

    // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
    //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
  }
}
