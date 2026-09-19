/**
 * 只读投影：**store / 适配器状态 → 对外 DTO**。
 *
 * ## 为什么要单独一个模块
 *
 * `health()` / `crawlStatus()` / `platforms()` / `loginStatuses()` 做的是同一件事：
 * 把"库里现在是什么样"翻译成界面能吃的形状。此前它们各自摊在装配点上，
 * 于是同一段映射写了三遍（适配器健康快照）、同一个默认值字面量写了三遍
 * （"这个平台还没登记过账号 / 还没查过健康"）。
 *
 * 三遍的代价不是啰嗦，而是**加一个字段要改三处**：漏掉一处不会报错，
 * 只会让三个入口对同一份数据给出不同说法（`/health` 说它没问题、
 * `/platforms` 不说，或者反过来）—— 这种不一致排查起来极费时间。
 *
 * 所以这里的原则是：**同一份事实只映射一次**，谁需要谁来调。
 * 投影不做任何判定（判定在 `gate.ts`），也不改任何状态。
 */
import { PHASE, PLUGIN_ID, ROUTE_PREFIX } from '../../shared/config/plugin.js'
import type { AdapterHealthDto, CrawlStatusDto, FieldHealthDto, HealthDto } from '../../shared/contract/dto/crawl.js'
import type { SchedulerStatusDto } from '../../shared/contract/dto/plan.js'
import type { LoginStatusDto, PlatformOverviewDto } from '../../shared/contract/dto/platform.js'
import type { HealthState } from '../../shared/contract/enums/crawl.js'
import { readAdapterHealth } from '../platform/health.js'
import { readPlatformRiskPause } from '../platform/risk-pause.js'
import type { AdapterRegistry } from '../platform/registry.js'
import { readYieldSnapshot } from '../platform/yield-baseline.js'
import { adapterImplementationOf } from '../platform/types.js'
import { toAccountDto, type AccountStateRecord, type LoginFlow, type SessionService } from '../platform/session.js'
import type { PlatformGate } from '../scheduler/index.js'
import type { Store } from '../store/store.js'
import type { ToolRegistrationReport } from '../tools/types.js'
import { isOfflineMode } from '../util/offline.js'
import type { Clock } from '../util/time.js'
import { cooldownUntilOf, crawlQuotaOf } from './gate.js'

/** 健康快照的**原始**形状（未加 `platformId`）。 */
export interface AdapterHealthSnapshot {
  health: HealthState
  failStreak: number
  lastOkAt: string | null
  reason: string | null
  fields: FieldHealthDto[]
}

/**
 * 没查过登录态时的默认值（`account_state` 里还没有这一行）。
 *
 * 注意它不是"未登录"的判断依据 —— 判断在 `gate.ts`（"从没检查过"不算未登录，
 * 否则全新安装会因为空的 account_state 永远不跑）。
 */
function unknownAccountOf(platformId: string): AccountStateRecord {
  return {
    platformId,
    loggedIn: false,
    hiddenFromCurrentEmployer: null,
    lastCheckAt: null,
    hint: null,
    updatedAt: null,
  }
}

/**
 * 一个平台的健康快照。
 *
 * 数据层未就绪时给"健康"默认值 —— 这不是粉饰：那一页整页都处于"数据层未就绪"，
 * 由一个顶层标记说明（`/health` 的 `dataReady`、平台矩阵的 `blocked: null`），
 * 而不是让每个平台各自显示一个假的 broken。
 */
export function adapterSnapshotOf(store: Store | undefined, platformId: string): AdapterHealthSnapshot {
  if (store === undefined) return { health: 'healthy', failStreak: 0, lastOkAt: null, reason: null, fields: [] }
  return readAdapterHealth(store, platformId)
}

/** 全部注册适配器的健康快照（`/health` 与 `/crawl/status` 共用同一份）。 */
export function adapterHealthDtos(store: Store | undefined, registry: AdapterRegistry): AdapterHealthDto[] {
  return registry.list().map((adapter) => {
    const snapshot = adapterSnapshotOf(store, adapter.id)
    return {
      platformId: adapter.id,
      health: snapshot.health,
      failStreak: snapshot.failStreak,
      lastOkAt: snapshot.lastOkAt,
      fields: snapshot.fields,
      reason: snapshot.reason,
    }
  })
}

export interface HealthViewDeps {
  store: Store | undefined
  registry: AdapterRegistry
  version: string
  startedAt: number
  /** 数据层失败原因；就绪时传 null（未就绪分支会把它当 `dataError` 报出去）。 */
  dataError: string | null
  tools: ToolRegistrationReport | null
}

/** `GET /health` 的快照。数据层没就绪时也安全返回（如实说没就绪，而不是不给数据）。 */
export function buildHealth(deps: HealthViewDeps): HealthDto {
  const opened = deps.store
  const base = {
    ok: true,
    name: PLUGIN_ID,
    version: deps.version,
    phase: PHASE,
    routePrefix: ROUTE_PREFIX,
    hostUptimeMs: Date.now() - deps.startedAt,
  }

  if (opened === undefined) {
    return {
      ...base,
      dataReady: false,
      dataPath: null,
      jobCount: 0,
      companyCount: 0,
      pendingRepairCount: 0,
      lastCrawl: null,
      adapters: [],
      dataError: deps.dataError ?? '数据层尚未就绪',
      offline: isOfflineMode(),
      tools: deps.tools,
    }
  }

  return {
    ...base,
    dataReady: true,
    dataPath: opened.path,
    jobCount: opened.job.count(),
    companyCount: opened.company.count(),
    pendingRepairCount: opened.repair.countPending(),
    lastCrawl: opened.crawlRun.latest() ?? null,
    adapters: adapterHealthDtos(opened, deps.registry),
    dataError: null,
    offline: isOfflineMode(),
    tools: deps.tools,
  }
}

