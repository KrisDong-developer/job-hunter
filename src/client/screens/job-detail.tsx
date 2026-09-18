import { useRef, useState, type FormEvent } from 'react'
import type { CompanyProfileDto } from '../../shared/dto.js'
import { JOB_FLAG_LABEL, type JobState } from '../../shared/enums.js'
import { ApiError, fetchCompanyDetail, fetchJobDetail, markJob, updateCompanyReview } from '../api.js'
import { JOB_ACTION_LABEL, JOB_STATE_LABEL, relativeTime, salaryDetail, splitJobTags } from '../labels.js'
import { TailorPanel } from './tailor-panel.js'
import { OverseasPanel } from './campus.js'
import { InlineMd } from '../inline-md.js'
import { useDialogA11y } from '../use-dialog-a11y.js'
import { useAsync } from '../use-async.js'

/** 详情里给得出的动作（不提供"标为新"——回退到未读没有意义）。 */
const ACTION_STATES: JobState[] = ['saved', 'ignored', 'seen', 'archived']

/** JD 收起时露出的字数。约五六行，够看清"这活到底干什么"。 */
const JD_PREVIEW_CHARS = 320

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
 * JD 原文。默认只露开头一段 —— 详情栏是"一个一个往下比"的地方，
 * 一份三千字的 JD 会把评分、风险、公司画像全挤到屏幕外。
 */
function JdText(props: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = props.text.length > JD_PREVIEW_CHARS
  const shown = long && !expanded ? `${props.text.slice(0, JD_PREVIEW_CHARS)}…` : props.text
  return (
    <>
      <p className="jh-jd">{shown}</p>
      {long ? (
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          aria-expanded={expanded}
          onClick={() => { setExpanded(!expanded) }}
        >
          {expanded ? '收起原文' : `展开全文（共 ${String(props.text.length)} 字）`}
        </button>
      ) : null}
    </>
  )
}

/**
 * 「这家公司的其它在招岗位」。
 *
 * 公司画像里原本只给一个数字（"在手岗位 37"），而那 37 条**是什么**才是判断依据 ——
 * 外包/广撒网的识别本来就建立在"岗位数 × 地域跨度 × 驻场比例"上，
 * 光看汇总数字没法验证这个结论。
 *
 * 数据一直在 `GET /companies/:id` 里（含该公司岗位列表），只是客户端从来没调过。
 */
