// ── 配置页 ────────────────────────────────────────────────────────────

import { riskStory } from '../../format/risk-story.js'
import type { updateSettings } from '../../net/ops.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { GuardPanel } from './guard-panel.js'
import { PurposesPanel } from './purposes-panel.js'

export type SettingsPatch = Parameters<typeof updateSettings>[0]

export function ConfigPanel(props: {
  current: SettingsDto | null
  error: string | null
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  if (props.error !== null) {
    return (
      <div className="jh-set-wrap">
        <section className="jh-card">
          <p className="jh-error">{props.error}</p>
        </section>
      </div>
    )
  }
  if (current === null) {
    return (
      <div className="jh-set-wrap">
        <section className="jh-card">
          <p className="jh-muted">正在读取设置…</p>
        </section>
      </div>
    )
  }

  const story = riskStory(current)

  return (
    <div className="jh-set-wrap">
      {/* 散在下面五处的开关，先收成一句"现在到底会怎么发" ——
          与采集页「调度归属那一句话」同一个定位（同一件事只有一个说法）。 */}
      <section className="jh-card">
        <h2 className="jh-card-title">当前风控态势</h2>
        <p className={`jh-story ${story.tone}`}>{story.text}</p>
      </section>
      <div className="jh-set-grid">
        {/* ── 模型用途 ─────────────────────────────────────────────── */}
        <PurposesPanel current={current} busy={busy} write={write} />
        {/* ── 系统控制中心（原「安全闸门」+「浏览器」）──────────────── */}
        <GuardPanel current={current} busy={busy} write={write} />
      </div>
    </div>
  )
}
