/**
 * 自排程器（§4.6 / C3：宿主没有 schedule 服务，全部自实现）。
 *
 * 五条不可让步的语义：
 *   1. **错过不猛跑** —— 启动时发现错过一轮，只生成一条「是否补跑」待办，
 *      等用户点。开机瞬间轰一遍积压是最容易被风控盯上的行为（C9）。
 *   2. **定时器必须可取消** —— 卸载/热重载不能留下幽灵定时器（C15）。
 *   3. **与手动触发共用同一把锁** —— 抓取本身走 `mutex`，「到点了」和「点一下」不会并行。
 *   4. **"没跑"必须带原因**（SR-17/26）—— 只报 `armed: true` 等于什么都没说：
 *      未登录的平台也会 `armed`，然后每天安静地什么都不做。
 *   5. **定时任务不发送任何东西**（D-5）—— 这里只做采集的准备与执行，不碰 guard 的高危动作。
 *
 * ## 触发器（D-19）
 *
 *   * **T1 窗口触发**（首选）：偏好时段内随机选点，窗口内最多一次（SR-1）；
 *   * **T2 在场触发**：打开面板时若 stale/cold 只**提示**，不自动跑（SR-2）；
 *   * **T3 人工触发**：立即运行 / 补跑，永远保留（SR-30 的例外）。
 */
import { ROUND_BUDGET_MS } from '../../shared/constants.js'
import type {
  CrawlSummaryDto,
  FreshnessDto,
  PlanDto,
  PlanScheduleStatusDto,
  SchedulerStatusDto,
  SkipReason,
  TriggerDecisionDto,
  WeeklyTriggerDto,
} from '../../shared/dto.js'
import type { PlanService } from '../domain/plans.js'
import type { EventBus } from '../http/sse.js'
import type { Store } from '../store/store.js'
import { activePlatformsOf, criteriaForPlatform } from '../store/repo/plans.js'
import { DomainError, messageOf } from '../util/errors.js'
import {
  allPlatformsRiskPaused,
  clearPlatformRiskPause,
  readPlatformRiskPause,
  setPlatformRiskPause,
} from '../platform/risk-pause.js'
import { detectTimezone, systemClock, type Clock } from '../util/time.js'
import {
  currentWindowStart,
  insideWindow,
  missedRun,
  nextRunAt,
  windowKeyOf,
  windowLengthMin,
} from './schedule.js'
import type { TimerPort } from './timer-port.js'

export type RunReason = 'schedule' | 'manual' | 'catch-up'

export interface SchedulerRunInput {
  planId: number
  platformId: string
  criteria: Record<string, string>
  reason: RunReason
  /**
   * SR-46：这一轮的**绝对**到点时刻（ISO）。
   *
   * 由调度器给（本轮开始时刻 + `ROUND_BUDGET_MS`），抓取侧据此在页与页之间收手。
   * 传**绝对时刻**而不是"还剩几分钟"：抓取中途可能耗掉任意长的时间，
   * 只有绝对时刻才保证"同一轮里每个平台看到的是同一个终点"。
   */
  deadlineAt?: string
}

export interface SchedulerLogger {
  info(message: string): void
  warn(message: string): void
}

/**
 * 一个平台当前能不能跑（SR-16：**每平台独立检查**）。
 *
 * 返回 `null` = 可以跑；返回原因 = 跳过并如实说明。
 * 刻意做成"注入一个判定函数"而不是在调度器里直接读 session/adapter：
 * 调度器不该知道"登录态"是怎么存的，它只该知道"现在能不能跑、不能的话为什么"。
 */
export type PlatformGate = (platformId: string, options?: PlatformGateOptions) => SkipReason | null

export interface PlatformGateOptions {
  /**
   * 越过「风控暂停」这一关（SR-21 的既有例外）。
   *
   * 只有**补跑**会置它：补跑是用户看到"错过了一轮"之后**显式点**的，
   * 属于人工确认的一种形式；而手动「立即采集」不置 —— 否则用户点一下
   * 就又去打风控了，"风控暂停"就成了一句空话。
   */
  ignoreRiskPause?: boolean
}

export interface SchedulerDeps {
  store: Store
  plans: PlanService
  /** 执行一次抓取。生产接 `runtime.crawl`（真浏览器），测试可换成夹具。 */
  run: (input: SchedulerRunInput) => Promise<CrawlSummaryDto>
  timer: TimerPort
  events: EventBus
  /** 是否允许调度（数据层就绪 且 持有租约）。 */
  canSchedule: () => boolean
  readOnlyReason: () => string | null
  leaseStatus: () => SchedulerStatusDto['lease']
  /** 每平台前置条件（登录态 / 健康 / 风控 / 离线闸门 / 配额）。缺省表示没有额外条件。 */
  platformGate?: PlatformGate
  clock?: Clock
  logger?: SchedulerLogger
}

export interface Scheduler {
  start(): void
  stop(): void
  status(): SchedulerStatusDto
  /** 用户显式触发（手动 / 补跑）。未持租约时拒绝执行。**暂停不影响它**（SR-30）。 */
  runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>
  /** 检查一次到期计划（定时器触发点；测试也直接用它）。 */
  tick(): Promise<void>
  /** B3/SR-30：全局一键暂停（**只停定时**）。 */
  setPaused(paused: boolean, reason?: string): void
  /** SR-21：人工确认恢复风控暂停。人工确认是唯一的恢复路径。 */
  resumeRisk(planId: number): void
}

/**
 * SR-20：退避曲线。15m → 1h → 4h，之后封顶 4h（同一天不再更密地试）。
 *
 * 输入必须是**某一层自己的**连续失败次数：平台冷却传 `platform.fail_streak`，
 * 方案退避传 `plan.fail_streak`。两者是不同的账，混用会让一层的失败替另一层受罚。
 */
export function backoffMsFor(failStreak: number): number {
  if (failStreak <= 0) return 0
  if (failStreak === 1) return 15 * 60 * 1000
  if (failStreak === 2) return 60 * 60 * 1000
  return 4 * 60 * 60 * 1000
}

/**
 * 单轮预算（SR-46）：一个方案的一次运行最多占用多久。
 *
 * 为什么需要它：多平台之后"一轮"会依次跑 N 个平台，而**平台总数是用户配的**。
 * 没有预算时，一轮的时长无上界 —— 一个卡住的页面就能把整轮（以及紧随其后的
 * 其它方案）拖住，`running` 一直为真，界面上永远显示"正在采集"。
 *
 * 两处收手（**不是同一件事，别合并**）：
 *   * 平台之间（下层机制）→ 还没开始的平台直接不开始，如实报 `round_budget`；
 *   * 平台之内（本模块只管把 `deadlineAt` 传下去）→ 抓取侧在页与页之间停，
 *     已解析到的记录照常入库。
 */
