import { useState } from 'react'
import { JOB_FLAG_LABEL, type JobState } from '../../shared/enums.js'
import { ApiError, fetchJobDetail, markJob } from '../api.js'
import { JOB_ACTION_LABEL, JOB_STATE_LABEL } from '../labels.js'
import { TailorPanel } from './tailor-panel.js'
import { OverseasPanel } from './campus.js'
import { useAsync } from '../use-async.js'
import { salaryDetail } from './jobs.js'

/** 详情抽屉里给得出的动作（不提供"标为新"——回退到未读没有意义）。 */
const ACTION_STATES: JobState[] = ['saved', 'ignored', 'seen', 'archived']

/**
 * U2 岗位详情 —— 抽屉式（§5.4）。
 *
 * 抽屉不卸载列表，所以从这里改状态后由父层 bump revision 让列表自己重拉。
 */
export function JobDetailDrawer(props: {
  id: number
  revision: number
  onClose: () => void
  onChanged: () => void
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

  return (
    <div className="jh-drawer-layer">
      <button type="button" className="jh-drawer-backdrop" aria-label="关闭详情" onClick={props.onClose} />
      <aside className="jh-drawer" role="dialog" aria-label="岗位详情">
        <header className="jh-drawer-head">
          <span className="jh-drawer-title">岗位详情</span>
          <button type="button" className="jh-icon-btn" aria-label="关闭" onClick={props.onClose}>×</button>
        </header>

        <div className="jh-drawer-body">
          {state.status === 'loading' && <p className="jh-muted">正在读取详情…</p>}

          {state.status === 'error' && (
            <div>
              <p className="jh-error">{state.message}</p>
              {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
              <button type="button" className="jh-btn" onClick={reload}>重试</button>
            </div>
          )}

          {state.status === 'ok' && (
            <>
              <h2 className="jh-detail-title">{state.data.job.title}</h2>
              <div className="jh-detail-salary">
                <b className="jh-salary">{state.data.job.salaryRaw}</b>
                {salaryDetail(state.data.job) === null ? null : (
                  <span className="jh-muted">（{salaryDetail(state.data.job)}）</span>
                )}
              </div>

              <ul className="jh-kv">
                <li><span>公司</span><span>{state.data.job.companyName ?? '—'}</span></li>
                <li><span>地点</span><span>{state.data.job.city}{state.data.job.district === '' ? '' : `·${state.data.job.district}`}</span></li>
                <li><span>经验</span><span>{state.data.job.expReq === '' ? '—' : state.data.job.expReq}</span></li>
                <li><span>学历</span><span>{state.data.job.eduReq === '' ? '—' : state.data.job.eduReq}</span></li>
                <li><span>发布</span><span>{state.data.job.publishedAt ?? '—'}</span></li>
                <li><span>首次见到</span><span>{state.data.job.firstSeenAt}</span></li>
                <li><span>当前状态</span><span>{JOB_STATE_LABEL[state.data.job.state]}</span></li>
              </ul>

              {state.data.job.tags.length === 0 ? null : (
                <div className="jh-tags">
                  {state.data.job.tags.map((tag) => (
                    <span key={tag} className="jh-tag">{tag}</span>
                  ))}
                </div>
              )}

              {/* ── P4：匹配分与逐条理由 ─────────────────────────────── */}
              <section className="jh-card jh-card-tight">
                <h3 className="jh-card-title">
                  L1 粗筛分
                  <span className="jh-score jh-score-inline">
                    {state.data.job.matchScore === null ? '未计算' : state.data.job.matchScore}
                  </span>
                </h3>
                <p className="jh-muted">
                  纯规则打分（城市 / 薪资 / 关键词命中率），**全量适用、零成本**。
                  语义级的精评要等 L2，所以这里标的是「粗筛分」而不是「匹配度」。
                </p>
                {state.data.matchReasons.length === 0 ? (
                  <p className="jh-muted">还没有理由记录 —— 采集后会随标注一起算出来。</p>
                ) : (
                  <ul className="jh-reasons">
                    {state.data.matchReasons.map((reason, index) => (
                      <li key={`${reason.kind}-${String(index)}`} className={`jh-reason jh-reason-${reason.kind}`}>
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
                {state.data.flags.length === 0 ? (
                  <p className="jh-muted">
                    规则没有命中任何风险特征。这不等于「没问题」—— 只是没命中已知模式。
                  </p>
                ) : (
                  <ul className="jh-flags">
                    {state.data.flags.map((flag) => (
                      <li key={flag.flagType} className="jh-flag-item">
                        <div className="jh-flag-head">
                          <span className={`jh-flag jh-flag-${flag.flagType}`}>
                            {JOB_FLAG_LABEL[flag.flagType]}
                          </span>
                          <span className="jh-muted">强度 {flag.score}</span>
                        </div>
                        <ul className="jh-evidence">
                          {flag.evidence.map((item, index) => (
                            <li key={`${flag.flagType}-${String(index)}`}>{item}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="jh-muted">
                  识别依据分两层：**文本层**来自词表命中的原文片段，**统计层**来自公司维度
                  （岗位数、地域跨度、驻场比例）。两者都会在此逐条列出。
                </p>
              </section>

              {state.data.company === null ? null : (
                <section className="jh-card jh-card-tight">
                  <h3 className="jh-card-title">公司画像</h3>
                  <ul className="jh-kv">
                    <li><span>归一化名</span><code>{state.data.company.nameNorm}</code></li>
                    <li><span>行业</span><span>{state.data.company.industry ?? '—'}</span></li>
                    <li><span>性质</span><span>{state.data.company.nature ?? '—'}</span></li>
                    <li><span>规模</span><span>{state.data.company.size ?? '—'}</span></li>
                    <li><span>在手岗位</span><span>{state.data.company.jobCount}</span></li>
                    <li><span>技术栈广度</span><span>{state.data.company.stackDiversity}</span></li>
                    <li><span>地域跨度</span><span>{state.data.company.geoSpread}</span></li>
                    <li>
                      <span>驻场比例</span>
                      <span>
                        {state.data.company.onsiteRatio === null
                          ? '—'
                          : `${String(Math.round(state.data.company.onsiteRatio * 100))}%`}
                      </span>
                    </li>
                    <li>
                      <span>名称关键词</span>
                      <span>{state.data.company.nameKeywordHits}</span>
                    </li>
                    <li>
                      <span>外包分 / 诈骗分</span>
                      <span>
                        {String(state.data.company.outsourcingScore ?? 0)} / {String(state.data.company.fraudScore ?? 0)}
                      </span>
                    </li>
                  </ul>
                  <p className="jh-muted">
                    冷启动时统计信号弱（D-16）—— 岗位越多判断越准；依据不足时上面这些数字会偏低，
                    而不是硬给一个结论。
                  </p>
                </section>
              )}

              <div className="jh-detail-actions">
                {ACTION_STATES.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`jh-btn jh-btn-inline${state.data.job.state === action ? ' jh-btn-active' : ''}`}
                    disabled={busy !== null}
                    onClick={() => void mark(action)}
                  >
                    {busy === action ? '…' : JOB_ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
              {failure === null ? null : <p className="jh-error">{failure}</p>}

              {/* U4：针对这个岗位的简历定制（§13）。产出的是**建议**，采用与否在你。 */}
              <TailorPanel jobId={props.id} revision={props.revision} onChanged={props.onChanged} />

              {/* P8：海外支线（§4.M）—— 工签/远程识别、时区双重换算、Cover Letter */}
              <OverseasPanel jobId={props.id} onChanged={props.onChanged} />

              {state.data.job.scoreStale ? (
                <p className="jh-warn">
                  这个匹配分是**旧版简历**下算出来的 —— 简历改过之后它就不再有效。
                  用「重算」或在对话里让模型跑 job_match_explain 才是当前分数。
                </p>
              ) : null}

              <p className="jh-muted">
                原始页面：
                <a href={state.data.job.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {state.data.job.sourceUrl}
                </a>
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
