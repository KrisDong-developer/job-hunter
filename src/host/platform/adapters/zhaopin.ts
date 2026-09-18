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
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { signalsOf, type BlockSignalSet } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

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

export interface ZhaopinConfig {
  selectors: ZhaopinSelectors
  urlParams: ZhaopinUrlParams
  cityCodes: Record<string, string>
  detailUrlTemplate: string
  /** 详情页选择器（`detail.extract` 用）。 */
  detailSelectors: ZhaopinDetailSelectors
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
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      // 打招呼：智联的沟通入口要登录，且未登录 DOM 里没有"在线沟通"按钮。
      // 这里**声明为不支持**，让 guard 明确拒绝，而不是让用户以为能发。
      supportsGreeting: false,
      fieldCompleteness: 'high',
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: ZHAOPIN_MAX_PAGES,

    auth: {
      loginUrl: 'https://passport.zhaopin.com/login',
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
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockInPage, {
          card: config.selectors.card,
          loginPopup: config.selectors.loginPopup,
          noJobTip: config.selectors.noJobTip,
          // 通用词表在**宿主侧**组装好再传进去（页面里没有这个模块）
          signals: signalsOf(ZHAOPIN_BLOCK_SIGNALS),
        })
      },
    },

    // 详情页解析（P2 详情抓取）。未登录即可访问详情页拿 JD 全文；薪资/DOM 层会掩码，
    // 但载荷 `detailedPosition` 里是真实值（见 `extractJobDetailInPage`）。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractJobDetailInPage, config)
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 智联的打招呼与投递都要登录态，且实测未登录 DOM 里连"在线沟通"都没有，
    // 没有任何可靠的按钮契约可依。按「不编选择器」的原则，宁可让 guard
    // 以 ADAPTER_BROKEN 明确拒绝（fail-closed），也不上线一个会乱点的实现。
    // 详见 docs/ADAPTERS.md 的待办。
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

