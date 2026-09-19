import type { ResumeContent } from '../../../../shared/domain/resume-content.js'
import { BlockCard, ChipsEditor, LinesEditor, move } from '../editors.js'

export function ExperienceSection(props: {
  content: ResumeContent
  patchContent: (next: ResumeContent) => void
}) {
  const { content, patchContent } = props

  return (
    <>
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
            <label className="jh-field">
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
            </label>
            <label className="jh-field">
              <span>技术栈</span>
              <ChipsEditor
                values={experience.stack ?? []}
                label="新增工作经历技术栈"
                placeholder="Java、MySQL…"
                onChange={(stack) => patchContent({
                  ...content,
                  experiences: content.experiences.map((item, i) =>
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
            patchContent({
              ...content,
              experiences: [...content.experiences, { company: '', title: '', highlights: [''] }],
            })
          }
        >
          ＋ 添加工作经历
        </button>
      </section>
    </>
  )
}
