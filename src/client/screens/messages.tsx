import { useState } from 'react'
import { INTERVIEW_KIND_LABEL, INTERVIEW_KINDS, INTERVIEW_STATE_LABEL } from '../../shared/enums.js'
import type { InterviewKind, InterviewState } from '../../shared/enums.js'
import type { MessageDto } from '../../shared/dto.js'
import {
  ApiError,
  createInterview,
  deleteInterview,
  extractInterview,
  fetchInbox,
  fetchInterviewPrep,
  fetchInterviews,
  markMessageRead,
  recordMessage,
  replyMessage,
  setInterviewState,
} from '../api.js'
import { useAsync } from '../use-async.js'

/**
 * U6 消息中心（§13）。
 *
 * 一条刻意的产品规则：**识别面试邀约 != 改状态**。
 * 规则命中只标一个 ⚠ 提示，改状态要用户自己点 —— 误判一次就会让一个真在推进的岗位被漏掉。
 * 这里也允许手动录入消息：平台收件箱的自动解析属于 P8，现在不假装能做。
 */
export function InboxScreen(props: { revision: number; onChanged: () => void; onSelectJob: (id: number) => void }) {
  const inbox = useAsync((signal) => fetchInbox({}, signal), [props.revision])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const filtered = useAsync(
    (signal) => fetchInbox({ unreadOnly }, signal),
    [props.revision, unreadOnly],
  )
  const [draft, setDraft] = useState('')
  const [encoding, setEncoding] = useState(false)
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /** 「识别日程」面板：从消息抽出并让用户确认后再建面试（识别 ≠ 改状态）。 */
  const [extracting, setExtracting] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [extractPanel, setExtractPanel] = useState<{
    messageId: number
    jobId: number | null
    at: string
    kind: InterviewKind
    place: string
    link: string
    via: 'llm' | 'fallback'
    notes: string[]
  } | null>(null)

  const patchExtract = (patch: Partial<NonNullable<typeof extractPanel>>): void => {
    setExtractPanel((current) => (current === null ? null : { ...current, ...patch }))
  }

  const handleExtract = async (message: MessageDto): Promise<void> => {
    setExtracting(message.id)
    setError(null)
    try {
      const suggestion = await extractInterview(message.id)
      setExtractPanel({
        messageId: message.id,
        jobId: message.jobId,
        at: suggestion.at ?? '',
        kind: suggestion.kind ?? 'video',
        place: suggestion.place ?? '',
        link: suggestion.link ?? '',
        via: suggestion.via,
        notes: suggestion.notes,
      })
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setExtracting(null)
    }
  }

  const confirmInterview = async (): Promise<void> => {
    const panel = extractPanel
    if (panel === null || panel.at === '') return
    setCreating(true)
    setError(null)
    try {
      await createInterview({
        at: new Date(panel.at).toISOString(),
        kind: panel.kind,
        ...(panel.jobId === null ? {} : { jobId: panel.jobId }),
        ...(panel.place.trim() === '' ? {} : { place: panel.place.trim() }),
        ...(panel.link.trim() === '' ? {} : { link: panel.link.trim() }),
      })
      setNotice('已加入面试日程 —— 建议到「面试日程」里再核对一遍时间与形式。')
      setExtractPanel(null)
      props.onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setCreating(false)
    }
  }

  const data = filtered.state.status === 'ok' ? filtered.state.data : inbox.state.status === 'ok' ? inbox.state.data : null

  const run = async (fn: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(done)
      props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">消息中心</h2>
        <span className="jh-muted">未读 {data?.unread ?? 0} 条</span>
        <span className="jh-spacer" />
        <button
          type="button"
          className={`jh-btn jh-btn-inline${unreadOnly ? ' jh-btn-active' : ''}`}
          onClick={() => setUnreadOnly((value) => !value)}
        >
          只看未读
        </button>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}

      <div className="jh-card">
        <h3 className="jh-card-title">手动录入一条消息</h3>
        <p className="jh-muted">
          平台收件箱的自动解析还没做（属于 P8）—— 现在你可以把 HR 的消息贴进来，
          系统和状态推进、跟进建议就能联动。
        </p>
        <textarea
          className="jh-textarea"
          rows={2}
          /* 录入框必须有可访问名称：原来只有 placeholder，
             输入一次之后 placeholder 就消失，读屏也拿不到标签。 */
          aria-label="要录入的消息内容"
          placeholder="把 HR 发来的消息贴在这里…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="jh-detail-actions">
          <button
            type="button"
            className="jh-btn"
            disabled={busy || draft.trim() === ''}
            onClick={() =>
              void run(
                async () => await recordMessage({ platformId: 'manual', direction: 'hr', content: draft.trim() }),
                '已录入（如果是面试邀约，下面会标出来 —— 但状态要你自己改）',
              ).then(() => setDraft(''))
            }
          >
            录入
          </button>
        </div>
      </div>

      {data === null ? (
        <p className="jh-muted">正在读取消息…</p>
      ) : data.items.length === 0 ? (
        <p className="jh-muted">没有消息。消息目前靠手动录入，或在岗位详情里跟进。</p>
      ) : (
        <ul className="jh-messages">
          {data.items.map((message) => (
            <li className={`jh-message jh-message-${message.direction}`} key={message.id}>
              <div className="jh-message-head">
                <b>{message.direction === 'hr' ? 'HR' : '我'}</b>
                <span className="jh-muted">{message.at.slice(0, 16).replace('T', ' ')}</span>
                {message.jobTitle === null ? null : (
                  <button
                    type="button"
                    className="jh-link"
                    onClick={() => message.jobId !== null && props.onSelectJob(message.jobId)}
                  >
                    {message.companyName ?? ''} {message.jobTitle}
                  </button>
                )}
                <span className="jh-spacer" />
                {message.readAt === null && message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={busy}
                    onClick={() => void run(async () => await markMessageRead(message.id), '已标记已读')}
                  >
                    标记已读
                  </button>
                ) : null}
                {message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={extracting !== null}
                    onClick={() => void handleExtract(message)}
                  >
                    {extracting === message.id ? '识别中…' : '识别日程'}
                  </button>
                ) : null}
                {message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    onClick={() => {
                      setReplyTo(replyTo === message.id ? null : message.id)
                      setReplyText('')
                    }}
                  >
                    {replyTo === message.id ? '取消' : '回复'}
                  </button>
                ) : null}
              </div>
              <p className="jh-message-body">{message.content}</p>
              {message.inviteSignal?.hit === true ? (
                <p className="jh-warn">
                  ⚠ 疑似面试邀约（命中：{message.inviteSignal.keywords.join('、')}）
                  —— 这只是提示，改状态请到「面试日程」里显式新建一场。
                </p>
              ) : null}
              {extractPanel !== null && extractPanel.messageId === message.id ? (
                <div className="jh-message-reply">
                  <p className="jh-muted">
                    识别结果（来源：{extractPanel.via === 'llm' ? '模型' : '规则'}）—— 核对后确认才进日程。
                  </p>
                  <div className="jh-inline">
                    <input
                      className="jh-input"
                      type="datetime-local"
                      aria-label="面试时间"
                      value={extractPanel.at}
                      onChange={(event) => patchExtract({ at: event.target.value })}
                    />
                    <select
                      className="jh-select jh-input-sm"
                      aria-label="面试形式"
                      value={extractPanel.kind}
                      onChange={(event) => patchExtract({ kind: event.target.value as InterviewKind })}
                    >
                      {INTERVIEW_KINDS.map((kind) => (
                        <option key={kind} value={kind}>{INTERVIEW_KIND_LABEL[kind]}</option>
                      ))}
                    </select>
                    <input
                      className="jh-input jh-input-sm"
                      placeholder="地点"
                      aria-label="地点"
                      value={extractPanel.place}
                      onChange={(event) => patchExtract({ place: event.target.value })}
                    />
                    <input
                      className="jh-input"
                      placeholder="会议链接"
                      aria-label="会议链接"
                      value={extractPanel.link}
                      onChange={(event) => patchExtract({ link: event.target.value })}
                    />
                  </div>
                  {extractPanel.notes.length === 0 ? null : (
                    <p className="jh-muted">{extractPanel.notes.join('；')}</p>
                  )}
                  <div className="jh-detail-actions">
                    <button
                      type="button"
                      className="jh-btn"
                      disabled={creating || extractPanel.at === ''}
                      onClick={() => void confirmInterview()}
                    >
                      加入面试日程
                    </button>
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-quiet"
                      disabled={creating}
                      onClick={() => setExtractPanel(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              {replyTo === message.id ? (
                <div className="jh-message-reply">
                  <textarea
                    className="jh-textarea"
                    rows={2}
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="回复内容…"
                  />
                  <button
                    type="button"
                    className="jh-btn"
                    disabled={busy || replyText.trim() === ''}
                    onClick={() =>
                      void run(
                        async () => await replyMessage(message.id, replyText.trim()),
                        '已回复（回复是会真的发出去的动作，走的是同一道闸门）',
                      ).then(() => {
                        setReplyTo(null)
                        setReplyText('')
                      })
                    }
                  >
                    发送回复
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * U7 面试日程（§13）—— 别撞车别迟到。
 *
 * 冲突是**后端算好的**（含通勤缓冲窗），界面上直接高亮；
 * 通勤只在现场面试里才有意义，视频/电话面试不制造假警告。
 */
export function InterviewsScreen(props: { revision: number; onChanged: () => void; onSelectJob: (id: number) => void }) {
  const list = useAsync((signal) => fetchInterviews(signal), [props.revision])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [prepId, setPrepId] = useState<number | null>(null)
  const [at, setAt] = useState('')
  const [kind, setKind] = useState<InterviewKind>('video')
  const [commute, setCommute] = useState('')

  const run = async (fn: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(done)
      props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const data = list.state.status === 'ok' ? list.state.data : null

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">面试日程</h2>
        {data !== null && data.conflicts.length > 0 ? (
          <span className="jh-warn">⚠ {data.conflicts.length} 处时间冲突</span>
        ) : (
          <span className="jh-ok">没有时间冲突</span>
        )}
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}

      <div className="jh-card">
        <h3 className="jh-card-title">新增一场面试</h3>
        <div className="jh-inline">
          {/* 这三个控件原来都没有可访问名称（只有类型与 placeholder 可见），
              而它们必须填对才能录入一场面试 —— 读屏用户不知道哪个框是什么。 */}
          <input
            className="jh-input"
            type="datetime-local"
            aria-label="面试时间"
            value={at}
            onChange={(event) => setAt(event.target.value)}
          />
          <select className="jh-select" aria-label="面试形式" value={kind} onChange={(event) => setKind(event.target.value as InterviewKind)}>
            {(['onsite', 'video', 'phone', 'other'] as const).map((item) => (
              <option key={item} value={item}>
                {INTERVIEW_KIND_LABEL[item]}
              </option>
            ))}
          </select>
          <input
            className="jh-input jh-input-narrow"
            type="number"
            aria-label="单程通勤分钟数"
            placeholder="通勤分钟"
            value={commute}
            onChange={(event) => setCommute(event.target.value)}
            disabled={kind !== 'onsite'}
            title="只有现场面试才算通勤"
          />
          <button
            type="button"
            className="jh-btn"
            disabled={busy || at === ''}
            onClick={() =>
              void run(
                async () =>
                  await createInterview({
                    // datetime-local 给的是本地时间字符串，补成 ISO
                    at: new Date(at).toISOString(),
                    kind,
                    ...(kind === 'onsite' && commute !== '' ? { commuteMin: Number(commute) } : {}),
                  }),
                '已新增（如果这个岗位打过招呼，接触态会自动推进到「已约面」）',
              ).then(() => {
                setAt('')
                setCommute('')
              })
            }
          >
            新增
          </button>
        </div>
      </div>

      {data === null ? (
        <p className="jh-muted">正在读取面试…</p>
      ) : data.items.length === 0 ? (
        <p className="jh-muted">还没有面试安排。</p>
      ) : (
        <ul className="jh-interviews">
          {data.items.map((interview) => (
            <li
              className={`jh-interview${interview.conflicts.length > 0 ? ' jh-interview-conflict' : ''}`}
              key={interview.id}
            >
              <div className="jh-message-head">
                <b>{interview.at.slice(0, 16).replace('T', ' ')}</b>
                <span className="jh-muted">
                  {INTERVIEW_KIND_LABEL[interview.kind]} · 第 {interview.round} 轮 ·{' '}
                  {INTERVIEW_STATE_LABEL[interview.state]}
                </span>
                {interview.jobId === null ? null : (
                  <button type="button" className="jh-link" onClick={() => props.onSelectJob(interview.jobId as number)}>
                    {interview.companyName ?? ''} {interview.jobTitle ?? ''}
                  </button>
                )}
                <span className="jh-spacer" />
                <span className="jh-muted">
                  {interview.hoursUntil >= 0 ? `${interview.hoursUntil} 小时后` : '已过'}
                </span>
              </div>
              {interview.conflicts.length > 0 ? (
                <p className="jh-warn">⚠ 与面试 #{interview.conflicts.join('、#')} 时间冲突</p>
              ) : null}
              {interview.kind === 'onsite' ? (
                <p className="jh-muted">
                  {interview.commuteMin === null
                    ? '现场面试但没填通勤时长 —— 建议补上，否则"别迟到"就是空话。'
                    : `单程约 ${interview.commuteMin} 分钟，建议提前 ${interview.commuteMin + 30} 分钟出发。`}
                </p>
              ) : null}
              <div className="jh-detail-actions">
                {(['confirmed', 'done', 'cancelled', 'rescheduled'] as const).map((state) => (
                  <button
                    key={state}
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        async () =>
                          await setInterviewState(
                            interview.id,
                            state as InterviewState,
                            // 改期必须显式确认（会影响别人的日程）
                            state === 'rescheduled',
                          ),
                        `已标记为「${INTERVIEW_STATE_LABEL[state]}」`,
                      )
                    }
                  >
                    {INTERVIEW_STATE_LABEL[state]}
                  </button>
                ))}
                <button
                  type="button"
                  className="jh-btn jh-btn-inline"
                  onClick={() => setPrepId(prepId === interview.id ? null : interview.id)}
                >
                  {prepId === interview.id ? '收起准备包' : '准备包'}
                </button>
                <button
                  type="button"
                  className="jh-btn jh-btn-inline"
                  disabled={busy}
                  onClick={() => void run(async () => await deleteInterview(interview.id), '已删除')}
                >
                  删除
                </button>
              </div>
              {prepId === interview.id ? <PrepPanel id={interview.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 准备包：技能差距 + 公司风险 + 错题 + 检查清单。 */
function PrepPanel(props: { id: number }) {
  const prep = useAsync((signal) => fetchInterviewPrep(props.id, signal), [props.id])
  if (prep.state.status !== 'ok') return <p className="jh-muted">正在准备…</p>
  const data = prep.state.data
  return (
    <div className="jh-card jh-card-tight">
      <p className="jh-muted">{data.commute.advice}</p>
      {data.matchedSkills.length > 0 ? (
        <p className="jh-muted">你有的：{data.matchedSkills.join('、')}</p>
      ) : null}
      {data.missingSkills.length > 0 ? (
        <p className="jh-warn">
          会被追问但你简历里没有的：{data.missingSkills.slice(0, 10).join('、')} ——
          如实说"没用过，但我知道它解决什么问题"，不要硬扯。
        </p>
      ) : null}
      {data.companyFlags.length > 0 ? <p className="jh-warn">公司风险：{data.companyFlags.join('；')}</p> : null}
      {data.questionNotes.length > 0 ? (
        <div>
          <p className="jh-muted">错题本（按被问次数）：</p>
          <ul className="jh-tailor-notes">
            {data.questionNotes.slice(0, 5).map((note) => (
              <li key={note.id}>
                · {note.question}（{note.times} 次）
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="jh-tailor-notes">
        {data.checklist.map((item, index) => (
          <li key={String(index)}>· {item}</li>
        ))}
      </ul>
      {data.notes.map((note, index) => (
        <p className="jh-muted" key={String(index)}>
          注意：{note}
        </p>
      ))}
    </div>
  )
}
