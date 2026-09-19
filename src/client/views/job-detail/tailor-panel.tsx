import { useCallback, useEffect, useState } from 'react'
import type { TailoringDto } from '../../../shared/contract/dto/resume.js'
import { ApiError } from '../../net/client.js'
import { adoptTailoring, exportResume, fetchTailorings, tailorResume } from '../../net/resumes.js'
import { InlineMd } from '../../ui/inline-md.js'

/**
 * U4：岗位详情里的简历定制（§13）。
 *
 * 这个面板的形状直接来自 §3.2 的产品判断 —— **不要每岗定制**：
 *   * 它产出的是**建议**，绝不自动覆盖用户手上的简历；
 *   * 建议里逐条说明改了什么（`notes`），并且注明来源是模型还是规则；
 *   * 采用后才把这一版的顺序写回启用简历（这一步是显式的）。
 *
 * 另外它会如实显示"这份定制有没有引入原简历里没有的事实" ——
 * 防编造检查是**生成时**做的，越界的结果根本不会出现在这里。
 */
export function TailorPanel(props: { jobId: number; revision: number; onChanged: () => void }) {
  const [items, setItems] = useState<TailoringDto[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reload = useCallback(async () => {
    try {
      const result = await fetchTailorings({ jobId: props.jobId, limit: 5 })
      setItems(result.items)
    } catch {
      // 拉不到定制列表不该让整个详情坏掉：这是附加信息
      setItems([])
    }
  }, [props.jobId])

  useEffect(() => {
    void reload()
  }, [reload, props.revision])

  const run = async (label: string, fn: () => Promise<string>): Promise<void> => {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      setNotice(await fn())
      await reload()
      props.onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setBusy(null)
    }
  }

  const latest = items[0]

  /** 把这版建议拼成纯文本复制：改动建议 + 技能顺序。 */
  const copySuggestions = async (): Promise<void> => {
    if (latest === undefined) return
    const lines: string[] = []
    if (latest.notes.length > 0) {
      lines.push('改动建议：')
      lines.push(...latest.notes.map((note) => `· ${note}`))
    }
    lines.push('调整后的技能顺序：')
    lines.push(latest.content.skills.slice(0, 12).map((s) => s.name).join('、'))
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="jh-tailor">
      <h3 className="jh-card-title">简历定制</h3>
      <div className="jh-detail-actions">
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy !== null}
          onClick={() =>
            void run('规则定制', async () => {
              const result = await tailorResume({ jobId: props.jobId, useLlm: false })
              return `已生成规则定制 #${String(result.id)}（不调用模型，只重排顺序）`
            })
          }
        >
          规则定制
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy !== null}
          onClick={() =>
            void run('模型定制', async () => {
              const result = await tailorResume({ jobId: props.jobId, useLlm: true })
              return result.via === 'llm'
                ? `已生成模型定制 #${String(result.id)}（已过防编造检查）`
                : `模型不可用或结果不合规，已退回规则结果 #${String(result.id)}`
            })
          }
        >
          模型定制
        </button>
        {latest === undefined ? null : (
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={busy !== null}
            onClick={() =>
              void run('导出', async () => {
                const file = await exportResume(latest.resumeId, { format: 'pdf', template: 'concise' })
                return `已导出 ${file.fileName}`
              })
            }
          >
            导出这版简历 PDF
          </button>
        )}
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}
      {busy === null ? null : <p className="jh-muted">{busy}…</p>}

      {latest === undefined ? (
        <p className="jh-muted">
          <InlineMd text="还没有针对这个岗位的定制建议。定制只改**顺序与措辞**，不会新增任何你没写过的经历。" />
        </p>
      ) : (
        <div className="jh-card jh-card-tight">
          <p className="jh-muted">
            最新建议 #{latest.id}（来源：{latest.via === 'llm' ? '模型' : '规则'}）
            {latest.adopted ? ' · 已采用' : ''}
            {latest.createdAt === '' ? '' : ` · ${latest.createdAt.slice(0, 16).replace('T', ' ')}`}
          </p>
          {latest.notes.length === 0 ? null : (
            <ul className="jh-tailor-notes">
              {latest.notes.map((note, index) => (
                <li key={String(index)}>· {note}</li>
              ))}
            </ul>
          )}
          <p className="jh-muted">
            调整后的技能顺序：
            {latest.content.skills.slice(0, 12).map((skill) => (
              <span className="jh-tailor-skill" key={skill.name}>
                {skill.name}
              </span>
            ))}
          </p>
          <div className="jh-detail-actions">
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={busy !== null}
              onClick={() => void copySuggestions()}
            >
              {copied ? '已复制' : '复制建议'}
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={busy !== null}
              onClick={() =>
                void run('采用', async () => {
                  await adoptTailoring(latest.id, true)
                  return '已标记为采用 —— 这只是记录，你的简历本体没有被改写'
                })
              }
            >
              标记为采用
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={busy !== null}
              onClick={() =>
                void run('放弃', async () => {
                  await adoptTailoring(latest.id, false)
                  return '已标记为不采用'
                })
              }
            >
              不采用
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
