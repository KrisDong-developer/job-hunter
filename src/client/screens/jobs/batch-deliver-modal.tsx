/**
 * 批量投递弹窗（L4）。
 *
 * ## 与批量打招呼弹窗的三处不同，每一处都对应"投递更重"
 *
 * 1. **不可逆**：没有"正文可以逐条改"这回事（投出去的是简历，不是一段话），
 *    所以这里不做编辑，只做"哪些条投、哪些跳过"。对应的，回执里必须带**送达状态** ——
 *    写「已发出·未确认」的那些可能已经生效，用户得去平台上核对，而不是直接重投。
 * 2. **用哪份简历是整批一份**：§4.4.2 要求确认时看到"用了哪版简历"，
 *    所以计划的 `note` 里写死这一句，正文里也显式再列一行。
 * 3. **平台层就已经能拦掉很多东西**：只有适配器实现了投递动作的平台能投，
 *    而且（实测）现在接入的平台都只吃**平台上已有的那份**简历。所以预览里
 *    "能投几条"往往远小于勾选条数 —— 这件事必须在点下去**之前**说清楚。
 *
 * ⚠️ 发送过程中不允许关闭弹窗：关掉不会取消已投出去的（请求还在服务端跑），
 * 而投递没法撤回 —— 用户会以为"关了就等于没投"。
 */
import { useEffect, useState } from 'react'
import { ApiError } from '../../net/client.js'
import { previewApplicationBatch, sendApplicationBatch } from '../../net/pipeline.js'
import type { ApplicationBatchPlanDto, ApplicationBatchReceiptDto } from '../../../shared/contract/dto/batch.js'
import { DELIVERY_STATE_LABEL, DELIVERY_STATE_TONE } from '../../../shared/contract/enums/job.js'
import { formatLocalDateTime } from '../../../shared/text/time-format.js'
import { FieldHint } from '../../ui/field-hint.js'
import { InlineMd } from '../../ui/inline-md.js'
import { Modal } from '../../ui/modal.js'
import { ResumeFilePicker } from '../../views/resume-file-picker.js'
import { IconCheck, IconCross } from './icons.js'

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

/** `[min, max]` 内的一个随机间隔（与宿主同款）。 */
function randomIntervalMs(interval: { min: number; max: number }): number {
  return interval.min + Math.floor(Math.random() * (interval.max - interval.min))
}

/**
 * 回执的色调类。
 *
 * 走 `DELIVERY_STATE_TONE` 而不是自己判 `ok`：**成功的回执也可能是 warn**
 * （`pending` = 已发出但没确认送达），它是最需要被看见的一档。
 */
function receiptClass(receipt: ApplicationBatchReceiptDto): string {
  if (!receipt.ok) return 'jh-error'
  return `jh-${DELIVERY_STATE_TONE[receipt.delivery ?? 'missing']}`
}

