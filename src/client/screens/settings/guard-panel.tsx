import { CRAWL_ROUND_BUDGET_DEFAULT_MIN, CRAWL_ROUND_BUDGET_MAX_MIN, CRAWL_ROUND_BUDGET_MIN_MIN } from '../../../shared/config/crawl.js'
import { parseWindow } from '../../../shared/text/time-format.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { FieldHint } from '../../ui/field-hint.js'
import { InlineMd } from '../../ui/inline-md.js'
import { NumberField } from '../../ui/number-field.js'
import { Switch } from '../../ui/switch.js'
import { BrowserPanel } from './browser-panel.js'
import type { SettingsPatch } from './config-panel.js'

/**
 * 界面侧的取值范围。
 *
 * 宿主**不校验** guard 的数值（`writeGuardConfig` 原样落库），所以边界只能定在这里：
 * 这不是替宿主立规则，而是挡住明显的笔误（把每日额度打成 20000）。
 * 上限刻意给得比平台侧限额松 —— 闸门里"用户额度"与"平台上限"取**较小者**，
 * 所以设大了只会被平台上限兜住，不会绕过平台红线。
 */
const GUARD_LIMITS = {
  daily: { min: 0, max: 500 },
  cooldownMinutes: { min: 0, max: 7 * 24 * 60 },
  batchLimit: { min: 1, max: 50 },
} as const

