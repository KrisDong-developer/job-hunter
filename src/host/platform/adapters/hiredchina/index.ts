/**
 * HiredChina（hiredchina.com）适配器 —— 2026-09-18 基于真实线上调研。
 *
 * ## 平台是什么
 *
 * HiredChina 是面向**在华外国人**的招聘平台（与 eChinacities 同源），帮助中国企业招聘
 * 全球人才（英语外教 / 市场营销 / 销售 / IT…），覆盖 120+ 国家、月访问约 300 万。
 * 招聘侧大量岗位天然支持签证担保 / 远程，与项目「海外支线 §4.M」高度相关。
 *
 * ## 调研来源（2026-09-18 一手，非二手资料）
 *
 * * **两个同源域名**（Next.js App Router 同一套应用）：
 *   - 主站 `www.hiredchina.com` —— 对外「人看的入口」，但 **raw HTTP 直接访问会被
 *     Cloudflare managed challenge 拦截**（实测返回 `Just a moment...` + `_cf_chl_opt`
 *     脚本）；真实浏览器里带着用户登录态/会话能正常通过 —— 这正是本插件走真浏览器的意义。
 *   - 子域 `hcweb.gicexpat.com` —— 同一应用，raw HTTP **不被 Cloudflare 拦截**
 *     （实测 200 + 430KB SSR 页面），是探针 / 夹具 / DB 覆盖时的可验证入口。
 * * **列表页**：`/<lang>/jobs`（`lang ∈ {en, zh}`），Next.js **RSC 服务端渲染**
 *   （HTML 内嵌 `self.__next_f.push(...)`，**没有** `__NEXT_DATA__`、也**没有**单独的
 *   jobs JSON 接口 —— 翻页与筛选都是整页 SSR 导航）。所以列表可直接抓 DOM，不需要
 *   像神仙外企那样在页面里调接口。
 * * **详情页**：`/en/job/<uuid>?returnTo=...`；`jobId` 是 **UUID**（8-4-4-4-12 十六进制）。
 *
 * ## 真实夹具校准的卡片 DOM（2026-09-18 浏览器探针逐字段验证）
 *
 * 每张卡片是一个 `<a>`（href 指向详情），内部包 `div[data-slot="card"]`：
 *
 * ```
 * a[href^="/(en|zh)/job/"]  .block.w-full.h-full     ← 卡片外层锚点（卡片身份）
 * └─ div[data-slot="card"]
 *    ├─ h3                                          ← 标题（含 text-emerald-600 font-bold）
 *    ├─ [行，含 lucide-building-2 svg] > span.truncate   ← 公司名
 *    └─ 五个徽章徽章 div（各带不同 Tailwind 底色，即字段判别锚点）：
 *       ├─ bg-emerald-50 text-emerald-700 > span.truncate  ← 薪资（如 "20K - 25K…" / "Negotiable"）
 *       ├─ bg-gray-50       text-gray-600   > span.truncate  ← 地点（如 "China · Guangzhou"）
 *       ├─ bg-blue-50       text-blue-600   > span.truncate  ← 雇佣类型（Full-time / Part-time）
 *       ├─ bg-orange-50     text-orange-600 > span.truncate  ← 工作模式（On-site / Remote）
 *       └─ bg-slate-50      text-slate-500   > span.truncate  ← 经验（"Unlimited experience" / "3～5 years"）
 *   最后一行 border-t（底部）：相对发布时间（"2d ago" / "7h ago"，首个有时是绝对日期）
 * ```
 *
 * ⚠️ 这些底色是 Tailwind 语义化色板（emerald=薪资 / gray=地点 / blue=雇佣 / orange=工作模式 /
 * slate=经验），是**平台自己用来区分字段的稳定约定**，比序号依赖稳。任何一项都可以在 DB 里
 * 覆盖着改（ADR-19），选错只影响该字段、不影响卡片总数。
 *
 * ## 翻页与筛选（全部已实测）
 *
 * * 翻页：`?page=N`（如 `?page=2`），每页 10 条、共 749 页；分页容器 `nav[aria-label="pagination"]`，
 *   `hasNextPage` 用「分页容器里是否存在页码 > 当前页的链接」判断 —— **不自己拼下一页 URL**。
 * * 关键词：`?kw=<词>`（键名是 **`kw`**，不是 `keyword`）；触发需在搜索框逐字输入 + 回车。
 * * 类别：`?type=<slug>`，值 `teaching / marketing / sales_support / other`（`marketing` 与
 *   zh 站「市场营销」都实测映射到 `type=marketing`）。
 * * 雇佣类型：`?employmentId=1`（Full-time / 全职）、`?employmentId=2`（Part-time / 兼职）。
 * * 工作模式：`?isOnline=1`（Remote / 远程）、`?isOnline=0`（On-site / 现场）。
 * * **没有城市 URL 筛选**：页面的地点 quick 按钮（中国/英国…）点击**不产生 URL 参数**，
 *   纯客户端；「More」下拉给的是 `nationalitieParentN`（国籍/语言过滤，不是城市）——
 *   所以本适配器**不声明城市维度**，带城市一律 `buildSearchUrl` 返回 null（fail-closed，
 *   绝不「抓了全国假装抓了深圳」）。
 *
 * ## 详情页（2026-09-18 探针注明，待 probe:hiredchina 落盘详情夹具校准）
 *
 * 标题 `h1`；薪资在渐变卡片 `div[class*="bg-gradient-to-br"]` 内的 `[class*="text-3xl"]`；
 * 徽章行 `div.flex.flex-wrap.gap-2` 按「地点 → 行业 → 雇佣类型 → 工作模式 → 语言」顺序；
 * JD 全文 `div.prose.prose-sm`。⚠️ **本平台详情页没有**签证担保 / 公司规模 / 公司性质 /
 * relocation 字段 —— 因此 `visa` / `companySize` / `companyNature` 一律不编（该平台没有，
 * 编了就是臆造）。
 *
 * ## 判定墙
 *
 * `www.hiredchina.com` 的 Cloudflare managed challenge 是**真实观测**到的第一层墙
 * （raw HTTP 直接命中）。`detectBlock` 显式认得 `_cf_chl_opt` / `Just a moment` /
 * `cf-browser-verification` 这些 Cloudflare 信号，命中即 `captcha` 交还人工（C12）。
 * 此外沿用通用文案判定（验证控件 / 频控 / 登录墙 / 空页）。antiBot 如实定 `medium`。
 *
 * ## 投递 / 打招呼
 *
 * 列表公共可看（未登录可抓，`searchWithoutLogin: true`），投递需登录。未在列表夹具验证
 * 稳定投递按钮契约之前，**不实现** `actions`（fail-closed，见 docs/ADAPTERS.md §6）。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createHiredChinaAdapter` 与 `HiredChinaAdapterOptions`（编排）。
 * * `config.ts` —— 选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 `merge*`（配置面）。
 * * `urls.ts` —— 列表页 URL 的宿主机侧构造（不碰 `document`）。
 * * `page.ts` —— `page.evaluate` 送进浏览器的自包含解析函数（列表 / 详情 / 翻页）。
 * * 本平台没有「页面内请求且结果回给宿主」的通道，故无 `api.ts`。
 * * 配置面（`DEFAULT_*` / `merge*`）一律从 `./config.js` 取，本文件不转出。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import {
  DEFAULT_HIREDCHINA_CONFIG,
  HIREDCHINA_BLOCK_SIGNALS,
  HIREDCHINA_EMPLOYMENT_OPTIONS,
  HIREDCHINA_TYPE_OPTIONS,
  HIREDCHINA_WORK_MODE_OPTIONS,
} from './config.js'
import type { HiredChinaConfig } from './config.js'
import { extractDetailInPage, extractJobsInPage, hasNextPageInPage } from './page.js'
import { buildHiredChinaSearchUrl } from './urls.js'

export interface HiredChinaAdapterOptions {
  config?: HiredChinaConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options: HiredChinaAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 上一次 `gotoSearch` 记下的筛选条件（与 waiqi 同因：`readListPage(page)` / `hasNextPage(page)`
   * 只拿得到 page，拿不到 criteria —— 见 domain/crawl.ts 的循环）。
   */
  const pending = new WeakMap<object, SearchCriteria>()

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，对应 ?kw=（实测键名；需在页面输入触发）' },
    {
      key: 'type',
      label: 'Job Type',
      values: HIREDCHINA_TYPE_OPTIONS,
      hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 建议 probe 逐档确认',
    },
    {
      key: 'employment',
      label: '雇佣类型',
      values: HIREDCHINA_EMPLOYMENT_OPTIONS,
      hint: '对应 ?employmentId=（已实测：1=全职 / 2=兼职）',
    },
    {
      key: 'workMode',
      label: '工作模式',
      values: HIREDCHINA_WORK_MODE_OPTIONS,
      hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时归一到 远程/现场/混合 标签',
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      // 同上：本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
      closed: true,
      hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: config.maxPages,
      hint: `翻页已实测有效（?page=N、每页 10 条、749 页）；` +
        `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
    },
  ]

  return {
    id: 'hiredchina',
    ...platformFacts('hiredchina'),
    displayName: 'HiredChina',
    capabilities: {
      // 列表公共可看（探针浏览器未登录即可渲染列表）→ 搜索不需要登录。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 结构化卡片：标题/公司/薪资/地点几乎都在；但字段靠底色徽章锚定，偶发缺失 → medium。
      fieldCompleteness: 'medium',
      // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
      antiBot: 'medium',
    },
    // 薪资绝大多数存在（"Negotiable" 也是合法值，见 validate.ts）→ 用完整核心四字段。
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: config.maxPages,
    // 未声明默认深度（hint 只说了上限的取舍理由）—— 1 页。
    defaultMaxPages: 1,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildHiredChinaSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildHiredChinaSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`HiredChina：城市「${criteria.city ?? ''}」筛选未实现（URL 参数未确证）—— 拒绝猜测`)
        }
        pending.set(page as object, criteria)
        await page.goto(url)
        // 列表是 RSC SSR，load 时卡片应已在；仍等一次卡片锚点，防「今天没有新岗位」误读。
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
        const jobs = await page.evaluate(extractJobsInPage, config)
        if (jobs.length === 0) {
          // 0 条可能是真没结果，也可能是改版 —— 交给主链按 NO_RECORDS 记 partial，不在这里猜。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        const criteria = pending.get(page as object) ?? {}
        const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1
        return await page.evaluate(hasNextPageInPage, {
          selector: config.selectors.pagination,
          currentPage: pageNo,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
          card: config.selectors.card,
          // ⚠️ **刻意不传 `cardBox`**：原实现的 arg 里声明了它，但函数体从未使用过
          //    （只 querySelectorAll(arg.card)）。传进去会让"卡片数为 0"多一条兜底判据，
          //    从而少判 blank —— 那是行为改变，不是迁移。
        })
      },
    },

    // 详情页 JD 全文（P2 详情抓取）。选择器（h1 / 渐变卡片薪资 / prose JD）探针注明，
    // 待 probe:hiredchina 落盘详情夹具校准；该平台无签证/公司规模字段，故不编这些。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    // ⚠️ 不实现 `actions`：投递需登录且列表夹具未验证稳定投递契约 → fail-closed。
  }
}
