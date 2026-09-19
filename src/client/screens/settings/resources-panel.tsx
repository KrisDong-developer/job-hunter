import { CRAWL_ROUND_BUDGET_DEFAULT_MIN, CRAWL_ROUND_BUDGET_MAX_MIN, CRAWL_ROUND_BUDGET_MIN_MIN } from '../../../shared/config/crawl.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { FieldHint } from '../../ui/field-hint.js'
import { NumberField } from '../../ui/number-field.js'
import { BrowserPanel } from './browser-panel.js'
import type { SettingsPatch } from './config-panel.js'

/**
 * 「运行资源」—— 浏览器与采集节奏。
 *
 * 为什么单独一张卡，而不是继续挂在「系统控制中心」下面：这两组是**资源设置**，
 * 与闸门讲的不是同一件事 —— DTO 里也明确写着"资源设置，**不是**闸门配置"
 * （见 `SettingsDto.browser` / `.crawl` 的注释）。原先它们嵌在闸门那张卡里，
 * 于是"让浏览器跑完就关掉"这件与安全无关的事，要在"系统控制中心"里找。
 * 拆出来之后卡片名与 DTO 的分组是同一件事，分区名也就不用再拿"安全"去盖住它们。
 */
export function ResourcesPanel(props: {
  current: SettingsDto
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  const roundBudgetMinutes = current.crawl.roundBudgetMinutes

  return (
    <section className="jh-card">
      <h2 className="jh-card-title">运行资源</h2>

      <BrowserPanel current={current} busy={busy} write={write} />

      <h3 className="jh-section-title">采集节奏</h3>
      {/* 单轮预算：一轮 = 一个方案的一次运行（含多关键词逐个 + 新岗位详情补抓）。
          到点后**不再开始新的平台/关键词**，正在跑的那一页跑完就停 —— 如实记
          aborted，已解析到的照常入库。 */}
      <div className="jh-ctl">
        <span className="jh-field-label">
          单轮采集最多跑多久
          <FieldHint
            text={`一轮 = 一个方案的一次运行；多关键词方案会逐个关键词跑，新岗位还会逐条点进详情页，所以耗时随配置放大。到点后**不再开始**新的平台或关键词（正在跑的那一页跑完就停），已抓到的照常入库，剩下的留到下一轮并按「本轮已到时限」如实显示。默认 ${String(CRAWL_ROUND_BUDGET_DEFAULT_MIN)} 分钟。这不是节流阀，是保险丝 —— 对应用户能接受的"点一下最多等多久"。`}
          />
        </span>
        <NumberField
          value={roundBudgetMinutes}
          min={CRAWL_ROUND_BUDGET_MIN_MIN}
          max={CRAWL_ROUND_BUDGET_MAX_MIN}
          unit="分钟"
          label="单轮采集最多跑多少分钟"
          disabled={busy}
          onCommit={(next) =>
            write(
              { crawl: { roundBudgetMinutes: next } },
              `已把单轮采集预算改为 ${String(next)} 分钟（下一轮开始生效）。`,
            )
          }
        />
      </div>
      <p className="jh-note">
        当前：一轮最多 {String(roundBudgetMinutes)} 分钟。改完不用重启，下一轮就地生效。
      </p>
    </section>
  )
}
