/**
 * 「采集」页（U9）的入口文件。
 *
 * 本文件只留骨架：`CollectScreen` 负责编排（拉数据、串回调、切换分区）与顶栏，
 * 页面主体是三个分区（运行仪表盘 / 方案管理 / 诊断与明细），
 * 各子组件在同目录 `collect/` 下按职责分文件。
 *
 * ⚠️ 表单派生逻辑在 `collect/plan-form.ts`（被测试直接引用，
 * 改动要连带看 `test/shared/collect-form.test.ts`）。
 */
import { useMemo, useState } from 'react'
import { CRAWL_STATE_LABEL } from '../../shared/enums.js'
import { FAILURE_KIND_LABEL, type FailureText } from '../../shared/error-text.js'
import type { PlanDto, RecentRunDto, SchedulerStatusDto } from '../../shared/dto.js'
import {
  formatClock,
  formatRelative,
  formatWeekdays,
  formatWindow,
} from '../../shared/time-format.js'
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
  runDedupSweep,
  runPlan,
  setSchedulePaused,
  startLogin,
  takeoverLease,
  updatePlan,
  validatePlan,
  validatePlanDraft,
  type CriteriaDimensionDto,
  type PlanDuplicateDto,
  type PlatformOverviewDto,
} from '../api.js'
import { useAsync } from '../use-async.js'
import { FieldHint } from '../field-hint.js'
import { InlineMd } from '../inline-md.js'
import { Modal } from '../modal.js'
import { Term } from '../terms.js'
import { FreshnessBadge } from './freshness.js'
import { scheduleStoryOf } from './collect/schedule-story.js'
import { emptyForm, formOf, writeOf, type PlanForm } from './collect/plan-form.js'
import { StatusAlert } from './collect/status-alert.js'
import { CriteriaLine } from './collect/criteria-line.js'
import { LeasePanel } from './collect/lease-panel.js'
import { PlatformMatrix } from './collect/platform-matrix.js'
import { CapabilityMatrix } from './collect/capability-matrix.js'
import { RunHistoryTable, RunLogCard } from './collect/run-history.js'
import { PlanEditorModal } from './collect/plan-editor-modal.js'
import { DedupGroupsCard } from './collect/dedup-groups-card.js'

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
  /**
   * 正在编辑的方案 = **打开那一刻的快照**（id + 表单初值）。
   *
   * 为什么不只存 id、渲染时现算 `formOf(planList.find(...))`：方案列表在
   * `useAsync` 重新取数时会先回到 `loading`（SSE 事件、保存后 `reload()`、
   * 取数失败），那一刻 `planList` 是**空数组** —— 现算就会 `formOf(undefined)`
   * 直接抛错把整屏打崩。快照还顺带保证了后台刷新不会动用户正在填的内容。
   */
  const [editing, setEditing] = useState<{ id: number | 'new'; form: PlanForm } | null>(null)
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

  /**
   * **真正会被自动调度**的方案：`enabled` 与「启用定时」都得是开着的。
   *
   * 只看 `plan.enabled` 会把一个"不定时"的方案算进来 —— 它永远不会到点跑，
   * 却会在卡片上被标成「生效中」、还会被当成"恢复定时后会跑的那个方案"。
   */
  const scheduledPlan = planList.find((plan) => plan.enabled && plan.schedule.enabled)
  /** 「当前生效方案」以本屏的选择为准，默认落在真正会被调度的那个方案上。 */
  const focusedPlan =
    planList.find((plan) => plan.id === focusPlanId) ?? scheduledPlan ?? planList[0]
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
              planName={scheduledPlan?.name ?? null}
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
                      {focusedPlan.id === scheduledPlan?.id ? (
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
                          setEditing({ id: focusedPlan.id, form: formOf(focusedPlan) })
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
              setEditing({ id: 'new', form: emptyForm() })
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
                        setEditing({ id: plan.id, form: formOf(plan) })
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
          key={String(editing.id)}
          planId={editing.id === 'new' ? null : editing.id}
          initial={editing.form}
          available={platformList}
          duplicates={duplicates}
          notices={notices}
          running={feedback.running}
          onCancel={() => setEditing(null)}
          onSubmit={async (form) => {
            setFeedback({ running: true, tone: 'ok', message: '正在保存…' })
            try {
              const input = writeOf(form)
              const result =
                editing.id === 'new' ? await createPlan(input) : await updatePlan(editing.id, input)
              setDuplicates(result.duplicates)
              setNotices(result.notices)
              const verb = editing.id === 'new' ? '已创建' : '已保存'
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
              editing.id === 'new' ? await validatePlanDraft(input) : await validatePlan(editing.id, input)
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
            <li>
              想保留配置、只是暂时不想自动跑：改用「编辑 · 定时」里的「启用定时」—— 关掉它之后
              仍然可以点「立即采集」手动跑。
            </li>
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
