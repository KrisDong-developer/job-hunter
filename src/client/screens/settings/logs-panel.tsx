// ── 诊断与调用日志页 ──────────────────────────────────────────────────

import { useState } from 'react'
import type { HealthDto } from '../../../shared/contract/dto/crawl.js'
import { useAsync, type AsyncState } from '../../hooks/use-async.js'
import { fetchAudit, fetchLlmCalls } from '../../net/ops.js'
import { fetchHealth } from '../../net/overview.js'
import type { LlmCallDto } from '../../../shared/contract/dto/settings.js'
import { AuditTable } from './audit-table.js'
import { DiagnosticsPanel } from './diagnostics-panel.js'
import { LlmCallsTable } from './llm-calls-table.js'
import { PayloadDrawer } from './payload-drawer.js'

export type LlmState = AsyncState<Awaited<ReturnType<typeof fetchLlmCalls>>>
export type AuditState = AsyncState<Awaited<ReturnType<typeof fetchAudit>>>

/** 留痕与审计各取最近多少条。接口按 limit 取，两张表都会写明"表里只有最近 N 条"。 */
const LOG_LIMIT = 50

export function LogsPanel(props: {
  revision: number
  labelOf: (purpose: string) => string
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  /**
   * 三份数据都在**这里**拉，不在 `SettingsScreen` 里 —— 它们只有本分区用得上。
   * 这一屏默认落在「模型与系统配置」，原先在那一屏就会白拉 100 行日志加一次诊断。
   * 代价是每次切回本分区都要重取一次：对日志来说这恰好是对的（你要看的就是"现在"）。
   *
   * `keepPrevious` 还是要开：`revision`（真实 SSE 事件）变化时会重取，
   * 重取期间不该让整张表消失再出现。
   */
  const health = useAsync((signal) => fetchHealth(signal), [props.revision], { keepPrevious: true })
  const llm = useAsync((signal) => fetchLlmCalls(LOG_LIMIT, signal), [props.revision], {
    keepPrevious: true,
  })
  const audit = useAsync((signal) => fetchAudit(LOG_LIMIT, {}, signal), [props.revision], {
    keepPrevious: true,
  })

  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState<'all' | 'ok' | 'fail'>('all')
  const [query, setQuery] = useState('')
  const [payload, setPayload] = useState<LlmCallDto | null>(null)

  return (
    <>
      {/* ── 诊断 ───────────────────────────────────────────────────── */}
      <DiagnosticsPanel health={health.state} notify={props.notify} />

      {/* ── 模型调用留痕 ───────────────────────────────────────────── */}
      <LlmCallsTable
        llm={llm.state}
        labelOf={props.labelOf}
        purpose={purpose}
        setPurpose={setPurpose}
        status={status}
        setStatus={setStatus}
        query={query}
        setQuery={setQuery}
        onOpenPayload={setPayload}
      />

      {/* ── 操作审计 ───────────────────────────────────────────────── */}
      <AuditTable audit={audit.state} />

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
