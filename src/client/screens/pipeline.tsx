import { useCallback, useEffect, useState } from 'react'
import {
  APPLICATION_CHANNEL_LABEL,
  APPLICATION_STAGE_LABEL,
  NO_PROGRESS_DAYS,
  TERMINAL_STAGES,
  nextStageOf,
} from '../../shared/enums.js'
import type { ApplicationStage } from '../../shared/enums.js'
import {
  SALARY_BASES,
  SALARY_BASIS_LABEL,
  type AnalyticsFilter,
  type BoardCardDto,
  type FollowUpDto,
  type SalaryBasis,
  type SalaryBoxDto,
} from '../../shared/dto.js'
import {
  advanceApplication,
  ApiError,
  createApplication,
  fetchApplications,
  fetchAttribution,
  fetchBoard,
  fetchFollowUps,
  fetchFunnel,
  fetchResumeCompare,
  fetchResumes,
  fetchSalaryBand,
  fetchSalaryBaseline,
  fetchSalaryBox,
} from '../api.js'
import { useAsync } from '../use-async.js'

/**
 * U5 投递流水线（§13）—— 看板视图 + 跟进建议。
 *
 * 看板的列就是 §12.1 的阶段，**顺序本身是业务规则**（后端已经按 `APPLICATION_STAGES` 排好）。
 * 两个刻意的设计：
 *   * 卡上显示"卡在当前阶段多少天" —— 看板的意义就是让你一眼看出该催谁；
 *   * 跟进建议把「未读超时」与「已读未回超时」**分成两条**（§3.3 的核心洞察）：
 *     前者建议放弃，后者建议改简历/话术，而不是继续加量。
 */
