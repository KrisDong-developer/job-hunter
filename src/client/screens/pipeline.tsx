import { useCallback, useState } from 'react'
import { APPLICATION_CHANNEL_LABEL, APPLICATION_STAGE_LABEL } from '../../shared/enums.js'
import type { ApplicationStage } from '../../shared/enums.js'
import type { BoardCardDto, FollowUpDto } from '../../shared/dto.js'
import {
  advanceApplication,
  ApiError,
  createApplication,
  fetchApplications,
  fetchAttribution,
  fetchBoard,
  fetchFollowUps,
  fetchFunnel,
  fetchSalaryBand,
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
    // 简易推进：按阶段顺序走下一格。回退只在终态之间用（避免手滑）
    const order: ApplicationStage[] = ['sent', 'viewed', 'interviewing', 'interviewed', 'offer']
    const index = order.indexOf(card.stage)
    if (index < 0 || index >= order.length - 1) return
    const to = order[index + 1]
    if (to === undefined) return
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
              <i className="jh-warn"> · {board.state.data.staleCount} 条卡了 21 天以上</i>
            ) : null}
          </p>
          <div className="jh-board">
            {board.state.data.columns.map((column) => (
              <section className="jh-board-col" key={column.stage}>
                <header className="jh-board-head">
                  {APPLICATION_STAGE_LABEL[column.stage]}
                  <span className="jh-board-count">{column.cards.length}</span>
                </header>
                {column.cards.length === 0 ? (
                  <p className="jh-muted jh-board-empty">—</p>
                ) : (
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
                      <span className={`jh-board-age${card.daysSinceStage >= 21 ? ' jh-warn' : ''}`}>
                        卡了 {card.daysSinceStage} 天
                      </span>
                      <div className="jh-board-actions">
                        <button
                          type="button"
                          className="jh-btn jh-btn-inline"
                          disabled={busy !== null}
                          onClick={() => move(card)}
                        >
                          推进
                        </button>
                        <button
                          type="button"
                          className="jh-btn jh-btn-inline"
                          disabled={busy !== null}
                          onClick={() => setOpenJobId(card.jobId)}
                        >
                          跟进记录
                        </button>
                        <button
                          type="button"
                          className="jh-btn jh-btn-inline"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(card.applicationId, async () =>
                              await advanceApplication({ applicationId: card.applicationId, to: 'rejected' }),
                            )
                          }
                        >
                          已拒绝
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>
            ))}
          </div>
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
  const funnel = useAsync((signal) => fetchFunnel(signal), [props.revision])
  const attribution = useAsync((signal) => fetchAttribution(signal), [props.revision])
  const [city, setCity] = useState('')
  const [keyword, setKeyword] = useState('')
  const salary = useAsync((signal) => fetchSalaryBand({ city, q: keyword }, signal), [props.revision, city, keyword])
  // 提前取出数据：TS 不会把 `status === 'ok'` 的收窄带进回调里
  const funnelData = funnel.state.status === 'ok' ? funnel.state.data : null
  const attributionData = attribution.state.status === 'ok' ? attribution.state.data : null
  const salaryData = salary.state.status === 'ok' ? salary.state.data : null

  return (
    <div className="jh-screen">
      <h2 className="jh-card-title">数据看板</h2>
      <p className="jh-muted">
        样本量小的时候不给结论 —— 投了 3 个岗位算出来的"回复率 100%"是噪声，照着它改策略会更糟。
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

      <h3 className="jh-card-title">薪资分位</h3>
      <div className="jh-card">
        <div className="jh-inline">
          <input
            className="jh-input"
            placeholder="城市（如 深圳）"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <input
            className="jh-input"
            placeholder="关键词（如 Java）"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
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
      </div>
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
          <th>分组</th>
          <th>投递</th>
          <th>已回复</th>
          <th>面试</th>
          <th>Offer</th>
          <th>回复率</th>
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