export interface RoundBudget {
  startedAtMs: number
  deadlineAtMs: number
}

/** 开一轮预算。`budgetMs` 只给测试与将来做可配时用 —— 缺省就是那个常量。 */
export function startRoundBudget(
  startedAtMs: number,
  budgetMs: number = ROUND_BUDGET_MS,
): RoundBudget {
  return { startedAtMs, deadlineAtMs: startedAtMs + Math.max(0, budgetMs) }
}

/** 到点了吗。**只在平台之间问** —— 平台内部由抓取侧自己问同一个终点。 */
export function budgetExhausted(budget: RoundBudget, nowMs: number): boolean {
  return nowMs >= budget.deadlineAtMs
}

/** 全局暂停存在 `setting` 表里（NFR-4：状态全部落 sqlite，重启后不变）。 */
const PAUSE_KEY = 'schedule-paused'
const PAUSE_SCOPE = 'global' as const

/** 跳过原因 → 人话（SR-17：界面显示人话，不显示枚举键）。 */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  not_logged_in: '平台未登录 —— 去「采集」页点登录',
  adapter_broken: '适配器已失效（连续失败达阈值）—— 需要人工修复选择器',
  risk_paused: '该平台被风控暂停 —— 需要人工确认才恢复',
  lease_lost: '本实例不持有租约（另一个实例在跑）—— 只读实例不抓取',
  offline_gate: '离线模式已开启（DSH_JOB_HUNTER_NO_NETWORK）—— 不发起真实访问',
  outside_window: '还没到偏好时段（或已错过，等下一轮）',
  quota_reached: '今天的抓取次数已达上限',
  another_run_active: '已经有一轮抓取在跑 —— 同时只允许一个',
  backoff: '上一轮失败了，正在退避等待',
  global_pause: '定时已被一键暂停 —— 手动「立即采集」仍然可用',
  plan_disabled: '方案已停用，或它的定时开关是关的',
  round_budget: '本轮已到时限（单轮预算用完）—— 剩下的平台留到下一轮',
}

/** SR-8：新鲜度阈值。随计划频率变：每天跑一次的计划 18 小时就算旧了。 */
export function freshThresholdsFor(plan: PlanDto): { freshHours: number; coldHours: number } {
  const weekdays = plan.schedule.weekdays.length === 0 ? 7 : plan.schedule.weekdays.length
  // 每周跑 N 天 → 相邻两轮的间隔约 7/N 天。阈值取间隔的一半与两倍。
  const intervalHours = (7 / Math.max(1, weekdays)) * 24
  const freshHours = Math.max(6, Math.round(intervalHours / 2))
  const coldHours = Math.max(freshHours * 2, Math.round(intervalHours * 2))
  return { freshHours, coldHours }
}

/** SR-8：算新鲜度。**从未成功过 = cold**（"没数据"绝不等于"是新鲜的"）。 */
export function freshnessOf(plan: PlanDto, now: Date): FreshnessDto {
  const thresholds = freshThresholdsFor(plan)
  if (plan.lastSuccessAt === null) {
    return { level: 'cold', hoursSinceSuccess: null, thresholds }
  }
  const at = new Date(plan.lastSuccessAt)
  if (Number.isNaN(at.getTime())) {
    return { level: 'cold', hoursSinceSuccess: null, thresholds }
  }
  const hours = (now.getTime() - at.getTime()) / (60 * 60 * 1000)
  const level = hours < thresholds.freshHours ? 'fresh' : hours < thresholds.coldHours ? 'stale' : 'cold'
  return { level, hoursSinceSuccess: Math.round(hours * 10) / 10, thresholds }
}

/** 一个平台这一次的结论。`reason === null` 表示它可以跑（SR-18）。 */
export interface PlatformDecision {
  platformId: string
  reason: SkipReason | null
  message: string | null
}

/**
 * 判定与执行之间共享的一小块状态（"为什么没跑"要落库，也要能被 status() 读到）。
 *
 * `platforms` 是 SR-18 的落地点：**每个平台各有各的结论**。
 * 只有方案级原因（停用/全局暂停/租约/窗口）时它才是空数组 ——
 * 那种情况下确实没有"哪个平台"的问题。
 */
interface Decision {
  kind: 'run' | 'skip' | 'wait'
  reason: SkipReason | null
  platforms: PlatformDecision[]
}

/** 一次 run 里单个平台的结果（成败都由**这个平台自己**的账来记）。 */
interface PlatformOutcome {
  platformId: string
  summary: CrawlSummaryDto | null
  error: unknown
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const clock = deps.clock ?? systemClock

  let started = false
  let cancel: (() => void) | null = null
  let armedAtMs: number | null = null
  let running = false
  let warnedReadOnly = false
  /** 每个方案最后一次判定（SR-26）。内存态 + 落库的 crawl_run 双份：前者给首屏，后者给历史。 */
  const lastDecision = new Map<number, TriggerDecisionDto>()

  /**
   * 每方案 × 每平台 的最后一次判定（SR-18/26）。
   *
   * 多平台之后"为什么没跑"不再是一个原因：同一个方案里，猎聘可能未登录、
   * 51job 在冷却、智联正常跑了。只留一个方案级原因就是在丢信息 ——
   * 而"哪个平台为什么没跑"恰恰是用户要看的（也是 SR-18 的界面侧落点）。
   */
  const lastPlatformDecision = new Map<string, TriggerDecisionDto>()
  const platformDecisionKey = (planId: number, platformId: string): string =>
    `${String(planId)}::${platformId}`

  const now = (): Date => new Date(clock())

  /**
   * 读全局暂停开关。
   *
   * 写入的是 `{ paused, reason }`（要记住"谁暂停的、为什么"），
   * 所以读取**不能**拿它跟 `true` 直接比 —— 那会让暂停看起来生效了（`armed` 是 false）
   * 而实际每次判定都当没暂停，于是定时照跑。这个 bug 真的写出来过，被行为测试抓住。
   * 裸 `true` 也认，是为了兼容手工写过这个键的库。
   */
  const readPause = (): { paused: boolean; reason: string | null } => {
    const stored = deps.store.setting.get<unknown>(PAUSE_KEY, PAUSE_SCOPE)
    if (stored === true) return { paused: true, reason: null }
    if (stored !== null && typeof stored === 'object') {
      const record = stored as { paused?: unknown; reason?: unknown }
      return {
        paused: record.paused === true,
        reason: typeof record.reason === 'string' && record.reason !== '' ? record.reason : null,
      }
    }
    return { paused: false, reason: null }
  }

