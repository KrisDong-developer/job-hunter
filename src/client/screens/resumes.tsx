import { useCallback, useEffect, useMemo, useState } from 'react'
import { PLUGIN_ID } from '../../shared/constants.js'
import { RESUME_TEMPLATES } from '../../shared/enums.js'
import { RESUME_LANGUAGE_LABEL, RESUME_STATE_LABEL, RESUME_TEMPLATE_LABEL } from '../../shared/labels.js'
import type { ResumeDto, ResumeIssue, ResumeSummaryDto } from '../../shared/resume.js'
import { emptyResumeContent } from '../../shared/resume.js'
import {
  ApiError,
  createResume,
  deleteResume,
  duplicateResume,
  exportResume,
  fetchResume,
  fetchResumes,
  fileUrl,
  previewUrl,
  setDefaultResume,
  updateResume,
} from '../api.js'
import { useAsync } from '../use-async.js'

/**
 * U3 简历中心（§13）。
 *
 * 它是「管理唯一资产」的地方，所以三件事必须都在这一屏里完成：
 *   版本列表 → 结构化编辑 → 附件生成与**预览**。
 *
 * 与 §3.2 的产品判断一致：这里的编辑是**版本级**的（维护 2–3 版），
 * 不是"每投一个岗位改一次"；针对单个岗位的定制在岗位详情里（U4），
 * 且产出的是**建议**，采用与否由用户决定。
 */
