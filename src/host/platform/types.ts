/**
 * 采集层契约（§4.2.2）。
 *
 * **P1 实现的子集**：`criteria.buildSearchUrl` / `crawl.*` / `guard.detectBlock`。
 * 协议里其余部分（`criteria.discover` 动态发现、`detail.extract` 详情页、`actions.*` 高危动作、
 * `auth.*` 登录态、`guard.selfTest`）在 P2~P5 逐个补上 —— 这里**不放假实现**，
 * 缺什么就明确是可选的、还没做。
 */
import type { BlockKind, ContactStage, CoreField, HealthState } from '../../shared/enums.js'
import type {
  AdapterCapabilitiesDto,
  AdapterImplementationDto,
  AdapterMaturityDto,
  AuthRequirementDto,
} from '../../shared/dto.js'
import type { HumanKeyboard, HumanMouse } from './humanize.js'

/** 一页列表里的一条原始岗位。**只含标量**，字段名与核心字段对齐（§4.3 P7）。 */
export interface RawJob {
  /** 平台内岗位 id —— 幂等 upsert 的键之一。 */
  platformJobId: string
  title: string
  salaryRaw: string
  company: string
  sourceUrl: string
  city?: string
  district?: string
  expReq?: string
  eduReq?: string
  tags?: string[]
  publishedAt?: string | null
  industry?: string | null
  companySize?: string | null
  companyNature?: string | null
  /** 解析过程中的可读问题，会随记录一起进 `pending_repair`。 */
  notes?: string[]
}

/** 详情页解析结果（P2+）。 */
export interface RawJobDetail extends RawJob {
  jdText?: string | null
  /**
   * 投递/报名截止时间（平台原始串）。
   *
   * 为后续接入校招「硬截止」（campus `deadlines()`，错过即出局）铺路：
   * 只有详情页暴露结构化截止点的平台（如国聘「报名截止」）才填，否则省略。
   */
  applyDeadline?: string | null
}

/** 搜索条件 —— 平台无关的键值对。 */
export interface SearchCriteria {
  keyword?: string
  city?: string
  page?: number
  /** 抓取深度（SR-40）：最多抓几页。 */
  maxPages?: number
  /** 排序方式（SR-40）：平台自己的取值域见 `criteriaDimensions`。 */
  sort?: string
  /** 发布时间窗（SR-40）：天。 */
  postedWithinDays?: number
  /**
   * 平台特有筛选维度的值（**适配器在 `criteriaDimensions` 里声明过才会有值**）。
   *
   * 为什么不直接摊平成 `workExp` / `education` 这样的顶层键：
   * 一个方案可以同时选**多个平台**，而同一个键在不同平台的含义可能不同
   * （`type` 在神仙外企是"外企/不限"，在别的平台可能是别的意思）。
   * 摊平之后，没声明过这个键的适配器会把它当成"自由参数"拼进自己的 URL ——
   * 那是静默的语义污染；放在一个显式的命名空间里，适配器只有主动去读才拿得到。
   *
   * 落地例子：`{ workExp: '3', education: '2', type: '1' }`（神仙外企）。
   */
  platform?: Record<string, string>
  /** 平台特有的补充参数（来自方案配置）。 */
  extra?: Record<string, string>
}

/**
 * 读一个平台特有维度的值。
 *
 * 存在的理由：适配器可能被两种方式构造 ——
 * 由 `criteriaToSearchCriteria`（走 `platform` 命名空间），或者由调用方直接拼一个
 * `SearchCriteria`（测试、脚本）。这个助手让两种来路读法一致，不必在每个调用点写两遍。
 */
export function platformCriterion(criteria: SearchCriteria, key: string): string {
  const scoped = criteria.platform?.[key]
  if (scoped !== undefined && scoped !== '') return scoped
  const loose = (criteria as Record<string, unknown>)[key]
  return typeof loose === 'string' ? loose : ''
}

/**
 * 适配器声明的一个筛选维度（SR-41/42）。
 *
 * **这一层是"能力驱动的 UI"的落地点**：界面据它渲染筛选器，
 * 不支持的维度**禁用而非隐藏**并给出原因 —— 隐藏会让用户以为功能坏了。
 *
 * `values` 为空数组表示自由文本（如关键词）。
 */
