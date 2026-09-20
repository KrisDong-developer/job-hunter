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
 */
import type { BlockKind, CoreField } from '../../../shared/contract/enums/crawl.js'
import type { ContactStage } from '../../../shared/contract/enums/pipeline.js'
import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../pacing.js'
import { dwellBeforeActMs, humanBrowse, humanClick, humanHover } from '../humanize.js'
import { blockFromApiFailure, signalsOf, type BlockSignalSet } from '../block-signals.js'
import { numberRange } from '../config-merge.js'
import { platformFacts } from '../platform-facts.js'
import type {
  ActionResult,
  CriteriaDimension,
  PageLike,
  RawInboxMessage,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../types.js'
import { actionBlockOf, PlatformBlockedError } from '../types.js'

/** `/sou/` 列表页的选择器集。**每一项都可以在 DB 里覆盖着改**（ADR-19）。 */
export interface ZhaopinSelectors {
  /** 卡片容器。 */
  card: string
  /** 标题（同时是详情链接）。 */
  title: string
  salary: string
  /** 「地点 / 经验 / 学历」三项容器。 */
  otherInfo: string
  /** 上面容器里的单项。 */
  otherInfoItem: string
  /** 地点项里的 `<span>`（有它才说明这一项是地点）。 */
  locationSpan: string
  company: string
  /**
   * ⚠️ legacy：曾经用它在卡片里抓 `.joblist-box__item-tag`（会同时命中职位技能标签与
   * 公司标签，混在一起）。2026-09-18 起技能/福利标签改从载荷 `showSkillTags` 读，公司
   * 性质/规模/行业走 `propertyName/companySize/industryName` 字段，这个选择器**已不再被
   * 读取**只有在既有 DB 覆盖里还引用它 —— 保留键位兼容，勿再依赖。
   */
  companyTags: string
  /** 分页容器。 */
  pagination: string
  /** 「下一页」链接（无 query 的 path 形式）。 */
  nextLink: string
  /** 登录弹窗（未登录时会弹）。 */
  loginPopup: string
  /** "没有结果"图（被登录墙挡住时也会出现）。 */
  noJobTip: string
}

/**
 * 详情页（`/jobdetail/{id}.htm`）的选择器集。同样可 DB 覆盖（ADR-19）。
 *
 * 实测（2026-09-18）：
 *   - JD 全文容器 `.describtion-card__detail-content` 的 `textContent` 即完整描述
 *     （游客 clamp 只是视觉截断 6 行，**不删除 DOM 文本**）；
 *   - 公司标签是 `.company-summary__list` 下的一组 `<li>`，顺序固定为
 *     [融资状态, 规模, 行业]。
 *
 * ⚠️ 详情页未登录时 **DOM 层薪资/地址会掩码**（`**-**元` / `深圳**********`），但
 * `__INITIAL_STATE__.jobDetail.detailedPosition` 里却是真实值 —— 所以薪资/JD 正文等
 * 以载荷为准（见 `extractJobDetailInPage`）。
 */
export interface ZhaopinDetailSelectors {
  /** 职位标题（`H1`）。 */
  title: string
  /** JD 全文容器（`textContent` 即全文）。 */
  jdText: string
  /** 公司名。 */
  companyName: string
  /** 公司标签（`.company-summary__list` 下的 `<li>`，顺序 [融资, 规模, 行业]）。 */
  companyTags: string
}

/**
 * 会话（IM）页的选择器集。2026-09-18 登录态实测（`i.zhaopin.com/im`）。
 *
 * 数据来源有两条：**接口优先**（`talkListApi`，字段比 DOM 全得多），DOM 只作为
 * "页面确实渲染出来了"的证据（以及 `waitForSelector` 的等待锚点）。
 */
export interface ZhaopinImSelectors {
  /** 会话列表容器（`.im-container` 里那一列）。 */
  listContainer: string
  /**
   * 单条会话行。实测 class 全清单：`__avatar-wrap/__avatar/__body/__row/__title/__name/
   * __company/__company-name/__sep/__job/__salary/__preview-row/__preview/__preview-text/
   * __time/__badge/__tag/__tag--secondary/__online`（第一屏 11 条）。
   */
  sessionRow: string
  /**
   * ⚠️ **下面这 6 个键当前没有任何代码读取**（`readInbox` / `detectStage` 走的是接口）。
   * 留着是因为它们是**实测值**，将来要做 DOM 兜底（接口挂了仍能读个大概）时直接用；
   * 但在那之前，改它们不会有任何效果 —— 别把它当成"可调参数"。
   */
  name: string
  company: string
  job: string
  preview: string
  time: string
  badge: string
}

/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * 实测依据：线上 `/sou/jl530` 页面的登录表单 URL 原文为
 * `passport.zhaopin.com/org/login?jl=530&kw=&jt=&in=&li=&sc=&el=&we=&et=&ct=&cs=&sl=&p=1`，
 * 以及 `__INITIAL_STATE__.originalUrlParams` 回显 —— 两处都点名 `kw` / `p`。
 *
 * ⚠️ 注意**城市不在 query 里，而在路径段**：`/sou/jl<cityCode>`。
 * 所以这里没有 `cityParam`，只有 `cityPrefix`。
 */
export interface ZhaopinUrlParams {
  /** 基础地址，城市码会拼成 `${base}/jl${code}`。 */
  base: string
  /** 关键词参数。**只在第 1 页用**（见文件头的 robots 取舍）。 */
  keywordParam: string
  /** 页码参数（query 兜底形式）。 */
  pageParam: string
  /** 排序参数。实测 `order=4` 对应「最新发布」。 */
  sortParam: string
  /** 发布时间窗参数。**平台在搜索 URL 上不提供该维度**，保留键位仅为将来扩展。 */
  postedWithinParam: string
}

/**
 * 排序取值域。
 *
 * 页面上的排序控件只有三项：**智能匹配 / 薪酬最高 / 最新发布**。
 * 其中只有 `order=4`（最新发布）是**实测**出来的 —— `__INITIAL_STATE__` 的
 * `queryParams` 与 `displayParams` 都回显 `order:4`，且控件高亮「最新发布」。
 * 另外两项的参数值**没有证据，所以不编** —— 编一个错的取值，用户选了不会报错，
 * 只会静默拿到另一种排序，那比缺功能更糟。
 */
export const ZHAOPIN_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '4', label: '最新发布' },
]

/** 发布时间窗：智联的搜索 URL 不暴露这个维度，所以值域为空（界面据此禁用并给出原因）。 */
export const ZHAOPIN_POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = []

/**
 * 单次抓取的页数上限（默认）。
 *
 * 实测：`/sou/jl765` 无关键词时站点自报 `pages:5 / positionCount:100`；
 * 带关键词时同样按 20 条一页。所以默认 5 页足够覆盖一次搜索，
 * 也更保守（§P5 保守优先）。**上限**给 10 页，供用户在方案里显式放宽。
 */
export const ZHAOPIN_DEFAULT_MAX_PAGES = 5
export const ZHAOPIN_MAX_PAGES = 10

/**
 * 城市名 → 平台城市码（`jl`）。
 *
 * 与 51job 那张表**来源完全不同，别混淆**：51job 的城市码是人工从搜索页 URL 里抄的；
 * 这张表是**从智联自己的城市落地页第一方抓出来的** ——
 * 流程是：打开 `https://www.zhaopin.com/<拼音>/`，页面的搜索链接就是 `/sou/jl<code>`。
 * 实测 20 个城市全部命中，且与三份独立开源城市表**逐项一致**（无冲突）。
 *
 * 城市码**无法推导**：`/citymap` 只给拼音 slug，不给数字码。
 * 所以这里只放**已验证过**的城市；未列出的城市请在 DB 覆盖里补
 * （`setting(scope='platform', scope_ref='zhaopin', key='adapter-config')` 的 `cityCodes`）。
 */
export const ZHAOPIN_CITY_CODES: Record<string, string> = {
  全国: '489',
  北京: '530',
  上海: '538',
  广州: '763',
  深圳: '765',
  杭州: '653',
  成都: '801',
  南京: '635',
  武汉: '736',
  西安: '854',
  苏州: '639',
  天津: '531',
  重庆: '551',
  长沙: '749',
  郑州: '719',
  青岛: '703',
  合肥: '664',
  济南: '702',
  厦门: '682',
  大连: '600',
  东莞: '779',
  // 2026-09-18 二轮实测补齐（城市落地页逐城抓取 /sou/jl<码>，并用 /jobs?jl= 标题反查归属）
  福州: '681',
  宁波: '654',
  无锡: '636',
  佛山: '768',
  昆明: '831',
  贵阳: '822',
  南昌: '691',
  太原: '576',
  石家庄: '565',
  沈阳: '599',
  长春: '613',
  哈尔滨: '622',
  呼和浩特: '587',
  南宁: '785',
  兰州: '864',
  乌鲁木齐: '890',
  海口: '799',
  银川: '886',
  珠海: '766',
  惠州: '773',
  中山: '780',
  温州: '655',
  泉州: '685',
  徐州: '637',
  常州: '638',
  嘉兴: '656',
}

