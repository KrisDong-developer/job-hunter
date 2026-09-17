import { useMemo, useState } from 'react'
import type { PlanDto, PlanSchedule, SchedulerStatusDto } from '../../shared/dto.js'
import { formatClock, formatJitter, formatRelative, formatWeekdays } from '../../shared/time-format.js'
import {
  ApiError,
  createPlan,
  deletePlan,
  fetchCriteriaDimensions,
  fetchPlans,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchSkipReasons,
  resumePlanRisk,
  runPlan,
  setSchedulePaused,
  startLogin,
  updatePlan,
  validatePlan,
  type CriteriaDimensionDto,
  type PlanDuplicateDto,
  type PlanWriteInput,
  type PlatformOverviewDto,
} from '../api.js'
import { useAsync } from '../use-async.js'
import { FreshnessBadge } from './freshness.js'

interface Feedback {
  running: boolean
  tone: 'ok' | 'error'
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

/** 表单 → 写入体。**只发改过的东西**由调用方决定，这里给的是完整形状。 */
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
 * U9 数据采集（§5.4 / §4.6.1 的界面落点，tab 显示「采集」）。
 *
 * **不新造页面**：这一屏就是 ARCHITECTURE §5.4 早就规划好的 U9「平台与适配器」，
 * 因为采集方案的配置、平台状态、触发与"为什么没跑"本来就该在这一屏，
 * 而不是全挤进「今日」。今日回答"今天干什么"，这里回答"系统怎么采"。
 *
 * 三件事在这一屏同时成立：
 *   1. **能力驱动的 UI**（SR-41）：筛选器按适配器声明渲染，不支持的**禁用而非隐藏**并给原因；
 *   2. **每条"没跑"都有原因**（SR-17/26）：不再只显示一句"已武装"；
 *   3. **配置三条入口对等**（SR-45）：这里的保存与模型工具、与 HTTP 走**同一份校验**，
 *      所以"界面拦住了、对话里绕过去"不可能发生。
 */
export function CollectScreen(props: { revision: number }) {
  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision])
  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision])
  const plans = useAsync((signal) => fetchPlans(signal), [props.revision])
  const reasons = useAsync((signal) => fetchSkipReasons(signal), [props.revision])
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

  // 每次数据刷新都重算一次"相对现在多久" —— 相对时间不重算就会一直显示旧值
  const now = useMemo(() => new Date(), [props.revision])

  const login = (platformId: string): Promise<void> =>
    act('已打开登录页，请在弹出的浏览器窗口里完成登录（每 3 秒检测一次）', async () => {
      const result = await startLogin(platformId)
      return result.message ?? '登录引导已启动'
    })

  const trigger = (plan: PlanDto): Promise<void> =>
    act('正在按方案采集…（会打开一个浏览器窗口）', async () => {
      const summary = await runPlan(plan.id)
      return (
        `方案「${plan.name}」本轮 ${summary.run.state}：命中 ${String(summary.run.found)} · ` +
        `新增 ${String(summary.run.inserted)} · 更新 ${String(summary.run.updated)} · ` +
        `隔离 ${String(summary.run.quarantined)}`
      )
    })

  return (
    <div className="jh-screen">
      {scheduler.state.status === 'error' && (
        <div className="jh-card">
          <h2 className="jh-card-title">读不到采集状态</h2>
          <p className="jh-error">{scheduler.state.message}</p>
          <button type="button" className="jh-btn" onClick={scheduler.reload}>重试</button>
        </div>
      )}

      {feedback.message === null ? null : (
        <div className={`jh-card jh-card-tight ${feedback.tone === 'error' ? 'jh-card-error' : ''}`}>
          <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>{feedback.message}</p>
        </div>
      )}

      {/* ── 触发器与抑制（SR-30/26/28）────────────────────────────────── */}
      {status !== null && (
        <section className="jh-card">
          <div className="jh-form-head">
            <h2 className="jh-card-title">触发与运行</h2>
            <span className="jh-spacer" />
            <button
              type="button"
              className={`jh-btn jh-btn-inline${status.paused ? ' jh-btn-primary' : ''}`}
              disabled={feedback.running}
              onClick={() =>
                void act(status.paused ? '正在恢复定时…' : '正在暂停定时…', async () => {
                  await setSchedulePaused(!status.paused)
                  return status.paused
                    ? '已恢复定时抓取。'
                    : '已暂停**定时**抓取。手动「立即采集」仍然可用（SR-30）。'
                })
              }
            >
              {status.paused ? '恢复定时' : '一键暂停定时'}
            </button>
          </div>

          {status.readOnly && (
            <p className="jh-error">
              本实例只读：{status.readOnlyReason ?? '另一个实例正在运行'}。
              非租约持有者**连手动跑也会被拒绝**（R20）。
            </p>
          )}
          {status.paused && (
            <p className="jh-warn">
              定时已暂停{status.pausedReason === null ? '' : `（${status.pausedReason}）`}。手动触发不受影响。
            </p>
          )}

          <ul className="jh-kv">
            <li>
              <span>下次运行</span>
              <span>
                {status.triggers.length === 0
                  ? '—（没有启用定时的方案）'
                  : status.triggers
                      .map((trigger) => {
                        const at = new Date(trigger.nextRunAt)
                        const jitter = formatJitter(trigger.jitterMs)
                        return (
                          `${trigger.planName} ${formatClock(at)}（${formatRelative(at, now)}` +
                          `${jitter === null ? '' : ` · ${jitter}`}）`
                        )
                      })
                      .join(' / ')}
              </span>
            </li>
            <li>
              <span>上次成功</span>
              <span>
                {status.lastRunAt === null
                  ? '—（从来没有成功采集过）'
                  : `${formatClock(new Date(status.lastRunAt))} · ${formatRelative(new Date(status.lastRunAt), now)}`}
              </span>
            </li>
            <li>
              <span>调度</span>
              <span>
                {status.paused
                  ? '已暂停'
                  : status.scheduling
                    ? status.armed
                      ? '已武装'
                      : '等待方案启用'
                    : '未启动'}
              </span>
            </li>
            <li>
              <span>时区</span>
              <span>{status.timezone}（按本地墙钟排程，SR-5）</span>
            </li>
            <li>
              <span>租约</span>
              <span>
                {status.lease.held
                  ? `本实例持有（pid ${String(status.lease.pid ?? '?')}）`
                  : `他人持有（pid ${String(status.lease.pid ?? '?')}）`}
              </span>
            </li>
          </ul>

          {/* SR-2：在场触发只**提示**，绝不自动跑 */}
          {status.refreshSuggested && status.refreshHint !== null && (
            <div className="jh-alert jh-alert-warn">
              <div className="jh-alert-head">
                <span className="jh-alert-title">数据偏旧，建议手动刷新一次</span>
              </div>
              <p className="jh-alert-body">{status.refreshHint}</p>
              <p className="jh-note">
                不会自动跑 —— 插件只在你在场时活着，所以这里只提示，由你决定（SR-2 / C9）。
              </p>
            </div>
          )}

          {/* SR-28：最近几次运行：时间/状态/新增/失败原因/触发原因 */}
          <h3 className="jh-sub-title">最近运行</h3>
          {status.recentRuns.length === 0 ? (
            <p className="jh-muted">还没有运行记录。</p>
          ) : (
            <table className="jh-table">
              <thead>
                <tr>
                  <th>开始</th>
                  <th>状态</th>
                  <th>触发</th>
                  <th>新增</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {status.recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{formatClock(new Date(run.startedAt))}</td>
                    <td className={run.state === 'ok' ? 'jh-ok' : 'jh-warn'}>{run.state}</td>
                    <td>{run.reason ?? '—'}</td>
                    <td>{run.inserted}</td>
                    <td className="jh-muted">
                      {run.skipReason === null
                        ? (run.errorMsg ?? '—')
                        : (reasonText[run.skipReason] ?? run.skipReason)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
            onClick={() => {
              setDuplicates([])
              setEditing('new')
            }}
          >
            新增方案
          </button>
        </div>

        {planList.length === 0 ? (
          <p className="jh-muted">还没有方案。方案决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。</p>
        ) : (
          <ul className="jh-list jh-plan-list">
            {planList.map((plan) => {
              const planStatus = status?.planStatus.find((item) => item.planId === plan.id) ?? null
              const decision = planStatus?.lastDecision ?? null
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
                    {planStatus?.riskPaused === true && <span className="jh-chip jh-chip-warn">风控暂停</span>}
                    <span className="jh-spacer" />
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      disabled={feedback.running}
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
                      disabled={feedback.running || (status?.readOnly ?? false)}
                      onClick={() => void trigger(plan)}
                    >
                      立即采集
                    </button>
                    {planStatus?.riskPaused === true && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={feedback.running}
                        onClick={() =>
                          void act('正在恢复…', async () => {
                            await resumePlanRisk(plan.id)
                            return `方案「${plan.name}」已恢复 —— 系统不会自动恢复，这一下是你确认的（SR-21）。`
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
                  <div className="jh-muted">
                    {plan.platforms.join(' / ')} · {JSON.stringify(plan.criteria)} ·{' '}
                    {plan.schedule.enabled
                      ? `${formatWeekdays(plan.schedule.weekdays)} ${String(plan.schedule.windowStartHour).padStart(2, '0')}:${String(plan.schedule.windowStartMinute).padStart(2, '0')}–${String(plan.schedule.windowEndHour).padStart(2, '0')}:${String(plan.schedule.windowEndMinute).padStart(2, '0')}（时段内随机）`
                      : '不定时'}{' '}
                    · {plan.enabled ? '已启用' : '已停用'}
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
                      正在退避，最早 {formatClock(new Date(planStatus.backoffUntil))} 再试（连续失败{' '}
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
              if (editing === 'new') {
                const result = await createPlan(input)
                setDuplicates(result.duplicates)
                setFeedback({
                  running: false,
                  tone: 'ok',
                  message:
                    result.duplicates.length === 0
                      ? `已创建方案「${result.plan.name}」。`
                      : `已创建方案「${result.plan.name}」。注意：与 ${result.duplicates.map((item) => `#${String(item.planId)}「${item.name}」`).join('、')} 条件重复（只提示，不自动合并，SR-43）。`,
                })
                // 有重复时留在编辑态把提示显示清楚，否则关掉
                if (result.duplicates.length === 0) setEditing(null)
              } else {
                const result = await updatePlan(editing, input)
                setDuplicates(result.duplicates)
                setFeedback({
                  running: false,
                  tone: 'ok',
                  message:
                    result.duplicates.length === 0
                      ? `已保存方案「${result.plan.name}」。`
                      : `已保存。注意：与 ${result.duplicates.map((item) => `#${String(item.planId)}「${item.name}」`).join('、')} 条件重复（只提示，不自动合并，SR-43）。`,
                })
                if (result.duplicates.length === 0) setEditing(null)
              }
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
            {platformList.map((item) => (
              <li key={item.id}>
                <code>{item.id}</code> · <b className={item.health === 'healthy' ? 'jh-ok' : 'jh-error'}>{item.health}</b>
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
                    onClick={() => void login(item.id)}
                  >
                    登录
                  </button>
                )}
                {item.login.message === null ? null : <div className="jh-muted">{item.login.message}</div>}
                {item.account.hint === null ? null : <div className="jh-muted">{item.account.hint}</div>}
                {item.healthReason === null ? null : <div className="jh-muted">{item.healthReason}</div>}
                {/* SR-41：逐字段健康 —— "哪个字段整页缺了"比"适配器坏了"有用得多 */}
                {item.fields.filter((field) => field.consecutiveMiss > 0).length === 0 ? null : (
                  <div className="jh-warn">
                    连续缺失：
                    {item.fields
                      .filter((field) => field.consecutiveMiss > 0)
                      .map((field) => `${field.field}×${String(field.consecutiveMiss)}`)
                      .join(' · ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
        <span>平台（来自注册表，SR-39）</span>
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
        <legend>偏好时段（本地时间，时段内随机选点）</legend>
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
          起止相同表示跨零点时的零长度窗口会被自动纠正成一小时。**这里没有"精确到某分某秒"的选项**
          ——固定时刻是最容易被识别的模式（SR-1 / SR-32）。
        </p>
      </fieldset>

      {/* SR-44：抓取后处理开关 */}
      <fieldset className="jh-fieldset">
        <legend>抓取后处理（默认全开）</legend>
        <div className="jh-chips">
          <label className="jh-check">
            <input type="checkbox" checked={form.score} onChange={(event) => patch({ score: event.target.checked })} />
            打分（关掉后不写 match_score）
          </label>
          <label className="jh-check">
            <input type="checkbox" checked={form.flag} onChange={(event) => patch({ flag: event.target.checked })} />
            风险/黑话标注
          </label>
          <label className="jh-check">
            <input type="checkbox" checked={form.dedup} onChange={(event) => patch({ dedup: event.target.checked })} />
            跨平台去重
          </label>
        </div>
      </fieldset>

      {props.duplicates.length === 0 && localDuplicates.length === 0 ? null : (
        <p className="jh-warn">
          与 {[...props.duplicates, ...localDuplicates].map((item) => `#${String(item.planId)}「${item.name}」`).join('、')}{' '}
          条件重复（{props.duplicates[0]?.reason ?? localDuplicates[0]?.reason ?? ''}）。
          **只提示，不会自动合并** —— 合并会替你把两个意图抹成一个（SR-43）。
        </p>
      )}
      <button
        type="button"
        className="jh-btn jh-btn-inline"
        disabled={props.running}
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