  const isPaused = (): boolean => readPause().paused
  const pausedReason = (): string | null => (isPaused() ? (readPause().reason ?? '定时已被一键暂停') : null)

  /**
   * SR-20/23：**每平台独立冷却**。
   *
   * 为什么计划级的退避不够：一个方案的退避是"这一轮别再来"，
   * 但风控是**按平台**算的 —— 51job 被限流不该让另一个平台的方案跟着停，
   * 反过来，51job 被限流之后**任何**方案去碰它都应该被拦住。
   *
   * ⚠️ `platformFailStreak` **必须是该平台自己的**连续失败次数
   * （`platform.fail_streak`，由 `crawl.ts` 的 `recordRunFailure` 维护）。
   * 曾经这里传的是 `plan.failStreak` —— 于是 A 平台的失败会把 B 平台的
   * 冷却直接推到 4 小时档（`backoffMsFor(3)`），第一次失败就吃满惩罚。
   *
   * 存在 `setting` 表（`scope=platform` / `key=cooldown-until`）而不是加列：
   * 它是个**短命**的运行时状态（几小时），不值得为它做一次 schema 迁移。
   * 读它的地方在 `runtime.platformGate`（判定统一在那一边），这里只负责写与清。
   */
  const recordPlatformFailure = (platformId: string, platformFailStreak: number): void => {
    const until = new Date(clock()).getTime() + backoffMsFor(platformFailStreak)
    deps.store.setting.set(
      'cooldown-until',
      'platform',
      platformId,
      { until: new Date(until).toISOString() },
      clock(),
    )
  }

  const clearPlatformCooldown = (platformId: string): void => {
    deps.store.setting.remove('cooldown-until', 'platform', platformId)
  }

  const enabledPlans = (): PlanDto[] =>
    deps.store.plan.list().filter((plan) => plan.enabled && plan.schedule.enabled)

  const planNext = (plan: PlanDto, from: Date): Date => nextRunAt(plan.schedule, from, plan.id)

  /**
   * 落最近一次判定（SR-26）。**方案级 + 平台级都记**。
   *
   * 平台级那份才是多平台下"为什么没跑"的真正载体（SR-18）：
   * 方案级只保留一个代表原因，供首屏一句话概览。
   */
  const record = (planId: number, decision: Decision, message: string | null): void => {
    const at = clock()
    if (decision.kind === 'run') {
      lastDecision.set(planId, { decision: 'ran', reason: null, message: null, at })
    } else if (decision.kind === 'wait') {
      lastDecision.set(planId, { decision: 'waiting', reason: null, message: null, at })
    } else {
      lastDecision.set(planId, {
        decision: 'skipped',
        reason: decision.reason,
        message: message ?? (decision.reason === null ? null : SKIP_REASON_LABEL[decision.reason]),
        at,
      })
    }

    for (const platform of decision.platforms) {
      lastPlatformDecision.set(platformDecisionKey(planId, platform.platformId), {
        decision: platform.reason === null ? 'ran' : 'skipped',
        reason: platform.reason,
        message:
          platform.message ?? (platform.reason === null ? null : SKIP_REASON_LABEL[platform.reason]),
        at,
      })
    }
  }

  /**
   * 一个方案现在能不能跑（SR-3 / SR-16 / SR-21 / SR-30）。
   *
   * 判定顺序不是随意的：**越"根本"的原因越先报**。
   * 全局暂停先说全局；风控暂停说风控；租约说租约；然后才是"到没到点"。
   * 顺序反了会出现"还没到点"盖住了"你已被风控暂停"这种把用户带沟里的提示。
   */
  /**
   * 平台的**执行顺序**：最久没成功过的先跑（`last_ok_at` 升序，从没成功过的最优先）。
   *
   * 为什么需要它（批次 5）：窗口与每日预算是有限的，而固定按方案里的数组顺序跑，
   * 会让**前几个平台永远跑得完、最后几个系统性跑不到**。用户看不出这是 bug ——
   * 他只会觉得"拉勾怎么老没数据"，而数据里那几次 `crawl_run` 也确实"没跑过"。
   *
   * 并列时保持方案里的原顺序（`sort` 稳定）：用户改了平台顺序仍能预期第一轮怎么跑，
   * 只有"上次成功时间"真的不同时才重排。
   */
  const executionOrderOf = (platformIds: readonly string[]): string[] =>
    [...platformIds].sort((left, right) => {
      const a = deps.store.platform.get(left)?.lastOkAt ?? ''
      const b = deps.store.platform.get(right)?.lastOkAt ?? ''
      if (a === b) return 0
      if (a === '') return -1
      if (b === '') return 1
      return a < b ? -1 : 1
    })

  const decide = (plan: PlanDto, at: Date, exceptReason?: RunReason): Decision => {
    const planLevel = (reason: SkipReason): Decision => ({ kind: 'skip', reason, platforms: [] })

    if (!plan.enabled || !plan.schedule.enabled) return planLevel('plan_disabled')
    if (exceptReason !== 'manual' && exceptReason !== 'catch-up') {
      if (isPaused()) return planLevel('global_pause')
    }
    if (!deps.canSchedule()) return planLevel('lease_lost')

    // 方案级退避保留：它表达的是"这一轮别再来了"（与平台冷却不同层的预算）。
    // 风控暂停**不在这里判** —— 它是平台级的，归 platformGate（SR-18/21）。
    const engine = deps.store.plan.engineState(plan.id)
    if (engine.backoffUntil !== null) {
      const until = new Date(engine.backoffUntil)
      if (!Number.isNaN(until.getTime()) && until.getTime() > at.getTime()) {
        return planLevel('backoff')
      }
    }

    if (exceptReason === undefined) {
      // **窗口外不跑**（SR-3）。手动/补跑不受窗口约束 —— 人工触发永远保留（SR-30/T3）。
      if (!insideWindow(plan.schedule, at)) return planLevel('outside_window')
    }

    // SR-18：**每个平台各自判**。任一平台不过门**不再连坐**整条方案 ——
    // 只有"一个都跑不了"才跳过，并把代表原因（第一个被挡住的平台）报上去。
    // 之前这里是「循环里任一 gate 非空即 return skip」，于是猎聘未登录会
    // 让健康的 51job / 智联一起停摆（而 ARCHITECTURE 把 SR-18 标为已达成）。
    //
    // 批次 3：只对**启用的**平台判定 —— 用户在一个方案里停掉的平台，不该再参与
    // "这条方案能不能跑"的判断（否则停掉一个未登录的平台仍然会挡住整条方案）。
    // 批次 5：顺序按**新鲜度**（最久没成功过的先跑），而不是方案里的数组顺序。
    const active = executionOrderOf(activePlatformsOf(plan))
    // 防御性：校验不允许"所有平台都停用"，但手工改过库的旧数据可能如此。
    // 那种方案永远不会抓任何东西，如实说成"已停用"比每天安静地什么都不做强。
    if (active.length === 0) return planLevel('plan_disabled')

    const ignoreRiskPause = exceptReason === 'catch-up'
    const platforms: PlatformDecision[] = active.map((platformId) => {
      const reason = deps.platformGate?.(platformId, { ignoreRiskPause }) ?? null
      return {
        platformId,
        reason,
        message: reason === null ? null : SKIP_REASON_LABEL[reason],
      }
    })
    const firstBlocked = platforms.find((platform) => platform.reason !== null)
    if (firstBlocked !== undefined && platforms.every((platform) => platform.reason !== null)) {
      return { kind: 'skip', reason: firstBlocked.reason, platforms }
    }

    return { kind: 'run', reason: null, platforms }
  }

