import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { PLUGIN_ID } from '../../../shared/constants.js'
import { RESUME_TEMPLATES } from '../../../shared/enums.js'
import { RESUME_TEMPLATE_LABEL } from '../../../shared/labels.js'
import type { ResumeContent, ResumeDto, ResumeIssue } from '../../../shared/resume.js'
import { ApiError } from '../../net/client.js'
import { deleteFile, deleteResume, duplicateResume, exportResume, fetchResume, fileUrl, previewUrl, setDefaultResume, updateResume } from '../../net/resumes.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { InlineMd } from '../../ui/inline-md.js'
import { useAsync } from '../../hooks/use-async.js'
import { EnglishCheckPanel } from './english-check-panel.js'
import { BasicsSection } from './sections/basics.js'
import { EducationSection } from './sections/education.js'
import { ExperienceSection } from './sections/experience.js'
import { OtherSection } from './sections/other.js'
import { ProjectsSection } from './sections/projects.js'

type Mode = 'edit' | 'split' | 'preview' | 'files'

/** 一版的完整编辑与附件操作。 */
export function ResumeWork(props: {
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
      <ErrorLine>{detail.state.message}</ErrorLine>
    ) : (
      <LoadingLine>正在读取…</LoadingLine>
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
      {/* <div> 而不是 <header>：它落在 .jh-resume-work（section）内，
         会额外形成一个作用域化的 banner landmark（实测这一屏 banner × 2）。视觉零变化。 */}
      <div className="jh-work-head">
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
      </div>

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

      {/* M1：英文体检（**只检查，不翻译**）。只有英文版本才有意义 ——
          "用动词开头 / 别写年龄婚育"这几条对中文简历不成立。
          接口和面板一直都在，只是从来没挂到界面上过（复核时发现的死代码）。 */}
      {draft.language !== 'en' ? null : (
        <div className="jh-card jh-card-tight">
          <h3 className="jh-card-title">英文体检</h3>
          <EnglishCheckPanel resumeId={props.id} />
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
          <BasicsSection content={content} patchContent={patchContent} patchBasics={patchBasics} />

          <ExperienceSection content={content} patchContent={patchContent} />

          <ProjectsSection content={content} patchContent={patchContent} />

          <EducationSection content={content} patchContent={patchContent} />

          <OtherSection content={content} patchContent={patchContent} />

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
