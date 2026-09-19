import { useRef, type ReactNode } from 'react'
import { useDialogA11y } from '../hooks/use-dialog-a11y.js'

/**
 * 弹窗（覆盖层 + 对话框）。
 *
 * ## 为什么要有它，而不是继续把表单嵌在页面里
 *
 * 实测的界面问题：「新增方案」表单原本直接嵌在采集页**下方**，
 * 于是页面越滚越长、主次不分 —— 列表和表单互相稀释，用户既看不清列表，
 * 也无法专注填表。弹窗把"填表"这件事**临时**抬到最前面，填完就还回去。
 *
 * ## 无障碍/交互细节
 *
 * Esc 关闭、点遮罩关闭（遮罩是 `<button>` 而不是 `<div onClick>`）、
 * 打开时焦点移入 / 关闭时归还、以及焦点陷阱 —— 这四件都在
 * `use-dialog-a11y.ts` 里，抽屉（`JobDetailDrawer`）与它共用同一份实现。
 * 这里不再复制一份，避免"只改了一处、另一处悄悄退化"。
 */
export function Modal(props: {
  title: string
  onClose: () => void
  children: ReactNode
  /** 底部操作区（取消/保存）。 */
  footer?: ReactNode
  /** 给 CSS 用的宽度档位。 */
  size?: 'md' | 'lg'
  /** 无障碍标签；默认用 title。 */
  label?: string
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogA11y(dialogRef, props.onClose)

  return (
    <div className="jh-modal-layer">
      <button
        type="button"
        className="jh-modal-backdrop"
        aria-label="关闭"
        onClick={props.onClose}
      />
      <div
        className={`jh-modal jh-modal-${props.size ?? 'md'}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.label ?? props.title}
        tabIndex={-1}
        ref={dialogRef}
        data-job-hunter="modal"
      >
        <header className="jh-modal-head">
          <h2 className="jh-modal-title">{props.title}</h2>
          <span className="jh-spacer" />
          <button type="button" className="jh-icon-btn" aria-label="关闭" onClick={props.onClose}>
            ×
          </button>
        </header>
        <div className="jh-modal-body">{props.children}</div>
        {props.footer === undefined ? null : (
          <footer className="jh-modal-foot">{props.footer}</footer>
        )}
      </div>
    </div>
  )
}