  /** 重新武装定时器：永远只挂一个，指向最近的那个到期时刻。 */
  const arm = (): void => {
    cancel?.()
    cancel = null
    armedAtMs = null
    if (!started || !deps.canSchedule() || isPaused()) return

    let soonestMs: number | null = null
    let soonestPlan: PlanDto | null = null
    for (const plan of enabledPlans()) {
      if (plan.nextRunAt === null) continue
      const at = new Date(plan.nextRunAt).getTime()
      if (!Number.isFinite(at)) continue
      if (soonestMs === null || at < soonestMs) {
        soonestMs = at
        soonestPlan = plan
      }
    }
    if (soonestMs === null || soonestPlan === null) return

    const delay = Math.max(0, soonestMs - now().getTime())
    armedAtMs = soonestMs
    cancel = deps.timer.after(delay, () => {
      void tick()
    })
    deps.events.publish('schedule.armed', { at: new Date(soonestMs).toISOString(), planId: soonestPlan.id })
  }

  /**
   * 启动调度。**可重复调用**：不持租约时它只是记录只读并返回，
   * 等租约到手后再调一次就能真正武装起来。
   *
   * 「可重复」不是洁癖：实测踩到过 —— 上一个实例被强杀后租约文件还在，
   * 新实例启动时对方心跳还没过期，于是它进入只读；如果 start() 只认第一次，
   * 这个实例就**永远不会**接管调度，只能重启。
   */
  const start = (): void => {
    if (!deps.canSchedule()) {
      if (!warnedReadOnly) {
        deps.logger?.info(
          `[scheduler] 不启动调度：${deps.readOnlyReason() ?? '数据层未就绪'}（本实例只读）`,
        )
        warnedReadOnly = true
      }
      return
    }
    if (started) {
      // 暂停状态可能在 start 之后变过；每次调用都重算一次，保证幂等且反映最新开关
      refreshNextRuns(now())
      arm()
      return
    }
    started = true
    warnedReadOnly = false

    // 首次安装至少有一个方案，否则「到点自动跑」无从谈起
    deps.plans.ensureDefault()

    // 一次性搬运：旧版本的 `risk_paused` 是**方案级**字段（SR-21 的老落点）。
    // 升级后风控暂停归**平台级** —— 不搬的话，旧库里"已被风控暂停"的方案会
    // 静默恢复自动抓取（用户以为它还暂停着，那是最不能接受的一种静默）。
    // 搬完立刻清掉方案级字段，免得它以"真值"之外的第二种身份继续存在。
    for (const plan of deps.store.plan.list()) {
      const engine = deps.store.plan.engineState(plan.id)
      if (!engine.riskPaused) continue
      for (const platformId of plan.platforms) {
        if (readPlatformRiskPause(deps.store, platformId).paused) continue
        setPlatformRiskPause(
          deps.store,
          platformId,
          engine.riskReason ?? '升级前该方案处于风控暂停 —— 需人工确认后恢复',
          clock(),
        )
      }
      deps.store.plan.setEngine(plan.id, { riskPaused: false, riskReason: null })
      deps.logger?.info(
        `[scheduler] 方案「${plan.name}」的方案级风控暂停已搬到平台级（${plan.platforms.join('、')}）`,
      )
    }

    const current = now()
    refreshNextRuns(current)

    for (const plan of deps.store.plan.list()) {
      if (!plan.enabled || !plan.schedule.enabled) continue
      // SR-8/SR-10：错过的判定看 **last_success_at**（SR-7：失败不该被当成"跑过了"）
      const verdict = missedRun(plan.schedule, plan.lastSuccessAt, current, plan.id)
      if (!verdict.missed) continue
      const created = deps.store.todo.createOnce(
        {
          kind: 'catch-up',
          level: 'warn',
          title: `${plan.name} 错过了一轮抓取`,
          ref: String(plan.id),
          detail: {
            planId: plan.id,
            expectedAt: verdict.expectedAt?.toISOString() ?? null,
            lastSuccessAt: plan.lastSuccessAt,
            hint: '点「立即补跑」执行，或忽略它等下一轮。',
          },
        },
        clock(),
      )
      if (created !== null) {
        // 只生成待办，**绝不自动跑**（C9）
        deps.logger?.info(`[scheduler] ${plan.name} 有错过的轮次 → 已生成补跑待办（不自动执行）`)
      }
    }

    // SR-8：cold 欠账也要提示（不自动跑）。
    //
    // **但绝不打扰全新安装**（SR-24 / SR-33）：一个从没跑过的方案（没有 last_attempt_at、
    // 也没有 last_success_at）在数据上确实是 cold —— 可是刚装上就弹一条
    // "你的数据已经很久没更新了"是纯粹的骚扰。界面上的徽章照样显示"从未更新"（那是事实），
    // 只有"欠账提醒"这一条要求**先有过一次基线**。
    for (const plan of deps.store.plan.list()) {
      if (!plan.enabled || !plan.schedule.enabled) continue
      if (plan.lastAttemptAt === null && plan.lastSuccessAt === null) continue
      const freshness = freshnessOf(plan, current)
      if (freshness.level !== 'cold') continue
      const created = deps.store.todo.createOnce(
        {
          kind: 'catch-up',
          level: 'warn',
          title: `${plan.name} 的数据已经 ${String(freshness.hoursSinceSuccess ?? '很久')} 小时没更新了`,
          ref: String(plan.id),
          detail: {
            planId: plan.id,
            level: freshness.level,
            hoursSinceSuccess: freshness.hoursSinceSuccess,
            hint: '点「立即采集」刷新，或忽略它等下一个偏好时段。',
          },
        },
        clock(),
      )
      if (created !== null) {
        deps.logger?.info(`[scheduler] ${plan.name} 处于 cold（欠账）→ 已生成待办（不自动执行）`)
      }
    }

    arm()
  }

