/**
 * 智联招聘（zhaopin.com）适配器 —— 列表页采集。
 *
 * ## 先纠正一个会让人白写一遍的坑：`/jobs?jl=` **不是**搜索页
 *
 * 实测（2026-09，直接抓取线上）有两个长得像搜索页的路由，**DOM 完全不同**：
 *
 * | 路由 | 卡片选择器 | 薪资 | 翻页 |
 * |---|---|---|---|
 * | `https://www.zhaopin.com/jobs?jl=765&kw=Java` | `.job-card` | **被掩码成 `**-**元`**（未登录） | 无，第 20 条后是 `.job-list-login-gate` |
 * | `https://www.zhaopin.com/sou/jl765` | `.joblist-box__item` | **明文**（`8000-16000元` / `1.5-2.5万·20薪`） | 有真实分页，未登录可翻到深页 |
 *
 * 两者都有 `__INITIAL_STATE__`、都能出 20 条，所以"抓到了数据"并不能证明抓对了页面。
 * 本适配器**以 `/sou/jl<code>` 为搜索入口**（有分页、薪资明文）—— **但不假设一定能落到它**：
 *
 * ## ⚠️ AB 分流：`/sou/` 自己也会被丢到 `/jobs` 老路由（2026-09-18 新实测）
 *
 * 同一地址 `/sou/jl765?kw=Java` 连打两次，一次落到 jobinfo 明文页（→ `/sou/jl765/kw<token>/p1`、
 * 薪资 `1-1.1万`），一次被服务端分流到旧 `/jobs` 掩码页（`.job-card`、薪资 `**-**元`）。
 * 所以「只认 `/sou/`」**不够** —— 分流去的那半，DOM 卡片与薪资都变了套。
 * 应对（本适配器的两处兜底，详见下方「AB 分流兜底」节）：
 *   - `detectBlockInPage`：只要 `__INITIAL_STATE__.positionList` 有真数据，就不判登录墙；
 *   - `extractJobsInPage`：DOM 卡片为 0 但载荷有真值时，凭载荷补开出数（薪资取明文 `salary60`）。
 * 总之 **`positionList` 载荷才是唯一权威数据源**，DOM 只负责"页面实际展示了什么"这一层证据。
 *
 * ## 数据来源：DOM 为主，内嵌载荷补时间与公司信息
 *
 * `/sou/` 的卡片 DOM 已经带齐了核心字段（标题/薪资/城市·区·街道/公司/经验/学历），
 * 所以 DOM 是主路径 —— 它也是"页面实际展示了什么"的直接证据。
 * `__INITIAL_STATE__.positionList` 与卡片**渲染顺序一致**（都 20 条、逐条对得上），
 * 用它补 DOM 上没有的 `publishTime`、`industryName`、`companySize` 与岗位 id。
 * 载荷缺失时降级为纯 DOM，并留下 note —— 不静默。
 *
 * ## robots 取舍（用户已确认）
 *
 * `robots.txt` 含 `Disallow: /*?*`，即**禁掉所有带 query 的 URL**。
 * 而站点自己的分页链接是无 query 的 path 形式 `/sou/jl765/kw<token>/p2`（或 `/sou/jl765/p2`）。
 * 所以本适配器的取词策略是：
 *   - **只在第 1 页**用 `?kw=<明文>` 取词（这是唯一能按关键词进来的方式）；
 *   - **第 2 页起优先用站点自己给出的无 query path 链接**（从分页区真实 href 里读），
 *     拿不到才退回 query 形式。
 * 这样合规面最大，同时保留关键词搜索。
 *
 * ⚠️ 顺带记下两条实测事实，避免后来者踩：
 *   1. path 里的 `kw` **只接受站点自己发的 token**：`/sou/jl765/kwJava/p1` 会返回
 *      0 条 + `noJobTip`（"登录之后再搜索"）。**绝不要自己造 token。**
 *   2. path 的 `/p<N>` 会**覆盖** query 的 `p`，两种形式不要混用。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createZhaopinAdapter` 与 `ZhaopinAdapterOptions`；含适配器编排、
 *   `detectBlockOf` / `assertActionPage`（判墙的**唯一实现**，采集与动作链共用）与 `dimensions`。
 * * `config.ts` —— 选择器 / URL 参数 / 值域 / 城市码 / 判墙信号 + 默认配置与 `mergeZhaopinConfig`。
 * * `urls.ts` —— 搜索 URL 与会话列表接口地址的**宿主机侧**构造（不碰 `document`）。
 * * `api.ts` —— 会话列表接口：页面内 fetch 通道 + 响应收敛 + 会话行 → 收件箱/接触态。
 * * `actions.ts` —— 动作链（readInbox / detectStage / sendResume）及它们共用的 `waitFor`/`fetchTalkRows`。
 * * `page/*.ts` —— `page.evaluate` 送进浏览器的**自包含**解析函数（列表 / 详情 / 投递 / 判墙），
 *   每个文件头部都重申"不得引用模块级值"这条硬约束。
 */

