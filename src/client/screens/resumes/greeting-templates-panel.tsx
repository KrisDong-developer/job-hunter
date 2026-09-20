import { useState } from 'react'
import { GREETING_TONES, GREETING_TONE_LABEL, type GreetingTone } from '../../../shared/contract/enums/pipeline.js'
import type { GreetingTemplateDto } from '../../../shared/contract/dto/resume.js'
import { ApiError } from '../../net/client.js'
import {
  deleteGreetingTemplate,
  fetchGreetingTemplates,
  generateGreetingTemplate,
  saveGreetingTemplate,
} from '../../net/resumes.js'
import { useAsync } from '../../hooks/use-async.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { InlineMd } from '../../ui/inline-md.js'

/** 生成来源的如实标注（与服务端 `via` 一一对应，不冒充）。徽章要短——扫得动；完整语义放 title。 */
const VIA_LABEL: Record<GreetingTemplateDto['via'], string> = {
  llm: 'AI 生成',
  rule: '规则兜底',
  manual: '手写',
}

const VIA_TITLE: Record<GreetingTemplateDto['via'], string> = {
  llm: '由模型根据这份简历生成，已过校验：没编造技术词、没带联系方式',
  rule: '模型未开启或结果不合规，用简历事实按固定句式拼装（不外发任何内容）',
  manual: '手写或人工改过',
}

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? error.display : error instanceof Error ? error.message : String(error)
}

/**
 * 简历详情 ·「话术」子页（v12 多赛道）。
 *
 * ## 为什么模板挂在简历上（而不是全局）
 *
 * 多方向求职定型后，"一份简历 = 一条赛道"：Java 版的开场谈高并发，
 * 销售版谈客户 —— 全局模板会让两个方向互相污染。模板里的 `{岗位}` `{公司}`
 * 占位符在发送那一刻替换，所以一条模板服务这条赛道的所有岗位。
 *
 * ## 三条界面纪律（与岗位详情的定制面板同一套）
 *
 * 1. **承诺前置**：先说清"只用这份简历里的事实、不含联系方式"，
 *    再给按钮 —— 用户对"AI 写话术"的第一反应是怕它瞎编；
 * 2. **如实标注来源**：AI / 规则兜底 / 手写，三种 `via` 分得清清楚楚，
 *    模型不可用退回规则时**明说**，不冒充 AI；
 * 3. **回复率只看事实**：uses / replies 服务端积累，次数太少不显百分比。
 */