  /** 把每个启用方案的 `next_run_at` 重算到未来（SR-6：时钟跳变后**只重算，不补偿**）。 */
  const refreshNextRuns = (current: Date): void => {
    for (const plan of deps.store.plan.list()) {
      if (!plan.enabled || !plan.schedule.enabled) {
        deps.store.plan.setRunTimes(plan.id, { nextRunAt: null })
        continue
      }
      const existing = plan.nextRunAt === null ? null : new Date(plan.nextRunAt)
      // 已经指向未来且落在**同一个窗口**里就保留：否则定时器会跟着每次 status() 抖动。
      if (existing !== null && !Number.isNaN(existing.getTime()) && existing.getTime() > current.getTime()) {
        continue
      }
      deps.store.plan.setRunTimes(plan.id, { nextRunAt: planNext(plan, current).toISOString() })
    }
  }

  /**
   * 「这次不让做」类错误，**不是**「抓取失败」。
   *
   * 区分它们很重要：离线闸门、租约拒绝、配置非法都属于「动作被拒绝」，
   * 它们既不该被算进连续失败（否则跑几次离线测试就把方案推到风控暂停），
   * 也不该被包成一句 INTERNAL 500（用户会以为程序坏了，而真相是"这条路本来就不让走"）。
   */
  const isRefusal = (error: unknown): boolean => {
    const code = error instanceof DomainError ? error.code : null
    return (
      code === 'BLOCKED' ||
      code === 'CONFLICT' ||
      code === 'INVALID_INPUT' ||
      code === 'NOT_FOUND' ||
      code === 'DATA_UNAVAILABLE'
    )
  }

  /**
   * 收尾一次方案运行（SR-7/20/21/22/23）。
   *
   * ## 为什么吃的是"每个平台的结果"而不是"最后一个 summary + 第一个错误"
   *
   * 旧签名是 `finishPlanRun(plan, summary, error)`：`summary` 是循环里**最后一个
   * 成功的平台**留下的，`error` 是**第一个失败的平台**抛出的。于是
   * `code = summary?.run.errorCode` 极可能来自**另一个平台** ——
   * 甲平台弹了验证码（应当立刻风控暂停），乙平台随后成功，`code` 就变成乙的成功码，
   * **风控信号被静默丢掉**，只退避了事。单平台时这个错位永远看不到。
   *
   * ## 账怎么记
   *
   *   * **平台维度**：失败 → 该平台的冷却（用**它自己的** `fail_streak` 定档）；
   *     命中风控信号 → 平台级风控暂停 + urgent 待办（SR-21/22）。
   *   * **方案维度**：只要**有一个平台成功**就算这一轮成功（推进 `last_success_at`）；
   *     一个都没成功才推进方案退避。旧行为是"任一平台失败即整轮失败" ——
   *     那会让"51job 抓到 20 条、猎聘失败"的方案被界面报成"数据陈旧"。
   *
   * 「连续失败达阈值」这条**不在这里**重复处理：`crawl.ts` 的 `recordRunFailure`
   * 已经把它落成平台 `health=broken` + `adapter_broken` 待办，而 `adapter_broken`
   * 同样是"人工不介入就一直拦住"的语义。再叠一层 `risk_paused` 会对同一个事件
   * 产生两条 urgent 待办、两个重叠的跳过状态，还要在恢复时清两处 —— 净是负担。
   * 因此 **`risk_paused` 只表达"平台认出你了"**（验证码/登录墙/限流/配额）。
   */
  const finishPlanRun = (plan: PlanDto, outcomes: readonly PlatformOutcome[]): void => {
    const at = clock()
    // 被拒绝 ≠ 失败：离线闸门/租约/配置这类"动作被拒绝"不记账，
    // 否则跑几次离线测试就把平台推到暂停（既有语义，保留）。
    const accounting = outcomes.filter(
      (outcome) => !(outcome.error !== null && isRefusal(outcome.error)),
    )
    if (accounting.length === 0) return

    let anySuccess = false

    for (const outcome of accounting) {
      const failed =
        outcome.error !== null || (outcome.summary !== null && outcome.summary.run.state === 'failed')

      if (!failed) {
        anySuccess = true
        // SR-20：成功即清该平台的冷却，否则一次抖动会让它停一整天
        clearPlatformCooldown(outcome.platformId)
        continue
      }

      // ⚠️ 用**该平台自己的**错误码与连续失败次数（crawl.ts 已经记过账）
      const code = outcome.summary?.run.errorCode ?? null
      const platformFailStreak = deps.store.platform.get(outcome.platformId)?.failStreak ?? 1
      // SR-22：风控信号（验证码/登录墙/限流/平台配额耗尽）**单独识别**，一次即暂停
      const riskSignal =
        code === 'BLOCKED' ||
        code === 'NOT_LOGGED_IN' ||
        code === 'RISK' ||
        code === 'RATE_LIMITED' ||
        code === 'PLATFORM_QUOTA'

      if (!riskSignal) {
        recordPlatformFailure(outcome.platformId, platformFailStreak)
        deps.logger?.warn(
          `[scheduler] ${plan.name} / ${outcome.platformId} 失败（连续 ${String(platformFailStreak)} 次）` +
            ` → 该平台退避 ${String(backoffMsFor(platformFailStreak) / 60_000)} 分钟`,
        )
        continue
      }

      // SR-21：风控暂停挂**平台**上 —— 别的方案来碰它也该被拦住，
      // 而同一方案里的其它平台不受影响（SR-18）。
      setPlatformRiskPause(
        deps.store,
        outcome.platformId,
        `命中风控/登录墙信号（${code ?? '未知'}）—— 已暂停该平台，需人工确认后恢复`,
        at,
      )
      // 暂停期间冷却没有意义（门已经被挡住），留着只会在恢复后白等一次
      clearPlatformCooldown(outcome.platformId)
      deps.store.todo.createOnce(
        {
          kind: 'blocked',
          level: 'urgent',
          title: `${outcome.platformId} 已被风控暂停`,
          ref: outcome.platformId,
          detail: {
            planId: plan.id,
            planName: plan.name,
            platformId: outcome.platformId,
            failStreak: platformFailStreak,
            errorCode: code,
            errorMessage:
              outcome.error === null ? outcome.summary?.run.errorMsg : messageOf(outcome.error),
            hint: '定时不再尝试这个平台（同方案里其它平台照常）。确认环境正常后在「采集」页点「确认恢复」——不会自动恢复。',
          },
        },
        at,
      )
      deps.logger?.warn(
        `[scheduler] ${plan.name} / ${outcome.platformId} 已风控暂停（信号 ${String(code)}）`,
      )
    }

    const engine = deps.store.plan.engineState(plan.id)
    if (anySuccess) {
      // SR-7：**有平台成功**就推进 last_success_at。
      deps.store.plan.setEngine(plan.id, {
        lastAttemptAt: at,
        lastSuccessAt: at,
        failStreak: 0,
        backoffUntil: null,
      })
      deps.store.todo.closeByRef('catch-up', String(plan.id), at)
      return
    }

    // 一个平台都没成功 → 推进**方案级**退避（与平台冷却不同层：这轮别再来了）
    const planFailStreak = engine.failStreak + 1
    deps.store.plan.setEngine(plan.id, {
      lastAttemptAt: at,
      // SR-23：失败**不**推进 last_success_at，但推进冷却（退避）
      failStreak: planFailStreak,
      backoffUntil: new Date(new Date(at).getTime() + backoffMsFor(planFailStreak)).toISOString(),
    })
    deps.logger?.warn(
      `[scheduler] ${plan.name} 本轮所有平台都没成功（连续 ${String(planFailStreak)} 次）` +
        ` → 方案退避 ${String(backoffMsFor(planFailStreak) / 60_000)} 分钟`,
    )
  }

