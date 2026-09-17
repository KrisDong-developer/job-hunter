import { useState } from 'react'
import { JOB_FLAG_LABEL, type JobState } from '../../shared/enums.js'
import { ApiError, fetchJobDetail, markJob } from '../api.js'
import { JOB_ACTION_LABEL, JOB_STATE_LABEL, salaryDetail, splitJobTags } from '../labels.js'
import { TailorPanel } from './tailor-panel.js'
import { OverseasPanel } from './campus.js'
import { useAsync } from '../use-async.js'

/** 详情里给得出的动作（不提供"标为新"——回退到未读没有意义）。 */
const ACTION_STATES: JobState[] = ['saved', 'ignored', 'seen', 'archived']

/** 风险标注的语气：真风险给红/黄，弱信号只给中性框 —— 全部刷成一片黄反而看不出轻重。 */
const FLAG_TONE: Record<string, 'error' | 'warn' | 'quiet'> = {
  fraud: 'error',
  outsourcing: 'warn',
  salary_inflation: 'warn',
  zombie: 'quiet',
  jargon_hit: 'quiet',
}

/** 一段长解释收进小问号：正文里只留一句，鼠标停上去看全文。 */
function Hint(props: { text: string }) {
  return (
    <span className="jh-hint" role="img" aria-label={props.text} title={props.text}>?</span>
  )
}

