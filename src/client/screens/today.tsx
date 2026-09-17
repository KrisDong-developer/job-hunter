import { useMemo, useState } from 'react'
import { CRAWL_STATE_LABEL } from '../../shared/enums.js'
import { formatClock, formatJitter, formatRelative } from '../../shared/time-format.js'
import {
  ApiError,
  closeTodo,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchToday,
  runDefaultPlan,
  runPlan,
  startLogin,
  type TodayDto,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { useAsync } from '../use-async.js'
import { FreshnessBadge } from './freshness.js'

interface Feedback {
  running: boolean
  tone: 'ok' | 'error'
  message: string | null
}

const IDLE: Feedback = { running: false, tone: 'ok', message: null }

/** 待办里能直接动手的类型 → 动作。 */
function planIdOf(todo: { detail: unknown }): number | null {
  if (todo.detail === null || typeof todo.detail !== 'object') return null
  const value = (todo.detail as { planId?: unknown }).planId
  return typeof value === 'number' ? value : null
}

/**
 * U0 今日 —— 首屏回答「今天干什么」（§5.4）。
 *
 * ## D6：今日**减负**后的样子
 *
 * 只留：新鲜度徽章 + 下次运行（本地时间 + 相对时间 + 抖动说明）+「立即采集」+「去配置」，
 * 平台健康只留**一行只读**。
 *
 * 为什么把配置类内容搬走：这一屏原来塞了「平台与登录」「定时抓取」「最近一轮抓取」三块，
 * 而它们回答的是"系统怎么配"，不是"今天干什么"。两件事混在一屏的结果是
 * **首屏又长又难扫**，而真正需要立刻处理的东西（待办、欠账）被挤到下面。
 * 配置类内容现在的家是 U9「采集」页。
 */
export function TodayScreen(props: { revision: number; onGoJobs: () => void; onGoCollect: () => void }) {
  const today = useAsync((signal) => fetchToday(signal), [props.revision])
  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision])
  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision])
  const [feedback, setFeedback] = useState<Feedback>(IDLE)

  const now = useMemo(() => new Date(), [props.revision])

  const report = (error: unknown): void => {
    setFeedback({
      running: false,
      tone: 'error',
      message: error instanceof ApiError ? error.display : String(error),
    })
  }

  const reloadAll = (): void => {
    today.reload()
    scheduler.reload()
    platforms.reload()
  }

  const act = async (message: string, run: () => Promise<string>): Promise<void> => {
    setFeedback({ running: true, tone: 'ok', message })
    try {
      const done = await run()
      setFeedback({ running: false, tone: 'ok', message: done })
      reloadAll()
    } catch (error) {
      report(error)
    }
  }

  /** A2：「抓取一次」走**默认方案**，不再写死 `{51job, 深圳, Java}`。 */
  const startCrawl = (): Promise<void> =>
    act('正在采集…（会打开一个浏览器窗口）', async () => {
      const summary = await runDefaultPlan()
      const run = summary.run
      return (
        `方案「${summary.planName}」本轮 ${CRAWL_STATE_LABEL[run.state]}：命中 ${String(run.found)} · ` +
        `新增 ${String(run.inserted)} · 更新 ${String(run.updated)} · 隔离 ${String(run.quarantined)}` +
        (run.errorCode === null ? '' : ` · ${run.errorCode}`)
      )
    })

  const catchUp = (planId: number): Promise<void> =>
    act('正在补跑错过的轮次…', async () => {
      const summary = await runPlan(planId, true)
      return `补跑完成：${CRAWL_STATE_LABEL[summary.run.state]} · 新增 ${String(summary.run.inserted)}`
    })

  const login = (platformId: string): Promise<void> =>
    act('已打开登录页，请在弹出的浏览器窗口里完成登录（每 3 秒检测一次）', async () => {
      const status = await startLogin(platformId)
      return status.message ?? '登录引导已启动'
    })

  const data: TodayDto | null = today.state.status === 'ok' ? today.state.data : null
  const sched = scheduler.state.status === 'ok' ? scheduler.state.data : null
  const platformItems = platforms.state.status === 'ok' ? platforms.state.data.items : []
  const unhealthy = platformItems.filter((item) => item.health !== 'healthy' || !item.account.loggedIn)

  // 新鲜度取**最旧**的那个方案：只要有一个陈旧，"今天的数据"就整体不算新鲜
  const worst = sched === null || sched.planStatus.length === 0
    ? null
    : sched.planStatus.reduce((acc, item) =>
        (item.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) >
        (acc.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY)
          ? item
          : acc,
      )
  const nextTrigger = sched?.triggers[0] ?? null

  return (
    <div className="jh-screen">
      {today.state.status === 'loading' && <p className="jh-muted">正在读取今日概况…</p>}

      {today.state.status === 'error' && (
        <div className="jh-card">
          <h2 className="jh-card-title">读不到今日概况</h2>
          <p className="jh-error">{today.state.message}</p>
          {today.state.hint === undefined ? null : <p className="jh-muted">{today.state.hint}</p>}
          <button type="button" className="jh-btn" onClick={today.reload}>重试</button>
        </div>
      )}

      {data !== null && !data.dataReady && (
        <div className="jh-card">
          <h2 className="jh-card-title">数据层未就绪</h2>
          <p className="jh-error">{data.dataError ?? '未知原因'}</p>
          <p className="jh-muted">插件本身是挂着的 —— 这里如实报告原因，而不是让界面静默变空。</p>
        </div>
      )}

      {/* 离线模式必须说出来：否则「点了抓取没反应」看起来像 bug（§14 的开关） */}
      {data !== null && data.offline && (
        <div className="jh-card jh-card-tight">
          <h2 className="jh-card-title">离线模式已开启</h2>
          <p className="jh-muted">
            抓取与登录引导已被拒绝 —— 这是「自动化测试绝不访问真实招聘站」的开关在起作用。
            去掉环境变量 <code>DSH_JOB_HUNTER_NO_NETWORK</code> 重启即可解除。
          </p>
        </div>
      )}

      {data !== null && (
        <>
          {/* ── 数据新鲜度 + 下一次动作（D6 的核心）────────────────────── */}
          <section className="jh-card">
            <div className="jh-today-head">
              {worst === null ? (
                <span className="jh-muted">还没有采集方案。</span>
              ) : (
                <FreshnessBadge level={worst.freshness.level} hours={worst.freshness.hoursSinceSuccess} />
              )}
              <span className="jh-spacer" />
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-primary"
                disabled={feedback.running || (sched?.readOnly ?? false)}
                onClick={() => void startCrawl()}
              >
                {feedback.running ? '执行中…' : '立即采集'}
              </button>
              <button type="button" className="jh-btn jh-btn-inline" onClick={props.onGoCollect}>
                去配置
              </button>
            </div>

            <p className="jh-muted">
              {nextTrigger === null
                ? '没有启用定时的方案 —— 只会在你点「立即采集」时跑。'
                : `下次自动采集：${formatClock(new Date(nextTrigger.nextRunAt))}（${formatRelative(new Date(nextTrigger.nextRunAt), now)}）` +
                  `${formatJitter(nextTrigger.jitterMs) === null ? '' : ` · ${String(formatJitter(nextTrigger.jitterMs))}`}` +
                  ` · 方案「${nextTrigger.planName}」`}
              {sched?.paused === true ? <InlineMd text=" · **定时已暂停**（手动仍然可用）" /> : null}
            </p>

            {/* SR-2：在场触发只提示，不自动跑 */}
            {sched?.refreshSuggested === true && sched.refreshHint !== null && (
              <p className="jh-warn">{sched.refreshHint}</p>
            )}

            {sched?.readOnly === true && (
              <p className="jh-error">本实例只读：{sched.readOnlyReason ?? '另一个实例正在运行'}</p>
            )}

            {feedback.message === null ? null : (
              <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>{feedback.message}</p>
            )}
          </section>

          {/* ── 健康只留一行只读（细节在「采集」页）────────────────────── */}
          <p className="jh-muted jh-health-line">
            平台健康：
            {platformItems.length === 0
              ? '还没有注册平台'
              : unhealthy.length === 0
                ? '全部正常'
                : unhealthy
                    .map(
                      (item) =>
                        `${item.id} ${item.health !== 'healthy' ? item.health : '未登录'}`,
                    )
                    .join(' · ')}
            {' · '}
            <button type="button" className="jh-link" onClick={props.onGoCollect}>
              看细节
            </button>
          </p>

          <div className="jh-stats">
            <button type="button" className="jh-stat" onClick={props.onGoJobs}>
              <b>{data.newJobs24h}</b>
              <span>24 小时新增</span>
            </button>
            <button type="button" className="jh-stat" onClick={props.onGoJobs}>
              <b>{data.jobCount}</b>
              <span>岗位总数</span>
            </button>
            <div className={`jh-stat${data.pendingRepair > 0 ? ' jh-stat-warn' : ''}`}>
              <b>{data.pendingRepair}</b>
              <span>待修复记录</span>
            </div>
            <div className={`jh-stat${data.todos.some((todo) => todo.level === 'urgent') ? ' jh-stat-error' : ''}`}>
              <b>{data.todos.length}</b>
              <span>待办</span>
            </div>
          </div>

          <section className="jh-card">
            <h2 className="jh-card-title">待办</h2>
            {data.todos.length === 0 ? (
              <p className="jh-muted">没有待办。</p>
            ) : (
              <ul className="jh-todos">
                {data.todos.map((todo) => {
                  const planId = planIdOf(todo)
                  return (
                    <li key={todo.id} className={`jh-todo jh-todo-${todo.level}`}>
                      <span className="jh-todo-level">{todo.level}</span>
                      <div className="jh-todo-body">
                        <div className="jh-todo-title">{todo.title}</div>
                        <div className="jh-muted">
                          {todo.kind}
                          {todo.ref === null ? '' : ` · ${todo.ref}`}
                        </div>
                        <div className="jh-todo-actions">
                          {todo.kind === 'catch-up' && planId !== null && (
                            <button
                              type="button"
                              className="jh-btn jh-btn-inline"
                              disabled={feedback.running}
                              onClick={() => void catchUp(planId)}
                            >
                              立即补跑
                            </button>
                          )}
                          {todo.kind === 'login-required' && todo.ref !== null && (
                            <button
                              type="button"
                              className="jh-btn jh-btn-inline"
                              disabled={feedback.running}
                              onClick={() => void login(todo.ref as string)}
                            >
                              去登录
                            </button>
                          )}
                          {todo.kind === 'blocked' && (
                            <button type="button" className="jh-btn jh-btn-inline" onClick={props.onGoCollect}>
                              去确认恢复
                            </button>
                          )}
                          <button
                            type="button"
                            className="jh-btn jh-btn-inline"
                            disabled={feedback.running}
                            onClick={() =>
                              void act('已忽略', async () => {
                                await closeTodo(todo.id)
                                return '已忽略这条待办'
                              })
                            }
                          >
                            忽略
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
