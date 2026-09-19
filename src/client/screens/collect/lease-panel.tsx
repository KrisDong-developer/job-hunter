// LeasePanel：租约面板（R20），把"死胡同"提示换成带动作的面板。
// 「接管调度」只在对方心跳已过期时才可用 —— 抢一个还活着的实例会让两个调度器同时抓取。
// 「重新检测」已移到顶部工具条，这里只留与租约强相关的「接管调度」。纯展示组件。
import { InlineMd } from '../../ui/inline-md.js'
import { Term } from '../../ui/terms.js'
import { formatRelative } from '../../../shared/text/time-format.js'
import type { SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'

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
export function LeasePanel(props: {
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
              /* 置灰时那句解释原来是**一整段**（含"先把它关掉，关掉后最多 90 秒会
                 自动接管"）塞在 title 里。而"怎么办"下面那段 .jh-note 已经逐条写全了
                 （而且是**看得见**的文字，不用悬停）—— 这里只需要说清"为什么不行"，
                 再把用户指过去。 */
              takeoverPossible
                ? '对方的心跳已经过期（很可能已被强杀）。点这里把采集权拿过来。'
                : '另一个窗口还活着，不能抢它的采集权 —— 两个窗口同时采集会抢同一份浏览器登录态。怎么办见下面。'
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
