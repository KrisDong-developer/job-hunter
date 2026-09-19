

import type { RetentionPolicy } from './storage.js'

/**
 * settings 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
// 适配器配置覆盖（J2 / ADAPTERS.md §4）
/**
 * 一个平台的适配器配置：**代码默认 + DB 覆盖 = 实际生效**。
 *
 * 界面必须能同时看到三层，否则"改了没生效"无法自查：
 * 只给生效值 → 不知道哪些是覆盖来的；只给覆盖 → 不知道默认是什么。
 */
export interface AdapterConfigDto {
  platformId: string
  displayName: string
  /** DB 里那份覆盖；`null` = 从没写过（一切走代码默认）。 */
  override: unknown
  /** 代码默认（`DEFAULT_*_CONFIG`）。 */
  defaults: unknown
  /** 合并后的实际生效值（适配器此刻正在用的那一份）。 */
  effective: unknown
  /** 覆盖占用的大小（字符数）与字段数，用于"这东西是不是长得不正常"。 */
  overrideKeys: string[]
}

export interface AuditRecordDto {
  id: number
  at: string
  actor: string
  action: string
  target: Record<string, unknown>
  detail: Record<string, unknown>
  result: string
  reason: string | null
  approval: unknown
  durationMs: number | null
}

export interface LlmCallDto {
  id: number
  at: string
  purpose: string
  provider: string | null
  model: string | null
  fields: string[]
  promptTokens: number
  completionTokens: number
  ref: Record<string, unknown>
  ok: boolean
  errorCode: string | null
  durationMs: number
}

export interface SettingsDto {
  ai: { enabled: boolean; purposes: Record<string, boolean> }
  guard: {
    levels: { l3Greeting: boolean; l4Application: boolean; l4Reply: boolean }
    dailyLimits: { greeting: number; application: number; reply: number }
    cooldownMinutes: number
    batchLimit: number
    requireApproval: boolean
    auditEnabled: boolean
    /** 发送时间窗口，`'HH:MM-HH:MM'`（本地时间，支持跨午夜）；空串 = 不限。 */
    sendWindow: string
    /** 随机休息日概率（0–1）。 */
    dayOffProbability: number
  }
  /**
   * 浏览器运行期设置（资源设置，**不是**闸门配置，模型也可改）。
   *
   * 声明**宿主实际下发的全部键**（含 `engine` / `stealthInit`）：DTO 是响应形状的
   * 唯一出处，界面用不到的键也应该在这里，否则宿主加一个键、DTO 悄悄少一个键，
   * 两边就再也对不上了（宿主那边的 `SettingsSnapshot` 直接 extends 本类型）。
   */
  browser: {
    idleCloseMinutes: number
    /** 每轮采集结束后就关掉采集浏览器（打开时 `idleCloseMinutes` 被它接管）。 */
    closeAfterRun: boolean
    /** 引擎偏好（D-17a）：`auto` = 优先 patchright，装不上退 playwright-core。 */
    engine: string
    /** 是否注入 stealth 脚本（D-17a）。 */
    stealthInit: boolean
  }
  /** 采集运行期设置（单轮预算）。资源/节奏设置，**不是**闸门配置，模型不可改。 */
  crawl: {
    /** 一轮采集（一个方案的一次运行，含多关键词与详情补抓）最多多少分钟。 */
    roundBudgetMinutes: number
  }
  /**
   * 数据保留策略（§18 / §15 的「保留」一栏）。同样是资源设置，**不是**闸门。
   *
   * 与 `guard` 分开而不是塞进去：额度/冷却/审批是"能不能发出去"，
   * 保留期是"留多久"—— 混在一起会让"模型能不能改"这件事变得含糊
   * （模型的禁止项清单里有额度，但没有保留期）。
   */
  retention: RetentionPolicy
  derived: {
    purposes: Array<{ purpose: string; label: string; enabled: boolean }>
    modelEditable: string[]
    modelForbidden: string[]
    /**
     * 出厂默认值。
     *
     * 为什么由宿主下发而不是客户端写死：默认值的事实来源是宿主的
     * `DEFAULT_GUARD_CONFIG` 与 `AI_PURPOSE_DEFAULT_ENABLED`，客户端再抄一份迟早会漂移
     * （本项目已经在"同名规则各写一份"上吃过亏）。界面只拿它做两件事：
     * 问号说明里的"默认是多少"，以及发送时段被清空（不限）后输入框该显示什么。
     */
    defaults: {
      purposes: Record<string, boolean>
      guard: {
        dailyLimits: { greeting: number; application: number; reply: number }
        cooldownMinutes: number
        batchLimit: number
        sendWindow: string
        dayOffProbability: number
      }
      /** 保留期的出厂默认（"恢复默认"按钮用它）。 */
      retention: RetentionPolicy
    }
  }
}