/** L1 粗筛分的环形仪表：分数是决策第一眼要看的东西，不该只是一行灰字。 */
function Gauge(props: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(props.score)))
  const band = clamped >= 70 ? 'high' : clamped >= 45 ? 'mid' : 'low'
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const filled = (clamped / 100) * circumference
  return (
    <div className={`jh-gauge jh-gauge-${band}`}>
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle className="jh-gauge-track" cx="36" cy="36" r={radius} fill="none" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${String(filled)} ${String(circumference - filled)}`}
        />
      </svg>
      <div className="jh-gauge-num">
        {clamped}
        <span className="jh-gauge-unit">粗筛分</span>
      </div>
    </div>
  )
}

/**
 * U2 岗位详情的**正文**。
 *
 * 抽屉（流水线 / 消息 / 面试里临时看一眼）与岗位库的右侧内嵌栏共用这一份 ——
 * 两块地方的详情必须逐字一致，复制两套迟早会漂。
 *
 * 顶部是**吸顶操作条**（标题 + 薪资 + 动作）：早先动作按钮在正文最底部，
 * 右侧一屏那么长，用户根本滚不到，反馈就是"详情里没有任何操作按钮"。
 */
export function JobDetailBody(props: { id: number; revision: number; onChanged: () => void }) {
  const { state, reload } = useAsync((signal) => fetchJobDetail(props.id, signal), [props.id, props.revision])
  const [busy, setBusy] = useState<JobState | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const mark = async (next: JobState): Promise<void> => {
    setBusy(next)
    setFailure(null)
    try {
      await markJob(props.id, next)
      props.onChanged()
      reload()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.display : String(error))
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading') {
    return <p className="jh-muted">正在读取详情…</p>
  }

  if (state.status === 'error') {
    return (
      <div>
        <p className="jh-error">{state.message}</p>
        {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
        <button type="button" className="jh-btn" onClick={reload}>重试</button>
      </div>
    )
  }

  const { job, company, flags, matchReasons } = state.data
  const grouped = splitJobTags(job.tags)

  return (
    <>
      <header className="jh-detail-head">
        <div className="jh-detail-headline">
          <h2 className="jh-detail-title">{job.title}</h2>
          <div className="jh-detail-salary">
            <b className="jh-salary">{job.salaryRaw}</b>
            {salaryDetail(job) === null ? null : (
              <span className="jh-muted">（{salaryDetail(job)}）</span>
            )}
          </div>
        </div>
        <div className="jh-detail-actions">
          {ACTION_STATES.map((action) => (
            <button
              key={action}
              type="button"
              className={`jh-btn jh-btn-inline${job.state === action ? ' jh-btn-active' : ''}`}
              disabled={busy !== null}
              onClick={() => void mark(action)}
            >
              {busy === action ? '…' : JOB_ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      </header>
      {failure === null ? null : <p className="jh-error">{failure}</p>}

      <ul className="jh-kv">
        <li><span>公司</span><span>{job.companyName ?? '—'}</span></li>
        <li><span>地点</span><span>{job.city}{job.district === '' ? '' : `·${job.district}`}</span></li>
        <li><span>经验</span><span>{job.expReq === '' ? '—' : job.expReq}</span></li>
        <li><span>学历</span><span>{job.eduReq === '' ? '—' : job.eduReq}</span></li>
        <li><span>发布</span><span>{job.publishedAt ?? '—'}</span></li>
        <li><span>首次见到</span><span>{job.firstSeenAt}</span></li>
        <li><span>当前状态</span><span>{JOB_STATE_LABEL[job.state]}</span></li>
      </ul>

      {/* 标签按"技能要求 / 公司福利"分组：一锅端地平铺，读者分不清哪些是硬要求、哪些是待遇 */}
      {job.tags.length === 0 ? null : (
        <div className="jh-card jh-card-tight">
          {grouped.skills.length === 0 ? null : (
            <div className="jh-tag-group">
              <span className="jh-tag-group-name">技能要求</span>
              <div className="jh-tags">
                {grouped.skills.map((tag) => <span key={tag} className="jh-tag">{tag}</span>)}
              </div>
            </div>
          )}
          {grouped.benefits.length === 0 ? null : (
            <div className="jh-tag-group">
              <span className="jh-tag-group-name">公司福利</span>
              <div className="jh-tags">
                {grouped.benefits.map((tag) => <span key={tag} className="jh-tag">{tag}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── P4：匹配分与逐条理由 ─────────────────────────────── */}
      <section className="jh-card jh-card-tight">
        <h3 className="jh-card-title">L1 粗筛分</h3>
        {job.matchScore === null ? (
          <p className="jh-note">还没有算过 —— 采集后会随标注一起算出来。</p>
        ) : (
          <div className="jh-gauge-row">
            <Gauge score={job.matchScore} />
            <div className="jh-gauge-side">
              <span className="jh-gauge-band">
                {job.matchScore >= 70 ? '本轮规则里靠前' : job.matchScore >= 45 ? '中等' : '偏低'}
              </span>
              <p className="jh-note">
                按规则算出来的**粗筛分**，下面是逐条加减分。
                <Hint
                  text={
                    '纯规则打分（城市 / 薪资 / 关键词命中率），全量适用、零成本。' +
                    '语义级的精评要等 L2，所以这里标的是「粗筛分」而不是「匹配度」。'
                  }
                />
              </p>
            </div>
          </div>
        )}
        {matchReasons.length === 0 ? null : (
          <ul className="jh-reasons">
            {matchReasons.map((reason, index) => (
              <li
                key={`${reason.kind}-${String(index)}`}
                className={`jh-reason jh-reason-${reason.kind}${
                  reason.kind === 'hit' ? ' jh-reason-ok' : ' jh-reason-bad'
                }`}
              >
                <span className="jh-reason-mark">{reason.kind === 'hit' ? '✓' : '✕'}</span>
                <span className="jh-reason-weight">
                  {reason.weight > 0 ? `+${String(reason.weight)}` : reason.weight < 0 ? String(reason.weight) : '·'}
                </span>
                {reason.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── P4：风险标注与依据 ────────────────────────────────── */}
      <section className="jh-card jh-card-tight">
        <h3 className="jh-card-title">标注与依据</h3>
        {flags.length === 0 ? (
          // 刻意不刷成绿色：绿色等于宣布"这个岗位没问题"，而规则没命中只说明"没命中已知模式"。
          <div className="jh-alert jh-alert-quiet">
            <div className="jh-alert-head">
              <span className="jh-alert-title">没有命中任何已知风险特征</span>
            </div>
            <p className="jh-alert-body">
              这不等于「没问题」。识别依据分两层：**文本层**来自词表命中的原文片段，
              **统计层**来自公司维度（岗位数、地域跨度、驻场比例）；两者都没有命中时，这里是空的。
            </p>
          </div>
        ) : (
          <>
            {flags.map((flag) => {
              const tone = FLAG_TONE[flag.flagType] ?? 'quiet'
              return (
                <div key={flag.flagType} className={`jh-alert jh-alert-${tone}`}>
                  <div className="jh-alert-head">
                    <span className={`jh-flag jh-flag-${flag.flagType}`}>
                      {JOB_FLAG_LABEL[flag.flagType]}
                    </span>
                    <span className="jh-alert-title">强度 {flag.score}</span>
                  </div>
                  <ul className="jh-evidence">
                    {flag.evidence.map((item, index) => (
                      <li key={`${flag.flagType}-${String(index)}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
            <p className="jh-note">
              每条结论都附原文或统计依据。
              <Hint
                text={
                  '识别依据分两层：文本层来自词表命中的原文片段，统计层来自公司维度' +
                  '（岗位数、地域跨度、驻场比例）。强度是规则权重，不是概率。'
                }
              />
            </p>
          </>
        )}
      </section>

      {company === null ? null : (
        <section className="jh-card jh-card-tight">
          <h3 className="jh-card-title">公司画像</h3>
          <ul className="jh-kv">
            <li><span>归一化名</span><code>{company.nameNorm}</code></li>
            <li><span>行业</span><span>{company.industry ?? '—'}</span></li>
            <li><span>性质</span><span>{company.nature ?? '—'}</span></li>
            <li><span>规模</span><span>{company.size ?? '—'}</span></li>
            <li><span>在手岗位</span><span>{company.jobCount}</span></li>
            <li><span>技术栈广度</span><span>{company.stackDiversity}</span></li>
            <li><span>地域跨度</span><span>{company.geoSpread}</span></li>
            <li>
              <span>驻场比例</span>
              <span>
                {company.onsiteRatio === null
                  ? '—'
                  : `${String(Math.round(company.onsiteRatio * 100))}%`}
              </span>
            </li>
            <li><span>名称关键词</span><span>{company.nameKeywordHits}</span></li>
            <li>
              <span>外包分 / 诈骗分</span>
              <span>{String(company.outsourcingScore ?? 0)} / {String(company.fraudScore ?? 0)}</span>
            </li>
          </ul>
          <p className="jh-note">
            冷启动时统计信号弱（D-16）：岗位越多判断越准，依据不足时这些数字会偏低。
          </p>
        </section>
      )}

      {/* U4：针对这个岗位的简历定制（§13）。产出的是**建议**，采用与否在你。 */}
      <TailorPanel jobId={props.id} revision={props.revision} onChanged={props.onChanged} />

      {/* P8：海外支线（§4.M）—— 工签/远程识别、时区双重换算、Cover Letter */}
      <OverseasPanel jobId={props.id} onChanged={props.onChanged} />

      {job.scoreStale ? (
        <p className="jh-warn">
          这个匹配分是**旧版简历**下算出来的 —— 简历改过之后它就不再有效。
          用「重算」或在对话里让模型跑 job_match_explain 才是当前分数。
        </p>
      ) : null}

      <p className="jh-note">
        原始页面：
        <a className="jh-link" href={job.sourceUrl} target="_blank" rel="noreferrer noopener">
          {job.sourceUrl}
        </a>
      </p>
    </>
  )
}

