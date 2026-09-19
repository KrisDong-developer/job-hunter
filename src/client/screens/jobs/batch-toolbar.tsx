import { FieldHint } from '../../ui/field-hint.js'

/** 批量工具条：只在有勾选时出现（没勾选时它占的那一行是纯粹的噪音）。 */
export function BatchToolbar(props: {
  count: number
  onGreet: () => void
  onDeliver: () => void
  onClear: () => void
}) {
  return (
    <div className="jh-picked">
      <span>已选 {props.count} 条</span>
      <span className="jh-spacer" />
      <button type="button" className="jh-btn jh-btn-inline" onClick={props.onGreet}>
        批量打招呼（{props.count}）
      </button>
      <button type="button" className="jh-btn jh-btn-inline" onClick={props.onDeliver}>
        批量投递（{props.count}）
      </button>
      <button type="button" className="jh-btn jh-btn-inline" onClick={props.onClear}>
        清除选择
      </button>
      <FieldHint text="批量打招呼会先做一次**只读预览**：逐条列出能不能发、为什么不能，正文可以逐条改或跳过。真正的发送要你在预览里确认一次，之后按每批最多 5 条依次发出（条与条之间会等 3–9 秒 —— 连点是最明显的机器信号，慢是有意的）。" />
      <FieldHint text="批量投递（L4）走的是**平台上已有的那份**简历，投出去**不可逆**。它会先做一次只读预览：逐条列出能不能投、为什么不能（只有接了投递动作的平台能投）。默认关闭 —— 需要在「设置 → 系统控制中心 → 发送分层」里先打开 L4 投递。" />
    </div>
  )
}
