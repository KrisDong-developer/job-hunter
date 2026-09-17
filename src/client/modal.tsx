import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 弹窗（覆盖层 + 对话框）。
 *
 * ## 为什么要有它，而不是继续把表单嵌在页面里
 *
 * 实测的界面问题：「新增方案」表单原本直接嵌在采集页**下方**，
 * 于是页面越滚越长、主次不分 —— 列表和表单互相稀释，用户既看不清列表，
 * 也无法专注填表。弹窗把"填表"这件事**临时**抬到最前面，填完就还回去。
 *
 * ## 三条必须自己做的无障碍/交互细节
 *
 *   1. **Esc 关闭** —— 键盘用户的第一反应；
 *   2. **点遮罩关闭** —— 鼠标用户的第一反应（用 `<button>` 而不是 `<div onClick>`，
 *      这样它天然可聚焦、可被读屏识别）；
 *   3. **打开时把焦点移进对话框**，关闭时还回去 —— 不做的话键盘焦点会留在
 *      被遮住的页面上，Tab 会跑到看不见的地方。
 *
 * 刻意**不做**的事：**不做焦点陷阱**（focus trap）。
 * 半吊子的陷阱（只在 Tab 到头时把焦点拉回来，却没处理 Shift+Tab、动态增删的可聚焦元素、
 * 以及嵌入的 iframe）比不做更糟 —— 它会让键盘用户在某些路径上彻底卡住。
 * 而这里唯一的场景是"填一个表单然后关掉"，把它做对（含遮罩本身可聚焦）已经够用。
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
  const restoreRef = useRef<Element | null>(null)

  useEffect(() => {
    // 记住打开前的焦点，关闭时还回去
    restoreRef.current = document.activeElement
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        props.onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // 焦点还回去：不还的话关闭后 Tab 会从文档开头重新走一遍
      const previous = restoreRef.current
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [props])

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
