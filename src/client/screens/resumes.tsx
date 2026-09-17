import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PLUGIN_ID } from '../../shared/constants.js'
import { RESUME_TEMPLATES } from '../../shared/enums.js'
import { RESUME_LANGUAGE_LABEL, RESUME_TEMPLATE_LABEL } from '../../shared/labels.js'
import type {
  ResumeContent,
  ResumeDto,
  ResumeIssue,
  ResumeSummaryDto,
} from '../../shared/resume.js'
import { emptyResumeContent } from '../../shared/resume.js'
import {
  ApiError,
  createResume,
  deleteFile,
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
import { InlineMd } from '../inline-md.js'
import { useAsync } from '../use-async.js'

type Mode = 'edit' | 'split' | 'preview' | 'files'

/** 数组内换位（上移/下移）。越界就原样返回。 */
function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item as T)
  return next
}

/**
 * U3 简历中心（§13）。
 *
 * 布局：**左边版本列表（约 1/4）+ 右边工作区**，工作区里可切「编辑 / 分屏 / 预览」。
 *
 * 2026-09-17 重构（用户反馈原文："开发思维主导、操作门槛高、视觉焦点涣散"）：
 * - **彻底去掉手拼语法**。原先"工作经历"要求用户自己写 `## 公司｜职位` 再一行一条成果，
 *   少一个空格就渲染错乱 —— 现在改成结构化表单（公司/职位/起止/城市/成果分条/技术栈）。
 * - 短字段同行并排（姓名+目标岗位、城市+年限+年龄、起止时间…），纵向空间留给长文本。
 * - 体检结果从"预览区的一行绿字"搬到编辑区顶部的提示条 —— 它指导的是"改表单"。
 * - 导出（主操作）与版本操作（复制/删除/设为启用）分开：前者在预览区，后者在工作区标题栏。
 * - 预览给"纸张"隐喻：深灰底 + 白纸 + 阴影（`bg-mask-2` 实测 = 12% 黑，压在白底上就是浅灰）。
 *
 * 与 §3.2 的产品判断一致：这里的编辑是**版本级**的（维护 2–3 版），
 * 不是"每投一个岗位改一次"；针对单个岗位的定制在岗位详情里（U4）。
 */
