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
import { CRAWL_STATE_LABEL } from '../../../shared/contract/enums/crawl.js'
import { FAILURE_KIND_LABEL, type FailureText } from '../../../shared/text/error-text.js'
import type { RecentRunDto } from '../../../shared/contract/dto/crawl.js'
import type { PlanDto, SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'
import type { PlatformOverviewDto } from '../../../shared/contract/dto/platform.js'
import { ApiError } from '../../net/client.js'
import { createPlan, deletePlan, fetchCriteriaDimensions, fetchPlans, updatePlan, validatePlan, validatePlanDraft } from '../../net/collect/plans.js'
import { fetchPlatforms, startLogin } from '../../net/collect/platforms.js'
import { fetchSkipReasons, runPlan } from '../../net/collect/runs.js'
import { fetchSchedulerStatus, recheckLease, resumePlanRisk, setSchedulePaused, takeoverLease } from '../../net/collect/schedule.js'
import { runDedupSweep } from '../../net/dedup.js'
import type { CriteriaDimensionDto, PlanDuplicateDto } from '../../../shared/contract/dto/plan.js'
import { useAsync } from '../../hooks/use-async.js'
import { IDLE, type Feedback } from '../../ui/feedback.js'
import { InlineMd } from '../../ui/inline-md.js'
import { Modal } from '../../ui/modal.js'
import { scheduleStoryOf } from './schedule-story.js'
import { emptyForm, formOf, writeOf, type PlanForm } from './plan-form.js'
import { PlanEditorModal } from './plan-editor-modal.js'
import { DashboardTab } from './dashboard-tab.js'
import { PlansTab } from './plans-tab.js'
import { DiagnosticsTab } from './diagnostics-tab.js'

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
  /** 平台取数失败时的原始信息（成功 / 加载中时为 null）——「运行仪表盘」与「诊断与明细」都要说它。 */
  const platformsError = platforms.state.status === 'error' ? platforms.state.message : null

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

  /* ── 三个分区里的动作 ────────────────────────────────────────────────
     它们原来内联在下面各分区的 JSX 里；抽出分区组件后，凡是要写父级 state
     （feedback / editing / duplicates / pendingDelete）的动作都留在这里，
     分区组件只拿到回调 —— 与同目录其它子组件（如 LeasePanel）同一套约定。 */

  /** 「新增方案」用的表单初值（原来是内联在分区二的按钮里）。 */
  const startCreate = (): void => {
    setDuplicates([])
    setEditing({ id: 'new', form: emptyForm() })
  }

  /** 「编辑」（仪表盘的当前生效方案 / 方案卡片）——打开那一刻的快照。 */
  const startEdit = (plan: PlanDto): void => {
    setDuplicates([])
    setEditing({ id: plan.id, form: formOf(plan) })
  }

  /** Alert 上的「恢复定时」。 */
  const resumeSchedule = (): void =>
    void act('正在恢复定时…', async () => {
      await setSchedulePaused(false)
      return '已恢复定时抓取。'
    })

  /** 租约面板上的「接管调度」。 */
  const takeover = (): void =>
    void act('正在接管调度…', async () => {
      await takeoverLease()
      return '已接管调度，本窗口现在负责采集。'
    })

  /** 方案卡上的「确认恢复」（风控暂停后的人工确认）。 */
  const resumeRisk = (plan: PlanDto): void =>
    void act('正在恢复…', async () => {
      await resumePlanRisk(plan.id)
      return `方案「${plan.name}」已恢复 —— 这一下是你确认的，系统不会自动恢复。`
    })

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
            {/* 文字单独包一层：窄屏只留圆点（文字让位给右边的操作按钮，
                与顶栏 .jh-live 同一套降级）。圆点带了 aria-hidden，
                所以窄屏下这段状态对读屏仍然是完整的 —— 靠的是这一层文字，
                而不是那个点。 */}
            <span className="jh-collect-switch-text">
              {status.paused ? '定时已暂停' : '定时运行中'}
            </span>
          </span>
        )}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={status === null || feedback.running}
          /* 刻意**不写** aria-pressed：这个按钮的文案本身就在说动作
             （"暂停调度"/"启动调度"），读到的是"暂停调度，已按下"时，
             "已按下"说的是"定时正在运行"，与文案正好相反 —— 读屏用户只会更糊涂。
             当前状态由左边那个圆点 + 文字（以及那条 Alert）负责说。 */
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
          /* 原来这里是**一整段**（含"否则要干等下一轮抓取，而那一轮可能一条新岗位都没有"）
             塞进 title。桌面端 title 只能悬停看、读不到一半就消失，触屏根本出不来，
             而它说的正是"什么时候该点这个按钮"。现在只留一句，完整规则在
             「方案管理 · 跨平台去重」那张卡片的问号里。 */
          title="按同一套门槛把全库岗位复核一遍。用在刚打开去重开关、或刚改过抓取范围之后。"
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
          /* 失败要**打断**读屏，成功只是告知 —— 所以 role 分两种。
             原来一律用 role="status" + polite：动作失败时读屏还在慢悠悠念上一条，
             用户等不到那句"没成"，而这条卡片正是唯一的失败反馈。
             aria-live 必须跟着一起写：role="alert" 隐含 assertive，
             但显式写着的 polite 会把它盖回去。 */
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
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
        <DashboardTab
          revision={props.revision}
          now={now}
          story={story}
          status={status}
          runsLoading={runsLoading}
          plansLoading={plansLoading}
          planList={planList}
          focusPlanId={focusPlanId}
          dimensionList={dimensionList}
          platformsLoading={platformsLoading}
          platformList={platformList}
          platformsError={platformsError}
          reasonText={reasonText}
          reasonFor={reasonFor}
          platformNameOf={platformNameOf}
          expandedPlatform={expandedPlatform}
          running={feedback.running}
          runBlocked={runBlocked}
          runBlockTitle={runBlockTitle}
          onFocusPlan={setFocusPlanId}
          onTogglePlatform={(id) => setExpandedPlatform((current) => (current === id ? null : id))}
          onResume={resumeSchedule}
          onTakeover={takeover}
          onTrigger={trigger}
          onEdit={startEdit}
          onGoPlans={() => setTab('plans')}
          onLogin={login}
          onOpenError={(run, failure) => setErrorDetail({ run, failure })}
          onGoSettings={props.onGoSettings}
          onReload={reload}
        />
      ) : null}

      {/* ══ 分区二：方案管理（写）═════════════════════════════════════════ */}
      {tab === 'plans' ? (
        <PlansTab
          revision={props.revision}
          dedupRevision={dedupRevision}
          status={status}
          plansLoading={plansLoading}
          planList={planList}
          platformList={platformList}
          dimensionList={dimensionList}
          running={feedback.running}
          runBlocked={runBlocked}
          runBlockTitle={runBlockTitle}
          onTrigger={trigger}
          onEdit={startEdit}
          onNew={startCreate}
          onResumeRisk={resumeRisk}
          onAskDelete={setPendingDelete}
        />
      ) : null}

      {/* ══ 分区三：诊断与明细（排障时才看）═══════════════════════════════ */}
      {tab === 'diagnostics' ? (
        <DiagnosticsTab
          status={status}
          runsLoading={runsLoading}
          platformsLoading={platformsLoading}
          platformList={platformList}
          platformsError={platformsError}
          reasonFor={reasonFor}
          platformNameOf={platformNameOf}
          onOpenError={(run, failure) => setErrorDetail({ run, failure })}
        />
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