export interface CriteriaDimension {
  key: string
  label: string
  /** 值域；空数组 = 自由文本。 */
  values: Array<{ value: string; label: string }>
  /**
   * 取值域**封闭**：不在 `values` 里的取值会被这张表拒掉（构造不出搜索 URL）。
   *
   * 必须显式声明，因为**从 `values` 空不空推不出来**：
   *   * `guopin` / `hiredchina` 的城市表是**空**的，但空表在这里的含义是
   *     "一个城市都别给"（带城市一律拒绝）→ `closed: true`；
   *   * `indeed` / `lagou` 是**自由文本**（地名原样进 URL，表里的值只是建议）
   *     → `closed: false`，即使 `values` 非空。
   *
   * 缺省 = `values.length > 0`（历史行为）。判据与后果见 `platform/cities.ts`
   * 的 `citySupportOf` —— 差一个 flag，用户收到的就是一条**假的**警告
   * （或被漏掉的一次整轮失败）。
   */
  closed?: boolean
  /** 该维度可以取到的最多结果数（分页上限）。 */
  max?: number
  /** 不支持时的解释（用于"为什么这个筛选项是灰的"）。 */
  hint: string
}

/** 运行期健康自检结果。 */
export interface HealthResult {
  ok: boolean
  state: HealthState
  detail?: string
}

/**
 * 平台**客观能力**（"这个平台有什么"，不是"我们实现了什么"）。
 *
 * 与 `AdapterImplementation` 的分工见后者；正身定义在 `shared/dto.ts`（跨层共享形状）。
 */
export type AdapterCapabilitiesFact = AdapterCapabilitiesDto

/**
 * **实现到什么程度**（与"平台有什么能力"分开）。
 *
 * 为什么必须分开：`51job` 的 `capabilities` 声明 `supportsGreeting: true`
 * 而 `actions` 是 `undefined` —— 契约里两个字段互相矛盾，调用方只能靠
 * `actions === undefined` 绕开它。**让契约说实话**的办法是把两者拆开：
 * 前者是平台事实，后者由实现**派生**（`adapterImplementationOf`）。
 */
export type AdapterImplementation = AdapterImplementationDto

/**
 * 登录需求与成熟度是**跨层共享的形状**（host 声明、client 展示），
 * 所以正身定义在 `shared/dto.ts`，这里只做别名。
 */
export type AuthRequirementFact = AuthRequirementDto
export type AdapterMaturityFact = AdapterMaturityDto

/**
 * 一次动作的结果。
 *
 * ⚠️ `delivery` 不是可选的花哨字段，而是**必需信息**：
 * 「点了按钮」与「消息真的进了对方会话」是两件事，而这是本系统最不能猜的问题。
 * 只用 `ok: boolean` 无法区分两者 —— 于是"发出去了吗"只能靠猜。
 */
export type DeliveryState = 'delivered' | 'pending' | 'failed' | 'missing'

export interface ActionResult {
  ok: boolean
  /** 送达状态。适配器没能力验证时给 `'missing'` 并在 `message` 里说明，**不要假装 delivered**。 */
  delivery: DeliveryState
  /** 依据来自哪条通道。`'none'` = 只是点了按钮，没有验证手段。 */
  evidence: 'dom' | 'inline-state' | 'none'
  /** 会话里已有同文本消息 → 这次**没有**重发（消息级幂等命中）。 */
  idempotentHit?: boolean
  message?: string
}

/** 从适配器**派生**实现度 —— 手写必然与实际漂移。 */
export function adapterImplementationOf(adapter: SiteAdapter): AdapterImplementation {
  const actions = adapter.actions
  return {
    crawl: true,
    detail: adapter.detail !== undefined,
    actions: {
      sayHello: actions?.sayHello !== undefined,
      sendResume: actions?.sendResume !== undefined,
      reply: actions?.reply !== undefined,
      readInbox: actions?.readInbox !== undefined,
      detectStage: actions?.detectStage !== undefined,
    },
    loginCheck: adapter.auth !== undefined,
  }
}

/**
 * 页面抽象。
 *
 * 真实路径是 Playwright 的 `Page`；离线夹具路径是一个 jsdom 实现
 * （见 `test/support/jsdom-page.ts`）。适配器只依赖这个接口，
 * 所以**同一份解析代码**在两条路径上跑，离线测试才有意义。
 */
