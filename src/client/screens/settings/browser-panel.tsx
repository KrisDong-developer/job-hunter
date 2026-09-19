import {
  BROWSER_CLOSE_AFTER_RUN_MS,
  BROWSER_IDLE_DEFAULT_MIN,
  BROWSER_IDLE_MAX_MIN,
  BROWSER_IDLE_MIN_MIN,
} from '../../../shared/constants.js'
import type { SettingsDto } from '../../net/types.js'
import { FieldHint } from '../../ui/field-hint.js'
import { NumberField } from '../../ui/number-field.js'
import { Switch } from '../../ui/switch.js'
import type { SettingsPatch } from './config-panel.js'

export function BrowserPanel(props: {
  current: SettingsDto
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  const idleMinutes = current.browser.idleCloseMinutes
  const closeAfterRun = current.browser.closeAfterRun

  return (
    <>
      <h3 className="jh-section-title">浏览器</h3>
      {/* 「跑完那扇窗口就该消失」是一个**明确的开关**，不是让用户自己把分钟数改成 0 ——
          打开时下面那格被接管（实际时长见 idleCloseMsOf），所以这里把它置灰并说明。 */}
      <div className="jh-ctl">
        <span className="jh-field-label">
          每轮采集结束后关闭
          <FieldHint
            text={`打开后：一轮采集（含一轮里串行跑的多个方案）全部跑完，采集浏览器就自动关掉，不留在桌面上。代价是"连着点两次立即采集"时第二次要多花几秒重新打开浏览器 —— 登录态在磁盘上，不会丢。正在登录引导中或正在采集时绝不会被关掉。关掉它，才轮到下面的空闲时长说了算。`}
          />
        </span>
        <Switch
          checked={closeAfterRun}
          disabled={busy}
          label="每轮采集结束后关闭采集浏览器"
          onChange={(next) =>
            write(
              { browser: { closeAfterRun: next } },
              next
                ? `已改为：每轮采集结束后关闭采集浏览器（跑完约 ${String(BROWSER_CLOSE_AFTER_RUN_MS / 1000)} 秒后）。`
                : '已改为：采集结束后不自动关闭，改由空闲时长决定。',
            )
          }
        />
      </div>
      <div className="jh-ctl">
        <span className="jh-field-label">
          空闲后自动关闭
          <FieldHint
            text={`采集要复用你自己登录过的浏览器，所以它是 headful 的（你能看见那个窗口）。用完一直开着会占内存，所以空闲到点就自动关掉；下一次采集会重新打开，登录态在磁盘上、不会丢。填 0 表示不自动关闭。默认 ${String(BROWSER_IDLE_DEFAULT_MIN)} 分钟。上面那个开关打开时，这一格不起作用。`}
          />
        </span>
        <NumberField
          value={idleMinutes}
          min={BROWSER_IDLE_MIN_MIN}
          max={BROWSER_IDLE_MAX_MIN}
          unit="分钟"
          label="采集浏览器空闲多少分钟后自动关闭"
          disabled={busy || closeAfterRun}
          onCommit={(next) =>
            write(
              { browser: { idleCloseMinutes: next } },
              next <= 0
                ? '已改为：浏览器空闲后不自动关闭。'
                : `已改为：浏览器空闲 ${String(next)} 分钟后自动关闭。`,
            )
          }
        />
      </div>
      <p className="jh-note">
        {closeAfterRun
          ? `当前：每轮采集结束后关闭（跑完约 ${String(BROWSER_CLOSE_AFTER_RUN_MS / 1000)} 秒；上面的空闲时长此刻不起作用）。`
          : idleMinutes <= 0
            ? '当前：不自动关闭 —— 浏览器会一直开着，直到你关掉它或卸载插件。'
            : `当前：空闲 ${String(idleMinutes)} 分钟后关闭。`}{' '}
        正在登录或正在采集时不会被关掉。
      </p>
    </>
  )
}
