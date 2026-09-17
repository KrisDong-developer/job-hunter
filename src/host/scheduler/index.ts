/**
 * 自排程器（§4.6 / C3：宿主没有 schedule 服务，全部自实现）。
 *
 * 三条不可让步的语义：
 *   1. **错过不猛跑** —— 启动时发现错过一轮，只生成一条「是否补跑」待办，
 *      等用户点。开机瞬间轰一遍积压是最容易被风控盯上的行为（C9）。
 *   2. **定时器必须可取消** —— 卸载/热重载不能留下幽灵定时器（C15）。
 *   3. **与手动触发共用同一把锁** —— 抓取本身走 `mutex`，「到点了」和「点一下」不会并行。
 */
import type { CrawlSummaryDto, PlanDto, SchedulerStatusDto } from '../../shared/dto.js'
import type { PlanService } from '../domain/plans.js'
import type { EventBus } from '../http/sse.js'
import type { Store } from '../store/store.js'
import { DomainError, messageOf } from '../util/errors.js'
import { systemClock, type Clock } from '../util/time.js'
import { jitterFor, missedRun, nextRunAt } from './schedule.js'
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
  clock?: Clock
  random?: () => number
  logger?: SchedulerLogger
}

export interface Scheduler {
  start(): void
  stop(): void
  status(): SchedulerStatusDto
  /** 用户显式触发（手动 / 补跑）。未持租约时拒绝执行。 */
  runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>
  /** 检查一次到期计划（定时器触发点；测试也直接用它）。 */
  tick(): Promise<void>
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const clock = deps.clock ?? systemClock
  const random = deps.random ?? Math.random

  let started = false
  let cancel: (() => void) | null = null
  let armedAtMs: number | null = null
  let running = false
  let warnedReadOnly = false

  const now = (): Date => new Date(clock())

  const enabledPlans = (): PlanDto[] =>
    deps.store.plan.list().filter((plan) => plan.enabled && plan.schedule.enabled)

  const planNext = (plan: PlanDto, from: Date): Date =>
    nextRunAt(plan.schedule, from, jitterFor(plan.schedule, random))

  /** 重新武装定时器：永远只挂一个，指向最近的那个到期时刻。 */
  const arm = (): void => {
    cancel?.()
    cancel = null
    armedAtMs = null
    if (!started || !deps.canSchedule()) return

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
    if (started) return
    started = true
    warnedReadOnly = false

    // 首次安装至少有一个方案，否则「到点自动跑」无从谈起
    deps.plans.ensureDefault()

    const current = now()
    for (const plan of deps.store.plan.list()) {
      if (!plan.enabled || !plan.schedule.enabled) {
        deps.store.plan.setRunTimes(plan.id, { nextRunAt: null })
        continue
      }
      deps.store.plan.setRunTimes(plan.id, { nextRunAt: planNext(plan, current).toISOString() })

      const verdict = missedRun(plan.schedule, plan.lastRunAt, current)
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
            lastRunAt: plan.lastRunAt,
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
    arm()
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
        deps.events.publish('plan.started', { planId: plan.id, name: plan.name })
        for (const platformId of plan.platforms) {
          try {
            const summary = await deps.run({
              planId: plan.id,
              platformId,
              criteria: plan.criteria,
              reason: 'schedule',
            })
            deps.events.publish('plan.finished', {
              planId: plan.id,
              platformId,
              state: summary.run.state,
              inserted: summary.run.inserted,
            })
          } catch (error) {
            // 单个平台失败不阻断其它平台；失败本身已经在 crawl 里记了健康与待办
            deps.logger?.warn(`[scheduler] ${plan.name} / ${platformId} 抓取失败：${messageOf(error)}`)
            deps.events.publish('plan.failed', { planId: plan.id, platformId, message: messageOf(error) })
          }
        }
        deps.store.plan.setRunTimes(plan.id, { lastRunAt: clock() })
        deps.store.todo.closeByRef('catch-up', String(plan.id), clock())
      }

      // 不论有没有到期，都把 next_run_at 推到未来 —— 否则定时器会立刻再次触发（自旋）
      for (const plan of enabledPlans()) {
        deps.store.plan.setRunTimes(plan.id, { nextRunAt: planNext(plan, now()).toISOString() })
      }
    } finally {
      running = false
      arm()
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

    status(): SchedulerStatusDto {
      const plans = deps.store.plan.list()
      const lastRunAt =
        plans
          .map((plan) => plan.lastRunAt)
          .filter((value): value is string => value !== null)
          .sort()
          .at(-1) ?? null
      return {
        scheduling: started && deps.canSchedule(),
        readOnly: !deps.canSchedule(),
        readOnlyReason: deps.readOnlyReason(),
        armed: cancel !== null,
        nextRunAt: armedAtMs === null ? null : new Date(armedAtMs).toISOString(),
        lastRunAt,
        running,
        plans,
        lease: deps.leaseStatus(),
      }
    },

    async runPlan(planId, reason): Promise<CrawlSummaryDto> {
      if (!deps.canSchedule()) {
        throw new DomainError('CONFLICT', deps.readOnlyReason() ?? '本实例不持有租约，不能执行抓取', {
          hint: '另一个实例正在运行 —— 请在那边操作，避免两个调度器同时抓取（R20）。',
        })
      }
      const plan = deps.plans.get(planId)
      if (plan.platforms.length === 0) {
        throw new DomainError('INVALID_INPUT', `方案「${plan.name}」没有配置平台`)
      }

      let last: CrawlSummaryDto | null = null
      for (const platformId of plan.platforms) {
        last = await deps.run({ planId, platformId, criteria: plan.criteria, reason })
      }
      deps.store.plan.setRunTimes(planId, { lastRunAt: clock() })
      deps.store.todo.closeByRef('catch-up', String(planId), clock())
      if (last === null) {
        throw new DomainError('INTERNAL', `方案「${plan.name}」没能跑出结果`)
      }
      return last
    },

    tick,
  }
}
