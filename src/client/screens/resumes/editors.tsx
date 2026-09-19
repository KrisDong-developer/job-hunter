import { useState, type ReactNode } from 'react'

/** 数组内换位（上移/下移）。越界就原样返回。 */
export function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item as T)
  return next
}

/** 重复块的统一外壳：编号 + 上移/下移/删除。 */
export function BlockCard(props: {
  label: string
  index: number
  total: number
  onMove: (delta: number) => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="jh-entry">
      <div className="jh-entry-head">
        <span className="jh-entry-no">{props.label}</span>
        <span className="jh-spacer" />
        <button type="button" className="jh-icon-btn" aria-label="上移" disabled={props.index === 0}
          onClick={() => props.onMove(-1)}>↑</button>
        <button type="button" className="jh-icon-btn" aria-label="下移" disabled={props.index === props.total - 1}
          onClick={() => props.onMove(1)}>↓</button>
        <button type="button" className="jh-icon-btn" aria-label="删除这一项"
          onClick={props.onRemove}>×</button>
      </div>
      {props.children}
    </div>
  )
}

/** 分条成果：一条一行，回车接着加一条。 */
export function LinesEditor(props: {
  lines: string[]
  placeholder: string
  onChange: (lines: string[]) => void
}) {
  return (
    <div className="jh-lines">
      {props.lines.map((line, index) => (
        <div className="jh-line" key={index}>
          <input
            className="jh-input"
            value={line}
            placeholder={props.placeholder}
            onChange={(event) => {
              const next = [...props.lines]
              next[index] = event.target.value
              props.onChange(next)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              props.onChange([...props.lines.slice(0, index + 1), '', ...props.lines.slice(index + 1)])
            }}
          />
          <button
            type="button"
            className="jh-icon-btn"
            aria-label="删除这一条"
            onClick={() => props.onChange(props.lines.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet"
        onClick={() => props.onChange([...props.lines, ''])}>
        ＋ 添加一条
      </button>
    </div>
  )
}

/** 标签式输入：回车或「、」/逗号确认一个，点 × 删掉。 */
export function ChipsEditor(props: {
  values: string[]
  placeholder: string
  /** 可访问名称。录入框只有 placeholder，输入一次后就拿不到标签了。 */
  label: string
  onChange: (values: string[]) => void
}) {
  const [text, setText] = useState('')

  const commit = (): void => {
    const parts = text.split(/[、,，\s]+/).map((part) => part.trim()).filter((part) => part !== '')
    if (parts.length > 0) props.onChange([...new Set([...props.values, ...parts])])
    setText('')
  }

  return (
    <span className="jh-chips">
      {props.values.map((value) => (
        <span key={value} className="jh-chip-item">
          {value}
          <button
            type="button"
            className="jh-chip-x"
            aria-label={`删除 ${value}`}
            onClick={() => props.onChange(props.values.filter((item) => item !== value))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="jh-input jh-chip-input"
        aria-label={props.label}
        value={text}
        placeholder={props.placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === '、' || event.key === ',') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Backspace' && text === '' && props.values.length > 0) {
            props.onChange(props.values.slice(0, -1))
          }
        }}
      />
    </span>
  )
}
