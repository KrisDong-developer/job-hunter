/**
 * crawl 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { CoreField, CrawlState, HealthState } from '../enums/crawl.js'
import type { CrawlFailureCode } from '../enums/error.js'

/** `/health` 的响应体（客户端与诊断共用）。 */
export interface HealthDto {
  ok: boolean
  name: string
  version: string
  phase: string
  routePrefix: string
  hostUptimeMs: number
  /** P1：数据层是否已就绪。sqlite 打不开时这里会是 false，而不是整个插件不挂载。 */
  dataReady: boolean
  /** 数据文件路径（便于诊断“我的数据在哪”）。 */
  dataPath: string | null
  jobCount: number
  companyCount: number
  pendingRepairCount: number
  lastCrawl: CrawlRunDto | null
  adapters: AdapterHealthDto[]
  /** 打不开数据库时的可读原因。 */
  dataError: string | null
  /**
   * P5：是否处于**离线模式**（`DSH_JOB_HUNTER_NO_NETWORK=1`）。
   *
   * 界面必须把这件事显式说出来 —— 否则"点了抓取没反应"会看起来像 bug，
   * 而实际上那是为「自动化测试绝不访问真实招聘站」而设的开关。
   */
  offline: boolean
  /**
   * P5：模型工具的注册结果。
   *
   * 暴露它是为了"工具静默少了一个"这类问题能被一眼看到 ——
   * 实测就是靠它发现插件版 `job_list` 与宿主自带的同名工具撞车、压根没注册上。
   */
  tools: {
    registered: string[]
    failed: Array<{ name: string; reason: string }>
    conflicts: string[]
  } | null
}

/** 一次抓取的运行记录（§7 `crawl_run`）。 */
export interface CrawlRunDto {
  id: number
  platformId: string
  planId: number | null
  startedAt: string
  endedAt: string | null
  state: CrawlState
  pages: number
  found: number
  inserted: number
  updated: number
  skipped: number
  quarantined: number
  /** 失败码。取值域见 `CRAWL_FAILURE_CODES`（`text/error-text.ts` 按它翻译成人话）。 */
  errorCode: CrawlFailureCode | null
  errorMsg: string | null
  /** SR-28/29：触发原因（schedule / manual / catch-up）。 */
  reason: string | null
  /** SR-17/29：跳过原因（枚举键）。只有"到点了但没跑"才写。 */
  skipReason: string | null
}

/** 一个适配器的健康快照（§4.2.3 + §4.2.4 的逐字段计数）。 */
export interface AdapterHealthDto {
  platformId: string
  health: HealthState
  failStreak: number
  lastOkAt: string | null
  /** 每个核心字段的连续缺失次数与命中统计。 */
  fields: FieldHealthDto[]
  /** 处于降级/失效时的可读原因。 */
  reason: string | null
}

export interface FieldHealthDto {
  field: CoreField
  consecutiveMiss: number
  missTotal: number
  hitTotal: number
  lastMissAt: string | null
  lastHitAt: string | null
}

/** 一次抓取的执行结果摘要（`crawl:fixture` 与后续 HTTP 路由共用）。 */
export interface CrawlSummaryDto {
  run: CrawlRunDto
  /** 被字段断言拦下、进了 `pending_repair` 的记录数。 */
  quarantined: number
  /** 本次各核心字段的命中情况（是否整页都缺该字段）。 */
  fieldPresence: Array<{ field: CoreField; records: number; present: number }>
  /** 本次是否触发了降级（含原因）。 */
  degraded: { platformId: string; reasons: string[] } | null
}

/** `GET /crawl/status`。 */
export interface CrawlStatusDto {
  /** 是否有抓取正在跑。 */
  busy: boolean
  /** 被降级/失效暂停写入的平台。 */
  paused: string[]
  adapters: AdapterHealthDto[]
  recentRuns: CrawlRunDto[]
}

/** `GET /scheduler/status` 的一次运行摘要（SR-28 的小表）。 */
export interface RecentRunDto extends CrawlRunDto {
  /** 触发原因：定时 / 人工 / 补跑。 */
  reason: string | null
  /** 跳过原因（没真跑时才有）。 */
  skipReason: string | null
}

/**
 * 量级快照（批次 5）。
 *
 * 回答的是逐字段健康**回答不了**的问题：字段都好、`state='ok'`，
 * 但条目数比这个平台的常态低了一个数量级。
 */
export interface YieldSnapshotDto {
  /** 历史中位数（只取 `state='ok'` 的轮次）。`null` = 样本不足，不猜。 */
  baseline: number | null
  /** 用于算基线的样本轮数。 */
  samples: number
  /** 最近一轮的 `found`。 */
  lastFound: number | null
  level: 'insufficient' | 'ok' | 'dropped'
}
