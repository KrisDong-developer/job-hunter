/**
 * Indeed（cn.indeed.com）适配器。
 *
 * ## ✅ 2026-09-21 复核定案：cn 站真实可用（probe:indeed-login 两跑实证）
 *
 * 用户提供了真实可用的搜索地址（`…/jobs?q=&l=广州市&…&vjk=…`），与 2026-09-18 的
 * 「停运」记录矛盾 —— `probe:indeed-login`（两侧取证：未登录 vs 已登录）当天复核：
 *
 *   * **未登录即可搜**：同一条广州搜索页解析出 **16 条**，`jk=` jobKey 16/16、
 *     标题/公司/城市全中、不判墙（证据：`.probe-indeed-capture/` 两侧快照与报告，
 *     真实夹具已钉 `test/fixtures/indeed-search.html`）；
 *   * **登录墙是首访抖动**：全新 profile 首访会被送到
 *     `secure.indeed.com/auth?co=CN&continue=<原地址>`（页面载荷 `"isLoggedIn":false`），
 *     profile 里有 `cf_clearance` 后复访直出列表 —— 地址级判据（`expectedHost`）已覆盖
 *     这种跨域形态，判墙即停（C12），无需登录即可采集；
 *   * **登录判据两侧定案**：页面内嵌载荷 `"isLoggedIn":true|false`（匿名搜索页 /
 *     登录页 = false，已登录搜索页 = true）→ `auth.isLoggedIn` 已落地；回落判据是
 *     匿名侧登录入口链接（匿名 2 命中 / 已登录 0）；
 *   * **翻页校准**：真实分页容器是 `nav[aria-label="pagination"]`（页头的
 *     `nav.gnav[aria-label="主要国家"]` 排在前面，宽泛选择器会抓错），「下一页」
 *     `a[data-testid="pagination-page-next"]` 真实存在；`start` 步进 = **10**
 *     （翻页链接 href 算术：page-2→start=10、page-3→start=20）；
 *   * **无源字段**：这批 16 条卡片的薪资（`attribute_snippet_testid`）与发布日期
 *     （`jobListingDate`）节点 **0 命中** —— 数据不在这批页面上，不是选择器错。
 *     `salary_raw` 不进必需字段（hiredchina/zhipin 同款取舍）。
 *
 *     ⚠️ **后半句已被同日的载荷复核修正（2026-09-21 追加）**：发布日期其实**有源** ——
 *     同一搜索页内嵌 `window.mosaic.providerData["mosaic-provider-jobcards"]` 的
 *     `metaData.mosaicProviderJobCardsModel.results[]`（连接键 `jobkey` ↔ DOM 的 `jk`，
 *     15/16 重合），`formattedRelativeTime`（「25天前」/「30+天前」）15/15 有值、
 *     `pubDate`（epoch ms）同在。**薪资两侧都确认无源**：该载荷里匿名侧的
 *     `salarySnippet` 恒为 `{"currency":"","salaryTextFormatted":false}` 空对象。
 *     ⇒ `readListPage` 落地"DOM 定集合、载荷补字段"通道（zhipin `enrichFromApi`
 *     同族纪律，但**零额外请求**——数据就在当页脚本里），`publishedAt` 真源切到
 *     `formattedRelativeTime`；`salary_raw` 维持留空 + notes（不进必需字段）。
 *
 * ## 历史记录：2026-09-18「停运」调查（已被上面的复核修正）
 *
 * * 当时直接请求 `cn.indeed.com/jobs` 被 302 到 `www.indeed.com` 并撞 Cloudflare
 *   验证墙（「需要进行其他验证」+ `Ray ID`）—— 该形态今天仍可能出现（cf_clearance
 *   过期时），判墙信号与 `expectedHost` 判据保留；
 * * 当时因此把 `fieldCompleteness` 标为 `low`、`maturity` 标 `disabled` ——
 *   现已按 2026-09-21 真实夹具升级（见 `platform-facts.ts`）。
 *
 * ## Indeed JCS 结构（2026-09-21 按真实搜索页校准）
 *
 * * 搜索 URL：`https://{host}/jobs?q={关键词}&l={地点}&start={偏移}`；
 *   `start` 步进 = `pageSize`（**10**，真实翻页链接定案）；
 * * 地点是**自由文本**（`l=` 直接吃中文/英文地名），不依赖城市码映射；
 * * 卡片：职位标题锚 `a.jcs-JobTitle`（16/16 命中），href 内带 `jk=<jobkey>`，
 *   `jobkey` 就是平台 id（幂等 upsert 键）；公司 `[data-testid="company-name"]`、
 *   地点 `[data-testid="text-location"]` 全中；薪资 `attribute_snippet_testid` 与
 *   日期 `jobListingDate` 在真实夹具 0 命中（数据无源，留空 + notes 隔离，不编）；
 * * 翻页：分页容器 `nav[aria-label="pagination"]`，「下一页」
 *   `a[data-testid="pagination-page-next"]`，被禁用时打 `aria-disabled`；
 * * 详情页（`/viewjob?jk=`，2026-09-21 `probe:indeed-detail` 三页 3/3 实测）：标题
 *   `h1[data-testid="jobsearch-JobInfoHeader-title"]`、公司
 *   `[data-testid="inlineHeader-companyName"]`、地点
 *   `[data-testid="inlineHeader-companyLocation"]`、JD 全文 `#jobDescriptionText`；
 *   **无 JSON-LD JobPosting**、无日期/薪资 DOM 节点 —— 发布日期唯一来源是内嵌载荷
 *   `"hiringInsightsModel":{"age":"30+天前"}`（`detail.extract` 已落地，夹具
 *   `test/fixtures/indeed-detail.html`）。
 *
 * ── 本目录分工（2026-09-20 拆成目录）─────────────────────────────────
 * * `./config.ts`：结构锚点集（列表 + 详情）、字段 → URL 参数映射、默认值与合并、
 *   jobkey / 薪资 / 发布日期正则、页数上下限、登录回落判据常量、平台判墙信号与开关、
 *   内嵌载荷通道（`payloadEnabled` / `payloadProviderKey`）—— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的搜索 URL 构造（`start` = (page-1) * pageSize，不碰 `document`）；
 * * `./page.ts`：页面上下文函数（`extractJobsInPage` / `hasNextPageInPage` /
 *   `isLoggedInInPage` / `extractDetailInPage`），自包含；列表解析含**内嵌载荷回填**
 *   （发布日期真源，见上）；
 * * `./index.ts`：本文件 —— 适配器装配（`createIndeedAdapter`）与 `criteriaDimensions` 表。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { RawJobDetail } from '../../types.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../../types.js'
import {
  DEFAULT_INDEED_CONFIG,
  INDEED_ANON_LOGIN_LINK,
  INDEED_BLOCK_SIGNALS,
  INDEED_DEFAULT_MAX_PAGES,
  INDEED_JOB_TYPE_OPTIONS,
  INDEED_MAX_PAGES,
  INDEED_POSTED_AGE_PATTERN,
  INDEED_POSTED_WITHIN_OPTIONS,
  indeedBlockFlags,
} from './config.js'
import type { IndeedConfig } from './config.js'
import { extractDetailInPage, extractJobsInPage, hasNextPageInPage, isLoggedInInPage } from './page.js'
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
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，平台原样接收',
      wire: { target: 'url', param: config.urlParams.keywordParam },
    },
    {
      key: 'city',
      label: '地点',
      values: [],
      hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码',
      wire: { target: 'url', param: config.urlParams.locationParam },
    },
    /**
     * 下面两个是 2026-09-21 第 12 轮补的：Indeed 的现代 SERP 把**大部分**筛选编成不透明的
     * `sc=0kf:attr(…)`（学历/远程/薪资…没有可读参数名，故不声明），但这两个是多年公开的
     * URL 参数，而且**用真实 URL 比过卡片数**（基线在最后重跑一遍，排除限流）：
     * `fromage=1`→4 条、`fromage=7`→16 条、`jt=parttime`→**0 条**、基线 16 条。
     */
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: INDEED_POSTED_WITHIN_OPTIONS,
      wire: { target: 'url', param: config.urlParams.postedWithinParam },
      hint: '实测 fromage=1 → 4 条、fromage=7 → 16 条（基线 16 条）；站点的 3 天/14 天两档未实测，故不提供',
    },
    {
      key: 'jobType',
      label: '职位类型',
      values: INDEED_JOB_TYPE_OPTIONS,
      wire: { target: 'url', param: config.urlParams.jobTypeParam },
      hint: '实测 jt=parttime → 0 条（基线 16 条），参数确实生效；其余档位（合同工/实习等）未实测，故不提供',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: INDEED_MAX_PAGES,
      hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；cn 站实测可用（未登录可搜），但 Cloudflare 风控在，刻意保守`,
    },
  ]

  return {
    id: 'indeed',
    ...platformFacts('indeed'),
    displayName: 'Indeed',
    capabilities: {
      // 2026-09-21 实测：未登录搜索直出 16 条（首访登录墙是抖动，见文件头）。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 2026-09-21 真实夹具：标题/公司/城市/jobKey 16/16 全中；发布日期真源 = 同页
      // 内嵌载荷 formattedRelativeTime（15/16）；薪资两侧（DOM + 载荷）均无源 →
      // 如实标 medium，缺口靠 requiredFields 摘除 + notes 隔离。
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    // ⚠️ 不含 salary_raw：真实夹具 16 条薪资全空（卡片无该节点，数据无源）——
    //   列进必需字段会把整批记录打进 pending_repair（hiredchina/zhipin 同款取舍）。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: INDEED_MAX_PAGES,
    defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,

    auth: {
      // 2026-09-21 实测登录页（首访被送到的就是它；不带 continue，登录后平台自己跳）。
      loginUrl: 'https://secure.indeed.com/auth?hl=zh_CN&co=CN',
      // 判登录态用搜索页：载荷 isLoggedIn 在搜索页同样内嵌（匿名/已登录两侧实测），
      // 语义正是「当前页会不会被登录墙挡住」。
      checkUrl: 'https://cn.indeed.com/jobs',
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, { loginLinkSelector: INDEED_ANON_LOGIN_LINK })
      },
    },

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
          payloadEnabled: config.payloadEnabled,
          payloadProviderKey: config.payloadProviderKey,
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

    detail: {
      /**
       * 2026-09-21 `probe:indeed-detail` 三页实测（3/3 命中）：标题 / 公司 / 地点 /
       * `#jobDescriptionText`；无 JSON-LD JobPosting，发布日期走内嵌载荷
       * `hiringInsightsModel.age`；薪资在详情页同样无源（salaryRaw 恒空，notes 不记 ——
       * 列表侧已按"无源字段"处理，见 requiredFields）。
       */
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, {
          selectors: config.detailSelectors,
          host: config.host,
          jobKeyPattern: config.jobKeyPattern,
          postedAgePattern: INDEED_POSTED_AGE_PATTERN,
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

    // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：打招呼/投递契约没有任何
    //   真机取证（登录态探针只读取证，未点任何岗位动作），fail-closed 而不是假装能发
    //   （与猎聘同策略）。要做须另开探针单独评审（如 probe:zhaopin-login 的分组开关）。
  }
}
