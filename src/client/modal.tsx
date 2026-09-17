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
 * ## 焦点陷阱（focus trap）：做，而且要正确地做
 *
 * 早先这里刻意**不做**陷阱，理由是"半吊子的陷阱比不做更糟"。那个理由本身成立，
 * 但结论错了：`commercial-ui-ux` 的质量门槛（`docs/06-quality-gates.md` §4）明确把
 * `Modal/Dialog | focus trap` 列为必查项，而且"Tab 能跑到被遮住的页面上"是真实缺陷
 * —— 键盘用户会在一堆看不见的控件里迷路。
 *
 * 所以这里做一个**正确**的陷阱：
 *   * 每次 Tab 时**重新枚举**当前可聚焦元素（元素会动态增删，缓存列表必然过期）；
 *   * `Tab` 在最后一个上回到第一个，`Shift+Tab` 在第一个上回到最后一个；
 *   * 焦点若已经跑到弹窗外（例如点了遮罩），下一次 Tab 拉回第一个；
 *   * 只处理 Tab / Shift+Tab，不吞其它键（Esc 仍然关闭、输入框方向键照常）。
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

    /** 当前真正可聚焦的元素：每次现算，不缓存（元素会随表单状态增删）。 */
    const focusables = (): HTMLElement[] => {
      const root = dialogRef.current
      if (root === null) return []
      return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')].filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.tabIndex !== -1 &&
          // offsetParent 为 null 表示被隐藏（CSS 折叠），不该进焦点序列
          (el.offsetParent !== null || el === document.activeElement),
      )
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        props.onClose()
        return
      }
      if (event.key !== 'Tab') return

      const root = dialogRef.current
      if (root === null) return
      const list = focusables()
      if (list.length === 0) {
        // 弹窗里没有可聚焦元素（例如纯文本确认框）：把焦点留在对话框本身
        event.preventDefault()
        root.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (first === undefined || last === undefined) return

      if (!root.contains(active)) {
        // 焦点已经跑到弹窗外：拉回来
        event.preventDefault()
        first.focus()
        return
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault()
        last.focus()
      }
    }

    // capture 阶段：抢在浏览器默认的 Tab 行为之前
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
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
