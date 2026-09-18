import { useEffect, useMemo, useState } from 'react'
import {
  CRAWL_STATE_LABEL,
  CRAWL_STATE_TONE,
  HEALTH_STATE_LABEL,
  HEALTH_STATE_TONE,
  MATURITY_LEVEL_LABEL,
  maturityNeedsWarning,
  runReasonLabel,
  type CrawlState,
  type HealthState,
} from '../../shared/enums.js'
import {
  FAILURE_KIND_LABEL,
  humanizeFailure,
  type FailureText,
} from '../../shared/error-text.js'
import { describeCriteria, type CriteriaDimensionLike } from '../../shared/criteria-label.js'
import type { PlanDto, PlanSchedule, RecentRunDto, SchedulerStatusDto } from '../../shared/dto.js'
import {
  WEEKDAY_PRESETS,
  clockValueOf,
  formatClock,
  formatJitter,
  formatRelative,
  formatWeekdays,
  formatWindow,
  parseClockValue,
} from '../../shared/time-format.js'
import {
  ApiError,
  createPlan,
  deletePlan,
  deleteDedupGroup,
  fetchCriteriaDimensions,
  fetchDedupGroups,
  fetchPlans,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchSkipReasons,
  recheckLease,
  resumePlanRisk,
  runPlan,
  setSchedulePaused,
  splitDedupMember,
  startLogin,
  takeoverLease,
  updatePlan,
  validatePlan,
  validatePlanDraft,
  type CriteriaDimensionDto,
  type PlanDuplicateDto,
  type PlanWriteInput,
  type PlatformOverviewDto,
} from '../api.js'
import { useAsync } from '../use-async.js'
import { FieldHint } from '../field-hint.js'
import { InlineMd } from '../inline-md.js'
import { Modal } from '../modal.js'
import { Term } from '../terms.js'
import { FreshnessBadge } from './freshness.js'

interface Feedback {
  running: boolean
  tone: 'ok' | 'error'
  message: string | null
}

const IDLE: Feedback = { running: false, tone: 'ok', message: null }

/** 表单的本地形状：条件在这里是字符串，提交前才收敛。 */
interface PlanForm {
  name: string
  platforms: string[]
  /**
   * 每平台的覆盖项（批次 3）。表单里 `maxPages` 用**字符串**：
   * 空串表示"用方案级页数"，与"0 页"必须区分得开。
   */
  overrides: Record<string, { enabled: boolean; maxPages: string }>
  criteria: Record<string, string>
  /** `HH:MM`（原生时间选择器的值）。空串 = 用户清空了，**不是** 00:00。 */
  windowStart: string
  windowEnd: string
  weekdays: number[]
  scheduleEnabled: boolean
  score: boolean
  flag: boolean
  dedup: boolean
}

/** 方案 → 表单的覆盖项：**每个平台都补一条**（缺省即"启用 + 用方案级页数"）。 */
function overridesOf(
  platforms: string[],
  source: Record<string, { enabled: boolean; maxPages: number | null }>,
): Record<string, { enabled: boolean; maxPages: string }> {
  const out: Record<string, { enabled: boolean; maxPages: string }> = {}
  for (const id of platforms) {
    const entry = source[id]
    out[id] = {
      enabled: entry?.enabled !== false,
      maxPages: entry?.maxPages === undefined || entry.maxPages === null ? '' : String(entry.maxPages),
    }
  }
  return out
}

/**
 * 表单 → 写入体的覆盖项。
 *
 * 空串或解析不出数字 → `null`（= 用方案级），**绝不发 0** ——
 * 0 会被下游当成"0 页"，那是"永远抓不到东西"。
 */
function buildOverrides(
  overrides: Record<string, { enabled: boolean; maxPages: string }>,
): Record<string, { enabled: boolean; maxPages: number | null }> {
  const out: Record<string, { enabled: boolean; maxPages: number | null }> = {}
  for (const [id, entry] of Object.entries(overrides)) {
    const parsed = Number.parseInt(entry.maxPages, 10)
    out[id] = {
      enabled: entry.enabled,
      maxPages: entry.maxPages.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
    }
  }
  return out
}

function formOf(plan: PlanDto): PlanForm {
  const schedule: PlanSchedule = plan.schedule
  return {
    name: plan.name,
    platforms: [...plan.platforms],
    overrides: overridesOf(plan.platforms, plan.platformOverrides),
    criteria: { ...plan.criteria },
    windowStart: clockValueOf(schedule.windowStartHour, schedule.windowStartMinute),
    windowEnd: clockValueOf(schedule.windowEndHour, schedule.windowEndMinute),
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
    overrides: overridesOf(platforms, {}),
    criteria: {},
    windowStart: '09:00',
    windowEnd: '11:00',
    weekdays: [1, 2, 3, 4, 5],
    scheduleEnabled: true,
    score: true,
    flag: true,
    dedup: true,
  }
}

/**
 * 表单 → 写入体。
 *
 * 时间在这里解析；解析不出来（用户清空了输入框）就退回默认时段，
 * 而不是把 `NaN` 发出去 —— `parseClockValue` 返回 null 的语义是"没填"，不是"00:00"。
 */
function writeOf(form: PlanForm): PlanWriteInput {
  const start = parseClockValue(form.windowStart) ?? { hour: 9, minute: 0 }
  const end = parseClockValue(form.windowEnd) ?? { hour: 11, minute: 0 }
  return {
    name: form.name,
    platforms: form.platforms,
    platformOverrides: buildOverrides(form.overrides),
    criteria: form.criteria,
    schedule: {
      enabled: form.scheduleEnabled,
      windowStartHour: start.hour,
      windowStartMinute: start.minute,
      windowEndHour: end.hour,
      windowEndMinute: end.minute,
      weekdays: form.weekdays,
    },
    postProcess: { score: form.score, flag: form.flag, dedup: form.dedup },
  }
}

/** 状态胶囊（成功-绿 / 部分成功-黄 / 失败-红 …），中文，不印内部枚举。 */
function StateTag(props: { state: CrawlState | HealthState; kind: 'run' | 'health' }) {
  const label =
    props.kind === 'run'
      ? CRAWL_STATE_LABEL[props.state as CrawlState]
      : HEALTH_STATE_LABEL[props.state as HealthState]
  const tone =
    props.kind === 'run'
      ? CRAWL_STATE_TONE[props.state as CrawlState]
      : HEALTH_STATE_TONE[props.state as HealthState]
  return <span className={`jh-tag jh-tone-${tone}`}>{label}</span>
}

