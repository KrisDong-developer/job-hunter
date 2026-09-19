// StatusAlert：用一条 Alert 说清"现在需要你处理什么"，并自带该做的动作。
// 优先展示「定时已手动暂停」，其次是「数据偏旧」；同一时刻只说一件最需要处理的事。
// 两者都不满足时返回 null。纯展示组件，动作由外部通过 props 传入。
import { InlineMd } from '../../ui/inline-md.js'
import type { SchedulerStatusDto } from '../../../shared/dto.js'

/**
 * 一条 Alert 说清"现在需要你处理什么"，并**自带该做的动作**。
 *
 * 合并的原来是三段（归属叙述里的"定时已暂停" + 一个 jh-warn 段 + 按钮文案），
 * 内容高度重叠 —— 用户看到同一句话说三遍。
 * 优先级：**已暂停 > 数据偏旧**。同一时刻只说一件最需要处理的事。
 */
export function StatusAlert(props: {
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
