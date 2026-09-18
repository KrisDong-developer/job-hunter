import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AUTH_REQUIREMENT_LABEL,
  CRAWL_STATE_LABEL,
  CRAWL_STATE_TONE,
  HEALTH_STATE_LABEL,
  HEALTH_STATE_TONE,
  MATURITY_LEVEL_LABEL,
  MATURITY_LEVEL_SHORT,
  MATURITY_LEVEL_TONE,
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
  formatDuration,
  formatJitter,
  formatLocalMoment,
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
  runDedupSweep,
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

/**
 * 采集页的三个分区。
 *
 * ## 为什么必须拆
 *
 * 这一页原来把「触发与运行 / 采集方案 / 跨平台去重 / 平台总览 / 平台明细」
 * 五个模块**一拉到底**：实测一屏装不下，用户要来回滚动才能在"看状态"与"改配置"
 * 之间切换，而这两件事的**使用时机**根本不同 —— 前者是每天扫一眼，
 * 后者是偶尔改一次。把它们放在同一条滚动流里，等于每次改配置都要先穿过状态区。
 *
 * 拆法按**任务**而不是按数据来源：
 *   * `dashboard`   —— 今天能不能跑、上次跑了什么、平台现在什么状态（读）
 *   * `plans`       —— 抓什么、什么时候抓、去重规则（写）
 *   * `diagnostics` —— 平台的静态事实与失败日志（排障时看，平时不看）
 */
type CollectTab = 'dashboard' | 'plans' | 'diagnostics'

