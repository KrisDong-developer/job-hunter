import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ApiError,
  fetchAudit,
  fetchHealth,
  fetchLlmCalls,
  fetchSettings,
  revealDataDir,
  updateSettings,
  type AuditRecordDto,
  type HealthDto,
  type LlmCallDto,
  type SettingsDto,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { FieldHint } from '../field-hint.js'
import { Switch } from '../switch.js'
import { useAsync, type AsyncState } from '../use-async.js'
import { useDialogA11y } from '../use-dialog-a11y.js'
import { DataPanel } from './settings/data-panel.js'
import {
  BROWSER_CLOSE_AFTER_RUN_MS,
  BROWSER_IDLE_DEFAULT_MIN,
  BROWSER_IDLE_MAX_MIN,
  BROWSER_IDLE_MIN_MIN,
  CRAWL_ROUND_BUDGET_DEFAULT_MIN,
  CRAWL_ROUND_BUDGET_MAX_MIN,
  CRAWL_ROUND_BUDGET_MIN_MIN,
} from '../../shared/constants.js'

/**
 * U10 设置 + U11 日志与诊断（§5.4）。
 *
 * 这两块原来只有 HTTP 接口，界面上够不着 —— 而"模型用途开关"与"我发了什么给模型"
 * 恰恰是最需要被用户看见的两件事（I5 知情同意）。
 *
 * 一条硬约束直接在界面上写出来：**额度、审批开关、审计开关模型不能改**（§22.4 禁止项）。
 * 所以那几项写明是谁在管 —— 但它们**用户能改**（`guardToken.actor === 'gui'` 时才放行），
 * 所以界面上是真控件，不是读数。
 *
 * ## 2026-09-18 重排（界面评审：空间利用率低 / 功能区混杂 / 文本代替控件）
 *
 * 原实现把 6 个平级模块纵向排成一列：宽屏下右侧一大片空白，找"关掉某个用途"
 * 要先滚过整屏日志，而"开 / 关"与"打招呼 20 · 投递 10 · 回复 30"都只是**文字**。
 * 现在拆成两个标签页：
 *   * 「模型与安全配置」—— 模型用途（按业务分组的三列开关）+ 系统控制中心
 *     （发送分层 / 额度 / 审批审计 / 浏览器），两栏响应式网格；
 *   * 「诊断与调用日志」—— 指标卡 + 数据文件 + 模型调用留痕 + 操作审计。
 */

type SettingsPatch = Parameters<typeof updateSettings>[0]

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

type SettingsTab = 'config' | 'logs' | 'data'

const SETTINGS_TABS: Array<[SettingsTab, string]> = [
  ['config', '模型与安全配置'],
  ['logs', '诊断与调用日志'],
  // 第三个分区（§18 / J8）：保留期、磁盘占用、清理、导出导入。
  // 为什么不塞进「诊断」：那一屏回答"出问题时怎么自查"，这一屏回答"我的数据现在多大、
  // 能不能搬走" —— 使用时机不同（前者出事才看，后者隔几个月看一次），放一起会互相干扰。
  ['data', '数据与存储'],
]

/**
 * 把一段文本写进剪贴板。返回是否成功 —— 调用方负责如实提示。
 *
 * 单独抽出来是因为现在有两个调用点（数据文件路径、留痕 JSON），
 * 而"复制失败要说话"这条纪律必须两边一致：按钮点了没反应比报错更让人怀疑界面坏了。
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 发送时段的解析。**只用于渲染，不用于判定**。
 *
 * 宿主 `parseSendWindow` 才是权威：窗口是否生效、现在是否在窗口内，都由它说了算。
 * 客户端需要自己的解析只有一个原因 —— 要用两个 `<input type="time">` 呈现它，
 * 而 time 输入只认 `HH:MM`。所以这里刻意**不**做"现在能不能发"的判断：
 * 同一套闸门逻辑出现第二份实现，两边迟早会对不上（本项目已经因此吃过亏）。
 */
function parseWindow(raw: string): { start: string; end: string } | null {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (match === null) return null
  const startHour = Number(match[1] ?? '')
  const startMin = Number(match[2] ?? '')
  const endHour = Number(match[3] ?? '')
  const endMin = Number(match[4] ?? '')
  if (!Number.isFinite(startHour + startMin + endHour + endMin)) return null
  if (startHour > 23 || endHour > 23 || startMin > 59 || endMin > 59) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  return { start: `${pad(startHour)}:${pad(startMin)}`, end: `${pad(endHour)}:${pad(endMin)}` }
}

