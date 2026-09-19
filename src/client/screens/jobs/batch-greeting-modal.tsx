/**
 * 批量打招呼弹窗（D3 / U1）。
 *
 * ## 三个界面决定，都对应一条需求
 *
 * 1. **打开就先拉预览**（只读），而且把"发不了的"逐条列出原因。
 *    实际调研的结论是：**目前只有 BOSS 一个平台实现了打招呼动作**，其余平台是刻意不实现的。
 *    所以用户从岗位库勾了 10 条跨平台岗位，真实的结论常常是"能发 3 条、其余 7 条平台不支持"——
 *    这件事必须在他点下去**之前**说清楚，而不是发起后拿一屏失败回执。
 * 2. **看得见正文全文，并且可以逐条改**：§4.4.2 要求确认时能看到正文全文。
 *    这里有 N 条，所以正文逐条列出、可编辑、可单条"重新生成"。
 *    发送时把**用户看过的那段**回传（不是让服务端重新生成一遍）。
 * 3. **一次确认，分批发送，逐批推进度**：宿主单次最多 `batchMax` 条（每条约几秒 + 3–9 秒随机间隔），
 *    所以界面按 `batchMax` 串行分批，每批结束更新一次回执与进度。
 *    确认只问一次 —— 用户已经在同一屏看过全部正文，重复问 N 次只是噪音。
 *
 * ## 一条安全约束
 *
 * 发送过程中**不允许关闭弹窗**：关掉不会取消已经发出的那几条（请求还在服务端跑），
 * 用户会以为"关了就等于没发"。所以发送中禁用关闭，并如实写出来。
 */
import { useEffect, useState } from 'react'
import {
  ApiError,
  draftGreeting,
  previewGreetingBatch,
  sendGreetingBatch,
  type GreetingBatchPlanDto,
  type GreetingBatchReceiptDto,
} from '../../api.js'
import { Modal } from '../../modal.js'

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? error.display : String(error)
}

/**
 * 批与批之间的等待。
 *
 * 宿主只在**一次请求内**给条与条之间插随机间隔；两次独立请求之间的空档它管不到 ——
 * 不管的话，第 6 条与第 5 条之间就只剩一个请求往返的时间，分批等于把间隔削掉一截。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** `[min, max]` 内的一个随机间隔（与宿主同款：注入随机数是为了可测，这里直接取 `Math.random()`）。 */
function randomIntervalMs(interval: { min: number; max: number }): number {
  return interval.min + Math.floor(Math.random() * (interval.max - interval.min))
}

function receiptTone(receipt: GreetingBatchReceiptDto): string {
  return receipt.ok ? '已发送' : (receipt.message ?? '失败')
}

