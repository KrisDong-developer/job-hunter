import { useEffect, useRef, useState } from 'react'

// ── 基础控件 ──────────────────────────────────────────────────────────

/* Switch 已抽到 `../switch.js` —— 岗位库的「跨平台折叠」也要用同一种"即时生效的开关"。
   抽出来的理由与 FieldHint 相同：复制一份会两边各自漂移。 */

/**
 * 数字输入框（带单位后缀）：**受控的草稿值**，失焦 / 回车才提交。
 *
 * 为什么不 onChange 就提交：那样每敲一个数字都会发一次 PATCH，
 * 而且"20"到"200"中途会先把额度改成 2 —— 用户还没输完就已经生效了。
 * 也不用 `key` 重挂载来同步服务端值：那会在用户打字时把光标顶掉。
 */
export function NumberField(props: {
  value: number
  min: number
  max: number
  /** 单位后缀（分钟 / 条 / 个）。 */
  unit: string
  label: string
  disabled?: boolean
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState<string>(String(props.value))
  const focused = useRef(false)

  useEffect(() => {
    // 服务端值变了、而用户没在编辑，就同步过来（改完保存后的回读走这条）
    if (!focused.current) setDraft(String(props.value))
  }, [props.value])

  const commit = (): void => {
    const parsed = Number.parseInt(draft.trim(), 10)
    // 输不出数字就当没改过：退回服务端的值，而不是把设置写成 NaN
    if (!Number.isFinite(parsed)) {
      setDraft(String(props.value))
      return
    }
    const clamped = Math.min(props.max, Math.max(props.min, parsed))
    setDraft(String(clamped))
    if (clamped !== props.value) props.onCommit(clamped)
  }

  return (
    <span className="jh-number">
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={1}
        aria-label={props.label}
        disabled={props.disabled === true}
        value={draft}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      <span className="jh-number-unit">{props.unit}</span>
    </span>
  )
}