  /**
   * 把"被预算剪掉"的平台并回判定结果里（SR-46）。
   *
   * 为什么跑完要**再记一次**：`record` 在开跑之前就调用了（SR-26 要求"到点就有结论"），
   * 而预算是在**跑的过程中**才用尽的。不重记的话，`platformDecisions` 里那几个平台
   * 会停在 `reason=null`（= 跑过了），而它们其实一条都没抓 —— 又一处"静默少一个结果"，
   * 正是这张表要消灭的那类问题。
   */
  const withCut = (
    platforms: readonly PlatformDecision[],
    cut: readonly PlatformDecision[],
  ): PlatformDecision[] => {
    if (cut.length === 0) return [...platforms]
    const byId = new Map(cut.map((item) => [item.platformId, item]))
    return platforms.map((item) => byId.get(item.platformId) ?? item)
  }

  const tick = async (): Promise<void> => {
    if (running) return
    if (!deps.canSchedule()) return
    running = true
    try {
      const current = now()
      const due = enabledPlans().filter((plan) => {
        if (plan.nextRunAt === null) return false
        const at = new Date(plan.nextRunAt).getTime()
        return Number.isFinite(at) && at <= current.getTime()
      })

      for (const plan of due) {
        const decision = decide(plan, current)
        if (decision.kind !== 'run') {
          // SR-17/28：到点了但没跑 —— **必须留痕**，否则用户只看到"什么都没发生"。
          //
          // 刻意**不为跳过写一条 crawl_run**：`crawl_run` 记录的是"真的去抓了一轮"，
          // 而跳过根本没有抓（连浏览器都没开）。硬写一条会让运行历史里混进一堆
          // found=0 的假运行，反而掩盖真正失败的那几条 —— 那正是这张表要回答的问题。
          // 跳过的去向是 `planStatus.lastDecision`（界面显示"为什么没跑"）与下面的 SSE 事件。
          record(plan.id, decision, null)
          deps.events.publish('plan.skipped', {
            planId: plan.id,
            reason: decision.reason,
            platforms: decision.platforms,
          })
          const blocked = decision.platforms
            .filter((platform) => platform.reason !== null)
            .map((platform) => `${platform.platformId}(${String(platform.reason)})`)
            .join('、')
          deps.logger?.info(
            `[scheduler] ${plan.name} 到点但跳过：${decision.reason ?? '未知'}` +
              (blocked === '' ? '' : ` —— 各平台：${blocked}`),
          )
          continue
        }

        record(plan.id, decision, null)
        deps.events.publish('plan.started', { planId: plan.id, name: plan.name })
        // SR-46：本轮预算**每个方案一份**。同一个 tick 里两个方案同时到期时，
        // 它们各自是一轮 —— 共用一份预算会让先跑的那个把另一个也剪掉，那是另一类串扰。
        const budget = startRoundBudget(current.getTime())
        const deadlineAt = new Date(budget.deadlineAtMs).toISOString()
        const outcomes: PlatformOutcome[] = []
        const cut: PlatformDecision[] = []
        // SR-18：只跑**过了门**的平台；被挡住的那些各自留了原因，不连坐。
        for (const platform of decision.platforms) {
          if (platform.reason !== null) continue
          const platformId = platform.platformId
          // SR-46：到点了就不再开始新平台。**顺序已按新鲜度排过**（executionOrderOf），
          // 所以被剪掉的是"最不需要现在跑"的那几个，而不是数组尾部的那几个。
          if (budgetExhausted(budget, new Date(clock()).getTime())) {
            cut.push({ platformId, reason: 'round_budget', message: SKIP_REASON_LABEL.round_budget })
            continue
          }
          try {
            const summary = await deps.run({
              planId: plan.id,
              platformId,
              // 批次 3：这个平台**实际使用的**条件（方案级 + 该平台的页数覆盖）
              criteria: criteriaForPlatform(plan, platformId),
              reason: 'schedule',
              // SR-46：同一个终点交给每个平台 —— 平台内部据此在页与页之间收手
              deadlineAt,
            })
            outcomes.push({ platformId, summary, error: null })
            deps.events.publish('plan.finished', {
              planId: plan.id,
              platformId,
              state: summary.run.state,
              inserted: summary.run.inserted,
            })
          } catch (error) {
            // 单个平台失败不阻断其它平台；失败本身已经在 crawl 里记了健康与待办
            outcomes.push({ platformId, summary: null, error })
            deps.logger?.warn(`[scheduler] ${plan.name} / ${platformId} 抓取失败：${messageOf(error)}`)
            deps.events.publish('plan.failed', { planId: plan.id, platformId, message: messageOf(error) })
          }
        }
        if (cut.length > 0) {
          record(plan.id, { kind: 'run', reason: null, platforms: withCut(decision.platforms, cut) }, null)
          deps.logger?.info(
            `[scheduler] ${plan.name} 单轮预算用尽（${String(Math.round(ROUND_BUDGET_MS / 60_000))} 分钟）` +
              ` → ${cut.map((item) => item.platformId).join('、')} 留到下一轮`,
          )
        }
        finishPlanRun(plan, outcomes)
      }

      // 不论有没有到期，都把 next_run_at 推到未来 —— 否则定时器会立刻再次触发（自旋）。
      // SR-6：这里**只重算，不补偿**跳变期间"本该跑"的次数。
      refreshNextRuns(now())
    } finally {
      running = false
      arm()
    }
  }