export function BatchGreetingModal(props: {
  jobIds: number[]
  onClose: () => void
  /** 每批发完通知外层刷新岗位列表（接触态/状态可能变了）。 */
  onBatchDone: (sent: number, failed: number) => void
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  const [plan, setPlan] = useState<GreetingBatchPlanDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texts, setTexts] = useState<Record<number, string>>({})
  /** 用户取消勾选的条目（默认全发）。 */
  const [skipped, setSkipped] = useState<number[]>([])
  const [receipts, setReceipts] = useState<GreetingBatchReceiptDto[]>([])
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [regenerating, setRegenerating] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await previewGreetingBatch(props.jobIds)
        if (cancelled) return
        setPlan(next)
        setTexts(
          Object.fromEntries(
            next.items
              .filter((item) => item.text !== null)
              .map((item) => [item.jobId, item.text as string]),
          ),
        )
      } catch (caught) {
        if (!cancelled) setError(reasonOf(caught))
      }
    })()
    return () => {
      cancelled = true
    }
    // 只在打开时拉一次：预览会生成话术（可能调用模型），不该因为父组件重渲染而反复触发
  }, [props.jobIds])

  const sendable = (plan?.items ?? []).filter((item) => item.willSend && !skipped.includes(item.jobId))
  const batchMax = plan?.batchMax ?? 5
  const batches = Math.ceil(sendable.length / batchMax)
  const intervalSec = plan === null ? '' : `${String(Math.round(plan.intervalMs.min / 1000))}–${String(Math.round(plan.intervalMs.max / 1000))} 秒`

  const run = async (): Promise<void> => {
    if (plan === null || sendable.length === 0) return
    // 已发过的条目不再重发：`receipts` 里出现过的 jobId 就是发过的
    const already = new Set(receipts.map((receipt) => receipt.jobId))
    const pending = sendable.filter((item) => !already.has(item.jobId))
    if (pending.length === 0) {
      props.notify('ok', '这一批都发过了')
      return
    }

    setSending(true)
    setProgress({ done: 0, total: pending.length })
    let sent = 0
    let failed = 0
    try {
      // 按 batchMax 串行分批：一次请求塞太多会长时间不返回（宿主也会拒绝）
      for (let start = 0; start < pending.length; start += batchMax) {
        // 批与批之间也等一个随机间隔：宿主只管一次请求内的条与条，跨请求的空档归界面
        if (start > 0) await sleep(randomIntervalMs(plan.intervalMs))
        const chunk = pending.slice(start, start + batchMax)
        const result = await sendGreetingBatch(
          chunk.map((item) => {
            const text = texts[item.jobId]
            return text === undefined || text.trim() === '' ? { jobId: item.jobId } : { jobId: item.jobId, text }
          }),
        )
        sent += result.sent
        failed += result.failed
        setReceipts((current) => [...current, ...result.receipts])
        setProgress({ done: Math.min(start + chunk.length, pending.length), total: pending.length })
        props.onBatchDone(result.sent, result.failed)
      }
      props.notify('ok', `批量打招呼完成：成功 ${String(sent)} 条、失败 ${String(failed)} 条`)
    } catch (caught) {
      // 已经发出去的那些**不会**被撤销，所以文案只说"剩下的没发成"
      props.notify('error', `发送中断：${reasonOf(caught)}（前面已经发出去的不会撤回）`)
    } finally {
      setSending(false)
    }
  }

  const regenerate = async (jobId: number): Promise<void> => {
    setRegenerating(jobId)
    try {
      const draft = await draftGreeting(jobId)
      setTexts((current) => ({ ...current, [jobId]: draft.text }))
    } catch (caught) {
      props.notify('error', reasonOf(caught))
    } finally {
      setRegenerating(null)
    }
  }

  const receiptOf = (jobId: number): GreetingBatchReceiptDto | undefined =>
    receipts.find((receipt) => receipt.jobId === jobId)

  return (
    <Modal
      title="批量打招呼"
      label="批量打招呼"
      size="lg"
      onClose={sending ? () => undefined : props.onClose}
      footer={
        <>
          {sending && progress !== null ? (
            <span className="jh-muted">
              正在发送 {progress.done}/{progress.total}（每条之间会等 {intervalSec}，分批之间也一样，慢是故意的）
            </span>
          ) : null}
          <span className="jh-spacer" />
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={sending}
            onClick={props.onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-primary"
            disabled={sending || plan === null || sendable.length === 0}
            onClick={() => void run()}
          >
            {sending ? '发送中…' : `确认发送（${String(sendable.length)} 条 / 分 ${String(batches)} 批）`}
          </button>
        </>
      }
    >
      {error === null ? null : <p className="jh-error">{error}</p>}
      {plan === null && error === null ? <p className="jh-muted">正在检查这些岗位能不能发…</p> : null}

      {plan === null ? null : (
        <>
          <p className="jh-note">
            共 {plan.items.length} 条：<b>能发 {plan.sendable} 条</b>、发不了 {plan.blocked} 条。
            {batches > 1
              ? `一次请求最多发 ${String(batchMax)} 条，所以会分 ${String(batches)} 批依次发出（每批结束后这里会更新回执）。`
              : ''}
          </p>
          <p className="jh-muted">{plan.note}</p>

          <ul className="jh-tailor-notes">
            {plan.items.map((item) => {
              const receipt = receiptOf(item.jobId)
              const off = skipped.includes(item.jobId)
              return (
                <li key={item.jobId}>
                  <div className="jh-row-head">
                    <label className="jh-check">
                      <input
                        type="checkbox"
                        checked={item.willSend && !off}
                        disabled={!item.willSend || sending}
                        onChange={(event) =>
                          setSkipped((current) =>
                            event.target.checked
                              ? current.filter((id) => id !== item.jobId)
                              : [...current, item.jobId],
                          )
                        }
                      />
                      <span>
                        <b>{item.title}</b>
                        {item.company === '' ? '' : ` · ${item.company}`}
                        <span className="jh-muted">（{item.platformId}）</span>
                      </span>
                    </label>
                    <span className="jh-spacer" />
                    {receipt === undefined ? null : (
                      <span className={receipt.ok ? 'jh-ok' : 'jh-error'}>{receiptTone(receipt)}</span>
                    )}
                  </div>

                  {item.willSend ? (
                    <>
                      <textarea
                        className="jh-input jh-greeting-edit"
                        rows={3}
                        value={texts[item.jobId] ?? ''}
                        disabled={sending}
                        aria-label={`${item.title} 的打招呼正文`}
                        onChange={(event) =>
                          setTexts((current) => ({ ...current, [item.jobId]: event.target.value }))
                        }
                      />
                      <div className="jh-muted">
                        话术来源：{item.via === 'llm' ? '模型生成' : item.via === 'template' ? '模板' : '你写的'}
                        {(texts[item.jobId] ?? '').length === 0 ? '' : ` · ${String((texts[item.jobId] ?? '').length)} 字`}
                        {item.sideEffect === null ? '' : ` · 同时会发生：${item.sideEffect}`}
                        <span className="jh-spacer" />
                        <button
                          type="button"
                          className="jh-btn jh-btn-inline"
                          disabled={sending || regenerating === item.jobId}
                          onClick={() => void regenerate(item.jobId)}
                        >
                          {regenerating === item.jobId ? '生成中…' : '重新生成'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="jh-muted">
                      发不了：{item.blocker?.message}
                      {item.blocker?.hint === undefined ? '' : ` —— ${item.blocker.hint}`}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {receipts.length === 0 ? null : (
            <details className="jh-details" open>
              <summary>回执（{receipts.length} 条，逐条）</summary>
              <ul className="jh-tailor-notes">
                {receipts.map((receipt) => (
                  <li key={receipt.jobId} className={receipt.ok ? 'jh-ok' : 'jh-error'}>
                    {receipt.ok ? '✅' : '❌'} {receipt.company || receipt.title}：
                    {receipt.ok
                      ? `已发送（${String(receipt.textLength ?? 0)} 字，${receipt.sentAt?.slice(0, 19).replace('T', ' ') ?? ''}）`
                      : `${receipt.message ?? '失败'}${receipt.hint === null ? '' : ` —— ${receipt.hint}`}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Modal>
  )
}