/**
 * 「当前风控态势」一句话 —— 与采集页 `.jh-story` 同一个定位（同一件事只有一个说法）。
 *
 * 只陈述**配置事实**，不预测"现在能不能发"：窗口是否命中、今天是不是休息日，
 * 那是闸门的判断，客户端再算一遍就是第二份实现。这里只把散在五六处的开关收成一句，
 * 回答"我这一屏到底调成了什么样"。
 */
function riskStory(current: SettingsDto): { text: string; tone: string } {
  const { levels, dailyLimits, cooldownMinutes, requireApproval, auditEnabled } = current.guard
  const windowRaw = current.guard.sendWindow.trim()
  const allowed: string[] = []
  if (levels.l3Greeting) allowed.push('打招呼')
  if (levels.l4Application) allowed.push('投递')
  if (levels.l4Reply) allowed.push('回复')

  const parts: string[] = []
  if (allowed.length === 0) {
    parts.push('三个发送分层全关着 —— 这个工具一步都不会替你发出去')
  } else {
    parts.push(`允许发送：${allowed.join(' / ')}`)
    parts.push(
      `每天每平台 打招呼 ${String(dailyLimits.greeting)} · 投递 ${String(dailyLimits.application)} · 回复 ${String(dailyLimits.reply)}`,
    )
    if (windowRaw === '') parts.push('不限发送时段')
    else if (parseWindow(windowRaw) === null) parts.push(`发送时段配置无法解析：「${windowRaw}」—— 闸门会拒绝所有发送`)
    else parts.push(`发送时段 ${windowRaw}（本地时间）`)
    parts.push(
      current.guard.dayOffProbability > 0
        ? `随机休息日 ${String(Math.round(current.guard.dayOffProbability * 100))}%`
        : '没有随机休息日',
    )
    parts.push(cooldownMinutes > 0 ? `同公司冷却 ${String(cooldownMinutes)} 分钟` : '没有冷却期')
  }
  parts.push(requireApproval ? '高危动作需你确认' : '高危动作不再二次确认')
  parts.push(auditEnabled ? '审计已开' : '审计已关（额度计数会失真）')
  if (!current.ai.enabled) parts.push('模型已关（全部走规则 / 模板）')

  // 需要用户马上注意的三件事：发不出去、不可逆动作无人把关、出事了没有留痕。
  const needsAttention =
    allowed.length === 0 ||
    !requireApproval ||
    !auditEnabled ||
    (windowRaw !== '' && parseWindow(windowRaw) === null)
  return { text: `${parts.join('；')}。`, tone: needsAttention ? 'jh-story-warn' : 'jh-story-ok' }
}

type LlmState = AsyncState<Awaited<ReturnType<typeof fetchLlmCalls>>>
type AuditState = AsyncState<Awaited<ReturnType<typeof fetchAudit>>>