export interface PageLike {
  goto(url: string): Promise<void>
  /** 当前地址（离线实现返回夹具地址）。 */
  url(): string
  /**
   * 在页面上下文里执行一个**自包含**函数并取回标量 JSON 结果。
   * 传入的函数不得引用模块作用域的自由变量 —— 真路径上它会被序列化后送进浏览器。
   */
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>
  waitForTimeout(ms: number): Promise<void>
  /**
   * 等某个选择器出现（可选能力）。
   *
   * 需要它是因为**招聘站点基本都是 SPA**：`load` 事件到达时列表还没渲染完，
   * 立刻解析只会拿到 0 条 —— 而 0 条最容易被误读成「今天没有新岗位」。
   * 夹具实现直接查一次静态 DOM。
   *
   * ⚠️ 真路径是 Playwright 的 `waitForSelector`：超时**抛错**而不是返回 false
   * （离线夹具返回 false）。调用方一律 try/catch 包住再取布尔值。
   * @returns 等到返回 true；超时返回 false（调用方自行决定降级）
   */
  waitForSelector?(selector: string, timeoutMs: number): Promise<boolean>
  /**
   * ── 以下三项是**可选交互面**，只有"高危动作"（打招呼/投递）才用得到 ──────
   *
   * 为什么要单开一层而不是复用 `evaluate`：`el.click()` / 直接改 `innerHTML`
   * 产生的是 `isTrusted=false` 的 DOM 事件，是最廉价的自动化特征（§7.2 / D-17a）。
   * 真正的点击与输入必须走 CDP Input 域（`page.mouse` / `page.keyboard`），
   * 也就是 `platform/humanize.ts` 的两个最小结构面。
   *
   * ⚠️ **缺失时适配器必须 fail-closed，绝不退回 DOM 事件模拟** ——
   * 悄悄降级成 DOM 点击，等于把"看起来成功了"当成"发出去了"。
   * 离线夹具可以只实现其中一部分（读类动作根本不需要它们）。
   */
  mouse?: HumanMouse
  keyboard?: HumanKeyboard
  /**
   * 给 `input[type=file]` 设置本地文件（附件投递）。
   *
   * 真路径 = Playwright `page.setInputFiles(selector, files)`；离线夹具记录调用即可。
   */
  setInputFiles?(selector: string, filePaths: readonly string[]): Promise<void>
}

/** 采集会话的页面来源。浏览器实现与夹具实现都满足它。 */
export interface PageSource {
  acquire(): Promise<PageLike>
  release(page: PageLike): Promise<void>
}

export interface SiteAdapter {
  id: string
  displayName: string
  /** 平台客观能力（不描述我们实现了什么 —— 后者用 `adapterImplementationOf`）。 */
  capabilities: AdapterCapabilitiesFact
  /**
   * **成熟度**：验证到什么程度（平台事实，见 `platform-facts.ts` 的统一表）。
   *
   * 为什么必须显式声明而不是"默认可用"：注册表里有平台 ≠ 平台能用。
   * 用户在方案里勾 4 个平台，若其中 3 个是未校准的，他会得到
   * 「1 个能跑 + 3 个静默返回 0 条」，而界面显示"采集完成"。
   */
  maturity: AdapterMaturityFact
  /** **登录需求**：各环节要不要登录。`unknown` = 没验证过，如实标出来。 */
  authRequirement: AuthRequirementFact
  /** 本适配器声明的必需字段（§4.2.4）。任一连续缺失即可能触发降级。 */
  requiredFields: readonly CoreField[]
  /**
   * SR-41/42：本适配器**声明支持的筛选维度**。
   *
   * 这是配置面唯一的权威：界面据它渲染、校验据它拒绝、
   * 工具与 HTTP 走同一份校验（SR-45）。
   */
  criteriaDimensions: readonly CriteriaDimension[]
  /** 抓取深度的上限（页数）。超出即拒绝，而不是默默截断。 */
  maxPages: number
  /**
   * 抓取深度的**默认**页数：方案没配 `maxPages` 时用它（`crawl.ts` 的取用链是
   * `criteria.maxPages ?? options.maxPages ?? defaultMaxPages`）。
   *
   * 为什么必须是适配器声明而不是全局一个数：风控强度是**平台事实** ——
   * 猎聘/拉勾（antiBot=high）默认 3 页、智联默认 5 页，都有站点侧依据；
   * 没有依据的平台就老老实实 1 页。曾经这里只有 hint 文案里的"默认 N 页"
   * 而执行链永远是 1 页 —— 文案说了三年假话，本字段让它们变成事实。
   */
  defaultMaxPages: number

  criteria: {
    /** URL 编码路径 —— 首选，比 DOM 回填稳健得多，也少触发风控（ADR-9）。 */
    buildSearchUrl(criteria: SearchCriteria): string | null
  }