  /**
   * 某个方案下一次触发点所在的窗口起点。
   *
   * 算法：从 `nextRunAt` 所在的本地日历日回推窗口起点；
   * 如果 `nextRunAt` 的时分**早于**窗口起点（跨零点窗口），窗口起点在前一天。
   */
  const nextWindowStartFor = (plan: PlanDto, current: Date): Date => {
    const next = new Date(plan.nextRunAt ?? current.toISOString())
    const startMinute = plan.schedule.windowStartHour * 60 + plan.schedule.windowStartMinute
    const nextMinute = next.getHours() * 60 + next.getMinutes()
    const dayOffset = nextMinute < startMinute ? -1 : 0
    return new Date(
      next.getFullYear(),
      next.getMonth(),
      next.getDate() + dayOffset,
      plan.schedule.windowStartHour,
      plan.schedule.windowStartMinute,
      0,
      0,
    )
  }

  const planStatusOf = (plan: PlanDto, current: Date): PlanScheduleStatusDto => {
    const engine = deps.store.plan.engineState(plan.id)
    // SR-21：风控暂停是**平台级**的；方案级只做**派生**（该方案下所有平台都被暂停）。
    // 独立存一份必然与平台级真值漂移 —— 一个方案有 5 个平台就有 5 份状态。
    const riskPaused = allPlatformsRiskPaused(deps.store, activePlatformsOf(plan))
    const pausedPlatforms = activePlatformsOf(plan).filter(
      (platformId) => readPlatformRiskPause(deps.store, platformId).paused,
    )
    return {
      planId: plan.id,
      name: plan.name,
      enabled: plan.enabled && plan.schedule.enabled,
      freshness: freshnessOf(plan, current),
      lastAttemptAt: plan.lastAttemptAt,
      lastSuccessAt: plan.lastSuccessAt,
      nextRunAt: plan.nextRunAt,
      lastDecision: lastDecision.get(plan.id) ?? null,
      // 只回**启用中**的平台：停用的平台没有"为什么没跑"可言（是用户让它别跑的）
      platformDecisions: activePlatformsOf(plan).map((platformId) => ({
        platformId,
        decision: lastPlatformDecision.get(platformDecisionKey(plan.id, platformId)) ?? null,
      })),
      backoffUntil: engine.backoffUntil,
      failStreak: engine.failStreak,
      riskPaused,
      riskReason: riskPaused ? `${pausedPlatforms.join('、')} 处于风控暂停` : null,
    }
  }