/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id（形如 `CC381381910J40896290805`）。 */
export const ZHAOPIN_DETAIL_URL_TEMPLATE = 'https://www.zhaopin.com/jobdetail/{jobId}.htm'

/** 未登录时薪资被掩码的样子（`/jobs` 老路由上会出现；`/sou/` 上实测是明文）。 */
export const ZHAOPIN_SALARY_MASK = '**-**元'

/**
 * 投递入口的选择器集（2026-09-18 登录态实测，`zhaopin-walk-01-detail.html`）。
 *
 * 实测 markup（未投递时）：
 * ```html
 * <div class="summary-planes__right">
 *   <button class="summary-planes__prechat">先聊聊</button>
 *   <div class="summary-planes__action"><button type="button" class="a-button a--bordered a--filled">立即投递</button></div>
 * </div>
 * ```
 * 投递之后**同一个位置**变成「继续沟通」—— 所以判"能不能投"靠**文案**，不能靠"按钮在不在"。
 */
export interface ZhaopinApplySelectors {
  /** 投递按钮的容器（实测 `div.summary-planes__action`；裸 `.a-button` 太泛，会命中页面上别的按钮）。 */
  entry: string
  /** 投递成功弹窗（实测 `.deliver-greeting-modal`，文案「已向对方发送简历和打招呼语」）。 */
  successModal: string
  /** 成功弹窗里的结论文案片段 —— 用来确认弹出来的**不是**别的弹窗。 */
  successText: string
}

export interface ZhaopinConfig {
  selectors: ZhaopinSelectors
  urlParams: ZhaopinUrlParams
  cityCodes: Record<string, string>
  detailUrlTemplate: string
  /** 详情页选择器（`detail.extract` 用）。 */
  detailSelectors: ZhaopinDetailSelectors
  /** 会话页地址（求职者端 IM；2026-09-18 实测，点页头「消息」即到）。 */
  imUrl: string
  /** 会话页选择器（`readInbox` / `detectStage` 的 DOM 侧用）。 */
  imSelectors: ZhaopinImSelectors
  /**
   * 会话列表接口。
   *
   * 2026-09-18 实测：**只要 Cookie**（`credentials:'include'`）就能拿到数据 ——
   * 观察到的真实请求还带着 `at`/`rt`(query)、`x-zp-client-id`、`x-zp-page-request-id`，
   * 但四个变体（仅 cookie / +client-id / +at,rt / 全都带）**返回完全一样**（200/code 200/11 条），
   * 所以适配器只发最简形式。见 `test/tools/probe-zhaopin-login.ts` 的 `talkListProbe`。
   */
  talkListApi: string
  /** 会话列表每页条数（实测 `PageSize` 与 `pageSize` **两个参数名都要带**）。 */
  talkListPageSize: number
  /**
   * 会话列表最多翻几页（默认 3 页 = 60 条会话）。
   *
   * 实测**翻页有效**：页长 5 时第 2 页给出另外 5 条、与第 1 页重叠 0（页长 20 那次第 2 页为空
   * 只是因为该账号只有 11 条会话 —— 单看那次会得出"翻页无效"的错误结论）。
   * 设上限的理由是"一次同步要把这些会话入库"，无上限地翻只会拖慢同步。
   */
  talkListMaxPages: number
  /** 投递入口/结果弹窗的选择器（`sendResume` 用）。 */
  applySelectors: ZhaopinApplySelectors
  /**
   * 投递动作的等待上限（ms）：等入口渲染、以及点击后等结果弹窗。
   *
   * 实测一次投递要串 4 个接口（preparation → intercept → application → getPrologue），
   * 加上平台的动画，给 20 秒；等不到就如实报"没确认到"，不重试。
   */
  applyWaitMs: number
  /**
   * **点「立即投递」之前**的停留区间（ms）。
   *
   * 这里必须停：`sendResume` 是"一次点击 = 投简历 + 平台替你发一句招呼语"，
   * 而且**不可逆**（见 `platform-facts.ts` 的 `applicationSideEffect`）。
   * 真人在这之前会认真看一遍 JD，绝不会"页面刚渲染完就点下去"。
   * `[0, 0]` = 关闭（离线测试用）。
   */
  dwellBeforeApplyMs: [number, number]
}

