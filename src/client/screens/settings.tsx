import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  fetchAudit,
  fetchHealth,
  fetchLlmCalls,
  fetchSettings,
  updateSettings,
  type AuditRecordDto,
  type LlmCallDto,
  type SettingsDto,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { FieldHint } from '../field-hint.js'
import { useAsync } from '../use-async.js'
import {
  BROWSER_IDLE_DEFAULT_MIN,
  BROWSER_IDLE_MAX_MIN,
  BROWSER_IDLE_MIN_MIN,
} from '../../shared/constants.js'

/**
 * U10 设置 + U11 日志与诊断（§5.4）。
 *
 * 这两块原来只有 HTTP 接口，界面上够不着 —— 而"模型用途开关"与"我发了什么给模型"
 * 恰恰是最需要被用户看见的两件事（I5 知情同意）。
 *
 * 一条硬约束直接在界面上写出来：**额度、审批开关、审计开关模型不能改**（§22.4 禁止项）。
 * 所以它们在这里只读，并说明是谁在管。
 */
export function SettingsScreen(props: { revision: number }) {
  const settings = useAsync((signal) => fetchSettings(signal), [props.revision])
  const health = useAsync((signal) => fetchHealth(signal), [props.revision])
  const audit = useAsync((signal) => fetchAudit(50, {}, signal), [props.revision])
  const llm = useAsync((signal) => fetchLlmCalls(50, signal), [props.revision])
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const current: SettingsDto | null = settings.state.status === 'ok' ? settings.state.data : null

  /**
   * 浏览器空闲关闭：输入框是**受控的草稿值**，失焦 / 回车才提交。
   *
   * 为什么不 onChange 就提交：那样每敲一个数字都会发一次 PATCH，
   * 而且"1"到"10"中途会先把设置改成 1 分钟 —— 用户还没输完就已经生效了。
   * 也不用 `key` 重挂载来同步服务端值：那会在用户打字时把光标顶掉。
   */
  const savedIdle = current?.browser.idleCloseMinutes ?? null
  const [idleDraft, setIdleDraft] = useState<string>(savedIdle === null ? '' : String(savedIdle))
  const idleFocused = useRef(false)
  useEffect(() => {
    // 服务端值变了、而用户没在编辑，就同步过来（改完保存后的回读走这条）
    if (!idleFocused.current && savedIdle !== null) setIdleDraft(String(savedIdle))
  }, [savedIdle])

  const saveIdle = async (): Promise<void> => {
    if (savedIdle === null) return
    const parsed = Number.parseInt(idleDraft.trim(), 10)
    // 输不出数字就当没改过：退回服务端的值，而不是把设置写成 NaN
    if (!Number.isFinite(parsed)) {
      setIdleDraft(String(savedIdle))
      return
    }
    const clamped = Math.min(BROWSER_IDLE_MAX_MIN, Math.max(BROWSER_IDLE_MIN_MIN, parsed))
    setIdleDraft(String(clamped))
    if (clamped === savedIdle) return
    setBusy(true)
    try {
      await updateSettings({ browser: { idleCloseMinutes: clamped } })
      setMessage({
        tone: 'ok',
        text: clamped <= 0 ? '已改为：浏览器空闲后不自动关闭。' : `已改为：浏览器空闲 ${String(clamped)} 分钟后自动关闭。`,
      })
      settings.reload()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof ApiError ? error.display : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (purpose: string, enabled: boolean): Promise<void> => {
    setBusy(true)
    try {
      await updateSettings({ ai: { purposes: { [purpose]: enabled } } })
      setMessage({ tone: 'ok', text: `已${enabled ? '开启' : '关闭'}该用途。` })
      settings.reload()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.display : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">设置与诊断</h2>
        <span className="jh-muted">抓取额度、隐私与审计开关由闸门硬编码管理 —— 模型改不了（§22.4）</span>
      </div>

      {message === null ? null : (
        <div className="jh-card jh-card-tight">
          <p className={message.tone === 'error' ? 'jh-error' : 'jh-muted'}>{message.text}</p>
        </div>
      )}

      {/* ── U10：模型用途开关（§15）────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">模型用途</h2>
        {settings.state.status === 'error' && <p className="jh-error">{settings.state.message}</p>}
        {current === null ? (
          <p className="jh-muted">正在读取…</p>
        ) : (
          <>
            <ul className="jh-kv">
              <li>
                <span>模型总开关</span>
                <span className={current.ai.enabled ? 'jh-ok' : 'jh-warn'}>
                  {current.ai.enabled ? '已开启' : '已关闭（全部用途降级为规则/模板）'}
                </span>
              </li>
            </ul>
            <ul className="jh-list">
              {current.derived.purposes.map((purpose) => (
                <li key={purpose.purpose}>
                  <label className="jh-check">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={purpose.enabled}
                      onChange={(event) => void toggle(purpose.purpose, event.target.checked)}
                    />
                    {purpose.label}（<code>{purpose.purpose}</code>）
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── U10：闸门开关（**只读**，说清楚为什么）────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">安全闸门</h2>
        {current === null ? (
          <p className="jh-muted">正在读取…</p>
        ) : (
          <>
            <ul className="jh-kv">
              <li>
                <span>L3 打招呼</span>
                <span>{current.guard.levels.l3Greeting ? '开' : '关'}</span>
              </li>
              <li>
                <span>L4 投递</span>
                <span>{current.guard.levels.l4Application ? '开' : '关'}</span>
              </li>
              <li>
                <span>L4 回复</span>
                <span>{current.guard.levels.l4Reply ? '开' : '关'}</span>
              </li>
              <li>
                <span>每日额度</span>
                <span>
                  打招呼 {current.guard.dailyLimits.greeting} · 投递 {current.guard.dailyLimits.application} · 回复{' '}
                  {current.guard.dailyLimits.reply}
                </span>
              </li>
              <li>
                <span>冷却期</span>
                <span>{current.guard.cooldownMinutes} 分钟</span>
              </li>
              <li>
                <span>审批</span>
                <span>{current.guard.requireApproval ? '必须审批' : '不审批'}</span>
              </li>
              <li>
                <span>批量上限</span>
                <span>{current.guard.batchLimit}</span>
              </li>
              <li>
                <span>审计</span>
                <span>{current.guard.auditEnabled ? '已开启' : '已关闭'}</span>
              </li>
            </ul>
            <p className="jh-note">
              <InlineMd text="模型**不能**修改这些键：" />
              {current.derived.modelForbidden.join(' / ')}
              ；模型能改的只有：{current.derived.modelEditable.join(' / ')}。这是硬编码的校验，不是约定。
            </p>
          </>
        )}
      </section>

      {/* ── 浏览器（不是闸门配置：模型也能改，无需令牌）────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">浏览器</h2>
        {current === null ? (
          <p className="jh-muted">正在读取…</p>
        ) : (
          <>
            <label className="jh-field">
              <span className="jh-field-label">
                采集浏览器空闲多久后自动关闭
                <FieldHint text="采集要复用你自己登录过的浏览器，所以它是 headful 的（你能看见那个窗口）。用完一直开着会占内存，所以空闲到点就自动关掉；下一次采集会重新打开，登录态在磁盘上、不会丢。填 0 表示不自动关闭。" />
              </span>
              <div className="jh-field-row">
                <input
                  className="jh-input jh-input-narrow"
                  type="number"
                  min={BROWSER_IDLE_MIN_MIN}
                  max={BROWSER_IDLE_MAX_MIN}
                  step={1}
                  aria-label="采集浏览器空闲多少分钟后自动关闭"
                  disabled={busy}
                  value={idleDraft}
                  onFocus={() => { idleFocused.current = true }}
                  onChange={(event) => setIdleDraft(event.target.value)}
                  onBlur={() => { idleFocused.current = false; void saveIdle() }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void saveIdle()
                    }
                  }}
                />
                <span className="jh-muted">分钟</span>
              </div>
            </label>
            <p className="jh-note">
              {current.browser.idleCloseMinutes <= 0
                ? '当前：不自动关闭 —— 浏览器会一直开着，直到你关掉它或卸载插件。'
                : `当前：空闲 ${String(current.browser.idleCloseMinutes)} 分钟后关闭（默认 ${String(BROWSER_IDLE_DEFAULT_MIN)} 分钟）。`}
              {' '}
              正在登录或正在采集时不会被关掉。
            </p>
          </>
        )}
      </section>

      {/* ── U11：日志与诊断 ───────────────────────────────────────────── */}
      <section className="jh-card">
        <h2 className="jh-card-title">诊断</h2>
        {health.state.status === 'ok' ? (
          <ul className="jh-kv">
            <li><span>版本</span><span>{health.state.data.version} · {health.state.data.phase}</span></li>
            <li><span>运行时长</span><span>{Math.round(health.state.data.hostUptimeMs / 1000)} 秒</span></li>
            <li><span>数据文件</span><span><code>{health.state.data.dataPath ?? '—'}</code></span></li>
            <li><span>岗位 / 公司</span><span>{health.state.data.jobCount} / {health.state.data.companyCount}</span></li>
            <li><span>待修复</span><span>{health.state.data.pendingRepairCount}</span></li>
            <li>
              <span>模型工具</span>
              <span>
                {health.state.data.tools === null
                  ? '未注册'
                  : `${String(health.state.data.tools.registered.length)} 个已注册` +
                    (health.state.data.tools.failed.length === 0
                      ? ''
                      : ` · ${String(health.state.data.tools.failed.length)} 个注册失败`)}
              </span>
            </li>
            <li><span>离线模式</span><span>{health.state.data.offline ? '已开启' : '关闭'}</span></li>
          </ul>
        ) : (
          <p className="jh-muted">正在读取诊断信息…</p>
        )}
        {health.state.status === 'ok' && health.state.data.tools !== null && health.state.data.tools.failed.length > 0 && (
          <p className="jh-error">
            工具注册失败：
            {health.state.data.tools.failed.map((item) => `${item.name}（${item.reason}）`).join(' · ')}
          </p>
        )}
      </section>

      <section className="jh-card">
        <h2 className="jh-card-title">模型调用留痕（我发了什么给模型）</h2>
        {llm.state.status === 'error' && <p className="jh-error">{llm.state.message}</p>}
        {llm.state.status === 'ok' && (
          <>
            <table className="jh-table">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">用途</th>
                  <th scope="col">模型</th>
                  <th scope="col">外发字段</th>
                  <th scope="col">Token</th>
                  <th scope="col">结果</th>
                </tr>
              </thead>
              <tbody>
                {llm.state.data.items.map((call: LlmCallDto) => (
                  <tr key={call.id}>
                    <td>{call.at.slice(5, 16).replace('T', ' ')}</td>
                    <td>{call.purpose}</td>
                    <td>{call.model ?? '—'}</td>
                    <td className="jh-muted">{call.fields.join('、') || '—'}</td>
                    <td>{call.promptTokens + call.completionTokens}</td>
                    <td className={call.ok ? 'jh-ok' : 'jh-error'}>{call.ok ? '成功' : (call.errorCode ?? '失败')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {llm.state.data.items.length === 0 && <p className="jh-muted">还没有调用记录。</p>}
            <p className="jh-note">{llm.state.data.note}</p>
          </>
        )}
      </section>

      <section className="jh-card">
        <h2 className="jh-card-title">操作审计</h2>
        {audit.state.status === 'error' && <p className="jh-error">{audit.state.message}</p>}
        {audit.state.status === 'ok' && (
          <>
            <table className="jh-table">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">谁</th>
                  <th scope="col">动作</th>
                  <th scope="col">结果</th>
                  <th scope="col">说明</th>
                </tr>
              </thead>
              <tbody>
                {audit.state.data.items.map((record: AuditRecordDto) => (
                  <tr key={record.id}>
                    <td>{record.at.slice(5, 16).replace('T', ' ')}</td>
                    <td>{record.actor}</td>
                    <td><code>{record.action}</code></td>
                    <td className={record.result === 'ok' ? 'jh-ok' : 'jh-warn'}>{record.result}</td>
                    <td className="jh-muted">{record.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.state.data.items.length === 0 && <p className="jh-muted">还没有审计记录。</p>}
          </>
        )}
      </section>
    </div>
  )
}