function CompanyJobs(props: {
  companyId: number
  jobCount: number
  currentJobId: number
  onSelect: ((id: number) => void) | undefined
}) {
  const { state } = useAsync(
    (signal) => fetchCompanyDetail(props.companyId, signal),
    [props.companyId],
  )

  if (state.status === 'loading') return <p className="jh-note">正在读取该公司的其它岗位…</p>
  if (state.status === 'error') return <p className="jh-note">读取该公司岗位失败：{state.message}</p>

  const others = state.data.jobs.filter((job) => job.id !== props.currentJobId)
  if (others.length === 0) {
    return <p className="jh-note">除当前这个岗位外，这家公司在你库里没有其它在招岗位。</p>
  }

  return (
    <>
      <ul className="jh-siblings">
        {others.map((job) => {
          const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
          const meta = [job.city, requirements, job.salaryRaw].filter((item) => item !== '').join('｜')
          return (
            <li key={job.id}>
              {props.onSelect === undefined ? (
                // 抽屉场景（流水线/消息/面试）没有"切换岗位"的上下文 ——
                // 那时渲染成纯文本，而不是一个点了没反应的按钮。
                <span className="jh-sibling jh-sibling-static">
                  <span>{job.title}</span>
                  <span className="jh-sibling-meta">{meta}</span>
                </span>
              ) : (
                <button type="button" className="jh-sibling" onClick={() => props.onSelect?.(job.id)}>
                  <span>{job.title}</span>
                  <span className="jh-sibling-meta">{meta}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {props.jobCount > state.data.jobs.length ? (
        <p className="jh-note">
          该公司共 {props.jobCount} 个岗位，这里只列出最近更新的 {state.data.jobs.length} 条。
        </p>
      ) : null}
    </>
  )
}

/**
 * 人工复核（§4.3 / D-16）：规则会认错，用户必须能纠正。
 *
 * 这套能力此前是**后端完整、界面为零** —— `PATCH /companies/:id` 支持拉黑与打标签，
 * 而界面上连已经打过的标签都看不到。这里补最小的一份：标签 + 拉黑 + 保存。
 */
function CompanyReview(props: { company: CompanyProfileDto; onSaved: () => void }) {
  const [label, setLabel] = useState(props.company.manualLabel ?? '')
  const [blacklisted, setBlacklisted] = useState(props.company.blacklisted)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    try {
      const trimmed = label.trim()
      await updateCompanyReview(props.company.id, {
        blacklisted,
        // 空串 = 清除标签（后端把空串收敛成 null，不会存一个空标签）
        manualLabel: trimmed === '' ? null : trimmed,
      })
      props.onSaved()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.display : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="jh-review" onSubmit={(event) => void save(event)}>
      <label className="jh-review-field">
        <span>人工标签</span>
        <input
          className="jh-input jh-input-sm"
          value={label}
          maxLength={40}
          placeholder="如：外包 / 已投过"
          onChange={(event) => { setLabel(event.target.value) }}
        />
      </label>
      <label className="jh-check">
        <input
          type="checkbox"
          checked={blacklisted}
          onChange={(event) => { setBlacklisted(event.target.checked) }}
        />
        <span>拉黑该公司</span>
      </label>
      <button type="submit" className="jh-btn jh-btn-inline" disabled={busy}>
        {busy ? '保存中…' : '保存复核'}
      </button>
      {failure === null ? null : <span className="jh-error">{failure}</span>}
    </form>
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
export function JobDetailBody(props: {
  id: number
  revision: number
  onChanged: () => void
  /** 有它时，"这家公司的其它岗位"可点击切换；抽屉场景没有这个上下文。 */
  onSelect?: ((id: number) => void) | undefined
}) {
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

  const { job, jdText, company, flags, matchReasons } = state.data
  const grouped = splitJobTags(job.tags)
  // 解析不出来就退回原始串：宁可显示 ISO，也不要留一格空白
  const lastSeen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt

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
        <li><span>来源平台</span><span>{job.platformName ?? job.platformId}</span></li>
        <li><span>发布</span><span>{job.publishedAt ?? '—'}</span></li>
        <li><span>首次见到</span><span>{job.firstSeenAt}</span></li>
        {/* 「最近见到」是判断"这岗还在招吗"的依据：它一直只是排序字段，
            界面上从来没显示过。相对时间比 ISO 串更能直接读出结论。 */}
        <li><span>最近见到</span><span>{lastSeen}</span></li>
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

      {/* JD 原文。此前详情只有标题 / 薪资 / 标签 / 经验学历 —— 想知道"这活到底干什么"
          只能点去原站；而原文其实早就抓下来存在库里，只是从来没送到界面上。 */}
      <section className="jh-card jh-card-tight">
        <h3 className="jh-card-title">岗位描述</h3>
        {jdText === null ? (
          <p className="jh-note">
            <InlineMd text="**没有抓到 JD 原文** —— 该平台未提供详情页解析，或抓取时详情页没打开。可以点最下面的原站链接自己看。" />
          </p>
        ) : (
          <JdText text={jdText} />
        )}
      </section>

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
                <InlineMd text="按规则算出来的**粗筛分**，下面是逐条加减分。" />
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
              <InlineMd text="这不等于「没问题」。识别依据分两层：**文本层**来自词表命中的原文片段，**统计层**来自公司维度（岗位数、地域跨度、驻场比例）；两者都没有命中时，这里是空的。" />
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
        <>
          <section className="jh-card jh-card-tight">
            <h3 className="jh-card-title">公司画像</h3>
            {/* 拉黑状态必须显眼地说出来，并且**说清它不做什么** ——
                否则用户会以为拉黑之后岗位就不再出现了。 */}
            {company.blacklisted ? (
              <div className="jh-alert jh-alert-warn">
                <div className="jh-alert-head">
                  <span className="jh-alert-title">这家公司被你标记为「拉黑」</span>
                </div>
                <p className="jh-alert-body">
                  这是你的人工标记。它不会自动隐藏该公司的岗位，只是在这里提示你。
                </p>
              </div>
            ) : null}
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
              <li>
                <span>拉黑</span>
                <span>{company.blacklisted ? '已拉黑' : '否'}</span>
              </li>
            </ul>
            <p className="jh-note">
              冷启动时统计信号弱（D-16）：岗位越多判断越准，依据不足时这些数字会偏低。
            </p>
            {/* key 绑公司：切到另一家时必须重挂，否则输入框里会留着上一家的标签 */}
            <CompanyReview key={company.id} company={company} onSaved={reload} />
          </section>

          <section className="jh-card jh-card-tight">
            <h3 className="jh-card-title">这家公司的其它岗位</h3>
            <CompanyJobs
              companyId={company.id}
              jobCount={company.jobCount}
              currentJobId={job.id}
              onSelect={props.onSelect}
            />
          </section>
        </>
      )}

      {/* U4：针对这个岗位的简历定制（§13）。产出的是**建议**，采用与否在你。 */}
      <TailorPanel jobId={props.id} revision={props.revision} onChanged={props.onChanged} />

      {/* P8：海外支线（§4.M）—— 工签/远程识别、时区双重换算、Cover Letter */}
      <OverseasPanel jobId={props.id} onChanged={props.onChanged} />

      {job.scoreStale ? (
        <p className="jh-warn">
          <InlineMd text="这个匹配分是**旧版简历**下算出来的 —— 简历改过之后它就不再有效。用「重算」或在对话里让模型跑 `job_match_explain` 才是当前分数。" />
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
  /** 列表就在左边，所以"这家公司的其它岗位"可以直接点着切过去。 */
  onSelect?: ((id: number) => void) | undefined
}) {
  if (props.id === null) {
    return (
      <section className="jh-detail-pane jh-detail-pane-empty" data-job-hunter="job-detail" aria-label="岗位详情">
        <p className="jh-detail-empty-title">从左侧选一个岗位</p>
        <p className="jh-note">详情会显示在这里，列表保持不动，方便一个个往下比。</p>
        <p className="jh-note">
          <InlineMd text="列表上的「粗筛分」与风险标注只是初筛；点进来能看到每一条结论的**原文依据**。" />
        </p>
      </section>
    )
  }
  return (
    <section className="jh-detail-pane" data-job-hunter="job-detail" aria-label="岗位详情">
      <JobDetailBody
        id={props.id}
        revision={props.revision}
        onChanged={props.onChanged}
        onSelect={props.onSelect}
      />
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
  const dialogRef = useRef<HTMLElement>(null)
  /* 抽屉是模态层（`role="dialog"`），所以它要具备对话框该有的行为：
     aria-modal、Esc 关闭、焦点移入与陷阱、关闭后归还焦点。
     之前只有 role —— 审核实测：Esc 无效、Tab 能跑到被遮住的列表上。 */
  useDialogA11y(dialogRef, props.onClose, [props.id])

  return (
    <div className="jh-drawer-layer">
      <button type="button" className="jh-drawer-backdrop" aria-label="关闭详情" onClick={props.onClose} />
      <aside
        className="jh-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="岗位详情"
        tabIndex={-1}
        ref={dialogRef}
        data-job-hunter="job-drawer"
      >
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