export function SettingsScreen(props: { revision: number }) {
  const settings = useAsync((signal) => fetchSettings(signal), [props.revision])
  const health = useAsync((signal) => fetchHealth(signal), [props.revision])
  const audit = useAsync((signal) => fetchAudit(50, {}, signal), [props.revision])
  const llm = useAsync((signal) => fetchLlmCalls(50, signal), [props.revision])
  const [tab, setTab] = useState<SettingsTab>('config')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const current: SettingsDto | null = settings.state.status === 'ok' ? settings.state.data : null

  /**
   * 所有配置写入走同一条路径（`settings.write` 闸门）。
   *
   * 界面上有 8 个开关 + 5 个数字框，各自拼 patch 会写八遍 try/catch 与提示文案；
   * 这里统一 —— 也保证"写不进去时一定看得见原因"（`ApiError.display` 优先用宿主的 hint）。
   */
  const write = async (patch: SettingsPatch, okText: string): Promise<void> => {
    setBusy(true)
    try {
      await updateSettings(patch)
      setMessage({ tone: 'ok', text: okText })
      settings.reload()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof ApiError ? error.display : String(error) })
      // 写失败要把服务端的真值回读回来：数字框此刻显示的是用户刚输的值，
      // 不回读的话它会一直显示一个"没生效的数"，比报错本身更容易误导。
      settings.reload()
    } finally {
      setBusy(false)
    }
  }

  const labelOf = (purpose: string): string =>
    current?.derived.purposes.find((item) => item.purpose === purpose)?.label ?? purpose

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  /** 左右方向键在标签之间移动（tablist 的契约之一；切换后焦点跟着走）。 */
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length
    const next = SETTINGS_TABS[nextIndex]
    if (next === undefined) return
    setTab(next[0])
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="jh-screen jh-screen-settings">
      <div className="jh-row-head">
        <h2 className="jh-card-title">设置与诊断</h2>
        <span className="jh-muted">
          抓取额度、审批与审计开关只能由你在界面上改 —— 模型改不了（§22.4）
        </span>
      </div>

      {message === null ? null : (
        <div className="jh-card jh-card-tight">
          <p className={message.tone === 'error' ? 'jh-error' : 'jh-ok'}>{message.text}</p>
        </div>
      )}

      {/* 二级分区。用 role=tablist 而不是 aria-current：这里是同屏内的两个视图，
          不是"整屏替换"的页面级分区（顶部那排导航才属于后者）。
          既然是 tablist，就把它该有的契约补齐：aria-controls 指向面板、
          roving tabindex（当前项 0 / 其余 -1）+ 左右方向键 —— 否则
          读屏用户听到"标签页"却按不动它，比不声明这个角色更糟。 */}
      <div className="jh-modes jh-set-tabs" role="tablist" aria-label="设置分区">
        {SETTINGS_TABS.map(([key, label], index) => (
          <button
            key={key}
            id={`jh-set-tab-${key}`}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`jh-set-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`jh-mode${tab === key ? ' jh-mode-active' : ''}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' ? (
        <div role="tabpanel" id="jh-set-panel-config" aria-labelledby="jh-set-tab-config">
          <ConfigPanel
            current={current}
            error={settings.state.status === 'error' ? settings.state.message : null}
            busy={busy}
            write={write}
          />
        </div>
      ) : tab === 'logs' ? (
        <div role="tabpanel" id="jh-set-panel-logs" aria-labelledby="jh-set-tab-logs">
          <LogsPanel
            health={health.state}
            llm={llm.state}
            audit={audit.state}
            labelOf={labelOf}
            notify={(tone, text) => setMessage({ tone, text })}
          />
        </div>
      ) : (
        <div role="tabpanel" id="jh-set-panel-data" aria-labelledby="jh-set-tab-data">
          <DataPanel current={current} busy={busy} write={write} notify={(tone, text) => setMessage({ tone, text })} />
        </div>
      )}
    </div>
  )
}

// ── 配置页 ────────────────────────────────────────────────────────────

function ConfigPanel(props: {
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

  const idleMinutes = current.browser.idleCloseMinutes
  const closeAfterRun = current.browser.closeAfterRun
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
                          用户既看不到它、也不知道自己有什么被记住。状态靠 label 说明。 */}
                      <Switch
                        checked={on}
                        disabled={busy}
                        label={masterOn ? item.label : `${item.label}（模型总开关已关闭，暂不生效）`}
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

        {/* ── 系统控制中心（原「安全闸门」+「浏览器」）──────────────── */}
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
      </div>
    </div>
  )
}

// ── 诊断与调用日志页 ──────────────────────────────────────────────────