/**
 * U2 岗位详情 —— **右侧内嵌栏**（岗位库在用）。
 *
 * 早先是抽屉，但岗位库是"浏览 → 比较 → 决定"的主界面：弹层会盖住列表，
 * 想对比下一个就得先关掉再点，来回两步。改成左右分栏后列表不动、详情常驻。
 *
 * 空态不是"什么都不显示"：留一句该怎么用 + 一句"标注只是初筛"的提醒。
 */
export function JobDetailPane(props: {
  id: number | null
  revision: number
  onChanged: () => void
}) {
  if (props.id === null) {
    return (
      <section className="jh-detail-pane jh-detail-pane-empty" data-job-hunter="job-detail" aria-label="岗位详情">
        <p className="jh-detail-empty-title">从左侧选一个岗位</p>
        <p className="jh-note">详情会显示在这里，列表保持不动，方便一个个往下比。</p>
        <p className="jh-note">
          列表上的「粗筛分」与风险标注只是初筛；点进来能看到每一条结论的**原文依据**。
        </p>
      </section>
    )
  }
  return (
    <section className="jh-detail-pane" data-job-hunter="job-detail" aria-label="岗位详情">
      <JobDetailBody id={props.id} revision={props.revision} onChanged={props.onChanged} />
    </section>
  )
}

/**
 * U2 岗位详情 —— **抽屉式**（流水线 / 消息 / 面试在用）。
 *
 * 那三个屏的主任务不是"比较岗位"，而是"处理一件事"，所以临时看一眼用弹层更合适：
 * 关掉就回到原来的上下文。
 */
export function JobDetailDrawer(props: {
  id: number
  revision: number
  onClose: () => void
  onChanged: () => void
}) {
  return (
    <div className="jh-drawer-layer">
      <button type="button" className="jh-drawer-backdrop" aria-label="关闭详情" onClick={props.onClose} />
      <aside className="jh-drawer" role="dialog" aria-label="岗位详情" data-job-hunter="job-drawer">
        <header className="jh-drawer-head">
          <span className="jh-drawer-title">岗位详情</span>
          <button type="button" className="jh-icon-btn" aria-label="关闭" onClick={props.onClose}>×</button>
        </header>

        <div className="jh-drawer-body">
          <JobDetailBody id={props.id} revision={props.revision} onChanged={props.onChanged} />
        </div>
      </aside>
    </div>
  )
}
