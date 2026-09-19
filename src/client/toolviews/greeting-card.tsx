import { useState } from 'react'
import type { ToolCallOwnerProps } from '../../shared/contract/dsh.js'
import { CardShell, isSettled, textOf } from './parts.js'
import { openJobInPanel } from './open-panel.js'

/**
 * `greeting_draft` 的卡片。
 *
 * 它存在的意义是把「生成」与「发送」在**视觉上**分开：
 * 卡片里的按钮只有复制与"去面板发送"，**没有**直接发送 ——
 * 发送是高危动作，必须经审批（§22.4），不该藏在一张对话卡片的一个按钮里。
 */
export function GreetingCard(props: ToolCallOwnerProps) {
  const { block, inspect } = props
  const settled = isSettled(block)
  const text = textOf(block)
  const failed = block.isError === true
  const [copied, setCopied] = useState(false)

  // 结果的前两行是标题与空行，正文从第三行开始；末尾几行是元信息
  const parsed = splitDraft(text)
  const jobId = jobIdOf(props)

  return (
    <CardShell
      title="打招呼话术"
      subtitle={failed ? (block.error?.code ?? '失败') : settled ? parsed.source : '正在生成…'}
      tone={failed ? 'error' : 'normal'}
      {...(inspect === undefined ? {} : { inspect })}
      actions={
        settled && !failed ? (
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            onClick={() => {
              void navigator.clipboard?.writeText(parsed.body).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
          >
            {copied ? '已复制' : '复制'}
          </button>
        ) : null
      }
    >
      {!settled ? (
        <p className="jh-tv-note">正在生成…模型不可用时会自动退回内置模板。</p>
      ) : failed ? (
        <p className="jh-tv-error">{text === '' ? '这次调用失败了。' : text}</p>
      ) : (
        <>
          <pre className="jh-tv-pre jh-tv-pre-body">{parsed.body}</pre>
          {parsed.meta === '' ? null : <p className="jh-tv-note">{parsed.meta}</p>}
          <p className="jh-tv-note">还没有发送 —— 发送是高危动作，需要在面板里确认。</p>
        </>
      )}
      {jobId === null || !settled || failed ? null : (
        <div className="jh-tv-foot">
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            onClick={() => openJobInPanel(jobId, 'draft')}
          >
            去面板里发送
          </button>
        </div>
      )}
    </CardShell>
  )
}

interface ParsedDraft {
  source: string
  body: string
  meta: string
}

/**
 * 拆开 `greeting_draft` 的返回文本。
 *
 * 返回格式由 `tools/index.ts` 决定：第 1 行标题、第 2 行空、正文、空、元信息行、提示行。
 * 拆不出来就整段当正文 —— 宁可少显示一点信息，也不要显示错位的内容。
 */
function splitDraft(text: string): ParsedDraft {
  const lines = text.split('\n')
  const header = lines[0] ?? ''
  const sourceMatch = /来源：(模型生成|内置模板[^）]*)/.exec(header)
  const source = sourceMatch === null ? '' : sourceMatch[0]
  const start = lines.findIndex((line, index) => index > 0 && line.trim() !== '')
  if (start < 0) return { source, body: text.trim(), meta: '' }
  const tail = lines.findIndex((line, index) => index > start && /^（\d+ 字）/.test(line.trim()))
  const end = tail < 0 ? lines.length : tail
  const body = lines
    .slice(start, end)
    .join('\n')
    .trim()
  const meta = tail < 0 ? '' : lines.slice(tail).join(' ').trim()
  return { source, body: body === '' ? text.trim() : body, meta }
}

function jobIdOf(props: ToolCallOwnerProps): number | null {
  const raw = (props.block.kind === undefined ? props.block.argsRaw : props.block.call?.argsRaw) ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const value = (parsed as { jobId?: unknown }).jobId
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
    }
  } catch {
    /* 参数坏了就不给跳转按钮 */
  }
  return null
}
