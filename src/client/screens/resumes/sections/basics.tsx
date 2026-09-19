import type { ResumeContent } from '../../../../shared/domain/resume-content.js'
import { InlineMd } from '../../../ui/inline-md.js'
import { ChipsEditor } from '../editors.js'

export function BasicsSection(props: {
  content: ResumeContent
  patchContent: (next: ResumeContent) => void
  patchBasics: (patch: Partial<ResumeContent['basics']>) => void
}) {
  const { content, patchContent, patchBasics } = props

  return (
    <>
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
          aria-label="个人简介"
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
          label="新增技能标签"
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
    </>
  )
}
