import { useState } from 'react'
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
import { useAsync } from '../use-async.js'

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
                  <th>时间</th>
                  <th>用途</th>
                  <th>模型</th>
                  <th>外发字段</th>
                  <th>Token</th>
                  <th>结果</th>
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
                  <th>时间</th>
                  <th>谁</th>
                  <th>动作</th>
                  <th>结果</th>
                  <th>说明</th>
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
