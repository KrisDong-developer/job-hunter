// ── 诊断与调用日志页 ──────────────────────────────────────────────────

import { useState } from 'react'
import type { HealthDto } from '../../../shared/dto.js'
import type { AsyncState } from '../../hooks/use-async.js'
import type { fetchAudit, fetchLlmCalls } from '../../net/ops.js'
import type { LlmCallDto } from '../../net/types.js'
import { AuditTable } from './audit-table.js'
import { DiagnosticsPanel } from './diagnostics-panel.js'
import { LlmCallsTable } from './llm-calls-table.js'
import { PayloadDrawer } from './payload-drawer.js'

export type LlmState = AsyncState<Awaited<ReturnType<typeof fetchLlmCalls>>>
export type AuditState = AsyncState<Awaited<ReturnType<typeof fetchAudit>>>

export function LogsPanel(props: {
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

  return (
    <>
      {/* ── 诊断 ───────────────────────────────────────────────────── */}
      <DiagnosticsPanel health={props.health} notify={props.notify} />

      {/* ── 模型调用留痕 ───────────────────────────────────────────── */}
      <LlmCallsTable
        llm={props.llm}
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
      <AuditTable audit={props.audit} />

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