export function GuardPanel(props: {
  current: SettingsDto
  busy: boolean
  write: (patch: SettingsPatch, okText: string) => void
}) {
  const { current, busy, write } = props

  const setLevel = (
    key: 'l3Greeting' | 'l4Application' | 'l4Reply',
    label: string,
    next: boolean,
  ): void => {
    write({ guard: { levels: { [key]: next } } }, `已${next ? '开启' : '关闭'}「${label}」。`)
  }

  const setLimit = (bucket: 'greeting' | 'application' | 'reply', label: string, next: number): void => {
    write(
      { guard: { dailyLimits: { [bucket]: next } } },
      next <= 0
        ? `已把「${label}」的每日额度设为 0 —— 这一类动作今天一律会被闸门拒绝。`
        : `已把「${label}」的每日额度改为 ${String(next)} 条（每个平台）。`,
    )
  }

  const setGuardNumber = (
    key: 'cooldownMinutes' | 'batchLimit',
    label: string,
    unit: string,
    next: number,
  ): void => {
    write({ guard: { [key]: next } }, `已把「${label}」改为 ${String(next)} ${unit}。`)
  }

  const roundBudgetMinutes = current.crawl.roundBudgetMinutes

  /**
   * 发送时段。`''` 在配置里的含义是"不限时段"，此时两个 time 输入显示**出厂默认**
   * 作为建议值，改其中任何一格就会启用它 —— 不必再加一个"启用/停用"开关，
   * 也不会因为来回切换丢掉用户填过的值（配置里本来就只有一根字符串）。
   * 默认值来自宿主下发的 `derived.defaults`，客户端不另写一份。
   */
  const windowRaw = current.guard.sendWindow.trim()
  const parsedWindow = windowRaw === '' ? null : parseWindow(windowRaw)
  const defaultWindow = parseWindow(current.derived.defaults.guard.sendWindow)
  const windowStart = parsedWindow?.start ?? defaultWindow?.start ?? ''
  const windowEnd = parsedWindow?.end ?? defaultWindow?.end ?? ''
  const setWindow = (start: string, end: string): void => {
    // time 输入可以被键盘清空：不写半截值（写进去是一段解析不了的窗口，闸门会 fail-closed）
    if (start === '' || end === '') return
    write({ guard: { sendWindow: `${start}-${end}` } }, `已把发送时段改为 ${start}-${end}（本地时间）。`)
  }

  const defaults = current.derived.defaults.guard

  return (
    <section className="jh-card">
      <h2 className="jh-card-title">系统控制中心</h2>

      <h3 className="jh-section-title">发送分层（L3 / L4）</h3>
      <div className="jh-ctl">
        <span className="jh-field-label">
          L3 打招呼
          <FieldHint text="允许发出第一条打招呼消息。关掉之后，所有打招呼都会被闸门拒绝。出厂默认开。" />
        </span>
        <Switch
          checked={current.guard.levels.l3Greeting}
          disabled={busy}
          label="L3 打招呼"
          onChange={(next) => setLevel('l3Greeting', 'L3 打招呼', next)}
        />
      </div>
      <div className="jh-ctl">
        <span className="jh-field-label">
          L4 投递
          <FieldHint text="允许真的点下平台的「投递」按钮。默认关闭 —— 这是最不可逆的一步。" />
        </span>
        <Switch
          checked={current.guard.levels.l4Application}
          disabled={busy}
          label="L4 投递"
          onChange={(next) => setLevel('l4Application', 'L4 投递', next)}
        />
      </div>
      <div className="jh-ctl">
        <span className="jh-field-label">
          L4 回复
          <FieldHint text="允许回复 HR 发来的消息。默认关闭。" />
        </span>
        <Switch
          checked={current.guard.levels.l4Reply}
          disabled={busy}
          label="L4 回复"
          onChange={(next) => setLevel('l4Reply', 'L4 回复', next)}
        />
      </div>

      <h3 className="jh-section-title">每日额度（每个平台）</h3>
      <div className="jh-limits">
        <label className="jh-limit">
          <span className="jh-field-label">打招呼</span>
          <NumberField
            value={current.guard.dailyLimits.greeting}
            min={GUARD_LIMITS.daily.min}
            max={GUARD_LIMITS.daily.max}
            unit="条"
            label="打招呼的每日额度"
            disabled={busy}
            onCommit={(next) => setLimit('greeting', '打招呼', next)}
          />
        </label>
        <label className="jh-limit">
          <span className="jh-field-label">投递</span>
          <NumberField
            value={current.guard.dailyLimits.application}
            min={GUARD_LIMITS.daily.min}
            max={GUARD_LIMITS.daily.max}
            unit="条"
            label="投递的每日额度"
            disabled={busy}
            onCommit={(next) => setLimit('application', '投递', next)}
          />
        </label>
        <label className="jh-limit">
          <span className="jh-field-label">回复</span>
          <NumberField
            value={current.guard.dailyLimits.reply}
            min={GUARD_LIMITS.daily.min}
            max={GUARD_LIMITS.daily.max}
            unit="条"
            label="回复的每日额度"
            disabled={busy}
            onCommit={(next) => setLimit('reply', '回复', next)}
          />
        </label>
      </div>
      <p className="jh-note">
        <InlineMd
          text={`额度是**你自己的预算**；闸门还会与平台侧上限取较小者 —— 所以调大不会绕过平台红线。填 0 表示这一类动作今天完全不做。出厂默认：打招呼 ${String(defaults.dailyLimits.greeting)} · 投递 ${String(defaults.dailyLimits.application)} · 回复 ${String(defaults.dailyLimits.reply)}。`}
        />
      </p>

      <h3 className="jh-section-title">发送时间与节奏</h3>
      {/* 这一行用 stack 而不是 .jh-ctl：两个 time 输入 + 按钮约 360px，
          两栏布局最窄那一档（容器 880px）横排会把"发送时段"挤成一列字 */}
      <div className="jh-ctl-stack">
        <span className="jh-field-label">
          发送时段
          <FieldHint
            text={`只在这个本地时间窗口内发送（支持跨午夜，如 22:00-06:00）。凌晨/深夜发消息是最强的机器信号之一，所以出厂默认限制在 ${defaults.sendWindow}。点「设为不限」表示任何时间都可以发。`}
          />
        </span>
        <div className="jh-timerange">
          <input
            type="time"
            className="jh-input jh-time"
            aria-label="发送时段开始"
            disabled={busy}
            value={windowStart}
            onChange={(event) => setWindow(event.target.value, windowEnd)}
          />
          <span className="jh-timerange-sep">至</span>
          <input
            type="time"
            className="jh-input jh-time"
            aria-label="发送时段结束"
            disabled={busy}
            value={windowEnd}
            onChange={(event) => setWindow(windowStart, event.target.value)}
          />
          {windowRaw === '' ? null : (
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-tiny"
              disabled={busy}
              onClick={() =>
                write({ guard: { sendWindow: '' } }, '已改为：不限发送时段（任何时间都可以发）。')
              }
            >
              设为不限
            </button>
          )}
        </div>
      </div>
      {windowRaw !== '' && parsedWindow === null ? (
        <div className="jh-alert jh-alert-warn">
          <p className="jh-alert-body">
            发送时段配置无法解析：<code>{windowRaw}</code> —— 闸门会 fail-closed，
            <b>所有发送都会被拒绝</b>。用上面两个时间框改回合法值，或点「设为不限」。
          </p>
        </div>
      ) : null}
      {windowRaw === '' ? (
        <p className="jh-note">
          当前：不限时段。上面两个框显示的是出厂默认时段 —— 改其中任何一格就会启用它。
        </p>
      ) : null}

      <div className="jh-ctl">
        <span className="jh-field-label">
          随机休息日
          <FieldHint
            text={`按天确定性命中：命中的那一天整体不发送，模拟"人不会天天投"的节奏。出厂默认 ${String(Math.round(defaults.dayOffProbability * 100))}%，填 0 表示取消。同一天里结论不会变（不是每次调用重掷），按整数百分比保存。`}
          />
        </span>
        <NumberField
          value={Math.round(current.guard.dayOffProbability * 100)}
          min={0}
          max={100}
          unit="%"
          label="随机休息日概率（百分比）"
          disabled={busy}
          onCommit={(next) =>
            write(
              { guard: { dayOffProbability: next / 100 } },
              next <= 0 ? '已取消随机休息日。' : `已把随机休息日概率改为 ${String(next)}%。`,
            )
          }
        />
      </div>

      <div className="jh-ctl">
        <span className="jh-field-label">
          冷却期
          <FieldHint
            text={`同一家公司在多少分钟内不允许重复投递。防误投与防风控，不建议设成 0。出厂默认 ${String(defaults.cooldownMinutes)} 分钟（24 小时）。`}
          />
        </span>
        <NumberField
          value={current.guard.cooldownMinutes}
          min={GUARD_LIMITS.cooldownMinutes.min}
          max={GUARD_LIMITS.cooldownMinutes.max}
          unit="分钟"
          label="同一公司重复投递的冷却期"
          disabled={busy}
          onCommit={(next) => setGuardNumber('cooldownMinutes', '冷却期', '分钟', next)}
        />
      </div>

      <h3 className="jh-section-title">审批、审计与模型上限</h3>
      <div className="jh-ctl">
        <span className="jh-field-label">
          高危动作必须审批
          <FieldHint text="高危动作（投递 / 回复 / 打招呼）是否必须先经你确认。模型不得修改这一项（§22.4）。" />
        </span>
        <Switch
          checked={current.guard.requireApproval}
          disabled={busy}
          label="高危动作必须审批"
          onChange={(next) =>
            write(
              { guard: { requireApproval: next } },
              next
                ? '已改为：高危动作必须审批。'
                : '已改为：高危动作不再二次确认 —— 请确认你了解这个后果。',
            )
          }
        />
      </div>
      <div className="jh-ctl">
        <span className="jh-field-label">
          审计留痕
          <FieldHint text="是否把所有动作写进审计表。模型不得关闭它（§22.4）。关掉之后额度的计数也就没了来源。" />
        </span>
        <Switch
          checked={current.guard.auditEnabled}
          disabled={busy}
          label="审计留痕"
          onChange={(next) =>
            write(
              { guard: { auditEnabled: next } },
              next ? '已开启审计留痕。' : '已关闭审计 —— 动作将不再留痕，额度计数也会失真。',
            )
          }
        />
      </div>

      <div className="jh-ctl">
        <span className="jh-field-label">
          批量上限
          <FieldHint
            text={`模型单次调用最多涉及多少个岗位（§22.4）。超出必须分批并逐批审批。出厂默认 ${String(defaults.batchLimit)} 个。`}
          />
        </span>
        <NumberField
          value={current.guard.batchLimit}
          min={GUARD_LIMITS.batchLimit.min}
          max={GUARD_LIMITS.batchLimit.max}
          unit="个"
          label="模型单次调用涉及的岗位数上限"
          disabled={busy}
          onCommit={(next) => setGuardNumber('batchLimit', '批量上限', '个岗位', next)}
        />
      </div>

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

      <p className="jh-note">
        <InlineMd text="模型**不能**修改这些键：" />
        {current.derived.modelForbidden.join(' / ')}
        ；模型能改的只有：{current.derived.modelEditable.join(' / ')}。这是硬编码的校验，不是约定。
      </p>
    </section>
  )
}
