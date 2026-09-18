import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
  type AttributionRowDto,
  type BoardCardDto,
  type FollowUpDto,
  type FunnelStepDto,
  type ResumeCompareRowDto,
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
import { FieldHint } from '../field-hint.js'
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
 * 筛选口径的完整说明 —— 收纳在标题右侧的问号里，不再占版面。
 *
 * 这几句话原来是一整段内嵌在筛选栏下面的 `jh-info`，首屏被它吃掉三行。
 * 但内容不能丢：**方向与简历版本只对投递段成立**这条边界，不写出来就会被误读成
 * "打招呼也没用这版简历"。所以是"收纳"而不是"删除"。
 */
const FILTER_SCOPE_HINT =
  '方向与简历版本只作用于投递段 —— 打招呼没有记录用过哪版简历／什么方向，' +
  '接触段（打招呼/送达/已读/回复）不受这两项影响。' +
  '薪资分位来自岗位库，它的时间窗是岗位抓取时间，不是你的投递时间。'

/** 去掉空值：空字符串等于"取消这一项"，别把它当成筛选条件发出去。 */
function cleanFilter(input: AnalyticsFilter): AnalyticsFilter {
  const next: AnalyticsFilter = { ...input }
  for (const key of Object.keys(next) as Array<keyof AnalyticsFilter>) {
    if (next[key] === '' || next[key] === undefined) delete next[key]
  }
  return next
}

/**
 * 稳定签名：判断"草稿与已生效是否不同"，与键的插入顺序无关。
 * 不用 JSON.stringify —— 两个对象字面量的键序不一样时会误判成"改过"。
 */
function filterSignature(input: AnalyticsFilter): string {
  return Object.entries(cleanFilter(input))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}

/** 百分比（0-1 → "62%"）。 */
function formatRate(rate: number): string {
  return `${String(Math.round(rate * 100))}%`
}

/**
 * U8 数据看板（§13）。
 *
 * 界面上**先显示样本量，再显示比率** —— 顺序不是小事：
 * 先看到"100% 回复率"再看到"样本 1 条"，人已经形成印象了。
 *
 * 第七轮（2026-09-18，PM 视角的界面重排）改了四件事：
 *   * 筛选区从"改一个字段立刻重查"改成**草稿 + 查询/重置**：
 *     6 个字段各自即时重查等于边打字边发 6 次请求，而且"改到一半"的结果会先闪一下；
 *     「查询」也才有明确语义（此前按钮的位置上什么都没有）。
 *   * 漏斗从"一排横条"改成**连续梯形**（见 `FunnelChart`）。
 *   * 每块数据一个**面板卡**：标题 16px、右上角挂样本徽章，长口径说明收进
 *     「口径说明」展开项或问号 —— 首屏只留结论，依据按需展开。
 *   * 表格数值列右对齐、表头有底、样本够的行才给高亮（判断全部来自 host）。
 */