const COLLECT_TABS: ReadonlyArray<{ key: CollectTab; label: string }> = [
  { key: 'dashboard', label: '运行仪表盘' },
  { key: 'plans', label: '方案管理' },
  { key: 'diagnostics', label: '诊断与明细' },
]

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

  /**
   * 三个分区与两处"跨分区的选择"。
   *
   * `expandedPlatform` 放在这里而不是表格组件内部：它是**主从结构的选择**，
   * 从「平台总览」展开的明细与「诊断与明细」里的同一平台是同一件事，
   * 状态放在上面才不会两处各记一个。
   */
  const [tab, setTab] = useState<CollectTab>('dashboard')
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  /** 「当前生效方案」看的是哪一个（默认落在真正会被调度的那个上）。 */
  const [focusPlanId, setFocusPlanId] = useState<number | null>(null)
  /** 全库复核只改分组，不动 plans/scheduler —— 单独一个版本号让去重卡片重取。 */
  const [dedupRevision, setDedupRevision] = useState(0)

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

  /**
   * 平台 id → 给人看的名字。
   *
   * 认不出来返回 `null` 而不是退回 id：调用方据此决定"显示名字"还是"显示代码"，
   * 两个都显示才是没有信息量的（`51job 前程无忧`）。
   */
  const platformNameOf = (id: string): string | null =>
    platformList.find((item) => item.id === id)?.displayName ?? null

  const confirmDelete = async (plan: PlanDto): Promise<void> => {
    setPendingDelete(null)
    await act('正在删除…', async () => {
      await deletePlan(plan.id)
      return `已删除方案「${plan.name}」。已经抓到的岗位不受影响。`
    })
  }

  const runBlockTitle =
    status?.readOnly === true
      ? `本窗口没有采集权。用「接管调度」，或到另一个窗口（进程 ${String(status.lease.pid ?? '?')}）里操作。`
      : feedback.running
        ? '有另一个操作正在进行，请稍候。'
        : '现在按这个方案采集一次（会打开浏览器窗口）。'

  const enabledPlan = planList.find((plan) => plan.enabled) ?? planList[0]
  /** 「当前生效方案」以本屏的选择为准，默认落在真正会被调度的那个方案上。 */
  const focusedPlan = planList.find((plan) => plan.id === focusPlanId) ?? enabledPlan
  const runBlocked = feedback.running || (status?.readOnly ?? false)

  /* ── 顶部工具条上的三个全局动作 ────────────────────────────────────────
     它们原来散在各卡片标题右侧：「一键暂停定时」在触发与运行时、「重新检测」
     藏在租约面板里、「全库复核一遍」在去重卡片里 —— 于是"我要停一下调度"
     得先想清楚去哪个卡片找。集中到一个固定工具条之后，主次也一并定下来：
     主操作 = 启动/暂停调度（带状态指示）；次级 = 重新检测系统 / 运行全库去重。 */
  const toggleSchedule = (): void => {
    if (status === null) return
    const next = !status.paused
    void act(next ? '正在暂停定时…' : '正在恢复定时…', async () => {
      await setSchedulePaused(next)
      return next ? '已暂停**定时**抓取。手动「立即采集」仍然可用。' : '已恢复定时抓取。'
    })
  }

  const recheck = (): void =>
    void act('正在重新检测…', async () => {
      const next = await recheckLease()
      return next.lease.held
        ? '已经拿到调度权，本窗口现在负责采集。'
        : '那个窗口还在运行，本窗口仍是只读。'
    })

  /**
   * 全库复核（批次 4）—— 从去重卡片**提到工具条上**。
   *
   * 理由：「我刚打开了去重开关 / 刚改过抓取范围」这件事与你在哪个分区无关，
   * 而按钮原来只在「方案管理」里。结果（合并了几条、还差几条）交给页面顶部
   * 那条 Alert 统一说，去重卡片只负责列分组。
   */
  const sweep = (): void =>
    void act('正在按同一套门槛复核全库…', async () => {
      const result = await runDedupSweep()
      setDedupRevision((value) => value + 1)
      return (
        `看过 ${String(result.scanned)} 条` +
        (result.skippedGrouped > 0 ? `（跳过已在分组里的 ${String(result.skippedGrouped)} 条）` : '') +
        `：合并 ${String(result.merged)} 条、新建 ${String(result.newGroups)} 组，现在共 ${String(result.groups)} 组。` +
        (result.candidates > 0
          ? `另有 ${String(result.candidates)} 条疑似重复没自动合并（标题相似度不够）—— 需要人工看一眼。`
          : '')
      )
    })

  return (
    <div className="jh-screen">
      {/* ── 顶部固定工具条：分区切换 + 全局操作 ───────────────────────────
          粘在滚动容器顶部 —— 于是"停一下调度"在任何分区、任何滚动位置都点得到，
          不必先滚回去找按钮。 */}
      <div className="jh-collect-bar">
        <nav className="jh-modes" aria-label="采集分区">
          {COLLECT_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`jh-mode${tab === item.key ? ' jh-mode-active' : ''}`}
              /* 与面板顶部那十个分区同一套语义：整屏替换的分区导航 → aria-current。 */
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <span className="jh-spacer" />

        {/* 状态指示：按钮文案说的是"点下去会发生什么"，这个小圆点说的是"现在是什么状态" */}
        {status === null ? null : (
          <span className="jh-collect-switch">
            <span
              className={`jh-status-dot ${status.paused ? 'jh-status-dot-warn' : 'jh-status-dot-on'}`}
              aria-hidden="true"
            />
            {status.paused ? '定时已暂停' : '定时运行中'}
          </span>
        )}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={status === null || feedback.running}
          aria-pressed={status === null ? undefined : !status.paused}
          title={
            status?.paused === true
              ? '恢复「到点自动跑」。手动「立即采集」一直都能用。'
              : '只停「到点自动跑」；手动「立即采集」不受影响。'
          }
          onClick={toggleSchedule}
        >
          {status?.paused === true ? '启动调度' : '暂停调度'}
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={status === null || feedback.running}
          title="立刻再检查一次调度归属（不用等 90 秒心跳过期）。"
          onClick={recheck}
        >
          重新检测系统
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={feedback.running}
          title="把全库岗位按同一套门槛复核一遍（跨平台 + 同公司同城 + 薪资不冲突 + 标题相似）。用在「刚打开去重开关」或「刚改过抓取范围」之后补做一次 —— 否则要干等下一轮抓取，而那一轮可能一条新岗位都没有。合并是可逆的。"
          onClick={sweep}
        >
          运行全库去重
        </button>
      </div>

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

      {/* ══ 分区一：运行仪表盘（读）═══════════════════════════════════════ */}
      {tab === 'dashboard' ? (
        <>
          {/* ── 一条 Alert 说完"当前需要你处理的事"（原来是三段重复提示）── */}
          {status !== null ? (
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
          ) : null}

          {/* 两栏：左"现在什么状态"、右"按哪个方案跑"。两件事各自很短，
              原来却是一上一下两块、中间还夹着运行表，要滚动才能对照。
              窄面板下由容器查询换成单栏（见样式里 .jh-collect-top）。 */}
          <div className="jh-collect-top">
            <div className="jh-collect-grid">
              <section className="jh-card">
                <div className="jh-form-head">
                  <h2 className="jh-card-title">运行状态</h2>
                  <FieldHint text="谁在调度、下次什么时候跑、有没有下一次。同一台电脑只允许一个窗口真正去采集 —— 两个窗口同时采集会抢同一份浏览器登录态。" />
                </div>

                {status === null || story === null ? (
                  <p className="jh-muted" aria-busy="true" aria-live="polite">
                    正在读取调度状态…
                  </p>
                ) : (
                  <>
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
                  </>
                )}
              </section>

              {/* 当前生效方案：**只读摘要 + 两个动作**。改配置在「方案管理」分区，
                  这里刻意不放编辑表单 —— 仪表盘是读数盘，不是配置台。 */}
              <section className="jh-card">
                <div className="jh-form-head">
                  <h2 className="jh-card-title">当前生效方案</h2>
                  <span className="jh-spacer" />
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline jh-btn-tiny"
                    title="去「方案管理」分区新增/编辑/删除方案。"
                    onClick={() => setTab('plans')}
                  >
                    管理方案
                  </button>
                </div>

                {plansLoading ? (
                  <p className="jh-muted" aria-busy="true" aria-live="polite">
                    正在读取方案…
                  </p>
                ) : focusedPlan === undefined ? (
                  <div className="jh-empty">
                    <p className="jh-muted">还没有方案。</p>
                    <p className="jh-note">
                      方案决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。去「方案管理」建第一个。
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 多方案时给一排切换：这张卡一次只显示一个方案，
                        没有切换入口的话，用户不知道"我还有别的方案"。 */}
                    {planList.length > 1 ? (
                      <div className="jh-chips jh-plan-switch">
                        {planList.map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            className={`jh-chip${plan.id === focusedPlan.id ? ' jh-chip-on' : ''}`}
                            aria-pressed={plan.id === focusedPlan.id}
                            onClick={() => setFocusPlanId(plan.id)}
                          >
                            {plan.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="jh-plan-head">
                      <b className="jh-plan-name">{focusedPlan.name}</b>
                      {focusedPlan.id === enabledPlan?.id ? (
                        <span className="jh-tag jh-tone-ok">生效中</span>
                      ) : null}
                      {focusedPlan.enabled ? null : <span className="jh-tag jh-tone-muted">已停用</span>}
                    </div>
                    <div className="jh-plan-meta">
                      <span>{focusedPlan.platforms.join(' / ')}</span>
                      <CriteriaLine plan={focusedPlan} dimensions={dimensionList} />
                    </div>
                    <div className="jh-plan-meta">
                      <span>
                        {focusedPlan.schedule.enabled
                          ? `${formatWeekdays(focusedPlan.schedule.weekdays)} ${formatWindow(
                              focusedPlan.schedule.windowStartHour,
                              focusedPlan.schedule.windowStartMinute,
                              focusedPlan.schedule.windowEndHour,
                              focusedPlan.schedule.windowEndMinute,
                            )}`
                          : '不定时'}
                      </span>
                      <span>
                        {focusedPlan.postProcess.score ? '打分' : '不打分'} ·{' '}
                        {focusedPlan.postProcess.flag ? '标注' : '不标注'} ·{' '}
                        {focusedPlan.postProcess.dedup ? '去重' : '不去重'}
                      </span>
                    </div>
                    <div className="jh-plan-actions">
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary"
                        disabled={runBlocked}
                        title={runBlockTitle}
                        onClick={() => void trigger(focusedPlan)}
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
                          setEditing(focusedPlan.id)
                        }}
                      >
                        编辑
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>

          {/* ── 最近运行日志 ───────────────────────────────────────────── */}
          {status === null && !runsLoading ? null : (
            <section className="jh-card">
              <div className="jh-form-head">
                <h2 className="jh-card-title">最近运行</h2>
                <FieldHint text="按开始时刻倒序（新的在上面）。命中=这一轮抓到多少条（悬停看翻了几页）；新增/更新=真正写进岗位库的量；隔离=被字段断言拦下、进了待修队列的条数。失败的那一次不算「上次成功」—— 失败不会让数据变新。点错误胶囊看完整原因与排查步骤。" />
              </div>
              <RunHistoryTable
                runs={status === null ? [] : status.recentRuns}
                loading={runsLoading}
                reasonFor={reasonFor}
                platformName={platformNameOf}
                onOpenError={(run, failure) => setErrorDetail({ run, failure })}
              />
            </section>
          )}

          {/* ── 平台状态总览（主从结构：明细在行内展开）────────────────────
              原来「平台总览」表格与紧随其后的「平台明细」长列表是**两份**关于同一批
              平台的东西（表格回答横向可比的问题，长列表回答纵向的"为什么"），
              而长列表的格式还和表格高度重复。现在只留一张表：
              「明细」在**该行下方展开**，不再另起一段把视觉注意力拉走。
              「这个平台是什么」（成熟度/能力/实现度）搬去「诊断与明细」分区，
              这里只放"它现在怎么样" —— 两类信息的性质不同，见那里的注释。 */}
          <section className="jh-card">
            <div className="jh-form-head">
              <h2 className="jh-card-title">平台状态总览</h2>
              <FieldHint text="「今天能跑」用的是与调度同一个前置条件判定 —— 这里写着「可以」的平台，到点真的会跑；写着原因的，就是它现在被什么拦住了。点某一行的「明细」看该平台的完整诊断。" />
            </div>
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
              <PlatformMatrix
                items={platformList}
                reasonText={reasonText}
                expandedId={expandedPlatform}
                onToggle={(id) => setExpandedPlatform((current) => (current === id ? null : id))}
                running={feedback.running}
                onLogin={login}
                onGoSettings={props.onGoSettings}
              />
            )}
          </section>
        </>
      ) : null}

      {/* ══ 分区二：方案管理（写）═════════════════════════════════════════ */}
      {tab === 'plans' ? (
        <>

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

                  {/* 这个方案自己的动作放在卡片**右下角**（评审意见：针对具体方案的操作
                      应落在对应卡片里，而不是所有按钮混在页面各处）。
                      权重：立即采集 = 主操作；编辑 = 次级；确认恢复 = 警示；删除 = 危险。
                      放到底部而不是标题右侧：读配置时不被一排按钮从中间打断，
                      而且多个方案卡片竖排时，按钮会在同一条竖线上（扫一眼就知道每个方案能做什么）。 */}
                  <div className="jh-plan-actions">
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
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 跨平台去重：多平台落地后，"合并/拆分"要可查可逆（§4.10.1）。
          全库复核的按钮已经搬到顶部工具条上；这里只列分组。 */}
      <DedupGroupsCard revision={props.revision + dedupRevision} />
        </>
      ) : null}

      {/* ══ 分区三：诊断与明细（排障时才看）═══════════════════════════════ */}
      {tab === 'diagnostics' ? (
        <>
          {/* ── 实验配置：平台的**静态事实**（成熟度 / 能力 / 实现度）────────
              与「平台状态总览」的分工是刻意的：
                · 那边回答"它**现在**能不能跑"（随冷却、额度、登录态而变），
                · 这边回答"它**是什么**、我们实现了多少"（改了代码才会变）。
              两类混在一张表里，用户就分不清"这个平台一直需要登录"与
              "它现在正好在冷却"。原来这些事实是以**一段段散文**铺在
              「平台明细」里的：横向比不了，展开还要滚动，而且与总览表格重复。
              现在改成矩阵 —— 这些正好是横向可比的东西。 */}
          <section className="jh-card">
            <div className="jh-form-head">
              <h2 className="jh-card-title">实验配置与能力</h2>
              <FieldHint text="成熟度 = 这个适配器验证到什么程度（注册表里有平台 ≠ 这个平台能用）。「已实现」= 这条链路我们已经写了；「未实现」= 平台支持、我们还没写；「不支持」= 平台本身没有这个能力。抓取需登录与登录检测是两件事：前者是平台事实，后者是本机有没有做登录态检测。" />
            </div>
            {platforms.state.status === 'error' && <p className="jh-error">{platforms.state.message}</p>}
            {platformsLoading ? (
              <p className="jh-muted" aria-busy="true" aria-live="polite">
                正在读取平台配置…
              </p>
            ) : platformList.length === 0 ? (
              <p className="jh-muted">还没有注册平台。</p>
            ) : (
              <CapabilityMatrix items={platformList} />
            )}
          </section>

          {/* ── 异常日志：只看"没跑成"的那些轮次 ──────────────────────────── */}
          <section className="jh-card">
            <div className="jh-form-head">
              <h2 className="jh-card-title">异常日志</h2>
              <FieldHint text="只列失败与被跳过的轮次 —— 成功的那几轮在「运行仪表盘 · 最近运行」里。点错误胶囊看原始信息与排查步骤。" />
            </div>
            <RunLogCard
              runs={status === null ? [] : status.recentRuns}
              loading={runsLoading}
              reasonFor={reasonFor}
              platformName={platformNameOf}
              onOpenError={(run, failure) => setErrorDetail({ run, failure })}
            />
          </section>
        </>
      ) : null}

      {/* 平台明细已并入「平台状态总览」的行内展开（见 PlatformMatrix / PlatformDetail）；
          平台自身的静态事实（成熟度 / 能力 / 实现度）移到「诊断与明细」分区。
          原来那段散文式长列表与总览表格说的是同一批平台，是本页最耗注意力的一处重复。 */}

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
          available={platformList}
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
              /**
               * 失败**抛回弹窗**，不在这里写成页面级反馈。
               *
               * 页面级那条卡片在 `.jh-modal-layer` 的遮罩**后面**，弹窗开着的时候用户
               * 根本看不到 —— 于是任何一次保存失败都表现成"点了保存没反应"。
               * 所以这里把 running 收干净、再把错误原样抛出，由弹窗就地显示。
               */
              setFeedback(IDLE)
              throw error
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
 *
 * 「重新检测」原来也在这里，现在移到顶部工具条的「重新检测系统」——
 * 它是**全局**动作（重新判定谁负责调度），不该藏在某张卡片里。
 * 这里只留下与租约强相关、别处放都不对的「接管调度」。
 */
function LeasePanel(props: {
  status: SchedulerStatusDto
  now: Date
  running: boolean
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
                  '然后点上面的「重新检测系统」（关掉后最多 90 秒会自动接管，不需要重启）。'
            }
            onClick={props.onTakeover}
          >
            接管调度
          </button>
        )}
      </div>
      {lease.held ? null : (
        <p className="jh-note">
          <InlineMd text="怎么解决：① 到那个窗口里操作（最稳）；② 关掉那个窗口 —— 关掉之后这里会**自动**接管，不用重启，也可以点上面的「重新检测系统」立刻试一次。" />
        </p>
      )}
    </div>
  )
}

