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
 *
 * ── 2026-09-20 动作区重做（求职者调研）
 *   * 「规则定制 / 模型定制」是**实现术语**，求职者看不懂也不敢点。改为
 *     主操作「定制这份简历」（本地规则）+ 次操作「AI 改写措辞」（模型）。
 *     主次依据调研：只定制简介/技能顺序/靠前成果三处已拿 ~94% 的 ATS 收益，
 *     而这三件事规则路径全包 —— 高频投递者要的是"10 秒一版"，不是每岗一次模型调用；
 *   * 承诺前置：按钮上方先说清"只调顺序与措辞、不新增经历、不改简历本体"
 *     （求职者对"AI 改我简历"的第一反应是害怕，先给安全感再给按钮）；
 *   * 「导出这版 PDF」从生成按钮旁移进建议卡：导出是对**这一版建议**的动作，
 *     长在建议卡上才对得上号（原来放在还没生成建议的地方，时序错位）；
 *   * 采用/不采用如实标注"仅记录"—— 它记录的是"这个岗位投的是哪版"，
 *     不是"改写了简历"。
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
    /* 2026-09-23 卡片化收口：与详情里其它段落同一形态；内部原 jh-card 降为 jh-subcard。 */
    <section className="jh-card jh-card-tight jh-tailor">
      <h3 className="jh-card-title">简历定制</h3>
      {/* 承诺前置（调研结论）：求职者对"定制简历"的第一反应是"会不会把我的简历改乱"。
          先把边界说清楚 —— 只调顺序与措辞、不新增经历、不动简历本体 —— 再给按钮。 */}
      <p className="jh-muted">
        <InlineMd text="按这个岗位调整你的简历：**只调顺序和措辞**（技能排序、经历成果排序、简介措辞），不会新增你没写过的经历，也**不会改写简历本体** —— 满意就导出那版去投。" />
      </p>
      <div className="jh-detail-actions">
        {/* 主操作 = 本地规则：瞬时、零成本、结构上不可能编造。它干的正是调研里
            "94% 收益"的那三件事（简介 / 技能顺序 / 靠前成果），高频投递 10 秒一版。 */}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={busy !== null}
          title="本地完成，瞬时：把与这个岗位相关的技能和经历成果排到前面（只动顺序，内容不变）"
          onClick={() =>
            void run('定制这份简历', async () => {
              const result = await tailorResume({ jobId: props.jobId, useLlm: false })
              return `已按这个岗位重排（顺序变了，内容没动）· 建议编号 #${String(result.id)}`
            })
          }
        >
          定制这份简历
        </button>
        {/* 次操作 = 模型：更慢、要改措辞，是"升级"不是并列选项 —— 所以用 quiet 样式。 */}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-quiet"
          disabled={busy !== null}
          title="调用模型改写措辞（更慢）。同样不新增经历；模型不可用或结果不合规时自动退回重排版，并如实标注"
          onClick={() =>
            void run('AI 改写措辞', async () => {
              const result = await tailorResume({ jobId: props.jobId, useLlm: true })
              return result.via === 'llm'
                ? `AI 已按这个岗位改写措辞（已过防编造检查，未新增任何经历）· 建议编号 #${String(result.id)}`
                : `模型不可用或结果不合规，已退回重排版 #${String(result.id)}（如实标注，不冒充 AI 版）`
            })
          }
        >
          AI 改写措辞
        </button>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}
      {busy === null ? null : <p className="jh-muted">{busy}…</p>}

      {latest === undefined ? (
        <p className="jh-muted">还没有针对这个岗位的定制建议 —— 点上面的按钮，几秒就好。</p>
      ) : (
        <div className="jh-subcard">
          <p className="jh-muted">
            最新建议 #{latest.id}（来源：{latest.via === 'llm' ? 'AI 改写' : '本地重排'}）
            {latest.adopted ? ' · 已记录采用' : ''}
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
            {/* 导出（2026-09-20 从生成按钮旁移到这里）：导出是对**这一版建议**的动作 ——
                求职者的终点动作是"拿这版去投"，它必须长在建议卡上，而不是还没生成
                建议的地方。 */}
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={busy !== null}
              title="把这一版导出成 PDF，拿去投这个岗位"
              onClick={() =>
                void run('导出', async () => {
                  const file = await exportResume(latest.resumeId, { format: 'pdf', template: 'concise' })
                  return `已导出 ${file.fileName}`
                })
              }
            >
              导出这版 PDF
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-quiet"
              disabled={busy !== null}
              title="记录「这个岗位投的是这一版」（只是留个记录方便回溯，简历本体不会被改写）"
              onClick={() =>
                void run('采用', async () => {
                  await adoptTailoring(latest.id, true)
                  return '已记录：这个岗位用这一版（简历本体没有被改写）'
                })
              }
            >
              采用这版
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-quiet"
              disabled={busy !== null}
              title="记录这个岗位不用这一版"
              onClick={() =>
                void run('不采用', async () => {
                  await adoptTailoring(latest.id, false)
                  return '已记录：这个岗位不用这一版'
                })
              }
            >
              不用这版
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
