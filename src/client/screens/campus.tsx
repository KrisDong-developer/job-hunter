import { useState } from 'react'
import {
  ASSESSMENT_KIND_LABEL,
  ASSESSMENT_STATE_LABEL,
  CAMPUS_BATCHES,
  CAMPUS_BATCH_LABEL,
  CAMPUS_STAGE_LABEL,
  REMOTE_KIND_LABEL,
  TRIPARTITE_STATE_LABEL,
  VISA_STANCE_LABEL,
} from '../../shared/enums.js'
import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../shared/enums.js'
import {
  advanceCampus,
  analyzeOverseas,
  ApiError,
  createAssessment,
  createCampus,
  createTripartite,
  draftCoverLetter,
  fetchCampus,
  fetchDeadlines,
  fetchEnglishCheck,
  fetchTimezone,
  fetchTripartite,
  setAssessmentState,
  setTripartiteState,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { useAsync } from '../use-async.js'
import { formatLocalMoment } from '../../shared/time-format.js'

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
 * 校招支线（§4.L）。
 *
 * 这一屏的**中心是硬截止**，不是记录列表 —— 校招与社招最大的差别就在于
 * 「笔试错过即终态、网申错过等一年」（§12.7）。
 * 所以截止卡片放在最上面，而且用 ⛔/⚠ 明确区分"已过期"与"24 小时内"。
 */
export function CampusScreen(props: { revision: number; onChanged: () => void }) {
  const data = useAsync((signal) => fetchCampus(signal), [props.revision])
  const tripartite = useAsync((signal) => fetchTripartite(signal), [props.revision])
  const deadlines = useAsync((signal) => fetchDeadlines(signal), [props.revision])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [batch, setBatch] = useState<CampusBatch>('autumn')
  const [closeAt, setCloseAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [dueFor, setDueFor] = useState<number | null>(null)
  // 时间一律按**本地**渲染（`formatLocalMoment`）：`iso.slice(0, 16)` 印出来的是 UTC 墙钟，
  // 用户填 18:00 会看到 10:00 —— shared/time-format.ts 开头专门记着这个坑。
  const now = new Date()

  /**
   * 跑一个会改数据的动作。
   *
   * 返回**是否成功** —— 调用方只在成功之后才清空表单：失败也清空等于把用户刚敲的东西
   * 悄悄丢掉，而错误提示只说了"失败"，他连重试都要重打一遍。
   */
  const run = async (fn: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(done)
      props.onChanged()
      return true
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  const items = data.state.status === 'ok' ? data.state.data.items : []
  const windows = data.state.status === 'ok' ? data.state.data.windows : []

  /**
   * 待处理的硬截止**直接用宿主算好的那一份**（`/deadlines`），不在界面上自己拼。
   *
   * 为什么要这样：宿主那边是"三类节点（笔试 / 网申 / 三方）一张表"，而且它专门警告过
   * 「漏掉一类节点就等于漏掉一次错过即出局，而拼查询最容易漏」。这里原来就是自己拼的，
   * 结果网申截止与三方签署截止根本没进这张卡 —— 只剩一个日期字符串躺在别的卡片里，
   * 既没有 ⛔/⚠，也没有倒计时。
   */
  const hardDeadlines = deadlines.state.status === 'ok' ? deadlines.state.data.items : []

  /**
   * 已经错过的笔试/测评单独留一份：它们是**终态**，必须显式认账，不能悄悄消失 ——
   * "看不到了"和"没发生"是两回事，而校招里这个区别意味着要不要重新规划一年。
   */
  const missed = items.flatMap((item) =>
    item.assessments
      .filter((assessment) => assessment.state === 'missed')
      .map((assessment) => ({
        item,
        assessment,
        label: `${item.companyName ?? item.note ?? `#${String(item.id)}`} · ${ASSESSMENT_KIND_LABEL[assessment.kind]}`,
      })),
  )

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
        {deadlines.state.status === 'loading' ? <p className="jh-muted">正在读取硬截止…</p> : null}
        {deadlines.state.status === 'error' ? (
          <p className="jh-error">硬截止读取失败：{deadlines.state.message}</p>
        ) : null}
        {/* 即使没有待处理的，也要把"已错过"列出来 —— 否则它会静默消失 */}
        {deadlines.state.status !== 'ok' ? null : hardDeadlines.length > 0 ? (
          <ul className="jh-deadlines">
            {hardDeadlines.map((deadline) => (
              <li
                key={`${deadline.kind}:${String(deadline.refId)}`}
                className={`jh-deadline${deadline.overdue ? ' jh-deadline-overdue' : deadline.urgent ? ' jh-deadline-urgent' : ''}`}
              >
                <b>{deadline.overdue ? '⛔ 已过期' : deadline.urgent ? '⚠ 紧急' : '·'}</b>{' '}
                {deadline.label}｜{formatLocalMoment(deadline.dueAt, now, { withRelative: false }) ?? deadline.dueAt}｜
                {deadline.overdue
                  ? `已过 ${String(Math.abs(deadline.hoursLeft))} 小时`
                  : `还剩 ${String(deadline.hoursLeft)} 小时`}
              </li>
            ))}
          </ul>
        ) : missed.length > 0 ? (
          <p className="jh-muted">没有待处理的截止。</p>
        ) : (
          <p className="jh-ok">没有待处理的硬截止。</p>
        )}
        {missed.length === 0 ? null : (
          <>
            <p className="jh-error">已错过（终态，不可改回）：</p>
            <ul className="jh-deadlines">
              {missed.map((entry) => (
                <li className="jh-deadline jh-deadline-overdue" key={entry.assessment.id}>
                  ⛔ {entry.label}｜
                  {entry.assessment.dueAt === null
                    ? '未填'
                    : (formatLocalMoment(entry.assessment.dueAt, now, { withRelative: false }) ?? entry.assessment.dueAt)}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="jh-muted">笔试/网申/三方错过都是终态（§12.7），没有第二次机会。</p>
      </div>

      <div className="jh-card">
        <h3 className="jh-card-title">批次时间窗</h3>
        <p className="jh-muted">
          {windows
            .map(
              (window) =>
                `${CAMPUS_BATCH_LABEL[window.batch]} ${String(window.count)} 条（${String(window.openCount)} 个还没网申）` +
                `${window.nextCloseAt === null ? '' : `，最近截止 ${formatLocalMoment(window.nextCloseAt, now, { withRelative: false }) ?? window.nextCloseAt}`}`,
            )
            .join('　|　')}
        </p>
        <div className="jh-inline">
          <input
            className="jh-input"
            aria-label="公司名"
            placeholder="公司名"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {/* 批次必须能选：不带它就是 schema 默认的"秋招"，春招/其他批次永远建不出来，
              「批次时间窗」里那两行也就永远是 0 */}
          <select
            className="jh-select jh-input-sm"
            aria-label="批次"
            title="批次：秋招 / 春招 / 其他"
            value={batch}
            onChange={(event) => setBatch(event.target.value as CampusBatch)}
          >
            {CAMPUS_BATCHES.map((value) => (
              <option key={value} value={value}>{CAMPUS_BATCH_LABEL[value]}</option>
            ))}
          </select>
          <input
            className="jh-input"
            type="date"
            aria-label="网申截止日期"
            title="网申截止（按当天 23:59 算）"
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
                    companyName: name.trim(),
                    batch,
                    // `type="date"` 给的是 `YYYY-MM-DD`，而 `new Date('2026-09-19')` 按 **UTC** 零点
                    // 解析 —— 在东八区就是当天 08:00，于是"截止今天"的记录一早 8 点就被判成已过期。
                    // 手工拼上当天的 23:59（不带时区 = 本地时间）才是"今天截止"的本意。
                    ...(closeAt === '' ? {} : { applyCloseAt: new Date(`${closeAt}T23:59:59`).toISOString() }),
                  }),
                '已新建校招记录',
              ).then((ok) => {
                if (!ok) return
                setName('')
                setCloseAt('')
              })
            }
          >
            新建
          </button>
        </div>
      </div>

      {data.state.status === 'loading' ? (
        <p className="jh-muted">正在读取校招记录…</p>
      ) : data.state.status === 'error' ? (
        // 读失败必须说读失败：原来这里一律显示"正在读取…"，接口挂掉就永远转圈，
        // 既没有错误也没有重试。
        <div className="jh-card">
          <p className="jh-error">{data.state.message}</p>
          {data.state.hint === undefined ? null : <p className="jh-muted">{data.state.hint}</p>}
          <button type="button" className="jh-btn" onClick={data.reload}>重试</button>
        </div>
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
                  <span className="jh-muted">
                    网申截止 {formatLocalMoment(item.applyCloseAt, now, { withRelative: false }) ?? item.applyCloseAt}
                  </span>
                )}
              </div>
              <div className="jh-detail-actions">
                {/* 阶段按钮覆盖 `CAMPUS_STAGES` 里"人能手动指定"的那些。
                    `interviewing`（面试中）与 `rejected`（已拒）原来漏了 —— 而"被拒"和
                    "我自己结束"在校招里是两件必须分得开的事。
                    自动推进的那几个（已笔试/待发三方/已签三方）不在这里：它们跟着笔试与三方走。 */}
                {([
                  'applied',
                  'assessment_pending',
                  'interview_pending',
                  'interviewing',
                  'final',
                  'closed',
                  'rejected',
                ] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="jh-btn jh-btn-inline"
                    // 当前阶段按了也不会变（宿主直接返回原记录），禁用掉 ——
                    // 否则会弹一句"已标记为「X」"，让人以为改动生效了。
                    disabled={busy || item.stage === stage}
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
                      ).then((ok) => {
                        // 失败就把用户填的时间留在框里，别收起来 —— 重试不用重打
                        if (!ok) return
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
                      截止{' '}
                      {assessment.dueAt === null
                        ? '未填'
                        : (formatLocalMoment(assessment.dueAt, now, { withRelative: false }) ?? assessment.dueAt)}
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
        {tripartite.state.status === 'loading' ? (
          <p className="jh-muted">正在读取三方记录…</p>
        ) : tripartite.state.status === 'error' ? (
          <div>
            <p className="jh-error">{tripartite.state.message}</p>
            <button type="button" className="jh-btn" onClick={tripartite.reload}>重试</button>
          </div>
        ) : tripartite.state.data.items.length > 0 ? (
          <ul className="jh-tailor-notes">
            {tripartite.state.data.items.map((item) => (
              <li key={item.id}>
                · #{item.id}｜{TRIPARTITE_STATE_LABEL[item.state]}｜
                {item.signDeadline === null
                  ? '无截止'
                  : `签署截止 ${formatLocalMoment(item.signDeadline, now, { withRelative: false }) ?? item.signDeadline}`}
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
                    // **不自动挂到某条校招记录上**：原来绑的是 `items[0]`（列表按 stage_at 倒序，
                    // 也就是最近动过的那条），而用户此刻根本没得选 —— 猜一个关联会顺带把那条记录
                    // 推到"待发三方"。三方记录先独立存在，等界面上能选记录时再绑。
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

/** 简历的英文体检（M1：**只检查，不翻译**）。 */
export function EnglishCheckPanel(props: { resumeId: number }) {
  const check = useAsync((signal) => fetchEnglishCheck(props.resumeId, signal), [props.resumeId])
  if (check.state.status === 'loading') return <p className="jh-muted">正在体检…</p>
  if (check.state.status === 'error') return <p className="jh-error">体检失败：{check.state.message}</p>
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