/**
 * 冷却截止还在未来才算"在冷却"。
 *
 * 过期的时间戳留在库里只是历史，把它显示成"还在等"会让用户白等一场 ——
 * 而 `platformGate` 早就放行了（它比的是 `now`）。
 */
function cooldownActive(until: string | null, now: Date): Date | null {
  if (until === null) return null
  const at = new Date(until)
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at
}

/**
 * 平台总览**矩阵**（批次 5）—— 现在是**主从结构**：一行一个平台，
 * 展开就在该行下方看它的诊断明细。
 *
 * ## 为什么保留矩阵，而不是把明细竖着摊开
 *
 * 平台列表是**纵向**读的（一个平台一段，能写很多解释），而多平台真正要回答的问题
 * 恰恰是**横向**的 —— "这些平台里今天哪几个真的能跑"。纵向列表回答不了它：
 * 得逐段读完，还得自己记住上一段说了什么。
 * 但反过来，把"为什么"整段删掉也不行 —— 排障时那些信息就是全部。
 * 所以：矩阵负责横向可比的事实，**明细挂在该行下面按需展开**。
 * 页面上不再有"表格 + 长列表"两份关于同一批平台的东西（那正是这次要消掉的重复）。
 *
 * ## 状态一律用标准徽标
 *
 * 一格一个 `.jh-tag`，四档颜色定死：绿=正常/已登录/可以，黄=降级/未登录/被挡住，
 * 红=失效，灰=未启用/未检测/没跑过。原来「已登录」是**彩色文字**、「健康」是徽标、
 * 「今天能跑」又是另一段文字 —— 同一张表里三种形状，大小还不一样。
 *
 * 「今天能跑」那一列仍然用点号表示长原因（全文进 title）：短标签是**第二份文案**，
 * 迟早会和 `SKIP_REASON_LABEL` 漂移，用户就在两处读到两种说法。
 */