export const DEFAULT_ZHAOPIN_CONFIG: ZhaopinConfig = {
  selectors: {
    card: '.joblist-box__item',
    title: '.jobinfo__name',
    salary: '.jobinfo__salary',
    otherInfo: '.jobinfo__other-info',
    otherInfoItem: '.jobinfo__other-info-item',
    locationSpan: '.jobinfo__other-info-location-image',
    company: '.companyinfo__name',
    companyTags: '.joblist-box__item-tag',
    pagination: '.pagination',
    nextLink: '.soupager__btn',
    loginPopup: '.login-popups, #zpPassportWidget, .register__new',
    noJobTip: 'img[src*="noJobTip"]',
  },
  urlParams: {
    base: 'https://www.zhaopin.com/sou',
    keywordParam: 'kw',
    pageParam: 'p',
    sortParam: 'order',
    postedWithinParam: 'pd',
  },
  cityCodes: ZHAOPIN_CITY_CODES,
  detailUrlTemplate: ZHAOPIN_DETAIL_URL_TEMPLATE,
  detailSelectors: {
    title: '.summary-planes__title',
    jdText: '.describtion-card__detail-content',
    companyName: '.company-summary__name',
    companyTags: '.company-summary__list > li',
  },
  imUrl: 'https://i.zhaopin.com/im',
  imSelectors: {
    // 实测：列表在 `.im-container` 里（外层 `.zp-im-root > .im-page-wrap > .im-page__inner`）
    listContainer: '.im-container',
    sessionRow: '.im-session-item',
    name: '.im-session-item__name',
    company: '.im-session-item__company-name',
    job: '.im-session-item__job',
    preview: '.im-session-item__preview-text',
    time: '.im-session-item__time',
    badge: '.im-session-item__badge',
  },
  talkListApi: 'https://cgate.zhaopin.com/imapi/imV2/getTalkList',
  talkListPageSize: 20,
  talkListMaxPages: 3,
  applySelectors: {
    entry: '.summary-planes__action',
    successModal: '.deliver-greeting-modal',
    successText: '已向对方发送简历',
  },
  applyWaitMs: 20_000,
  // 不可逆动作前的停留：投递一次 = 简历 + 平台替你发的招呼语，撤不回来（15–30s）
  dwellBeforeApplyMs: [15_000, 30_000],
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhaopinConfig(override: unknown): ZhaopinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_ZHAOPIN_CONFIG
  const patch = override as Partial<ZhaopinConfig>
  return {
    selectors: { ...DEFAULT_ZHAOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_ZHAOPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    detailSelectors: {
      ...DEFAULT_ZHAOPIN_CONFIG.detailSelectors,
      ...(patch.detailSelectors ?? {}),
    },
    cityCodes: { ...DEFAULT_ZHAOPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    detailUrlTemplate:
      typeof patch.detailUrlTemplate === 'string' && patch.detailUrlTemplate !== ''
        ? patch.detailUrlTemplate
        : DEFAULT_ZHAOPIN_CONFIG.detailUrlTemplate,
    imUrl:
      typeof patch.imUrl === 'string' && patch.imUrl !== ''
        ? patch.imUrl
        : DEFAULT_ZHAOPIN_CONFIG.imUrl,
    imSelectors: { ...DEFAULT_ZHAOPIN_CONFIG.imSelectors, ...(patch.imSelectors ?? {}) },
    talkListApi:
      typeof patch.talkListApi === 'string' && patch.talkListApi !== ''
        ? patch.talkListApi
        : DEFAULT_ZHAOPIN_CONFIG.talkListApi,
    applySelectors: { ...DEFAULT_ZHAOPIN_CONFIG.applySelectors, ...(patch.applySelectors ?? {}) },
    talkListPageSize:
      typeof patch.talkListPageSize === 'number' && patch.talkListPageSize > 0
        ? patch.talkListPageSize
        : DEFAULT_ZHAOPIN_CONFIG.talkListPageSize,
    talkListMaxPages:
      typeof patch.talkListMaxPages === 'number' && patch.talkListMaxPages > 0
        ? patch.talkListMaxPages
        : DEFAULT_ZHAOPIN_CONFIG.talkListMaxPages,
    applyWaitMs:
      typeof patch.applyWaitMs === 'number' && patch.applyWaitMs > 0
        ? patch.applyWaitMs
        : DEFAULT_ZHAOPIN_CONFIG.applyWaitMs,
    dwellBeforeApplyMs: numberRange(patch.dwellBeforeApplyMs, DEFAULT_ZHAOPIN_CONFIG.dwellBeforeApplyMs),
  }
}

/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - 第 1 页：`https://www.zhaopin.com/sou/jl765?kw=Java&order=4`
 *   - 第 2 页起：**优先**用站点给的无 query path 形式；这里只能构造 query 兜底，
 *     真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`）。
 */
export function buildZhaopinSearchUrl(config: ZhaopinConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    // 城市码未配置就返回 null —— **不猜**。猜错会静默搜到别的城市。
    if (code === undefined) return null
  }

  // 城市码放路径段：`/sou/jl<code>`；没指定城市时用「全国」码，保持 URL 形状一致。
  const code = criteria.city !== undefined && criteria.city !== '' ? (config.cityCodes[criteria.city] as string) : config.cityCodes['全国']
  const base = code === undefined ? config.urlParams.base : `${config.urlParams.base}/jl${code}`

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.page !== undefined && criteria.page > 1) {
    params.set(config.urlParams.pageParam, String(criteria.page))
  }
  // SR-40：只在用户真的配了的时候才写进 URL，避免静默改变默认行为。
  if (criteria.sort !== undefined && criteria.sort !== '') {
    params.set(config.urlParams.sortParam, criteria.sort)
  }
  if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
    params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays))
  }
  for (const [key, value] of Object.entries(criteria.extra ?? {})) params.set(key, value)

  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}

/**
 * **在页面上下文里**把内嵌的 `__INITIAL_STATE__` 载荷读成紧凑数组。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。
 *
 * ⚠️ 也**绝不能返回整个 state** —— `page.evaluate` 只能回传标量 JSON，
 * 而这个载荷有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 为什么从 `document` 的 script 文本里解析，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 */
/**
 * 载荷解析**必须**留在 `extractJobsInPage` 内部，不能提成模块级函数：
 * 页面函数会被序列化后送进浏览器，闭包不存在，引用任何模块作用域的符号都会
 * `ReferenceError` 并导致整页解析失败（51job 踩过同一个坑）。
 */

/**
 * **在页面上下文里**解析列表页（DOM 为主，内嵌载荷补字段）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量或函数都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。所以**载荷解析与配平全部内联在函数体里** ——
 * 抽成模块级的 `readStateFromPage()` 看着更整洁，但一上真浏览器就整页失败。
 * `test/platform/zhaopin.test.ts` 的「按源码重建」护栏就是钉死这条的。
 *
 * ⚠️ 载荷**绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，
 * 而它在真实页面上有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 合并策略：`__INITIAL_STATE__.positionList` 与 `.joblist-box__item` **渲染顺序一致**
 * （实测都是 20 条、逐条对得上），按索引配对；DOM 能给的优先用 DOM
 * （它是"页面实际展示了什么"的直接证据），DOM 给不了的（发布时间/行业/公司规模）
 * 用载荷补。
 *
 * 为什么从 `document` 的 script 文本里解析载荷，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: ZhaopinConfig): RawJob[] {
  const maxCards = 200 // 列表页最多解析多少张卡片，防止异常页面把内存打满
  const maxStateItems = 200 // 同上，载荷侧的上限

  // ── 内联：把 __INITIAL_STATE__.positionList 读成紧凑数组（自包含，不可外提） ──
  const state: Array<Record<string, unknown>> = []
  {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const text = script.textContent ?? ''
      if (text === '' || text.indexOf('__INITIAL_STATE__') < 0) continue

      const braceStart = text.indexOf('{', text.indexOf('__INITIAL_STATE__'))
      if (braceStart < 0) continue

      // 载荷是 `__INITIAL_STATE__={...}`，对象一直写到脚本结尾。
      // 用大括号配平（而不是正则）取完整 JSON —— 只有配平才能处理嵌套与字符串里的括号。
      let depth = 0
      let inString = false
      let escaped = false
      let stop = -1
      for (let i = braceStart; i < text.length; i += 1) {
        const ch = text.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            stop = i
            break
          }
        }
      }
      if (stop < 0) continue

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text.slice(braceStart, stop + 1)) as Record<string, unknown>
      } catch {
        continue
      }

      const list = parsed.positionList
      if (!Array.isArray(list)) continue
      for (const item of list.slice(0, maxStateItems)) {
        if (item === null || typeof item !== 'object') continue
        state.push(item as Record<string, unknown>)
      }
      break
    }
  }

  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const attrOf = (node: Element | null, name: string): string =>
    node === null ? '' : clean(node.getAttribute(name))
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  // 从详情链接里抽出岗位 id：`.../jobdetail/CC381381910J40896290805.htm`
  const jobIdOf = (href: string): string => {
    const m = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(href)
    return m === null || m[1] === undefined ? '' : m[1]
  }

  const selectors = config.selectors
  const cards = queryAll(document, selectors.card).slice(0, maxCards)
  const out: RawJob[] = []

  // ── AB 分流兜底：同一 `/sou/` URL 可能落到非目标路由（见文件头） ─────────────
  // 实测 `/sou/jl765?kw=Java` 两次访问，一次落到 jobinfo 明文页，一次被分流到旧的
  // `/jobs` 掩码页（卡片是 `.job-card`，不在 `selectors.card` 里，薪资还掩码成 `**-**元`）。
  // 这时 DOM 卡片为 0，但 `__INITIAL_STATE__.positionList` 往往仍带着 20 条真值
  // （`salary60` 明文）。与其把这一整轮判成"没岗位/被墙"白丢，不如凭载荷补开出数。
  if (cards.length === 0 && state.length > 0) {
    const textOfItem = (item: Record<string, unknown>, key: string): string => {
      const value = item[key]
      if (typeof value === 'string') return clean(value)
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }
    for (let i = 0; i < state.length; i += 1) {
      const item = state[i]
      if (item === undefined) continue
      const jobId = textOfItem(item, 'number')
      const salary = textOfItem(item, 'salary60')
      const notes: string[] = []
      if (jobId === '') notes.push('jobId:missing')
      if (salary.indexOf('*') >= 0) notes.push('salary:masked-by-login')
      // 与 DOM 路径同款：技能/福利标签取载荷 showSkillTags，剔掉学历/经验项。
      const edu = textOfItem(item, 'education')
      const exp = textOfItem(item, 'workingExp')
      const tags: string[] = []
      const rawTags = item['showSkillTags']
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          if (t === null || typeof t !== 'object') continue
          const value = (t as Record<string, unknown>)['tag']
          const s = typeof value === 'string' ? clean(value) : ''
          if (s === '' || s === edu || s === exp) continue
          if (tags.indexOf(s) < 0) tags.push(s)
        }
      }
      out.push({
        platformJobId: jobId,
        title: textOfItem(item, 'name'),
        // 载荷里的薪资是明文；万一哪天变成掩码，同样不许回流成占位符。
        salaryRaw: salary.indexOf('*') >= 0 ? '' : salary,
        company: textOfItem(item, 'companyName'),
        sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
        city: textOfItem(item, 'workCity'),
        district: textOfItem(item, 'cityDistrict'),
        expReq: exp,
        eduReq: edu,
        tags,
        publishedAt: textOfItem(item, 'publishTime') === '' ? null : textOfItem(item, 'publishTime'),
        industry: textOfItem(item, 'industryName') === '' ? null : textOfItem(item, 'industryName'),
        companySize: textOfItem(item, 'companySize') === '' ? null : textOfItem(item, 'companySize'),
        companyNature: textOfItem(item, 'propertyName') === '' ? null : textOfItem(item, 'propertyName'),
        notes,
      })
    }
    return out
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    if (card === undefined) continue
    const notes: string[] = []
    const fromState = state[index] ?? null
    /**
     * 读载荷里的字段。
     *
     * ⚠️ 这里的 key 是**平台载荷自己的字段名**（`salary60` / `number` / `publishTime`…），
     * 不是本适配器 `RawJob` 的字段名 —— 载荷解析已内联进本函数，存的就是原始条目。
     * 早期版本把载荷先映射成 `salary`/`positionUrl` 再读，内联后就对不上号了，
     * 会让薪资/详情地址静默变成空串（正是 §4.2.4 要防的静默失败）。
     */
    const stateText = (key: string): string => {
      if (fromState === null) return ''
      const value = fromState[key]
      if (typeof value === 'string') return clean(value)
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }

    // 技能/福利标签从载荷 `showSkillTags` 读（结构化数组），**不**用那个混了公司标签的
    // `.joblist-box__item-tag` DOM 选择器。注意它会把学历/经验当第一条 tag 混进来，
    // 这里按已解析出的 edu/exp 剔掉，剩下的才是"技能/福利"语义。
    const tags = ((): string[] => {
      if (fromState === null) return []
      const raw = fromState['showSkillTags']
      if (!Array.isArray(raw)) return []
      const edu = stateText('education')
      const exp = stateText('workingExp')
      const out: string[] = []
      for (const item of raw) {
        if (item === null || typeof item !== 'object') continue
        const value = (item as Record<string, unknown>)['tag']
        const s = typeof value === 'string' ? clean(value) : ''
        if (s === '' || s === edu || s === exp) continue
        if (out.indexOf(s) < 0) out.push(s)
      }
      return out
    })()

    // ── 标题 + 详情链接（同一个 <a>，所以我们才有岗位 id） ────────────
    const titleNode = queryAll(card, selectors.title)[0] ?? null
    const domTitle = textOf(titleNode)
    const href = attrOf(titleNode, 'href')
    // 岗位 id 优先载荷里的 `number`（实测 126 字段全在，是最稳的权威 id），
    // DOM href 正则兜底。两处都是同一形式的 `CC{公司号}J{职位号}`。
    const stateJobId = stateText('number')
    const jobId = stateJobId !== '' ? stateJobId : jobIdOf(href)

    // ── 薪资（/sou/ 上是明文；掩码只应出现在老路由，识别出来就别当薪资用） ──
    const domSalary = textOf(queryAll(card, selectors.salary)[0] ?? null)
    const masked = domSalary !== '' && domSalary.indexOf('*') >= 0

    // ── 地点 / 经验 / 学历：三项同构，**地点靠"有 location 图标/span"识别**，
    //    经验与学历才是后面两项。这样就不必依赖固定下标。
    let city = ''
    let district = ''
    const rest: string[] = []
    for (const item of queryAll(card, selectors.otherInfoItem)) {
      const isLocation =
        item.querySelector(selectors.locationSpan) !== null ||
        queryAll(item, '.jobinfo__other-info-location-image').length > 0
      const value = textOf(item)
      if (isLocation) {
        // 形如「深圳·宝安·新安」，分隔符实测是全角间隔点
        const parts = value.split('·')
        city = clean(parts[0] ?? '')
        district = clean(parts[1] ?? '')
      } else if (value !== '') {
        rest.push(value)
      }
    }

    if (fromState === null) notes.push('tracking:missing-element')
    if (masked) notes.push('salary:masked-by-login')
    if (jobId === '') notes.push('jobId:missing')

    out.push({
      platformJobId: jobId,
      title: domTitle !== '' ? domTitle : stateText('name'),
      // 掩码一律记成空：把 `**-**元` 当薪资写进库，会把 20 条岗位的薪资全污染成占位符。
      // 薪资优先级：DOM 的真实值 > 载荷的真实值 > 留空。
      // ⚠️ 掩码（`**-**元`）**绝不能回流**：拿它当薪资会把整页薪资污染成占位符。
      // 但掩码也**不能**直接把 salaryRaw 判死 —— 载荷里往往还有真实值
      // （老路由 `/jobs` 就是"DOM 掩码、载荷明文"），白白丢掉就是浪费已有数据。
      // 只有两边都没有真实值时才是空，那种记录由 platform/validate.ts 隔离。
      salaryRaw: domSalary !== '' && !masked ? domSalary : stateText('salary60'),
      company: textOf(queryAll(card, selectors.company)[0] ?? null) || stateText('companyName'),
      sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
      city: city !== '' ? city : stateText('workCity'),
      district: district !== '' ? district : stateText('cityDistrict'),
      // 经验/学历：DOM 上只有"后两项"这个位置信息，容易错位，
      // 所以只用载荷里的精确值；拿不到就留空，**不猜**。
      expReq: stateText('workingExp'),
      eduReq: stateText('education'),
      tags,
      publishedAt: stateText('publishTime') === '' ? null : stateText('publishTime'),
      industry: stateText('industryName') === '' ? null : stateText('industryName'),
      companySize: stateText('companySize') === '' ? null : stateText('companySize'),
      companyNature: stateText('propertyName') === '' ? null : stateText('propertyName'),
      notes,
    })
  }

  return out
}

/**
 * **在页面上下文里**解析职位详情页，返回完整 `RawJobDetail`（列表扫码的字段 + `jdText`）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，闭包不存在。只依赖
 * `config`、`document`、`location` —— 任何模块级符号都会 `ReferenceError`。
 *
 * ⚠️ **关键掩码事实（2026-09-18 实测）**：详情页未登录时 **DOM 层薪资/地址被掩码**
 * （`**-**元` / `深圳**********`），但 `__INITIAL_STATE__.jobDetail.detailedPosition` 里
 * 是真实值（`salary: "1-1.1万"`）。所以薪资/JD 正文等**以载荷为准**，DOM 只兜底公司名
 * 这类页面本体就暴露的东西。
 *
 * 载荷字段名（平台自己的，不是 `RawJob` 的）：`positionName`（标题）、`salary`、
 * `positionWorkingExp`、`education`、`description`（JD 纯文本）、`welfareTags`。
 */
export function extractJobDetailInPage(config: ZhaopinConfig): RawJobDetail {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const queryAll = (selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(document.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  // ── 载荷：__INITIAL_STATE__.jobDetail.detailedPosition（自包含内联解析） ──
  let pos: Record<string, unknown> | null = null
  {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const text = script.textContent ?? ''
      const marker = text.indexOf('__INITIAL_STATE__')
      if (marker < 0) continue
      const braceStart = text.indexOf('{', marker)
      if (braceStart < 0) continue
      // 大括号配平取整份 JSON（只有配平能处理嵌套与字符串里的括号）。
      let depth = 0
      let inString = false
      let escaped = false
      let stop = -1
      for (let i = braceStart; i < text.length; i += 1) {
        const ch = text.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            stop = i
            break
          }
        }
      }
      if (stop < 0) continue
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text.slice(braceStart, stop + 1)) as Record<string, unknown>
      } catch {
        continue
      }
      const detail = parsed['jobDetail']
      if (detail !== null && typeof detail === 'object') {
        const dp = (detail as Record<string, unknown>)['detailedPosition']
        if (dp !== null && typeof dp === 'object') pos = dp as Record<string, unknown>
      }
      break
    }
  }
  const posText = (key: string): string => {
    if (pos === null) return ''
    const value = pos[key]
    if (typeof value === 'string') return clean(value)
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return ''
  }

  // 岗位 id：从当前 URL 抽，`.../jobdetail/{id}.htm`
  const helmet = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(location.href)
  const jobId = helmet === null || helmet[1] === undefined ? '' : helmet[1]

  const ds = config.detailSelectors
  // 薪资/JD 正文以载荷为准（DOM 层被掩码）；载荷缺失时才退 DOM。
  const salary = posText('salary')
  const jdText = posText('description') || textOf(queryOne(ds.jdText))

  // 技能/福利标签：载荷 welfareTags（字符串数组）。
  const tags: string[] = []
  const welfare = pos === null ? null : pos['welfareTags']
  if (Array.isArray(welfare)) {
    for (const w of welfare) {
      const s = typeof w === 'string' ? clean(w) : ''
      if (s !== '' && tags.indexOf(s) < 0) tags.push(s)
    }
  }

  // 公司标签（li 顺序固定：[融资, 规模, 行业]）→ size/industry；融资即"性质/融资状态"。
  const companyLis = queryAll(ds.companyTags)
  const companySize = companyLis[1] === undefined ? '' : textOf(companyLis[1])
  const industry = companyLis[2] === undefined ? '' : textOf(companyLis[2])
  const companyNature = companyLis[0] === undefined ? '' : textOf(companyLis[0])

  return {
    platformJobId: jobId,
    title: posText('positionName') || textOf(queryOne(ds.title)),
    salaryRaw: salary,
    company: textOf(queryOne(ds.companyName)),
    sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
    expReq: posText('positionWorkingExp'),
    eduReq: posText('education'),
    tags,
    jdText: jdText === '' ? null : jdText,
    companySize: companySize === '' ? null : companySize,
    industry: industry === '' ? null : industry,
    companyNature: companyNature === '' ? null : companyNature,
  }
}

/**
 * 智联特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 智联走"共享词表、自有结构"：这里只声明**它比通用词表多的那几条**，
 * 加上它自己的 `blank` 阈值（80，比通用的 120 更严 —— 它的"搜到 0 条"结果页
 * 也有一两百字筛选器文案，120 会把那种页面误判成空白）。
 */
const ZHAOPIN_BLOCK_SIGNALS = {
  // 极验的 `.geetest_box` / 易盾的 `#nc_1_wrapper` / 阿里云 WAF 的文案与脚本名
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  blankTextLength: 80,
} as const

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 验证。
 *
 * 关键取舍：智联**加了筛选参数**时会返回 0 条 + 「登录之后再搜索」而不是报错，
 * 这是典型的**静默失败** —— 会被误读成"没有岗位"。所以这里必须把它识别成
 * `login-required`，让调用方知道是被墙了。
 *
 * 反过来，`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙。
 */
export function detectBlockInPage(arg: {
  card: string
  loginPopup: string
  noJobTip: string
  /**
   * **通用词表**（由 `signalsOf(...)` 在宿主侧组装后传进来）。
   *
   * 智联走的是"**共享词表、自有结构**"这条路：验证码选择器 / 限流 / 配额 / blank 阈值
   * 用共享的那一份，但**判断流程仍是它自己的** —— 因为下面那段载荷探针
   * （`__INITIAL_STATE__.positionList` 配平）与 `noJobTip` 的组合判据是它独有的，
   * 硬塞进 `detectBlockWithSignals` 只会让那个共享函数长出一堆平台分支。
   */
  signals: BlockSignalSet
}): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')
  let cards = 0
  try {
    cards = document.querySelectorAll(arg.card).length
  } catch {
    cards = 0
  }

  // payload 里有没有真岗位。AB 分流会把这路由丢到老 `/jobs` 掩码页：其卡片是
  // `.job-card`（不在 `arg.card` 里），但 `__INITIAL_STATE__.positionList` 往往仍有真数据。
  // **有真数据就不算撞墙** —— 否则这一整轮会被误判成 login-required 直接跳过。
  const hasStateJobs = ((): boolean => {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const src = script.textContent ?? ''
      const marker = src.indexOf('__INITIAL_STATE__')
      if (marker < 0) continue
      const pKey = src.indexOf('"positionList"', marker)
      if (pKey < 0) continue
      const open = src.indexOf('[', pKey)
      if (open < 0) continue
      // 配平 positionList 数组到它的收尾 ']'，看中间有没有元素（元素必有 '{'）。
      let depth = 0
      let inString = false
      let escaped = false
      let sawItem = false
      for (let i = open; i < src.length; i += 1) {
        const ch = src.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '[') depth += 1
        else if (ch === ']') {
          depth -= 1
          if (depth === 0) break
        } else if (ch === '{' && depth === 1) sawItem = true
      }
      return sawItem
    }
    return false
  })()

  // 极验（geetest）与阿里云 nc 两套验证码都点名；智联登录环节用的是极验/易盾。
  // 选择器来自**共享词表**（`block-signals.ts`），智联只额外声明自己那几条。
  for (const selector of arg.signals.captchaSelectors) {
    try {
      if (document.querySelector(selector) !== null) return 'captcha'
    } catch {
      // 单个选择器非法不影响其它判据
    }
  }
  for (const word of arg.signals.rateText) {
    if (compact.includes(word)) return 'rate-limited'
  }
  // 平台侧"额度用完"（智联投递上限约 100，文案含"达到上限"）≠ 频控：今天就此打住。
  for (const word of arg.signals.quotaText) {
    if (compact.includes(word)) return 'quota-exhausted'
  }

  if (cards === 0) {
    // 载荷里有真数据 → 页面其实是好的（AB 分流落到老路由），不是被墙。
    if (hasStateJobs) return null
    // 加了筛选参数但没登录 → 站点返回 0 条 + 这句文案（**静默失败**，必须显式点出）
    if (/登录之后再搜索|登录查看更多相关职位/.test(compact)) return 'login-required'
    let noJobTip = false
    try {
      noJobTip = document.querySelector(arg.noJobTip) !== null
    } catch {
      noJobTip = false
    }
    // `noJobTip` 在"真没结果"和"被墙"两种情况下都会出现，所以它**不能单独**当登录依据。
    if (noJobTip && compact.length < 400 && /登录|注册/.test(compact)) return 'login-required'
    if (/很抱歉/.test(compact) && /登录/.test(compact)) return 'login-required'
    // 阈值来自共享词表：智联的 80 比通用的 120 更严（它的"搜到 0 条"结果页
    // 也有一两百字筛选器文案，120 会把那种页面误判成空白）
    if (compact.length < arg.signals.blankTextLength) return 'blank'
  }

  return null
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 只认**结构性信号**，不认文案：实测 `/sou/` 结果页在未登录时会给列表容器和
 * 每张卡片加上 `-unlogin` 修饰类（`positionlist__list-unlogin` /
 * `joblist-box__item-unlogin`），底部还有一个 `positionlist__login-foot`。
 * 这些比"页面上有没有『登录』两个字"稳得多 —— 后者在**正常结果页**上同样成立
 * （右上角一直有登录入口），拿它判断会导致"永远判定为未登录"。
 */
export function isLoggedInInPage(_arg: { loginPopup: string; loginGateText: string }): boolean {
  // 优先信载荷里的明确信号：`__INITIAL_STATE__.isLogged` 是平台的权威判定（实测为布尔）。
  // 只有它是 **true** 时才短路 —— false 不直接下结论（老结构页可能没有该字段），
  // 好继续用结构类名兜底。
  for (const script of Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]) {
    const text = script.textContent ?? ''
    if (text.indexOf('__INITIAL_STATE__') < 0) continue
    const m = /"isLogged"\s*:\s*(true|false)/.exec(text)
    if (m !== null && m[1] === 'true') return true
  }
  if (document.querySelector('.joblist-box__item-unlogin') !== null) return false
  if (document.querySelector('.positionlist__list-unlogin') !== null) return false
  // `positionlist__login-foot` 这个块**在已登录时也存在于 DOM 里**（只是 display:none），
  // 所以不能"存在即未登录" —— 必须先判断它是不是真的显示出来了。
  let foot = null as Element | null
  try {
    foot = document.querySelector('.positionlist__login-foot')
  } catch {
    foot = null
  }
  if (foot !== null) {
    const style = foot.getAttribute('style') ?? ''
    const hiddenByStyle = style.replace(/\s+/g, '').indexOf('display:none') >= 0
    if (!hiddenByStyle && foot.getAttribute('hidden') === null) return false
  }
  return true
}

/**
 * **在页面上下文里**取下一页的无 query path 地址。
 *
 * 为什么读真实 href 而不是自己拼：站点把关键词编码成了自己的 token
 * （`/sou/jl765/kw01500O80EO062/p2`），明文塞进 path 会被判无效并返回 0 条。
 * 分页区的 href 是**站点自己生成的**，直接用它最稳，也顺带满足 robots（无 query）。
 */
export function nextPageUrlInPage(arg: { pagination: string }): string | null {
  const links = Array.prototype.slice.call(
    document.querySelectorAll(arg.pagination + ' a'),
  ) as Element[]
  for (const link of links) {
    const href = link.getAttribute('href')
    if (href === null || href === '') continue
    const label = (link.textContent ?? '').replace(/\s+/g, '')
    const disabled = link.getAttribute('disabled') !== null || /disable/.test(link.className)
    if (label === '下一页' && !disabled) {
      // 相对地址补全成绝对地址，交给 goto 处理。
      if (href.indexOf('http') === 0) return href
      return 'https://www.zhaopin.com' + (href.indexOf('/') === 0 ? href : '/' + href)
    }
  }
  return null
}

/** 站点自报的总页数（用于"别翻过实际页数"）。 */
export function totalPagesInPage(): number {
  const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
  for (const script of scripts) {
    const text = script.textContent ?? ''
    const marker = text.indexOf('__INITIAL_STATE__')
    if (marker < 0) continue
    const m = /"pages"\s*:\s*(\d+)/.exec(text.slice(marker))
    if (m !== null && m[1] !== undefined) return Number.parseInt(m[1], 10)
  }
  return 0
}

// ── 会话（收件箱）──────────────────────────────────────────────────────
//
// 2026-09-18 登录态实测（`i.zhaopin.com/im`，11 条会话）：
//   * 数据源是 `GET cgate.zhaopin.com/imapi/imV2/getTalkList`，**只要 Cookie** 就能读；
//   * 每条会话的实测字段（节选）：`sessionid` / `peerPartnerId` / `staffName` / `staffJob` /
//     `companyName` / `jobTitle` / `jobNumber` / `salary` / `text` / `lastSentenceType` /
//     `unreadCount` / `sendTime` / `userId` / `senderId` / `senderType` /
//     `oppositeRead` / `oppositeReply` / `selfRead` / `selfReply` / `communicateStatus` / `status`；
//   * DOM 侧同时有 `.im-session-item` 那一套（见 `ZhaopinImSelectors`），但**接口字段全得多**
//     （方向、未读数、已读/已回复标记都只有接口有）→ 适配器以接口为准。

/** 会话行里我们真正用到的字段（**接口字段名是平台自己的**，别照我们的名字去找）。 */
export interface ZhaopinTalkRow {
  sessionid: string
  peerPartnerId: string
  staffName: string
  companyName: string
  jobTitle: string
  jobNumber: string
  text: string
  unreadCount: number
  sendTime: number
  userId: number
  senderId: number
  oppositeRead: number
  oppositeReply: number
  selfRead: number
  selfReply: number
}

/**
 * 会话列表接口地址（某个页号的最简调用形式：**不带** at/rt 与任何自定义头 —— 实测四个变体等价）。
 *
 * ⚠️ `PageSize` 与 `pageSize` **两个参数名都要带**：实测的真实请求里两个都出现了，
 * 而只带一个是否也生效**没单独验证过** —— 一次只读请求多带一个参数没有代价，就不去赌。
 */
export function buildTalkListUrl(config: ZhaopinConfig, pageNo: number): string {
  const size = String(config.talkListPageSize)
  return (
    `${config.talkListApi}?pageNo=${String(pageNo)}` +
    `&PageSize=${size}&pageSize=${size}` +
    '&sessionType=1&imMessageListType=1&communicateStatusType=0'
  )
}

/**
 * **在页面上下文里**取会话列表（自包含）。
 *
 * ⚠️ 必须走页面上下文的 `fetch`：那才带着智联的登录 Cookie，与用户自己翻会话走同一条链路。
 * 绝不回退到宿主 Node 的 fetch —— 那等于绕开登录态直连接口，在离线测试里还会**真的打到线上**。
 */
export async function fetchTalkListInPage(arg: { url: string }): Promise<{
  ok: boolean
  status: number
  code: number | null
  message: string
  payload: unknown
}> {
  // ⚠️ 不写 `window.fetch`：真浏览器里它挂在 window（= globalThis），而离线夹具里 `window`
  // 是 jsdom 的、**没有** fetch（见 `test/support/jsdom-page.ts`）。
  const scope = globalThis as unknown as {
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      status?: number
      json(): Promise<unknown>
    }>
  }
  if (typeof scope.fetch !== 'function') {
    return { ok: false, status: 0, code: null, message: '页面上下文没有 fetch', payload: null }
  }
  try {
    const response = await scope.fetch(arg.url, {
      method: 'GET',
      // 同源 Cookie / 登录态 —— 实测这就是全部所需（at/rt 与自定义头都不是必需的）
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*' },
    })
    const payload = await response.json()
    const record = payload as { code?: unknown; message?: unknown } | null
    return {
      ok: true,
      status: typeof response.status === 'number' ? response.status : 0,
      code: typeof record?.code === 'number' ? record.code : null,
      message: typeof record?.message === 'string' ? record.message : '',
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: null,
      message: error instanceof Error ? error.message : String(error),
      payload: null,
    }
  }
}

/** 把接口返回的 `data` 数组收窄成 `ZhaopinTalkRow[]`。结构不符**抛错**（不静默降级）。 */
export function talkRowsOf(payload: unknown): ZhaopinTalkRow[] {
  const data = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) {
    throw new Error('智联会话列表接口的形状变了：data 不是数组（改版了，先别当成"没人回我"）')
  }
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')
  return data.map((item) => {
    // 单项不是对象也照常走完：读字段一律走上面两个收敛函数，
    // 不让一条脏数据在 `.map` 里抛个看不懂的 TypeError 把整次同步带崩。
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    return {
      sessionid: str(row['sessionid']),
      peerPartnerId: str(row['peerPartnerId']),
      staffName: str(row['staffName']),
      companyName: str(row['companyName']),
      jobTitle: str(row['jobTitle']),
      jobNumber: str(row['jobNumber']),
      text: str(row['text']),
      unreadCount: num(row['unreadCount']),
      sendTime: num(row['sendTime']),
      userId: num(row['userId']),
      senderId: num(row['senderId']),
      oppositeRead: num(row['oppositeRead']),
      oppositeReply: num(row['oppositeReply']),
      selfRead: num(row['selfRead']),
      selfReply: num(row['selfReply']),
    }
  })
}

/**
 * 会话行 → `RawInboxMessage`。
 *
 * 方向判定只有一条判据：**`senderId === userId` ⇒ 最后一条是我发的**。
 * 实测样本（`text:"已发送附件简历"` 那条）两者相等、且那条确实是系统代我发出的。
 * 两个字段缺任何一个都**抛错**而不是猜 —— 猜错会让"我发的话"变成"HR 说的"，
 * 那正是本仓库最不愿意看到的谎（见 §4.2.4）。
 */
export function mapTalkRowsToInbox(rows: ZhaopinTalkRow[]): RawInboxMessage[] {
  return rows.map((row) => {
    if (row.userId === 0 || row.senderId === 0) {
      // 带上这一行的身份，否则维护者只看到"有一行坏了"却不知道是哪一行
      const who = row.companyName !== '' ? row.companyName : row.sessionid !== '' ? row.sessionid : '(未知会话)'
      throw new Error(
        `智联会话行缺少 userId/senderId（${who}），判不出最后一条是谁发的（改版了：方向判定必须重校）`,
      )
    }
    const at = row.sendTime > 0 ? new Date(row.sendTime).toISOString() : null
    return {
      conversationId: row.sessionid !== '' ? row.sessionid : row.peerPartnerId,
      hrName: row.staffName,
      company: row.companyName,
      lastMessage: row.text,
      direction: row.senderId === row.userId ? 'me' : 'hr',
      unread: row.unreadCount > 0,
      at,
      platformJobId: row.jobNumber,
    }
  })
}

/**
 * 会话行 → 接触态。**判不出来返回 null，不猜**。
 *
 * 判据只用**有真实样本**的两个字段（`unreadCount`、`selfReply`）：
 *   * `unreadCount > 0` → `replied`（会话里有 HR 发来的未读 ⇒ 对方回过话）；
 *   * `selfReply > 0` → `delivered`（我这边发过 ⇒ 至少送达过）；
 *   * 其余 → `null`。
 *
 * ## ⚠️ 为什么**不用** `oppositeRead` / `oppositeReply`（2026-09-18 实测否决）
 *
 * 这两个字段按命名看着像"对方已读 / 对方已回"，所以第一版拿它们判 `read` / `replied`。
 * 探针把每行的**值**dump 出来之后否掉了这个假设：第 1 页 11 条会话里
 * `oppositeRead`/`oppositeReply` **全是 0**，**包括那几条有 2 条 / 1 条未读的会话**
 * （未读 = HR 刚发来消息，按命名 `oppositeReply` 本该是 1）。语义与命名不符 →
 * 用它判阶段就会把"HR 已回复"说成"没回复"。**没有样本支撑的字段一律不用。**
 *
 * 代价说清楚：**`read`（HR 已读）这一档在智联判不出来** —— 返回 `null`（契约允许），
 * 上层保留原值。要恢复这一档，得先拿到"已知已读"的会话样本、确认哪个字段真的会变。
 */
export function stageOfTalkRow(row: ZhaopinTalkRow): ContactStage | null {
  if (row.unreadCount > 0) return 'replied'
  if (row.selfReply > 0) return 'delivered'
  return null
}

/** 投递入口在"可以投"状态时的文案（实测值；投过之后这里会变成「继续沟通」）。 */
export const ZHAOPIN_APPLY_ENTRY_TEXT = '立即投递'

/**
 * 投递入口当前是哪句话（自包含）。
 *
 * 为什么只读文案就够：入口容器 `.summary-planes__action` 投递前后**都在**，
 * 变的只是里面那个按钮的文案（「立即投递」→「继续沟通」）—— 判"能不能投"必须靠文案。
 */
export function applyEntryStateInPage(arg: { selector: string }): { found: boolean; text: string } {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let holder: Element | null = null
  try {
    holder = document.querySelector(arg.selector)
  } catch {
    return { found: false, text: '' }
  }
  if (holder === null) return { found: false, text: '' }
  const button = holder.tagName === 'BUTTON' ? holder : holder.querySelector('button')
  if (button === null) return { found: false, text: '' }
  return { found: true, text: clean(button.textContent) }
}

/**
 * 定位一个**可见**元素的中心坐标（自包含）。只定位、不点击 ——
 * 点击由 host 侧的真鼠标完成（DOM `el.click()` 的 `isTrusted=false` 是最廉价的自动化特征）。
 */
export function elementCenterInPage(arg: { selector: string }): {
  found: boolean
  x: number
  y: number
  text: string
} {
  const empty = { found: false, x: 0, y: 0, text: '' }
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let node: Element | null = null
  try {
    node = document.querySelector(arg.selector)
  } catch {
    return empty
  }
  if (node === null) return empty
  try {
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    if (
      rect.width < 4 ||
      rect.height < 4 ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.pointerEvents === 'none'
    ) {
      return empty
    }
    node.scrollIntoView({ block: 'center', inline: 'center' })
    const after = node.getBoundingClientRect()
    return {
      found: true,
      x: Math.round(after.x + after.width / 2),
      y: Math.round(after.y + after.height / 2),
      text: clean(node.textContent),
    }
  } catch {
    return empty
  }
}

/**
 * 成功弹窗是否**可见且**写着预期那句话（自包含）。
 *
 * 两步都要：只看"元素在不在"会被模板里那个隐藏的弹窗骗到（`.deliver-greeting-modal`
 * 在没投递时也可能存在于 DOM 里），只看文案又会把别的提示当成投递成功。
 */
export function applySuccessInPage(arg: {
  selector: string
  textIncludes: string
}): { visible: boolean; text: string } {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let node: Element | null = null
  try {
    node = document.querySelector(arg.selector)
  } catch {
    return { visible: false, text: '' }
  }
  if (node === null) return { visible: false, text: '' }
  const text = clean(node.textContent)
  let shown = false
  try {
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    shown = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  } catch {
    shown = false
  }
  return { visible: shown && text.includes(arg.textIncludes), text }
}

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
   * 等一个选择器出现。超时**返回 false**，不抛。
   *
   * ⚠️ 真路径是 Playwright 的 `waitForSelector`（超时**抛错**），离线夹具返回 `false` ——
   * 所以必须 try/catch 把两条路径拉平，否则又会是"夹具通过、真机抛错"那种最难查的偏差。
   */
  const waitFor = async (page: PageLike, selector: string, timeoutMs: number): Promise<boolean> => {
    const wait = page.waitForSelector
    if (wait === undefined) return false
    try {
      return (await wait.call(page, selector, timeoutMs)) !== false
    } catch {
      return false
    }
  }

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

  /**
   * 抓会话列表（**翻页**，readInbox 与 detectStage 共用）。
   *
   * 停手条件：某页不满一页（含空页）→ 到底了；或翻到 `talkListMaxPages`。
   * 跨页按会话 id 去重 —— 翻页期间来了新消息会让同一条会话挪到下一页，那会造成重复。
   *
   * ⚠️ 这里**不吞异常**：接口失败 / code≠200 / 结构变了都直接抛。「0 条必须可信」——
   * 只有"某页真的返回 0 条"才算读完了，而"读不到"必须让上层看见。
   */
  const fetchTalkRows = async (page: PageLike): Promise<ZhaopinTalkRow[]> => {
    const collected: ZhaopinTalkRow[] = []
    const seen = new Set<string>()
    for (let pageNo = 1; pageNo <= config.talkListMaxPages; pageNo += 1) {
      // 页与页之间给个间隔：整条 IM 链路原先**一次等待都没有**（最多 3 页接口连发），
      // 而同一站点的搜索/详情链路都有 1.2–3.2s 的拟人间隔 —— 一个站点并存两种节奏
      // 本身就是可识别的特征（`domain/crawl.ts` 给详情补抓写的注释是同一件事）。
      if (pageNo > 1 && delayMax > 0) await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
      const result = await page.evaluate(fetchTalkListInPage, {
        url: buildTalkListUrl(config, pageNo),
      })
      if (!result.ok) {
        throw new Error(
          `智联会话列表接口没调通（第 ${String(pageNo)} 页）：${result.message}` +
            '（**这一条不能当成"没人回我"**，先查登录态 / 风控）',
        )
      }
      if (result.code !== 200) {
        // 能认出是哪一类风控就**抛风控错误**（由 guard 写平台级暂停 + 说人话）；
        // 认不出来仍是原来的普通错误 —— 不猜（见 `blockFromApiFailure`）。
        const block = blockFromApiFailure({ code: result.code, message: result.message })
        if (block !== null) {
          throw new PlatformBlockedError(
            block,
            `会话列表接口返回 code=${String(result.code)}：${result.message}`,
          )
        }
        throw new Error(
          `智联会话列表接口返回 code=${String(result.code)}（第 ${String(pageNo)} 页）：${result.message}`,
        )
      }
      const rows = talkRowsOf(result.payload)
      for (const row of rows) {
        const key = row.sessionid !== '' ? row.sessionid : row.peerPartnerId
        if (key !== '') {
          if (seen.has(key)) continue
          seen.add(key)
        }
        collected.push(row)
      }
      if (rows.length < config.talkListPageSize) break
    }
    return collected
  }

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码写在路径段里（/sou/jl<码>），且只能逐城实测 —— 城市导航页只给拼音 slug，推导不出数字码',
    },
    {
      key: 'sort',
      label: '排序方式',
      values: ZHAOPIN_SORT_OPTIONS,
      hint: '页面只有「智能匹配 / 薪酬最高 / 最新发布」三项，其中只有「最新发布」（order=4）是实测值；其余取值无证据，故不提供',
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: ZHAOPIN_POSTED_WITHIN_OPTIONS,
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

    // 打招呼/投递的具体说明见下面 `actions`（sayHello 做不了；sendResume 走页面驱动）。
    actions: {
      /**
       * 收件箱：把会话列表读进来（§13 U6）。
       *
       * 2026-09-18 登录态实测后的实现选择：**接口优先**（`getTalkList`）。
       * 理由不是"接口更省事"，而是**只有接口有方向与已读/已回标记** ——
       * DOM 里那套 `.im-session-item` 拿不到"最后一条是谁发的"，
       * 而猜方向会让"我发的话"变成"HR 说的"（§4.2.4 最不能容忍的那种错）。
       *
       * 「0 条必须可信」：接口失败 → **抛错**（绝不返回空数组）；接口 code≠200 → 抛错；
       * 结构变了 → 抛错。只有 `code:200 + data:[]` 才算"真的没有会话"。
       *
       * 会话多于一页时会**翻页**（实测翻页有效，见 `talkListMaxPages`），最多 3 页 / 60 条。
       */
      async readInbox(page): Promise<RawInboxMessage[]> {
        await page.goto(config.imUrl)
        // 先判墙：会话页被登录墙/验证码顶掉时，接口那边只会得到一句 code≠200
        // （或者更糟：一句读不出原因的失败），而这里能直接说清是什么墙。
        await assertActionPage(page)
        // 等**容器**而不是等行（zhipin 那边踩过的同一个坑）：空列表时容器在、行不在，
        // 等行会把"真的空"拖成一次超时。这里超时不报错 —— 数据以接口为准，
        // DOM 只是"页面确实到了会话页、没被弹去登录页"的旁证。
        const waitTarget =
          config.imSelectors.listContainer !== ''
            ? config.imSelectors.listContainer
            : config.imSelectors.sessionRow
        await waitFor(page, waitTarget, options.waitForListMs ?? 15_000)
        return mapTalkRowsToInbox(await fetchTalkRows(page))
      },

      /**
       * 探测某个岗位当前的接触阶段。
       *
       * 判据来自会话行上的 `unreadCount` / `oppositeReply` / `oppositeRead` / `selfReply`
       * （见 `stageOfTalkRow` 的说明与样本现状）。**匹配不到会话行就返回 `null`** ——
       * 「从没接触过」与「会话被平台归档了」在这里分不清，写成 `none` 就是记错账。
       */
      async detectStage(page, job): Promise<ContactStage | null> {
        await page.goto(config.imUrl)
        await assertActionPage(page)
        let rows: ZhaopinTalkRow[]
        try {
          rows = await fetchTalkRows(page)
        } catch (error) {
          // **风控证据不能吞**：接口挂了 / 形状变了确实可以"恰当地判不出来"（契约允许 null），
          // 但"登录态失效 / 被限流"必须冒泡上去 —— 吞掉它等于把平台级信号咽下去。
          if (error instanceof PlatformBlockedError) throw error
          // 其余情况：这里**不猜**，如实返回"判不出来"，上层保留原值
          return null
        }
        // 首选**岗位号**匹配：会话行的 `jobNumber` 就是详情 URL 里那个 id
        // （实测两处同值：`CC657755130J40874315311` 同时出现在 URL 与会话行里）。
        // 公司名/岗位名只是兜底 —— 它们会被平台改写（加后缀、去空格），拿它们当主判据会漏。
        const jobIdFromUrl = /\/jobdetail\/([0-9A-Za-z~_-]+)\.htm/.exec(job.sourceUrl)?.[1] ?? ''
        const company = job.company.trim()
        const title = job.title.trim()
        const row =
          (jobIdFromUrl === ''
            ? undefined
            : rows.find((item) => item.jobNumber === jobIdFromUrl)) ??
          rows.find(
            (item) =>
              (company !== '' && item.companyName.trim() === company) ||
              (title !== '' && item.jobTitle.trim() === title),
          )
        return row === undefined ? null : stageOfTalkRow(row)
      },

      /**
       * 投递简历（§22.4 高危）。
       *
       * ⚠️ **一次点击 = 投简历 + 平台自动发一句招呼语，而且不可逆**
       * （实测结果弹窗 `.deliver-greeting-modal`：「已向对方发送简历和打招呼语」）。
       *
       * ## 为什么是**页面驱动**而不是接口化（这是实测后的结论，不是偷懒）
       *
       * 本轮把投递的接口链抓全了（`application/preparation` → `bdp/interceptService/intercept`
       * → `jobs/application` → `imapi/imV2/getUserPrologueNew`），但**没有采用**，因为：
       *   * `preparation` 要 `rootOrgId`(公司 id) 与 `staffId`(HR id) —— 详情页载荷里这两个键
       *     **出现 0 次**（实测 grep），从 `{title, company, sourceUrl}` 推不出来；
       *   * `application` 还要 `cityIds`/`pageCode`/`jobSource`/`attachmentDefaultFileId`/
       *     `businessSystem`/`stSourceCode` … 十来个上下文字段，哪些必需**没人知道**。
       * 在一个**不可逆**的动作上编这些字段是不能接受的（编错 = 投错岗 / 投错简历）。
       * 页面驱动让平台自己拼请求，我们只负责"点"和"看结果" —— 也正是用户自己的操作路径。
       *
       * ## 送达语义
       *   * 看到那个成功弹窗（且文案是「已向对方发送简历…」）→ `delivered`；
       *   * 点了但没看到 → `pending` + "去「我的投递」核对，**别立刻重试**"（重试会投出第二份）；
       *   * 入口文案不是「立即投递」→ `missing` 且**一个字都不点**（多半已投过/已沟通）。
       */
      async sendResume(page, job, filePath): Promise<ActionResult> {
        if (page.mouse === undefined) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              '当前页面没有 CDP 鼠标能力 —— 拒绝用 DOM 事件冒充真人点击' +
              '（isTrusted=false 是最廉价的自动化特征）。这次按未投递处理。',
          }
        }
        if (filePath !== null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              '智联的投递只用**平台内简历**：`application/preparation` 返回的是平台自己的简历列表' +
              '（在线简历 + 已上传的附件简历 id），页面上的「立即投递」也只让你从中选，' +
              '**没有"把这次投递指定成本地文件"的入口**。请先在智联「我的简历」里上传附件简历，' +
              '再用 filePath=null 投递（那时平台会用它自己的默认简历）。',
          }
        }

        await page.goto(job.sourceUrl)
        // 判墙先于一切（**包括等入口**）：被验证码/限流页顶掉时「立即投递」永远等不到，
        // 那次等待会白等 20 秒、最后以"找不到投递入口"收场 —— 恰好把风控信号咽掉。
        await assertActionPage(page)
        await waitFor(page, config.applySelectors.entry, config.applyWaitMs)

        // 登录墙：实测（`probe:zhaopin-anon`，未登录）**详情页照样会渲染出「立即投递」按钮**，
        // 点下去只会被弹到 `passport.zhaopin.com/login`。真正的登录检查在上游
        // （`guard/actions/application.ts` 调适配器之前会复查 `session.status().loggedIn`），
        // 但**记录可能是旧的**（cookie 过期、状态还写着已登录）—— 那时若不识别，就会得到
        // 一条"点了没确认到、别急着重试"的假警报。所以这里认一下登录页。
        const onLoginPage = (): boolean => /^https?:\/\/passport\.zhaopin\.com\/login/i.test(page.url())
        if (onLoginPage()) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: `详情页直接把你弹到了登录页（${page.url().slice(0, 80)}）—— 未登录，**没有点任何东西**。`,
          }
        }

        const entry = await page.evaluate(applyEntryStateInPage, {
          selector: config.applySelectors.entry,
        })
        if (!entry.found) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              `详情页上找不到投递入口（${config.applySelectors.entry}）—— 可能未登录、或页面版式已变。` +
              '**没有点任何东西。**',
          }
        }
        if (entry.text !== ZHAOPIN_APPLY_ENTRY_TEXT) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              `投递入口的文案是「${entry.text}」，不是「${ZHAOPIN_APPLY_ENTRY_TEXT}」—— 通常意味着` +
              '**这个岗位已经投过或已经沟通过**。为避免重复投递，**这一下没有点**；' +
              '请到智联「我的投递」核对。',
          }
        }

        const spot = await page.evaluate(elementCenterInPage, { selector: config.applySelectors.entry })
        if (!spot.found) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '投递入口存在但不可见/不可点（可能被遮挡）—— 没有点，避免点空。',
          }
        }
        // ── 动手之前先停下来 ──────────────────────────────────────────
        // 这是全链路唯一**不可逆**的一步（一次点击 = 投简历 + 平台替你发一句招呼语），
        // 而原先这里唯一的"拟人成本"是 `humanClick` 内部的 240ms —— 真人不会
        // 页面刚渲染完就把简历投出去。停留区间走配置（`dwellBeforeApplyMs`，15–30s）。
        if (config.dwellBeforeApplyMs[1] > 0) {
          await page.waitForTimeout(
            dwellBeforeActMs({
              minMs: config.dwellBeforeApplyMs[0],
              maxMs: config.dwellBeforeApplyMs[1],
            }),
          )
        }
        // 再悬停到按钮上停一下，然后才按下去（悬停是"看清了位置"的物理表现）
        await humanHover(page.mouse, spot.x, spot.y, { wait: (ms) => page.waitForTimeout(ms) })
        await humanClick(page.mouse, spot.x, spot.y, { wait: (ms) => page.waitForTimeout(ms) })

        // 送达校验：等成功弹窗，并确认它写的是"已发送简历"那句（而不是别的弹窗）
        const appeared = await waitFor(page, config.applySelectors.successModal, config.applyWaitMs)
        const success = await page
          .evaluate(applySuccessInPage, {
            selector: config.applySelectors.successModal,
            textIncludes: config.applySelectors.successText,
          })
          .catch(() => ({ visible: false, text: '' }))
        if (success.visible) {
          return { ok: true, delivery: 'delivered', evidence: 'dom' }
        }
        // 点了之后才发现落在登录页 ⇒ 这次点击**肯定没投出去**（登录墙挡在前面）。
        // 若只按"没看到成功弹窗"处理会得到 `pending`（"别急着重试"），那是一条吓人的假警报。
        if (onLoginPage()) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'dom',
            message:
              `点了「${ZHAOPIN_APPLY_ENTRY_TEXT}」之后被弹到登录页（${page.url().slice(0, 80)}）—— ` +
              '**这次没有投出去**（登录态已失效）。先重新登录，再决定要不要投。',
          }
        }
        // 分清三种"没看到成功"：元素根本不出现 / 元素在但一直隐藏（模板常驻 DOM）/ 文案不对。
        // 它们的处理动作相同（去核对、别重试），但**说出来的话**必须不同 —— 否则维护者会误判。
        const sawSomething = appeared && success.text !== ''
        return {
          ok: false,
          delivery: 'pending',
          evidence: sawSomething ? 'dom' : 'none',
          message: sawSomething
            ? `已点击投递，但**没能确认成功**（弹窗元素在 DOM 里，` +
              `${success.visible ? '但文案不是预期的' : '但一直是隐藏的'}：「${success.text.slice(0, 60)}」）—— ` +
              '请去智联「我的投递」核对，**不要立刻重试**。'
            : '已点击投递，但**没有任何成功提示出现**（可能被风控拦下，也可能只是没渲染出来）。' +
              '这是一次**不可逆**的动作 —— 请去智联「我的投递」核对结果，' +
              '**不要立刻重试**（重试可能投出第二份）。',
        }
      },
    },
  }
}

/** 当前页码（从内嵌载荷里读）。 */
export function currentPageInPage(): number {
  const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
  for (const script of scripts) {
    const text = script.textContent ?? ''
    const marker = text.indexOf('__INITIAL_STATE__')
    if (marker < 0) continue
    const m = /"pageIndex"\s*:\s*(\d+)/.exec(text.slice(marker))
    if (m !== null && m[1] !== undefined) return Number.parseInt(m[1], 10)
  }
  return 0
}

