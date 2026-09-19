import type { ResumeContent } from '../../../../shared/domain/resume-content.js'
import { BlockCard, move } from '../editors.js'

export function EducationSection(props: {
  content: ResumeContent
  patchContent: (next: ResumeContent) => void
}) {
  const { content, patchContent } = props

  return (
    <>
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
    </>
  )
}
