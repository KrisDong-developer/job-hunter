import type { PlanScheduleStatusDto, SchedulerStatusDto, WeeklyTriggerDto } from '../../../shared/dto.js'
import { formatClock, formatJitter, formatRelative } from '../../../shared/time-format.js'
import type { Feedback } from '../../ui/feedback.js'
import { InlineMd } from '../../ui/inline-md.js'
import { FreshnessBadge } from '../../views/freshness.js'

/**
 * ── 数据新鲜度 + 下一次动作（D6 的核心）──────────────────────
 *
 * 「立即采集」在本屏是唯一会开浏览器的动作（见 `startCrawl` 的注释），
 * 所以按钮的可用性由 `sched.readOnly` 与进行中的 `feedback.running` 一起决定。
 */
export function NextRunCard(props: {
  sched: SchedulerStatusDto | null
  worst: PlanScheduleStatusDto | null
  nextTrigger: WeeklyTriggerDto | null
  now: Date
  feedback: Feedback
  onStartCrawl: () => Promise<void>
  onGoCollect: () => void
}) {
  const { sched, worst, nextTrigger, now, feedback } = props
  return (
    <section className="jh-card">
      <div className="jh-today-head">
        {worst === null ? (
          <span className="jh-muted">
            {sched !== null && sched.planStatus.length > 0
              ? '没有启用定时的方案 —— 数据不会自动更新。'
              : '还没有采集方案。'}
          </span>
        ) : (
          <FreshnessBadge level={worst.freshness.level} hours={worst.freshness.hoursSinceSuccess} />
        )}
        <span className="jh-spacer" />
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={feedback.running || (sched?.readOnly ?? false)}
          onClick={() => void props.onStartCrawl()}
        >
          {feedback.running ? '执行中…' : '立即采集'}
        </button>
        <button type="button" className="jh-btn jh-btn-inline" onClick={props.onGoCollect}>
          去配置
        </button>
      </div>

      <p className="jh-muted">
        {nextTrigger === null
          ? '没有启用定时的方案 —— 只会在你点「立即采集」时跑。'
          : `下次自动采集：${formatClock(new Date(nextTrigger.nextRunAt))}（${formatRelative(new Date(nextTrigger.nextRunAt), now)}）` +
            `${formatJitter(nextTrigger.jitterMs) === null ? '' : ` · ${String(formatJitter(nextTrigger.jitterMs))}`}` +
            ` · 方案「${nextTrigger.planName}」`}
        {sched?.paused === true ? <InlineMd text=" · **定时已暂停**（手动仍然可用）" /> : null}
      </p>

      {/* SR-2：在场触发只提示，不自动跑 */}
      {sched?.refreshSuggested === true && sched.refreshHint !== null && (
        <p className="jh-warn">{sched.refreshHint}</p>
      )}

      {sched?.readOnly === true && (
        <p className="jh-error">本实例只读：{sched.readOnlyReason ?? '另一个实例正在运行'}</p>
      )}

      {feedback.message === null ? null : (
        <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>{feedback.message}</p>
      )}
    </section>
  )
}
