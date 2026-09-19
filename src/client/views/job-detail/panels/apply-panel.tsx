import { ResumeFilePicker } from '../../resume-file-picker.js'
import { FieldHint } from '../../../ui/field-hint.js'
import { Modal } from '../../../ui/modal.js'

/**
 * 投递简历（L4）：单条真投递的入口。
 *
 * 之前 `deliverApplication` 在客户端**零调用点** —— 工具里能投、界面上不能投，
 * §22.5 的"GUI 与工具对等"就差这一格。默认关闭（L4 开关），
 * 点了之后由宿主决定能不能投（平台没接投递动作会如实说）。
 *
 * 按钮放在吸顶操作条里（body 的 `.jh-detail-actions`）；打开弹窗的两步动作由父组件持有。
 */
export function ApplyEntry(props: {
  delivering: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="jh-btn jh-btn-inline"
      disabled={props.delivering}
      onClick={props.onOpen}
    >
      {props.delivering ? '投递中…' : '投递简历'}
    </button>
  )
}

/**
 * 投递简历（L4）：两步走 —— 先选"这次投递登记哪份简历"，再看宿主给的确认文案。
 * ⚠️ 第二步的文案**原样来自宿主**（含平台 / 岗位 / 简历版本 / 平台会顺带做什么 /
 * 这份文件到底传不传得上去），界面不自己编 —— 编出来的必然会与真正的判定漂移。
 *
 * `open` 为 `false` 时不挂载（等价于原来的 `deliverOpen === false ? null : …`）。
 */
export function ApplyModal(props: {
  open: boolean
  /** 宿主给的确认文案；`null` = 还在第一步（选简历）。 */
  ask: string | null
  /** 这一步投递**登记**用哪份简历（附件 id）；`null` = 平台内简历。 */
  resumeId: number | null
  delivering: boolean
  /** 关掉弹窗（× / 点遮罩）。 */
  onClose: () => void
  /** 第一步的「取消」。 */
  onCancel: () => void
  /** 第二步的「返回改简历」。 */
  onBack: () => void
  onResumeChange: (id: number | null) => void
  /** 第一步的「下一步」：不带 confirm 发一次，拿回宿主那段确认文案。 */
  onNext: () => void
  /** 第二步的「确认投递」。 */
  onConfirm: () => void
}) {
  if (!props.open) return null
  return (
    <Modal
      title={props.ask === null ? '投递简历' : '确认投递简历'}
      label={props.ask === null ? '投递简历' : '确认投递简历'}
      onClose={props.onClose}
      footer={
        props.ask === null ? (
          <>
            <span className="jh-muted">下一步会给你看确认文案（含平台、岗位与用了哪版简历）。</span>
            <span className="jh-spacer" />
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              onClick={props.onCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={props.delivering}
              onClick={props.onNext}
            >
              {props.delivering ? '检查中…' : '下一步'}
            </button>
          </>
        ) : (
          <>
            <span className="jh-muted">投递不可逆，平台一旦收到就撤不回来。</span>
            <span className="jh-spacer" />
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={props.delivering}
              onClick={props.onBack}
            >
              返回改简历
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={props.delivering}
              onClick={props.onConfirm}
            >
              {props.delivering ? '投递中…' : '确认投递'}
            </button>
          </>
        )
      }
    >
      {props.ask === null ? (
        <>
          <div className="jh-ctl">
            <span className="jh-field-label">
              用哪份简历
              <FieldHint text="**平台上收到的**是平台自己那份简历（平台没有把本地文件发给 HR 的入口，我们改不了它）。这里选的是**这次投递在你的记录里归到哪一版** ——「哪版回复率高」这类对比要靠它，所以选得准一点更有用。不选就不登记版本。" />
            </span>
            <ResumeFilePicker
              value={props.resumeId}
              disabled={props.delivering}
              onChange={props.onResumeChange}
            />
          </div>
          <p className="jh-muted">
            下一步的确认文案里会写清"这份文件到底会不会传上去"，以及平台自己还会做什么
            （例如智联投递会顺带替你发一句招呼语）。
          </p>
        </>
      ) : (
        <pre className="jh-approval">{props.ask}</pre>
      )}
    </Modal>
  )
}
