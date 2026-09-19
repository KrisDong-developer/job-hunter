import type { BoardCardDto } from '../../../shared/dto.js'
import type { ApplicationStage } from '../../../shared/enums.js'
import { APPLICATION_CHANNEL_LABEL, APPLICATION_STAGE_LABEL, NO_PROGRESS_DAYS, TERMINAL_STAGES, nextStageOf } from '../../../shared/enums.js'
import { useAsync } from '../../hooks/use-async.js'
import { ApiError } from '../../net/client.js'
import { fetchFollowUps } from '../../net/outreach.js'
import { advanceApplication, createApplication, fetchApplications, fetchBoard } from '../../net/pipeline.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { FollowUpRow } from './follow-up-row.js'
import { useCallback, useState } from 'react'

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
      {board.state.status === 'loading' && <LoadingLine>正在读取流水线…</LoadingLine>}
      {board.state.status === 'error' && <ErrorLine>{board.state.message}</ErrorLine>}

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
            <LoadingLine>正在读取…</LoadingLine>
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




