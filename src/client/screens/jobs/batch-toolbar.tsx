import type { JobState } from '../../../shared/contract/enums/job.js'
import { FieldHint } from '../../ui/field-hint.js'

/**
 * 批量工具条：**只在有勾选时出现**（没勾选时它占的那一行是纯粹的噪音）。
 *
 * ── 第五轮（批次 D）
 *
 * 除了"发出去"（打招呼 / 投递），这里补上了"处置"：收藏 / 忽略 / 归档。
 * 真实的扫页动作是"这 20 条里扔掉 12 条"，此前只能一条条点 ✕；
 * 而宿主侧的批量端点（`POST /jobs/batch/mark`）其实早就有了。
 *
 * 还有两个"带走"的动作：
 *   * 复制为表格（Markdown）—— 前端生成，贴进备忘 / 发人都能直接用；
 *   * 导出 CSV —— `href` 交给父组件拼（走浏览器原生下载，见 `net/jobs.ts`）。
 *
 * ⚠️ 撤销**不在**这里：处置成功后勾选会被清空，而本组件只在有勾选时渲染 ——
 * 撤销挂在那个"结果提示"旁边（见 `index.tsx`），才不会跟着勾选一起消失。
 * 另外它回到的是「已读」而不是原状态：勾选可以跨页，原状态没跟着 id 一起带过来，
 * 声称"已恢复"就是撒谎。
 */
export function BatchToolbar(props: {
  count: number
  /** 批量动作进行中（禁用按钮，避免连点）。 */
  busy: boolean
  /** 导出选中用的下载地址（父组件用 `jobsExportUrl(picked)` 拼好）。 */
  exportHref: string
  onGreet: () => void
  onDeliver: () => void
  onMark: (state: JobState) => void
  onCopy: () => void
  onClear: () => void
}) {
  const disabled = props.busy
  return (
    <div className="jh-picked">
      <span>已选 {props.count} 条</span>
      <span className="jh-spacer" />
      <button type="button" className="jh-btn jh-btn-inline" disabled={disabled} onClick={props.onGreet}>
        批量打招呼（{props.count}）
      </button>
      <button type="button" className="jh-btn jh-btn-inline" disabled={disabled} onClick={props.onDeliver}>
        批量投递（{props.count}）
      </button>
      {/* 处置动作：收藏 / 忽略 / 归档。三个都是**可逆的本地状态**，
          所以不弹确认 —— 紧跟着的那枚撤销就是它的安全网。 */}
      <button
        type="button"
        className="jh-btn jh-btn-inline"
        disabled={disabled}
        title="标为已收藏"
        onClick={() => props.onMark('saved')}
      >
        收藏
      </button>
      <button
        type="button"
        className="jh-btn jh-btn-inline"
        disabled={disabled}
        title="标为已忽略（等同逐条点 ✕）"
        onClick={() => props.onMark('ignored')}
      >
        忽略
      </button>
      <button
        type="button"
        className="jh-btn jh-btn-inline"
        disabled={disabled}
        title="标为已归档（从默认视图里挪走，但记录还在）"
        onClick={() => props.onMark('archived')}
      >
        归档
      </button>
      <button type="button" className="jh-btn jh-btn-inline" disabled={disabled} onClick={props.onCopy}>
        复制为表格
      </button>
      {/* 导出用 `<a download>` 而不是按钮 + fetch：文件交给浏览器原生下载
          （大文件不进 JS 堆、文件名与断点都归它管）—— 与全量导出的做法一致。 */}
      <a className="jh-btn jh-btn-inline" href={props.exportHref} download>
        导出 CSV
      </a>
      <button type="button" className="jh-btn jh-btn-inline" onClick={props.onClear}>
        清除选择
      </button>
      <FieldHint text="批量打招呼会先做一次**只读预览**：逐条列出能不能发、为什么不能，正文可以逐条改或跳过。真正的发送要你在预览里确认一次，之后按每批最多 5 条依次发出（条与条之间会等 3–9 秒 —— 连点是最明显的机器信号，慢是有意的）。" />
      <FieldHint text="批量投递（L4）走的是**平台上已有的那份**简历，投出去**不可逆**。它会先做一次只读预览：逐条列出能不能投、为什么不能（只有接了投递动作的平台能投）。默认关闭 —— 需要在「设置 → 系统控制中心 → 发送分层」里先打开 L4 投递。" />
      <FieldHint text="收藏 / 忽略 / 归档只改**本地记录**，不碰平台。撤销回的是「已读」而不是各自的原始状态 —— 勾选可以跨页，原状态没跟着一起带过来。" />
    </div>
  )
}