export function BatchDeliverModal(props: {
  jobIds: number[]
  onClose: () => void
  /** 整轮投递结束后通知外层刷新一次（投递记录/看板/岗位状态都可能变了）。 */
  onBatchDone: (sent: number, failed: number) => void
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  const [plan, setPlan] = useState<ApplicationBatchPlanDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * 这次投递**登记**用哪份简历（附件 id）；`null` = 平台内简历。
   *
   * ⚠️ 它**不决定**平台上收到哪个文件（平台用它自己那份），它决定这次投递在你记录里归到哪一版。
   * 这一句必须让用户看到 —— 所以下面按 `plan.uploadsResumeFile` 再显式说一遍。
   */
  const [resumeFileId, setResumeFileId] = useState<number | null>(null)
  /** 用户取消勾选的岗位（默认全投）。 */
  const [skipped, setSkipped] = useState<number[]>([])
  const [receipts, setReceipts] = useState<ApplicationBatchReceiptDto[]>([])
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  /**
   * 本轮投递的汇总（第四轮，审核 P2-5）。
   *
   * 同一句话要给两处：**弹窗内**（用户正看着这里，而列表栏那句被遮罩盖着，看不到）
   * 与**外层列表页**（关掉弹窗后的留痕）。所以这里存一份，`note` 同时往外传一份。
   */
  const [summary, setSummary] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const note = (tone: 'ok' | 'error', text: string): void => {
    setSummary({ tone, text })
    props.notify(tone, text)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // 每次改简历都重拉一次：预览是**只读**的，而且投递的预览不调用模型
        // （与打招呼不同 —— 那边会生成话术），所以跟着选择器走是便宜的。
        // 顺带把闸门预检里的"用了哪版简历"也一起刷新，预览与实际判定不会错开。
        const next = await previewApplicationBatch(props.jobIds, resumeFileId)
        if (!cancelled) {
          setPlan(next)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) setError(reasonOf(caught))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.jobIds, resumeFileId])

  const deliverable = (plan?.items ?? []).filter((item) => item.willDeliver && !skipped.includes(item.jobId))
  const batchMax = plan?.batchMax ?? 5
  const batches = Math.ceil(deliverable.length / batchMax)
  const intervalSec =
    plan === null
      ? ''
      : `${String(Math.round(plan.intervalMs.min / 1000))}–${String(Math.round(plan.intervalMs.max / 1000))} 秒`

  const run = async (): Promise<void> => {
    if (plan === null || deliverable.length === 0) return
    // 已投过的条目不再重投：`receipts` 里出现过的 jobId 就是投过的
    // （投递不可逆，重复提交的代价比打招呼大得多）
    const already = new Set(receipts.map((receipt) => receipt.jobId))
    const pending = deliverable.filter((item) => !already.has(item.jobId))
    if (pending.length === 0) {
      note('ok', '这一批都投过了')
      return
    }

    setSending(true)
    setProgress({ done: 0, total: pending.length })
    let sent = 0
    let failed = 0
    try {
      for (let start = 0; start < pending.length; start += batchMax) {
        // 批与批之间也等一个随机间隔：宿主只管一次请求内的条与条，跨请求的空档归界面
        if (start > 0) await sleep(randomIntervalMs(plan.intervalMs))
        const chunk = pending.slice(start, start + batchMax)
        const result = await sendApplicationBatch(
          chunk.map((item) => item.jobId),
          plan.resumeFileId,
        )
        sent += result.sent
        failed += result.failed
        setReceipts((current) => [...current, ...result.receipts])
        setProgress({ done: Math.min(start + chunk.length, pending.length), total: pending.length })
        // ⚠️ 这里**不再**逐批通知外层（第四轮，审核 P2-7）：外层收到就会重取岗位列表，
        // 而它此刻正被遮罩盖着 —— 用户看不到任何变化，代价却是一轮轮重取重绘。
        // 改为整轮结束后（finally）通知一次。
      }
      note('ok', `批量投递完成：成功 ${String(sent)} 条、失败 ${String(failed)} 条`)
    } catch (caught) {
      // 已经投出去的那些**不会**被撤销，所以文案只说"剩下的没投成"
      note('error', `投递中断：${reasonOf(caught)}（前面已经投出去的不会撤回）`)
    } finally {
      setSending(false)
      // 有实际投递动作才通知外层刷新（投递记录 / 看板 / 岗位状态可能都变了）；
      // 一条都没动过时不必让外层白重取一次。
      if (sent + failed > 0) props.onBatchDone(sent, failed)
    }
  }

  const receiptOf = (jobId: number): ApplicationBatchReceiptDto | undefined =>
    receipts.find((receipt) => receipt.jobId === jobId)

  /** 回执里"没确认送达"的条数 —— 这一批里最需要被提醒的部分。 */
  const unconfirmed = receipts.filter(
    (receipt) => receipt.ok && receipt.delivery !== null && receipt.delivery !== 'delivered',
  ).length

  return (
    <Modal
      title="批量投递简历"
      label="批量投递简历"
      size="lg"
      onClose={sending ? () => undefined : props.onClose}
      footer={
        <>
          {sending && progress !== null ? (
            <span className="jh-muted">
              正在投递 {progress.done}/{progress.total}（每条之间会等 {intervalSec}，分批之间也一样，慢是故意的）
            </span>
          ) : null}
          {/* 本轮汇总就地显示（第四轮，审核 P2-5）：它同时也写给了外层列表栏，
              但那一层正被弹窗遮罩盖着 —— 用户在这里就该看到结果，不必先关弹窗。 */}
          {summary === null ? null : (
            <span
              className={`jh-modal-foot-note ${summary.tone === 'ok' ? 'jh-ok' : 'jh-error'}`}
              role={summary.tone === 'ok' ? 'status' : 'alert'}
            >
              {summary.text}
            </span>
          )}
          <span className="jh-spacer" />
          <button type="button" className="jh-btn jh-btn-inline" disabled={sending} onClick={props.onClose}>
            关闭
          </button>
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-primary"
            disabled={sending || plan === null || deliverable.length === 0}
            onClick={() => void run()}
          >
            {sending ? '投递中…' : `确认投递（${String(deliverable.length)} 条 / 分 ${String(batches)} 批）`}
          </button>
        </>
      }
    >
      <p className="jh-note">
        <InlineMd text="投递**不可逆**：平台一旦收到，撤回不了。所以这里一次最多发 5 条，而且每条会单独留一条回执（含送达状态）。" />
      </p>
      {error === null ? null : <p className="jh-error">{error}</p>}
      {plan === null && error === null ? <p className="jh-muted">正在检查这些岗位能不能投…</p> : null}

      {plan === null ? null : (
        <>
          <p className="jh-note">
            共 {plan.items.length} 条：<b>能投 {plan.sendable} 条</b>、投不了 {plan.blocked} 条。
            {batches > 1
              ? `一次请求最多投 ${String(batchMax)} 条，所以会分 ${String(batches)} 批依次发出（每批结束后这里会更新回执）。`
              : ''}
          </p>

          <div className="jh-ctl">
            <span className="jh-field-label">
              用哪份简历
              <FieldHint text="**平台上收到的**是平台自己那份简历（平台没有把本地文件发给 HR 的入口，我们改不了它）。这里选的是**这次投递在你的记录里归到哪一版** ——「哪版回复率高」这类对比要靠它，所以选得准一点更有用。不选就不登记版本。" />
            </span>
            <ResumeFilePicker
              value={resumeFileId}
              disabled={sending}
              onChange={(next) => {
                setResumeFileId(next)
                // 换简历等于换了这一批的登记口径：让用户重新确认一次
                setReceipts([])
              }}
            />
          </div>
          {/* 选完必须把"传不传得上去"说明白 —— 这是投递里最容易误会的一格 */}
          {plan.uploadsResumeFile === null ? null : (
            <p className={plan.uploadsResumeFile ? 'jh-muted' : 'jh-warn'}>
              {plan.uploadsResumeFile ? (
                '这些平台接受本地附件：投递时会把选中的那份文件传上去。'
              ) : (
                <InlineMd
                  text={
                    '选中的那份文件**不会**上传 —— 这些平台只吃它们自己那份简历。' +
                    '这一批会照投（用的是平台上已有的那份），你选的版本只作**本地登记**（归因用）。' +
                    '要换平台上那份，得先去平台上换。'
                  }
                />
              )}
            </p>
          )}
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
                        checked={item.willDeliver && !off}
                        disabled={!item.willDeliver || sending}
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
                      <span className={receiptClass(receipt)}>
                        {receipt.ok
                          ? `已投递（${DELIVERY_STATE_LABEL[receipt.delivery ?? 'missing']}）`
                          : (receipt.message ?? '失败')}
                      </span>
                    )}
                  </div>

                  {item.willDeliver ? (
                    <div className="jh-muted">
                      会真的点下平台的「投递」按钮
                      {item.sideEffect === null ? '' : ` · 同时会发生：${item.sideEffect}`}
                    </div>
                  ) : (
                    <div className="jh-muted">
                      投不了：{item.blocker?.message}
                      {item.blocker?.hint === undefined ? '' : ` —— ${item.blocker.hint}`}
                    </div>
                  )}

                  {/* 提醒（不阻止）：同一岗位的另一个平台副本已经投过了 —— 跨平台重复投递
                      正是去重想帮用户避免的重复劳动。分组是启发式的，所以只提醒、不拦。 */}
                  {item.warning === null || item.warning === undefined ? null : (
                    <div className="jh-warn">{item.warning}</div>
                  )}
                </li>
              )
            })}
          </ul>

          {receipts.length === 0 ? null : (
            <details className="jh-details" open>
              <summary>回执（{receipts.length} 条，逐条）</summary>
              {unconfirmed === 0 ? null : (
                <p className="jh-error">
                  {unconfirmed} 条只到「{DELIVERY_STATE_LABEL.pending}」：动作可能已经生效，
                  <b>先去平台上核对，不要直接重投</b>（投递不像打招呼，投重了收不回来）。
                </p>
              )}
              <ul className="jh-tailor-notes">
                {receipts.map((receipt) => (
                  <li key={receipt.jobId} className={receiptClass(receipt)}>
                    {/* 手画 SVG 而不是 ✅/❌ emoji（第四轮，审核 P3）；状态与送达态另有文字说明 */}
                    <span className="jh-receipt-mark">
                      {receipt.ok ? <IconCheck /> : <IconCross />}
                    </span>
                    {receipt.company || receipt.title}：
                    {receipt.ok
                      ? `已投递（${DELIVERY_STATE_LABEL[receipt.delivery ?? 'missing']}，` +
                        `${receipt.sentAt === null ? '' : formatLocalDateTime(receipt.sentAt)}）`
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