function PlatformMatrix(props: {
  items: PlatformOverviewDto[]
  reasonText: Record<string, string>
  /** 当前展开的是哪一个平台（主从结构里的"主"的选择）。 */
  expandedId: string | null
  onToggle: (platformId: string) => void
  running: boolean
  onLogin: (platformId: string) => void
  onGoSettings: () => void
}) {
  const now = new Date()
  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-matrix">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">平台</th>
            <th scope="col">今天能跑</th>
            <th scope="col">登录</th>
            <th scope="col" className="jh-cell-status">健康</th>
            <th scope="col" className="jh-col-hide-sm">成熟度</th>
            <th scope="col" className="jh-num">今日额度</th>
            <th scope="col" className="jh-num jh-col-hide-sm">产量</th>
            <th scope="col">最近一轮</th>
            <th scope="col"><span className="jh-sr-only">明细</span></th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => {
            const blocked =
              item.governance.blocked === null
                ? null
                : (props.reasonText[item.governance.blocked] ?? item.governance.blocked)
            const cooldown = cooldownActive(item.governance.cooldownUntil, now)
            const quotaFull = item.governance.todayRuns >= item.governance.dailyLimit
            const lastRun = item.governance.lastRun
            const open = props.expandedId === item.id
            const detailId = `jh-plat-detail-${item.id}`
            return (
              <Fragment key={item.id}>
                <tr>
                  <td className="jh-col-sticky">
                    <code>{item.id}</code>
                    {item.enabled ? null : <span className="jh-tag jh-tone-muted">未启用</span>}
                    <div className="jh-muted">{item.displayName}</div>
                  </td>
                  <td className={blocked === null ? 'jh-ok' : 'jh-warn'}>
                    <div>
                      {blocked === null ? (
                        '可以'
                      ) : (
                        <span className="jh-clip" title={blocked}>
                          {blocked}
                        </span>
                      )}
                    </div>
                    {cooldown === null ? null : (
                      <div className="jh-muted">冷却至 {formatClock(cooldown)}</div>
                    )}
                  </td>
                  <td>
                    {/* 「没检测过」与「确定未登录」是两件事：前者不该被念成后者 */}
                    <span
                      className={`jh-tag jh-tone-${
                        item.account.loggedIn
                          ? 'ok'
                          : item.account.lastCheckAt === null
                            ? 'muted'
                            : 'warn'
                      }`}
                    >
                      {item.account.loggedIn
                        ? '已登录'
                        : item.account.lastCheckAt === null
                          ? '未检测'
                          : '未登录'}
                    </span>
                    {/* 登录动作**留在这一行里**，不藏进展开的明细。
                        理由：「这个平台今天能不能跑」最常见的拦路虎就是没登录，
                        而修它的成本只有点一下；把它放到"先展开一行才能点"的后面，
                        等于给最高频的修复动作加了一道没有意义的门。
                        已登录时**不显示**按钮 —— 那时它没有任何事可做。
                        明细里也因此不放第二颗登录按钮（两个按钮做同一件事是重复）。 */}
                    {item.login.state === 'running' ? (
                      <span className="jh-warn"> 检测中…</span>
                    ) : item.account.loggedIn ? null : (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={props.running}
                        title={
                          props.running
                            ? '有另一个操作正在进行，请稍候。'
                            : '打开登录页，在弹出的浏览器窗口里完成登录。'
                        }
                        onClick={() => props.onLogin(item.id)}
                      >
                        登录
                      </button>
                    )}
                  </td>
                  <td className="jh-cell-status">
                    <StateTag state={item.health} kind="health" />
                    {item.failStreak > 0 ? (
                      <span className="jh-muted"> ×{item.failStreak}</span>
                    ) : null}
                  </td>
                  <td className="jh-col-hide-sm">
                    {/* 成熟度用**短档**：全称（"可用（真实夹具 + 冒烟验证）"）会把这一列
                        撑到必须横向滚动，而它只是十几个平台的横向比较。全文进 title。 */}
                    <span
                      className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}
                      title={
                        item.maturity.notes === undefined || item.maturity.notes === ''
                          ? MATURITY_LEVEL_LABEL[item.maturity.level]
                          : `${MATURITY_LEVEL_LABEL[item.maturity.level]}：${item.maturity.notes}`
                      }
                    >
                      {MATURITY_LEVEL_SHORT[item.maturity.level]}
                    </span>
                  </td>
                  <td className={`jh-num${quotaFull ? ' jh-warn' : ''}`}>
                    {item.governance.todayRuns}/{item.governance.dailyLimit}
                  </td>
                  <td className="jh-num jh-col-hide-sm">
                    {/* 产量写成"最近/常态"：单看一个数字看不出它是多是少 */}
                    {item.yield.baseline === null ? (
                      <span className="jh-muted">—</span>
                    ) : (
                      <span className={item.yield.level === 'dropped' ? 'jh-warn' : undefined}>
                        {item.yield.lastFound ?? '—'}/{item.yield.baseline}
                      </span>
                    )}
                  </td>
                  <td>
                    {lastRun === null ? (
                      <span className="jh-muted">没跑过</span>
                    ) : (
                      <>
                        <span className="jh-muted">
                          {formatClock(new Date(lastRun.startedAt))}
                        </span>{' '}
                        <StateTag state={lastRun.state} kind="run" />
                      </>
                    )}
                  </td>
                  <td className="jh-cell-actions">
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      aria-expanded={open}
                      {...(open ? { 'aria-controls': detailId } : {})}
                      title={open ? '收起这个平台的诊断' : '展开这个平台的诊断（能不能跑、被什么挡住、登录态、产量）'}
                      onClick={() => props.onToggle(item.id)}
                    >
                      {open ? '收起' : '明细'}
                    </button>
                  </td>
                </tr>

                {/* 展开行：诊断明细。colSpan 覆盖整行宽度 —— 明细属于**这一行**，
                    不是另起一段与表格并列的内容。 */}
                {open ? (
                  <tr className="jh-row-detail">
                    <td colSpan={9} id={detailId}>
                      <PlatformDetail
                        item={item}
                        reasonText={props.reasonText}
                        onGoSettings={props.onGoSettings}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 一个平台的**诊断明细**（主从结构里的"从"）。
 *
 * 分工很明确 —— 这里只回答"它**现在**为什么是这样"：能不能跑、被什么挡住、
 * 登录态、连续缺失、产量掉没掉、上一轮什么时候跑的。
 * 而"它**是什么**"（成熟度档位、能力、实现度、认证要求）是**改了代码才会变**的
 * 静态事实，放在「诊断与明细」分区的能力矩阵里横向比较。
 * 两类混在一张表里，用户就分不清"这个平台一直需要登录"与"它现在正好在冷却"。
 *
 * 所以原来那段"已实现：列表采集 · 详情页 ｜ 平台支持但尚未实现：打招呼"
 * 在这里**不再出现** —— 它是能力矩阵那几列的文字版，两处都写就是两处都会漂移。
 */
function PlatformDetail(props: {
  item: PlatformOverviewDto
  reasonText: Record<string, string>
  onGoSettings: () => void
}) {
  const { item } = props
  const blocked =
    item.governance.blocked === null
      ? null
      : (props.reasonText[item.governance.blocked] ?? item.governance.blocked)
  const cooldown = cooldownActive(item.governance.cooldownUntil, new Date())
  const missing = item.fields.filter((field) => field.consecutiveMiss > 0)
  const lastRun = item.governance.lastRun
  /* 需要登录、但本机还没实现登录检测 → 未登录时可能静默抓到空结果。
     「没实现检测」与「不需要登录」是两件事，用户得知道是哪一种。 */
  const needsLoginCheck =
    !item.implementation.loginCheck && Object.values(item.authRequirement).includes('required')

  return (
    <div className="jh-plat-detail">
      <ul className="jh-kv">
        <li>
          <span>现在能跑吗</span>
          <span className={blocked === null ? 'jh-ok' : 'jh-warn'}>
            {blocked ?? '可以 —— 到点真的会跑'}
          </span>
        </li>
        <li>
          <span>今日额度</span>
          <span
            className={
              item.governance.todayRuns >= item.governance.dailyLimit ? 'jh-warn' : undefined
            }
          >
            {item.governance.todayRuns} / {item.governance.dailyLimit} 轮
          </span>
        </li>
        <li>
          <span>冷却</span>
          <span>{cooldown === null ? '没在冷却' : `至 ${formatClock(cooldown)}`}</span>
        </li>
        <li>
          <span>最近一轮</span>
          <span>
            {lastRun === null
              ? '没跑过'
              : `${new Date(lastRun.startedAt).toLocaleString()} · ${CRAWL_STATE_LABEL[lastRun.state]}`}
          </span>
        </li>
        <li>
          <span>上次成功</span>
          <span>{item.lastOkAt === null ? '从来没有' : new Date(item.lastOkAt).toLocaleString()}</span>
        </li>
      </ul>

      {item.governance.riskPaused ? (
        <div className="jh-warn">
          <Term term="风险暂停">已被暂停自动采集</Term>
          {item.governance.riskReason === null ? '' : `：${item.governance.riskReason}`}
          {' '}—— 系统不会自动恢复，确认环境正常后在方案卡上点「确认恢复」。
        </div>
      ) : null}

      {/* 登录在这里**不重复**：状态徽标与「登录」按钮都在上面那一行（矩阵的登录格），
          明细只补状态之外的说明（正在检测的消息、账号提示）。
          曾经把按钮放在这里，结果是"要登录得先展开一行" —— 那是个更差的设计：
          折叠把动作藏起来，而登录恰恰是这张表里最高频的一下。 */}
      {item.login.message === null ? null : <div className="jh-muted">{item.login.message}</div>}
      {item.account.hint === null ? null : <div className="jh-muted">{item.account.hint}</div>}

      {/* 只在有话说的时候重复健康态：全绿时矩阵那一格已经说过了 */}
      {item.healthReason === null && item.failStreak === 0 ? null : (
        <div className="jh-warn">
          健康：{HEALTH_STATE_LABEL[item.health]}
          {item.failStreak > 0 ? `（连续失败 ${item.failStreak} 次）` : ''}
          {item.healthReason === null ? '' : ` —— ${item.healthReason}`}
        </div>
      )}

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

      {needsLoginCheck ? (
        <div className="jh-warn">
          该平台需要登录，但本机还没有登录态检测 —— 未登录时可能静默抓到空结果。
        </div>
      ) : null}

      {/* 量级（批次 5）：逐字段健康可能全绿，坏的只是**条数**。
          这是从数据里查不出来的一类故障 —— 必须跟该平台自己的历史比。 */}
      {item.yield.baseline === null ? null : (
        <div className={item.yield.level === 'dropped' ? 'jh-warn' : 'jh-muted'}>
          <Term term="量级">产量</Term>：近 {item.yield.samples} 轮的常态约 {item.yield.baseline} 条，
          最近一轮 {item.yield.lastFound ?? '—'} 条
          {item.yield.level === 'dropped'
            ? ' —— 明显偏低。字段健康可能是全绿的，先查翻页与懒加载。'
            : ''}
        </div>
      )}

      {missing.length === 0 ? null : (
        <div className="jh-warn">
          <Term term="逐字段健康">连续缺失</Term>：
          {missing
            .map((field) => `${field.field}×${String(field.consecutiveMiss)}`)
            .join(' · ')}
        </div>
      )}

      <div className="jh-plat-detail-actions">
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-tiny"
          onClick={props.onGoSettings}
          title="看诊断信息（版本、数据路径、计数、工具注册结果）"
        >
          排查方案
        </button>
      </div>
    </div>
  )
}

/** 「高/中/低」三档的短标签（平台事实里没有中文名可取，这里只是把枚举翻成人话）。 */
const LEVEL_SHORT: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/**
 * 能力格：**三态**一个徽标 —— 已实现（绿）/ 平台支持但我们没实现（黄）/ 平台不支持（灰）。
 *
 * 三态而不是"有没有"：`51job` 的 `capabilities.supportsGreeting` 是 true
 * 而 `actions.sayHello` 尚未实现 —— 只写一个 ✗ 会让用户以为"这个平台坏了"，
 * 而事实是"我们还没写"。这正是 `AdapterImplementationDto` 那段注释要防的事。
 */
function CapabilityCell(props: { supported: boolean; implemented: boolean }) {
  if (props.implemented) return <span className="jh-tag jh-tone-ok">已实现</span>
  if (props.supported) return <span className="jh-tag jh-tone-warn">未实现</span>
  return <span className="jh-tag jh-tone-muted">不支持</span>
}

/** 两态能力格：平台侧没有对应的"支持"标记时用（列表采集 / 详情页 / 登录检测）。 */
function DoneCell(props: { done: boolean }) {
  return (
    <span className={`jh-tag jh-tone-${props.done ? 'ok' : 'muted'}`}>
      {props.done ? '已实现' : '未实现'}
    </span>
  )
}

/**
 * 实验配置与能力矩阵（「诊断与明细」分区）。
 *
 * 为什么是一张**矩阵**而不是原来那段一段段的散文：
 * 这些恰好是**横向可比**的东西 —— "哪个平台支持打招呼而我们没写"、
 * "哪几个平台还没做过登录检测"，扫一列就知道，而读十段散文要自己记住上面九段。
 * 散文版还有一个更实际的问题：十段每段五行，把页面拉得很长，
 * 而它和上面的「平台总览」说的是同一批平台。
 *
 * 成熟度那一格带 `notes`（已知缺口）—— 那是"实验配置"里最该被读到的一句话。
 */
function CapabilityMatrix(props: { items: PlatformOverviewDto[] }) {
  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-caps">
        <thead>
          <tr>
            <th scope="col">平台</th>
            <th scope="col">成熟度</th>
            <th scope="col">上次验证</th>
            <th scope="col">列表采集</th>
            <th scope="col">详情页</th>
            <th scope="col">打招呼</th>
            <th scope="col">收件箱</th>
            <th scope="col">附件投递</th>
            <th scope="col">登录检测</th>
            <th scope="col">抓取需登录</th>
            <th scope="col">字段完整度</th>
            <th scope="col">反爬强度</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.id}>
              <td>
                <code>{item.id}</code>
                <div className="jh-muted">{item.displayName}</div>
              </td>
              <td>
                <span className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}>
                  {MATURITY_LEVEL_SHORT[item.maturity.level]}
                </span>
                {item.maturity.notes === undefined || item.maturity.notes === '' ? null : (
                  <div className="jh-muted">{item.maturity.notes}</div>
                )}
              </td>
              <td>{item.maturity.verifiedAt ?? '—'}</td>
              <td>
                <DoneCell done={item.implementation.crawl} />
              </td>
              <td>
                <DoneCell done={item.implementation.detail} />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsGreeting}
                  implemented={item.implementation.actions.sayHello}
                />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsInbox}
                  implemented={item.implementation.actions.readInbox}
                />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsAttachment}
                  implemented={item.implementation.actions.sendResume}
                />
              </td>
              <td>
                <DoneCell done={item.implementation.loginCheck} />
              </td>
              <td>{AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl]}</td>
              <td>{LEVEL_SHORT[item.capabilities.fieldCompleteness]}</td>
              {/* 反爬强是**对采集不利**的事实，所以高的一档染成警告色 */}
              <td className={item.capabilities.antiBot === 'high' ? 'jh-warn' : undefined}>
                {LEVEL_SHORT[item.capabilities.antiBot]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 最近运行小表（SR-28）。
 *
 * 标题由外层卡片给（`h2`），所以这里不再自带一个 `h3` —— 同一个模块名写两遍
 * 只会让标题层级多出一层没有意义的嵌套。
 *
 * ## 这一轮补了什么（原表只有 开始/状态/触发/新增/更新/结果说明）
 *
 *   1. **「开始」带日期**。原来只打 `HH:MM` —— 一张跨天的表于是**看起来是乱序的**：
 *      `16:16 / 09:34 / 16:15` 其实是"今天 16:16 → 今天 09:34 → 昨天 16:15"，
 *      严格倒序，但只看时分根本看不出来。这是"最近运行没倒序"这个印象的来源。
 *   2. **平台**。多平台之后，"这一轮是哪个平台跑的"是读这张表的第一问题，
 *      而原表没有这一列 —— 10 行混在一起分不清谁是谁。
 *   3. **命中 / 耗时**。`found` 是每轮的头号数字（抓到多少条）；耗时回答
 *      "为什么这一轮跑了 12 分钟"。原表只给"新增/更新"，那是**入库**量，
 *      一页抓 300 条而全是旧的时，两个数字都是 0 —— 看起来像"什么都没干"。
 *   4. **隔离**（进 `pending_repair` 的条数）：数据质量信号，全为 0 时整列不出现。
 *      页数（`pages`）不进列：它是"命中"的解释，挂在那个格子的 `title` 上。
 *
 * ## 顺序
 *
 * 表**不排序**，按接口给的顺序渲染（`GET /scheduler/status` 的 `recentRuns`）。
 * 那个顺序现在由 host 侧按 `started_at DESC` 定义（见 `store/repo/crawl-runs.ts`
 * 里 `list()` 的注释）：界面不自己再排一遍，否则"界面看到的顺序"与
 * "接口承诺的顺序"会变成两套，将来只能靠猜。
 *
 * 错误不再把一整段堆栈摊在单元格里 —— 单元格只放**状态胶囊 + 一句人话 + 详情**，
 * 点开是弹窗（`Modal`）看完整 trace 与排查步骤。
 */
function RunHistoryTable(props: {
  runs: RecentRunDto[]
  loading: boolean
  reasonFor: (skipReason: string | null) => string | null
  /** 平台 id → 显示名；认不出来返回 null（那就不编一个名字给它）。 */
  platformName?: (platformId: string) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  // 加载态与空态必须分开（见上面 `plansLoading` 的注释）
  if (props.loading) {
    return (
      <p className="jh-muted" aria-busy="true" aria-live="polite">
        正在读取运行记录…
      </p>
    )
  }
  if (props.runs.length === 0) {
    return (
      <div className="jh-empty">
        <p className="jh-muted">还没有运行记录。</p>
        <p className="jh-note">第一次「立即采集」或等到偏好时段自动触发之后，这里会出现每一轮的结果。</p>
      </div>
    )
  }

  const now = new Date()
  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null)
  // 全 0 的列不出现：一个从头到尾都是 0 的「隔离」列只是在占宽度
  const showQuarantined = props.runs.some((run) => run.quarantined > 0)

  return (
    <div className="jh-table-scroll">
      {/* 小屏策略：**有意的横向滚动**（quality-gates §5 允许，但要求保留行身份与主操作）。
          第一列（开始）做粘性，横向滚动时仍能认行；「更新」「隔离」列在小屏隐藏以降低密度。 */}
      <table className="jh-table jh-table-runs">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">开始</th>
            <th scope="col">平台</th>
            <th scope="col" className="jh-cell-status">状态</th>
            {showReason ? <th scope="col">触发</th> : null}
            <th scope="col" className="jh-num">命中</th>
            <th scope="col" className="jh-num">新增</th>
            <th scope="col" className="jh-num jh-col-hide-sm">更新</th>
            {showQuarantined ? <th scope="col" className="jh-num jh-col-hide-sm">隔离</th> : null}
            <th scope="col" className="jh-num">耗时</th>
            <th scope="col">结果说明</th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => {
            const skip = props.reasonFor(run.skipReason)
            const failure: FailureText | null =
              skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null
            const startedAt = new Date(run.startedAt)
            const duration =
              run.endedAt === null
                ? null
                : formatDuration(new Date(run.endedAt).getTime() - startedAt.getTime())
            // 平台列给人看的名字优先；认不出来就退回 id（不编名字）
            const platformName = props.platformName?.(run.platformId) ?? null
            return (
              <tr key={run.id}>
                {/* 带日期：跨天的表必须看得出"越过了一天"，否则倒序会读成乱序 */}
                <td
                  className="jh-col-sticky"
                  title={`${startedAt.toLocaleString()} · ${formatRelative(startedAt, now)}`}
                >
                  {formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt}
                </td>
                <td title={platformName === null ? run.platformId : `${platformName}（${run.platformId}）`}>
                  {platformName ?? <code>{run.platformId}</code>}
                </td>
                <td className="jh-cell-status">
                  <StateTag state={run.state} kind="run" />
                </td>
                {showReason ? <td>{runReasonLabel(run.reason) ?? '—'}</td> : null}
                {/* 页数挂在命中的 title 上：它是"命中多少"的解释，不值得单独占一列 */}
                <td className="jh-num" title={`翻了 ${String(run.pages)} 页`}>
                  {run.found}
                </td>
                <td className="jh-num">{run.inserted}</td>
                <td className="jh-num jh-col-hide-sm">{run.updated}</td>
                {showQuarantined ? (
                  <td
                    className={`jh-num jh-col-hide-sm${run.quarantined > 0 ? ' jh-warn' : ''}`}
                    title={
                      run.quarantined > 0
                        ? `${String(run.quarantined)} 条被字段断言拦下，进了待修队列（数据本身没写进岗位库）`
                        : undefined
                    }
                  >
                    {run.quarantined}
                  </td>
                ) : null}
                <td className="jh-num">{duration ?? (run.state === 'running' ? '进行中' : '—')}</td>
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
  )
}

/**
 * 异常日志（「诊断与明细」分区）。
 *
 * 只列**没跑成**的轮次：失败（有错误码）与被跳过（有 skipReason）。
 * 与「运行仪表盘 · 最近运行」的分工是：那边是"每一轮发生了什么"的完整流水，
 * 这边是"哪几轮没跑成、为什么" —— 排障时不该在一张多数是成功行的表里找失败。
 *
 * 失败原因仍然是**胶囊 + 点击弹窗**（与最近运行同一套），不把堆栈摊进单元格。
 */
function RunLogCard(props: {
  runs: RecentRunDto[]
  loading: boolean
  reasonFor: (skipReason: string | null) => string | null
  /** 平台 id → 显示名；与「最近运行」同一套回调（两处都显示同一个名字）。 */
  platformName?: (platformId: string) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  if (props.loading) {
    return (
      <p className="jh-muted" aria-busy="true" aria-live="polite">
        正在读取运行记录…
      </p>
    )
  }

  const now = new Date()
  const rows = props.runs
    .map((run) => ({
      run,
      skip: props.reasonFor(run.skipReason),
      failure: humanizeFailure(run.errorCode, run.errorMsg),
    }))
    .filter((row) => row.skip !== null || row.failure !== null)

  if (rows.length === 0) {
    return (
      <div className="jh-empty">
        <p className="jh-muted">最近这些轮次里没有失败或跳过。</p>
        <p className="jh-note">
          这不等于"以后不会失败" —— 下一轮真失败了，完整原因与排查步骤会出现在这里。
        </p>
      </div>
    )
  }

  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-runs">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">开始</th>
            <th scope="col">平台</th>
            <th scope="col" className="jh-cell-status">状态</th>
            <th scope="col">原因</th>
            <th scope="col">触发</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ run, skip, failure }) => {
            const startedAt = new Date(run.startedAt)
            const platformName = props.platformName?.(run.platformId) ?? null
            return (
              <tr key={run.id}>
                {/* 与「最近运行」同一个理由：跨天的表必须带日期，否则倒序读不出来 */}
                <td
                  className="jh-col-sticky"
                  title={`${startedAt.toLocaleString()} · ${formatRelative(startedAt, now)}`}
                >
                  {formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt}
                </td>
                <td title={platformName === null ? run.platformId : `${platformName}（${run.platformId}）`}>
                  {platformName ?? <code>{run.platformId}</code>}
                </td>
                <td className="jh-cell-status">
                  <StateTag state={run.state} kind="run" />
                </td>
                <td>
                  {skip !== null ? (
                    <span>{skip}</span>
                  ) : failure === null ? (
                    <span className="jh-muted">—</span>
                  ) : (
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
                <td>{runReasonLabel(run.reason) ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* FieldHint 已抽到 `../field-hint.js` —— 设置页也要用同一种"长解释收进问号"。 */

/** 分步弹窗的三步（分步条与"下一步"的文案共用这一份，不各写一遍）。 */
const PLAN_STEPS = ['基础与平台', '采集与筛选', '调度与后处理'] as const

/**
 * 第 2 步里默认**摊在明面上**的筛选维度。
 *
 * 判据是"改方案时最常动的几个"：搜什么岗位、在哪个城市、什么经验、什么学历、什么薪资。
 * 其余维度（排序方式 / 发布时间 / 职位范围 / 各平台特有维度）默认值几乎都是"不限"，
 * 十来个下拉框全摊出来只会把上面这几个淹掉 —— 评审原话："中间 15+ 个下拉框大部分默认不限，
 * 极占空间"。所以它们进「高级筛选」折叠区。
 *
 * ⚠️ 放进折叠区**不等于**隐藏：不支持的维度仍然会渲染（禁用 + 写明原因），
 * 折叠区里有生效值时还会自动展开并把项数写在折叠开关上。
 */
const PRIMARY_CRITERIA_KEYS: readonly string[] = [
  'keyword',
  'city',
  'workExp',
  'education',
  'salaryRange',
]

/**
 * 表格「平台」列里问号的内容：**一个平台的静态事实**。
 *
 * 这些是"点开之前就该知道"的东西 —— 成熟度缺口（`notes` 里写着已知陷阱）、
 * 上次真机验证日期、三个环节各自的登录要求。原来它们只出现在保存后的提示里
 * （也就是**配置完才看到**），现在放在平台名字旁边，选之前就能看。
 */
function platformHintOf(item: PlatformOverviewDto): string {
  const parts = [`${item.displayName}（${item.id}）`, MATURITY_LEVEL_LABEL[item.maturity.level]]
  if (item.maturity.verifiedAt !== null) parts.push(`上次真机验证 ${item.maturity.verifiedAt}`)
  if (item.maturity.notes !== undefined && item.maturity.notes !== '') parts.push(item.maturity.notes)
  parts.push(
    '登录要求：' +
      `抓取${AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl]}、` +
      `详情${AUTH_REQUIREMENT_LABEL[item.authRequirement.detail]}、` +
      `动作${AUTH_REQUIREMENT_LABEL[item.authRequirement.actions]}`,
  )
  return parts.join('；')
}

/**
 * 表格「限制」列的短文案。
 *
 * 只放**一眼要用的两条**：页数上限（超了保存会直接被拒）与"抓取要不要登录"。
 * 完整说明在平台名旁的问号里 —— 表格单元格塞长段文字正是评审要消掉的那种噪音。
 */
function limitTextOf(item: PlatformOverviewDto): string {
  // 拦一道版本错位：宿主半改了 `maxPages` 而 DSH 没重启时，这个字段会是 undefined。
  // 那种情况下宁可不写页数，也不要印出"最多 undefined 页"（OPTIMIZATION-PLAN §1.2 第 9 条：
  // 改宿主半必须重启 DSH —— 界面这一侧不该因此说假话）。
  const parts = Number.isFinite(item.maxPages) ? [`最多 ${String(item.maxPages)} 页`] : []
  const crawl = item.authRequirement.crawl
  if (crawl === 'required') parts.push('抓取需登录')
  else if (crawl === 'unknown') parts.push('抓取登录未验证')
  return parts.join(' · ')
}

/**
 * 方案编辑器（**分步弹窗**）。
 *
 * ## 这一版针对"信息密度极低、平铺堆砌"的评审改了什么
 *
 * 一条一句，对应评审的四条：
 *   * **分步**：一个弹窗无限往下滚 → 三步（基础与平台 / 采集与筛选 / 调度与后处理），
 *     底栏吸底，只有主体滚动；
 *   * **平台表格化**：原来"上面勾一遍平台、下面再把每个平台列一遍填页数" → 一张表
 *     （勾选 / 平台 / 状态 / 页数上限 / 限制），带全选与批量设置；
 *   * **降噪**：底部那坨"· 提示一 · 提示二"的棕色文字瀑布 → 顶部一个可收起的
 *     「配置须知」+ 逐条一行的提示列表；平台自己的限制就近放进表格的 `?` 与「限制」列；
 *   * **控件标准化**：「检查」从漂在输入框旁边的按钮 → 输入框的**后缀按钮**（并在失焦时
 *     自动校验）；运行日与时段同一行对齐。
 *
 * 刻意**没有**改的：校验规则（仍然只在 host 那一份 `validatePlanConfig` 里）、
 * 表单到写入体的转换（`writeOf`）、以及"有重复/提示就不自动关窗"的行为。
 * 界面能拦下的（方案名为空、没选平台、平台全被暂停）与接口报的是**同一套**判据 ——
 * 拦在这里只是省一趟必失败的网络往返，不是另立一套规则。
 */
function PlanEditorModal(props: {
  planId: number | null
  initial: PlanForm
  /** 已注册平台的**概览**（含成熟度 / 登录要求 / 页数上限 —— 表格的三列全靠它）。 */
  available: PlatformOverviewDto[]
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
  /** 当前步骤（0/1/2）。步骤本身不落库，切走就没了 —— 它只是"怎么填"的组织方式。 */
  const [step, setStep] = useState(0)
  /** 「配置须知」默认**收起**：它每次都出现，展开就等于每次弹窗都先挡一段说明。 */
  const [rulesOpen, setRulesOpen] = useState(false)
  /** 「高级筛选」展开态；有生效值时会被下面的 effect 强制展开（折叠的条件不能变成隐形条件）。 */
  const [advancedOpen, setAdvancedOpen] = useState(false)
  /** 批量设置页数用的输入值（不落库，只作用于一次点击）。 */
  const [batchPages, setBatchPages] = useState('5')
  const allBoxRef = useRef<HTMLInputElement>(null)
  /** 正在保存（本弹窗自己的，不含页面级那一条反馈）。 */
  const [submitting, setSubmitting] = useState(false)
  /** 保存失败的原因，**就地**显示。 */
  const [submitError, setSubmitError] = useState<string | null>(null)
  /**
   * 最后一次成功保存的回执：写入体 + 当时的方案名。
   *
   * 为什么要这么一个状态：父组件在**有重复或提示时刻意不关窗**（提示不能被一起关掉），
   * 而新建方案的默认值是"全平台"，其中实验/停用档的平台必然带来提示 —— 于是
   * "保存成功"与"按钮没反应"在界面上一模一样（防抖校验早就把同一批提示画在顶部了，
   * 保存成功不产生任何视觉变化）。用户接着自然会再点一次，那会在库里多出一个同名方案。
   * 所以成功后就地给回执，并在内容没变时把按钮换成「已保存」——
   * 改动任何一项立刻变回「保存」，不会挡住"改了再存"。
   */
  const [receipt, setReceipt] = useState<{ body: string; name: string } | null>(null)

  const patch = (next: Partial<PlanForm>): void => setForm((current) => ({ ...current, ...next }))

  // 总残留重复 = 保存接口返回的 + 本地实时校验得到的。
  const duplicates = [...props.duplicates, ...localDuplicates]
  // 提示同理：保存后拿到一次，编辑过程中由防抖校验持续刷新 —— 这样"选了国聘 + 成都"
  // 在**保存之前**就看得见"它会返回空"，而不是等抓完 0 条才发现。
  const notices = [...new Set([...props.notices, ...localNotices])]
  const startClock = parseClockValue(form.windowStart)
  const endClock = parseClockValue(form.windowEnd)
  const startMissing = startClock === null
  const endMissing = endClock === null

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

  /**
   * 手动 / 失焦触发一次校验。
   *
   * 防抖那条只看平台与条件（改方案名不会触发），所以"检查"这个动作还得留着。
   * 评审提的是"按钮与输入框脱节"，所以这里做两件事：
   *   ① 把它做成输入框的**后缀按钮**（视觉上是同一个控件，见 .jh-affix）；
   *   ② 挂在输入框的 `onBlur` 上 —— 改完名字一离开就自动查一次，多数情况下根本不用点它。
   */
  const check = (): void => {
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
  }

  /**
   * 当前表单的写入体指纹（`writeOf` 的结果，含时间解析兜底，所以稳定）。
   * 只用来判断"自上次保存之后改过没有"。
   */
  const bodyKey = JSON.stringify(writeOf(form))
  const unchangedSinceSave = receipt !== null && receipt.body === bodyKey
  const busy = submitting || props.running

  /**
   * 保存。**失败必须就地显示**。
   *
   * 原来失败只走页面级那条 `feedback`（`report()`），而它在弹窗遮罩后面 ——
   * 用户看到的就是"点了保存没反应"。所以父组件改成把错误抛回来，由这里画在
   * 弹窗顶部（紧挨着保存按钮那一侧）。
   */
  const submit = async (): Promise<void> => {
    // 再挡一道：按钮的 disabled 要等一次重渲染才生效，而"保存"按两次的代价是
    // 库里多出一个同名方案（不是一次无害的重复请求）。
    if (busy || unchangedSinceSave) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await props.onSubmit(form)
      setReceipt({ body: bodyKey, name: form.name.trim() })
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.display : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 第 1 步的门槛：与 `validatePlanConfig` 的三条硬性判据**一一对应** ──────────
  // 拦在这里只是省一趟必然失败的网络往返，不是另立一套规则。
  const includedCount = form.platforms.length
  const enabledCount = form.platforms.filter(
    (id) => (form.overrides[id] ?? { enabled: true }).enabled,
  ).length
  const nameMissing = form.name.trim() === ''
  const stepOneBlocked = nameMissing || includedCount === 0 || enabledCount === 0
  const planPages = form.criteria['maxPages'] ?? ''

  // 方案级页数上限在第 1 步与平台表挨着呈现，所以从第 2 步的维度网格里摘出去 ——
  // 同一个输入出现在两处，正是评审要消掉的那种重复。
  const pagesDimension = items.find((item) => item.key === 'maxPages')
  const filterItems = items.filter((item) => item.key !== 'maxPages')
  const primaryItems = filterItems.filter(
    (item) => item.supported && PRIMARY_CRITERIA_KEYS.includes(item.key),
  )
  const primaryKeys = new Set(primaryItems.map((item) => item.key))
  // 不支持的维度一律留在高级区（禁用 + 写明原因），所以"只有支持的才进高频区"
  // 不会把任何一个维度藏起来。
  const advancedItems = filterItems.filter((item) => !primaryKeys.has(item.key))
  const advancedActiveCount = advancedItems.filter(
    (item) => (form.criteria[item.key] ?? '') !== '',
  ).length
  const advancedNames =
    advancedItems
      .filter((item) => item.supported)
      .map((item) => item.label)
      .slice(0, 4)
      .join(' / ') || '排序方式 / 发布时间 / 平台特有维度'

  useEffect(() => {
    // 高级区里有生效值就必须展开：折叠的条件不能变成隐形条件（与岗位库同一条判据）。
    if (advancedActiveCount > 0) setAdvancedOpen(true)
  }, [advancedActiveCount])

  const allIncluded = includedCount > 0 && includedCount === props.available.length
  useEffect(() => {
    // 半选态只能通过 DOM 属性表达（React 没有对应的 prop），所以跟着渲染同步一次。
    const box = allBoxRef.current
    if (box !== null) box.indeterminate = includedCount > 0 && !allIncluded
  }, [includedCount, allIncluded])

  const toggleAll = (): void => {
    if (allIncluded) {
      patch({ platforms: [], overrides: {} })
      return
    }
    // 保留已经配过的覆盖项：全选不该把"某个平台单独设的页数/暂停"抹掉。
    const nextOverrides: Record<string, { enabled: boolean; maxPages: string }> = {}
    for (const item of props.available) {
      nextOverrides[item.id] = form.overrides[item.id] ?? { enabled: true, maxPages: '' }
    }
    patch({ platforms: props.available.map((item) => item.id), overrides: nextOverrides })
  }

  /**
   * 批量设置页数上限（评审："支持顶部批量设置选中平台页数上限"）。
   *
   * **超过平台自己上限的按该平台上限填写**，而不是静默截断：工具栏上就写着这条，
   * 表格里的数字也会当场变成那个上限，而「限制」列本来就写着"最多 N 页"。
   * 不这么做的话，一次批量设置会造出若干条保存时必然被拒的配置（guopin / waiqi / zhipin
   * 都只有 1 页，不是边角情况）。
   */
  const applyBatchPages = (): void => {
    const parsed = Number.parseInt(batchPages, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const nextOverrides = { ...form.overrides }
    for (const item of props.available) {
      if (!form.platforms.includes(item.id)) continue
      const current = nextOverrides[item.id] ?? { enabled: true, maxPages: '' }
      // 拿不到平台上限时（版本错位）不收敛、也不写 NaN —— 就按用户填的值写下去。
      const cap = Number.isFinite(item.maxPages) ? item.maxPages : parsed
      nextOverrides[item.id] = { ...current, maxPages: String(Math.min(parsed, cap)) }
    }
    patch({ overrides: nextOverrides })
  }

  /**
   * 渲染一个筛选维度（高频区与高级区共用同一份）。
   *
   * 不支持的维度**仍然渲染**（禁用 + 写明原因）—— 这是本项目一贯的做法：
   * 隐藏会让用户以为功能坏了（§5.5 能力驱动的 UI）。所以"进折叠区"不等于"藏起来"。
   */
  const renderDimension = (dimension: CriteriaDimensionDto) => {
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
  }

  return (
    <Modal
      title={props.planId === null ? '新增采集方案' : '编辑采集方案'}
      label="采集方案"
      size="lg"
      onClose={props.onCancel}
      footer={
        <>
          {step === 0 ? null : (
            <button type="button" className="jh-btn jh-btn-inline" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          <span className="jh-spacer" />
          <button type="button" className="jh-btn jh-btn-inline" onClick={props.onCancel}>
            取消
          </button>
          {step < PLAN_STEPS.length - 1 ? (
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={busy || (step === 0 && stepOneBlocked)}
              title={
                step === 0 && stepOneBlocked
                  ? '先填方案名，并至少纳入一个未暂停的平台。'
                  : `下一步：${PLAN_STEPS[step + 1] ?? ''}`
              }
              onClick={() => setStep(step + 1)}
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={busy || stepOneBlocked || unchangedSinceSave}
              title={
                stepOneBlocked
                  ? '方案名不能为空，且至少要有一个未暂停的平台 —— 与保存接口的判据一致。'
                  : unchangedSinceSave
                    ? '当前内容与上次保存的一致；改动任何一项后可以再次保存。'
                    : busy
                      ? '正在保存，请稍候。'
                      : '保存这个方案。'
              }
              onClick={() => void submit()}
            >
              {unchangedSinceSave ? '已保存' : busy ? '正在保存…' : '保存'}
            </button>
          )}
        </>
      }
    >
      {/* 分步条：**可点**（回看已配的部分不必先点"上一步"）。
          第 2/3 步在门槛未过时禁用 —— 没选平台就进"筛选条件"，那里一片"不支持"。 */}
      <nav className="jh-steps" aria-label="方案配置步骤">
        {PLAN_STEPS.map((label, index) => (
          <Fragment key={label}>
            {index === 0 ? null : (
              <span className="jh-step-sep" aria-hidden="true">
                ›
              </span>
            )}
            <button
              type="button"
              className={`jh-step${index === step ? ' jh-step-on' : ''}`}
              aria-current={index === step ? 'step' : undefined}
              disabled={index > 0 && stepOneBlocked}
              title={
                index > 0 && stepOneBlocked
                  ? '先填方案名，并至少纳入一个未暂停的平台。'
                  : `第 ${String(index + 1)} 步：${label}`
              }
              onClick={() => setStep(index)}
            >
              <span className="jh-step-no" aria-hidden="true">
                {index + 1}
              </span>
              {label}
            </button>
          </Fragment>
        ))}
      </nav>

      {/* 全局规则：按评审要求用**标准轻量 Alert**（.jh-alert-quiet）放在弹窗顶部，可收起。
          原来它是底栏右侧那半句话 —— 而底栏现在只剩按钮。 */}
      <div className="jh-alert jh-alert-quiet">
        <button
          type="button"
          className="jh-plan-toggle"
          aria-expanded={rulesOpen}
          aria-controls="jh-plan-rules"
          onClick={() => setRulesOpen((open) => !open)}
        >
          <span className="jh-plan-caret" aria-hidden="true">
            {rulesOpen ? '▾' : '▸'}
          </span>
          <span className="jh-plan-toggle-text">配置须知</span>
          <span className="jh-filter-note">保存前按同一套规则校验 · 平台自身的限制见下表「限制」列</span>
        </button>
        <div className="jh-plan-panel" id="jh-plan-rules" hidden={!rulesOpen}>
          <ul className="jh-alert-list">
            <li>
              保存前会按与模型工具、接口<strong>同一套</strong>规则校验；不合法直接报错、不入库。
            </li>
            <li>
              页数上限按<strong>每个平台自己</strong>的上限校验（见「限制」列）。给某个平台单独填的页数
              只作用于它；留空则用第 1 步的方案级页数。
            </li>
            <li>
              筛选条件按<strong>已纳入且未暂停</strong>的平台校验 —— 某个平台不认的条件会被拒绝，
              而不是静默忽略。
            </li>
            <li>
              定时时段只在区间内随机取点，不固定到某一分钟：固定时刻最容易被平台识别成自动化。
            </li>
          </ul>
        </div>
      </div>

      {/* 保存结果：**必须画在弹窗里**。原来它只走页面级那条反馈，而那条在遮罩后面 ——
          保存成功、失败、进行中三种情况在用户眼里都是"点了没反应"。 */}
      {submitError === null ? null : (
        <div className="jh-alert jh-alert-error" role="alert">
          <div className="jh-alert-head">
            <span className="jh-alert-title">保存失败</span>
            <span className="jh-muted">没有写入任何东西；按下面的原因改完可以直接重试。</span>
          </div>
          <p className="jh-alert-body">{submitError}</p>
        </div>
      )}
      {receipt === null || !unchangedSinceSave ? null : (
        <div className="jh-alert" role="status">
          <div className="jh-alert-head">
            <span className="jh-alert-title">已保存方案「{receipt.name}」</span>
            <span className="jh-muted">改动任何一项后「保存」会重新可用。</span>
          </div>
        </div>
      )}

      {/* 当前配置的提示：**就近放在顶部、一条一行**。旧版是堆在弹窗最底部的一大段棕色文字
          （评审原话"文字瀑布"），而且用户要填完最后一个字段才看得到它。 */}
      {duplicates.length === 0 && notices.length === 0 ? null : (
        <div
          className={`jh-alert ${duplicates.length > 0 ? 'jh-alert-warn' : 'jh-alert-quiet'}`}
          role="status"
        >
          <div className="jh-alert-head">
            <span className="jh-alert-title">
              {[
                duplicates.length > 0 ? `与 ${String(duplicates.length)} 个方案条件重复` : null,
                notices.length > 0 ? `${String(notices.length)} 条提示` : null,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </span>
            <span className="jh-muted">只提示，仍可保存</span>
          </div>
          <ul className="jh-alert-list">
            {duplicates.map((item) => (
              <li key={`dup-${String(item.planId)}`}>
                与 #{item.planId}「{item.name}」条件重复（{item.reason}）—— 不会自动合并。
              </li>
            ))}
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="jh-step-body">
        {step === 0 ? (
          <>
            {/* 方案名 + 检查：它校验的就是"这份配置是否重复"，所以贴成输入框的**后缀按钮** */}
            <div className="jh-field">
              <span className="jh-field-label">方案名</span>
              <div className="jh-affix">
                <input
                  className="jh-input"
                  value={form.name}
                  aria-invalid={nameMissing}
                  onChange={(event) => patch({ name: event.target.value })}
                  onBlur={check}
                />
                <button
                  type="button"
                  className="jh-btn jh-affix-btn"
                  disabled={props.running}
                  title="检查这份配置（平台 + 筛选条件）是否与现有方案重复、以及哪些平台会返回空。只提示，不会写入任何东西。"
                  onClick={check}
                >
                  检查
                </button>
              </div>
              {nameMissing ? (
                <span className="jh-warn" role="alert">
                  方案名不能为空。
                </span>
              ) : null}
            </div>

            <div className="jh-section-title">目标平台与页数</div>

            {props.available.length === 0 ? (
              <p className="jh-muted">还没有已注册的平台。</p>
            ) : (
              <>
                {/* 方案级页数：只作用于**没单独填页数**的平台。方案级表达不了"某个平台
                    只支持 1 页"，所以逐平台的覆盖项才是精确的那一层（见下表）。 */}
                {pagesDimension === undefined || !pagesDimension.supported ? null : (
                  <div className="jh-field">
                    <span className="jh-field-label">
                      抓取页数上限（方案级）
                      <FieldHint
                        text={`${pagesDimension.hint} 单个平台可在下表单独填，填了就用它。留空则各平台按自己的默认页数抓；超过某个平台自身上限的部分对它无效，保存前会提示。`}
                      />
                    </span>
                    <div className="jh-field-row">
                      <input
                        className="jh-input jh-input-narrow"
                        type="number"
                        min={1}
                        placeholder="默认"
                        aria-label="方案级抓取页数上限"
                        value={planPages}
                        onChange={(event) => setCriteria('maxPages', event.target.value)}
                      />
                      <span className="jh-muted">页 —— 留空则各平台按自己的默认页数抓</span>
                    </div>
                  </div>
                )}

                {/* 表格工具条：全选在左（与"已勾选的行"贴在一起），批量设置在右 */}
                <div className="jh-batch">
                  <label className="jh-check">
                    <input
                      ref={allBoxRef}
                      type="checkbox"
                      checked={allIncluded}
                      onChange={toggleAll}
                    />
                    全选
                  </label>
                  <span className="jh-muted">
                    已纳入 {includedCount} / {props.available.length} 个平台
                    {enabledCount === includedCount
                      ? ''
                      : `（其中 ${String(includedCount - enabledCount)} 个已暂停）`}
                  </span>
                  <span className="jh-spacer" />
                  <label className="jh-muted" htmlFor="jh-batch-pages">
                    批量设置页数上限
                  </label>
                  <input
                    id="jh-batch-pages"
                    className="jh-input"
                    type="number"
                    min={1}
                    value={batchPages}
                    onChange={(event) => setBatchPages(event.target.value)}
                  />
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline jh-btn-tiny"
                    disabled={includedCount === 0}
                    title="给所有已纳入的平台填上同一个页数上限。超过平台自身上限的按该平台上限填写。"
                    onClick={applyBatchPages}
                  >
                    应用
                  </button>
                </div>
                <p className="jh-filter-note">
                  超过平台自身上限的按该平台上限填写；页数留空的平台用上面的方案级页数。
                </p>

                <div className="jh-table-scroll">
                  <table className="jh-table jh-table-plan jh-table-roomy">
                    <thead>
                      <tr>
                        <th scope="col" className="jh-col-check">
                          <span className="jh-sr-only">纳入方案</span>
                        </th>
                        <th scope="col">平台</th>
                        <th scope="col">状态</th>
                        <th scope="col">页数上限</th>
                        <th scope="col">限制</th>
                      </tr>
                    </thead>
                    <tbody>
                      {props.available.map((item) => {
                        const included = form.platforms.includes(item.id)
                        const entry = form.overrides[item.id] ?? { enabled: true, maxPages: '' }
                        // 至少留一个启用的平台：全暂停等于"这个方案永远不抓任何东西"，
                        // 而 `validatePlanConfig` 会因此直接拒绝保存 —— 与其让用户点两次
                        // 才知道，不如把最后一个"暂停"按禁掉并说明原因。
                        const lastEnabled = included && entry.enabled && enabledCount === 1
                        // 超过这个平台自己的上限 → 保存必被拒（`validatePlanConfig` 按**每个平台
                        // 各自**的 maxPages 校验）。这里先说出来，省一趟必然失败的往返。
                        const overCap =
                          entry.maxPages.trim() !== '' && Number(entry.maxPages) > item.maxPages
                        return (
                          <tr key={item.id}>
                            <td className="jh-col-check">
                              <input
                                type="checkbox"
                                checked={included}
                                aria-label={`纳入 ${item.displayName}`}
                                onChange={() => togglePlatform(item.id)}
                              />
                            </td>
                            <td>
                              {item.displayName}
                              <FieldHint text={platformHintOf(item)} />
                            </td>
                            <td>
                              <span
                                className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}
                              >
                                {MATURITY_LEVEL_SHORT[item.maturity.level]}
                              </span>
                              {included && !entry.enabled ? (
                                <span className="jh-tag jh-tone-muted">已暂停</span>
                              ) : null}
                              {included ? (
                                <button
                                  type="button"
                                  className="jh-btn jh-btn-inline jh-btn-tiny"
                                  disabled={lastEnabled}
                                  title={
                                    lastEnabled
                                      ? '至少留一个启用的平台 —— 全暂停等于这个方案永远抓不到东西。'
                                      : entry.enabled
                                        ? '暂时不抓这个平台（保留它的页数配置与查重口径）。'
                                        : '恢复抓取这个平台。'
                                  }
                                  onClick={() => setOverride(item.id, { enabled: !entry.enabled })}
                                >
                                  {entry.enabled ? '暂停' : '恢复'}
                                </button>
                              ) : null}
                            </td>
                            <td>
                              <input
                                className="jh-input jh-pages-input"
                                type="number"
                                min={1}
                                max={item.maxPages}
                                value={entry.maxPages}
                                placeholder={planPages === '' ? '默认' : planPages}
                                disabled={!included || !entry.enabled}
                                aria-invalid={overCap}
                                aria-label={`${item.displayName} 的页数上限`}
                                onChange={(event) =>
                                  setOverride(item.id, { maxPages: event.target.value })
                                }
                              />
                            </td>
                            <td className="jh-muted">
                              {limitTextOf(item)}
                              {overCap ? (
                                <span className="jh-error"> · 超过上限，保存会被拒</span>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {stepOneBlocked ? (
              <p className="jh-warn" role="alert">
                {nameMissing ? '先填方案名。' : ''}
                {includedCount === 0 ? '至少纳入一个平台。' : ''}
                {includedCount > 0 && enabledCount === 0 ? '至少留一个未暂停的平台。' : ''}
                这两条同时也是保存接口的硬性判据。
              </p>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {/* 高频区：只留"改方案时最常动的几个"。其余进高级筛选 ——
                它们默认值几乎都是"不限"，摊在明面上只会把上面这几个淹掉。 */}
            <div className="jh-section-title">筛选条件</div>
            {primaryItems.length === 0 ? (
              <p className="jh-muted">
                已纳入的平台没有声明任何筛选维度 —— 保存后它们会按平台自己的默认列表抓。
              </p>
            ) : (
              <div className="jh-grid2">{primaryItems.map(renderDimension)}</div>
            )}

            {/* 高级筛选默认收起；**有生效值时会被上面的 effect 自动展开**，
                折叠开关上也把项数写出来 —— 折叠的条件不能变成隐形条件。 */}
            {advancedItems.length === 0 ? null : (
              <>
                <button
                  type="button"
                  className="jh-plan-toggle"
                  aria-expanded={advancedOpen}
                  aria-controls="jh-plan-advanced"
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <span className="jh-plan-caret" aria-hidden="true">
                    {advancedOpen ? '▾' : '▸'}
                  </span>
                  <span className="jh-plan-toggle-text">高级筛选</span>
                  <span
                    className={`jh-filter-note${advancedActiveCount > 0 ? ' jh-filter-note-on' : ''}`}
                  >
                    {advancedActiveCount > 0
                      ? `已设 ${String(advancedActiveCount)} 项`
                      : advancedNames}
                  </span>
                </button>
                <div className="jh-plan-panel" id="jh-plan-advanced" hidden={!advancedOpen}>
                  <div className="jh-grid2">{advancedItems.map(renderDimension)}</div>
                </div>
              </>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            {/* 时段与运行日**同一行**（评审："保持与时间段选择器同一行对齐"）。
                两者回答的是同一件事 —— "什么时候跑"，拆成两行只是白占一屏。
                窄屏/放大字号下由 flex-wrap 逐项换行，不把控件压扁。 */}
            <fieldset className="jh-fieldset">
              <legend>
                定时
                <FieldHint text="触发时刻会在这段时间内随机选点，具体到哪一分钟不固定 —— 每天固定同一分钟去访问最容易被平台识别成自动化。这里刻意没有「精确到某分某秒」的选项。一天都不选运行日等于每天都跑；时段跨零点也可以（例如 22:00 至 02:00）。" />
              </legend>
              <div className="jh-schedule-row">
                <div className="jh-field">
                  <span className="jh-field-label">偏好时段</span>
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
                  </div>
                </div>

                <div className="jh-field">
                  <span className="jh-field-label">运行日</span>
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
                </div>
              </div>

              {startMissing || endMissing ? (
                <span className="jh-warn" id="jh-window-error" role="alert">
                  时段没填完整，保存时会退回默认的 09:00–11:00。
                </span>
              ) : null}

              {/* 一键预设：评审说的"收纳成快捷按键"。运行日与时段同一行，预设留在这里。 */}
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
                <span className="jh-muted">
                  当前：{form.weekdays.length === 0 ? '每天' : formatWeekdays(form.weekdays)}
                </span>
              </div>

              <label className="jh-check">
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(event) => patch({ scheduleEnabled: event.target.checked })}
                />
                启用定时
              </label>

              {/* 执行频次说白：本方案没有"每隔 N 小时"这种表达式，频次就是
                  "哪几天 + 哪段时间"，所以直接把它写成一句话。 */}
              {startClock === null || endClock === null ? null : (
                <div className="jh-info">
                  <span className="jh-info-icon" aria-hidden="true">
                    ⓘ
                  </span>
                  <span>
                    执行频次：
                    {form.weekdays.length === 0 ? '每天' : formatWeekdays(form.weekdays)}{' '}
                    {formatWindow(startClock.hour, startClock.minute, endClock.hour, endClock.minute)}
                    {form.scheduleEnabled
                      ? '（时段内随机取点）'
                      : '（定时未启用 —— 只在你点「立即采集」时跑）'}
                  </span>
                </div>
              )}
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
                  title="同一个岗位出现在多个招聘平台时合并成一条。只纳入一个平台时它不会生效。"
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
          </>
        ) : null}
      </div>
    </Modal>
  )
}

/**
 * 跨平台去重分组（A2）。
 *
 * 多平台落地后，同一岗位可能被多个平台各抓一条并被合并进同一组。这里把它们列出来，
 * 让"合并了哪些 / 依据是什么 / 能不能拆开"都可查可逆（§4.10.1 铁律 2：去重必须可逆）。
 *
 * **全库复核的按钮不在这里**：它已经搬到页面顶部的固定工具条
 * （「运行全库去重」），结果也由那条统一的 Alert 播报 ——
 * 那个动作与"你现在在哪个分区"无关，藏在卡片里就等于必须先进这个分区才想得起来。
 * 这个卡片只负责一件事：列分组、拆组。
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
        {/* 原来这里是一段常驻的灰字说明，占一整行却只在第一次看时有用。
            收进问号：需要时悬停/聚焦可读，不需要时不占版面。 */}
        <FieldHint text="同一岗位被多个平台各抓一条时合并到同一组，依据是跨平台 + 同公司同城 + 薪资不冲突 + 标题相似。合并是可逆的：误合并随时可以在下面拆开。补做一次全库复核用顶部的「运行全库去重」。" />
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
