import { useDialogA11y } from '../../hooks/use-dialog-a11y.js'
import { JobDetailBody } from './body.js'
import { useRef } from 'react'

/**
 * U2 岗位详情 —— **抽屉式**（流水线 / 消息 / 面试在用）。
 *
 * 那三个屏的主任务不是"比较岗位"，而是"处理一件事"，所以临时看一眼用弹层更合适：
 * 关掉就回到原来的上下文。
 */
export function JobDetailDrawer(props: {
  id: number
  revision: number
  onClose: () => void
  onChanged: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  /* 抽屉是模态层（`role="dialog"`），所以它要具备对话框该有的行为：
     aria-modal、Esc 关闭、焦点移入与陷阱、关闭后归还焦点。
     之前只有 role —— 审核实测：Esc 无效、Tab 能跑到被遮住的列表上。 */
  useDialogA11y(dialogRef, props.onClose, [props.id])

  return (
    <div className="jh-drawer-layer">
      <button type="button" className="jh-drawer-backdrop" aria-label="关闭详情" onClick={props.onClose} />
      <aside
        className="jh-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="岗位详情"
        tabIndex={-1}
        ref={dialogRef}
        data-job-hunter="job-drawer"
      >
        <header className="jh-drawer-head">
          <span className="jh-drawer-title">岗位详情</span>
          <button type="button" className="jh-icon-btn" aria-label="关闭" onClick={props.onClose}>×</button>
        </header>

        <div className="jh-drawer-body">
          <JobDetailBody id={props.id} revision={props.revision} onChanged={props.onChanged} />
        </div>
      </aside>
    </div>
  )
}


