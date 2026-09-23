/**
 * 智联适配器的配置面：选择器 / URL 参数 / 值域 / 城市码 / 判墙信号 + 默认配置与覆盖合并。
 *
 * 纯数据与纯函数：不碰 `document`、不发请求、不编排流程；DB 覆盖（ADR-19）也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import { numberRange } from '../../config-merge.js'

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
 * 所以 `base` 那一支没有 `cityParam` 可用，只有路径段。
 *
 * ## 两条路由：带筛选的走 `filterBase`（2026-09-21 点击探针实测）
 *
 * 在登录态 `/sou/jl765?kw=Java` 上点一下筛选控件，**站点自己**跳到的地址是
 * `https://www.zhaopin.com/jobs?jl=765&kw=Java&el=4`（学历「本科」）——
 * 城市在这条路由上从路径段变成了 query 参数 `jl`，筛选值用 `el`/`we`/`et`/`ct`
 * 这样的两字母参数名（与上面那条登录表单 URL 的字母表一致）。
 *
 * 所以：**没有筛选时**用 `/sou/jl<码>`（那条路由有真实分页、薪资明文）；
 * **带了任何筛选**时用 `/jobs?jl=<码>&…`（筛选参数只在这条路由上被实测过）。
 * 两条路由适配器本来都要认：登录态请求 `/sou/jl765?kw=Java` 时，服务端会自己
 * 302 到 `/jobs?jl=765&kw=Java`（实测 `finalUrl` 就是它，渲染的是 `.job-card` 那套
 * 标记 —— 见 `selectors.card` 上面那段地雷说明）。
 */
export interface ZhaopinUrlParams {
  /** 无筛选时的基础地址，城市码会拼成 `${base}/jl${code}`。 */
  base: string
  /**
   * **带筛选**时的基础地址；城市改用 `cityParam` 传。
   *
   * 单独一个键而不是复用 `base`：两条路由的城市编码位置不同（路径段 vs query），
   * 合成一个键就得在函数里猜"现在算哪种情况"，而这是能直接写清楚的事。
   */
  filterBase: string
  /** 关键词参数。**只在第 1 页用**（见文件头的 robots 取舍）。 */
  keywordParam: string
  /** 页码参数（query 兜底形式）。 */
  pageParam: string
  /** 排序参数。实测 `order=4` 对应「最新发布」。 */
  sortParam: string
  /** 发布时间窗参数。**平台在搜索 URL 上不提供该维度**，保留键位仅为将来扩展。 */
  postedWithinParam: string
  /** `filterBase` 路由上的城市参数：实测 `jl=765`（深圳）。 */
  cityParam: string
  /** 学历（**最低学历**语义）：实测点「本科」→ `el=4`。 */
  educationParam: string
  /** 工作经验：实测点「1-3年」→ `we=0103`。 */
  workExperienceParam: string
  /** 公司性质：实测点「国企」→ `ct=1`。 */
  companyTypeParam: string
  /** 职位类型（全职/兼职/实习/校园）：实测点「全职」→ `et=2`。 */
  jobStatusParam: string
  /** 薪资：实测真机全选后 `sl=0000%2C4000`（值=字典区间码）。 */
  salaryParam: string
  /** 融资阶段：实测 `fs=7`（已上市）。 */
  financingParam: string
  /** 公司人数：实测 `cs=1`（20人以下）。 */
  companySizeParam: string
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

/**
 * **默认排序 = 最新发布（`order=4`）**（2026-09-23 用户定案）。
 *
 * 站点的默认列表是「全部」（智能匹配）—— 同一批岗位反复出现在搜索结果里是常态，
 * 按最新采先把新岗位捞上来。方案**显式**配了别的排序时跟随方案；`order=4` 是
 * 唯一实测过的取值（`__INITIAL_STATE__` 的 queryParams/displayParams 双回显 + 控件高亮），
 * 其它选项（智能匹配/薪酬最高）的参数值无证据，所以"默认"也只能落到这一个值上。
 */
export const ZHAOPIN_DEFAULT_SORT = '4'

/** 发布时间窗：智联的搜索 URL 不暴露这个维度，所以值域为空（界面据此禁用并给出原因）。 */
export const ZHAOPIN_POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = []

/**
 * 四个筛选维度的取值域 —— **全部照抄站点自己那份字典**。
 *
 * 来源：登录态搜索页后台请求 `GET /c/i/search/base/data`，响应 `data` 里有
 * `educationType` / `workExpType` / `companyType` / `jobStatus` 等字典（2026-09-21 实测，
 * 转储见 `test/fixtures/zhaopin-base-data-filters.json` —— 夹具就是那份响应的原样摘录，
 * 单测逐条对账，防止有人手改这些码）。
 *
 * 两条刻意的取舍：
 *   * **不提供「不限」类取值**（`-1` / `-99` / `?`）：语义上等于"不带这个参数"，
 *     收进值域只会让用户选出一个与不选完全等价的选项（界面上的"不填"已经表达了它）。
 *   * 公司性质里的 `6;10`（机关/事业单位）与 `7;14;15`（其他）**不提供**：
 *     它们是**分号拼的多码**，而 `URLSearchParams` 会把 `;` 转义成 `%3B` ——
 *     站点自己怎么发这两个值没有被实测过，宁缺勿编。
 */
export const ZHAOPIN_EDUCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '9', label: '初中及以下' },
  { value: '7', label: '高中' },
  { value: '12', label: '中专/中技' },
  { value: '5', label: '大专' },
  { value: '4', label: '本科' },
  { value: '3', label: '硕士' },
  { value: '10', label: 'MBA/EMBA' },
  { value: '1', label: '博士' },
]

