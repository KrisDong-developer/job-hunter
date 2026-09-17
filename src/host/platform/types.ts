/**
 * 采集层契约（§4.2.2）。
 *
 * **P1 实现的子集**：`criteria.buildSearchUrl` / `crawl.*` / `guard.detectBlock`。
 * 协议里其余部分（`criteria.discover` 动态发现、`detail.extract` 详情页、`actions.*` 高危动作、
 * `auth.*` 登录态、`guard.selfTest`）在 P2~P5 逐个补上 —— 这里**不放假实现**，
 * 缺什么就明确是可选的、还没做。
 */
import type { BlockKind, CoreField, HealthState } from '../../shared/enums.js'

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
}

/** 搜索条件 —— 平台无关的键值对。 */
export interface SearchCriteria {
  keyword?: string
  city?: string
  page?: number
  /** 平台特有的补充参数（来自方案配置）。 */
  extra?: Record<string, string>
}

/** 运行期健康自检结果。 */
export interface HealthResult {
  ok: boolean
  state: HealthState
  detail?: string
}

export interface AdapterCapabilities {
  searchWithoutLogin: boolean
  supportsAttachment: boolean
  supportsReadReceipt: boolean
  supportsInbox: boolean
  supportsGreeting: boolean
  fieldCompleteness: 'high' | 'medium' | 'low'
  antiBot: 'low' | 'medium' | 'high'
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
   * @returns 等到返回 true；超时返回 false（调用方自行决定降级）
   */
  waitForSelector?(selector: string, timeoutMs: number): Promise<boolean>
}

/** 采集会话的页面来源。浏览器实现与夹具实现都满足它。 */
export interface PageSource {
  acquire(): Promise<PageLike>
  release(page: PageLike): Promise<void>
}

export interface SiteAdapter {
  id: string
  displayName: string
  capabilities: AdapterCapabilities
  /** 本适配器声明的必需字段（§4.2.4）。任一连续缺失即可能触发降级。 */
  requiredFields: readonly CoreField[]

  criteria: {
    /** URL 编码路径 —— 首选，比 DOM 回填稳健得多，也少触发风控（ADR-9）。 */
    buildSearchUrl(criteria: SearchCriteria): string | null
  }

  /**
   * 登录态（§4.2.2 的 `auth`，P3 落地）。
   *
   * `isLoggedIn` 只回答一个问题：**当前页面会不会被登录墙挡住**。
   * 不声明 auth 的适配器表示"不需要登录"，登录引导会明确报错而不是假装成功。
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
   */
  actions?: {
    /** 打招呼。返回 `ok:false` 时调用方按失败处理，不重试。 */
    sayHello?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
      text: string,
    ): Promise<{ ok: boolean; message?: string }>
    /** 投递简历（含附件）。P6/P7 实现。 */
    sendResume?(
      page: PageLike,
      job: { title: string; company: string; sourceUrl: string },
      filePath: string | null,
    ): Promise<{ ok: boolean; message?: string }>
  }
}