export interface CrawlStatusViewDeps {
  store: Store | undefined
  registry: AdapterRegistry
  /** 平台锁是否被持有（装配点知道，这里不猜）。 */
  busy: boolean
}

export function buildCrawlStatus(deps: CrawlStatusViewDeps): CrawlStatusDto {
  const adapters = adapterHealthDtos(deps.store, deps.registry)
  return {
    busy: deps.busy,
    paused: adapters.filter((adapter) => adapter.health !== 'healthy').map((adapter) => adapter.platformId),
    adapters,
    recentRuns: deps.store?.crawlRun.list(10) ?? [],
  }
}

export interface PlatformOverviewDeps {
  store: Store | undefined
  registry: AdapterRegistry
  /** 登录态服务；数据层未就绪时可能还不存在。 */
  sessionOf: () => SessionService | undefined
  /** 登录引导流程；同上（它是数据层就绪之后才建的）。 */
  loginFlowOf: () => LoginFlow | undefined
  /** 平台门 —— 矩阵的「今天能跑」那一格**必须**是它的返回值，不能另写一套判定。 */
  gate: PlatformGate
  clock: Clock
}

/** 平台总览矩阵：一屏看完每个平台"是什么"与"现在能不能跑、为什么不能"。 */
export function buildPlatforms(deps: PlatformOverviewDeps): PlatformOverviewDto[] {
  const opened = deps.store
  const session = deps.sessionOf()
  const loginFlow = deps.loginFlowOf()

  return deps.registry.list().map((adapter) => {
    const record = opened?.platform.get(adapter.id)
    const snapshot = adapterSnapshotOf(opened, adapter.id)
    const account = session?.status(adapter.id) ?? unknownAccountOf(adapter.id)
    const login = loginFlow?.status(adapter.id)
    // 批次 5：平台总览矩阵要的"横向可比"事实。三处都与调度判定**共用同一份算法**
    // （`gate` / `crawlQuotaOf` / `cooldownUntilOf`）——
    // 矩阵写着"可以"、到点却被门挡住，是比不做矩阵更糟的一件事。
    const pause = opened === undefined ? { paused: false, reason: null } : readPlatformRiskPause(opened, adapter.id)
    const quota = crawlQuotaOf(opened, adapter.id, deps.clock)
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      enabled: record?.enabled ?? true,
      capabilities: adapter.capabilities,
      // 实现度**派生**自实现对象本身 —— 手写一份必然与实际漂移
      implementation: adapterImplementationOf(adapter),
      maturity: adapter.maturity,
      // 页数上限是**平台事实**（适配器自己声明），与"我们实现了什么"无关。
      // 界面用它渲染「限制」列，避免用户填完才被校验拒绝。
      maxPages: adapter.maxPages,
      authRequirement: adapter.authRequirement,
      // 量级快照（批次 5）：查的是"字段都好、条目数却掉了"，与逐字段健康互补
      yield:
        opened === undefined
          ? { baseline: null, samples: 0, lastFound: null, level: 'insufficient' as const }
          : readYieldSnapshot(opened, adapter.id),
      health: snapshot.health,
      healthReason: snapshot.reason,
      failStreak: snapshot.failStreak,
      lastOkAt: snapshot.lastOkAt,
      account: toAccountDto(account),
      fields: snapshot.fields,
      login: { state: login?.state ?? 'idle', message: login?.message ?? null },
      // 批次 5 的平台总览矩阵（SR-46 的同批界面落点）：一屏看完每个平台
      // "是什么"与"现在能不能跑、为什么不能"。
      governance: {
        // 没有数据层时门还没法判（`gate` 会回 lease_lost，那是误导）——
        // 这时整页都处于"数据层未就绪"的状态，不假装有结论。
        blocked: opened === undefined ? null : deps.gate(adapter.id),
        todayRuns: quota.used,
        dailyLimit: quota.limit,
        riskPaused: pause.paused,
        riskReason: pause.reason,
        cooldownUntil: cooldownUntilOf(opened, adapter.id),
        lastRun: opened?.crawlRun.latest(adapter.id) ?? null,
      },
    }
  })
}

export interface LoginStatusViewDeps {
  registry: AdapterRegistry
  sessionOf: () => SessionService | undefined
  loginFlowOf: () => LoginFlow | undefined
}

export function buildLoginStatuses(deps: LoginStatusViewDeps): LoginStatusDto[] {
  const session = deps.sessionOf()
  const loginFlow = deps.loginFlowOf()
  return deps.registry.list().map((adapter) => {
    if (loginFlow !== undefined) return loginFlow.status(adapter.id)
    const account = session?.status(adapter.id) ?? unknownAccountOf(adapter.id)
    return {
      platformId: adapter.id,
      state: 'idle',
      message: null,
      startedAt: null,
      account: toAccountDto(account),
    }
  })
}

/**
 * 数据层未就绪时的调度状态。
 *
 * 如实报告，并且**每个字段都给一个真值** —— 少一个字段就是界面上一个 `undefined`，
 * 比空态更难查。
 */
export function unavailableSchedulerStatus(
  readOnlyReason: string,
  lease: SchedulerStatusDto['lease'],
): SchedulerStatusDto {
  return {
    scheduling: false,
    readOnly: true,
    readOnlyReason,
    armed: false,
    nextRunAt: null,
    lastRunAt: null,
    running: false,
    plans: [],
    lease,
    timezone: 'UTC',
    jitterMs: 0,
    paused: false,
    pausedReason: null,
    planStatus: [],
    triggers: [],
    recentRuns: [],
    refreshSuggested: false,
    refreshHint: null,
  }
}
