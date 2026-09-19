import { useRef } from 'react'
import { useDialogA11y } from '../../hooks/use-dialog-a11y.js'
import type { LlmCallDto } from '../../net/types.js'
import { InlineMd } from '../../ui/inline-md.js'
import { copyToClipboard } from './clipboard.js'

/**
 * 一次模型调用的完整留痕（JSON 查看器）。
 *
 * 为什么用抽屉而不是把 JSON 塞进单元格：留痕里 `fields` 与 `ref` 加起来常常几十行，
 * 摊在表格里会把其它列挤成一条（这正是原来的问题）。
 */
export function PayloadDrawer(props: {
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
