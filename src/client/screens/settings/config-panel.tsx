// ── 配置页 ────────────────────────────────────────────────────────────

import { riskStory } from '../../format/risk-story.js'
import type { updateSettings } from '../../net/ops.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { GuardPanel } from './guard-panel.js'
import { PurposesPanel } from './purposes-panel.js'
import { ResourcesPanel } from './resources-panel.js'

export type SettingsPatch = Parameters<typeof updateSettings>[0]

/**
 * 三张卡，两栏网格（窄了就一列）：
 *   * 「模型用途」—— 按业务分组的三列开关；
 *   * 「系统控制中心」—— 闸门（发送分层 / 额度 / 时段 / 审批审计）；
 *   * 「运行资源」—— 浏览器与采集节奏。
 *
 * 为什么把「浏览器」「采集节奏」从「系统控制中心」里拆出来：它们是**资源设置**，
 * DTO 里 `browser` / `crawl` 与 `guard` 同级、并明确写着"**不是**闸门配置"。
 * 混在一张卡里，用户想"让浏览器跑完就关掉"得先去一张叫"安全"的卡片里找。
 * 拆出来之后 DOM 顺序 = 视觉顺序 = DTO 的分组，三者说的是同一件事。
 * （网格里的落位：左列 模型用途 → 运行资源，右列 系统控制中心。`align-items:start`
 * 让两列各自堆叠，不互相拉高。）
 */
export function ConfigPanel(props: {
  current: SettingsDto | null
  error: string | null
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  /**
   * **只在从来没读到过设置时**才让整块让位给提示。
   *
   * 这里以前是"`error` 有值就只渲染错误、`current` 为 null 就只渲染"正在读取"。后果是
   * 每次写入（写入后必须回读）整张表单都会卸载再重建一次 —— 拨一个开关，八个开关加五个
   * 数字框一起消失又出现，键盘焦点丢回文档开头。现在由 `SettingsScreen` 保证"有旧值就
   * 一直给旧值"，所以走到这个分支只有一种情况：首屏还没读到、或者首屏就读失败。
   */
  if (current === null) {
    return (
      <section className="jh-card">
        {props.error === null ? (
          <p className="jh-muted">正在读取设置…</p>
        ) : (
          <p className="jh-error" role="alert">
            {props.error}
          </p>
        )}
      </section>
    )
  }

  const story = riskStory(current)

  return (
    // `.jh-set-wrap` 是容器查询的上下文（见 styles/screens/settings.ts）——
    // 两栏网格的断点判定的是**这一块**有多宽，不是窗口有多宽。
    // 它带 containment，所以只能包住配置页（这一页没有 position:absolute 的弹窗层）；
    // 日志页与数据页都有（抽屉 / 清理确认弹窗），那两页不套这个类。
    <div className="jh-set-wrap">
      {/* 首屏成功、后续回读失败：表单照常渲染（数据是旧的），失败原因另起一条说清。 */}
      {props.error === null ? null : (
        <div className="jh-alert jh-alert-error" role="alert">
          <p className="jh-alert-body">
            {props.error}
            <br />
            下面显示的是「上一次成功读到的」设置，可能已经和服务端不一致。
          </p>
        </div>
      )}
      {/* 散在下面五处的开关，先收成一句"现在到底会怎么发" ——
          与采集页「调度归属那一句话」同一个定位（同一件事只有一个说法）。 */}
      <section className="jh-card">
        <h2 className="jh-card-title">当前风控态势</h2>
        <p className={`jh-story ${story.tone}`}>{story.text}</p>
      </section>
      <div className="jh-set-grid">
        <PurposesPanel current={current} busy={busy} write={write} />
        <GuardPanel current={current} busy={busy} write={write} />
        <ResourcesPanel current={current} busy={busy} write={write} />
      </div>
    </div>
  )
}
