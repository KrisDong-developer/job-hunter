import type { InterviewKind, InterviewState } from '../../../shared/enums.js'
import { INTERVIEW_KIND_LABEL, INTERVIEW_STATE_LABEL } from '../../../shared/enums.js'
import { useAsync } from '../../hooks/use-async.js'
import { ApiError } from '../../net/client.js'
import { createInterview, deleteInterview, fetchInterviews, setInterviewState } from '../../net/inbox.js'
import { PrepPanel } from './prep-panel.js'
import { useState } from 'react'

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




