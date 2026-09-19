import type { ResumeContent } from '../../../../shared/domain/resume-content.js'
import { BlockCard, move } from '../editors.js'

export function OtherSection(props: {
  content: ResumeContent
  patchContent: (next: ResumeContent) => void
}) {
  const { content, patchContent } = props

  return (
    <>
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
    </>
  )
}
