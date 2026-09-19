/**
 * 客户端侧独有的形状：请求体、宿主返回但尚未进 shared 的 DTO。
 * 能从 `shared/dto.js`、`shared/resume.js` 取到的类型**不在这里**再放一份。
 */
import type { CampusApplicationDto, PlanPostProcess, PlanSchedule, RetentionPolicy } from '../../shared/dto.js'
import type { CampusBatch, ContactStage, JobFlagType, JobState } from '../../shared/enums.js'
import type { ResumeDto, ResumeIssue } from '../../shared/resume.js'

export interface JobListParams {
  q?: string
  /** 城市数组：命中任意一个即可。 */
  cities?: string[]
  city?: string
  state?: string
  minSalary?: number | null
  /** 经验要求多选：命中任意一个即可（取值来自 `fetchJobFacets`）。 */
  expReqs?: string[]
  /** 学历要求多选：同上。 */
  eduReqs?: string[]
  /** 屏蔽这些标注类型的岗位（传出 `excludeFlags`，黑白名单只有这里的类型）。 */
  excludeFlags?: JobFlagType[]
  /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
  groupDuplicates?: boolean
  /**
   * 「只看新增」：只返回**首次见到**时间 ≥ 该 ISO 时刻的岗位。
   * 界面按时间窗（近 24 小时 / 3 天 / 7 天）算好再传，口径与首屏「今日新增」一致。
   */
  firstSeenSince?: string
  orderBy?: string
  descending?: boolean
  page?: number
  pageSize?: number
}

/** 方案写入体。**只有显式给出的键**才会被发出去 —— 缺的键由宿主沿用现值。 */
export interface PlanWriteInput {
  name?: string
  platforms?: string[]
  /** 多关键词（逐个采集）。空数组 = 清空（回到单关键词/不限的老形态）。 */
  keywords?: string[]
  /** 每平台的覆盖项（批次 3，稀疏）。`maxPages: null` = 用方案级页数。 */
  platformOverrides?: Record<string, { enabled?: boolean; maxPages?: number | null }>
  criteria?: Record<string, string>
  schedule?: Partial<PlanSchedule>
  enabled?: boolean
  postProcess?: Partial<PlanPostProcess>
}

/** SR-41：一个筛选维度的声明（界面据此渲染；不支持的**禁用而非隐藏**）。 */
export interface CriteriaDimensionDto {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
  max: number | null
  hint: string
  supported: boolean
  disabledReason: string | null
  numeric: boolean
}

export interface CriteriaDimensionsDto {
  items: CriteriaDimensionDto[]
  platforms: string[]
  available: Array<{ id: string; displayName: string }>
}

/** SR-43：重复提示（只提示，不合并）。 */
export interface PlanDuplicateDto {
  planId: number
  name: string
  reason: string
}

/** SR-45：校验结果。界面保存前先问一次，与工具/HTTP 是同一份校验。 */
export interface PlanValidationDto {
  name: string
  platforms: string[]
  criteria: Record<string, string>
  schedule: PlanSchedule
  enabled: boolean
  postProcess: PlanPostProcess
  duplicates: PlanDuplicateDto[]
  /** 非致命但必须让用户知道的事（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
  notices: string[]
  dimensions: CriteriaDimensionDto[]
}

/** `confirm-action` 待办交回的意图：宿主不重放正文，只给"该回哪个上下文重新发起"。 */
export interface ConfirmActionIntentDto {
  action: string
  actor: string
  target: Record<string, number | string>
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
   * 浏览器运行期设置（资源设置，不是闸门配置，模型也可改）。
   * 宿主那边还有 `engine` / `stealthInit` 两个键，界面目前不用，所以不在这里声明。
   */
  browser: {
    idleCloseMinutes: number
    /** 每轮采集结束后就关掉采集浏览器（打开时 `idleCloseMinutes` 被它接管）。 */
    closeAfterRun: boolean
  }
  /** 采集运行期设置（单轮预算）。资源/节奏设置，模型不可改。 */
  crawl: {
    /** 一轮采集（一个方案的一次运行，含多关键词与详情补抓）最多多少分钟。 */
    roundBudgetMinutes: number
  }
  /** 数据保留策略（§18）。资源设置，模型不可改。 */
  retention: RetentionPolicy
  derived: {
    purposes: Array<{ purpose: string; label: string; enabled: boolean }>
    modelEditable: string[]
    modelForbidden: string[]
    /**
     * 出厂默认值（由宿主下发，客户端不另写一份）。
     * 界面用它填问号说明里的"默认多少"，以及发送时段为空（不限）时输入框显示什么。
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

export interface ResumeDetailDto extends ResumeDto {
  issues: ResumeIssue[]
}

export interface DedupGroupDto {
  id: number
  primaryJobId: number | null
  basis: string
  score: number
  createdAt: string
  members: Array<{
    id: number
    platformId: string
    /** 平台显示名（服务端 JOIN 出来的；平台被卸载时为 null，界面退回显示 id）。 */
    platformName: string | null
    title: string
    companyName: string | null
    city: string
    salaryRaw: string
    sourceUrl: string
    state: JobState
    isPrimary: boolean
  }>
}

/** 全库去重复核的结果（批次 4）。 */
export interface DedupSweepResultDto {
  /** 真的送去判定的岗位数（跳过已分组、没公司名的）。 */
  scanned: number
  /** 已经在某个分组里、这一轮没再判的岗位数。 */
  skippedGrouped: number
  merged: number
  newGroups: number
  candidates: number
  groups: number
  /** 复核之后的分组列表（界面直接重渲染，不用再请求一次）。 */
  items: DedupGroupDto[]
}

/** 人工标记接触态的结果。低危（只写本地库、不碰平台）。 */
export interface ContactStageUpdateDto {
  ok: boolean
  contactStage: ContactStage
  greetingId: number
  stageAt: string
  repliedAt: string | null
  /** 改之前是什么 —— 界面据此显示"从 X → Y"。 */
  previousStage: ContactStage
}

export interface CampusWindowsDto {
  items: CampusApplicationDto[]
  windows: Array<{ batch: CampusBatch; count: number; openCount: number; nextCloseAt: string | null }>
}

