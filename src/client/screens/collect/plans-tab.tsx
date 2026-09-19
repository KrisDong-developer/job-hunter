// 分区二「方案管理」：方案卡片列表 + 编辑/删除/确认恢复 + 新建。
// 纯展示组件：数据与动作全部由 CollectScreen 通过 props 传入，本文件不持有任何状态。
import { formatClock, formatWeekdays, formatWindow } from '../../../shared/text/time-format.js'
import type { PlanDto, SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'
import type { PlatformOverviewDto } from '../../../shared/contract/dto/platform.js'
import type { CriteriaDimensionDto } from '../../../shared/contract/dto/plan.js'
import { Term } from '../../ui/terms.js'
import { FreshnessBadge } from '../../views/freshness.js'
import { CriteriaLine } from './criteria-line.js'
import { DedupGroupsCard } from './dedup-groups-card.js'

/**
 * 「方案管理」分区（写）：抓什么、什么时候抓、去重规则。
 *
 * 所有 `useState` / `useAsync` 都留在 `CollectScreen`（见同目录 `index.tsx`）——
 * 其中 `pendingDelete`（删除确认）与表单弹窗跨分区共用，所以留在父级。
 */
export function PlansTab(props: {
  revision: number
  /** 全库复核的版本号（与 `revision` 相加后交给去重卡片）。 */
  dedupRevision: number
  status: SchedulerStatusDto | null
  plansLoading: boolean
  planList: PlanDto[]
  platformList: PlatformOverviewDto[]
  dimensionList: CriteriaDimensionDto[]
  running: boolean
  runBlocked: boolean
  runBlockTitle: string
  onTrigger: (plan: PlanDto) => void
  onEdit: (plan: PlanDto) => void
  onNew: () => void
  onResumeRisk: (plan: PlanDto) => void
  onAskDelete: (plan: PlanDto) => void
}) {
  return (
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
            disabled={props.running}
            title="新建一个采集方案：决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。"
            onClick={props.onNew}
          >
            新增方案
          </button>
        </div>

        {props.plansLoading ? (
          <ul className="jh-plan-list" aria-busy="true" aria-live="polite">
            <li className="jh-plan-card jh-skeleton-row">正在读取方案…</li>
          </ul>
        ) : props.planList.length === 0 ? (
          <div className="jh-empty">
            <p className="jh-muted">还没有方案。</p>
            <p className="jh-note">
              方案决定抓什么（平台 + 筛选条件 + 抓取深度）与什么时候抓。点右上角「新增方案」建第一个。
            </p>
          </div>
        ) : (
          <ul className="jh-plan-list">
            {props.planList.map((plan) => {
              const planStatus = props.status?.planStatus.find((item) => item.planId === plan.id) ?? null
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
                props.platformList.find((item) => item.id === id)?.displayName ?? id
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
                    <CriteriaLine plan={plan} dimensions={props.dimensionList} />
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
                      disabled={props.runBlocked}
                      title={props.runBlockTitle}
                      onClick={() => props.onTrigger(plan)}
                    >
                      立即采集
                    </button>
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      disabled={props.running}
                      title="改这个方案抓什么、抓多深、什么时候抓。"
                      onClick={() => props.onEdit(plan)}
                    >
                      编辑
                    </button>
                    {planStatus?.riskPaused === true && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-warn"
                        disabled={props.running}
                        title="确认环境已恢复正常，允许这个方案重新被自动采集。系统不会自动恢复。"
                        onClick={() => props.onResumeRisk(plan)}
                      >
                        确认恢复
                      </button>
                    )}
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost"
                      disabled={props.running}
                      title="删除这个方案（会先让你确认）。已经抓到的岗位不受影响。"
                      onClick={() => props.onAskDelete(plan)}
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
      <DedupGroupsCard revision={props.revision + props.dedupRevision} />
    </>
  )
}
