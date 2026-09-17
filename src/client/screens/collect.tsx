import { useMemo, useState } from 'react'
import {
  CRAWL_STATE_LABEL,
  CRAWL_STATE_TONE,
  HEALTH_STATE_LABEL,
  HEALTH_STATE_TONE,
  runReasonLabel,
  type CrawlState,
  type HealthState,
} from '../../shared/enums.js'
import {
  FAILURE_KIND_LABEL,
  adviceForFailure,
  humanizeFailure,
  type FailureText,
} from '../../shared/error-text.js'
import { describeCriteria, type CriteriaDimensionLike } from '../../shared/criteria-label.js'
import type { PlanDto, PlanSchedule, RecentRunDto, SchedulerStatusDto } from '../../shared/dto.js'
import { formatClock, formatJitter, formatRelative, formatWeekdays, formatWindow } from '../../shared/time-format.js'
import {
  ApiError,
  createPlan,
  deletePlan,
  fetchCriteriaDimensions,
  fetchPlans,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchSkipReasons,
  recheckLease,
  resumePlanRisk,
  runPlan,
  setSchedulePaused,
  startLogin,
  takeoverLease,
  updatePlan,
  validatePlan,
  type CriteriaDimensionDto,
  type PlanDuplicateDto,
  type PlanWriteInput,
  type PlatformOverviewDto,
} from '../api.js'
import { useAsync } from '../use-async.js'
import { InlineMd } from '../inline-md.js'
import { Term } from '../terms.js'
import { FreshnessBadge } from './freshness.js'

interface Feedback {
  running: boolean
  tone: 'ok' | 'error'
  /** 文案里可以有 `**强调**` 与 `` `代码` `` —— 渲染时走 `InlineMd`（见文件尾的注释）。 */
  message: string | null
}

const IDLE: Feedback = { running: false, tone: 'ok', message: null }

/** 表单的本地形状：窗口与条件在这里是字符串，提交前才收敛。 */
interface PlanForm {
  name: string
  platforms: string[]
  criteria: Record<string, string>
  windowStartHour: number
  windowStartMinute: number
  windowEndHour: number
  windowEndMinute: number
  weekdays: number[]
  scheduleEnabled: boolean
  score: boolean
  flag: boolean
  dedup: boolean
}

function formOf(plan: PlanDto): PlanForm {
  const schedule: PlanSchedule = plan.schedule
  return {
    name: plan.name,
    platforms: [...plan.platforms],
    criteria: { ...plan.criteria },
    windowStartHour: schedule.windowStartHour,
    windowStartMinute: schedule.windowStartMinute,
    windowEndHour: schedule.windowEndHour,
    windowEndMinute: schedule.windowEndMinute,
    weekdays: [...schedule.weekdays],
    scheduleEnabled: schedule.enabled,
    score: plan.postProcess.score,
    flag: plan.postProcess.flag,
    dedup: plan.postProcess.dedup,
  }
}

function emptyForm(platforms: string[]): PlanForm {
  return {
    name: '新方案',
    platforms,
    criteria: {},
    windowStartHour: 9,
    windowStartMinute: 0,
    windowEndHour: 11,
    windowEndMinute: 0,
    weekdays: [1, 2, 3, 4, 5],
    scheduleEnabled: true,
    score: true,
    flag: true,
    dedup: true,
  }
}

function writeOf(form: PlanForm): PlanWriteInput {
  return {
    name: form.name,
    platforms: form.platforms,
    criteria: form.criteria,
    schedule: {
      enabled: form.scheduleEnabled,
      windowStartHour: form.windowStartHour,
      windowStartMinute: form.windowStartMinute,
      windowEndHour: form.windowEndHour,
      windowEndMinute: form.windowEndMinute,
      weekdays: form.weekdays,
    },
    postProcess: { score: form.score, flag: form.flag, dedup: form.dedup },
  }
}

/**
 * 状态徽章：**中文 + 色调**，不把 `ok` / `degraded` 这类内部枚举印给用户。
 *
 * 色调与文案都取自 `shared/enums.ts` 的那两张表，所以面板、工具文本、
 * 以后新增的界面必然是同一套词。
 */
function StateBadge(props: { state: CrawlState | HealthState; kind: 'run' | 'health' }) {
  const label =
    props.kind === 'run'
      ? CRAWL_STATE_LABEL[props.state as CrawlState]
      : HEALTH_STATE_LABEL[props.state as HealthState]
  const tone =
    props.kind === 'run'
      ? CRAWL_STATE_TONE[props.state as CrawlState]
      : HEALTH_STATE_TONE[props.state as HealthState]
  return <span className={`jh-badge-state jh-tone-${tone}`}>{label}</span>
}

/**
 * 调度归属的**唯一说法**。
 *
 * 修的是一个真实的状态矛盾：页面上原来同时显示「调度：未启动」和
 * 「下次运行：还有 9 小时」—— 用户无从判断定时到底有没有生效。
 * 根因是 `scheduling`（本实例在不在调度）与"有没有下次运行"是两件事，
 * 而它们被并排放在一个 KV 列表里，看起来就像互相矛盾。
 *
 * 现在合成**一句**主叙述：谁在负责调度、下次什么时候跑、以及为什么。
 */