export function PipelineScreen(props: { revision: number; onChanged: () => void; onSelectJob: (id: number) => void }) {
  const board = useAsync((signal) => fetchBoard(signal), [props.revision])
  const followUps = useAsync((signal) => fetchFollowUps(signal), [props.revision])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openJobId, setOpenJobId] = useState<number | null>(null)
  const apps = useAsync(
    (signal) => fetchApplications(openJobId === null ? {} : { jobId: openJobId }, signal),
    [openJobId, props.revision],
  )

  const run = useCallback(
    async (id: number, fn: () => Promise<unknown>) => {
      setBusy(id)
      setError(null)
      try {
        await fn()
        props.onChanged()
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
      } finally {
        setBusy(null)
      }
    },
    [props],
  )

  const move = (card: BoardCardDto): void => {
    // 简易推进：按阶段顺序走下一格。终态没有下一格（nextStageOf 返回 null），
    // 而那条路径现在**根本不会渲染按钮**，所以这里不必再静默吞掉点击。
    const to = nextStageOf(card.stage)
    if (to === null) return
    void run(card.applicationId, async () => await advanceApplication({ applicationId: card.applicationId, to }))
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">投递流水线</h2>
        <span className="jh-muted">
          每一次投递都记下了当时用的简历版本与渠道 —— 归因分析靠的就是它。
        </span>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {board.state.status === 'loading' && <p className="jh-muted">正在读取流水线…</p>}
      {board.state.status === 'error' && <p className="jh-error">{board.state.message}</p>}

      {board.state.status === 'ok' && (
        <>
          <p className="jh-muted">
            共 {board.state.data.total} 条投递
            {board.state.data.staleCount > 0 ? (
              <i className="jh-warn"> · {board.state.data.staleCount} 条卡了 {NO_PROGRESS_DAYS} 天以上</i>
            ) : null}
          </p>

          {/* 整条流水线的形状 —— 七个阶段**全部**摆出来，一行读完。
              为什么需要它：看板列多起来就要横向滚动（实测 1656px 对 1000px 容器），
              而横向滚动恰恰把"我总共走到哪了"这个最该一眼看到的东西藏起来了。
              这一行无论看板滚不滚都读得到，`data-active` 的小圆点标出有在途投递的阶段。 */}
          <div className="jh-stage-strip">
            <span className="jh-stage-strip-title">全流程</span>
            {board.state.data.columns.map((column, index) => (
              <span key={column.stage} className="jh-stage-strip-item"
                data-zero={column.cards.length === 0 ? '1' : '0'}
                data-active={column.stage === 'sent' ? '0' : column.cards.length > 0 ? '1' : '0'}>
                {index === 0 ? null : <span className="jh-stage-strip-arrow" aria-hidden="true">→</span>}
                <b className="jh-stage-strip-num">{column.cards.length}</b>
                {APPLICATION_STAGE_LABEL[column.stage]}
              </span>
            ))}
          </div>

          {board.state.data.total === 0 ? (
            <div className="jh-empty">
              <p className="jh-muted">还没有投递记录。</p>
              <p className="jh-muted">
                去「岗位库」打开一个岗位，在详情里点「记一次投递」—— 这里就会开始记录它走到哪一步、
                用的哪版简历、以及卡了多少天。
              </p>
            </div>
          ) : (
            <div className="jh-board">
              {board.state.data.columns.map((column) => (
                <section
                  className={`jh-board-col${column.cards.length === 0 ? ' jh-board-col-empty' : ''}`}
                  key={column.stage}
                  aria-label={`${APPLICATION_STAGE_LABEL[column.stage]}：${String(column.cards.length)} 条`}
                >
                  {/* 这里是 <div> 而不是 <header>：<header> 落在 <section> 里会形成
                      **作用域化的 banner landmark**，7 个看板列就是 7 个地标，
                      读屏的地标列表被冲垮（实测这一屏 banner × 8）。视觉零变化。 */}
                  <div className="jh-board-head">
                    <span className="jh-board-head-label">{APPLICATION_STAGE_LABEL[column.stage]}</span>
                    <span className="jh-board-count">{column.cards.length}</span>
                  </div>
                  {column.cards.length === 0 ? null : (
                    column.cards.map((card) => (
                      <article className="jh-board-card" key={card.applicationId}>
                        <button
                          type="button"
                          className="jh-board-title"
                          onClick={() => props.onSelectJob(card.jobId)}
                          title="打开岗位详情"
                        >
                          {card.jobTitle ?? `岗位 #${String(card.jobId)}`}
                        </button>
                        <span className="jh-muted jh-board-meta">
                          {card.companyName ?? '未知公司'} · {APPLICATION_CHANNEL_LABEL[card.channel]}
                          {card.resumeId === null ? '' : ` · 简历 #${String(card.resumeId)}`}
                        </span>
                        <span className="jh-board-age">
                          {card.daysSinceStage === 0
                            ? '今天动的'
                            : card.daysSinceStage >= NO_PROGRESS_DAYS
                              ? `卡了 ${String(card.daysSinceStage)} 天 · 该催了`
                              : `卡了 ${String(card.daysSinceStage)} 天`}
                        </span>
                        <div className="jh-board-actions">
                          {nextStageOf(card.stage) === null ? null : (
                            <button
                              type="button"
                              className="jh-btn jh-btn-inline"
                              disabled={busy !== null}
                              title={`把这条记录改到「${APPLICATION_STAGE_LABEL[nextStageOf(card.stage) as ApplicationStage]}」`}
                              onClick={() => move(card)}
                            >
                              推进到{APPLICATION_STAGE_LABEL[nextStageOf(card.stage) as ApplicationStage]}
                            </button>
                          )}
                          <button
                            type="button"
                            className="jh-btn jh-btn-inline"
                            disabled={busy !== null}
                            onClick={() => setOpenJobId(card.jobId)}
                          >
                            投递记录
                          </button>
                          {/* 终态记录不再给动作按钮：原来「推进」在任何列都渲染着，
                              到了 Offer/已拒绝/无回复就点了没反应（更像坏了）。
                              这里按阶段决定，不给死按钮。 */}
                          {TERMINAL_STAGES.includes(card.stage) ? null : (
                            <button
                              type="button"
                              className="jh-btn jh-btn-inline jh-btn-danger-ghost"
                              disabled={busy !== null}
                              onClick={() =>
                                void run(card.applicationId, async () =>
                                  await advanceApplication({ applicationId: card.applicationId, to: 'rejected' }),
                                )
                              }
                            >
                              标记已拒绝
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* 跟进建议：两条超时分支必须分开呈现（§3.3） */}
      <h3 className="jh-card-title">待跟进</h3>
      {followUps.state.status === 'ok' && followUps.state.data.items.length === 0 ? (
        <p className="jh-ok">没有需要跟进的 —— 要么都在推进，要么还没打招呼。</p>
      ) : null}
      {followUps.state.status === 'ok' && followUps.state.data.items.length > 0 ? (
        <ul className="jh-followups">
          {followUps.state.data.items.map((item) => (
            <FollowUpRow key={`${String(item.jobId)}-${item.kind}`} item={item} onOpen={props.onSelectJob} />
          ))}
        </ul>
      ) : null}

      {openJobId === null ? null : (
        <div className="jh-card">
          <div className="jh-row-head">
            <h3 className="jh-card-title">岗位 #{openJobId} 的投递记录</h3>
            <span className="jh-spacer" />
            <button type="button" className="jh-btn jh-btn-inline" onClick={() => setOpenJobId(null)}>
              收起
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={busy !== null}
              onClick={() =>
                void run(0, async () => await createApplication({ jobId: openJobId, confirm: true }))
              }
            >
              记一次投递
            </button>
          </div>
          {apps.state.status !== 'ok' ? (
            <p className="jh-muted">正在读取…</p>
          ) : apps.state.data.items.length === 0 ? (
            <p className="jh-muted">这个岗位还没有投递记录。</p>
          ) : (
            apps.state.data.items.map((application) => (
              <div className="jh-card jh-card-tight" key={application.id}>
                <p className="jh-muted">
                  #{application.id} · {APPLICATION_STAGE_LABEL[application.stage]} ·{' '}
                  {APPLICATION_CHANNEL_LABEL[application.channel]} · 简历 #{String(application.resumeId ?? '—')} ·{' '}
                  {application.sentAt.slice(0, 16).replace('T', ' ')}
                </p>
                <ul className="jh-tailor-notes">
                  {application.events.map((event) => (
                    <li key={event.id}>
                      · {event.at.slice(0, 16).replace('T', ' ')}{' '}
                      {event.fromStage === null
                        ? `创建为「${APPLICATION_STAGE_LABEL[event.toStage as ApplicationStage] ?? event.toStage}」`
                        : `${APPLICATION_STAGE_LABEL[event.fromStage as ApplicationStage] ?? event.fromStage} → ` +
                          `${APPLICATION_STAGE_LABEL[event.toStage as ApplicationStage] ?? event.toStage}`}
                      （{event.source === 'auto' ? '自动识别' : event.source === 'model' ? '模型' : '人工'}）
                      {event.note === null ? '' : `｜${event.note}`}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FollowUpRow(props: { item: FollowUpDto; onOpen: (id: number) => void }) {
  const { item } = props
  return (
    <li className={`jh-followup jh-followup-${item.kind}`}>
      <button type="button" className="jh-link" onClick={() => props.onOpen(item.jobId)}>
        {item.companyName ?? ''} {item.jobTitle ?? `岗位 #${String(item.jobId)}`}
      </button>
      <p className="jh-muted">{item.message}</p>
      <p className={item.kind === 'unread-timeout' ? 'jh-muted' : 'jh-warn'}>{item.advice}</p>
    </li>
  )
}

/**
 * U8 数据看板（§13）。
 *
 * 界面上**先显示样本量，再显示比率** —— 顺序不是小事：
 * 先看到"100% 回复率"再看到"样本 1 条"，人已经形成印象了。
 */
export function BoardScreen(props: { revision: number; onDrillDown: (step: string) => void }) {
  // 全局筛选：一处状态，三处 fetch 一起联动。
  const [filter, setFilter] = useState<AnalyticsFilter>({})
  const [resumeOptions, setResumeOptions] = useState<Array<{ id: number; label: string }>>([])
  const [directionOptions, setDirectionOptions] = useState<string[]>([])

  // 简历版本与方向是**投递链路**的维度：从简历列表取选项（只取有方向的，去重）
  useEffect(() => {
    void fetchResumes()
      .then((result) => {
        setResumeOptions(result.items.map((item) => ({ id: item.id, label: `${item.name} #${String(item.id)}` })))
        setDirectionOptions([...new Set(result.items.map((item) => item.direction).filter((d) => d !== ''))].sort())
      })
      .catch(() => {
        /* 选项拉不到不影响看板本身 */
      })
  }, [props.revision])

  // F1：口径是**用户选的**，不是服务猜的 —— 两个口径算出来的中位数可以差好几成
  const [basis, setBasis] = useState<SalaryBasis>('monthly_min')

  const funnel = useAsync((signal) => fetchFunnel(filter, signal), [props.revision, filter])
  const attribution = useAsync((signal) => fetchAttribution(filter, signal), [props.revision, filter])
  const salary = useAsync((signal) => fetchSalaryBand(filter, signal), [props.revision, filter])
  const salaryBox = useAsync((signal) => fetchSalaryBox(filter, basis, signal), [props.revision, filter, basis])
  // F2：基准来自**自己抓到的岗位库**（不联网、不编行业数据）
  const baseline = useAsync((signal) => fetchSalaryBaseline(filter, signal), [props.revision, filter])
  // F3：简历 A/B 对比（每格带样本量，不做显著性）
  const resumeCompare = useAsync((signal) => fetchResumeCompare(filter, signal), [props.revision, filter])
  // 提前取出数据：TS 不会把 `status === 'ok'` 的收窄带进回调里
  const funnelData = funnel.state.status === 'ok' ? funnel.state.data : null
  const attributionData = attribution.state.status === 'ok' ? attribution.state.data : null
  const salaryData = salary.state.status === 'ok' ? salary.state.data : null

  const activeCount = Object.values(filter).filter((value) => value !== undefined && value !== '').length
  const patch = (next: Partial<AnalyticsFilter>): void => {
    setFilter((current) => {
      const merged = { ...current, ...next }
      // 空字符串等于"取消这一项"，别把它当成筛选条件发出去
      for (const key of Object.keys(merged) as Array<keyof AnalyticsFilter>) {
        if (merged[key] === '' || merged[key] === undefined) delete merged[key]
      }
      return merged
    })
  }

  return (
    <div className="jh-screen">
      <h2 className="jh-card-title">数据看板</h2>

      {/* ── 全局筛选栏：一处改动，漏斗/归因/薪资一起重算 ─────────────── */}
      <div className="jh-filterbar">
        <label className="jh-field">
          <span>起</span>
          <input
            className="jh-input jh-input-sm"
            type="date"
            value={(filter.from ?? '').slice(0, 10)}
            onChange={(event) =>
              patch({ from: event.target.value === '' ? '' : `${event.target.value}T00:00:00.000Z` })
            }
          />
        </label>
        <label className="jh-field">
          <span>止</span>
          <input
            className="jh-input jh-input-sm"
            type="date"
            value={(filter.to ?? '').slice(0, 10)}
            onChange={(event) =>
              patch({ to: event.target.value === '' ? '' : `${event.target.value}T23:59:59.999Z` })
            }
          />
        </label>
        <label className="jh-field">
          <span>关键词（岗位名）</span>
          <input
            className="jh-input jh-input-sm"
            placeholder="Java"
            value={filter.keyword ?? ''}
            onChange={(event) => patch({ keyword: event.target.value })}
          />
        </label>
        <label className="jh-field">
          <span>方向（简历）</span>
          <select
            className="jh-select jh-input-sm"
            value={filter.direction ?? ''}
            onChange={(event) => patch({ direction: event.target.value })}
          >
            <option value="">全部方向</option>
            {directionOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="jh-field">
          <span>城市</span>
          <input
            className="jh-input jh-input-sm"
            placeholder="深圳"
            value={filter.city ?? ''}
            onChange={(event) => patch({ city: event.target.value })}
          />
        </label>
        <label className="jh-field">
          <span>简历版本</span>
          <select
            className="jh-select jh-input-sm"
            value={filter.resumeId === undefined ? '' : String(filter.resumeId)}
            onChange={(event) => patch({ resumeId: event.target.value === '' ? undefined : Number(event.target.value) })}
          >
            <option value="">全部版本</option>
            {resumeOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <span className="jh-spacer" />
        {activeCount === 0 ? null : (
          <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={() => setFilter({})}>
            清空筛选（{activeCount}）
          </button>
        )}
      </div>
      {/* 方向与简历版本只对投递链路成立，而且这一点必须写在脸上 */}
      <p className="jh-info">
        <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
        <span>
          <b>方向</b>与<b>简历版本</b>只作用于<b>投递段</b> —— 打招呼没有记录用过哪版简历／什么方向，
          接触段（打招呼/送达/已读/回复）不受这两项影响。<b>薪资分位</b>来自岗位库，
          它的时间窗是<b>岗位抓取时间</b>，不是你的投递时间。
        </span>
      </p>

      <h3 className="jh-card-title">漏斗</h3>
      {funnelData === null ? (
        <p className="jh-muted">正在统计…</p>
      ) : (
        <div className="jh-card">
          <ul className="jh-funnel">
            {funnelData.steps.map((step, index) => {
              // 总体切换处画一条分隔线：这两段本来就不可比（跨总体算转化率会 >100%）
              const previous = index === 0 ? undefined : funnelData.steps[index - 1]
              const boundary = previous !== undefined && previous.population !== step.population
              const samePopulation = previous !== undefined && previous.population === step.population
              const drop = samePopulation && previous !== undefined ? previous.count - step.count : null
              const top = funnelData.steps[0]?.count ?? 0
              return (
                <li key={step.key}>
                  {index === 0 || boundary ? (
                    <span className="jh-funnel-seg">
                      {step.population === 'contact'
                        ? '接触阶段 · 打招呼链路'
                        : '投递阶段 · 投递 → 面试 → Offer'}
                    </span>
                  ) : null}
                  <div className="jh-funnel-row">
                    <span className="jh-funnel-label">{step.label}</span>
                    <span className="jh-funnel-track">
                      <span
                        className={`jh-funnel-bar${step.population === 'application' ? ' jh-funnel-bar-apply' : ''}`}
                        // max() 是给"0 也看得见一条基线"：全 0 时若宽度就是 0，整张图会像没画
                        style={{ width: `max(3px, ${String(funnelWidth(step.count, top))}%)` }}
                      />
                    </span>
                    <button
                      type="button"
                      className="jh-funnel-count"
                      title="点开看这一段的明细"
                      onClick={() => props.onDrillDown(step.key)}
                    >
                      {step.count}
                    </button>
                    <span className="jh-muted jh-funnel-rate">
                      {step.rate === null ? '—' : `${(step.rate * 100).toFixed(0)}%`}
                    </span>
                    <span className="jh-muted jh-funnel-drop">
                      {drop === null || drop <= 0 ? '' : `流失 ${String(drop)}`}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {/* 说教搬进 Tooltip：版面上只留一个可扫的徽章，要依据时悬停看 */}
          <span
            className={`jh-chip ${funnelData.sampleSize < 5 ? 'jh-chip-warn' : 'jh-chip-dirty'}`}
            title={funnelData.note}
          >
            {funnelData.sampleSize < 5 ? '⚠ ' : ''}样本 {funnelData.sampleSize} 条 · 悬停看口径
          </span>
        </div>
      )}

      <h3 className="jh-card-title">归因</h3>
      {attributionData !== null ? (
        <>
          <div className="jh-card">
            <h4 className="jh-card-title">按渠道</h4>
            <AttributionTable rows={attributionData.byChannel} />
          </div>
          <div className="jh-card">
            <h4 className="jh-card-title">按简历版本</h4>
            <AttributionTable rows={attributionData.byResume} />
            <p className="jh-muted">{attributionData.note}</p>
          </div>
        </>
      ) : (
        <p className="jh-muted">正在统计…</p>
      )}

      <h3 className="jh-card-title">薪资分布（箱线图 · 本地基准）</h3>
      <div className="jh-card">
        {/* F1：口径切换。**必须显式**：两个口径算出来的中位数可以差好几成 */}
        <div className="jh-filters">
          <span className="jh-muted">口径</span>
          <div className="jh-modes">
            {SALARY_BASES.map((value) => (
              <button
                key={value}
                type="button"
                className={`jh-mode${value === basis ? ' jh-mode-active' : ''}`}
                onClick={() => setBasis(value)}
              >
                {SALARY_BASIS_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        {salaryBox.state.status === 'ok' ? (
          salaryBox.state.data.box.count === 0 ? (
            <p className="jh-muted">这个范围里没有符合该口径的岗位。</p>
          ) : (
            <>
              <SalaryBoxChart box={salaryBox.state.data.box} />
              <p className="jh-muted">
                样本 {salaryBox.state.data.box.count} 条 · 箱体（P25–P75）里装了{' '}
                {salaryBox.state.data.box.withinBox} 条
              </p>
              <p className="jh-info">
                <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
                <span>{salaryBox.state.data.note}</span>
              </p>
            </>
          )
        ) : (
          <p className="jh-muted">正在统计…</p>
        )}

        {/* F2：本地基准对比 —— 基准只能是自己的岗位库 */}
        {baseline.state.status === 'ok' && (
          <div className="jh-baseline">
            <h4 className="jh-sub-title">我自己投递过的 vs 全部在库（同一口径：月薪下限）</h4>
            {baseline.state.data.all.count === 0 ? (
              <p className="jh-muted">岗位库里还没有带薪资的岗位。</p>
            ) : (
              <>
                <table className="jh-table">
                  <thead>
                    <tr>
                      <th scope="col">分组</th>
                      <th scope="col">样本</th>
                      <th scope="col">P25</th>
                      <th scope="col">中位</th>
                      <th scope="col">P75</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>全部在库</td>
                      <td>{baseline.state.data.all.count}</td>
                      <td>{baseline.state.data.all.p25 ?? '—'}</td>
                      <td>{baseline.state.data.all.median ?? '—'}</td>
                      <td>{baseline.state.data.all.p75 ?? '—'}</td>
                    </tr>
                    <tr>
                      <td>我投递过的</td>
                      <td>{baseline.state.data.applied.count}</td>
                      <td>{baseline.state.data.applied.p25 ?? '—'}</td>
                      <td>{baseline.state.data.applied.median ?? '—'}</td>
                      <td>{baseline.state.data.applied.p75 ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
                <p className={baseline.state.data.enoughSample ? 'jh-muted' : 'jh-warn'}>
                  中位数之差：
                  {baseline.state.data.medianGap === null
                    ? '无法计算（有一边没有样本）'
                    : `${baseline.state.data.medianGap > 0 ? '+' : ''}${String(baseline.state.data.medianGap)} 元/月`}
                  {baseline.state.data.enoughSample ? '' : ' —— 样本不足，别看差额'}
                </p>
                <p className="jh-info">
                  <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
                  <span>{baseline.state.data.note}</span>
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* F3：简历版本 A/B 对比。**不做显著性**，每格带样本量 */}
      <h3 className="jh-card-title">简历版本对比</h3>
      <div className="jh-card">
        {resumeCompare.state.status === 'ok' ? (
          <>
            <table className="jh-table">
              <thead>
                <tr>
                  <th scope="col">简历版本</th>
                  <th scope="col">投递数</th>
                  {resumeCompare.state.data.stages.map((stage) => (
                    <th scope="col" key={stage.stage}>{stage.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resumeCompare.state.data.rows.map((row) => (
                  <tr key={String(row.resumeId)}>
                    <td>
                      {row.label}
                      {row.enoughSample ? null : <span className="jh-chip jh-chip-quiet">样本少</span>}
                    </td>
                    <td>{row.total}</td>
                    {row.cells.map((cell) => (
                      // 每格都标出\"分子/分母\"，而不是只给一个百分比 ——
                      // 2 条样本里的 1 条不是\"50%\"，是\"1/2\"
                      <td key={cell.stage} className={cell.thin ? 'jh-warn' : undefined}>
                        {cell.count === 0 ? '—' : `${String(cell.count)}/${String(row.total)}`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {resumeCompare.state.data.rows.length === 0 && <p className="jh-muted">还没有投递记录。</p>}
            <p className="jh-info">
              <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
              <span>{resumeCompare.state.data.note}</span>
            </p>
          </>
        ) : (
          <p className="jh-muted">正在统计…</p>
        )}
      </div>

      <h3 className="jh-card-title">薪资分位</h3>
      <div className="jh-card">
        {salary.state.status === 'ok' ? (
          salary.state.data.count === 0 ? (
            <p className="jh-muted">这个范围里没有带薪资下限的岗位。</p>
          ) : (
            <p className="jh-muted">
              {salary.state.data.scope} · 样本 {salary.state.data.count} 条（只统计薪资下限）｜ 最低{' '}
              {salary.state.data.min} · P25 {salary.state.data.p25} · 中位 {salary.state.data.median} · P75{' '}
              {salary.state.data.p75} · 最高 {salary.state.data.max}
            </p>
          )
        ) : (
          <p className="jh-muted">正在统计…</p>
        )}
        {/* 口径标注：这一块的口径与上面两块**不同轴**，不写出来就会被误读 */}
        <p className="jh-info">
          <span className="jh-info-icon" aria-hidden="true">ⓘ</span>
          <span>城市与关键词在这里筛的是<b>岗位库</b>；时间窗是<b>岗位抓取时间</b>，不是你的投递时间。</span>
        </p>
      </div>
    </div>
  )
}

/**
 * 箱线图（F1）。
 *
 * 用**横向**画：薪资是"多少"而不是"什么时候"，横向比纵向好读，也和上面的漏斗条形一致。
 *
 * 高亮的是 **P25–P75 箱体**（`withinBox` 条样本在里面），
 * 两端的须是最小/最大值 —— 明确不做离群点剔除：
 * 剔了会把真实的高薪岗从图上删掉，而用户会以为"这城市没有高薪岗"。
 */
function SalaryBoxChart(props: { box: SalaryBoxDto }) {
  const { min, p25, median, p75, max } = props.box
  if (min === null || p25 === null || median === null || p75 === null || max === null) return null
  const span = max - min
  // 全部样本同值时 span=0：这时给一个满宽的箱体，而不是除零画出 NaN
  const at = (value: number): number => (span <= 0 ? 50 : ((value - min) / span) * 100)

  return (
    <div className="jh-box">
      <div className="jh-box-track">
        <div className="jh-box-whisker" style={{ left: `${String(at(min))}%`, width: `${String(at(max) - at(min))}%` }} />
        <div className="jh-box-body" style={{ left: `${String(at(p25))}%`, width: `${String(Math.max(0.5, at(p75) - at(p25)))}%` }} />
        <div className="jh-box-median" style={{ left: `${String(at(median))}%` }} />
      </div>
      <div className="jh-box-scale">
        <span>{min}</span>
        <span>P25 {p25}</span>
        <span>中位 {median}</span>
        <span>P75 {p75}</span>
        <span>{max}</span>
      </div>
      <p className="jh-note">{props.box.basisLabel} · 高亮段 = P25–P75（箱体）</p>
    </div>
  )
}

function funnelWidth(count: number, top: number): number {
  if (top <= 0) return 0
  return Math.max(2, Math.round((count / top) * 100))
}

function AttributionTable(props: { rows: Array<{ key: string; label: string; total: number; replied: number; interviewed: number; offered: number; replyRate: number }> }) {
  if (props.rows.length === 0) return <p className="jh-muted">还没有投递记录。</p>
  return (
    <table className="jh-table">
      <thead>
        <tr>
          <th scope="col">分组</th>
          <th scope="col">投递</th>
          <th scope="col">已回复</th>
          <th scope="col">面试</th>
          <th scope="col">Offer</th>
          <th scope="col">回复率</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td>{row.total}</td>
            <td>{row.replied}</td>
            <td>{row.interviewed}</td>
            <td>{row.offered}</td>
            <td>{(row.replyRate * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