export function ResumesScreen(props: { revision: number; onChanged: () => void }) {
  const list = useAsync((signal) => fetchResumes(signal), [props.revision])
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const items: ResumeSummaryDto[] = list.state.status === 'ok' ? list.state.data.items : []

  // 第一次拿到列表时自动选中当前启用版本 —— 空白详情页看着像坏了
  useEffect(() => {
    if (selected !== null || items.length === 0) return
    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null)
  }, [items, selected])

  const onCreate = useCallback(async () => {
    setCreating(true)
    try {
      const created = await createResume({
        name: '新简历',
        direction: '',
        content: emptyResumeContent(),
      })
      setSelected(created.id)
      props.onChanged()
    } finally {
      setCreating(false)
    }
  }, [props])

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">简历中心</h2>
        <span className="jh-muted">
          按方向维护 2–3 版就够了 —— 每投一个岗位改一次简历，面试时反而讲不一致。
        </span>
        <span className="jh-spacer" />
        <button type="button" className="jh-btn" disabled={creating} onClick={() => void onCreate()}>
          {creating ? '新建中…' : '新建版本'}
        </button>
      </div>

      {list.state.status === 'loading' && <p className="jh-muted">正在读取简历…</p>}
      {list.state.status === 'error' && (
        <div className="jh-card">
          <p className="jh-error">{list.state.message}</p>
          <button type="button" className="jh-btn" onClick={list.reload}>
            重试
          </button>
        </div>
      )}

      {list.state.status === 'ok' && items.length === 0 && (
        <div className="jh-card">
          <p className="jh-muted">
            还没有简历。建一版之后，附件（PDF / Word）与岗位定制都会围绕它工作。
          </p>
        </div>
      )}

      <div className="jh-resume-layout">
        <ul className="jh-resume-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`jh-resume-item${selected === item.id ? ' jh-resume-item-active' : ''}`}
                onClick={() => setSelected(item.id)}
              >
                <span className="jh-resume-name">
                  {item.name}
                  {item.isDefault ? <i className="jh-badge-inline">启用中</i> : null}
                </span>
                <span className="jh-muted jh-resume-meta">
                  {item.direction || '未填方向'} · {RESUME_LANGUAGE_LABEL[item.language]} ·{' '}
                  {RESUME_STATE_LABEL[item.state]}
                </span>
                <span className="jh-muted jh-resume-meta">
                  技能 {item.counts.skills} · 经历 {item.counts.experiences} · 项目 {item.counts.projects} · 附件{' '}
                  {item.counts.files}
                  {item.issues > 0 ? <i className="jh-warn"> · 体检 {item.issues} 项</i> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="jh-resume-detail">
          {selected === null ? (
            <p className="jh-muted">选左边一版简历开始编辑。</p>
          ) : (
            <ResumeEditor
              key={`${String(selected)}-${String(props.revision)}`}
              id={selected}
              onChanged={props.onChanged}
              onDeleted={() => {
                setSelected(null)
                props.onChanged()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** 一版的完整编辑与附件操作。 */
function ResumeEditor(props: { id: number; onChanged: () => void; onDeleted: () => void }) {
  const detail = useAsync((signal) => fetchResume(props.id, signal), [props.id])
  const [draft, setDraft] = useState<ResumeDto | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [template, setTemplate] = useState<'concise' | 'professional'>('concise')

  useEffect(() => {
    if (detail.state.status === 'ok') setDraft(detail.state.data)
  }, [detail.state])

  const issues: ResumeIssue[] = detail.state.status === 'ok' ? detail.state.data.issues : []

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, done?: (result: unknown) => string) => {
      setBusy(label)
      setError(null)
      setNotice(null)
      try {
        const result = await fn()
        setNotice(done === undefined ? '已完成' : done(result))
        props.onChanged()
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
      } finally {
        setBusy(null)
      }
    },
    [props],
  )

  /** 只改标题类字段时直接落库；内容改动走"保存内容"。 */
  const patchMeta = (patch: { name?: string; direction?: string; language?: string }): void => {
    void run('保存', async () => await updateResume(props.id, patch), () => '已保存')
  }

  const content = draft?.content ?? null
  const skillsText = useMemo(
    () => (content === null ? '' : content.skills.map((skill) => skill.name).join('、')),
    [content],
  )
  const highlightsText = useMemo(
    () =>
      content === null
        ? ''
        : content.experiences
            .map((experience) => `## ${experience.company}｜${experience.title}\n${experience.highlights.join('\n')}`)
            .join('\n\n'),
    [content],
  )

  if (draft === null || content === null) {
    return detail.state.status === 'error' ? (
      <p className="jh-error">{detail.state.message}</p>
    ) : (
      <p className="jh-muted">正在读取…</p>
    )
  }

  return (
    <div className="jh-resume-editor">
      <div className="jh-detail-actions">
        <button
          type="button"
          className="jh-btn"
          disabled={busy !== null}
          onClick={() => void run('导出 PDF', async () => await exportResume(props.id, { format: 'pdf', template }), () => 'PDF 已生成，下面可以预览')}
        >
          导出 PDF
        </button>
        <button
          type="button"
          className="jh-btn"
          disabled={busy !== null}
          onClick={() => void run('导出 Word', async () => await exportResume(props.id, { format: 'docx', template }), () => 'Word 已生成')}
        >
          导出 Word
        </button>
        <select
          className="jh-select"
          value={template}
          onChange={(event) => setTemplate(event.target.value === 'professional' ? 'professional' : 'concise')}
        >
          {RESUME_TEMPLATES.map((item) => (
            <option key={item} value={item}>
              {RESUME_TEMPLATE_LABEL[item]}
            </option>
          ))}
        </select>
        <span className="jh-spacer" />
        {draft.isDefault ? (
          <span className="jh-badge">当前启用</span>
        ) : (
          <button
            type="button"
            className="jh-btn"
            disabled={busy !== null}
            onClick={() => void run('设为启用', async () => await setDefaultResume(props.id), () => '已设为启用版本')}
          >
            设为启用
          </button>
        )}
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy !== null}
          onClick={() =>
            void run('复制', async () => await duplicateResume(props.id), () => '已复制一份，可在左侧选择')
          }
        >
          复制
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy !== null}
          onClick={() => void run('删除', async () => await deleteResume(props.id), () => '已删除')}
        >
          删除
        </button>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}
      {busy === null ? null : <p className="jh-muted">{busy}…</p>}

      <div className="jh-two-col">
        <div>
          <label className="jh-field">
            <span>版本名</span>
            <input
              className="jh-input"
              defaultValue={draft.name}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value !== '' && value !== draft.name) patchMeta({ name: value })
              }}
            />
          </label>
          <label className="jh-field">
            <span>方向</span>
            <input
              className="jh-input"
              defaultValue={draft.direction}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value !== draft.direction) patchMeta({ direction: value })
              }}
            />
          </label>
          <label className="jh-field">
            <span>语言</span>
            <select
              className="jh-select"
              value={draft.language}
              onChange={(event) => patchMeta({ language: event.target.value })}
            >
              <option value="zh">中文</option>
              <option value="en">英文（海外方向**不做机翻**，独立维护）</option>
            </select>
          </label>

          <label className="jh-field">
            <span>姓名</span>
            <input
              className="jh-input"
              defaultValue={content.basics.name}
              onBlur={(event) =>
                setDraft({ ...draft, content: { ...content, basics: { ...content.basics, name: event.target.value } } })
              }
            />
          </label>
          <label className="jh-field">
            <span>目标岗位</span>
            <input
              className="jh-input"
              defaultValue={content.basics.title}
              onBlur={(event) =>
                setDraft({ ...draft, content: { ...content, basics: { ...content.basics, title: event.target.value } } })
              }
            />
          </label>
          <label className="jh-field">
            <span>城市 / 年限</span>
            <span className="jh-inline">
              <input
                className="jh-input"
                defaultValue={content.basics.city ?? ''}
                placeholder="深圳"
                onBlur={(event) =>
                  setDraft({
                    ...draft,
                    content: { ...content, basics: { ...content.basics, city: event.target.value || undefined } },
                  })
                }
              />
              <input
                className="jh-input jh-input-narrow"
                type="number"
                defaultValue={content.basics.years ?? ''}
                placeholder="5"
                onBlur={(event) =>
                  setDraft({
                    ...draft,
                    content: {
                      ...content,
                      basics: {
                        ...content.basics,
                        years: event.target.value === '' ? undefined : Number(event.target.value),
                      },
                    },
                  })
                }
              />
            </span>
          </label>

          <label className="jh-field">
            <span>个人简介</span>
            <textarea
              className="jh-textarea"
              rows={4}
              defaultValue={content.summary}
              onBlur={(event) => setDraft({ ...draft, content: { ...content, summary: event.target.value } })}
            />
          </label>

          <label className="jh-field">
            <span>技能（用「、」分隔）</span>
            <textarea
              className="jh-textarea"
              rows={3}
              defaultValue={skillsText}
              onBlur={(event) =>
                setDraft({
                  ...draft,
                  content: {
                    ...content,
                    skills: event.target.value
                      .split(/[、,，\n]/)
                      .map((name) => name.trim())
                      .filter((name) => name !== '')
                      // 保留原有的 level/years/evidence：只改名字不该把证据丢掉
                      .map((name) => content.skills.find((skill) => skill.name === name) ?? { name }),
                  },
                })
              }
            />
          </label>

          <label className="jh-field">
            <span>工作经历（每段以 `## 公司｜职位` 开头，之后每行一条成果）</span>
            <textarea
              className="jh-textarea jh-textarea-tall"
              rows={12}
              defaultValue={highlightsText}
              onBlur={(event) => {
                const experiences = parseExperienceBlocks(event.target.value, content.experiences)
                setDraft({ ...draft, content: { ...content, experiences } })
              }}
            />
          </label>

          <button
            type="button"
            className="jh-btn"
            disabled={busy !== null}
            onClick={() =>
              void run(
                '保存内容',
                async () => await updateResume(props.id, { content: draft.content }),
                (result) => {
                  const resume = result as ResumeDto
                  setDraft(resume)
                  return `内容已保存（rev ${String(resume.rev)}）—— 之前的匹配分已标记为过期`
                },
              )
            }
          >
            保存内容
          </button>
        </div>

        <div>
          <h3 className="jh-card-title">体检</h3>
          {issues.length === 0 ? (
            <p className="jh-ok">规则体检没有发现问题。</p>
          ) : (
            <ul className="jh-issues">
              {issues.map((issue, index) => (
                <li key={`${issue.at}-${String(index)}`} className={issue.level === 'error' ? 'jh-error' : 'jh-warn'}>
                  <b>{issue.level === 'error' ? '必改' : '建议'}</b> {issue.message}
                </li>
              ))}
            </ul>
          )}

          <h3 className="jh-card-title">预览</h3>
          {/* 预览与真正导出走**同一个渲染器**：预览好看、导出走样是最难查的一类 bug */}
          <iframe
            className="jh-preview"
            title="简历预览"
            src={previewUrl(props.id, template)}
            sandbox=""
          />

          <h3 className="jh-card-title">附件</h3>
          {draft.files.length === 0 ? (
            <p className="jh-muted">还没有生成附件。</p>
          ) : (
            <ul className="jh-files">
              {draft.files.map((file) => (
                <li key={file.id}>
                  <a className="jh-link" href={fileUrl(file.id)} target="_blank" rel="noreferrer">
                    {file.fileName}
                  </a>
                  <span className="jh-muted">
                    {' '}
                    {file.format} · {(file.bytes / 1024).toFixed(0)} KB · {file.createdAt.slice(0, 16).replace('T', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="jh-muted jh-footnote">
        附件只由你显式删除 —— 简历是资产，任何自动清理都不会碰它（{PLUGIN_ID}）。
      </p>
    </div>
  )
}

/**
 * 解析「## 公司｜职位」块。
 *
 * 刻意做得很朴素：匹配不上的块**原样保留**上一次的对应经历（按序号），
 * 而不是丢掉 —— 用户在文本框里手滑一下不该让他丢一段经历。
 */
function parseExperienceBlocks(
  text: string,
  previous: ResumeDto['content']['experiences'],
): ResumeDto['content']['experiences'] {
  const blocks = text
    .split(/^##\s*/m)
    .map((block) => block.trim())
    .filter((block) => block !== '')

  return blocks.map((block, index) => {
    const [headerLine = '', ...rest] = block.split('\n')
    const [company = '', title = ''] = headerLine.split('｜').map((part) => part.trim())
    const highlights = rest.map((line) => line.trim()).filter((line) => line !== '')
    const prior = previous[index]
    return {
      company: company === '' ? (prior?.company ?? '') : company,
      title: title === '' ? (prior?.title ?? '') : title,
      highlights,
      ...(prior?.start === undefined ? {} : { start: prior.start }),
      ...(prior?.end === undefined ? {} : { end: prior.end }),
      ...(prior?.city === undefined ? {} : { city: prior.city }),
      ...(prior?.stack === undefined ? {} : { stack: prior.stack }),
    }
  })
}