interface ScheduleStory {
  owner: string
  tone: 'ok' | 'warn' | 'muted'
  /** 下一次自动运行的人话；`null` = 没有启用定时的方案。 */
  nextRun: string | null
  /** 为什么是这个归属（只读时给出下一步）。 */
  detail: string | null
}

function scheduleStoryOf(status: SchedulerStatusDto, now: Date): ScheduleStory {
  const nextRun =
    status.triggers.length === 0
      ? null
      : status.triggers
          .map((trigger) => {
            const at = new Date(trigger.nextRunAt)
            const jitter = formatJitter(trigger.jitterMs)
            return `${trigger.planName} ${formatClock(at)}（${formatRelative(at, now)}${jitter === null ? '' : ` · ${jitter}`}）`
          })
          .join(' / ')

  if (status.paused) {
    return {
      owner: '定时已暂停',
      tone: 'warn',
      // 暂停时不写"下次运行 还有 9 小时"那样的肯定句，而是明确标出前提
      nextRun: nextRun === null ? null : `恢复后会按：${nextRun}`,
      detail: '暂停只停「到点自动跑」，手动「立即采集」任何时候都能用。',
    }
  }

  if (status.readOnly) {
    return {
      owner: '由另一个窗口负责调度',
      tone: 'warn',
      // 归属是别人，所以这里说的是"那边会跑"，而不是"我们会跑" —— 这正是原来缺的那半句话
      nextRun: nextRun === null ? null : `那个窗口会在 ${nextRun} 自动采集`,
      detail:
        '同一台电脑只允许一个窗口真正去采集（否则会抢同一份浏览器登录态）。' +
        '本窗口可以看，但不能触发采集。',
    }
  }

  if (!status.scheduling) {
    return {
      owner: '本窗口负责调度，但还没启动',
      tone: 'warn',
      nextRun,
      detail: status.readOnlyReason ?? '数据层可能还没就绪，稍等几秒会自动开始。',
    }
  }

  return {
    owner: status.armed ? '本窗口负责调度，已排好下一次' : '本窗口负责调度',
    tone: 'ok',
    nextRun,
    detail: status.armed ? null : '当前没有启用定时的方案 —— 只会在你点「立即采集」时跑。',
  }
}

/**
 * U9 数据采集（§5.4 / §4.6.1 的界面落点，tab 显示「采集」）。
 *
 * 这一屏承载：采集方案配置、平台状态、触发与"为什么没跑"。
 *
 * ## 这次修掉的三类"界面把内部东西漏出来了"
 *
 *   1. **Markdown 当纯文本印**：文案里写了 `**强调**`，界面上直接显示星号。
 *      现在统一走 `InlineMd`（自写的十行行内解析，零新依赖，且**从不**用 HTML 直通 ——
 *      抓来的 JD 是不可信输入，走 HTML 就等于开了注入口子）。
 *   2. **源码 JSON 裸露**：方案条件原来渲染 `JSON.stringify(criteria)`，
 *      用户看到 `{"keyword":"Java","city":"深圳"}`。现在走 `describeCriteria`
 *      变成「关键词：Java · 城市：深圳」。
 *   3. **堆栈直出**：运行历史原来直接印 `errorMsg`，于是页面上是一串
 *      `page.evaluate: ReferenceError ... at ...`。现在走 `humanizeFailure`
 *      给一句"代码语法异常"+ 下一步建议，原始全文收进可展开的详情里（**不隐藏信息**）。
 *
 * 另外补上了原本是"死胡同"的租约提示：给出「重新检测」与「接管调度」两个动作，
 * 但接管**只在对方心跳过期时**才成功 —— 抢活着的实例会让两个调度器同时抓取。
 */
