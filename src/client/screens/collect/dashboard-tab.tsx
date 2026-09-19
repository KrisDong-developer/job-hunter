// 分区一「运行仪表盘」：顶部 Alert（需要你处理的事）+ 最近运行日志 + 平台状态总览（主从表格）+ 适配器维护。
// 纯展示组件：数据与动作全部由 CollectScreen 通过 props 传入，本文件不持有任何状态。
import { formatClock, formatRelative, formatWeekdays, formatWindow } from '../../../shared/text/time-format.js'
import type { RecentRunDto } from '../../../shared/contract/dto/crawl.js'
import type { PlanDto, SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'
import type { PlatformOverviewDto } from '../../../shared/contract/dto/platform.js'
import type { FailureText } from '../../../shared/text/error-text.js'
import type { CriteriaDimensionDto } from '../../../shared/contract/dto/plan.js'
import { LoadingLine } from '../../ui/async-view.js'
import { FieldHint } from '../../ui/field-hint.js'
import { Term } from '../../ui/terms.js'
import type { ScheduleStory } from './schedule-story.js'
import { StatusAlert } from './status-alert.js'
import { CriteriaLine } from './criteria-line.js'
import { LeasePanel } from './lease-panel.js'
import { PlatformMatrix } from './platform-matrix.js'
import { RunHistoryTable } from './run-history.js'
import { AdapterConfigCard, RepairQueueCard } from './adapter-maintenance.js'

/**
 * 「运行仪表盘」分区（读）：今天能不能跑、上次跑了什么、平台现在什么状态。
 *
 * 所有 `useState` / `useAsync` 都留在 `CollectScreen`（见同目录 `index.tsx`），
 * 这里只负责渲染 —— 分区切换不会让任何取数状态重新开始。
 */
export function DashboardTab(props: {
  revision: number
  now: Date
  story: ScheduleStory | null
  status: SchedulerStatusDto | null
  runsLoading: boolean
  plansLoading: boolean
  planList: PlanDto[]
  focusPlanId: number | null
  dimensionList: CriteriaDimensionDto[]
  platformsLoading: boolean
  platformList: PlatformOverviewDto[]
  /** 平台总览取数失败时的原始信息（成功 / 加载中时为 null）。 */
  platformsError: string | null
  reasonText: Record<string, string>
  reasonFor: (skipReason: string | null) => string | null
  platformNameOf: (platformId: string) => string | null
  expandedPlatform: string | null
  running: boolean
  runBlocked: boolean
  runBlockTitle: string
  onFocusPlan: (planId: number) => void
  onTogglePlatform: (platformId: string) => void
  onResume: () => void
  onTakeover: () => void
  onTrigger: (plan: PlanDto) => void
  onEdit: (plan: PlanDto) => void
  onGoPlans: () => void
  onLogin: (platformId: string) => void
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
  onGoSettings: () => void
  onReload: () => void
}) {
  /** 适配器维护那两块只需要 id + 显示名（下拉与筛选），不传整个概览对象。 */
  const platformOptions = props.platformList.map((item) => ({ id: item.id, displayName: item.displayName }))

  /**
   * **真正会被自动调度**的方案：`enabled` 与「启用定时」都得是开着的。
   *
   * 只看 `plan.enabled` 会把一个"不定时"的方案算进来 —— 它永远不会到点跑，
   * 却会在卡片上被标成「生效中」、还会被当成"恢复定时后会跑的那个方案"。
   */
  const scheduledPlan = props.planList.find((plan) => plan.enabled && plan.schedule.enabled)
  /** 「当前生效方案」以本屏的选择为准，默认落在真正会被调度的那个方案上。 */
  const focusedPlan =
    props.planList.find((plan) => plan.id === props.focusPlanId) ?? scheduledPlan ?? props.planList[0]

  return (
    <>
      {/* ── 一条 Alert 说完"当前需要你处理的事"（原来是三段重复提示）── */}
      {props.status !== null ? (
        <StatusAlert
          status={props.status}
          planName={scheduledPlan?.name ?? null}
          running={props.running}
          onResume={props.onResume}
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

            {props.status === null || props.story === null ? (
              <LoadingLine busy live="polite">
                正在读取调度状态…
              </LoadingLine>
            ) : (
              <>
                <p className={`jh-story jh-story-${props.story.tone}`}>
                  <b>{props.story.owner}</b>
                  {props.story.nextRun === null
                    ? ' —— 当前没有启用定时的方案。'
                    : props.status.paused
                      ? `：恢复后将按 ${props.story.nextRun} 运行`
                      : `：${props.story.nextRun}`}
                </p>
                {props.story.detail === null ? null : <p className="jh-note">{props.story.detail}</p>}

                <LeasePanel
                  status={props.status}
                  now={props.now}
                  running={props.running}
                  onTakeover={props.onTakeover}
                />

                <ul className="jh-kv">
                  <li>
                    <span>
                      <Term term="新鲜度">上次成功</Term>
                    </span>
                    <span>
                      {props.status.lastRunAt === null
                        ? '从来没有成功采集过'
                        : `${formatClock(new Date(props.status.lastRunAt))} · ${formatRelative(new Date(props.status.lastRunAt), props.now)}`}
                    </span>
                  </li>
                  <li>
                    <span>
                      <Term term="时段">时区</Term>
                    </span>
                    <span title="排程按这台电脑的本地时间算。改了系统时区，下一次就算到新时区上。">
                      {props.status.timezone}
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
                onClick={props.onGoPlans}
              >
                管理方案
              </button>
            </div>

            {props.plansLoading ? (
              <LoadingLine busy live="polite">
                正在读取方案…
              </LoadingLine>
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
                {props.planList.length > 1 ? (
                  <div className="jh-chips jh-plan-switch">
                    {props.planList.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className={`jh-chip${plan.id === focusedPlan.id ? ' jh-chip-on' : ''}`}
                        aria-pressed={plan.id === focusedPlan.id}
                        onClick={() => props.onFocusPlan(plan.id)}
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
                  <CriteriaLine plan={focusedPlan} dimensions={props.dimensionList} />
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
                    disabled={props.runBlocked}
                    title={props.runBlockTitle}
                    onClick={() => props.onTrigger(focusedPlan)}
                  >
                    立即采集
                  </button>
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline jh-btn-tiny"
                    disabled={props.running}
                    title="改这个方案抓什么、抓多深、什么时候抓。"
                    onClick={() => props.onEdit(focusedPlan)}
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
      {props.status === null && !props.runsLoading ? null : (
        <section className="jh-card">
          <div className="jh-form-head">
            <h2 className="jh-card-title">最近运行</h2>
            <FieldHint text="按开始时刻倒序（新的在上面）。命中=这一轮抓到多少条（悬停看翻了几页）；新增/更新=真正写进岗位库的量；隔离=被字段断言拦下、进了待修队列的条数。失败的那一次不算「上次成功」—— 失败不会让数据变新。点错误胶囊看完整原因与排查步骤。" />
          </div>
          <RunHistoryTable
            runs={props.status === null ? [] : props.status.recentRuns}
            loading={props.runsLoading}
            reasonFor={props.reasonFor}
            platformName={props.platformNameOf}
            onOpenError={props.onOpenError}
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
        {props.platformsError !== null && <p className="jh-error">{props.platformsError}</p>}
        {props.platformsLoading ? (
          <LoadingLine busy live="polite">
            正在读取平台状态…
          </LoadingLine>
        ) : props.platformList.length === 0 ? (
          <div className="jh-empty">
            <p className="jh-muted">还没有注册平台。</p>
            <p className="jh-note">平台来自适配器注册表；当前没有任何适配器被注册，所以无法采集。</p>
          </div>
        ) : (
          <PlatformMatrix
            items={props.platformList}
            reasonText={props.reasonText}
            expandedId={props.expandedPlatform}
            onToggle={props.onTogglePlatform}
            running={props.running}
            onLogin={props.onLogin}
            onGoSettings={props.onGoSettings}
          />
        )}
      </section>

      {/* ── 适配器维护（B13 / J2）：待修复队列 + 配置覆盖 ──────────────
          「待修复」原来只以一个数字出现在「今日」上，点不进去；而修选择器所需的
          "写 DB 覆盖"这条路径**根本不存在**（ADAPTERS.md §1 的注脚）。
          两块放在平台总览之后：它们正是"某个平台坏了"的下一步动作。 */}
      <RepairQueueCard revision={props.revision} platforms={platformOptions} />
      <AdapterConfigCard revision={props.revision} platforms={platformOptions} onChanged={props.onReload} />
    </>
  )
}