export function BoardScreen(props: { revision: number; onDrillDown: (step: string) => void }) {
  // 草稿态与已生效态分开：输入先落草稿，点「查询」（或在字段里回车）才重算。
  const [draft, setDraft] = useState<AnalyticsFilter>({})
  const [applied, setApplied] = useState<AnalyticsFilter>({})
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

  const funnel = useAsync((signal) => fetchFunnel(applied, signal), [props.revision, applied])
  const attribution = useAsync((signal) => fetchAttribution(applied, signal), [props.revision, applied])
  const salary = useAsync((signal) => fetchSalaryBand(applied, signal), [props.revision, applied])
  const salaryBox = useAsync((signal) => fetchSalaryBox(applied, basis, signal), [props.revision, applied, basis])
  // F2：基准来自**自己抓到的岗位库**（不联网、不编行业数据）
  const baseline = useAsync((signal) => fetchSalaryBaseline(applied, signal), [props.revision, applied])
  // F3：简历 A/B 对比（每格带样本量，不做显著性）
  const resumeCompare = useAsync((signal) => fetchResumeCompare(applied, signal), [props.revision, applied])
  // 提前取出数据：TS 不会把 `status === 'ok'` 的收窄带进回调里
  const funnelData = funnel.state.status === 'ok' ? funnel.state.data : null
  const attributionData = attribution.state.status === 'ok' ? attribution.state.data : null
  const salaryData = salary.state.status === 'ok' ? salary.state.data : null
  const resumeCompareData = resumeCompare.state.status === 'ok' ? resumeCompare.state.data : null
  /** 表现最好的一行在这里算一次，不在 map 里逐行重算（那也是 O(n²)）。 */
  const bestResume = resumeCompareData === null ? null : bestResumeKey(resumeCompareData.rows)

  const activeCount = Object.keys(applied).length
  const dirty = filterSignature(draft) !== filterSignature(applied)
  const patch = (next: Partial<AnalyticsFilter>): void => {
    setDraft((current) => ({ ...current, ...next }))
  }
  const apply = (): void => {
    setApplied(cleanFilter(draft))
  }
  const reset = (): void => {
    setDraft({})
    setApplied({})
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-screen-title">数据看板</h2>
        <span className="jh-muted">漏斗 · 归因 · 薪资分布 · 简历对比，各自回答一个复盘问题。</span>
        <span className="jh-spacer" />
        <FieldHint text={FILTER_SCOPE_HINT} />
      </div>

      {/* ── 全局筛选：一处改动，漏斗/归因/薪资一起重算 ─────────────── */}
      <section className="jh-card jh-panel jh-filter-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">筛选</h3>
          <span className="jh-muted">方向与简历版本只作用于投递段，完整口径见右上角问号。</span>
          <span className="jh-spacer" />
          {dirty ? (
            <span className="jh-warn">已改动，点「查询」生效</span>
          ) : (
            <span className="jh-muted">已生效 {activeCount} 项</span>
          )}
        </div>
        <div
          className="jh-filter-grid"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              apply()
            }
          }}
        >
          <label className="jh-field">
            <span>起</span>
            <input
              className="jh-input"
              type="date"
              value={(draft.from ?? '').slice(0, 10)}
              onChange={(event) =>
                patch({ from: event.target.value === '' ? '' : `${event.target.value}T00:00:00.000Z` })
              }
            />
          </label>
          <label className="jh-field">
            <span>止</span>
            <input
              className="jh-input"
              type="date"
              value={(draft.to ?? '').slice(0, 10)}
              onChange={(event) =>
                patch({ to: event.target.value === '' ? '' : `${event.target.value}T23:59:59.999Z` })
              }
            />
          </label>
          <label className="jh-field">
            <span>关键词（岗位名）</span>
            <input
              className="jh-input"
              placeholder="Java"
              value={draft.keyword ?? ''}
              onChange={(event) => patch({ keyword: event.target.value })}
            />
          </label>
          <label className="jh-field">
            <span>方向（简历）</span>
            <select
              className="jh-select"
              value={draft.direction ?? ''}
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
              className="jh-input"
              placeholder="深圳"
              value={draft.city ?? ''}
              onChange={(event) => patch({ city: event.target.value })}
            />
          </label>
          <label className="jh-field">
            <span>简历版本</span>
            <select
              className="jh-select"
              value={draft.resumeId === undefined ? '' : String(draft.resumeId)}
              onChange={(event) => patch({ resumeId: event.target.value === '' ? undefined : Number(event.target.value) })}
            >
              <option value="">全部版本</option>
              {resumeOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
        {/* 动作行独立成行并靠右：栅格里的字段不会因为按钮出现/消失而位移。
            类名不用 .jh-filter-actions —— 那个已经被岗位库的高级筛选块占着，
            两处意图不同（那边是标题行内右推），复用一个名字必然互相改坏。 */}
        <div className="jh-filter-foot">
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-quiet"
            disabled={activeCount === 0 && !dirty}
            onClick={reset}
          >
            重置
          </button>
          <button type="button" className="jh-btn jh-btn-inline jh-btn-primary" disabled={!dirty} onClick={apply}>
            查询
          </button>
        </div>
      </section>

      {/* ── 漏斗 ─────────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">漏斗</h3>
          <span className="jh-muted">接触段与投递段分开画 —— 它们是两个不可比的总体。</span>
          <span className="jh-spacer" />
          {funnelData === null ? null : (
            <SampleBadge sample={funnelData.sampleSize} enough={funnelData.enoughSample} hint={funnelData.note} />
          )}
        </div>
        {funnelData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : (
          <FunnelChart steps={funnelData.steps} onDrillDown={props.onDrillDown} />
        )}
      </section>

      {/* ── 归因 ─────────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">归因</h3>
          <span className="jh-muted">这些投递是哪条渠道、哪版简历换来的。</span>
          <span className="jh-spacer" />
          {attributionData === null ? null : (
            <SampleBadge
              sample={attributionData.sampleSize}
              enough={attributionData.enoughSample}
              hint={attributionData.note}
            />
          )}
        </div>
        {attributionData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : (
          <>
            <h4 className="jh-panel-sub">按渠道</h4>
            <AttributionTable rows={attributionData.byChannel} />
            <h4 className="jh-panel-sub">按简历版本</h4>
            <AttributionTable rows={attributionData.byResume} />
          </>
        )}
      </section>

      {/* ── 薪资分布 ─────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">薪资分布</h3>
          <span className="jh-muted">箱线图 · 基准只来自你自己抓到的岗位库。</span>
          <span className="jh-spacer" />
          {/* F1：口径切换。**必须显式**：两个口径算出来的中位数可以差好几成 */}
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
          {salaryBox.state.status === 'ok' ? (
            <SampleBadge
              sample={salaryBox.state.data.box.count}
              enough={salaryBox.state.data.enoughSample}
              hint={salaryBox.state.data.note}
            />
          ) : null}
        </div>

        {salaryBox.state.status !== 'ok' ? (
          <p className="jh-muted">正在统计…</p>
        ) : salaryBox.state.data.box.count === 0 ? (
          <p className="jh-muted">这个范围里没有符合该口径的岗位。</p>
        ) : (
          <>
            <SalaryBoxChart box={salaryBox.state.data.box} />
            {/* 样本量留在明面上（它是结论的一部分），算法与口径收进右下角的展开项 */}
            <div className="jh-panel-foot">
              <span className="jh-muted">
                样本 {salaryBox.state.data.box.count} 条 · 箱体（P25–P75）里装了{' '}
                {salaryBox.state.data.box.withinBox} 条
              </span>
              <span className="jh-spacer" />
              <details className="jh-details jh-details-inline">
                <summary>口径说明</summary>
                <p className="jh-note">{salaryBox.state.data.note}</p>
              </details>
            </div>
          </>
        )}

        {/* F2：本地基准对比 —— 基准只能是自己的岗位库 */}
        {baseline.state.status === 'ok' && (
          <div className="jh-baseline">
            <h4 className="jh-panel-sub">我投递过的 vs 全部在库（同一口径：月薪下限）</h4>
            {baseline.state.data.all.count === 0 ? (
              <p className="jh-muted">岗位库里还没有带薪资的岗位。</p>
            ) : (
              <>
                <div className="jh-table-scroll">
                  <table className="jh-table jh-table-board">
                    <thead>
                      <tr>
                        <th scope="col">分组</th>
                        <th scope="col" className="jh-num">样本</th>
                        <th scope="col" className="jh-num">P25</th>
                        <th scope="col" className="jh-num">中位</th>
                        <th scope="col" className="jh-num">P75</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>全部在库</td>
                        <td className="jh-num">{baseline.state.data.all.count}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.p25)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.median)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.p75)}</td>
                      </tr>
                      <tr>
                        <td>我投递过的</td>
                        <td className="jh-num">{baseline.state.data.applied.count}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.p25)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.median)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.p75)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="jh-panel-foot">
                  <span className={baseline.state.data.enoughSample ? 'jh-muted' : 'jh-warn'}>
                    中位数之差：
                    {baseline.state.data.medianGap === null
                      ? '无法计算（有一边没有样本）'
                      : `${baseline.state.data.medianGap > 0 ? '+' : ''}${String(baseline.state.data.medianGap)} 元/月`}
                    {baseline.state.data.enoughSample ? '' : ' —— 样本不足，别看差额'}
                  </span>
                  <span className="jh-spacer" />
                  <details className="jh-details jh-details-inline">
                    <summary>口径说明</summary>
                    <p className="jh-note">{baseline.state.data.note}</p>
                  </details>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* F3：简历版本 A/B 对比。**不做显著性**，每格带样本量 */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">简历版本对比</h3>
          <span className="jh-muted">同一批投递里，哪版简历走得更远。</span>
          <span className="jh-spacer" />
          {resumeCompare.state.status === 'ok' ? (
            <SampleBadge
              sample={resumeCompare.state.data.sampleSize}
              enough={resumeCompare.state.data.enoughSample}
              hint={resumeCompare.state.data.note}
            />
          ) : null}
        </div>
          {resumeCompareData === null ? (
            <p className="jh-muted">正在统计…</p>
          ) : (
            <>
              <div className="jh-table-scroll">
                <table className="jh-table jh-table-board">
                  <thead>
                    <tr>
                      <th scope="col">简历版本</th>
                      <th scope="col" className="jh-num">投递数</th>
                      {resumeCompareData.stages.map((stage) => (
                        <th scope="col" className="jh-num" key={stage.stage}>{stage.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumeCompareData.rows.map((row) => {
                      const rowKey = String(row.resumeId)
                      const best = rowKey === bestResume
                      return (
                        <tr key={rowKey} className={best ? 'jh-row-best' : undefined}>
                          <td>
                            {row.label}
                            {row.enoughSample ? null : <span className="jh-tag jh-tag-quiet">样本少</span>}
                            {best ? (
                              <span className="jh-tag jh-tag-best" title={BEST_RESUME_HINT}>
                                进入面试最多
                              </span>
                            ) : null}
                          </td>
                          <td className="jh-num">{row.total}</td>
                          {row.cells.map((cell) => (
                            // 每格都标出"分子/分母"，而不是只给一个百分比 ——
                            // 2 条样本里的 1 条不是"50%"，是"1/2"
                            <td key={cell.stage} className={cell.thin ? 'jh-num jh-warn' : 'jh-num'}>
                              {cell.count === 0 ? (
                                <span className="jh-cell-empty">—</span>
                              ) : (
                                `${String(cell.count)}/${String(row.total)}`
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {resumeCompareData.rows.length === 0 && <p className="jh-muted">还没有投递记录。</p>}
              <div className="jh-panel-foot">
                <span className="jh-muted">每格是「分子/分母」；带颜色的格子样本不足 5，只看数字别下结论。</span>
                <span className="jh-spacer" />
                <details className="jh-details jh-details-inline">
                  <summary>口径说明</summary>
                  <p className="jh-note">{resumeCompareData.note}</p>
                </details>
              </div>
            </>
          )}
      </section>

      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">薪资分位</h3>
          <span className="jh-muted">
            {salaryData === null ? '岗位库口径' : `${salaryData.scope} · 只统计薪资下限`}
          </span>
          <span className="jh-spacer" />
          {/* 口径标注：这一块与上面两块**不同轴**，不写出来就会被误读 */}
          <FieldHint text="城市与关键词在这里筛的是岗位库；时间窗是岗位抓取时间，不是你的投递时间。" />
        </div>
        {salaryData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : salaryData.count === 0 ? (
          <p className="jh-muted">这个范围里没有带薪资下限的岗位。</p>
        ) : (
          <div className="jh-metric-row">
            <div className="jh-metric"><span>样本</span><b>{salaryData.count}</b></div>
            <div className="jh-metric"><span>最低</span><b>{salaryData.min}</b></div>
            <div className="jh-metric"><span>P25</span><b>{salaryData.p25}</b></div>
            {/* 中位数是这一块的结论，所以它是唯一带色的数字 */}
            <div className="jh-metric jh-metric-key"><span>中位</span><b>{salaryData.median}</b></div>
            <div className="jh-metric"><span>P75</span><b>{salaryData.p75}</b></div>
            <div className="jh-metric"><span>最高</span><b>{salaryData.max}</b></div>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 样本量徽章（面板卡右上角）。
 *
 * 它替换的是原来**压在卡片底部**的"⚠ 样本 2 条 · 悬停看口径"：
 * 位置从结论下面挪到标题行，语义从"一句提醒"变成"这张卡片的属性"。
 * 样本不足走 `.jh-tag-warn`（浅黄底 + 深色文字）—— 不用"饱和橙底配白字"，
 * 那个配方本项目已经因为 2.15:1 修过一次（见 styles.ts 顶部那段注释）。
 * 口径全文同时挂在 `title`（鼠标用户）与屏读文本上（读屏用户拿不到 title）。
 */
function SampleBadge(props: { sample: number; enough: boolean; hint: string }) {
  return (
    <span className={`jh-tag ${props.enough ? 'jh-tag-quiet' : 'jh-tag-warn'}`} title={props.hint}>
      {props.enough ? '' : '⚠ '}样本 {props.sample} 条
      <span className="jh-sr-only">。{props.hint}</span>
    </span>
  )
}

/** 空值统一渲染成灰色的破折号（全项目同一个字符，见 UI-UX 审核 §9.1）。 */
function numOrDash(value: number | null): ReactNode {
  return value === null ? <span className="jh-cell-empty">—</span> : String(value)
}

/**
 * 漏斗图。
 *
 * 为什么不画成一排独立横条：每层各画各的，视觉上就是七根柱子 ——
 * "越来越窄"这件事完全读不出来（这也是它此前看起来像"文本 + 破折号"的原因）。
 * 这里让**每一层的下边缘等于下一层的上边缘**（同一组宽度统一算 clip-path），
 * 七层因此拼成一条连续的漏斗。
 *
 * 两个总体各算各的 100% 基线：跨总体算占比会把"已投递 3 / 打招呼 2"画成 150%。
 * 服务层对总体切换那一层连 `rate` 都留空了（`rate === null`），这里也不把它们并成一条。
 */
function FunnelChart(props: { steps: FunnelStepDto[]; onDrillDown: (step: string) => void }) {
  const { steps } = props
  const baselineOf = (population: FunnelStepDto['population']): number =>
    steps.find((step) => step.population === population)?.count ?? 0
  const widthOf = (step: FunnelStepDto): number => stepWidth(step.count, baselineOf(step.population))

  return (
    <ol className="jh-funnel-chart">
      {steps.map((step, index) => {
        const previous = index === 0 ? undefined : steps[index - 1]
        const boundary = previous !== undefined && previous.population !== step.population
        const comparable = previous !== undefined && previous.population === step.population
        const drop = comparable && previous !== undefined ? previous.count - step.count : null
        const next = steps[index + 1]
        const continues = next !== undefined && next.population === step.population
        const top = widthOf(step)
        const bottom = continues && next !== undefined ? widthOf(next) : top
        const halfTop = (100 - top) / 2
        const halfBottom = (100 - bottom) / 2
        return (
          <li className="jh-funnel-block" key={step.key}>
            {index === 0 || boundary ? (
              <p className="jh-funnel-seg">
                {step.population === 'contact'
                  ? '接触阶段 · 打招呼链路'
                  : '投递阶段 · 投递 → 面试 → Offer'}
              </p>
            ) : null}
            <div className="jh-funnel-row">
              <span className="jh-funnel-label">{step.label}</span>
              <span className="jh-funnel-track">
                <span
                  className={`jh-funnel-fill${step.population === 'application' ? ' jh-funnel-fill-apply' : ''}`}
                  style={{
                    clipPath:
                      `polygon(${String(halfTop)}% 0, ${String(100 - halfTop)}% 0, ` +
                      `${String(100 - halfBottom)}% 100%, ${String(halfBottom)}% 100%)`,
                  }}
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
              <span className="jh-funnel-rate">
                {step.rate === null ? (
                  <span className="jh-cell-empty" title="跨总体（接触 → 投递）没有转化率">—</span>
                ) : (
                  formatRate(step.rate)
                )}
              </span>
              <span className="jh-funnel-drop" title={drop === null || drop <= 0 ? undefined : `比上一层少 ${String(drop)} 条`}>
                {drop === null || drop <= 0 ? '' : `↓ ${String(drop)}`}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** 每层相对**本段基线**的宽度（%）。下限 8%：0 也要看得见，否则整个阶段在图上消失。 */
function stepWidth(count: number, baseline: number): number {
  if (baseline <= 0) return 100
  return Math.max(8, Math.round((count / baseline) * 100))
}

/**
 * 箱线图（F1）。
 *
 * 用**横向**画：薪资是"多少"而不是"什么时候"，横向比纵向好读，也和上面的漏斗一致。
 *
 * 高亮的是 **P25–P75 箱体**（`withinBox` 条样本在里面），
 * 两端的须是最小/最大值 —— 明确不做离群点剔除：
 * 剔了会把真实的高薪岗从图上删掉，而用户会以为"这城市没有高薪岗"。
 *
 * 第七轮改了两处：
 *   * 刻度从"两端对齐的一行字"改成**按真实数值定位**的轴 ——
 *     原来 `justify-content:space-between` 把 P25/中位/P75 均匀铺开，
 *     读起来像"它们是等距的"，那是假坐标；
 *   * 悬浮给一张卡片，直接给分位数之差（箱体跨度、极值范围），
 *     而不是让用户在图下方读一段算法说明。
 */
function SalaryBoxChart(props: { box: SalaryBoxDto }) {
  const [hot, setHot] = useState<BoxMark | null>(null)
  const { min, p25, median, p75, max, count, withinBox, basisLabel } = props.box
  if (min === null || p25 === null || median === null || p75 === null || max === null) return null
  const span = max - min
  // 全部样本同值时 span=0：这时给一个满宽的箱体，而不是除零画出 NaN
  const at = (value: number): number => (span <= 0 ? 50 : ((value - min) / span) * 100)
  const flatten = span <= 0

  const marks: Array<{ key: BoxMark; label: string; value: number; pos: number }> = flatten
    ? [{ key: 'median', label: '全部同值', value: median, pos: 50 }]
    : [
        { key: 'p25', label: 'P25', value: p25, pos: at(p25) },
        { key: 'median', label: '中位', value: median, pos: at(median) },
        { key: 'p75', label: 'P75', value: p75, pos: at(p75) },
      ]
  // 位置太近的刻度会叠字：按"中位 > P25 > P75"的优先级保留，重叠的直接不画标签
  // （位置仍然由标记点表达，只是不重复标数字）
  const kept: typeof marks = []
  for (const mark of [...marks].sort((a, b) => (a.key === 'median' ? -1 : b.key === 'median' ? 1 : 0))) {
    if (kept.every((other) => Math.abs(other.pos - mark.pos) >= 9)) kept.push(mark)
  }
  const axis = kept.sort((a, b) => a.pos - b.pos)

  return (
    <div className="jh-box">
      <div
        className="jh-box-plot"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0) return
          const ratio = ((event.clientX - rect.left) / rect.width) * 100
          let nearest: BoxMark = 'median'
          let gap = Number.POSITIVE_INFINITY
          for (const mark of marks) {
            const distance = Math.abs(mark.pos - ratio)
            if (distance < gap) {
              gap = distance
              nearest = mark.key
            }
          }
          setHot(nearest)
        }}
        onMouseLeave={() => setHot(null)}
      >
        <div className="jh-box-track">
          {/* 全样本同值时 min/max 是同一个点，须没有长度，画出来只是一条细线 */}
          {flatten ? null : (
            <div className="jh-box-whisker" style={{ left: `${String(at(min))}%`, width: `${String(at(max) - at(min))}%` }} />
          )}
          <div className="jh-box-body" style={{ left: `${String(at(p25))}%`, width: `${String(Math.max(0.5, at(p75) - at(p25)))}%` }} />
          <div className="jh-box-median" style={{ left: `${String(at(median))}%` }} data-hot={hot === 'median' ? '1' : '0'} />
        </div>
        {hot === null ? null : (
          <div className="jh-box-tip" role="tooltip">
            <p className="jh-box-tip-row" data-hot={hot === 'median' ? '1' : '0'}>
              <span>中位数</span>
              <b>{median}</b>
            </p>
            <p className="jh-box-tip-row" data-hot={hot === 'p25' ? '1' : '0'}>
              <span>P25</span>
              <b>{p25}</b>
            </p>
            <p className="jh-box-tip-row" data-hot={hot === 'p75' ? '1' : '0'}>
              <span>P75</span>
              <b>{p75}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>箱体跨度（P75−P25）</span>
              <b>{p75 - p25}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>须（极值）</span>
              <b>{min} – {max}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>样本</span>
              <b>{count} 条（箱体内 {withinBox} 条）</b>
            </p>
            <p className="jh-box-tip-note">{basisLabel}；不做离群点剔除，两端就是最小 / 最大值。</p>
          </div>
        )}
      </div>
      <div className="jh-box-axis">
        {axis.map((mark) => (
          <span key={mark.key}>
            <span className="jh-box-tickmark" style={{ left: `${String(mark.pos)}%` }} />
            <span
              className={`jh-box-ticklabel${mark.key === 'median' ? ' jh-box-ticklabel-key' : ''}`}
              data-hot={hot === mark.key ? '1' : '0'}
              data-anchor={mark.pos <= 0 ? 'start' : mark.pos >= 100 ? 'end' : 'center'}
              style={{ left: `${String(mark.pos)}%` }}
            >
              <i>{mark.label}</i>
              <b>{mark.value}</b>
            </span>
          </span>
        ))}
      </div>
      <p className="jh-note">
        蓝色箱体 = P25–P75（一半样本在这里面）；须的两端是最小 / 最大值。悬停看分位数之差。
      </p>
    </div>
  )
}

type BoxMark = 'p25' | 'median' | 'p75'

/**
 * 回复率最高的一行（只有**样本够**且**唯一最高**时才给高亮）。
 *
 * 并列不高亮：随便挑一行当"最好"是在说假话，而这张表本来就只有几行。
 * `enoughSample` 由 host 判定（`MIN_SAMPLE`），前端不重算阈值。
 */
function bestReplyKey(rows: AttributionRowDto[]): string | null {
  const candidates = rows.filter((row) => row.enoughSample && row.replied > 0)
  if (candidates.length < 2) return null
  const top = Math.max(...candidates.map((row) => row.replyRate))
  const winners = candidates.filter((row) => row.replyRate === top)
  const winner = winners.length === 1 ? winners[0] : undefined
  return winner === undefined ? null : winner.key
}

const BEST_REPLY_HINT = '这一组的回复率在所有样本足够的组里最高；并列时不给高亮。'
const BEST_RESUME_HINT =
  '这一版的「面试中 + 已面试 + Offer」条数在所有样本足够的版本里最多；并列时不给高亮。'

/**
 * 简历对比里"走得更远"的一行。
 *
 * 定义写在这里、也写在标签的 title 里：**面试中 + 已面试 + Offer 之和**。
 * 不用"回复率"是因为这张表按**当前阶段**分列，根本没有回复那一列；
 * 而投递之后真正有意义的分水岭就是"进了面试"。
 */
function bestResumeKey(rows: ResumeCompareRowDto[]): string | null {
  const score = (row: ResumeCompareRowDto): number =>
    ['interviewing', 'interviewed', 'offer'].reduce(
      (sum, stage) => sum + (row.cells.find((cell) => cell.stage === stage)?.count ?? 0),
      0,
    )
  const candidates = rows.filter((row) => row.enoughSample && score(row) > 0)
  if (candidates.length < 2) return null
  const top = Math.max(...candidates.map(score))
  const winners = candidates.filter((row) => score(row) === top)
  const winner = winners.length === 1 ? winners[0] : undefined
  return winner === undefined ? null : String(winner.resumeId)
}

/**
 * 归因表。
 *
 * 数值列右对齐 + 等宽数字（纵向比大小要位数对齐）、分组列左对齐；
 * 样本足够且回复率唯一最高的那一行给浅绿底 —— 高亮的是**结论**，
 * 所以它必须由 host 的 `enoughSample` 把关，而不是"看着最高就标"。
 */
function AttributionTable(props: { rows: AttributionRowDto[] }) {
  const best = bestReplyKey(props.rows)
  if (props.rows.length === 0) return <p className="jh-muted">还没有投递记录。</p>
  return (
    /* 表格自己横向滚动，而不是把整块面板撑宽：
       实测 320px 下面板只有 252px 可用，而 8 列表格的 min-content 是 369px ——
       不套这一层，`.jh-body` 会整体横向滚动（顶部筛选条跟着跑掉）。 */
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-board">
        <thead>
          <tr>
            <th scope="col">分组</th>
            <th scope="col" className="jh-num">投递</th>
            <th scope="col" className="jh-num">已回复</th>
            <th scope="col" className="jh-num">面试</th>
            <th scope="col" className="jh-num">Offer</th>
            <th scope="col" className="jh-num">回复率</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.key} className={row.key === best ? 'jh-row-best' : undefined}>
              <td>
                {row.label}
                {row.key === best ? (
                  <span className="jh-tag jh-tag-best" title={BEST_REPLY_HINT}>
                    回复率最高
                  </span>
                ) : null}
              </td>
              <td className="jh-num">{row.total}</td>
              <td className="jh-num">{row.replied}</td>
              <td className="jh-num">{row.interviewed}</td>
              <td className="jh-num">{row.offered}</td>
              <td className="jh-num">{formatRate(row.replyRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