export const ZHAOPIN_WORK_EXPERIENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0001', label: '1年以下' },
  { value: '0103', label: '1-3年' },
  { value: '0305', label: '3-5年' },
  { value: '0510', label: '5-10年' },
  { value: '1099', label: '10年以上' },
]

export const ZHAOPIN_COMPANY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '国企' },
  { value: '2', label: '外企' },
  { value: '4', label: '中外合资' },
  { value: '16', label: '港澳台企业' },
  { value: '5', label: '民营' },
]

export const ZHAOPIN_JOB_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '2', label: '全职' },
  { value: '1', label: '兼职/临时' },
  { value: '4', label: '实习' },
  { value: '5', label: '校园' },
]

/**
 * 2026-09-23 追加的三个维度（薪资 / 融资阶段 / 公司人数）。
 *
 * 取值域同样照抄 `base/data` 字典（`salaryType` / `financing` / `companySize`，夹具同步补齐）；
 * 参数名来自**真机全选后的地址栏**（`sl=…&fs=…&cs=…`），且 `sl` 的生效性单独实测过：
 * `sl=0000,4000` 把深圳 java 的结果集从满页 20 条砍到 10 条（页面同时出现空态文案）。
 *
 * 同样的几条刻意取舍：
 *   * 「不限」不进表（salaryType 的 `0000,9999999`、另两表的 `-1`）；
 *   * financing 的「有融资」(`2;3;4;5;6`) 是分号多码 —— 编码未实测，不提供
 *     （与 companyType 的 `6;10` 同一条规则）；
 *   * companySize 的 `7`（name 为空、en_name=Confidential）没有可展示的标签，不提供。
 */
export const ZHAOPIN_SALARY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0000,4000', label: '4K以下' },
  { value: '4001,6000', label: '4K-6K' },
  { value: '6001,8000', label: '6K-8K' },
  { value: '8001,10000', label: '8K-10K' },
  { value: '10001,15000', label: '10K-15K' },
  { value: '15001,25000', label: '15K-25K' },
  { value: '25001,35000', label: '25K-35K' },
  { value: '35001,50000', label: '35K-50K' },
  { value: '50001,9999999', label: '50K以上' },
]

export const ZHAOPIN_FINANCING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '7', label: '已上市' },
  { value: '8', label: '不需要融资' },
  { value: '1', label: '未融资' },
]

export const ZHAOPIN_COMPANY_SIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '20人以下' },
  { value: '2', label: '20-99人' },
  { value: '3', label: '100-299人' },
  { value: '8', label: '300-499人' },
  { value: '4', label: '500-999人' },
  { value: '5', label: '1000-9999人' },
  { value: '6', label: '10000人以上' },
]

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

/** 投递入口在"可以投"状态时的文案（实测值；投过之后这里会变成「继续沟通」）。 */
export const ZHAOPIN_APPLY_ENTRY_TEXT = '立即投递'

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
    /**
     * 卡片容器 —— ⚠️ **不要把 `.job-card` 加进来**（2026-09-21 探针实测）。
     *
     * 现状：`/sou/jl765?kw=Java` 这条路由现在渲染的是 **`.job-card`** 那套新标记
     *（实测：`.joblist-box__item` = 0，`[class*="job-card"]` ≈ 400，登录/匿名都一样），
     * 也就是**这个选择器已经匹配不到卡片**。看起来该改成 `.job-card`，但**不能改**：
     *   * 新卡片的标题**没有 `<a href>`**（实测整张卡只有一个公司链接），而岗位 id 只能从
     *     `jobdetail/CC…J….htm` 里抽 → DOM 路径拿不到 `sourceUrl`（必需字段）；
     *   * 现在"卡片 0 条"恰好触发 `page/list.ts` 的**载荷兜底**：页面仍内联
     *     `__INITIAL_STATE__`（实测 217KB，含 `positionList`），它带 id/薪资明文/公司/城市/学历/经验；
     *   * 一旦这里能匹配到卡片，兜底就不会触发 → 20 条**没有 sourceUrl**的记录。
     * 真要迁到 DOM 路径，先解决"新卡片上岗位 id 从哪来"。
     */
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
    // 带筛选的路由（实测：点「本科」后站点自己跳到的就是它）。
    filterBase: 'https://www.zhaopin.com/jobs',
    keywordParam: 'kw',
    pageParam: 'p',
    sortParam: 'order',
    postedWithinParam: 'pd',
    // 下面这组字母表与站点自己登录表单 URL 上的 `jl/kw/el/we/et/ct` 一致；
    // 其中 el/we/et/ct 四个是**点击实测**出来的（点一下、看它跳哪）。
    cityParam: 'jl',
    educationParam: 'el',
    workExperienceParam: 'we',
    companyTypeParam: 'ct',
    jobStatusParam: 'et',
    // 2026-09-23 实测：真机把全部筛选项选一遍，地址栏为
    // `/jobs/?pageMode=search&jl=763&kw=java&sl=0000%2C4000&el=9&we=-1&ct=1&fs=7&cs=1&et=2&in=…&jt=…`
    // —— 薪资是 `sl`（值=字典区间码，逗号站点自己编成 %2C）、融资阶段 `fs`、公司人数 `cs`。
    salaryParam: 'sl',
    financingParam: 'fs',
    companySizeParam: 'cs',
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
 * 智联特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 智联走"共享词表、自有结构"：这里只声明**它比通用词表多的那几条**，
 * 加上它自己的 `blank` 阈值（80，比通用的 120 更严 —— 它的"搜到 0 条"结果页
 * 也有一两百字筛选器文案，120 会把那种页面误判成空白）。
 */
export const ZHAOPIN_BLOCK_SIGNALS = {
  // 极验的 `.geetest_box` / 易盾的 `#nc_1_wrapper` / 阿里云 WAF 的文案与脚本名
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  blankTextLength: 80,
} as const
