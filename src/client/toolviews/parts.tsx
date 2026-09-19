import { createElement, useState, type ReactNode } from 'react'
import type { ContentBlock, ToolCallBlockView } from '../../shared/contract/dsh.js'
import { parseJobListLine, type JobListLine } from '../../shared/text/tool-format.js'

/**
 * toolview 卡片的共用零件。
 *
 * 这一层只做两件事：**从冻结节點里取出可读信息**，以及**统一的卡片外壳**。
 * 它不碰网络、不碰活对象 —— 卡片是"这次调用的纯函数"（见 slot catalog 的说明）。
 */

/** 把结算节点的内容块拼成纯文本（与 ui-tool 的 `resultText` 同口径）。 */
export function textOf(block: ToolCallBlockView): string {
  const content = block.content ?? []
  return content
    .map((item: ContentBlock) => (item.type === 'text' ? String((item as { text?: unknown }).text ?? '') : ''))
    .filter((part) => part !== '')
    .join('\n')
}

/** 已结算？未结算的卡片只显示"正在跑"，不给按钮 —— 点了也没有结果可操作。 */
export function isSettled(block: ToolCallBlockView): boolean {
  return block.kind !== undefined
}

/** 从结果文本里挑出所有岗位行（`#12 标题 · 公司 · …`）。 */
export function jobLinesOf(text: string): JobListLine[] {
  const out: JobListLine[] = []
  for (const raw of text.split('\n')) {
    const parsed = parseJobListLine(raw)
    if (parsed !== undefined) out.push(parsed)
  }
  return out
}

/** 结果文本的首行 —— 列表卡的摘要行。 */
export function headlineOf(text: string): string {
  const first = text.split('\n').find((line) => line.trim() !== '')
  return first === undefined ? '' : first.trim()
}

export interface CardShellProps {
  title: string
  subtitle?: string
  tone?: 'normal' | 'error'
  actions?: ReactNode
  inspect?: (() => void) | undefined
  children?: ReactNode
}

/** 卡片外壳：标题行 + 可选副标题 + 动作区 + 内容区。 */
export function CardShell(props: CardShellProps) {
  const { title, subtitle, tone = 'normal', actions, inspect, children } = props
  return createElement(
    'div',
    { className: 'jh-tv', 'data-tone': tone },
    createElement(
      'div',
      { className: 'jh-tv-head' },
      createElement('span', { className: 'jh-tv-title' }, title),
      subtitle === undefined || subtitle === '' ? null : createElement('span', { className: 'jh-tv-sub' }, subtitle),
      createElement('span', { className: 'jh-spacer' }),
      actions === undefined ? null : createElement('span', { className: 'jh-tv-actions' }, actions),
      inspect === undefined
        ? null
        : createElement(
            'button',
            { type: 'button', className: 'jh-tv-link', onClick: inspect },
            '查看',
          ),
    ),
    children === undefined ? null : createElement('div', { className: 'jh-tv-body' }, children),
  )
}

/** 一行 `标签 值`。 */
export function Row(props: { label: string; value: ReactNode }) {
  return createElement(
    'div',
    { className: 'jh-tv-row' },
    createElement('span', { className: 'jh-tv-label' }, props.label),
    createElement('span', { className: 'jh-tv-value' }, props.value),
  )
}

/** 一个岗位行（可点击 → 跳到主面板）。 */
export function JobRow(props: {
  job: JobListLine
  onOpen: (jobId: number) => void
}) {
  const { job, onOpen } = props
  return createElement(
    'button',
    {
      type: 'button',
      className: 'jh-tv-job',
      onClick: () => onOpen(job.id),
      title: '在主面板里打开这个岗位',
    },
    createElement('span', { className: 'jh-tv-job-id' }, `#${String(job.id)}`),
    createElement('span', { className: 'jh-tv-job-title' }, job.title),
    createElement('span', { className: 'jh-tv-job-meta' }, [job.company, job.city].filter((p) => p !== '').join(' · ')),
    createElement('span', { className: 'jh-spacer' }),
    createElement('span', { className: 'jh-tv-job-salary' }, job.salary),
    createElement('span', { className: 'jh-tv-job-score' }, job.score),
  )
}

/**
 * 「按一次就发一个请求」的极简状态机。
 * 卡片里的按钮都是这种一次性动作，不需要 `useAsync` 那套依赖重拉。
 */
export function useAction<T>(): {
  run: (fn: () => Promise<T>) => Promise<void>
  busy: boolean
  error: string | null
  result: T | null
  reset: () => void
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<T | null>(null)

  const run = async (fn: () => Promise<T>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setResult(await fn())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return {
    run,
    busy,
    error,
    result,
    reset: () => {
      setError(null)
      setResult(null)
    },
  }
}