/**
 * 调度归属的**唯一说法**。
 *
 * 修的是两个叠在一起的问题：
 *   1. 「调度：未启动」与「下次运行：还有 9 小时」并排 → 读起来自相矛盾；
 *   2. 顶部同时出现**三段**黄色提示都在说"定时已暂停"（归属叙述 + 一个 jh-warn 段 + 按钮文案），
 *      同一句话说三遍，用户反而不知道该看哪一条。
 *
 * 现在归属只由 `.jh-story` 说一句；"需要你处理的事"只由**一条** Alert 说。
 */
interface ScheduleStory {
  owner: string
  tone: 'ok' | 'warn' | 'muted'
  nextRun: string | null
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
    // 暂停时"下次运行"是**条件句**：不写"还有 9 小时"那种肯定口径
    return { owner: '定时已暂停', tone: 'warn', nextRun, detail: null }
  }
  if (status.readOnly) {
    return {
      owner: '由另一个窗口负责调度',
      tone: 'warn',
      nextRun: nextRun === null ? null : `那个窗口会在 ${nextRun} 自动采集`,
      detail:
        '同一台电脑只允许一个窗口真正去采集（否则会抢同一份浏览器登录态）。本窗口可以看，但不能触发采集。',
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
 * U9 数据采集（§5.4 / §4.6.1 的界面落点）。
 *
 * ## 这一版针对界面评审改了什么
 *
 * **顶部**：三段重复的黄色提示合并成**一条** Alert（并自带该做的动作）；
 * 运行历史的错误不再是单元格里的一大段堆栈，而是**胶囊 + 点击弹窗**看全文。
 * **中部**：方案卡片有明确边框与阴影，"连续失败 N 次"升格为卡片内的警告 Banner；
 * 按钮分三档权重（主操作 / 次级 / 危险）。
 * **表单**：从"嵌在页面下方"改成**弹窗**；时间用原生时间选择器（两个而不是四个框）；
 * 工作日改成分段标签 + 一键预设；长段解释收进 `?` 悬浮释义。
 */
export function CollectScreen(props: { revision: number; onGoSettings: () => void }) {
  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision])
  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision])
  const plans = useAsync((signal) => fetchPlans(signal), [props.revision])
  const reasons = useAsync((signal) => fetchSkipReasons(signal), [props.revision])
  const dimensions = useAsync((signal) => fetchCriteriaDimensions([], signal), [props.revision])

  const [feedback, setFeedback] = useState<Feedback>(IDLE)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [duplicates, setDuplicates] = useState<PlanDuplicateDto[]>([])
  /** 非致命提示（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
  const [notices, setNotices] = useState<string[]>([])
  /** 点开某条运行记录的错误全文（原来是直接摊在单元格里）。 */
  const [errorDetail, setErrorDetail] = useState<{ run: RecentRunDto; failure: FailureText } | null>(null)
  /**
   * 待确认的删除（破坏性操作的**硬闸门**）。
   *
   * 修的是一个真实缺陷：原来「删除」一次点击就直接删掉方案，没有任何确认 ——
   * 违反 `commercial-ui-ux` 的 SKILL.md（"Protected or destructive actions need hard gates"）
   * 与设计宪法**第六条**（"高风险操作必须让用户理解后果，并提供确认、撤销、软删除或恢复路径。
   * 不要为了减少一次点击而牺牲用户掌控感"）。
   * 原来只有一个 `title` 提示，而说明文字**不能**替代确认。
   */
  const [pendingDelete, setPendingDelete] = useState<PlanDto | null>(null)

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

  /**
   * **加载态 ≠ 空态**。
   *
   * 修的是一个真实缺陷（`commercial-ui-ux` 质量门槛 §2 的"空状态"一条，以及宪法第五条
   * "状态即体验"）：下面几处原来只判断 `list.length === 0`，于是在**还在加载**的那一两秒里
   * 会显示"还没有方案 / 还没有注册平台" —— 用户以为数据丢了。
   * `ARCHITECTURE.md` §5.5 早就点过这个坑："宿主 bootstrap 未完成时显示'正在初始化'，
   * **不要显示空列表**"。
   */
  const plansLoading = plans.state.status === 'loading'
  const platformsLoading = platforms.state.status === 'loading'
  const runsLoading = scheduler.state.status === 'loading'
  const reasonText = reasons.state.status === 'ok' ? reasons.state.data.items : {}
  const dimensionList: CriteriaDimensionDto[] =
    dimensions.state.status === 'ok' ? dimensions.state.data.items : []

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
      return (
        `方案「${plan.name}」本轮 ${CRAWL_STATE_LABEL[summary.run.state]}：命中 ${String(summary.run.found)} · ` +
        `新增 ${String(summary.run.inserted)} · 更新 ${String(summary.run.updated)} · ` +
        `隔离 ${String(summary.run.quarantined)}`
      )
    })

  const reasonFor = (skipReason: string | null): string | null =>
    skipReason === null ? null : (reasonText[skipReason] ?? skipReason)

  const confirmDelete = async (plan: PlanDto): Promise<void> => {
    setPendingDelete(null)
    await act('正在删除…', async () => {
      await deletePlan(plan.id)
      return `已删除方案「${plan.name}」。已经抓到的岗位不受影响。`
    })
  }

  const runBlockTitle =
    status?.readOnly === true
      ? `本窗口没有采集权。用下面的「接管调度」，或到另一个窗口（进程 ${String(status.lease.pid ?? '?')}）里操作。`
      : feedback.running
        ? '有另一个操作正在进行，请稍候。'
        : '现在按这个方案采集一次（会打开浏览器窗口）。'

  const enabledPlan = planList.find((plan) => plan.enabled) ?? planList[0]

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

      {/* 操作结果：可关闭 + 对读屏可见。
          quality-gates §4 把 Alert 的必查状态列为 severity / dismiss / timeout / screen-reader，
          原来这三点都缺（只是一个静态 card）。 */}
      {feedback.message === null ? null : (
        <div
          className={`jh-card jh-card-tight jh-feedback ${feedback.tone === 'error' ? 'jh-card-error' : ''}`}
          role="status"
          aria-live="polite"
        >
          <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>
            <InlineMd text={feedback.message} />
          </p>
          <button
            type="button"
            className="jh-icon-btn jh-feedback-close"
            aria-label="关闭提示"
            title="关闭这条提示"
            onClick={() => setFeedback(IDLE)}
          >
            ×
          </button>
        </div>
      )}

      {/* ── 一条 Alert 说完"当前需要你处理的事"（原来是三段重复提示）────── */}
      {status !== null && (
        <StatusAlert
          status={status}
          planName={enabledPlan?.name ?? null}
          running={feedback.running}
          onResume={() =>
            void act('正在恢复定时…', async () => {
              await setSchedulePaused(false)
              return '已恢复定时抓取。'
            })
          }
        />
      )}

      {/* ── 触发与运行 ───────────────────────────────────────────────── */}
      {status !== null && story !== null && (
        <section className="jh-card">
          <div className="jh-form-head">
            <h2 className="jh-card-title">触发与运行</h2>
            <span className="jh-spacer" />
            {/* 暂停时这里不放按钮：那条 Alert 已经带了「恢复定时」，
                两个按钮做同一件事正是这次要消掉的重复。 */}
            {status.paused ? null : (
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                disabled={feedback.running}
                title="只停「到点自动跑」；手动「立即采集」不受影响。"
                onClick={() =>
                  void act('正在暂停定时…', async () => {
                    await setSchedulePaused(true)
                    return '已暂停**定时**抓取。手动「立即采集」仍然可用。'
                  })
                }
              >
                一键暂停定时
              </button>
            )}
          </div>

          <p className={`jh-story jh-story-${story.tone}`}>
            <b>{story.owner}</b>
            {story.nextRun === null
              ? ' —— 当前没有启用定时的方案。'
              : status.paused
                ? `：恢复后将按 ${story.nextRun} 运行`
                : `：${story.nextRun}`}
          </p>
          {story.detail === null ? null : <p className="jh-note">{story.detail}</p>}

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

          <RunHistoryTable
            runs={status.recentRuns}
            loading={runsLoading}
            reasonFor={reasonFor}
            onOpenError={(run, failure) => setErrorDetail({ run, failure })}
          />
        </section>
      )}

      {/* ── 采集方案列表（卡片化 + 按钮分权重）──────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">采集方案</h2>
          <span className="jh-spacer" />
          {/* 次级，不是主按钮：一个工作区只能有**一个**视觉最强的主行动
              （rules §4.2）。本页的核心任务是"采集一次"，所以主按钮是方案卡上的「立即采集」；
              「新增方案」是低频的配置动作，不该和它抢同一档权重。 */}
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

        {plansLoading ? (
          <ul className="jh-plan-list" aria-busy="true" aria-live="polite">
            <li className="jh-plan-card jh-skeleton-row">正在读取方案…</li>
          </ul>
        ) : planList.length === 0 ? (
          <div className="jh-empty">
            <p className="jh-muted">还没有方案。</p>
            <p className="jh-note">
              方案决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。点右上角「新增方案」建第一个。
            </p>
          </div>
        ) : (
          <ul className="jh-plan-list">
            {planList.map((plan) => {
              const planStatus = status?.planStatus.find((item) => item.planId === plan.id) ?? null
              const decision = planStatus?.lastDecision ?? null
              // SR-18：逐平台的判定。多平台时"为什么没跑"不再是一个原因 ——
              // 同一个方案里猎聘可能未登录、51job 在跑、智联在冷却。
              const platformDecisions = new Map(
                (planStatus?.platformDecisions ?? []).map((item) => [item.platformId, item.decision]),
              )
              const blockedPlatforms = plan.platforms.filter(
                (id) => (platformDecisions.get(id)?.reason ?? null) !== null,
              )
              const platformName = (id: string): string =>
                platformList.find((item) => item.id === id)?.displayName ?? id
              const runBlocked = feedback.running || (status?.readOnly ?? false)
              return (
                <li key={plan.id} className="jh-plan-card">
                  {/* 核心风险放在卡片**最顶部**：它是这张卡最该被看见的事，
                      埋在正文里就等于没提示（评审原话：应转化为顶部的警告 Banner）。 */}
                  {planStatus?.riskPaused === true && (
                    <div className="jh-banner jh-banner-error">
                      <span className="jh-banner-title">
                        <Term term="风控暂停">已被暂停自动采集</Term>
                      </span>
                      <span>{planStatus.riskReason ?? '触发风控信号，已停止自动尝试。'}</span>
                    </div>
                  )}
                  {planStatus !== null && planStatus.backoffUntil !== null && (
                    <div className="jh-banner jh-banner-warn">
                      <span className="jh-banner-title">
                        连续失败 {planStatus.failStreak} 次，正在<Term term="退避">退避</Term>
                      </span>
                      <span>最早 {formatClock(new Date(planStatus.backoffUntil))} 再试。</span>
                    </div>
                  )}

                  <div className="jh-plan-head">
                    <b className="jh-plan-name">{plan.name}</b>
                    {planStatus === null ? null : (
                      <FreshnessBadge
                        level={planStatus.freshness.level}
                        hours={planStatus.freshness.hoursSinceSuccess}
                      />
                    )}
                    {plan.enabled ? null : <span className="jh-tag jh-tone-muted">已停用</span>}
                    <span className="jh-spacer" />
                    {/* 权重：立即采集 = 主操作；编辑 = 次级；确认恢复 = 警示；删除 = 危险 */}
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary"
                      disabled={runBlocked}
                      title={runBlockTitle}
                      onClick={() => void trigger(plan)}
                    >
                      立即采集
                    </button>
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
                    {planStatus?.riskPaused === true && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-warn"
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
                      className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost"
                      disabled={feedback.running}
                      title="删除这个方案（会先让你确认）。已经抓到的岗位不受影响。"
                      onClick={() => setPendingDelete(plan)}
                    >
                      删除
                    </button>
                  </div>

                  <div className="jh-plan-meta">
                    <span>{plan.platforms.join(' / ')}</span>
                    <CriteriaLine plan={plan} dimensions={dimensionList} />
                  </div>
                  <div className="jh-plan-meta">
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

                  {/* SR-18：把"哪个平台为什么没跑"如实摊开（有被挡住的平台时才显示）。
                      只给一句方案级结论，用户就不会知道自己少抓了两个平台。 */}
                  {blockedPlatforms.length > 0 && (
                    <div className="jh-muted">
                      各平台：
                      {plan.platforms
                        .map((id) => {
                          const item = platformDecisions.get(id) ?? null
                          return item?.reason == null
                            ? `${platformName(id)} 正常`
                            : `${platformName(id)}：${item.message ?? item.reason}`
                        })
                        .join(' · ')}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 跨平台去重：多平台落地后，"合并/拆分"要可查可逆（§4.10.1） */}
      <DedupGroupsCard revision={props.revision} />

      {/* ── 平台状态 ─────────────────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">平台状态</h2>
        {platforms.state.status === 'error' && <p className="jh-error">{platforms.state.message}</p>}
        {platformsLoading ? (
          <p className="jh-muted" aria-busy="true" aria-live="polite">
            正在读取平台状态…
          </p>
        ) : platformList.length === 0 ? (
          <div className="jh-empty">
            <p className="jh-muted">还没有注册平台。</p>
            <p className="jh-note">平台来自适配器注册表；当前没有任何适配器被注册，所以无法采集。</p>
          </div>
        ) : (
          <ul className="jh-list jh-status-list">
            {platformList.map((item) => {
              const missing = item.fields.filter((field) => field.consecutiveMiss > 0)
              const implemented = [
                '列表采集',
                item.implementation.detail ? '详情页' : null,
                item.implementation.actions.sayHello ? '打招呼' : null,
                item.implementation.actions.readInbox ? '收件箱' : null,
              ].filter((part): part is string => part !== null)
              const supportedNotImplemented = [
                item.capabilities.supportsGreeting && !item.implementation.actions.sayHello
                  ? '打招呼'
                  : null,
                item.capabilities.supportsInbox && !item.implementation.actions.readInbox
                  ? '收件箱'
                  : null,
                item.capabilities.supportsAttachment && !item.implementation.actions.sendResume
                  ? '附件投递'
                  : null,
              ].filter((part): part is string => part !== null)
              return (
                <li key={item.id}>
                  {/* 状态圆点而不是浏览器默认的 list-style 小黑点：
                      小黑点不带任何状态含义，还和真正的状态色混在一起。
                      圆点按"健康 + 登录"取色，**同时**保留后面的文字 —— 不只靠颜色。
                      另外给它 aria-hidden：状态由后面的文字念出来，圆点是纯视觉。 */}
                  <span
                    className={`jh-status-dot${item.health === 'healthy' && item.account.loggedIn ? ' jh-status-dot-on' : item.health === 'broken' ? ' jh-status-dot-bad' : ' jh-status-dot-warn'}`}
                    aria-hidden="true"
                  />
                  <code>{item.id}</code> <StateTag state={item.health} kind="health" />
                  {' '}
                  <span className={item.account.loggedIn ? 'jh-ok' : 'jh-warn'}>
                    {item.account.loggedIn ? '已登录' : '未登录'}
                  </span>
                  {' '}
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

                  {/* 成熟度：注册表里有平台 ≠ 这个平台能用。用户勾它进方案**之前**
                      就该看到"这个还只是实验性的、可能返回空"，而不是事后对着 0 条发懵。 */}
                  {maturityNeedsWarning(item.maturity.level) ? (
                    <div className="jh-warn">
                      <Term term="成熟度">{MATURITY_LEVEL_LABEL[item.maturity.level]}</Term>
                      {item.maturity.notes === undefined || item.maturity.notes === ''
                        ? null
                        : `：${item.maturity.notes}`}
                    </div>
                  ) : null}

                  {/* 需要登录、但本机还没实现登录检测 → 未登录时可能静默抓到空结果。
                      「没实现检测」与「不需要登录」是两件事，用户得知道是哪一种。 */}
                  {!item.implementation.loginCheck &&
                  Object.values(item.authRequirement).includes('required') ? (
                    <div className="jh-warn">
                      该平台需要登录，但本机还没有登录态检测 —— 未登录时可能静默抓到空结果。
                    </div>
                  ) : null}

                  {/* 量级（批次 5）：逐字段健康可能全绿，坏的只是**条数**。
                      这是从数据里查不出来的一类故障 —— 必须跟该平台自己的历史比。 */}
                  {item.yield.baseline === null ? null : (
                    <div className={item.yield.level === 'dropped' ? 'jh-warn' : 'jh-muted'}>
                      <Term term="量级">产量</Term>：近 {item.yield.samples} 轮的常态约{' '}
                      {item.yield.baseline} 条，最近一轮 {item.yield.lastFound ?? '—'} 条
                      {item.yield.level === 'dropped'
                        ? ' —— 明显偏低。字段健康可能是全绿的，先查翻页与懒加载。'
                        : ''}
                    </div>
                  )}

                  {/* 平台能做什么 vs 我们实现了什么 —— 两者不一致时要说清，
                      否则用户会以为"这个平台坏了"。 */}
                  <div className="jh-muted">
                    已实现：{implemented.join(' · ')}
                    {supportedNotImplemented.length === 0
                      ? null
                      : ` ｜ 平台支持但尚未实现：${supportedNotImplemented.join('、')}`}
                  </div>

                  {missing.length === 0 ? null : (
                    <>
                      <div className="jh-warn">
                        <Term term="逐字段健康">连续缺失</Term>：
                        {missing
                          .map((field) => `${field.field}×${String(field.consecutiveMiss)}`)
                          .join(' · ')}
                      </div>
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        onClick={props.onGoSettings}
                        title="看诊断信息（版本、数据路径、计数、工具注册结果）"
                      >
                        排查方案
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 方案表单：**弹窗**（原来是嵌在页面下方，导致页面过长、主次不分） */}
      {editing === null ? null : (
        <PlanEditorModal
          key={String(editing)}
          planId={editing === 'new' ? null : editing}
          initial={
            editing === 'new'
              ? emptyForm(platformList.map((item) => item.id))
              : formOf(planList.find((plan) => plan.id === editing) as PlanDto)
          }
          available={platformList.map((item) => ({ id: item.id, displayName: item.displayName }))}
          duplicates={duplicates}
          notices={notices}
          running={feedback.running}
          onCancel={() => setEditing(null)}
          onSubmit={async (form) => {
            setFeedback({ running: true, tone: 'ok', message: '正在保存…' })
            try {
              const input = writeOf(form)
              const result = editing === 'new' ? await createPlan(input) : await updatePlan(editing, input)
              setDuplicates(result.duplicates)
              setNotices(result.notices)
              const verb = editing === 'new' ? '已创建' : '已保存'
              const tail: string[] = []
              if (result.duplicates.length > 0) {
                tail.push(
                  `与 ${result.duplicates
                    .map((item) => `#${String(item.planId)}「${item.name}」`)
                    .join('、')} 条件重复（**只提示，不会自动合并**）`,
                )
              }
              if (result.notices.length > 0) tail.push(`另有 ${String(result.notices.length)} 条提示`)
              setFeedback({
                running: false,
                tone: 'ok',
                message: `${verb}方案「${result.plan.name}」。${tail.length === 0 ? '' : `注意：${tail.join('；')}。`}`,
              })
              // 有重复或提示时**不自动关窗** —— 关掉就等于把提示一起关掉了
              if (result.duplicates.length === 0 && result.notices.length === 0) setEditing(null)
              reload()
            } catch (error) {
              report(error)
            }
          }}
          onValidate={async (form) => {
            const input = writeOf(form)
            // 新建方案也要能查重/看提示 —— 那正是最需要提示的时刻
            const result =
              editing === 'new' ? await validatePlanDraft(input) : await validatePlan(editing, input)
            return { duplicates: result.duplicates, notices: result.notices }
          }}
        />
      )}

      {/* 删除确认：破坏性操作的硬闸门（宪法第六条） */}
      {pendingDelete === null ? null : (
        <Modal
          title="删除采集方案"
          label="删除确认"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <span className="jh-modal-foot-note jh-muted">
                删除后这个方案不会再自动采集。
              </span>
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-danger"
                disabled={feedback.running}
                onClick={() => void confirmDelete(pendingDelete)}
              >
                确认删除
              </button>
            </>
          }
        >
          <p className="jh-alert-body">
            即将删除方案「{pendingDelete.name}」（{pendingDelete.platforms.join(' / ')}）。
          </p>
          <ul className="jh-note">
            <li>这个方案本身与其定时配置会被移除，不会再有自动采集。</li>
            <li>**已经抓到的岗位会保留** —— 删除方案不会删岗位库。</li>
            <li>想保留配置只是暂时停用，请改用「编辑」里的「启用定时」或停用方案。</li>
          </ul>
        </Modal>
      )}

      {/* 错误全文弹窗：堆栈不再摊在表格单元格里 */}
      {errorDetail === null ? null : (
        <Modal
          title={`运行失败 · ${CRAWL_STATE_LABEL[errorDetail.run.state]}`}
          label="运行失败详情"
          size="lg"
          onClose={() => setErrorDetail(null)}
          footer={
            <>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-quiet"
                onClick={() => setErrorDetail(null)}
              >
                关闭
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() => {
                  setErrorDetail(null)
                  props.onGoSettings()
                }}
              >
                去设置看诊断
              </button>
            </>
          }
        >
          <ul className="jh-kv">
            <li>
              <span>平台</span>
              <span>
                <code>{errorDetail.run.platformId}</code>
              </span>
            </li>
            <li>
              <span>开始时间</span>
              <span>{new Date(errorDetail.run.startedAt).toLocaleString()}</span>
            </li>
            <li>
              <span>类别</span>
              <span>{FAILURE_KIND_LABEL[errorDetail.failure.kind]}</span>
            </li>
          </ul>
          <p className="jh-note">{errorDetail.failure.advice}</p>
          {errorDetail.failure.detail === null ? null : (
            <>
              <p className="jh-note">原始信息（技术细节）：</p>
              <pre className="jh-pre">{errorDetail.failure.detail}</pre>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

/**
 * 一条 Alert 说清"现在需要你处理什么"，并**自带该做的动作**。
 *
 * 合并的原来是三段（归属叙述里的"定时已暂停" + 一个 jh-warn 段 + 按钮文案），
 * 内容高度重叠 —— 用户看到同一句话说三遍。
 * 优先级：**已暂停 > 数据偏旧**。同一时刻只说一件最需要处理的事。
 */
function StatusAlert(props: {
  status: SchedulerStatusDto
  planName: string | null
  running: boolean
  onResume: () => void
}) {
  if (props.status.paused) {
    return (
      <div className="jh-alert jh-alert-warn">
        <div className="jh-alert-head">
          <span className="jh-alert-title">定时已手动暂停</span>
          <span className="jh-spacer" />
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary"
            disabled={props.running}
            title="恢复「到点自动跑」。手动「立即采集」一直都能用。"
            onClick={props.onResume}
          >
            恢复定时
          </button>
        </div>
        <p className="jh-alert-body">
          {props.status.pausedReason === null ? '' : `${props.status.pausedReason}。`}
          {props.planName === null
            ? '恢复后会按各方案配置的时段自动采集。'
            : `恢复后将自动按「${props.planName}」方案运行。`}
          手动「立即采集」不受影响。
        </p>
      </div>
    )
  }

  if (props.status.refreshSuggested && props.status.refreshHint !== null) {
    return (
      <div className="jh-alert jh-alert-warn">
        <div className="jh-alert-head">
          <span className="jh-alert-title">数据偏旧，建议手动刷新一次</span>
        </div>
        <p className="jh-alert-body">
          <InlineMd text={props.status.refreshHint} />
        </p>
        <p className="jh-note">不会自动跑 —— 程序只在你在场时活着，所以这里只提示，由你决定。</p>
      </div>
    )
  }

  return null
}

/** 条件的一行中文呈现（不是源码 JSON）。 */
function CriteriaLine(props: { plan: PlanDto; dimensions: readonly CriteriaDimensionLike[] }) {
  const scoped = props.dimensions.filter((dimension) => props.plan.criteria[dimension.key] !== undefined)
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
 * 租约面板（R20）。把"死胡同"提示换成带动作的面板。
 *
 * 「接管调度」**只在对方心跳已过期时**才可用：抢一个还活着的实例会让两个调度器同时抓取，
 * 那正是这把锁要防的事。所以它不能是"强抢"按钮 —— 对方活着时置灰，并说清该怎么做。
 */
function LeasePanel(props: {
  status: SchedulerStatusDto
  now: Date
  running: boolean
  onRecheck: () => void
  onTakeover: () => void
}) {
  const { lease } = props.status
  const heartbeat = lease.heartbeatAt === null ? null : new Date(lease.heartbeatAt)
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
 * 两处针对评审的改动：
 *   * 错误不再把一整段堆栈摊在单元格里 —— 单元格只放**状态胶囊 + 一句人话**，
 *     点开是弹窗（`Modal`）看完整 trace 与排查步骤；
 *   * 「触发」列全为 `—` 时整列隐藏；数值列右对齐。
 */
function RunHistoryTable(props: {
  runs: RecentRunDto[]
  loading: boolean
  reasonFor: (skipReason: string | null) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  // 加载态与空态必须分开（见上面 `plansLoading` 的注释）
  if (props.loading) {
    return (
      <>
        <h3 className="jh-sub-title">最近运行</h3>
        <p className="jh-muted" aria-busy="true" aria-live="polite">
          正在读取运行记录…
        </p>
      </>
    )
  }
  if (props.runs.length === 0) {
    return (
      <>
        <h3 className="jh-sub-title">最近运行</h3>
        <div className="jh-empty">
          <p className="jh-muted">还没有运行记录。</p>
          <p className="jh-note">第一次「立即采集」或等到偏好时段自动触发之后，这里会出现每一轮的结果。</p>
        </div>
      </>
    )
  }

  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null)

  return (
    <>
      <h3 className="jh-sub-title">最近运行</h3>
      {/* 小屏策略：**有意的横向滚动**（quality-gates §5 允许，但要求保留行身份与主操作）。
          第一列（开始）做粘性，横向滚动时仍能认行；「更新」列在小屏隐藏以降低密度。 */}
      <div className="jh-table-scroll">
        <table className="jh-table jh-table-runs">
          <thead>
            <tr>
              <th scope="col" className="jh-col-sticky">开始</th>
              <th scope="col">状态</th>
              {showReason ? <th scope="col">触发</th> : null}
              <th scope="col" className="jh-num">新增</th>
              <th scope="col" className="jh-num jh-col-hide-sm">更新</th>
              <th scope="col">结果说明</th>
            </tr>
          </thead>
        <tbody>
          {props.runs.map((run) => {
            const skip = props.reasonFor(run.skipReason)
            const failure: FailureText | null =
              skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null
            return (
              <tr key={run.id}>
                <td className="jh-col-sticky" title={new Date(run.startedAt).toLocaleString()}>
                  {formatClock(new Date(run.startedAt))}
                </td>
                <td>
                  <StateTag state={run.state} kind="run" />
                </td>
                {showReason ? <td>{runReasonLabel(run.reason) ?? '—'}</td> : null}
                <td className="jh-num">{run.inserted}</td>
                <td className="jh-num jh-col-hide-sm">{run.updated}</td>
                <td>
                  {skip !== null ? (
                    <span>{skip}</span>
                  ) : failure === null ? (
                    <span className="jh-muted">—</span>
                  ) : (
                    // 单元格里只留"图标 + 一句人话（过长则截断）+ 详情"；点开是弹窗。
                    // 图标让"这是错误"不只靠颜色表达；截断是为了不再把状态列撑宽。
                    <button
                      type="button"
                      className="jh-err-chip"
                      title={failure.detail === null ? failure.short : failure.detail.split('\n')[0]}
                      onClick={() => props.onOpenError(run, failure)}
                    >
                      <span className="jh-err-chip-icon" aria-hidden="true">⚠</span>
                      <span className="jh-err-chip-short">{failure.short}</span>
                      <span className="jh-err-chip-more">详情</span>
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* FieldHint 已抽到 `../field-hint.js` —— 设置页也要用同一种"长解释收进问号"。 */

/**
 * 方案编辑器（**弹窗**）。
 *
 * 评审后的三处重构都在这里：
 *   * 时间：四个数字框 → **两个原生时间选择器** + 中间一个"至"；
 *   * 运行日：六个勾选框 → **分段标签**，外加 工作日/周末/每天/清空 一键预设；
 *   * 说明：输入框下方的长段解释 → 收进字段标题旁的 `?`（悬浮可读）。
 * 「检查是否重复」按评审意见挪到**方案名同一行右侧**（它校验的就是这份配置是否重复）。
 */
function PlanEditorModal(props: {
  planId: number | null
  initial: PlanForm
  available: Array<{ id: string; displayName: string }>
  duplicates: PlanDuplicateDto[]
  /** 非致命提示（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
  notices: string[]
  running: boolean
  onCancel(): void
  onSubmit(form: PlanForm): Promise<void>
  onValidate(form: PlanForm): Promise<{ duplicates: PlanDuplicateDto[]; notices: string[] }>
}) {
  const [form, setForm] = useState<PlanForm>(props.initial)
  const [localDuplicates, setLocalDuplicates] = useState<PlanDuplicateDto[]>([])
  const [localNotices, setLocalNotices] = useState<string[]>([])

  const patch = (next: Partial<PlanForm>): void => setForm((current) => ({ ...current, ...next }))

  // 总残留重复 = 保存接口返回的 + 本地实时校验得到的。
  const duplicates = [...props.duplicates, ...localDuplicates]
  // 提示同理：保存后拿到一次，编辑过程中由防抖校验持续刷新 —— 这样"选了国聘 + 成都"
  // 在**保存之前**就看得见"它会返回空"，而不是等抓完 0 条才发现。
  const notices = [...new Set([...props.notices, ...localNotices])]
  const startMissing = parseClockValue(form.windowStart) === null
  const endMissing = parseClockValue(form.windowEnd) === null

  /**
   * 实时查重（防抖）：平台/筛选条件一改就自动校验，不用再手动点「检查是否重复」。
   * 只对**真正影响查重**的输入（平台 + 条件）做键，避免每次敲字都触发；
   * 新建时没有旧方案可比，直接清空。
   */
  // 覆盖项也进键：改"停用某个平台"或"它的页数"时，提示（如"深度被截断"）要跟着重算
  const validationKey = `${form.platforms.join(',')}\u0000${JSON.stringify(form.overrides)}\u0000${JSON.stringify(form.criteria)}`
  useEffect(() => {
    // 新建方案也走这条（`POST /plans/validate`）—— "选了国聘 + 成都"要能在保存前就看见。
    const timer = window.setTimeout(() => {
      void props
        .onValidate(form)
        .then((result) => {
          setLocalDuplicates(result.duplicates)
          setLocalNotices(result.notices)
        })
        .catch(() => {
          setLocalDuplicates([])
          setLocalNotices([])
        })
    }, 600)
    return () => window.clearTimeout(timer)
    // form 是当前渲染的引用；依赖只在查重语义变化时更新，见上方 validationKey。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationKey, props.planId])

  const dimensions = useAsync(
    (signal) => fetchCriteriaDimensions(form.platforms, signal),
    [form.platforms.join(',')],
  )
  const items: CriteriaDimensionDto[] = dimensions.state.status === 'ok' ? dimensions.state.data.items : []

  const togglePlatform = (id: string): void => {
    const has = form.platforms.includes(id)
    const nextPlatforms = has ? form.platforms.filter((item) => item !== id) : [...form.platforms, id]
    // 覆盖项跟着平台集合走：加入时补一条默认（否则那一行没有初值），
    // 移除时**同时删掉**它的覆盖项（留着它会在重新加入时静默生效）。
    const nextOverrides = { ...form.overrides }
    if (has) delete nextOverrides[id]
    else nextOverrides[id] = { enabled: true, maxPages: '' }
    patch({ platforms: nextPlatforms, overrides: nextOverrides })
  }

  const setOverride = (id: string, next: Partial<{ enabled: boolean; maxPages: string }>): void => {
    const current = form.overrides[id] ?? { enabled: true, maxPages: '' }
    patch({ overrides: { ...form.overrides, [id]: { ...current, ...next } } })
  }

  const setCriteria = (key: string, value: string): void => {
    const next = { ...form.criteria }
    if (value === '') delete next[key]
    else next[key] = value
    patch({ criteria: next })
  }

  return (
    <Modal
      title={props.planId === null ? '新增采集方案' : '编辑采集方案'}
      label="采集方案"
      size="lg"
      onClose={props.onCancel}
      footer={
        <>
          <span className="jh-muted jh-modal-foot-note">保存前会按同一套规则校验（与模型工具、接口一致）。</span>
          <span className="jh-spacer" />
          <button type="button" className="jh-btn jh-btn-inline" onClick={props.onCancel}>
            取消
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-primary"
            disabled={props.running}
            title={props.running ? '正在保存，请稍候。' : '保存这个方案。'}
            onClick={() => void props.onSubmit(form)}
          >
            保存
          </button>
        </>
      }
    >
      {/* 方案名 + 检查重复：同一行右侧（它校验的就是这份配置是否重复） */}
      <div className="jh-field">
        <span className="jh-field-label">方案名</span>
        <div className="jh-field-row">
          <input
            className="jh-input"
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-tiny"
            disabled={props.running}
            title="检查这份配置（平台 + 筛选条件）是否与现有方案重复、以及哪些平台会返回空。只提示，不会写入任何东西。"
            onClick={() => {
              void props
                .onValidate(form)
                .then((result) => {
                  setLocalDuplicates(result.duplicates)
                  setLocalNotices(result.notices)
                })
                .catch(() => {
                  setLocalDuplicates([])
                  setLocalNotices([])
                })
            }}
          >
            检查是否重复
          </button>
        </div>
      </div>

      <div className="jh-field">
        <span className="jh-field-label">
          平台
          <FieldHint text="只列出已注册的适配器。未注册的平台在配置层面就不可选 —— 多平台是工程量问题（每个平台一个适配器），不是配置问题。" />
        </span>
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

        {/* 每平台的覆盖项。方案级表达不了这两件事：
            * 临时停用一个平台（以前只能把它从方案里删掉 —— 丢掉意图，还改变查重结果）；
            * 每平台各自的抓取深度（以前"设 5 页"会在只支持 1 页的平台上被**静默截断**）。 */}
        {form.platforms.length === 0 ? null : (
          <div className="jh-field">
            <span className="jh-field-label">
              每个平台
              <FieldHint text="取消勾选 = 这个方案里暂时不抓它（不必把它从平台列表里删掉）。页数留空 = 用上面的方案级页数；填了就只用在这个平台上。" />
            </span>
            {form.platforms.map((id) => {
              const entry = form.overrides[id] ?? { enabled: true, maxPages: '' }
              const name = props.available.find((item) => item.id === id)?.displayName ?? id
              return (
                <div key={id} className="jh-check">
                  <label className="jh-check">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={() => setOverride(id, { enabled: !entry.enabled })}
                    />
                    {entry.enabled ? '抓' : '不抓'} {name}（<code>{id}</code>）
                  </label>
                  <label className="jh-field">
                    <span className="jh-field-label">页数上限</span>
                    <input
                      className="jh-input"
                      type="number"
                      min={1}
                      value={entry.maxPages}
                      placeholder="用方案级"
                      disabled={!entry.enabled}
                      onChange={(event) => setOverride(id, { maxPages: event.target.value })}
                    />
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="jh-section-title">筛选条件与抓取深度</div>
      <div className="jh-grid2">
        {items.map((dimension) => {
          const value = form.criteria[dimension.key] ?? ''
          const hint = dimension.supported ? dimension.hint : (dimension.disabledReason ?? dimension.hint)
          return (
            <label className="jh-field" key={dimension.key}>
              <span className="jh-field-label">
                {dimension.label}
                {dimension.supported ? null : <em className="jh-field-flag">当前平台不支持</em>}
                <FieldHint text={hint} />
              </span>
              {dimension.numeric ? (
                <input
                  className="jh-input"
                  type="number"
                  min={1}
                  max={dimension.max ?? undefined}
                  disabled={!dimension.supported}
                  value={value}
                  placeholder={dimension.supported ? '不限' : '不支持'}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                />
              ) : dimension.values.length === 0 ? (
                <input
                  className="jh-input"
                  disabled={!dimension.supported}
                  value={value}
                  placeholder={dimension.supported ? '不限' : '不支持'}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                />
              ) : (
                <select
                  className="jh-select"
                  disabled={!dimension.supported}
                  value={value}
                  onChange={(event) => setCriteria(dimension.key, event.target.value)}
                >
                  <option value="">不限</option>
                  {dimension.values.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )
        })}
      </div>

      <fieldset className="jh-fieldset">
        <legend>
          偏好时段
          <FieldHint text="触发时刻会在这段时间内随机选点，具体到哪一分钟不固定 —— 每天固定同一分钟去访问最容易被平台识别成自动化。这里刻意没有「精确到某分某秒」的选项。" />
        </legend>
        <div className="jh-timerange">
          {/* 字段级错误关联：quality-gates §6 要求"错误文本与字段关联"。
              只有可见的红字而不做 aria-invalid / aria-describedby，读屏用户根本不知道
              是哪个字段错了、错在哪。 */}
          <input
            className="jh-input jh-time"
            type="time"
            aria-label="时段起点"
            aria-invalid={startMissing}
            {...(startMissing ? { 'aria-describedby': 'jh-window-error' } : {})}
            value={startMissing ? '' : form.windowStart}
            onChange={(event) => {
              const text = event.target.value
              // 空串是"用户清空了"（保留空值以便提示），非空则必须是合法时间；
              // 非法值直接**忽略**，不要让一次误触把配置改成别的时刻
              if (text === '' || parseClockValue(text) !== null) patch({ windowStart: text })
            }}
          />
          <span className="jh-timerange-sep">至</span>
          <input
            className="jh-input jh-time"
            type="time"
            aria-label="时段终点"
            aria-invalid={endMissing}
            {...(endMissing ? { 'aria-describedby': 'jh-window-error' } : {})}
            value={endMissing ? '' : form.windowEnd}
            onChange={(event) => {
              const text = event.target.value
              if (text === '' || parseClockValue(text) !== null) patch({ windowEnd: text })
            }}
          />
          {startMissing || endMissing ? (
            <span className="jh-warn" id="jh-window-error" role="alert">
              时段没填完整，保存时会退回默认的 09:00–11:00。
            </span>
          ) : null}
        </div>

        <div className="jh-field">
          <span className="jh-field-label">
            运行日
            <FieldHint text="一天都不选等于每天都跑。时段跨零点也可以（例如 22:00 至 02:00）。" />
          </span>
          <div className="jh-segmented" role="group" aria-label="运行日">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, day) => (
              <button
                key={label}
                type="button"
                className={`jh-seg${form.weekdays.includes(day) ? ' jh-seg-on' : ''}`}
                aria-pressed={form.weekdays.includes(day)}
                title={`周${label}`}
                onClick={() => {
                  const next = form.weekdays.includes(day)
                    ? form.weekdays.filter((item) => item !== day)
                    : [...form.weekdays, day].sort((a, b) => a - b)
                  patch({ weekdays: next })
                }}
              >
                周{label}
              </button>
            ))}
          </div>
          <div className="jh-chips jh-presets">
            {WEEKDAY_PRESETS.map((preset) => {
              const active = form.weekdays.join(',') === preset.days.join(',')
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`jh-btn jh-btn-tiny${active ? ' jh-btn-active' : ''}`}
                  aria-pressed={active}
                  title={preset.days.length === 0 ? '清空（等于每天）' : `设为${preset.label}`}
                  onClick={() => patch({ weekdays: [...preset.days] })}
                >
                  {preset.label}
                </button>
              )
            })}
            <span className="jh-muted">当前：{form.weekdays.length === 0 ? '每天' : formatWeekdays(form.weekdays)}</span>
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
      </fieldset>

      <fieldset className="jh-fieldset">
        <legend>
          抓取后处理
          <FieldHint text="三项默认全开。关掉打分后不再写匹配分；关掉标注后不再产出风险/黑话标记；跨平台去重要有多个平台才生效。" />
        </legend>
        <div className="jh-chips">
          <label
            className="jh-check"
            title="算出「这个岗位跟你简历有多匹配」并给出逐条理由。关掉后岗位库里不再显示匹配分。"
          >
            <input
              type="checkbox"
              checked={form.score}
              onChange={(event) => patch({ score: event.target.checked })}
            />
            打分
          </label>
          <label
            className="jh-check"
            title="识别「疑似外包 / 高风险 / 僵尸岗位 / 薪资虚标 / 行业黑话」并标出来。"
          >
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

      {/* 非致命提示：它们对应的都是「平台安静地返回 0 条」这类**从数据里查不出来**的问题
          （0 条和 0 条长得一样），所以必须在保存之前摊在用户面前。只提示，仍可保存。 */}
      {notices.length === 0 ? null : (
        <div className="jh-warn">
          <div>注意 —— 这些平台可能不会按你想的那样工作（只提示，仍可保存）：</div>
          {notices.map((notice) => (
            <div key={notice}>· {notice}</div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/**
 * 跨平台去重分组（A2）。
 *
 * 多平台落地后，同一岗位可能被多个平台各抓一条并被合并进同一组。这里把它们列出来，
 * 让"合并了哪些 / 依据是什么 / 能不能拆开"都可查可逆（§4.10.1 铁律 2：去重必须可逆）。
 */
function DedupGroupsCard(props: { revision: number }) {
  const groups = useAsync((signal) => fetchDedupGroups(signal), [props.revision])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const act = async (id: number, fn: () => Promise<void>): Promise<void> => {
    setBusyId(id)
    try {
      await fn()
      groups.reload()
    } finally {
      setBusyId(null)
    }
  }

  const items = groups.state.status === 'ok' ? groups.state.data.items : []

  return (
    <section className="jh-card">
      <div className="jh-form-head">
        <h2 className="jh-card-title">跨平台去重</h2>
        <span className="jh-spacer" />
        <span className="jh-muted">
          同一岗位被多个平台各抓一条 → 合并到同一组；这里是**可逆**的，误合并随时可拆。
        </span>
      </div>

      {groups.state.status === 'loading' ? (
        <p className="jh-muted" aria-busy="true">正在读取去重分组…</p>
      ) : items.length === 0 ? (
        <p className="jh-muted">
          目前没有去重分组。多平台同时在抓同一批岗位时，重复的那几条才会被合并到这里。
        </p>
      ) : (
        <ul className="jh-tailor-notes">
          {items.map((group) => (
            <li key={group.id}>
              <span className="jh-muted">组 #{group.id}（{group.basis}）</span>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost"
                disabled={busyId !== null}
                onClick={() => setPendingDelete(group.id)}
              >
                拆组
              </button>
              <ul className="jh-tailor-notes">
                {group.members.map((member) => (
                  <li key={member.id}>
                    · {member.isPrimary ? '主' : '从'}｜{member.platformId}｜{member.title}
                    {member.companyName === null ? '' : `｜${member.companyName}`}
                    {'　'}({member.city})
                    {member.isPrimary ? null : (
                      <button
                        type="button"
                        className="jh-link"
                        disabled={busyId !== null}
                        onClick={() => void act(group.id, async () => splitDedupMember(group.id, member.id))}
                      >
                        拆出
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* 拆组确认：不删岗位，只是整组解散（成员全部独立） */}
      {pendingDelete === null ? null : (
        <Modal
          title="拆散这个去重组"
          label="拆组确认"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <button type="button" className="jh-btn jh-btn-inline" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-danger"
                disabled={busyId !== null}
                onClick={() => {
                  const id = pendingDelete
                  setPendingDelete(null)
                  void act(id, async () => deleteDedupGroup(id))
                }}
              >
                确认拆组
              </button>
            </>
          }
        >
          <p className="jh-alert-body">
            拆组后这组里的岗位全部变回独立岗位。**岗位本身不会删** —— 只是想撤销一次合并判断。
          </p>
        </Modal>
      )}
    </section>
  )
}
