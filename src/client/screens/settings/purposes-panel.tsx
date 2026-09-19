import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { FieldHint } from '../../ui/field-hint.js'
import { InlineMd } from '../../ui/inline-md.js'
import { Switch } from '../../ui/switch.js'
import type { SettingsPatch } from './config-panel.js'

/**
 * 用途分组（§15 的 14 项）。
 *
 * 这里只写**分组关系**，不写中文名 —— 名字一律用宿主给的 `derived.purposes[].label`，
 * 免得界面上出现第二份文案（与 SKIP_REASON_LABEL 同一条纪律）。
 * 键名用字面量而不是 import 宿主的 `AiPurpose`：客户端不该 import 宿主半的模块。
 */
const PURPOSE_GROUPS: Array<{ title: string; purposes: string[] }> = [
  { title: '匹配与解析', purposes: ['match_score', 'explain', 'jd_summary', 'resume_tailor'] },
  {
    title: '沟通与互动',
    purposes: ['greeting_draft', 'resume_tone_check', 'message_extract', 'reply_draft'],
  },
  {
    title: '辅助与决策',
    purposes: [
      'interview_prep',
      'mock_interview',
      'company_intel',
      'stage_extract',
      'offer_compare',
      'cover_letter',
    ],
  },
]

export function PurposesPanel(props: {
  current: SettingsDto
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  const masterOn = current.ai.enabled
  /** 不在上面三组里的用途（将来新增的）不能凭空消失 —— 兜到「其它」一组。 */
  const grouped = new Set(PURPOSE_GROUPS.flatMap((group) => group.purposes))
  const leftovers = current.derived.purposes
    .filter((item) => !grouped.has(item.purpose))
    .map((item) => item.purpose)
  const groups =
    leftovers.length === 0
      ? PURPOSE_GROUPS
      : [...PURPOSE_GROUPS, { title: '其它', purposes: leftovers }]

  return (
    <section className="jh-card">
      <h2 className="jh-card-title">模型用途</h2>

      <div className="jh-ctl">
        <span className="jh-field-label">
          模型总开关
          <FieldHint text="关掉之后一切走规则 / 模板降级，功能不会崩（J10）—— 只是不再外发任何字段。单项开关会保留着，重新打开总开关后按原样生效。" />
        </span>
        <Switch
          checked={masterOn}
          disabled={busy}
          label="模型总开关"
          onChange={(next) =>
            write(
              { ai: { enabled: next } },
              next
                ? '已开启模型 —— 按下面的单项开关执行。'
                : '已关闭模型 —— 全部用途降级为规则 / 模板。',
            )
          }
        />
      </div>

      {masterOn ? null : (
        <p className="jh-note">
          <InlineMd text="模型总开关已关闭：下面每一项现在都走规则 / 模板，不对外发送任何字段。单项开关**仍然可以改** —— 它们记的是你的意向，重新打开总开关后按这个意向生效。" />
        </p>
      )}

      {groups.map((group) => (
        <div className="jh-purpose-group" key={group.title}>
          <h3 className="jh-section-title">{group.title}</h3>
          <div className="jh-purpose-grid">
            {group.purposes.map((key) => {
              const item = current.derived.purposes.find((entry) => entry.purpose === key)
              if (item === undefined) return null
              // 单项开关显示的是**它自己的存档值**，不是"总开关与它的与"：
              // 总开关关着的时候仍然看得出"这一项本来是开的"。
              const on = current.ai.purposes[key] !== false
              const byDefault = current.derived.defaults.purposes[key] !== false
              return (
                <label
                  key={key}
                  className="jh-purpose"
                  title={`${item.label}（${key}）· 出厂默认${byDefault ? '开' : '关'}`}
                >
                  <span className="jh-purpose-name">{item.label}</span>
                  {/* 总开关关着时**不**禁用：宿主那边 purposes 与 enabled 是独立持久化的
                      （`setConfig` 各写各的），点一下确实会存下来、开总开关时生效。
                      禁用反而更糟 —— disabled 控件会从 Tab 序与读屏里整个消失，
                      用户既看不到它、也不知道自己有什么被记住。状态靠 label 说明。
                      "出厂默认开/关"也放进可访问名里：它原先只在 title 上，
                      键盘与读屏用户永远拿不到（FieldHint 的由来就是同一个坑）。 */}
                  <Switch
                    checked={on}
                    disabled={busy}
                    label={`${item.label}（出厂默认${byDefault ? '开' : '关'}）${
                      masterOn ? '' : '，模型总开关已关闭，暂不生效'
                    }`}
                    onChange={(next) =>
                      write(
                        { ai: { purposes: { [key]: next } } },
                        `已${next ? '开启' : '关闭'}「${item.label}」。`,
                      )
                    }
                  />
                </label>
              )
            })}
          </div>
        </div>
      ))}

      <p className="jh-note">
        <InlineMd text="按**用途**分开开关：关掉哪一项，那一项就走规则 / 模板，其余不受影响。" />
        涉及简历内容的几项默认关着 —— 那会把简历发给模型，属于你应当显式同意的范围。
      </p>
    </section>
  )
}
