import type { ResumeContent } from '../../../../shared/resume.js'
import { BlockCard, ChipsEditor, LinesEditor, move } from '../editors.js'

export function ProjectsSection(props: {
  content: ResumeContent
  patchContent: (next: ResumeContent) => void
}) {
  const { content, patchContent } = props

  return (
    <>
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
            <label className="jh-field">
              <span>做了什么</span>
              <LinesEditor
                lines={project.highlights}
                placeholder="拆了订单状态机，压测下 QPS 从 800 提到 2400"
                onChange={(highlights) => patchContent({
                  ...content,
                  projects: content.projects.map((item, i) => (i === index ? { ...item, highlights } : item)),
                })}
              />
            </label>
            <label className="jh-field">
              <span>技术栈</span>
              <ChipsEditor
                values={project.stack ?? []}
                label="新增项目技术栈"
                placeholder="Kafka、Redis…"
                onChange={(stack) => patchContent({
                  ...content,
                  projects: content.projects.map((item, i) =>
                    i === index ? { ...item, stack: stack.length === 0 ? undefined : stack } : item),
                })}
              />
            </label>
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
    </>
  )
}
