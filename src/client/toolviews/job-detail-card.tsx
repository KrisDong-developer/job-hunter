import { useState } from 'react'
import type { ToolCallOwnerProps } from '../../shared/contract/dsh.js'
import { parseDetailLines } from '../../shared/text/tool-format.js'
import { markJob } from '../net/jobs.js'
import { draftGreeting } from '../net/outreach.js'
import { CardShell, isSettled, textOf, useAction } from './parts.js'
import { openJobInPanel } from './open-panel.js'

/**
 * `job_detail` 的卡片（§22.3）。
 *
 * 卡片上的三个动作都是**真的会改状态**的：
 *   收藏 → `POST /jobs/:id/mark`（与界面上的收藏是同一个端点）
 *   生成话术 → `POST /jobs/:id/greeting/draft`（**不发送**）
 *   查看详情 → 切到主面板并打开这个岗位的抽屉
 *
 * 这正是 §22.5 说的「GUI 与对话共享同一份状态」：两边打的是同一批端点。
 */
export function JobDetailCard(props: ToolCallOwnerProps) {
  const { block, inspect } = props
  const settled = isSettled(block)
  const text = textOf(block)
  const lines = text.split('\n')
  const titleLine = lines[0] ?? ''
  const rows = parseDetailLines(text)
  const failed = block.isError === true

  const jobId = jobIdOf(props)
  const mark = useAction<string>()
  const draft = useAction<string>()
  const [copied, setCopied] = useState(false)

  const onMark = (): void => {
    if (jobId === null) return
    void mark.run(async () => {
      const job = await markJob(jobId, 'saved')
      return `已收藏：#${String(job.id)}`
    })
  }

  const onDraft = (): void => {
    if (jobId === null) return
    void draft.run(async () => {
      const result = await draftGreeting(jobId)
      const source = result.via === 'llm' ? '模型生成' : '内置模板'
      return `${result.text}\n\n—— 来源：${source}${result.notes.length === 0 ? '' : `（${result.notes.join('；')}）`}`
    })
  }

  return (
    <CardShell
      title="岗位详情"
      subtitle={failed ? (block.error?.code ?? '失败') : settled ? titleLine : '正在读取…'}
      tone={failed ? 'error' : 'normal'}
      {...(inspect === undefined ? {} : { inspect })}
      actions={
        jobId === null ? null : (
          <>
            <button type="button" className="jh-btn jh-btn-inline" disabled={mark.busy} onClick={onMark}>
              {mark.busy ? '收藏中…' : '收藏'}
            </button>
            <button type="button" className="jh-btn jh-btn-inline" disabled={draft.busy} onClick={onDraft}>
              {draft.busy ? '生成中…' : '生成话术'}
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              onClick={() => openJobInPanel(jobId, 'draft')}
            >
              在面板里打开
            </button>
          </>
        )
      }
    >
      {failed ? (
        <p className="jh-tv-error">{text === '' ? '这次调用失败了。' : text}</p>
      ) : !settled ? (
        <p className="jh-tv-note">正在读取岗位详情…</p>
      ) : (
        <div className="jh-tv-rows">
          {rows.map((row, index) =>
            row === null ? null : (
              <div className="jh-tv-row" key={`${row.key}-${String(index)}`}>
                <span className="jh-tv-label">{row.key}</span>
                <span className="jh-tv-value">{row.value}</span>
              </div>
            ),
          )}
        </div>
      )}

      {mark.error === null ? null : <p className="jh-tv-error">{mark.error}</p>}
      {mark.result === null ? null : <p className="jh-tv-ok">{mark.result}</p>}

      {draft.error === null ? null : <p className="jh-tv-error">{draft.error}</p>}
      {draft.result === null ? null : (
        <div className="jh-tv-draft">
          <pre className="jh-tv-pre">{draft.result}</pre>
          <div className="jh-tv-foot">
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              onClick={() => {
                navigator.clipboard?.writeText(draft.result ?? '').then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? '已复制' : '复制'}
            </button>
            <span className="jh-tv-note">这段**还没有发送** —— 发送要去面板里确认。</span>
          </div>
        </div>
      )}
    </CardShell>
  )
}

/** 从参数里取岗位 id（卡片没拿到参数时就没有动作按钮）。 */
function jobIdOf(props: ToolCallOwnerProps): number | null {
  const raw = (props.block.kind === undefined ? props.block.argsRaw : props.block.call?.argsRaw) ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const value = (parsed as { jobId?: unknown }).jobId
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
    }
  } catch {
    /* 参数坏了就不给动作按钮，但结果照样显示 */
  }
  return null
}
