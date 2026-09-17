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
import { DomainError, messageOf } from '../util/errors.js'
import { systemClock, type Clock } from '../util/time.js'
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
export type PlatformGate = (platformId: string) => SkipReason | null

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

/** SR-20：退避曲线。15m → 1h → 4h，之后封顶 4h（同一天不再更密地试）。 */
export function backoffMsFor(failStreak: number): number {
  if (failStreak <= 0) return 0
  if (failStreak === 1) return 15 * 60 * 1000
  if (failStreak === 2) return 60 * 60 * 1000
  return 4 * 60 * 60 * 1000
}

/** SR-21：连续失败到这个次数就 `risk_paused` + urgent 待办（不再自动试）。 */
export const RISK_PAUSE_THRESHOLD = 3

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

/** 判定与执行之间共享的一小块状态（"为什么没跑"要落库，也要能被 status() 读到）。 */
interface Decision {
  kind: 'run' | 'skip' | 'wait'
  reason: SkipReason | null
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
   * 存在 `setting` 表（`scope=platform` / `key=cooldown-until`）而不是加列：
   * 它是个**短命**的运行时状态（几小时），不值得为它做一次 schema 迁移。
   * 读它的地方在 `runtime.platformGate`（判定统一在那一边），这里只负责写与清。
   */
  const recordPlatformFailure = (platformId: string, failStreak: number): void => {
    const until = new Date(clock()).getTime() + backoffMsFor(failStreak)
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

  const record = (planId: number, decision: Decision, message: string | null): void => {
    if (decision.kind === 'run') {
      lastDecision.set(planId, { decision: 'ran', reason: null, message: null, at: clock() })
      return
    }
    if (decision.kind === 'wait') {
      lastDecision.set(planId, { decision: 'waiting', reason: null, message: null, at: clock() })
      return
    }
    lastDecision.set(planId, {
      decision: 'skipped',
      reason: decision.reason,
      message: message ?? (decision.reason === null ? null : SKIP_REASON_LABEL[decision.reason]),
      at: clock(),
    })
  }

  /**
   * 一个方案现在能不能跑（SR-3 / SR-16 / SR-21 / SR-30）。
   *
   * 判定顺序不是随意的：**越"根本"的原因越先报**。
   * 全局暂停先说全局；风控暂停说风控；租约说租约；然后才是"到没到点"。
   * 顺序反了会出现"还没到点"盖住了"你已被风控暂停"这种把用户带沟里的提示。
   */
  const decide = (plan: PlanDto, at: Date, exceptReason?: RunReason): Decision => {
    if (!plan.enabled || !plan.schedule.enabled) return { kind: 'skip', reason: 'plan_disabled' }
    if (exceptReason !== 'manual' && exceptReason !== 'catch-up') {
      if (isPaused()) return { kind: 'skip', reason: 'global_pause' }
    }
    if (!deps.canSchedule()) return { kind: 'skip', reason: 'lease_lost' }

    const engine = deps.store.plan.engineState(plan.id)
    if (engine.riskPaused) return { kind: 'skip', reason: 'risk_paused' }
    if (engine.backoffUntil !== null) {
      const until = new Date(engine.backoffUntil)
      if (!Number.isNaN(until.getTime()) && until.getTime() > at.getTime()) {
        return { kind: 'skip', reason: 'backoff' }
      }
    }

    if (exceptReason === undefined) {
      // **窗口外不跑**（SR-3）。手动/补跑不受窗口约束 —— 人工触发永远保留（SR-30/T3）。
      if (!insideWindow(plan.schedule, at)) return { kind: 'skip', reason: 'outside_window' }
    }

    for (const platformId of plan.platforms) {
      const gateReason = deps.platformGate?.(platformId) ?? null
      if (gateReason !== null) return { kind: 'skip', reason: gateReason }
    }

    return { kind: 'run', reason: null }
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

  const finishPlanRun = (plan: PlanDto, summary: CrawlSummaryDto | null, error: unknown): void => {
    const at = clock()
    const failed = error !== null || (summary !== null && summary.run.state === 'failed')
    const engine = deps.store.plan.engineState(plan.id)

    if (!failed) {
      // SR-7：只有成功才推进 last_success_at，并清零退避/连续失败
      deps.store.plan.setEngine(plan.id, {
        lastAttemptAt: at,
        lastSuccessAt: at,
        failStreak: 0,
        backoffUntil: null,
      })
      deps.store.todo.closeByRef('catch-up', String(plan.id), at)
      return
    }

    const code = summary?.run.errorCode ?? null
    const failStreak = engine.failStreak + 1
    // SR-22：风控信号（验证码/登录墙/限流）**单独识别**，直接风控暂停，不等凑够次数。
    const riskSignal =
      code === 'BLOCKED' || code === 'NOT_LOGGED_IN' || code === 'RISK' || code === 'RATE_LIMITED'
    const pause = riskSignal || failStreak >= RISK_PAUSE_THRESHOLD

    deps.store.plan.setEngine(plan.id, {
      lastAttemptAt: at,
      // SR-23：失败**不**推进 last_success_at，但推进冷却（退避）
      failStreak,
      backoffUntil: pause ? null : new Date(new Date(at).getTime() + backoffMsFor(failStreak)).toISOString(),
      ...(pause
        ? {
            riskPaused: true,
            riskReason: riskSignal
              ? `命中风控/登录墙信号（${code ?? '未知'}）—— 已暂停该平台，需人工确认后恢复`
              : `连续失败 ${String(failStreak)} 次 —— 已暂停该平台，需人工确认后恢复`,
          }
        : {}),
    })

    if (pause) {
      // SR-21/24：风控暂停必须**打扰用户**（urgent 待办），而且不自动恢复
      deps.store.todo.createOnce(
        {
          kind: 'blocked',
          level: 'urgent',
          title: `${plan.name} 已被风控暂停`,
          ref: String(plan.id),
          detail: {
            planId: plan.id,
            failStreak,
            errorCode: code,
            errorMessage: error === null ? summary?.run.errorMsg : messageOf(error),
            hint: '定时不再尝试这个方案。确认环境正常后在「采集」页点「确认恢复」——不会自动恢复。',
          },
        },
        at,
      )
      deps.logger?.warn(`[scheduler] ${plan.name} 已风控暂停（连续失败 ${String(failStreak)} 次，信号 ${String(code)}）`)
    } else {
      deps.logger?.warn(
        `[scheduler] ${plan.name} 失败（连续 ${String(failStreak)} 次）→ 退避到 ` +
          `${String(backoffMsFor(failStreak) / 60_000)} 分钟后`,
      )
    }
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
          deps.events.publish('plan.skipped', { planId: plan.id, reason: decision.reason })
          deps.logger?.info(`[scheduler] ${plan.name} 到点但跳过：${decision.reason ?? '未知'}`)
          continue
        }

        record(plan.id, decision, null)
        deps.events.publish('plan.started', { planId: plan.id, name: plan.name })
        let summary: CrawlSummaryDto | null = null
        let failure: unknown = null
        for (const platformId of plan.platforms) {
          try {
            summary = await deps.run({
              planId: plan.id,
              platformId,
              criteria: plan.criteria,
              reason: 'schedule',
            })
            // SR-20：成功即清冷却
            clearPlatformCooldown(platformId)
            deps.events.publish('plan.finished', {
              planId: plan.id,
              platformId,
              state: summary.run.state,
              inserted: summary.run.inserted,
            })
          } catch (error) {
            // 单个平台失败不阻断其它平台；失败本身已经在 crawl 里记了健康与待办
            failure = error
            recordPlatformFailure(platformId, deps.store.plan.engineState(plan.id).failStreak + 1)
            deps.logger?.warn(`[scheduler] ${plan.name} / ${platformId} 抓取失败：${messageOf(error)}`)
            deps.events.publish('plan.failed', { planId: plan.id, platformId, message: messageOf(error) })
          }
        }
        finishPlanRun(plan, summary, failure)
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
    return {
      planId: plan.id,
      name: plan.name,
      enabled: plan.enabled && plan.schedule.enabled,
      freshness: freshnessOf(plan, current),
      lastAttemptAt: plan.lastAttemptAt,
      lastSuccessAt: plan.lastSuccessAt,
      nextRunAt: plan.nextRunAt,
      lastDecision: lastDecision.get(plan.id) ?? null,
      backoffUntil: engine.backoffUntil,
      failStreak: engine.failStreak,
      riskPaused: engine.riskPaused,
      riskReason: engine.riskReason,
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
      deps.store.plan.setEngine(planId, {
        riskPaused: false,
        riskReason: null,
        failStreak: 0,
        backoffUntil: null,
      })
      deps.store.todo.closeByRef('blocked', String(planId), clock())
      // SR-20：人工确认恢复时把该平台方案的冷却也清掉，否则"确认"之后还要再等 4 小时
      for (const platformId of deps.store.plan.get(planId)?.platforms ?? []) clearPlatformCooldown(platformId)
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
        timezone: plans[0]?.timezone ?? 'UTC',
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
      const engine = deps.store.plan.engineState(planId)
      if (engine.riskPaused && reason !== 'catch-up') {
        throw new DomainError('CONFLICT', `方案「${plan.name}」处于风控暂停`, {
          hint: '先确认环境正常，再点「确认恢复」；系统不会自动恢复（SR-21）。',
        })
      }

      let last: CrawlSummaryDto | null = null
      let failure: unknown = null
      for (const platformId of plan.platforms) {
        try {
          last = await deps.run({ planId, platformId, criteria: plan.criteria, reason })
          // SR-20：成功了就把这个平台的冷却清掉，否则一次抖动会让它停一整天
          clearPlatformCooldown(platformId)
        } catch (error) {
          failure = error
          recordPlatformFailure(platformId, deps.store.plan.engineState(planId).failStreak + 1)
          deps.logger?.warn(`[scheduler] 手动跑 ${plan.name} / ${platformId} 失败：${messageOf(error)}`)
        }
      }

      record(planId, { kind: 'run', reason: null }, null)
      finishPlanRun(plan, last, failure)

      if (last === null) {
        throw new DomainError('INTERNAL', `方案「${plan.name}」没能跑出结果`, {
          ...(failure === null ? {} : { hint: messageOf(failure) }),
        })
      }
      return last
    },

    tick,
  }
}

export { currentWindowStart, windowKeyOf, windowLengthMin }