export function ResumesScreen(props: { revision: number; onChanged: () => void }) {
  const list = useAsync((signal) => fetchResumes(signal), [props.revision])
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [issuesById, setIssuesById] = useState<Record<number, ResumeIssue[]>>({})

  const items: ResumeSummaryDto[] = list.state.status === 'ok' ? list.state.data.items : []
  const shown = useMemo(() => {
    const key = query.trim().toLowerCase()
    if (key === '') return items
    return items.filter((item) =>
      `${item.name} ${item.direction}`.toLowerCase().includes(key),
    )
  }, [items, query])

  // 第一次拿到列表时自动选中当前启用版本 —— 空白详情页看着像坏了
  useEffect(() => {
    if (selected !== null || items.length === 0) return
    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null)
  }, [items, selected])

  /** 悬停"体检 N 项"时按需取明细：列表接口只给数量，不给具体是哪几项。 */
  const loadIssues = useCallback(
    (id: number) => {
      if (issuesById[id] !== undefined) return
      void fetchResume(id)
        .then((detail) => {
          setIssuesById((current) => ({ ...current, [id]: detail.issues }))
        })
        .catch(() => {
          /* 悬停提示取不到就算了，不该弹错 */
        })
    },
    [issuesById],
  )

  const onCreate = useCallback(async () => {
    setCreating(true)
    try {
      const created = await createResume({ name: '新简历', direction: '', content: emptyResumeContent() })
      setSelected(created.id)
      props.onChanged()
    } finally {
      setCreating(false)
    }
  }, [props])

  const pick = (id: number): void => {
    if (id === selected) return
    if (dirty && !window.confirm('这一版还有未保存的改动，切走就丢了。确定切换？')) return
    setSelected(id)
  }

  return (
    <div className="jh-screen jh-screen-wide">
      <div className="jh-row-head">
        <h2 className="jh-card-title">简历中心</h2>
        <span className="jh-muted">
          按方向维护 2–3 版就够了 —— 每投一个岗位改一次简历，面试时反而讲不一致。
        </span>
      </div>

      {list.state.status === 'loading' && <p className="jh-muted">正在读取简历…</p>}
      {list.state.status === 'error' && (
        <div className="jh-card">
          <p className="jh-error">{list.state.message}</p>
          <button type="button" className="jh-btn" onClick={list.reload}>重试</button>
        </div>
      )}
      {list.state.status === 'ok' && items.length === 0 && (
        <div className="jh-card">
          <p className="jh-muted">
            还没有简历。建一版之后，附件（PDF / Word）与岗位定制都会围绕它工作。
          </p>
        </div>
      )}

      <div className="jh-resume-shell">
        <aside className="jh-resume-side">
          <div className="jh-resume-side-head">
            <input
              className="jh-input"
              placeholder="搜索版本…"
              aria-label="搜索版本"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={creating}
              onClick={() => void onCreate()}
            >
              {creating ? '…' : '新建'}
            </button>
          </div>

          <ul className="jh-resume-list">
            {shown.map((item) => {
              const issues = issuesById[item.id]
              const active = selected === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`jh-resume-item${active ? ' jh-resume-item-active' : ''}`}
                    data-resume-id={item.id}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => pick(item.id)}
                  >
                    <span className="jh-resume-item-top">
                      <span className="jh-resume-name">{item.name}</span>
                      {item.isDefault ? <i className="jh-badge-on">启用中</i> : null}
                    </span>
                    <span className="jh-resume-sub">
                      {item.direction || '未填方向'} · {RESUME_LANGUAGE_LABEL[item.language]}
                      {/* 不再把 state 印在这里：`state==='active'` 只表示"没归档"，
                          而"启用中"是 isDefault —— 两个概念混着写会让人以为每份都启用了
                          （实测就这样：6 张卡副行全是「启用中」，徽章却只有一个）。 */}
                      {item.state === 'archived' ? ' · 已归档' : ''}
                    </span>
                    <span className="jh-resume-chips">
                      {/* 只显示非零项：一串「技能 0 · 经历 0」是纯噪音 */}
                      {item.counts.skills > 0 ? <i className="jh-chip">技能 {item.counts.skills}</i> : null}
                      {item.counts.experiences > 0 ? (
                        <i className="jh-chip">经历 {item.counts.experiences}</i>
                      ) : null}
                      {item.counts.projects > 0 ? <i className="jh-chip">项目 {item.counts.projects}</i> : null}
                      {item.counts.files > 0 ? <i className="jh-chip">附件 {item.counts.files}</i> : null}
                      {item.issues > 0 ? (
                        <i
                          className="jh-chip jh-chip-warn"
                          onMouseEnter={() => loadIssues(item.id)}
                          title={
                            issues === undefined
                              ? '鼠标停一下看是哪几项'
                              : issues.map((issue) => `${issue.level === 'error' ? '必改' : '建议'}：${issue.message}`).join('\n')
                          }
                        >
                          ⚠ 体检 {item.issues} 项
                        </i>
                      ) : null}
                      {item.counts.skills === 0 && item.counts.experiences === 0 && item.issues === 0 ? (
                        <i className="jh-chip jh-chip-quiet">还是空的</i>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && items.length > 0 ? (
              <li><p className="jh-muted">没有匹配「{query}」的版本。</p></li>
            ) : null}
          </ul>
        </aside>

        <section className="jh-resume-work">
          {selected === null ? (
            <p className="jh-muted">选左边一版简历开始编辑。</p>
          ) : (
            <ResumeWork
              key={String(selected)}
              id={selected}
              onChanged={props.onChanged}
              onDirtyChange={setDirty}
              onDeleted={() => {
                setSelected(null)
                setDirty(false)
                props.onChanged()
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}

/** 一版的完整编辑与附件操作。 */
function ResumeWork(props: {
  id: number
  onChanged: () => void
  onDirtyChange: (dirty: boolean) => void
  onDeleted: () => void
}) {
  const detail = useAsync((signal) => fetchResume(props.id, signal), [props.id])
  const [draft, setDraft] = useState<ResumeDto | null>(null)
  const [dirty, setDirty] = useState(false)
  // 默认「编辑」而不是「分屏」：实测面板宽 ~1184px 时工作区只有 ~872px，
  // 分屏会把编辑器压到 400px 出头（表单挤、A4 预览也要横向滚），
  // 而单独一栏 872px 正好放下 A4（794px）。要对比就点「分屏」，要看成品就点「预览」。
  const [mode, setMode] = useState<Mode>('edit')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [template, setTemplate] = useState<'concise' | 'professional'>('concise')

  /**
   * 分屏比例（百分比）＋拖拽。
   *
   * 同一个比例值服务两种排法：工作区宽时分左右（拖横条、`cursor: col-resize`），
   * 窄时上下堆叠（拖竖条）。**哪种排法由 container query 决定**，所以拖拽时先量一下
   * 计算出来的列数，而不是自己去猜断点 —— 否则窗口一改大小就会拖错方向。
   */
  const [split, setSplit] = useState(55)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const startDrag = (clientX: number, clientY: number): void => {
    const body = bodyRef.current
    if (body === null) return
    const rect = body.getBoundingClientRect()
    const sideBySide = getComputedStyle(body).gridTemplateColumns.trim().split(/\s+/).length > 1
    const move = (event: PointerEvent): void => {
      const ratio = sideBySide
        ? ((event.clientX - rect.left) / rect.width) * 100
        : ((event.clientY - rect.top) / rect.height) * 100
      setSplit(Math.min(80, Math.max(20, ratio)))
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  useEffect(() => {
    if (detail.state.status === 'ok') setDraft(detail.state.data)
  }, [detail.state])

  useEffect(() => {
    props.onDirtyChange(dirty)
  }, [dirty, props])

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
        setError(
          caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
        )
      } finally {
        setBusy(null)
      }
    },
    [props],
  )

  if (draft === null) {
    return detail.state.status === 'error' ? (
      <p className="jh-error">{detail.state.message}</p>
    ) : (
      <p className="jh-muted">正在读取…</p>
    )
  }

  const content = draft.content
  /** 所有表单改动都只是改本地草稿；**显式点保存**才落库（简历是资产，不做自动保存）。 */
  const patchContent = (next: ResumeContent): void => {
    setDraft({ ...draft, content: next })
    setDirty(true)
  }
  const patchBasics = (patch: Partial<ResumeContent['basics']>): void => {
    patchContent({ ...content, basics: { ...content.basics, ...patch } })
  }

  const save = (): void => {
    void run(
      '保存',
      async () => await updateResume(props.id, {
        name: draft.name,
        direction: draft.direction,
        language: draft.language,
        content: draft.content,
      }),
      (result) => {
        const resume = result as ResumeDto
        setDraft(resume)
        setDirty(false)
        return `已保存（rev ${String(resume.rev)}）—— 之前算过的匹配分已标记为过期`
      },
    )
  }

  return (
    <>
      <header className="jh-work-head">
        {/* 标题直接可改：回车即保存 —— 文档类工具里"点标题改名"是肌肉记忆 */}
        <input
          className="jh-input jh-editable"
          aria-label="版本名"
          title="点击改名，回车保存"
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value })
            setDirty(true)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (dirty) save()
          }}
        />
        <span className="jh-info-icon" aria-hidden="true">✎</span>
        {dirty ? <span className="jh-chip jh-chip-dirty">有未保存的改动</span> : null}
        <div className="jh-work-actions">
          {draft.isDefault ? (
            <span className="jh-badge">当前启用</span>
          ) : (
            <button
              type="button"
              className="jh-btn jh-btn-inline"
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
            onClick={() => void run('复制', async () => await duplicateResume(props.id), () => '已复制一份，可在左侧选择')}
          >
            复制
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm('删除这一版简历？它的附件记录会一起删掉，不能撤销。')) return
              void run('删除', async () => await deleteResume(props.id), () => '已删除')
              props.onDeleted()
            }}
          >
            删除
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-info"
            disabled={busy !== null || dirty}
            title={dirty ? '导出渲染的是已保存的内容 —— 先点「保存」' : '按当前模板导出 A4 PDF'}
            onClick={() => void run('导出 PDF', async () => await exportResume(props.id, { format: 'pdf', template }), () => 'PDF 已生成')}
          >
            导出 PDF
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={busy !== null || dirty}
            title={dirty ? '导出渲染的是已保存的内容 —— 先点「保存」' : '按当前模板导出 Word'}
            onClick={() => void run('导出 Word', async () => await exportResume(props.id, { format: 'docx', template }), () => 'Word 已生成')}
          >
            导出 Word
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-primary"
            disabled={busy !== null || !dirty}
            onClick={save}
          >
            {busy === '保存' ? '保存中…' : '保存'}
          </button>
        </div>
      </header>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}

      {/* 体检结果放在**编辑区顶部**：它指导的是"改表单"，不是"看预览"。
          没有问题时不占版面 —— 一行"没有发现问题"既没用又占地方，
          功能（体检本身）保留：有问题照样在这里逐条列出来。 */}
      {issues.length === 0 ? null : (
        <div className={`jh-alert ${issues.some((issue) => issue.level === 'error') ? 'jh-alert-error' : 'jh-alert-warn'}`}>
          <div className="jh-alert-head">
            <span className="jh-alert-title">体检：{issues.length} 项待处理</span>
          </div>
          <ul className="jh-issues">
            {issues.map((issue, index) => (
              <li key={`${issue.at}-${String(index)}`}>
                <b>{issue.level === 'error' ? '必改' : '建议'}</b> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="jh-work-modes">
        <div className="jh-modes" role="tablist" aria-label="视图模式">
          {(
            [['edit', '编辑'], ['split', '分屏'], ['preview', '预览'], ['files', '附件']] as Array<[Mode, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={`jh-mode${mode === key ? ' jh-mode-active' : ''}`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="jh-muted">
          {mode === 'edit' ? '先把内容填完整；单条成果按回车可以接着加一条。' : null}
          {mode === 'split' ? '拖动中间那条灰条可以调整上下比例。' : null}
          {mode === 'preview' ? '导出正在看的这一版。' : null}
          {mode === 'files' ? '这一版生成过的附件都在这儿 —— 只有你显式删除才会消失。' : null}
        </span>
      </div>

      <div className={`jh-work-body jh-mode-${mode}`} ref={bodyRef} style={{ '--jh-split': `${String(split)}%` } as CSSProperties}>
        <div className="jh-work-editor">
          {/* ── 基本信息 ─────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head"><h3>基本信息</h3></div>
            <div className="jh-grid2">
              <label className="jh-field">
                <span>姓名</span>
                <input className="jh-input" value={content.basics.name} placeholder="张三"
                  onChange={(event) => patchBasics({ name: event.target.value })} />
              </label>
              <label className="jh-field">
                <span>目标岗位</span>
                <input className="jh-input" value={content.basics.title} placeholder="Java 后端工程师"
                  onChange={(event) => patchBasics({ title: event.target.value })} />
              </label>
            </div>
            <div className="jh-grid3">
              <label className="jh-field">
                <span>城市</span>
                <input className="jh-input" value={content.basics.city ?? ''} placeholder="深圳"
                  onChange={(event) => patchBasics({ city: event.target.value === '' ? undefined : event.target.value })} />
              </label>
              <label className="jh-field">
                <span>工作年限</span>
                <input className="jh-input" type="number" min="0" value={content.basics.years ?? ''} placeholder="5"
                  onChange={(event) => patchBasics({ years: event.target.value === '' ? undefined : Number(event.target.value) })} />
              </label>
              <label className="jh-field">
                <span>年龄（可留空）</span>
                <input className="jh-input" type="number" min="0" value={content.basics.age ?? ''} placeholder="—"
                  onChange={(event) => patchBasics({ age: event.target.value === '' ? undefined : Number(event.target.value) })} />
              </label>
            </div>
            <div className="jh-grid2">
              <label className="jh-field">
                <span>手机</span>
                <input className="jh-input" value={content.basics.phone ?? ''} placeholder="138…"
                  onChange={(event) => patchBasics({ phone: event.target.value === '' ? undefined : event.target.value })} />
              </label>
              <label className="jh-field">
                <span>邮箱</span>
                <input className="jh-input" value={content.basics.email ?? ''} placeholder="you@example.com"
                  onChange={(event) => patchBasics({ email: event.target.value === '' ? undefined : event.target.value })} />
              </label>
            </div>
            <p className="jh-info">
              <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
              <span>
                <InlineMd text="手机与邮箱在**发给模型之前会被摘掉**，只在导出与预览里出现。" />
              </span>
            </p>
          </section>

          {/* ── 个人简介 ─────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head"><h3>个人简介</h3></div>
            <textarea className="jh-textarea" rows={5} value={content.summary}
              placeholder="三五句话：做什么方向、几年、最拿得出手的一件事。"
              onChange={(event) => patchContent({ ...content, summary: event.target.value })} />
          </section>

          {/* ── 技能 ─────────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head">
              <h3>技能</h3>
              <span className="jh-spacer" />
              <span className="jh-muted">回车或「、」确认一个</span>
            </div>
            <ChipsEditor
              values={content.skills.map((skill) => skill.name)}
              placeholder="Java、MySQL…"
              onChange={(names) =>
                patchContent({
                  ...content,
                  // 只改名字不该把原有的 level / years / evidence 丢掉
                  skills: names.map((name) => content.skills.find((skill) => skill.name === name) ?? { name }),
                })
              }
            />
            <p className="jh-info">
              <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
              <span>只写你真的能讲清楚的 —— 面试官会挑着问。</span>
            </p>
          </section>

          {/* ── 工作经历 ─────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head">
              <h3>工作经历</h3>
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() =>
                  patchContent({
                    ...content,
                    experiences: [
                      ...content.experiences,
                      { company: '', title: '', highlights: [''] },
                    ],
                  })
                }
              >
                ＋ 添加一段
              </button>
            </div>
            {content.experiences.length === 0 ? (
              <p className="jh-muted">还没有工作经历 —— 点下面的虚线框加第一段。</p>
            ) : null}
            {content.experiences.map((experience, index) => (
              <BlockCard
                key={`exp-${String(index)}`}
                label={`第 ${String(index + 1)} 段`}
                index={index}
                total={content.experiences.length}
                onMove={(delta) => patchContent({ ...content, experiences: move(content.experiences, index, delta) })}
                onRemove={() =>
                  patchContent({ ...content, experiences: content.experiences.filter((_, i) => i !== index) })
                }
              >
                <div className="jh-grid2">
                  <label className="jh-field">
                    <span>公司</span>
                    <input className="jh-input" value={experience.company} placeholder="某某科技有限公司"
                      onChange={(event) => patchContent({
                        ...content,
                        experiences: content.experiences.map((item, i) =>
                          i === index ? { ...item, company: event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>职位</span>
                    <input className="jh-input" value={experience.title} placeholder="后端开发工程师"
                      onChange={(event) => patchContent({
                        ...content,
                        experiences: content.experiences.map((item, i) =>
                          i === index ? { ...item, title: event.target.value } : item),
                      })} />
                  </label>
                </div>
                <div className="jh-grid3">
                  <label className="jh-field">
                    <span>开始</span>
                    <input className="jh-input" value={experience.start ?? ''} placeholder="2021.03"
                      onChange={(event) => patchContent({
                        ...content,
                        experiences: content.experiences.map((item, i) =>
                          i === index ? { ...item, start: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>结束（留空 = 至今）</span>
                    <input className="jh-input" value={experience.end ?? ''} placeholder="至今"
                      onChange={(event) => patchContent({
                        ...content,
                        experiences: content.experiences.map((item, i) =>
                          i === index ? { ...item, end: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>城市</span>
                    <input className="jh-input" value={experience.city ?? ''} placeholder="深圳"
                      onChange={(event) => patchContent({
                        ...content,
                        experiences: content.experiences.map((item, i) =>
                          i === index ? { ...item, city: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                </div>
                <div className="jh-field">
                  <span>主要成果（一条一行，回车接着加）</span>
                  <LinesEditor
                    lines={experience.highlights}
                    placeholder="把订单接口 P99 从 800ms 降到 120ms：先定位慢 SQL，再改批量与缓存"
                    onChange={(highlights) => patchContent({
                      ...content,
                      experiences: content.experiences.map((item, i) =>
                        i === index ? { ...item, highlights } : item),
                    })}
                  />
                </div>
                <div className="jh-field">
                  <span>技术栈</span>
                  <ChipsEditor
                    values={experience.stack ?? []}
                    placeholder="Java、MySQL…"
                    onChange={(stack) => patchContent({
                      ...content,
                      experiences: content.experiences.map((item, i) =>
                        i === index ? { ...item, stack: stack.length === 0 ? undefined : stack } : item),
                    })}
                  />
                </div>
              </BlockCard>
            ))}
            <button
              type="button"
              className="jh-drop"
              onClick={() =>
                patchContent({
                  ...content,
                  experiences: [...content.experiences, { company: '', title: '', highlights: [''] }],
                })
              }
            >
              ＋ 添加工作经历
            </button>
          </section>

          {/* ── 项目经历 ─────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head">
              <h3>项目经历</h3>
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() =>
                  patchContent({ ...content, projects: [...content.projects, { name: '', highlights: [''] }] })
                }
              >
                ＋ 添加一项
              </button>
            </div>
            {content.projects.length === 0 ? <p className="jh-muted">没有也可以 —— 工作经历写清楚就够。</p> : null}
            {content.projects.map((project, index) => (
              <BlockCard
                key={`prj-${String(index)}`}
                label={`第 ${String(index + 1)} 项`}
                index={index}
                total={content.projects.length}
                onMove={(delta) => patchContent({ ...content, projects: move(content.projects, index, delta) })}
                onRemove={() => patchContent({ ...content, projects: content.projects.filter((_, i) => i !== index) })}
              >
                <div className="jh-grid2">
                  <label className="jh-field">
                    <span>项目名</span>
                    <input className="jh-input" value={project.name} placeholder="订单中台"
                      onChange={(event) => patchContent({
                        ...content,
                        projects: content.projects.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>你的角色 / 时间</span>
                    <input className="jh-input" value={project.role ?? ''} placeholder="后端负责人 · 2022.06–2023.01"
                      onChange={(event) => patchContent({
                        ...content,
                        projects: content.projects.map((item, i) =>
                          i === index ? { ...item, role: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                </div>
                <div className="jh-field">
                  <span>做了什么</span>
                  <LinesEditor
                    lines={project.highlights}
                    placeholder="拆了订单状态机，压测下 QPS 从 800 提到 2400"
                    onChange={(highlights) => patchContent({
                      ...content,
                      projects: content.projects.map((item, i) => (i === index ? { ...item, highlights } : item)),
                    })}
                  />
                </div>
                <div className="jh-field">
                  <span>技术栈</span>
                  <ChipsEditor
                    values={project.stack ?? []}
                    placeholder="Kafka、Redis…"
                    onChange={(stack) => patchContent({
                      ...content,
                      projects: content.projects.map((item, i) =>
                        i === index ? { ...item, stack: stack.length === 0 ? undefined : stack } : item),
                    })}
                  />
                </div>
              </BlockCard>
            ))}
            <button
              type="button"
              className="jh-drop"
              onClick={() =>
                patchContent({ ...content, projects: [...content.projects, { name: '', highlights: [''] }] })
              }
            >
              ＋ 添加项目经历
            </button>
          </section>

          {/* ── 教育经历 ─────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head">
              <h3>教育经历</h3>
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() => patchContent({ ...content, education: [...content.education, { school: '' }] })}
              >
                ＋ 添加一项
              </button>
            </div>
            {content.education.map((education, index) => (
              <BlockCard
                key={`edu-${String(index)}`}
                label={`第 ${String(index + 1)} 项`}
                index={index}
                total={content.education.length}
                onMove={(delta) => patchContent({ ...content, education: move(content.education, index, delta) })}
                onRemove={() => patchContent({ ...content, education: content.education.filter((_, i) => i !== index) })}
              >
                <div className="jh-grid3">
                  <label className="jh-field">
                    <span>学校</span>
                    <input className="jh-input" value={education.school}
                      onChange={(event) => patchContent({
                        ...content,
                        education: content.education.map((item, i) =>
                          i === index ? { ...item, school: event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>专业</span>
                    <input className="jh-input" value={education.major ?? ''}
                      onChange={(event) => patchContent({
                        ...content,
                        education: content.education.map((item, i) =>
                          i === index ? { ...item, major: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>学历</span>
                    <input className="jh-input" value={education.degree ?? ''} placeholder="本科"
                      onChange={(event) => patchContent({
                        ...content,
                        education: content.education.map((item, i) =>
                          i === index ? { ...item, degree: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                </div>
                <div className="jh-grid2">
                  <label className="jh-field">
                    <span>入学</span>
                    <input className="jh-input" value={education.start ?? ''} placeholder="2015.09"
                      onChange={(event) => patchContent({
                        ...content,
                        education: content.education.map((item, i) =>
                          i === index ? { ...item, start: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>毕业</span>
                    <input className="jh-input" value={education.end ?? ''} placeholder="2019.06"
                      onChange={(event) => patchContent({
                        ...content,
                        education: content.education.map((item, i) =>
                          i === index ? { ...item, end: event.target.value === '' ? undefined : event.target.value } : item),
                      })} />
                  </label>
                </div>
              </BlockCard>
            ))}
            <button
              type="button"
              className="jh-drop"
              onClick={() => patchContent({ ...content, education: [...content.education, { school: '' }] })}
            >
              ＋ 添加教育经历
            </button>
          </section>

          {/* ── 其他 ─────────────────────────────────────────────── */}
          <section className="jh-form-card">
            <div className="jh-form-head">
              <h3>其他（证书 / 竞赛 / 开源…）</h3>
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                onClick={() => patchContent({ ...content, extras: [...content.extras, { label: '', text: '' }] })}
              >
                ＋ 添加一条
              </button>
            </div>
            {content.extras.map((extra, index) => (
              <BlockCard
                key={`ext-${String(index)}`}
                label={`第 ${String(index + 1)} 条`}
                index={index}
                total={content.extras.length}
                onMove={(delta) => patchContent({ ...content, extras: move(content.extras, index, delta) })}
                onRemove={() => patchContent({ ...content, extras: content.extras.filter((_, i) => i !== index) })}
              >
                <div className="jh-grid2">
                  <label className="jh-field">
                    <span>标题</span>
                    <input className="jh-input" value={extra.label} placeholder="软考中级"
                      onChange={(event) => patchContent({
                        ...content,
                        extras: content.extras.map((item, i) =>
                          i === index ? { ...item, label: event.target.value } : item),
                      })} />
                  </label>
                  <label className="jh-field">
                    <span>说明</span>
                    <input className="jh-input" value={extra.text} placeholder="2023 · 系统集成项目管理工程师"
                      onChange={(event) => patchContent({
                        ...content,
                        extras: content.extras.map((item, i) =>
                          i === index ? { ...item, text: event.target.value } : item),
                      })} />
                  </label>
                </div>
              </BlockCard>
            ))}
            <button
              type="button"
              className="jh-drop"
              onClick={() => patchContent({ ...content, extras: [...content.extras, { label: '', text: '' }] })}
            >
              ＋ 添加一条
            </button>
          </section>

          <p className="jh-info">
            <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
            <span>附件只由你显式删除 —— 简历是资产，任何自动清理都不会碰它（{PLUGIN_ID}）。</span>
          </p>
        </div>

        <div
          className="jh-splitter"
          role="separator"
          aria-label="拖动调整编辑与预览的比例"
          aria-orientation="horizontal"
          tabIndex={0}
          title="拖动调整比例"
          onPointerDown={(event) => {
            event.preventDefault()
            startDrag(event.clientX, event.clientY)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') setSplit((value) => Math.max(20, value - 4))
            if (event.key === 'ArrowDown') setSplit((value) => Math.min(80, value + 4))
          }}
        />

        <div className="jh-work-preview">
          <div className="jh-preview-head">
            <select
              className="jh-select"
              aria-label="模板"
              value={template}
              onChange={(event) => setTemplate(event.target.value === 'professional' ? 'professional' : 'concise')}
            >
              {RESUME_TEMPLATES.map((item) => (
                <option key={item} value={item}>{RESUME_TEMPLATE_LABEL[item]}</option>
              ))}
            </select>
            <span className="jh-muted">
              <InlineMd text="预览与导出走**同一个渲染器**，模板即所见" />
            </span>
          </div>

          {/* 预览与真正导出走**同一个渲染器**：预览好看、导出走样是最难查的一类 bug */}
          <div className="jh-paper-stage">
            <iframe className="jh-paper" title="简历预览" src={previewUrl(props.id, template)} sandbox="" />
          </div>

        </div>

        {/* 附件从预览区里抽出来，单独一个子 tab（反馈：它挤在预览下面，与渲染无关） */}
        <div className="jh-work-files">
          <div className="jh-form-head">
            <h3>附件（{draft.files.length}）</h3>
            <span className="jh-spacer" />
            <span className="jh-muted">导出在右上角工具栏；这里负责打开与删除</span>
          </div>
          {draft.files.length === 0 ? (
            <p className="jh-muted">还没有生成附件。用右上角的「导出 PDF / 导出 Word」生成。</p>
          ) : (
            <ul className="jh-files">
              {draft.files.map((file) => (
                <li key={file.id} className="jh-file-row">
                  <span className={`jh-file-badge jh-file-${file.format}`}>{file.format.toUpperCase()}</span>
                  <span className="jh-file-main">
                    <a className="jh-link jh-file-name" href={fileUrl(file.id)} target="_blank" rel="noreferrer">
                      {file.fileName}
                    </a>
                    <span className="jh-muted jh-file-meta">
                      {(file.bytes / 1024).toFixed(0)} KB · {file.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    onClick={() => window.open(fileUrl(file.id), '_blank', 'noopener')}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline jh-btn-quiet"
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm(`删除附件「${file.fileName}」？不能撤销。`)) return
                      void run('删除附件', async () => await deleteFile(file.id), () => '附件已删除').then(() =>
                        detail.reload(),
                      )
                    }}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="jh-info">
            <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
            <span>删除这一版简历时，它的附件会一起删掉；除此之外没有任何自动清理会碰它们。</span>
          </p>
        </div>
      </div>
    </>
  )
}

/** 重复块的统一外壳：编号 + 上移/下移/删除。 */
function BlockCard(props: {
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
function LinesEditor(props: {
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
function ChipsEditor(props: {
  values: string[]
  placeholder: string
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