import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type {
  CriteriaDimension,
  PageLike,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../../types.js'
import { actionBlockOf, PlatformBlockedError } from '../../types.js'
import { createZhaopinActions } from './actions.js'
import {
  DEFAULT_ZHAOPIN_CONFIG,
  ZHAOPIN_BLOCK_SIGNALS,
  ZHAOPIN_COMPANY_TYPE_OPTIONS,
  ZHAOPIN_DEFAULT_MAX_PAGES,
  ZHAOPIN_EDUCATION_OPTIONS,
  ZHAOPIN_JOB_STATUS_OPTIONS,
  ZHAOPIN_MAX_PAGES,
  ZHAOPIN_POSTED_WITHIN_OPTIONS,
  ZHAOPIN_SORT_OPTIONS,
  ZHAOPIN_WORK_EXPERIENCE_OPTIONS,
} from './config.js'
import type { ZhaopinConfig } from './config.js'
import { detectBlockInPage } from './page/block.js'
import { extractJobDetailInPage } from './page/detail.js'
import {
  currentPageInPage,
  extractJobsInPage,
  isLoggedInInPage,
  nextPageUrlInPage,
  totalPagesInPage,
} from './page/list.js'
import { buildZhaopinSearchUrl } from './urls.js'

export interface ZhaopinAdapterOptions {
  config?: ZhaopinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造智联招聘适配器。 */
export function createZhaopinAdapter(options: ZhaopinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_ZHAOPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 判墙的**唯一实现**（采集与动作链共用）—— 与 zhipin 同一理由：
   * 各写一遍 `page.evaluate(detectBlockInPage, …)` 就会出现"采集认得这道墙、
   * 动作不认得"，而动作那边恰恰是会真发东西的一侧。
   */
  const detectBlockOf = async (page: PageLike): Promise<BlockKind | null> =>
    await page.evaluate(detectBlockInPage, {
      card: config.selectors.card,
      loginPopup: config.selectors.loginPopup,
      noJobTip: config.selectors.noJobTip,
      // 通用词表在**宿主侧**组装好再传进去（页面里没有这个模块）
      signals: signalsOf(ZHAOPIN_BLOCK_SIGNALS),
    })

  /**
   * 动作链上的判墙：命中就抛 `PlatformBlockedError`（由 `guard.run()` 写平台级暂停）。
   *
   * ⚠️ `blank` 必须排除：智联的判墙在"0 卡片"时会走登录墙/blank 分支，而**会话页
   * （`i.zhaopin.com/im`）上岗位卡片本来就是 0** —— 照单全收等于每同步一次收件箱
   * 就把平台暂停一次。登录墙那几条靠"0 卡片 + 短文本 + 登录文案"才成立，
   * 会话页文本长，不会误判。
   */
  const assertActionPage = async (page: PageLike): Promise<void> => {
    const kind = actionBlockOf(await detectBlockOf(page).catch(() => null))
    if (kind !== null) throw new PlatformBlockedError(kind, '动作页面上看到风控页面')
  }

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
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
      // 城市码在两种路由上落点不同：无筛选时是**路径段**（`/sou/jl<码>`）、
      // 带筛选时是 query（`/jobs?jl=<码>`）。没有单一的参数名可对账，
      // 所以 `param: null`：对账只断言"带上城市后请求确实变了"。
      wire: { target: 'url', param: null },
      hint: '城市码写在路径段（/sou/jl<码>）或带筛选路由的 jl 参数上，且只能逐城实测 —— 城市导航页只给拼音 slug，推导不出数字码',
    },
    {
      key: 'sort',
      label: '排序方式',
      values: ZHAOPIN_SORT_OPTIONS,
      wire: { target: 'url', param: config.urlParams.sortParam },
      hint: '页面只有「智能匹配 / 薪酬最高 / 最新发布」三项，其中只有「最新发布」（order=4）是实测值；其余取值无证据，故不提供',
    },
    /**
     * 下面四个维度是 2026-09-21 点击探针实测补上的：在登录态搜索页上点一下筛选控件，
     * **看站点自己跳去哪** —— 点「本科」→ `…/jobs?jl=765&kw=Java&el=4`、点「1-3年」→ `we=0103`、
     * 点「国企」→ `ct=1`、点「全职」→ `et=2`。取值域逐条照抄 `/c/i/search/base/data` 的字典
     * （夹具 `test/fixtures/zhaopin-base-data-filters.json`）。
     *
     * ⚠️ 筛选是**登录后**才有的：未登录时加任何筛选都会撞登录墙（适配器自己的
     * `capabilities.searchWithoutLogin` 说的是"不带筛选也能搜"，两者不矛盾）。
     */
    {
      key: 'education',
      label: '学历',
      values: ZHAOPIN_EDUCATION_OPTIONS,
      wire: { target: 'url', param: config.urlParams.educationParam },
      hint: '参数是**最低学历**（选「本科」= 本科及以上）；实测点「本科」跳 el=4。需登录',
    },
    {
      key: 'workExperience',
      label: '工作经验',
      values: ZHAOPIN_WORK_EXPERIENCE_OPTIONS,
      wire: { target: 'url', param: config.urlParams.workExperienceParam },
      hint: '实测点「1-3年」跳 we=0103；取值是四位码（如 0103），不是"3"这样的年数。需登录',
    },
    {
      key: 'companyType',
      label: '公司性质',
      values: ZHAOPIN_COMPANY_TYPE_OPTIONS,
      wire: { target: 'url', param: config.urlParams.companyTypeParam },
      hint: '实测点「国企」跳 ct=1；「机关/事业单位」「其他」在站点字典里是分号拼的多码，编码未验证，故不提供。需登录',
    },
    {
      key: 'jobStatus',
      label: '职位类型',
      values: ZHAOPIN_JOB_STATUS_OPTIONS,
      wire: { target: 'url', param: config.urlParams.jobStatusParam },
      hint: '全职/兼职/实习/校园，实测点「全职」跳 et=2。需登录',
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: ZHAOPIN_POSTED_WITHIN_OPTIONS,
      // 空值域 + 缺省 `closed` = 自由文本 → 界面会给出一个能填的数字框。
      // 事实相反：智联的搜索 URL 不暴露这个维度，填了也不生效。显式声明"一个都不收"。
      closed: true,
      hint: '智联的搜索 URL 不暴露发布时间维度（只能在页面上点筛选，且加筛选会撞登录墙），因此该维度不可用',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: ZHAOPIN_MAX_PAGES,
      hint: `默认 ${String(ZHAOPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(ZHAOPIN_MAX_PAGES)} 页；站点自报一次搜索约 20 条/页`,
    },
  ]

  return {
    id: 'zhaopin',
    ...platformFacts('zhaopin'),
    displayName: '智联招聘',
    capabilities: {
      // 实测：免登录能按关键词搜、能翻页、薪资明文；但**加任何筛选参数就撞登录墙**。
      searchWithoutLogin: true,
      // 附件简历：**平台支持**（`application/preparation` 实测返回 `isShowAttachmentSelect:true`
      // 与 `attachmentResumeInfo.fileList[]`，默认就是附件简历）。注意这与"能不能指定本地文件"
      // 是两件事 —— 适配器不接受本地文件路径（见 `sendResume`），用的是你上传到平台的那一份。
      supportsAttachment: true,
      // 已读回执：接口里**有** `oppositeRead`/`selfRead` 字段（说明平台有这个能力），
      // 但实测样本里这两项都是 0（没等到"HR 已读"的真实样本）—— 所以这里如实留 false，
      // 等真出现已读样本、并回来核对字段语义之后再改。
      supportsReadReceipt: false,
      // 收件箱：2026-09-18 登录态实测（`i.zhaopin.com/im`，11 条会话 + getTalkList 接口）。
      supportsInbox: true,
      // 打招呼：**声明为不支持**，让 guard 明确拒绝，而不是让用户以为能发。
      // 2026-09-18 登录态实测把原因钉死了：① 智联**没有独立的"打招呼"动作** ——
      // 详情页上那个沟通入口叫「先聊聊」（`button.summary-planes__prechat`），点它进的是 IM 会话；
      // ② 而 IM 的发送走**网易云信**（`wss://weblink-bgp.netease.im/websocket` + `imapi/imV2/getToken`
      // 换 token），是私有 WS 协议，没有可直接调的 HTTP 发消息接口；
      // ③ 平台自己那条"招呼语"是**投递时自动发**的（`imapi/imV2/getUserPrologueNew` 生成文案）。
      // 所以"替用户主动打招呼"这件事在智联上做不了 —— 与其编一个会乱点的实现，不如 fail-closed。
      supportsGreeting: false,
      fieldCompleteness: 'high',
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: ZHAOPIN_MAX_PAGES,
    defaultMaxPages: ZHAOPIN_DEFAULT_MAX_PAGES,

    auth: {
      loginUrl: 'https://passport.zhaopin.com/login',
      // 检测判**搜索页**：`isLoggedInInPage` 只认结果页的 `-unlogin` 修饰类与
      // `isLogged` 载荷，两者都没有时**兜底返回"已登录"** —— 而 passport 登录页上
      // 两者都不会有，在那儿判就是恒判已登录。见 `auth.checkUrl` 的说明。
      checkUrl: buildZhaopinSearchUrl(config, {}),
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, {
          loginPopup: config.selectors.loginPopup,
          loginGateText: '登录之后再搜索',
        })
      },
    },

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildZhaopinSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildZhaopinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`智联招聘：无法为城市「${criteria.city ?? ''}」构造搜索 URL（城市码未配置）`)
        }
        await page.goto(url)

        // 页面是**服务端渲染**（无 JS 也能拿到 20 条），但仍等一次卡片容器：
        // 风控/降级时站点会返回没有列表的骨架页，而"0 条"最容易被误读成"今天没有新岗位"。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // 列表页是 SSR 直出，但"看一眼"这件事仍然要做：这一页如果一次滚轮、
        // 一次指针移动都没有，访问形态就只剩"导航 + 读 DOM"（见 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      /**
       * 还有没有下一页。
       *
       * 用**下一页链接**判断，而不是"卡片数 == 20"这种启发式 ——
       * 后者在最后一页刚好 20 条时会多跑一轮空请求。
       * 同时读站点自报的 `pages`，避免翻过实际页数。
       */
      async hasNextPage(page): Promise<boolean> {
        const next = await page.evaluate(nextPageUrlInPage, { pagination: config.selectors.pagination })
        if (next === null) return false
        const total = await page.evaluate(totalPagesInPage, undefined as never)
        if (total > 0) {
          const current = await page.evaluate(currentPageInPage, undefined as never)
          if (current > 0 && current >= total) return false
        }
        return true
      },
    },

    guard: {
      // 判墙的实现只有一份（`detectBlockOf`）—— 动作链与采集共用它。
      detectBlock: detectBlockOf,
    },

    // 详情页解析（P2 详情抓取）。未登录即可访问详情页拿 JD 全文；薪资/DOM 层会掩码，
    // 但载荷 `detailedPosition` 里是真实值（见 `extractJobDetailInPage`）。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractJobDetailInPage, config)
      },
    },

    // 打招呼/投递的具体说明见 `./actions.ts`（sayHello 做不了；sendResume 走页面驱动）。
    actions: createZhaopinActions({
      config,
      delayRangeMs: options.delayRangeMs ?? [0, 0],
      assertActionPage,
      waitForListMs: options.waitForListMs,
    }),
  }
}
