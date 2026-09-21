/**
 * HiredChina（hiredchina.com）适配器 —— 2026-09-18 首次调研，2026-09-20 真实夹具校准。
 *
 * ## 平台是什么
 *
 * HiredChina 是面向**在华外国人**的招聘平台（与 eChinacities 同源），帮助中国企业招聘
 * 全球人才（英语外教 / 市场营销 / 销售 / IT…），覆盖 120+ 国家、月访问约 300 万。
 * 招聘侧大量岗位天然支持签证担保 / 远程，与项目「海外支线 §4.M」高度相关。
 *
 * ## 调研来源（一手实测）
 *
 * * **两个同源域名**（Next.js App Router 同一套应用）：
 *   - 主站 `www.hiredchina.com` —— 对外「人看的入口」，但 **raw HTTP 直接访问会被
 *     Cloudflare managed challenge 拦截**（实测返回 `Just a moment...` + `_cf_chl_opt`
 *     脚本）；真实浏览器里带着用户登录态/会话能正常通过 —— 这正是本插件走真浏览器的意义。
 *   - 子域 `hcweb.gicexpat.com` —— 同一应用，raw HTTP **不被 Cloudflare 拦截**
 *     （实测 200 + 430KB SSR 页面），是探针 / 夹具 / DB 覆盖时的可验证入口。
 * * **列表页**：`/<lang>/jobs`（`lang ∈ {en, zh}`）。
 * * **详情页**：`/<lang>/job/<uuid>`（单数 job，与列表的 /jobs 不同）；
 *   `jobId` 是 **UUID**（8-4-4-4-12 十六进制）。
 *
 * ## 2026-09-20 真实夹具校准（本轮最重要的一次实测，推翻了两条旧假设）
 *
 * 探针（`npm run probe:hiredchina`，走 hcweb 子域）抓到了完整真实页面，钉进
 * `test/fixtures/hiredchina-search{-p2}.html` 与 `hiredchina-detail.html`。三条结论：
 *
 * * **列表卡片不在 DOM 里**（旧假设"RSC 服务端渲染、可直接抓 DOM"**错误**）：
 *   raw HTML 里没有任何 `/job/` 链接、没有 `data-slot="card"`、没有分页容器。
 *   岗位数据整包躺在 `self.__next_f.push([1,"f:…"])` 的 RSC 流里（`JobsClientWrapper`
 *   的 `initialData.list`，每页 10 条），卡片本身是**客户端组件**渲染的。
 *   ⇒ 列表解析改走 **payload 通道**（`page/list.ts` 的 `extractJobsFromPayloadInPage`），
 *   09-18 记的那套「底色徽章 DOM 锚点」整体废弃。payload 的额外收益：
 *   `refreshAt` 绝对时间戳（DOM 时代只有 "2d ago"）、`line` UUID 直接给出、
 *   `isOnline`/`employmentKey` 数值与键比文案稳。
 * * **薪资并非"绝大多数存在"**：payload 里 `salaryKey` 的实测分布是
 *   `keep.secret × 4 / 区间 × 6`（10 条里 4 条保密，还原为 "Negotiable" 面议）。
 *   ⇒ `requiredFields` **不再含 `salary_raw`**（与 zhipin 同款取舍：留着会把约四成
 *   记录打进 `pending_repair`；`fieldCompleteness: medium` 如实声明）。
 * * **详情页是 SSR 直出 DOM**（与列表页相反）：h1 / 公司名（渐变卡内 `p.font-medium`）
 *   / 行业（兄弟行 `p.text-sm`）/ 薪资（`items-start shrink-0` 容器的金额元素 ——
 *   **不是** text-3xl，那是 h1 的 `md:` 前缀）/ 徽章行（SSR 已翻好文本，第 2 枚是行业）
 *   / JD（`Job Description` 与 `Requirements` 两段 prose，按标题锚定拼接）全部可锚。
 *   ⇒ 详情选择器全套校准，公司名/行业从"留空"升级为可锚定。
 *
 * ## 翻页与筛选（已实测）
 *
 * * 翻页：`?page=N` 在 **payload 层**真换数据（p1/p2 首条 UUID 不同），每页 10 条。
 *   payload 里**没有任何分页元信息**（total/hasMore 实测全无）⇒ `hasNextPage` 用
 *   「本页满 `pageSize` 条即有下一页」判断（liepin「本页不满即停」的同款镜像；
 *   末页恰好满页时会多探一页空页，由主链按 NO_RECORDS 收尾，可接受）。
 * * 关键词：`?kw=<词>`（键名是 **`kw`**，不是 `keyword`）。
 * * 类别：`?type=<slug>`，值 `teaching / marketing / sales_support / other`。
 * * 雇佣类型：`?employmentId=1`（Full-time / 全职）、`?employmentId=2`（Part-time / 兼职）。
 * * 工作模式：`?isOnline=1`（Remote / 远程）、`?isOnline=0`（On-site / 现场）。
 * * **没有城市 URL 筛选**：页面的地点 quick 按钮纯客户端；「More」下拉是国籍/语言过滤
 *   —— 所以本适配器**不声明城市维度**，带城市一律 `buildSearchUrl` 返回 null（fail-closed，
 *   绝不「抓了全国假装抓了深圳」）。
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
 * 列表公共可看（未登录可抓，`searchWithoutLogin: true`），投递需登录。未在夹具验证
 * 稳定投递按钮契约之前，**不实现** `actions`（fail-closed，见 docs/ADAPTERS.md §6）。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createHiredChinaAdapter` 与 `HiredChinaAdapterOptions`（编排）；
 *   判墙的**唯一实现**（`detectBlockOf`）也在本文件 —— 与 `zhipin` 同一处，将来动作链
 *   落地时它的第二个消费者（`assertActionPage`）直接接在这里，不必再抄一遍信号集。
 * * `config.ts` —— payload 锚点 / 选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 `merge*`。
 * * `urls.ts` —— 列表页 URL 的宿主机侧构造（不碰 `document`）。
 * * `page/list.ts` —— 列表侧页面上下文函数（RSC 流 → `initialData.list` → `RawJob`）。
 * * `page/detail.ts` —— 详情侧页面上下文函数（JD / 薪资 / 公司 / 行业 / 徽章行归一）。
 * * 本平台没有「页面内请求且结果回给宿主」的通道（数据内嵌在 HTML 里），故无 `api.ts`。
 * * 配置面（`DEFAULT_*` / `merge*`）一律从 `./config.js` 取，本文件不转出。
 *
 * 📌 `page/` 这一层对齐 `zhipin/page/` 的功能分区（`liepin` 2026-09-20 做过同款对齐）：
 *    "这段函数在哪个页面上下文里跑"是读这份代码时最要紧的一件事。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, PageLike, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import {
  DEFAULT_HIREDCHINA_CONFIG,
  HIREDCHINA_BLOCK_SIGNALS,
  HIREDCHINA_EMPLOYMENT_OPTIONS,
  HIREDCHINA_TYPE_OPTIONS,
  HIREDCHINA_WORK_MODE_OPTIONS,
} from './config.js'
import type { HiredChinaConfig } from './config.js'
import { extractDetailInPage } from './page/detail.js'
import { extractJobsFromPayloadInPage } from './page/list.js'
import { buildHiredChinaSearchUrl } from './urls.js'

export interface HiredChinaAdapterOptions {
  config?: HiredChinaConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
}

/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options: HiredChinaAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 最近一次 `readListPage` 解析出的条数 —— `hasNextPage(page)` 只拿得到 page
   * （见 domain/crawl.ts 的循环），满页判据要靠它（payload 无任何分页元信息）。
   */
  const lastCount = new WeakMap<object, number>()

  /**
   * 判墙的**唯一实现**（与 `zhipin` / `liepin` 同一处）。
   *
   * 现在只有一个消费者（`guard.detectBlock`），但先抽出来是因为动作链一旦落地，
   * `assertActionPage` 就是第二个 —— 各写一遍 `page.evaluate(detectBlockWithSignals, …)`
   * 的话，改信号集时漏掉一处就会出现"采集认得这道墙、动作不认得"，
   * 而动作那边恰恰是**会真发东西**的一侧。
   *
   * `card` 是判墙锚（"0 卡片 + 短文本"判 blank/登录墙的那条判据）—— 列表解析已走
   * payload，不再有卡片选择器；真浏览器 hydrate 后 `a[href*="/job/"]` 会命中渲染出的
   * 卡片，语义仍是"页面上有没有岗位"。
   */
  const detectBlockOf = async (page: PageLike): Promise<BlockKind | null> =>
    await page.evaluate(detectBlockWithSignals, {
      signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
      card: config.selectors.card,
    })

  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，对应 ?kw=（实测键名）',
      wire: { target: 'url', param: config.urlParams.keywordParam },
    },
    {
      key: 'type',
      label: 'Job Type',
      values: HIREDCHINA_TYPE_OPTIONS,
      hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 建议 probe 逐档确认',
      wire: { target: 'url', param: config.urlParams.typeParam },
    },
    {
      key: 'employment',
      label: '雇佣类型',
      values: HIREDCHINA_EMPLOYMENT_OPTIONS,
      hint: '对应 ?employmentId=（已实测：1=全职 / 2=兼职）',
      wire: { target: 'url', param: config.urlParams.employmentParam },
    },
    {
      key: 'workMode',
      label: '工作模式',
      values: HIREDCHINA_WORK_MODE_OPTIONS,
      hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时按 payload 的 isOnline 归一',
      wire: { target: 'url', param: config.urlParams.workModeParam },
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      // 本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
      closed: true,
      hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: config.maxPages,
      hint: `翻页已实测有效（?page=N 在 payload 层真换数据、每页 10 条）；` +
        `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
    },
  ]

  return {
    id: 'hiredchina',
    ...platformFacts('hiredchina'),
    displayName: 'HiredChina',
    capabilities: {
      // 列表公共可看（探针未登录即可抓）→ 搜索不需要登录。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 薪资约四成 keep.secret（2026-09-20 实测 4/10）→ 如实 medium，不夸大成 high。
      fieldCompleteness: 'medium',
      // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
      antiBot: 'medium',
    },
    // ⚠️ 不含 salary_raw：payload 实测 10 条里 4 条 `salaryKey=keep.secret`（还原为
    // "Negotiable" 面议）—— 列进必需字段会把约四成记录打进 pending_repair（zhipin 同款
    // 取舍，清单按各平台实测覆盖率定，不是统一模板）。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: config.maxPages,
    // 未声明默认深度 —— 1 页。
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
        await page.goto(url)
        // 不等卡片 DOM：列表卡片是客户端组件渲染的，raw HTML 里**没有**（2026-09-20
        // 实测定案）；岗位数据在 RSC 流里，HTML 送达那一刻就完整可读 —— `readListPage`
        // 直接解析 payload，无需等待渲染。风控接管由 `detectBlock` 判（Cloudflare 信号）。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        // 0 条可能是真没结果，也可能是改版（RSC 流锚点漂移）—— 交给主链按
        // NO_RECORDS 记 partial，不在这里猜。
        const jobs = await page.evaluate(extractJobsFromPayloadInPage, {
          anchors: config.payloadAnchors,
          lang: config.lang,
        })
        lastCount.set(page as object, jobs.length)
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        // payload 里没有任何分页元信息（total/hasMore 实测全无）→ 满页即有下一页
        // （liepin「本页不满即停」的同款镜像；末页恰好满页时多探一页空页可接受）。
        const count = lastCount.get(page as object) ?? 0
        return count > 0 && count >= config.pageSize
      },
    },

    guard: {
      // 判墙的实现只有一份（`detectBlockOf`）—— 动作链将来落地时复用同一份信号集。
      detectBlock: detectBlockOf,
    },

    // 详情页 JD 全文（P2 详情抓取）。选择器 2026-09-20 由真实详情页夹具全套校准
    // （h1 / 公司 / 行业 / 薪资 / 徽章行 / JD 按标题锚定拼接）；该平台无签证/公司
    // 规模字段，故不编这些。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    // ⚠️ 不实现 `actions`：投递需登录且未验证稳定投递契约 → fail-closed。
  }
}
