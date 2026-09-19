import { REMOTE_KIND_LABEL, VISA_STANCE_LABEL } from '../../../shared/enums.js'
import { ApiError } from '../../net/client.js'
import { analyzeOverseas, draftCoverLetter, fetchTimezone } from '../../net/overseas.js'
import { createElement, useState } from 'react'

/** 海外时区预设：常用城市 → IANA 时区。给不想手敲 America/New_York 的人一条捷径。 */
const TZ_PRESETS: Array<{ label: string; tz: string }> = [
  { label: '纽约 New York', tz: 'America/New_York' },
  { label: '芝加哥 Chicago', tz: 'America/Chicago' },
  { label: '洛杉矶 Los Angeles', tz: 'America/Los_Angeles' },
  { label: '伦敦 London', tz: 'Europe/London' },
  { label: '巴黎 Paris', tz: 'Europe/Paris' },
  { label: '柏林 Berlin', tz: 'Europe/Berlin' },
  { label: '新加坡 Singapore', tz: 'Asia/Singapore' },
  { label: '香港 Hong Kong', tz: 'Asia/Hong_Kong' },
  { label: '东京 Tokyo', tz: 'Asia/Tokyo' },
  { label: '悉尼 Sydney', tz: 'Australia/Sydney' },
]


/**
 * 海外支线面板（§4.M）—— 放在岗位详情里，因为它回答的是"这个岗位值不值得投"。
 *
 * 三件事：工签立场（含不确定性与依据）、时区双重换算、Cover Letter。
 */
export function OverseasPanel(props: { jobId: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{
    stance: string
    evidence: string[]
    uncertainty: string | null
    remoteKind: string
  } | null>(null)
  const [letter, setLetter] = useState<string | null>(null)
  const [letterCopied, setLetterCopied] = useState(false)
  const [tz, setTz] = useState('America/New_York')
  const [interviewAt, setInterviewAt] = useState('')
  const [display, setDisplay] = useState<{ counterpart: string; local: string; diffHours: number; warning: string | null } | null>(null)

  /**
   * `mutates` 决定要不要通知外面"数据变了"。
   *
   * 时区换算是**纯查询**（读一次 `Intl` 格式化），它不该让整个面板重新拉一遍数据 ——
   * 之前它也会 `onChanged()`，于是点一次「换算」全屏刷新一次。
   */
  const run = async (
    fn: () => Promise<unknown>,
    onDone: (value: unknown) => void,
    mutates = true,
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onDone(await fn())
      if (mutates) props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  /** 复制到剪贴板；桌面宿主不一定有 clipboard API，退回临时 textarea 兜底。 */
  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
  }

  const copyLetter = async (): Promise<void> => {
    if (letter === null) return
    await copyText(letter)
    setLetterCopied(true)
    window.setTimeout(() => setLetterCopied(false), 2000)
  }

  return (
    <section className="jh-tailor">
      <h3 className="jh-card-title">海外 / 远程</h3>
      <div className="jh-detail-actions">
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy}
          onClick={() =>
            void run(
              async () => await analyzeOverseas(props.jobId),
              (value) => {
                const result = value as { stance: string; evidence: string[]; uncertainty: string | null; remoteKind: string }
                setAnalysis(result)
              },
            )
          }
        >
          识别工签与工作模式
        </button>
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={busy}
          onClick={() =>
            void run(
              async () => await draftCoverLetter({ jobId: props.jobId, language: 'en' }),
              (value) => {
                setLetter((value as { content: string }).content)
                setLetterCopied(false)
              },
            )
          }
        >
          生成 Cover Letter
        </button>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}

      {analysis === null ? null : (
        <div className="jh-card jh-card-tight">
          <p className="jh-muted">
            工签立场：
            <b>{VISA_STANCE_LABEL[analysis.stance as keyof typeof VISA_STANCE_LABEL] ?? analysis.stance}</b>
            ｜工作模式：
            <b>{REMOTE_KIND_LABEL[analysis.remoteKind as keyof typeof REMOTE_KIND_LABEL] ?? analysis.remoteKind}</b>
          </p>
          {analysis.evidence.length === 0 ? null : (
            <p className="jh-muted">依据：{analysis.evidence.join('、')}</p>
          )}
          {analysis.uncertainty === null ? null : <p className="jh-warn">{analysis.uncertainty}</p>}
        </div>
      )}

      <div className="jh-card jh-card-tight">
        <p className="jh-muted">面试时间双重换算（算错时区 = 直接错过面试）：</p>
        <div className="jh-inline">
          <input
            className="jh-input"
            type="datetime-local"
            value={interviewAt}
            onChange={(event) => setInterviewAt(event.target.value)}
          />
          {/* 城市预设下拉：选中即写好 IANA 串，不认识的仍可手动输。
              值只有在你填的就是预设里的时区时才高亮，否则显示占位文案。 */}
          <select
            className="jh-select jh-input-sm"
            aria-label="常用城市时区预设"
            value={TZ_PRESETS.some((p) => p.tz === tz) ? tz : ''}
            onChange={(event) => setTz(event.target.value)}
          >
            <option value="">选常用城市…</option>
            {TZ_PRESETS.map((preset) => (
              <option key={preset.tz} value={preset.tz}>{preset.label}</option>
            ))}
          </select>
          <input className="jh-input" value={tz} onChange={(event) => setTz(event.target.value)} placeholder="America/New_York" aria-label="时区（IANA）" />
          <button
            type="button"
            className="jh-btn"
            disabled={busy || interviewAt === '' || tz.trim() === ''}
            onClick={() =>
              void run(
                async () => await fetchTimezone(new Date(interviewAt).toISOString(), tz.trim()),
                (value) => {
                  const result = value as {
                    counterpart: { text: string }
                    local: { text: string }
                    diffHours: number
                    warning: string | null
                  }
                  setDisplay({
                    counterpart: result.counterpart.text,
                    local: result.local.text,
                    diffHours: result.diffHours,
                    warning: result.warning,
                  })
                },
                false,
              )
            }
          >
            换算
          </button>
        </div>
        {display === null ? null : (
          <p className="jh-muted">
            对方 {display.counterpart}｜本地 {display.local}｜时差 {display.diffHours} 小时
            {display.warning === null ? null : <b className="jh-warn"> ⚠ {display.warning}</b>}
          </p>
        )}
      </div>

      {letter === null ? null : (
        <div className="jh-tv-draft">
          <div className="jh-copy-head">
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-tiny"
              onClick={() => void copyLetter()}
            >
              {letterCopied ? '已复制' : '复制全文'}
            </button>
          </div>
          <pre className="jh-tv-pre">{letter}</pre>
        </div>
      )}
    </section>
  )
}