function LogsPanel(props: {
  health: AsyncState<HealthDto>
  llm: LlmState
  audit: AuditState
  labelOf: (purpose: string) => string
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState<'all' | 'ok' | 'fail'>('all')
  const [query, setQuery] = useState('')
  const [payload, setPayload] = useState<LlmCallDto | null>(null)

  const health = props.health
  const llmItems = props.llm.status === 'ok' ? props.llm.data.items : []
  // 场景下拉用**日志里实际出现过的**用途，而不是用途枚举 ——
  // 留痕表里可能有历史用途（枚举改过名、或某项已下线），按枚举筛就查不到它们。
  const purposes = [...new Set(llmItems.map((item) => item.purpose))].sort()
  const needle = query.trim().toLowerCase()
  const shown = llmItems.filter((item) => {
    if (purpose !== '' && item.purpose !== purpose) return false
    if (status === 'ok' && !item.ok) return false
    if (status === 'fail' && item.ok) return false
    if (needle === '') return true
    return [item.purpose, props.labelOf(item.purpose), item.model ?? '', item.errorCode ?? '', item.fields.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const copyPath = async (path: string): Promise<void> => {
    // 复制失败必须说出来：不然按钮点了没反应，用户会以为界面坏了
    if (await copyToClipboard(path)) {
      props.notify('ok', '已复制数据文件路径。')
      return
    }
    props.notify('error', '复制失败 —— 浏览器不允许写剪贴板，请手动选中路径复制。')
  }

  const revealDir = async (): Promise<void> => {
    try {
      const result = await revealDataDir()
      // 宿主说没打开就别说"已打开"：没有文件管理器的环境里，谎报成功比报错更难查
      props.notify(
        result.ok ? 'ok' : 'error',
        result.ok
          ? `已在系统文件管理器中打开：${result.dir}`
          : `打不开文件夹：${result.reason ?? '未知原因'}（${result.dir}）`,
      )
    } catch (error) {
      props.notify('error', error instanceof ApiError ? error.display : String(error))
    }
  }

  const dataPath =
    health.status === 'ok' && health.data.dataReady ? health.data.dataPath : null

  // 按用途汇总（宿主已经算好，随响应一起回来）。按 token 从多到少排 —— 一眼看到"谁最贵"。
  const usage = (props.llm.status === 'ok' ? props.llm.data.stats : [])
    .map((item) => ({
      purpose: item.purpose,
      calls: item.calls,
      tokens: item.promptTokens + item.completionTokens,
    }))
    .sort((left, right) => right.tokens - left.tokens)

  return (
    <>
      {/* ── 诊断 ───────────────────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">诊断</h2>
        {health.status !== 'ok' ? (
          <p className="jh-muted">正在读取诊断信息…</p>
        ) : (
          <>
            {/* 指标卡：版本 / 运行时长 / 工具数这类核心读数从 kv 列表里提出来，
                横排一眼扫完；剩下的才是路径、离线模式这种"要看细节"的项。
                数据层没起来时**不摆一排 0** —— 那会读成"真的 0 个岗位"，
                而此时该被看见的是打不开库的原因（dataError）。 */}
            {health.data.dataReady ? (
              <>
                <div className="jh-stats">
                  <div className="jh-stat">
                    <b>{health.data.version}</b>
                    <span>版本 · {health.data.phase}</span>
                  </div>
                  <LiveUptimeCard uptimeMs={health.data.hostUptimeMs} />
                  <div className="jh-stat">
                    <b>{health.data.tools === null ? '—' : health.data.tools.registered.length}</b>
                    <span>已挂载工具</span>
                  </div>
                  <div className="jh-stat">
                    <b>
                      {health.data.jobCount} / {health.data.companyCount}
                    </b>
                    <span>岗位 / 公司</span>
                  </div>
                  <div
                    className={`jh-stat${health.data.pendingRepairCount > 0 ? ' jh-stat-warn' : ''}`}
                  >
                    <b>{health.data.pendingRepairCount}</b>
                    <span>待修复</span>
                  </div>
                </div>

                {dataPath === null ? null : (
                  <div className="jh-field">
                    <span className="jh-field-label">数据文件</span>
                    <div className="jh-path">
                      <code title={dataPath}>{dataPath}</code>
                      <button
                        type="button"
                        className="jh-icon-btn"
                        title="复制路径"
                        aria-label="复制数据文件路径"
                        onClick={() => void copyPath(dataPath)}
                      >
                        <IconCopy />
                      </button>
                      <button
                        type="button"
                        className="jh-icon-btn"
                        title="打开所在文件夹"
                        aria-label="打开数据文件所在文件夹"
                        onClick={() => void revealDir()}
                      >
                        <IconFolder />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="jh-alert jh-alert-error">
                <div className="jh-alert-head">
                  <span className="jh-alert-title">数据层未就绪</span>
                </div>
                <p className="jh-alert-body">
                  {health.data.dataError ?? '没有可读的失败原因 —— 数据层尚未就绪。'}
                </p>
              </div>
            )}

            <div className="jh-ctl">
              <span className="jh-field-label">离线模式</span>
              <span className={health.data.offline ? 'jh-warn' : 'jh-muted'}>
                {health.data.offline ? '已开启 —— 抓取与登录引导会被拒绝' : '关闭'}
              </span>
            </div>

            {health.data.tools !== null && health.data.tools.failed.length > 0 && (
              <p className="jh-error">
                工具注册失败：
                {health.data.tools.failed.map((item) => `${item.name}（${item.reason}）`).join(' · ')}
              </p>
            )}
          </>
        )}
      </section>

      {/* ── 模型调用留痕 ───────────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">模型调用留痕（我发了什么给模型）</h2>
        {props.llm.status === 'error' && <p className="jh-error">{props.llm.message}</p>}
        {props.llm.status === 'ok' && (
          <>
            <div className="jh-filters">
              <select
                className="jh-select"
                aria-label="按场景筛选"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              >
                <option value="">全部场景</option>
                {purposes.map((item) => (
                  <option key={item} value={item}>
                    {props.labelOf(item)}（{item}）
                  </option>
                ))}
              </select>
              <select
                className="jh-select"
                aria-label="按状态筛选"
                value={status}
                onChange={(event) => setStatus(event.target.value as 'all' | 'ok' | 'fail')}
              >
                <option value="all">全部状态</option>
                <option value="ok">成功</option>
                <option value="fail">失败</option>
              </select>
              <input
                className="jh-input jh-input-grow"
                type="search"
                aria-label="搜索调用记录"
                placeholder="搜索场景 / 模型 / 字段 / 错误…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="jh-filter-note">
                显示 {shown.length} / {llmItems.length} 条
              </span>
            </div>

            {/* 按用途汇总：回答"哪几项在烧 token"，它正是"该关掉哪个用途"的依据。
                口径要说清 —— 它是**全部**调用的汇总，不受上面的筛选影响。 */}
            {usage.length === 0 ? null : (
              <>
                <h3 className="jh-section-title">按用途汇总（不受上面的筛选影响）</h3>
                <div className="jh-usage">
                  {usage.map((item) => (
                    <span className="jh-usage-item" key={item.purpose}>
                      <span className="jh-usage-name">{props.labelOf(item.purpose)}</span>
                      <span className="jh-usage-num">{item.calls}</span>
                      <span className="jh-usage-unit">次</span>
                      <span className="jh-usage-num">{item.tokens}</span>
                      <span className="jh-usage-unit">token</span>
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="jh-table-scroll">
              <table className="jh-table jh-table-roomy">
                <thead>
                  <tr>
                    <th scope="col">时间</th>
                    <th scope="col">用途</th>
                    <th scope="col">模型</th>
                    <th scope="col">外发字段</th>
                    <th scope="col" className="jh-num">
                      Token
                    </th>
                    <th scope="col" className="jh-cell-status">
                      结果
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((call: LlmCallDto) => {
                    const result = resultOf(call)
                    return (
                      <tr key={call.id}>
                        {/* 时间列不加 .jh-num：表头是左对齐的，单元格右对齐会让列内错位 */}
                        <td>{call.at.slice(5, 16).replace('T', ' ')}</td>
                        <td>{props.labelOf(call.purpose)}</td>
                        <td>{call.model ?? '—'}</td>
                        {/* 开发字段的长串占满表格宽度：这里只留数量，点开看完整 payload */}
                        <td>
                          {call.fields.length === 0 ? (
                            <span className="jh-muted">—</span>
                          ) : (
                            <button
                              type="button"
                              className="jh-link jh-payload-link"
                              aria-label={`查看这次调用的完整留痕（外发 ${String(call.fields.length)} 个字段）`}
                              onClick={() => setPayload(call)}
                            >
                              已选中 {call.fields.length} 项
                            </button>
                          )}
                        </td>
                        <td className="jh-num">{call.promptTokens + call.completionTokens}</td>
                        <td className="jh-cell-status">
                          <span className={`jh-tag jh-tag-clip ${result.tone}`} title={result.full}>
                            {result.text}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {llmItems.length === 0 && <p className="jh-muted">还没有调用记录。</p>}
            {llmItems.length > 0 && shown.length === 0 && (
              <p className="jh-muted">没有匹配的调用记录 —— 清掉上面的筛选条件再看看。</p>
            )}
            <p className="jh-note">{props.llm.data.note}</p>
          </>
        )}
      </section>

      {/* ── 操作审计 ───────────────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">操作审计</h2>
        {props.audit.status === 'error' && <p className="jh-error">{props.audit.message}</p>}
        {props.audit.status === 'ok' && (
          <>
            <div className="jh-filters">
              {/* 说清"这是最近多少条"：接口按 limit 取，表里不会显示全部 */}
              <span className="jh-filter-note">
                共 {props.audit.data.count} 条 · 表里显示最近 {props.audit.data.items.length} 条
              </span>
            </div>
            <div className="jh-table-scroll">
              <table className="jh-table jh-table-roomy">
                <thead>
                  <tr>
                    <th scope="col">时间</th>
                    <th scope="col">谁</th>
                    <th scope="col">动作</th>
                    <th scope="col" className="jh-cell-status">
                      结果
                    </th>
                    <th scope="col">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {props.audit.data.items.map((record: AuditRecordDto) => (
                    <tr key={record.id}>
                      <td>{record.at.slice(5, 16).replace('T', ' ')}</td>
                      <td>{record.actor}</td>
                      <td>
                        <code>{record.action}</code>
                      </td>
                      <td className="jh-cell-status">
                        <span
                          className={`jh-tag ${
                            record.result === 'ok' ? 'jh-tone-ok' : 'jh-tone-warn'
                          }`}
                        >
                          {record.result}
                        </span>
                      </td>
                      <td className="jh-muted">{record.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {props.audit.data.items.length === 0 && <p className="jh-muted">还没有审计记录。</p>}
            {/* 与留痕卡同一类"我们存了什么、没存什么"的声明 —— 一张有一张没有是说不通的 */}
            <p className="jh-note">{props.audit.data.note}</p>
          </>
        )}
      </section>

      {payload === null ? null : (
        <PayloadDrawer
          call={payload}
          purposeLabel={props.labelOf(payload.purpose)}
          notify={props.notify}
          onClose={() => setPayload(null)}
        />
      )}
    </>
  )
}

/** 调用结果 → 状态标签的文案与配色。 */
function resultOf(call: LlmCallDto): { text: string; tone: string; full: string } {
  if (call.ok) return { text: '成功', tone: 'jh-tone-ok', full: '成功' }
  // `errorCode` 这一列存的其实是宿主的**错误消息**（如「模型返回了空内容」），
  // 所以「返回空内容」这种软失败（重试往往就好）与调用真的报错分开配色。
  const raw = call.errorCode ?? '失败'
  const soft = raw.includes('空内容')
  return {
    text: soft ? '模型返回空内容' : raw,
    tone: soft ? 'jh-tone-warn' : 'jh-tone-error',
    full: raw,
  }
}

/**
 * 「运行时长」指标卡。
 *
 * 为什么单独一个组件：`health` 只在 revision 变化（真实 SSE 事件）时重拉，
 * 而心跳是注释帧（`: ping`）、不会触发 `onmessage` —— 直接渲染 `hostUptimeMs`
 * 会让这个数字**冻住**，"活的"指标不动比不显示更容易误判。
 * 这里按"面板读取时的宿主时长 + 本地经过时间"每秒自增；单独成组件是为了让
 * 每秒的重渲染只落在这张卡上，不带着整张日志表一起重画。
 */
function LiveUptimeCard(props: { uptimeMs: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [props.uptimeMs])

  return (
    <div className="jh-stat" title="面板读取时的宿主运行时长 + 本地经过时间，每秒自增">
      <b>{Math.round(props.uptimeMs / 1000) + elapsed}s</b>
      <span>运行时长</span>
    </div>
  )
}

/**
 * 一次模型调用的完整留痕（JSON 查看器）。
 *
 * 为什么用抽屉而不是把 JSON 塞进单元格：留痕里 `fields` 与 `ref` 加起来常常几十行，
 * 摊在表格里会把其它列挤成一条（这正是原来的问题）。
 */
function PayloadDrawer(props: {
  call: LlmCallDto
  purposeLabel: string
  notify: (tone: 'ok' | 'error', text: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useDialogA11y(dialogRef, props.onClose)
  const call = props.call

  const json = JSON.stringify(
    {
      id: call.id,
      at: call.at,
      purpose: call.purpose,
      purposeLabel: props.purposeLabel,
      provider: call.provider,
      model: call.model,
      fields: call.fields,
      fieldCount: call.fields.length,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      totalTokens: call.promptTokens + call.completionTokens,
      ok: call.ok,
      errorCode: call.errorCode,
      durationMs: call.durationMs,
      ref: call.ref,
    },
    null,
    2,
  )

  const copyJson = async (): Promise<void> => {
    if (await copyToClipboard(json)) {
      props.notify('ok', '已复制这次调用的完整留痕（JSON）。')
      return
    }
    props.notify('error', '复制失败 —— 浏览器不允许写剪贴板，请手动选中 JSON 复制。')
  }

  return (
    <div className="jh-drawer-layer">
      <button
        type="button"
        className="jh-drawer-backdrop"
        aria-label="关闭留痕明细"
        onClick={props.onClose}
      />
      <aside
        className="jh-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="模型调用留痕明细"
        tabIndex={-1}
        ref={dialogRef}
        data-job-hunter="llm-payload-drawer"
      >
        <header className="jh-drawer-head">
          <span className="jh-drawer-title">留痕明细 #{call.id}</span>
          <button type="button" className="jh-icon-btn" aria-label="关闭" onClick={props.onClose}>
            ×
          </button>
        </header>
        <div className="jh-drawer-body">
          {/* 复制入口：路径那一行有复制，payload 也该有 —— 排查时要去提 issue 的就是它 */}
          <div className="jh-copy-head">
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-tiny"
              onClick={() => void copyJson()}
            >
              复制 JSON
            </button>
          </div>
          <p className="jh-note jh-json-hint">
            <InlineMd text="留痕表里只有**字段清单与长度**，没有正文 —— 外发正文不入审计表（§4.1 隐私策略）。" />
          </p>
          <pre className="jh-json">{json}</pre>
        </div>
      </aside>
    </div>
  )
}

// ── 基础控件 ──────────────────────────────────────────────────────────

/* Switch 已抽到 `../switch.js` —— 岗位库的「跨平台折叠」也要用同一种"即时生效的开关"。
   抽出来的理由与 FieldHint 相同：复制一份会两边各自漂移。 */

/**
 * 数字输入框（带单位后缀）：**受控的草稿值**，失焦 / 回车才提交。
 *
 * 为什么不 onChange 就提交：那样每敲一个数字都会发一次 PATCH，
 * 而且"20"到"200"中途会先把额度改成 2 —— 用户还没输完就已经生效了。
 * 也不用 `key` 重挂载来同步服务端值：那会在用户打字时把光标顶掉。
 */
function NumberField(props: {
  value: number
  min: number
  max: number
  /** 单位后缀（分钟 / 条 / 个）。 */
  unit: string
  label: string
  disabled?: boolean
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState<string>(String(props.value))
  const focused = useRef(false)

  useEffect(() => {
    // 服务端值变了、而用户没在编辑，就同步过来（改完保存后的回读走这条）
    if (!focused.current) setDraft(String(props.value))
  }, [props.value])

  const commit = (): void => {
    const parsed = Number.parseInt(draft.trim(), 10)
    // 输不出数字就当没改过：退回服务端的值，而不是把设置写成 NaN
    if (!Number.isFinite(parsed)) {
      setDraft(String(props.value))
      return
    }
    const clamped = Math.min(props.max, Math.max(props.min, parsed))
    setDraft(String(clamped))
    if (clamped !== props.value) props.onCommit(clamped)
  }

  return (
    <span className="jh-number">
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={1}
        aria-label={props.label}
        disabled={props.disabled === true}
        value={draft}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      <span className="jh-number-unit">{props.unit}</span>
    </span>
  )
}

/* 两个小图标：手画 SVG 而不是图标字体 —— 字号缩放与强制色彩模式下都还在，
   而且 `stroke="currentColor"` 跟着 .jh-icon-btn 的颜色走（两套主题都对）。 */

function IconCopy() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
      <path d="M10.5 5.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h2.5" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 2h5.5A1.5 1.5 0 0 1 14.5 6.5v5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z" />
    </svg>
  )
}