export function CollectScreen(props: { revision: number; onGoSettings: () => void }) {
  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision])
  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision])
  const plans = useAsync((signal) => fetchPlans(signal), [props.revision])
  const reasons = useAsync((signal) => fetchSkipReasons(signal), [props.revision])
  // 维度声明（SR-41）：既给编辑器渲染筛选器，也给方案列表把条件翻成人话
  const dimensions = useAsync((signal) => fetchCriteriaDimensions([], signal), [props.revision])
  const [feedback, setFeedback] = useState<Feedback>(IDLE)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [duplicates, setDuplicates] = useState<PlanDuplicateDto[]>([])

  const report = (error: unknown): void => {
    setFeedback({
      running: false,
      tone: 'error',
      message: error instanceof ApiError ? error.display : String(error),
    })
  }

  const reload = (): void => {
    scheduler.reload()
    platforms.reload()
    plans.reload()
    dimensions.reload()
  }

  const act = async (pending: string, run: () => Promise<string>): Promise<void> => {
    setFeedback({ running: true, tone: 'ok', message: pending })
    try {
      const done = await run()
      setFeedback({ running: false, tone: 'ok', message: done })
      reload()
    } catch (error) {
      report(error)
    }
  }

  const status: SchedulerStatusDto | null = scheduler.state.status === 'ok' ? scheduler.state.data : null
  const planList: PlanDto[] = plans.state.status === 'ok' ? plans.state.data.items : []
  const platformList: PlatformOverviewDto[] = platforms.state.status === 'ok' ? platforms.state.data.items : []
  const reasonText = reasons.state.status === 'ok' ? reasons.state.data.items : {}
  const dimensionList: CriteriaDimensionDto[] =
    dimensions.state.status === 'ok' ? dimensions.state.data.items : []

  // 每次数据刷新都重算一次"相对现在多久" —— 相对时间不重算就会一直显示旧值
  const now = useMemo(() => new Date(), [props.revision])
  const story = status === null ? null : scheduleStoryOf(status, now)

  const login = (platformId: string): Promise<void> =>
    act('已打开登录页，请在弹出的浏览器窗口里完成登录（每 3 秒检测一次）', async () => {
      const result = await startLogin(platformId)
      return result.message ?? '登录引导已启动'
    })

  const trigger = (plan: PlanDto): Promise<void> =>
    act('正在按方案采集…（会打开一个浏览器窗口）', async () => {
      const summary = await runPlan(plan.id)
      const state = CRAWL_STATE_LABEL[summary.run.state]
      return (
        `方案「${plan.name}」本轮 ${state}：命中 ${String(summary.run.found)} · ` +
        `新增 ${String(summary.run.inserted)} · 更新 ${String(summary.run.updated)} · ` +
        `隔离 ${String(summary.run.quarantined)}`
      )
    })

  const reasonFor = (skipReason: string | null): string | null =>
    skipReason === null ? null : (reasonText[skipReason] ?? skipReason)

  return (
    <div className="jh-screen">
      {scheduler.state.status === 'error' && (
        <div className="jh-card">
          <h2 className="jh-card-title">读不到采集状态</h2>
          <p className="jh-error">{scheduler.state.message}</p>
          <button type="button" className="jh-btn" onClick={scheduler.reload}>
            重试
          </button>
        </div>
      )}

      {feedback.message === null ? null : (
        <div className={`jh-card jh-card-tight ${feedback.tone === 'error' ? 'jh-card-error' : ''}`}>
          <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>
            <InlineMd text={feedback.message} />
          </p>
        </div>
      )}

      {/* ── 触发器与抑制（SR-30/26/28）────────────────────────────────── */}
      {status !== null && story !== null && (
        <section className="jh-card">
          <div className="jh-form-head">
            <h2 className="jh-card-title">触发与运行</h2>
            <span className="jh-spacer" />
            <button
              type="button"
              className={`jh-btn jh-btn-inline${status.paused ? ' jh-btn-primary' : ''}`}
              disabled={feedback.running}
              title={
                status.paused
                  ? '恢复「到点自动跑」。手动「立即采集」一直都能用。'
                  : '只停「到点自动跑」；手动「立即采集」不受影响。'
              }
              onClick={() =>
                void act(status.paused ? '正在恢复定时…' : '正在暂停定时…', async () => {
                  await setSchedulePaused(!status.paused)
                  return status.paused
                    ? '已恢复定时抓取。'
                    : '已暂停**定时**抓取。手动「立即采集」仍然可用。'
                })
              }
            >
              {status.paused ? '恢复定时' : '一键暂停定时'}
            </button>
          </div>

          {/* 一句话说清"定时到底生效没有" —— 原来这里是「调度：未启动」+「还有 9 小时」并存 */}
          <p className={`jh-story jh-story-${story.tone}`}>
            <b>{story.owner}</b>
            {story.nextRun === null ? ' —— 当前没有启用定时的方案。' : `：${story.nextRun}`}
          </p>
          {story.detail === null ? null : <p className="jh-note">{story.detail}</p>}

          {status.paused && (
            <p className="jh-warn">
              定时已暂停
              {status.pausedReason === null ? '' : `（${status.pausedReason}）`}。手动触发不受影响。
            </p>
          )}

          {/* ── 租约：把"死胡同"变成"下一步"（R20）────────────────────── */}
          <LeasePanel
            status={status}
            now={now}
            running={feedback.running}
            onRecheck={() =>
              void act('正在重新检测…', async () => {
                const next = await recheckLease()
                return next.lease.held
                  ? '已经拿到调度权，本窗口现在负责采集。'
                  : '那个窗口还在运行，本窗口仍是只读。'
              })
            }
            onTakeover={() =>
              void act('正在接管调度…', async () => {
                await takeoverLease()
                return '已接管调度，本窗口现在负责采集。'
              })
            }
          />

          <ul className="jh-kv">
            <li>
              <span>
                <Term term="新鲜度">上次成功</Term>
              </span>
              <span>
                {status.lastRunAt === null
                  ? '从来没有成功采集过'
                  : `${formatClock(new Date(status.lastRunAt))} · ${formatRelative(new Date(status.lastRunAt), now)}`}
              </span>
            </li>
            <li>
              <span>
                <Term term="时段">时区</Term>
              </span>
              <span title="排程按这台电脑的本地时间算。改了系统时区，下一次就算到新时区上。">
                {status.timezone}
              </span>
            </li>
          </ul>

          {/* SR-2：在场触发只提示，不自动跑 */}
          {status.refreshSuggested && status.refreshHint !== null && (
            <div className="jh-alert jh-alert-warn">
              <div className="jh-alert-head">
                <span className="jh-alert-title">数据偏旧，建议手动刷新一次</span>
              </div>
              <p className="jh-alert-body">
                <InlineMd text={status.refreshHint} />
              </p>
              <p className="jh-note">
                不会自动跑 —— 程序只在你在场时活着，所以这里只提示，由你决定。
              </p>
            </div>
          )}

          <RunHistoryTable
            runs={status.recentRuns}
            reasonFor={reasonFor}
            onGoSettings={props.onGoSettings}
            onRetry={() => {
              const first = planList.find((plan) => plan.enabled)
              if (first !== undefined) void trigger(first)
            }}
            retryDisabled={feedback.running || status.readOnly || planList.length === 0}
          />
        </section>
      )}

      {/* ── 采集方案配置（SR-38/40/41/43/44）───────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">采集方案</h2>
          <span className="jh-spacer" />
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={feedback.running}
            title="新建一个采集方案：决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。"
            onClick={() => {
              setDuplicates([])
              setEditing('new')
            }}
          >
            新增方案
          </button>
        </div>

        {planList.length === 0 ? (
          <p className="jh-muted">
            还没有方案。方案决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。
          </p>
        ) : (
          <ul className="jh-list jh-plan-list">
            {planList.map((plan) => {
              const planStatus = status?.planStatus.find((item) => item.planId === plan.id) ?? null
              const decision = planStatus?.lastDecision ?? null
              const runBlocked = feedback.running || (status?.readOnly ?? false)
              return (
                <li key={plan.id} className="jh-plan-item">
                  <div className="jh-plan-head">
                    <b>{plan.name}</b>
                    {planStatus === null ? null : (
                      <FreshnessBadge
                        level={planStatus.freshness.level}
                        hours={planStatus.freshness.hoursSinceSuccess}
                      />
                    )}
                    {planStatus?.riskPaused === true && (
                      <span className="jh-chip jh-chip-warn">
                        <Term term="风控暂停">风控暂停</Term>
                      </span>
                    )}
                    <span className="jh-spacer" />
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      disabled={feedback.running}
                      title="改这个方案抓什么、抓多深、什么时候抓。"
                      onClick={() => {
                        setDuplicates([])
                        setEditing(plan.id)
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      disabled={runBlocked}
                      title={
                        status?.readOnly === true
                          ? `本窗口没有调度权，无法触发采集。用下面的「接管调度」，或到另一个窗口（进程 ${String(
                              status.lease.pid ?? '?',
                            )}）里操作。`
                          : feedback.running
                            ? '有另一个操作正在进行，请稍候。'
                            : '现在按这个方案采集一次（会打开浏览器窗口）。'
                      }
                      onClick={() => void trigger(plan)}
                    >
                      立即采集
                    </button>
                    {planStatus?.riskPaused === true && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={feedback.running}
                        title="确认环境已恢复正常，允许这个方案重新被自动采集。系统不会自动恢复。"
                        onClick={() =>
                          void act('正在恢复…', async () => {
                            await resumePlanRisk(plan.id)
                            return `方案「${plan.name}」已恢复 —— 这一下是你确认的，系统不会自动恢复。`
                          })
                        }
                      >
                        确认恢复
                      </button>
                    )}
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-quiet"
                      disabled={feedback.running}
                      title="删除这个方案。已经抓到的岗位不受影响。"
                      onClick={() =>
                        void act('正在删除…', async () => {
                          await deletePlan(plan.id)
                          return `已删除方案「${plan.name}」。`
                        })
                      }
                    >
                      删除
                    </button>
                  </div>

                  {/* 条件：中文语义标签，而不是源码 JSON */}
                  <div className="jh-muted jh-plan-meta">
                    <span>{plan.platforms.join(' / ')}</span>
                    <CriteriaLine plan={plan} dimensions={dimensionList} />
                  </div>
                  <div className="jh-muted jh-plan-meta">
                    <span>
                      {plan.schedule.enabled
                        ? `${formatWeekdays(plan.schedule.weekdays)} ${formatWindow(
                            plan.schedule.windowStartHour,
                            plan.schedule.windowStartMinute,
                            plan.schedule.windowEndHour,
                            plan.schedule.windowEndMinute,
                          )}`
                        : '不定时'}
                    </span>
                    <span>{plan.enabled ? '已启用' : '已停用'}</span>
                    <span>
                      {plan.postProcess.score ? '打分' : '不打分'} ·{' '}
                      {plan.postProcess.flag ? '标注' : '不标注'} ·{' '}
                      {plan.postProcess.dedup ? '去重' : '不去重'}
                    </span>
                  </div>

                  {decision === null ? null : (
                    <div className={decision.decision === 'skipped' ? 'jh-warn' : 'jh-muted'}>
                      {decision.decision === 'skipped'
                        ? `上次到点没跑：${decision.message ?? decision.reason ?? '原因未知'}`
                        : decision.decision === 'ran'
                          ? '上次到点跑了'
                          : '还在等下一个时段'}
                    </div>
                  )}
                  {planStatus !== null && planStatus.backoffUntil !== null && (
                    <div className="jh-warn">
                      <Term term="退避">正在退避</Term>，最早{' '}
                      {formatClock(new Date(planStatus.backoffUntil))} 再试（连续失败{' '}
                      {planStatus.failStreak} 次）
                    </div>
                  )}
                  {planStatus?.riskReason === null || planStatus?.riskReason === undefined ? null : (
                    <div className="jh-error">{planStatus.riskReason}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── 方案编辑（能力驱动的筛选器，SR-41/42）────────────────────────── */}
      {editing === null ? null : (
        <PlanEditor
          key={String(editing)}
          planId={editing === 'new' ? null : editing}
          initial={
            editing === 'new'
              ? emptyForm(platformList.map((item) => item.id))
              : formOf(planList.find((plan) => plan.id === editing) as PlanDto)
          }
          available={platformList.map((item) => ({ id: item.id, displayName: item.displayName }))}
          duplicates={duplicates}
          running={feedback.running}
          onCancel={() => setEditing(null)}
          onSubmit={async (form) => {
            setFeedback({ running: true, tone: 'ok', message: '正在保存…' })
            try {
              const input = writeOf(form)
              const result = editing === 'new' ? await createPlan(input) : await updatePlan(editing, input)
              setDuplicates(result.duplicates)
              const verb = editing === 'new' ? '已创建' : '已保存'
              setFeedback({
                running: false,
                tone: 'ok',
                message:
                  result.duplicates.length === 0
                    ? `${verb}方案「${result.plan.name}」。`
                    : `${verb}方案「${result.plan.name}」。注意：与 ${result.duplicates
                        .map((item) => `#${String(item.planId)}「${item.name}」`)
                        .join('、')} 条件重复（**只提示，不会自动合并**）。`,
              })
              if (result.duplicates.length === 0) setEditing(null)
              reload()
            } catch (error) {
              report(error)
            }
          }}
          onValidate={async (form) => {
            if (editing === 'new') return []
            const result = await validatePlan(editing, writeOf(form))
            return result.duplicates
          }}
        />
      )}

      {/* ── 平台状态（从「今日」整块搬过来，SR-16）────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">平台状态</h2>
        {platforms.state.status === 'error' && <p className="jh-error">{platforms.state.message}</p>}
        {platformList.length === 0 ? (
          <p className="jh-muted">还没有注册平台。</p>
        ) : (
          <ul className="jh-list">
            {platformList.map((item) => {
              const missing = item.fields.filter((field) => field.consecutiveMiss > 0)
              return (
                <li key={item.id}>
                  <code>{item.id}</code> · <StateBadge state={item.health} kind="health" />
                  {' · '}
                  <span className={item.account.loggedIn ? 'jh-ok' : 'jh-warn'}>
                    {item.account.loggedIn ? '已登录' : '未登录'}
                  </span>
                  {' · '}
                  {item.login.state === 'running' ? (
                    <span className="jh-warn">登录检测中…</span>
                  ) : (
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      disabled={feedback.running}
                      title={
                        feedback.running
                          ? '有另一个操作正在进行，请稍候。'
                          : '打开登录页，在弹出的浏览器窗口里完成登录。'
                      }
                      onClick={() => void login(item.id)}
                    >
                      登录
                    </button>
                  )}
                  {item.login.message === null ? null : <div className="jh-muted">{item.login.message}</div>}
                  {item.account.hint === null ? null : <div className="jh-muted">{item.account.hint}</div>}
                  {item.healthReason === null ? null : <div className="jh-muted">{item.healthReason}</div>}

                  {/* SR-16/41：逐字段健康 —— "哪个字段整页缺了"比"适配器坏了"有用得多 */}
                  {missing.length === 0 ? null : (
                    <div className="jh-warn">
                      <Term term="逐字段健康">连续缺失</Term>：
                      {missing
                        .map((field) => `${field.field}×${String(field.consecutiveMiss)}`)
                        .join(' · ')}
                    </div>
                  )}
                  {missing.length === 0 ? null : (
                    <Troubleshooting
                      text={humanizeFailure('NO_RECORDS', null)}
                      onGoSettings={props.onGoSettings}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * 条件的一行中文呈现。
 *
 * 修的是"源码 JSON 裸露"：原来这里是 `JSON.stringify(plan.criteria)`，
 * 用户看到 `{"keyword":"Java","city":"深圳"}` —— 那是给机器看的。
 * 现在渲染成「关键词：Java · 城市：深圳」，取值域里的值还会翻成中文
 * （`sort: "2"` → 「排序方式：最新发布」）。
 */
function CriteriaLine(props: { plan: PlanDto; dimensions: readonly CriteriaDimensionLike[] }) {
  // 只喂**这个方案选中平台**声明过的维度，避免用别的平台的取值域去翻译
  const scoped: CriteriaDimensionLike[] = props.dimensions.filter((dimension) => {
    const item = props.plan.criteria[dimension.key]
    return item !== undefined
  })
  const items = describeCriteria(props.plan.criteria, scoped)
  if (items.length === 0) return <span className="jh-muted">条件：不限</span>
  return (
    <span>
      {items.map((item, index) => (
        <span key={item.key}>
          {index === 0 ? '' : ' · '}
          {item.label}：<b>{item.display}</b>
        </span>
      ))}
    </span>
  )
}

/**
 * 租约面板（R20）。
 *
 * 原来的文案是「非租约持有者连手动跑也会被拒绝」—— 一句**死胡同**话：
 * 用户知道了原因，但没有任何下一步。这里补上两个动作：
 *   * **重新检测**：对方刚被关掉时立刻重试（原来要干等最长 90 秒心跳过期）；
 *   * **接管调度**：只在对方心跳**已过期**时才可用 —— 抢一个还活着的实例
 *     会让两个调度器同时抓取，那正是这把锁要防的事，所以它不能是"强抢"按钮。
 *     对方活着时按钮置灰，并用 `title` 说清为什么、以及该怎么做。
 */
function LeasePanel(props: {
  status: SchedulerStatusDto
  now: Date
  running: boolean
  onRecheck: () => void
  onTakeover: () => void
}) {
  const { lease } = props.status
  const heartbeat =
    lease.heartbeatAt === null ? null : new Date(lease.heartbeatAt)
  const takeoverPossible = !lease.held && lease.stale

  return (
    <div className={`jh-lease${lease.held ? ' jh-lease-ok' : ' jh-lease-warn'}`}>
      <div className="jh-lease-head">
        <b>{lease.held ? '本窗口负责采集' : '本窗口只读'}</b>
        <span className="jh-muted">
          {lease.held ? (
            <>
              （本窗口 <Term term="pid">进程</Term> {String(lease.pid ?? '?')}）
            </>
          ) : (
            <>
              （另一个窗口 <Term term="pid">进程</Term> {String(lease.pid ?? '?')} 正在运行
              {heartbeat === null ? '' : `，${formatRelative(heartbeat, props.now)}还有心跳`}）
            </>
          )}
        </span>
        <span className="jh-spacer" />
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-tiny"
          disabled={props.running}
          title="立刻再检查一次是否该轮到本窗口采集（不用等 90 秒心跳过期）。"
          onClick={props.onRecheck}
        >
          重新检测
        </button>
        {lease.held ? null : (
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-tiny"
            disabled={props.running || !takeoverPossible}
            title={
              takeoverPossible
                ? '对方的心跳已经过期（很可能已被强杀）。点这里把采集权拿过来。'
                : `另一个窗口（进程 ${String(lease.pid ?? '?')}）还活着，不能抢它的采集权 —— ` +
                  '两个窗口同时采集会抢同一份浏览器登录态。请在那个窗口里操作，或先把它关掉，' +
                  '然后点「重新检测」（关掉后最多 90 秒会自动接管，不需要重启）。'
            }
            onClick={props.onTakeover}
          >
            接管调度
          </button>
        )}
      </div>
      {lease.held ? null : (
        <p className="jh-note">
          <InlineMd text="怎么解决：① 到那个窗口里操作（最稳）；② 关掉那个窗口 —— 关掉之后这里会**自动**接管，不用重启，也可以点「重新检测」立刻试一次。" />
        </p>
      )}
    </div>
  )
}

/**
 * 最近运行小表（SR-28）。
 *
 * 三处布局/表达上的修正：
 *   * **「触发」列全为 `—` 时整列隐藏** —— 一列全是空的占位符只会挤掉"原因"的宽度；
 *   * 数值列右对齐（`.jh-num` + 等宽数字），便于纵向比对；
 *   * 状态用中文徽章，原因用 `humanizeFailure` 的人话 + 可展开的原始信息。
 */
function RunHistoryTable(props: {
  runs: RecentRunDto[]
  reasonFor: (skipReason: string | null) => string | null
  onGoSettings: () => void
  onRetry: () => void
  retryDisabled: boolean
}) {
  if (props.runs.length === 0) {
    return (
      <>
        <h3 className="jh-sub-title">最近运行</h3>
        <p className="jh-muted">还没有运行记录。</p>
      </>
    )
  }

  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null)

  return (
    <>
      <h3 className="jh-sub-title">最近运行</h3>
      <table className="jh-table jh-table-runs">
        <thead>
          <tr>
            <th>开始</th>
            <th>状态</th>
            {showReason ? <th>触发</th> : null}
            <th className="jh-num">新增</th>
            <th className="jh-num">更新</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => {
            const skip = props.reasonFor(run.skipReason)
            const failure: FailureText | null =
              skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null
            return (
              <tr key={run.id}>
                <td title={new Date(run.startedAt).toLocaleString()}>
                  {formatClock(new Date(run.startedAt))}
                </td>
                <td>
                  <StateBadge state={run.state} kind="run" />
                </td>
                {showReason ? <td>{runReasonLabel(run.reason) ?? '—'}</td> : null}
                <td className="jh-num">{run.inserted}</td>
                <td className="jh-num">{run.updated}</td>
                <td>
                  {skip !== null ? (
                    <span>{skip}</span>
                  ) : failure === null ? (
                    <span className="jh-muted">—</span>
                  ) : (
                    <>
                      <span className={failure.kind === 'unknown' ? 'jh-warn' : 'jh-error'}>
                        {failure.short}
                      </span>
                      {failure.looksTechnical ? (
                        <span className="jh-chip jh-chip-quiet">{FAILURE_KIND_LABEL[failure.kind]}</span>
                      ) : null}
                      <details className="jh-details">
                        {/* 原始信息**完整保留**在可展开处：简化显示不等于藏起来 */}
                        <summary>详情与排查</summary>
                        <p className="jh-note">{failure.advice}</p>
                        {failure.detail === null ? null : (
                          <>
                            <span className="jh-note">原始信息（技术细节）：</span>
                            <pre className="jh-pre">{failure.detail}</pre>
                          </>
                        )}
                        <div className="jh-details-actions">
                          <button
                            type="button"
                            className="jh-btn jh-btn-inline jh-btn-tiny"
                            disabled={props.retryDisabled}
                            title={
                              props.retryDisabled
                                ? '本窗口没有调度权，或已有操作在进行 —— 先在另一个窗口里重试。'
                                : '立刻再跑一次，看是否已经恢复。'
                            }
                            onClick={props.onRetry}
                          >
                            再跑一次
                          </button>
                          <button
                            type="button"
                            className="jh-btn jh-btn-inline jh-btn-tiny"
                            onClick={props.onGoSettings}
                          >
                            去设置看诊断
                          </button>
                        </div>
                      </details>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

/** 「排查方案」折叠块（异常指引的落点）。 */
function Troubleshooting(props: { text: FailureText | null; onGoSettings: () => void }) {
  const advice = props.text === null ? adviceForFailure('selector') : props.text.advice
  return (
    <details className="jh-details">
      <summary>排查方案</summary>
      <p className="jh-note">{advice}</p>
      <div className="jh-details-actions">
        <button type="button" className="jh-btn jh-btn-inline jh-btn-tiny" onClick={props.onGoSettings}>
          去设置看诊断
        </button>
      </div>
    </details>
  )
}

/** 方案编辑器：筛选器按**适配器声明**渲染（SR-41）。 */
function PlanEditor(props: {
  planId: number | null
  initial: PlanForm
  available: Array<{ id: string; displayName: string }>
  duplicates: PlanDuplicateDto[]
  running: boolean
  onCancel(): void
  onSubmit(form: PlanForm): Promise<void>
  onValidate(form: PlanForm): Promise<PlanDuplicateDto[]>
}) {
  const [form, setForm] = useState<PlanForm>(props.initial)
  const [localDuplicates, setLocalDuplicates] = useState<PlanDuplicateDto[]>([])

  const dimensions = useAsync(
    (signal) => fetchCriteriaDimensions(form.platforms, signal),
    [form.platforms.join(',')],
  )
  const items: CriteriaDimensionDto[] = dimensions.state.status === 'ok' ? dimensions.state.data.items : []

  const patch = (next: Partial<PlanForm>): void => setForm((current) => ({ ...current, ...next }))

  const togglePlatform = (id: string): void => {
    const next = form.platforms.includes(id)
      ? form.platforms.filter((item) => item !== id)
      : [...form.platforms, id]
    patch({ platforms: next })
  }

  const setCriteria = (key: string, value: string): void => {
    const next = { ...form.criteria }
    if (value === '') delete next[key]
    else next[key] = value
    patch({ criteria: next })
  }

  const duplicates = [...props.duplicates, ...localDuplicates]

  return (
    <section className="jh-card jh-card-editing">
      <div className="jh-form-head">
        <h2 className="jh-card-title">{props.planId === null ? '新增方案' : '编辑方案'}</h2>
        <span className="jh-spacer" />
        <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={props.onCancel}>
          取消
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={props.running}
          title={props.running ? '正在保存，请稍候。' : '保存这个方案（与模型工具、接口走同一套校验）。'}
          onClick={() => void props.onSubmit(form)}
        >
          保存
        </button>
      </div>

      <label className="jh-field">
        <span>方案名</span>
        <input
          className="jh-input"
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>

      <div className="jh-field">
        <span>平台（来自已注册的适配器）</span>
        <div className="jh-chips">
          {props.available.length === 0 ? (
            <span className="jh-muted">还没有已注册的平台。</span>
          ) : (
            props.available.map((item) => (
              <label key={item.id} className="jh-check">
                <input
                  type="checkbox"
                  checked={form.platforms.includes(item.id)}
                  onChange={() => togglePlatform(item.id)}
                />
                {item.displayName}（<code>{item.id}</code>）
              </label>
            ))
          )}
        </div>
      </div>

      {/* SR-41：不支持的维度**禁用而非隐藏**，并给出原因 */}
      <div className="jh-grid2">
        {items.map((dimension) => {
          const value = form.criteria[dimension.key] ?? ''
          return (
            <label className="jh-field" key={dimension.key}>
              <span>
                {dimension.label}
                {dimension.supported ? '' : '（当前平台不支持）'}
              </span>
              {dimension.numeric ? (
                <input
                  className="jh-input"
                  type="number"
                  min={1}
                  max={dimension.max ?? undefined}
                  disabled={!dimension.supported}
                  value={value}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                />
              ) : dimension.values.length === 0 ? (
                <input
                  className="jh-input"
                  disabled={!dimension.supported}
                  value={value}
                  placeholder={dimension.supported ? '自由文本' : (dimension.disabledReason ?? '不支持')}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                />
              ) : (
                <select
                  className="jh-select"
                  disabled={!dimension.supported}
                  value={value}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                >
                  <option value="">（不限）</option>
                  {dimension.values.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <span className="jh-note">
                {dimension.supported ? dimension.hint : (dimension.disabledReason ?? dimension.hint)}
              </span>
            </label>
          )
        })}
      </div>

      {/* SR-1/32：偏好时段，**没有单点时刻**这一项 */}
      <fieldset className="jh-fieldset">
        <legend>
          偏好<InlineMd text="**时段**" />（本地时间，时段内随机选点）
        </legend>
        <div className="jh-grid3">
          <label className="jh-field">
            <span>起（时）</span>
            <input
              className="jh-input"
              type="number"
              min={0}
              max={23}
              value={form.windowStartHour}
              onChange={(event) => patch({ windowStartHour: Number(event.target.value) })}
            />
          </label>
          <label className="jh-field">
            <span>起（分）</span>
            <input
              className="jh-input"
              type="number"
              min={0}
              max={59}
              value={form.windowStartMinute}
              onChange={(event) => patch({ windowStartMinute: Number(event.target.value) })}
            />
          </label>
          <label className="jh-field">
            <span>止（时）</span>
            <input
              className="jh-input"
              type="number"
              min={0}
              max={23}
              value={form.windowEndHour}
              onChange={(event) => patch({ windowEndHour: Number(event.target.value) })}
            />
          </label>
          <label className="jh-field">
            <span>止（分）</span>
            <input
              className="jh-input"
              type="number"
              min={0}
              max={59}
              value={form.windowEndMinute}
              onChange={(event) => patch({ windowEndMinute: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="jh-field">
          <span>工作日（不选 = 每天）</span>
          <div className="jh-chips">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, day) => (
              <label key={label} className="jh-check">
                <input
                  type="checkbox"
                  checked={form.weekdays.includes(day)}
                  onChange={() => {
                    const next = form.weekdays.includes(day)
                      ? form.weekdays.filter((item) => item !== day)
                      : [...form.weekdays, day].sort((a, b) => a - b)
                    patch({ weekdays: next })
                  }}
                />
                周{label}
              </label>
            ))}
          </div>
        </div>
        <label className="jh-check">
          <input
            type="checkbox"
            checked={form.scheduleEnabled}
            onChange={(event) => patch({ scheduleEnabled: event.target.checked })}
          />
          启用定时
        </label>
        <p className="jh-note">
          具体到哪一分钟会在上面这段时间里
          <Term term="抖动">随机浮动</Term>
          。<InlineMd text="这里**没有**「精确到某分某秒」的选项" />
          —— 每天固定同一分钟去访问，最容易被平台识别成自动化。
        </p>
      </fieldset>

      {/* SR-44：抓取后处理开关 */}
      <fieldset className="jh-fieldset">
        <legend>抓取后处理（默认全开）</legend>
        <div className="jh-chips">
          <label className="jh-check" title="算出「这个岗位跟你简历有多匹配」并给出逐条理由。关掉后岗位库里不再显示匹配分。">
            <input
              type="checkbox"
              checked={form.score}
              onChange={(event) => patch({ score: event.target.checked })}
            />
            打分
          </label>
          <label className="jh-check" title="识别「疑似外包 / 高风险 / 僵尸岗位 / 薪资虚标 / 行业黑话」并标出来。">
            <input
              type="checkbox"
              checked={form.flag}
              onChange={(event) => patch({ flag: event.target.checked })}
            />
            风险与黑话标注
          </label>
          <label
            className="jh-check"
            title="同一个岗位出现在多个招聘平台时合并成一条。目前只接了一个平台，所以它暂时不会生效。"
          >
            <input
              type="checkbox"
              checked={form.dedup}
              onChange={(event) => patch({ dedup: event.target.checked })}
            />
            跨平台去重
          </label>
        </div>
      </fieldset>

      {duplicates.length === 0 ? null : (
        <p className="jh-warn">
          与 {duplicates.map((item) => `#${String(item.planId)}「${item.name}」`).join('、')} 条件重复（
          {duplicates[0]?.reason ?? ''}）。
          <InlineMd text="**只提示，不会自动合并**" />
          —— 合并会替你把两个意图抹成一个。
        </p>
      )}
      <button
        type="button"
        className="jh-btn jh-btn-inline"
        disabled={props.running}
        title="先检查这份配置与现有方案是否重复；不会写入任何东西。"
        onClick={() => {
          void props
            .onValidate(form)
            .then((result) => setLocalDuplicates(result))
            .catch(() => setLocalDuplicates([]))
        }}
      >
        检查重复
      </button>
    </section>
  )
}
