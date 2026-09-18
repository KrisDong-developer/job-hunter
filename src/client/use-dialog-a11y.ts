import { useEffect, useRef, type RefObject } from 'react'

/**
 * 对话框级的无障碍行为：Esc 关闭 + 焦点移入 + 焦点陷阱 + 关闭后焦点归还。
 *
 * ## 为什么抽成 hook
 *
 * 这套逻辑原本只在 `modal.tsx` 里（弹窗），而 `JobDetailDrawer`（抽屉）也是
 * `role="dialog"` 的模态层 —— 它当时有 `role` 但**没有** `aria-modal`、没有 Esc、
 * 没有焦点陷阱（审核实测）。把 50 行很讲究的焦点代码复制一份是最差的做法：
 * 将来只改一处，另一处就悄悄退化。所以抽出来，两个对话框共用同一份实现。
 *
 * ## 三条必须做的细节（原注释保留）
 *
 *   1. **Esc 关闭** —— 键盘用户的第一反应；
 *   2. **打开时把焦点移进对话框**，关闭时还回去 —— 不做的话键盘焦点会留在
 *      被遮住的页面上，Tab 会跑到看不见的地方；
 *   3. **点遮罩关闭** —— 由调用方把遮罩做成 `<button>`（天然可聚焦、可被读屏识别）。
 *
 * ## 焦点陷阱：做，而且要正确地做
 *
 *   * 每次 Tab 时**重新枚举**当前可聚焦元素（元素会动态增删，缓存列表必然过期）；
 *   * `Tab` 在最后一个上回到第一个，`Shift+Tab` 在第一个上回到最后一个；
 *   * 焦点若已经跑到对话框外（例如点了遮罩），下一次 Tab 拉回第一个；
 *   * 只处理 Tab / Shift+Tab，不吞其它键。
 */
export function useDialogA11y(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  /** 换一个 id/目标时重新装一遍（例如抽屉换了岗位）。 */
  deps: readonly unknown[] = [],
): void {
  const restoreRef = useRef<Element | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

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
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const root = dialogRef.current
      if (root === null) return
      const list = focusables()
      if (list.length === 0) {
        // 对话框里没有可聚焦元素（例如纯文本确认框）：把焦点留在对话框本身
        event.preventDefault()
        root.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (first === undefined || last === undefined) return

      if (!root.contains(active)) {
        // 焦点已经跑到对话框外：拉回来
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
