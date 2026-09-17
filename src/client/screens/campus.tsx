import { useState } from 'react'
import {
  ASSESSMENT_KIND_LABEL,
  ASSESSMENT_STATE_LABEL,
  CAMPUS_BATCH_LABEL,
  CAMPUS_STAGE_LABEL,
  REMOTE_KIND_LABEL,
  TRIPARTITE_STATE_LABEL,
  VISA_STANCE_LABEL,
} from '../../shared/enums.js'
import type { AssessmentKind, AssessmentState, CampusStage, TripartiteState } from '../../shared/enums.js'
import {
  advanceCampus,
  analyzeOverseas,
  ApiError,
  createAssessment,
  createCampus,
  createTripartite,
  draftCoverLetter,
  fetchCampus,
  fetchCoverLetters,
  fetchEnglishCheck,
  fetchTimezone,
  fetchTripartite,
  setAssessmentState,
  setTripartiteState,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { useAsync } from '../use-async.js'

/**
 * 校招支线（§4.L）。
 *
 * 这一屏的**中心是硬截止**，不是记录列表 —— 校招与社招最大的差别就在于
 * 「笔试错过即终态、网申错过等一年」（§12.7）。
 * 所以截止卡片放在最上面，而且用 ⛔/⚠ 明确区分"已过期"与"24 小时内"。
 */
export function CampusScreen(props: { revision: number; onChanged: () => void }) {
  const data = useAsync((signal) => fetchCampus(signal), [props.revision])
  const tripartite = useAsync((signal) => fetchTripartite(signal), [props.revision])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [dueFor, setDueFor] = useState<number | null>(null)

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

  const items = data.state.status === 'ok' ? data.state.data.items : []
  const windows = data.state.status === 'ok' ? data.state.data.windows : []

  /**
   * 待处理的截止，与**已经错过的**分开两份。
   *
   * 已错过的一律留下：不可逆的事必须显式认账，不能让它在界面上悄悄消失 ——
   * "看不到了"和"没发生"是两回事，而校招里这个区别意味着要不要重新规划一年。
   */
  const allAssessments = items.flatMap((item) =>
    item.assessments.map((assessment) => ({
      item,
      assessment,
      label: `${item.companyName ?? item.note ?? `#${String(item.id)}`} · ${ASSESSMENT_KIND_LABEL[assessment.kind]}`,
    })),
  )
  const deadlines = allAssessments
    .filter(
      (entry) =>
        entry.assessment.state !== 'done' &&
        entry.assessment.state !== 'missed' &&
        entry.assessment.hoursLeft !== null,
    )
    .map((entry) => ({
      label: entry.label,
      hoursLeft: entry.assessment.hoursLeft ?? 0,
      dueAt: entry.assessment.dueAt ?? '',
      id: entry.assessment.id,
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const missed = allAssessments.filter((entry) => entry.assessment.state === 'missed')

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">校招支线</h2>
        <span className="jh-muted">
          <InlineMd text="秋招春招是**硬时间窗**，笔试与三方是**不可逆节点** —— 这一屏的重心就是别错过。" />
        </span>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}

      <div className="jh-card">
        <h3 className="jh-card-title">硬截止</h3>
        {/* 即使没有待处理的，也要把"已错过"列出来 —— 否则它会静默消失 */}
        {deadlines.length === 0 && missed.length === 0 ? (
          <p className="jh-ok">没有待处理的笔试/测评截止。</p>
        ) : null}
        {deadlines.length === 0 && missed.length > 0 ? (
          <p className="jh-muted">没有待处理的截止。</p>
        ) : null}
        {deadlines.length === 0 ? null : (
          <ul className="jh-deadlines">
            {deadlines.map((deadline) => (
              <li
                key={deadline.id}
                className={`jh-deadline${deadline.hoursLeft < 0 ? ' jh-deadline-overdue' : deadline.hoursLeft <= 24 ? ' jh-deadline-urgent' : ''}`}
              >
                <b>{deadline.hoursLeft < 0 ? '⛔ 已过期' : deadline.hoursLeft <= 24 ? '⚠ 紧急' : '·'}</b>{' '}
                {deadline.label}｜{deadline.dueAt.slice(0, 16).replace('T', ' ')}｜
                {deadline.hoursLeft < 0
                  ? `已过 ${String(-deadline.hoursLeft)} 小时`
                  : `还剩 ${String(deadline.hoursLeft)} 小时`}
              </li>
            ))}
          </ul>
        )}
        {missed.length === 0 ? null : (
          <>
            <p className="jh-error">已错过（终态，不可改回）：</p>
            <ul className="jh-deadlines">
              {missed.map((entry) => (
                <li className="jh-deadline jh-deadline-overdue" key={entry.assessment.id}>
                  ⛔ {entry.label}｜{entry.assessment.dueAt?.slice(0, 16).replace('T', ' ') ?? ''}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="jh-muted">笔试/测评错过就是终态（§12.7），没有第二次机会。</p>
      </div>

      <div className="jh-card">
        <h3 className="jh-card-title">批次时间窗</h3>
        <p className="jh-muted">
          {windows
            .map(
              (window) =>
                `${CAMPUS_BATCH_LABEL[window.batch]} ${String(window.count)} 条（${String(window.openCount)} 个还没网申）` +
                `${window.nextCloseAt === null ? '' : `，最近截止 ${window.nextCloseAt.slice(0, 10)}`}`,
            )
            .join('　|　')}
        </p>
        <div className="jh-inline">
          <input
            className="jh-input"
            placeholder="公司名"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="jh-input"
            type="date"
            title="网申截止"
            value={closeAt}
            onChange={(event) => setCloseAt(event.target.value)}
          />
          <button
            type="button"
            className="jh-btn"
            disabled={busy || name.trim() === ''}
            onClick={() =>
              void run(
                async () =>
                  await createCampus({
                    note: name.trim(),
                    ...(closeAt === '' ? {} : { applyCloseAt: new Date(closeAt).toISOString() }),
                  }),
                '已新建校招记录',
              ).then(() => {
                setName('')
                setCloseAt('')
              })
            }
          >
            新建
          </button>
        </div>
      </div>

      {data.state.status !== 'ok' ? (
        <p className="jh-muted">正在读取校招记录…</p>
      ) : items.length === 0 ? (
        <p className="jh-muted">还没有校招记录。上面填一个公司名就能开始跟踪。</p>
      ) : (
        <ul className="jh-campus-list">
          {items.map((item) => (
            <li className="jh-campus-item" key={item.id}>
              <div className="jh-message-head">
                <b>{item.companyName ?? item.note ?? `#${String(item.id)}`}</b>
                <span className="jh-badge">{CAMPUS_BATCH_LABEL[item.batch]}</span>
                <span className="jh-muted">{CAMPUS_STAGE_LABEL[item.stage]}</span>
                {item.applyCloseAt === null ? null : (
                  <span className="jh-muted">网申截止 {item.applyCloseAt.slice(0, 10)}</span>
                )}
              </div>
              <div className="jh-detail-actions">
                {(['applied', 'assessment_pending', 'interview_pending', 'final', 'closed'] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        async () => await advanceCampus(item.id, stage as CampusStage),
                        `已标记为「${CAMPUS_STAGE_LABEL[stage]}」`,
                      )
                    }
                  >
                    {CAMPUS_STAGE_LABEL[stage]}
                  </button>
                ))}
                <button
                  type="button"
                  className="jh-btn jh-btn-inline"
                  onClick={() => setDueFor(dueFor === item.id ? null : item.id)}
                >
                  {dueFor === item.id ? '收起' : '加笔试'}
                </button>
              </div>

              {dueFor === item.id ? (
                <div className="jh-inline">
                  <input
                    className="jh-input"
                    type="datetime-local"
                    title="笔试截止（必填 —— 没有截止时间的笔试做不出提醒）"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                  <button
                    type="button"
                    className="jh-btn"
                    disabled={busy || dueAt === ''}
                    onClick={() =>
                      void run(
                        async () =>
                          await createAssessment({
                            campusApplicationId: item.id,
                            dueAt: new Date(dueAt).toISOString(),
                            kind: 'written' as AssessmentKind,
                          }),
                        '已记录笔试（会出现在上面的硬截止里）',
                      ).then(() => {
                        setDueAt('')
                        setDueFor(null)
                      })
                    }
                  >
                    记录
                  </button>
                </div>
              ) : null}

              {item.assessments.length === 0 ? null : (
                <ul className="jh-tailor-notes">
                  {item.assessments.map((assessment) => (
                    <li key={assessment.id}>
                      · {ASSESSMENT_KIND_LABEL[assessment.kind]}｜{ASSESSMENT_STATE_LABEL[assessment.state]}｜
                      截止 {assessment.dueAt?.slice(0, 16).replace('T', ' ') ?? '未填'}
                      {assessment.state === 'pending' ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="jh-link"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                async () => await setAssessmentState(assessment.id, 'done' as AssessmentState),
                                '已标记完成',
                              )
                            }
                          >
                            标记完成
                          </button>
                          {' '}
                          <button
                            type="button"
                            className="jh-link"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                async () => await setAssessmentState(assessment.id, 'missed' as AssessmentState),
                                '已标记错过（终态，不可改回）',
                              )
                            }
                          >
                            标记错过
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="jh-card">
        <h3 className="jh-card-title">三方协议</h3>
        <p className="jh-muted">
          <InlineMd text="三方是**不可逆**节点：签署前后必须显著区分，违约有真实代价。真的违约请标「违约」，不要改回待签。" />
        </p>
        {tripartite.state.status === 'ok' && tripartite.state.data.items.length > 0 ? (
          <ul className="jh-tailor-notes">
            {tripartite.state.data.items.map((item) => (
              <li key={item.id}>
                · #{item.id}｜{TRIPARTITE_STATE_LABEL[item.state]}｜
                {item.signDeadline === null ? '无截止' : `签署截止 ${item.signDeadline.slice(0, 10)}`}
                {item.penaltySummary === null ? '' : `｜${item.penaltySummary}`}
                {item.state === 'pending' ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="jh-link"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          async () => await setTripartiteState(item.id, 'signed' as TripartiteState),
                          '已签署（不可逆，请确认无误）',
                        )
                      }
                    >
                      标记已签
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={busy}
            onClick={() =>
              void run(
                async () =>
                  await createTripartite({
                    ...(items[0] === undefined ? {} : { campusApplicationId: items[0].id }),
                    signDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                    penaltySummary: '违约条款：待填写',
                  }),
                '已新建三方记录（默认截止 7 天后，请改成真实日期）',
              )
            }
          >
            新建三方记录
          </button>
        )}
      </div>
    </div>
  )
}

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
  const [tz, setTz] = useState('America/New_York')
  const [interviewAt, setInterviewAt] = useState('')
  const [display, setDisplay] = useState<{ counterpart: string; local: string; diffHours: number; warning: string | null } | null>(null)

  const run = async (fn: () => Promise<unknown>, onDone: (value: unknown) => void): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onDone(await fn())
      props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
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
              (value) => setLetter((value as { content: string }).content),
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
          <input className="jh-input" value={tz} onChange={(event) => setTz(event.target.value)} placeholder="America/New_York" />
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
          <pre className="jh-tv-pre">{letter}</pre>
        </div>
      )}
    </section>
  )
}

/** 简历的英文体检（M1：**只检查，不翻译**）。 */
export function EnglishCheckPanel(props: { resumeId: number }) {
  const check = useAsync((signal) => fetchEnglishCheck(props.resumeId, signal), [props.resumeId])
  if (check.state.status !== 'ok') return <p className="jh-muted">正在体检…</p>
  return (
    <div>
      {check.state.data.items.length === 0 ? (
        <p className="jh-ok">英文简历体检没有发现问题。</p>
      ) : (
        <ul className="jh-issues">
          {check.state.data.items.map((issue, index) => (
            <li key={String(index)} className={issue.level === 'error' ? 'jh-error' : 'jh-warn'}>
              <b>{issue.level === 'error' ? '必改' : '建议'}</b> {issue.message}
            </li>
          ))}
        </ul>
      )}
      <p className="jh-muted">{check.state.data.note}</p>
    </div>
  )
}

export { fetchCoverLetters } from '../api.js'