  /**
   * 登录态**检测实现**（§4.2.2 的 `auth`，P3 落地）。
   *
   * `isLoggedIn` 只回答一个问题：**当前页面会不会被登录墙挡住**。
   *
   * ⚠️ 「没有实现检测」与「不需要登录」是两件事，别把它们混成一个 `undefined`：
   * 前者看这里，后者看 `authRequirement`。之前的注释把 `undefined` 解释成
   * "不需要登录"，而 `liepin` / `zhipin` 其实**需要**登录（详情页要 `securityId`）——
   * 于是登录门对它们永远不触发，一个被登录墙挡住的平台会安静地返回 0 条。
   */
  auth?: {
    loginUrl: string
    isLoggedIn(page: PageLike): Promise<boolean>
  }

  crawl: {
    gotoSearch(page: PageLike, criteria: SearchCriteria): Promise<void>
    readListPage(page: PageLike): Promise<RawJob[]>
    hasNextPage(page: PageLike): Promise<boolean>
  }

  /**
   * 详情页解析（可选，P2 详情抓取）。
   *
   * 只在有**已验证选择器证据**的平台实现（如 zhipin：BossHunter site-patterns
   * 2026-05-26 验证过 `.job-sec-text` 等选择器）；没有证据就不声明 ——
   * 调用方据此如实降级（ jdText 留空，而不是编一份）。
   */
  detail?: {
    /** 在已导航到岗位详情页的页面上解析 JD 与扩展字段。 */
    extract(page: PageLike): Promise<RawJobDetail>
  }

  guard: {
    /** 命中风控/登录墙就返回类型，调用方**不硬重试**（C12）。 */
    detectBlock(page: PageLike): Promise<BlockKind | null>
  }

  /**
   * **高危动作**（§4.2.2 的 `actions`）。
   *
   * ⚠️ 这些方法**不允许被 domain 直接调用**：实现放在 `guard/actions/` 里，
   * 由 guard 校验一次性令牌后才执行（§4.4.1 机制化强制）。
   * 适配器只负责"怎么点"，不负责"该不该点"。
   *
   * 形状在**实现之前**就定死，理由是多平台：10 个平台各写一套返回形状，
   * 上层就得写 10 个分支。这里先把契约固定下来（含"送达"语义），
   * 实现时只填内容不改形状。
   */
  actions?: {
    /**
     * 打招呼。
     *
     * 返回 `ActionResult` 而不是 `{ ok: boolean }`：`ok` 只说明"动作没抛错"，
     * 而**"消息是否真的进了对方会话"必须单独表达**（`delivery`）。
     * 发不出去的招呼语与发出去的，后续处理完全不同（重试 vs 不重试、是否记接触态）。
     */
    sayHello?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
      text: string,
    ): Promise<ActionResult>
    /** 投递简历（含附件）。 */
    sendResume?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
      filePath: string | null,
    ): Promise<ActionResult>
    /**
     * 在**已存在的会话**里回一条消息（对方先说话之后）。
     *
     * 与 `sayHello` 的区别：打招呼是"从岗位详情页发起第一次接触"，回复是"进已有会话接着聊"。
     * 之所以单开一个槽位而不是复用 `sayHello`：命中目标的方式不同（按岗位详情页入口 vs 按会话列表匹配），
     * 幂等语义也不同（回复时"同文本已存在"更可能是我之前说过的话）。
     *
     * ⚠️ 这个槽位是 2026-09-18 补上的，原因是发现 `domain/messages.ts` 的"回复"**只写本地库**：
     * 工具文案说"回复一条 HR 消息"，平台上却什么都没发生。契约里缺这一格，领域层就只能空跑。
     */
    reply?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
      text: string,
    ): Promise<ActionResult>
    /**
     * 读收件箱（HR 消息）。列表页就能拿到"有没有人回复"，
     * 不必逐个打开会话 —— 见 BossHunter 的"状态节点反推法"。
     */
    readInbox?(page: PageLike): Promise<RawInboxMessage[]>
    /** 探测某个岗位当前的接触阶段（已读/已回复/约面）。 */
    detectStage?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
    ): Promise<ContactStage | null>
  }
}

/** 收件箱里的一条原始消息（只含标量，§4.3 P7）。 */
export interface RawInboxMessage {
  /** 会话内标识（平台自己的，用于去重）。 */
  conversationId: string
  /** HR 显示名。 */
  hrName: string
  company: string
  /** 最后一条消息的文本。 */
  lastMessage: string
  direction: 'hr' | 'me'
  /** 最后一条消息是否未读。 */
  unread: boolean
  at?: string | null
  /** 平台内岗位 id（能从会话反查到岗位时填）。 */
  platformJobId?: string
}