  return {
    start,

    stop(): void {
      started = false
      cancel?.()
      cancel = null
      armedAtMs = null
    },

    setPaused(paused, reason): void {
      if (paused) {
        deps.store.setting.set(
          PAUSE_KEY,
          PAUSE_SCOPE,
          '',
          { paused: true, reason: reason ?? '用户一键暂停' },
          clock(),
        )
      } else {
        deps.store.setting.remove(PAUSE_KEY, PAUSE_SCOPE, '')
      }
      deps.events.publish('schedule.paused', { paused })
      // 立刻重新武装/解除武装，别让"暂停了但定时器还挂着"这种状态存在
      arm()
    },

    resumeRisk(planId): void {
      const at = clock()
      const plan = deps.store.plan.get(planId)
      // SR-21：风控暂停是**平台级**的，恢复也必须**按平台**清 ——
      // 并且要把该平台自己的失败计数与健康态一起复位：否则残留的
      // `adapter_broken` / 冷却会立刻再把门关上，"确认恢复"看起来像没生效。
      // 只清**启用中**的平台的暂停：用户停用的平台不需要被"恢复"，它本来就不跑。
      for (const platformId of plan === undefined ? [] : activePlatformsOf(plan)) {
        clearPlatformRiskPause(deps.store, platformId)
        clearPlatformCooldown(platformId)
        deps.store.platform.recordSuccess(platformId, at)
        deps.store.platform.setHealth(platformId, 'healthy', null, at)
        deps.store.todo.closeByRef('blocked', platformId, at)
      }
      deps.store.plan.setEngine(planId, {
        riskPaused: false,
        riskReason: null,
        failStreak: 0,
        backoffUntil: null,
      })
      // 兼容旧版遗留的方案级待办（它的 ref 曾经是 planId）
      deps.store.todo.closeByRef('blocked', String(planId), at)
      deps.events.publish('plan.resumed', { planId })
      // 恢复后立刻重排一次，用户不必等到明天
      refreshNextRuns(now())
      arm()
    },

    status(): SchedulerStatusDto {
      const current = now()
      const plans = deps.store.plan.list()
      const planStatus = plans.map((plan) => planStatusOf(plan, current))
      const lastRunAt =
        plans
          .map((plan) => plan.lastSuccessAt)
          .filter((value): value is string => value !== null)
          .sort()
          .at(-1) ?? null

      // A1：把"下次什么时候跑、这个窗口多长、抖动多少"一起算好给界面。
      // 界面据此写「明天 09:37（含 4 分钟抖动）」，而不是原样打印一个 UTC 串。
      const triggers: WeeklyTriggerDto[] = []
      for (const plan of plans) {
        if (!plan.enabled || !plan.schedule.enabled || plan.nextRunAt === null) continue
        const next = new Date(plan.nextRunAt)
        if (Number.isNaN(next.getTime())) continue
        const windowStart = nextWindowStartFor(plan, current)
        triggers.push({
          planId: plan.id,
          planName: plan.name,
          nextRunAt: plan.nextRunAt,
          windowStartAt: windowStart.toISOString(),
          windowStartHour: plan.schedule.windowStartHour,
          windowStartMinute: plan.schedule.windowStartMinute,
          windowEndHour: plan.schedule.windowEndHour,
          windowEndMinute: plan.schedule.windowEndMinute,
          weekdays: plan.schedule.weekdays,
          jitterMs: plan.schedule.jitterMs,
          timezone: plan.timezone,
        })
      }

      const cold = planStatus.filter((item) => item.enabled && item.freshness.level !== 'fresh')
      const refreshSuggested = cold.length > 0 && !isPaused()
      const hint =
        cold.length === 0
          ? null
          : `${cold.map((item) => item.name).join('、')} 的数据已经是 ${
              cold[0]?.freshness.level === 'cold' ? '陈旧' : '偏旧'
            }状态 —— 点「立即采集」刷新一次，或等下一个偏好时段自动跑。`

      return {
        scheduling: started && deps.canSchedule() && !isPaused(),
        readOnly: !deps.canSchedule(),
        readOnlyReason: deps.readOnlyReason(),
        armed: cancel !== null,
        nextRunAt: armedAtMs === null ? null : new Date(armedAtMs).toISOString(),
        lastRunAt,
        running,
        plans,
        lease: deps.leaseStatus(),
        // 没有任何方案时也如实说本机时区（排程就是按本地墙钟算的）
        timezone: plans[0]?.timezone ?? detectTimezone(),
        jitterMs: plans[0]?.schedule.jitterMs ?? 0,
        paused: isPaused(),
        pausedReason: pausedReason(),
        planStatus,
        triggers,
        recentRuns: deps.store.crawlRun.list(10).map((run) => ({
          ...run,
          reason: run.reason,
          skipReason: run.skipReason,
        })),
        refreshSuggested,
        refreshHint: hint,
      }
    },

    async runPlan(planId, reason): Promise<CrawlSummaryDto> {
      // SR-12：只有租约持有者能执行；只读实例**手动跑也拒绝**并给原因
      if (!deps.canSchedule()) {
        throw new DomainError('CONFLICT', deps.readOnlyReason() ?? '本实例不持有租约，不能执行抓取', {
          hint: '另一个实例正在运行 —— 请在那边操作，避免两个调度器同时抓取（R20）。',
        })
      }
      const plan = deps.plans.get(planId)
      if (plan.platforms.length === 0) {
        throw new DomainError('INVALID_INPUT', `方案「${plan.name}」没有配置平台`)
      }
      if (!plan.enabled || !plan.schedule.enabled) {
        throw new DomainError('INVALID_INPUT', `方案「${plan.name}」已停用`, {
          hint: '先在「采集」页启用它，或直接点某个启用方案的「立即采集」。',
        })
      }
      // SR-21：风控暂停期间**人工确认前不跑**，手动也不行 ——
      // 否则"暂停"就成了一句空话，用户点一下就又去打风控了。
      // 多平台下暂停是**平台级**的：全被暂停才整体拒绝；只暂停了一部分，
      // 就只跑没被暂停的那些（SR-18），不再连坐。
      const ignoreRiskPause = reason === 'catch-up'
      // 批次 3：只跑**启用的**平台。被用户停用的平台不该在这里偷偷跑起来 ——
      // "停用"必须是真的停用，而不是"定时不跑、手动照跑"。
      // 批次 5：同一套新鲜度排序（最久没成功过的先跑）。
      const active = executionOrderOf(activePlatformsOf(plan))
      if (active.length === 0) {
        throw new DomainError('INVALID_INPUT', `方案「${plan.name}」的平台都被停用了`, {
          hint: '至少启用一个平台，或把它加回方案的平台列表。',
        })
      }
      const pausedIds = active.filter(
        (platformId) => readPlatformRiskPause(deps.store, platformId).paused,
      )
      if (!ignoreRiskPause && pausedIds.length === active.length) {
        throw new DomainError('CONFLICT', `方案「${plan.name}」下启用的平台都处于风控暂停`, {
          hint: '先确认环境正常，再点「确认恢复」；系统不会自动恢复（SR-21）。',
        })
      }
      const targets = ignoreRiskPause
        ? active
        : active.filter((platformId) => !pausedIds.includes(platformId))

      record(
        planId,
        {
          kind: 'run',
          reason: null,
          platforms: active.map((platformId) => ({
            platformId,
            reason: pausedIds.includes(platformId) && !ignoreRiskPause ? 'risk_paused' : null,
            message:
              pausedIds.includes(platformId) && !ignoreRiskPause
                ? SKIP_REASON_LABEL.risk_paused
                : null,
          })),
        },
        null,
      )

      const outcomes: PlatformOutcome[] = []
      let last: CrawlSummaryDto | null = null
      let firstFailure: unknown = null
      // SR-46：手动同样有预算。**不给手动开后门**的理由：手动触发恰恰是最容易
      // 一次点满 8 个平台 × 5 页的场景，也就是最需要保险丝的场景；
      // 用户看到"剩下 3 个平台留到下一轮"是诚实的，看到进程卡住不是。
      const budget = startRoundBudget(new Date(clock()).getTime())
      const deadlineAt = new Date(budget.deadlineAtMs).toISOString()
      const cut: PlatformDecision[] = []
      for (const platformId of targets) {
        if (budgetExhausted(budget, new Date(clock()).getTime())) {
          cut.push({ platformId, reason: 'round_budget', message: SKIP_REASON_LABEL.round_budget })
          continue
        }
        try {
          const summary = await deps.run({
            planId,
            platformId,
            criteria: criteriaForPlatform(plan, platformId),
            reason,
            deadlineAt,
          })
          last = summary
          outcomes.push({ platformId, summary, error: null })
        } catch (error) {
          if (firstFailure === null) firstFailure = error
          outcomes.push({ platformId, summary: null, error })
          deps.logger?.warn(
            `[scheduler] 手动跑 ${plan.name} / ${platformId} 失败：${messageOf(error)}`,
          )
        }
      }

      if (cut.length > 0) {
        // 与 `tick` 同理：跑之前记的那份里它们还是"能跑"，必须按实际结论重记一次
        record(
          planId,
          {
            kind: 'run',
            reason: null,
            platforms: withCut(
              active.map((platformId) => ({
                platformId,
                reason:
                  pausedIds.includes(platformId) && !ignoreRiskPause ? 'risk_paused' : null,
                message:
                  pausedIds.includes(platformId) && !ignoreRiskPause
                    ? SKIP_REASON_LABEL.risk_paused
                    : null,
              })),
              cut,
            ),
          },
          null,
        )
        deps.logger?.info(
          `[scheduler] 手动跑 ${plan.name}：单轮预算用尽` +
            ` → ${cut.map((item) => item.platformId).join('、')} 留到下一轮`,
        )
      }

      finishPlanRun(plan, outcomes)

      // 一个平台都没跑成：**把原始错误原样抛出去**，而不是包成一句 INTERNAL。
      // 实测踩到：离线闸门返回的是 BLOCKED，被包成 INTERNAL 之后接口回了 500，
      // 用户看到"程序坏了"，而真相是"离线模式下这条路不让走"——连错误码都丢了。
      if (last === null) {
        if (firstFailure !== null) throw firstFailure
        throw new DomainError('INTERNAL', `方案「${plan.name}」没能跑出结果`)
      }
      return last
    },

    tick,
  }
}

export { currentWindowStart, windowKeyOf, windowLengthMin }