export function GreetingTemplatesPanel(props: { resumeId: number }) {
  const list = useAsync((signal) => fetchGreetingTemplates(props.resumeId, signal), [props.resumeId])
  const [tone, setTone] = useState<GreetingTone>('formal')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 就地编辑的草稿（key = 模板 id；保存成功即清掉）。 */
  const [edits, setEdits] = useState<Record<number, { name: string; body: string }>>({})
  /** 新建草稿（`null` = 没在新建）。 */
  const [creating, setCreating] = useState<{ name: string; body: string } | null>(null)

  const items: GreetingTemplateDto[] = list.state.status === 'ok' ? list.state.data.items : []

  const run = async (label: string, fn: () => Promise<string>): Promise<void> => {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      setNotice(await fn())
      await list.reload()
    } catch (caught) {
      setError(reasonOf(caught))
    } finally {
      setBusy(null)
    }
  }

  const editOf = (item: GreetingTemplateDto): { name: string; body: string } =>
    edits[item.id] ?? { name: item.name, body: item.body }

  const dirtyOf = (item: GreetingTemplateDto): boolean => {
    const edit = edits[item.id]
    return edit !== undefined && (edit.name !== item.name || edit.body !== item.body)
  }

  return (
    <div className="jh-greeting-panel">
      {/* 承诺前置：先划清边界，再给按钮。 */}
      <p className="jh-muted">
        <InlineMd
          text={'这版简历的**打招呼开场模板**：只用这份简历里的事实生成（不编造、不含联系方式），' +
            '正文里的 **{岗位}** 与 **{公司}** 在发送那一刻替换成具体岗位。'}
        />
      </p>

      <div className="jh-greeting-actions">
        <label className="jh-sort">
          <span className="jh-muted">语气</span>
          <select
            className="jh-select jh-greeting-tone"
            aria-label="语气"
            value={tone}
            onChange={(event) => setTone(event.target.value as GreetingTone)}
          >
            {GREETING_TONES.map((value) => (
              <option key={value} value={value}>{GREETING_TONE_LABEL[value]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-primary"
          disabled={busy !== null}
          title="从这份简历的事实生成一条开场（模型用途「简历话术模板」没开时，自动用规则兜底并如实标注）"
          onClick={() =>
            void run('生成中', async () => {
              const template = await generateGreetingTemplate(props.resumeId, tone)
              return template.via === 'llm'
                ? `已用 AI 生成「${template.name}」（已过校验：没编造技术词、没带联系方式）`
                : `模型未开启或结果不合规，已用规则兜底生成「${template.name}」（只用简历里已有的事实拼装）`
            })
          }
        >
          AI 生成开场
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy !== null}
          onClick={() => {
            setCreating({ name: '', body: '您好，看到{公司}在招{岗位}，很感兴趣。' })
            setError(null)
            setNotice(null)
          }}
        >
          手写一条
        </button>
      </div>

      {list.state.status === 'loading' && <LoadingLine>正在读取话术…</LoadingLine>}
      {list.state.status === 'error' && <ErrorLine>{list.state.message}</ErrorLine>}
      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}
      {busy === null ? null : <p className="jh-muted">{busy}…</p>}

      {creating === null ? null : (
        <div className="jh-card jh-card-tight jh-greeting-item">
          <div className="jh-greeting-item-head">
            <input
              className="jh-input jh-greeting-name"
              aria-label="模板名"
              placeholder="给这条开场起个名字（如：正式开场 · 后端）"
              value={creating.name}
              onChange={(event) => setCreating({ ...creating, name: event.target.value })}
            />
          </div>
          <textarea
            className="jh-textarea jh-greeting-body"
            aria-label="模板正文"
            rows={4}
            placeholder="您好，看到{公司}在招{岗位}…（技术词只能来自这份简历，不能留联系方式）"
            value={creating.body}
            onChange={(event) => setCreating({ ...creating, body: event.target.value })}
          />
          {/* footer：动作贴着它的对象（正文）收尾；新建态没有统计，留一行占位对齐 */}
          <div className="jh-greeting-foot">
            <span className="jh-muted jh-greeting-meta">保存前会校验：占位符齐全、无联系方式、技术词来自这份简历</span>
            <span className="jh-spacer" />
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={busy !== null || creating.name.trim() === ''}
              onClick={() =>
                void run('保存', async () => {
                  const saved = await saveGreetingTemplate(props.resumeId, creating)
                  setCreating(null)
                  return `已保存「${saved.name}」`
                })
              }
            >
              保存
            </button>
            <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={() => setCreating(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      {list.state.status === 'ok' && items.length === 0 && creating === null ? (
        <p className="jh-muted">
          还没有话术 —— 点「AI 生成开场」，几秒就好；每条赛道留几条不同语气的开场就够。
        </p>
      ) : null}

      {items.map((item) => {
        const edit = editOf(item)
        const dirty = dirtyOf(item)
        return (
          <div className="jh-card jh-card-tight jh-greeting-item" key={item.id}>
            {/* 头行只放两样：名字（主）+ 来源徽章（一眼分辨 AI/兜底/手写）。
                统计与时间挪到 footer —— 三个来源挤一行会在窄容器里换行错落。 */}
            <div className="jh-greeting-item-head">
              <input
                className="jh-input jh-greeting-name"
                aria-label="模板名"
                value={edit.name}
                onChange={(event) =>
                  setEdits((current) => ({ ...current, [item.id]: { ...edit, name: event.target.value } }))
                }
              />
              <span className="jh-greeting-via" title={VIA_TITLE[item.via]}>{VIA_LABEL[item.via]}</span>
            </div>
            <textarea
              className="jh-textarea jh-greeting-body"
              aria-label="模板正文"
              rows={4}
              value={edit.body}
              onChange={(event) =>
                setEdits((current) => ({ ...current, [item.id]: { ...edit, body: event.target.value } }))
              }
            />
            {/* footer：左读统计（回复率闭环的日常读数），右做动作（删除 quiet 在前、保存主操作殿后）。 */}
            <div className="jh-greeting-foot">
              <span className="jh-muted jh-greeting-meta">
                {item.uses === 0
                  ? '还没用过'
                  : `发过 ${String(item.uses)} 次${item.replies > 0 ? `、回了 ${String(item.replies)} 次` : '、还没回'}`}
                {` · ${item.updatedAt.slice(0, 16).replace('T', ' ')}`}
              </span>
              <span className="jh-spacer" />
              {dirty ? <span className="jh-chip jh-chip-dirty">有未保存的改动</span> : null}
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-quiet"
                disabled={busy !== null}
                title={`删除「${item.name}」（不能撤销）`}
                onClick={() => {
                  if (!window.confirm(`删除「${item.name}」？不能撤销。`)) return
                  void run('删除', async () => {
                    await deleteGreetingTemplate(props.resumeId, item.id)
                    return `已删除「${item.name}」`
                  })
                }}
              >
                删除
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-primary"
                disabled={busy !== null || !dirty}
                title={dirty ? undefined : '没有改动'}
                onClick={() =>
                  void run('保存', async () => {
                    const saved = await saveGreetingTemplate(props.resumeId, {
                      id: item.id,
                      name: edit.name,
                      body: edit.body,
                    })
                    setEdits((current) => {
                      const next = { ...current }
                      delete next[item.id]
                      return next
                    })
                    return `已保存「${saved.name}」（改过就算手写）`
                  })
                }
              >
                保存
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
