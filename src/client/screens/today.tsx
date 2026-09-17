import { useState } from 'react'
import {
  ApiError,
  closeTodo,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchToday,
  runCrawl,
  runPlan,
  startLogin,
  type TodayDto,
} from '../api.js'
import { useAsync } from '../use-async.js'

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
 * P3 之后这里多了两块必须可见的东西：
 *   * **调度状态**：下次什么时候跑、上次什么时候跑的、本实例是不是只读（另一个实例在跑）；
 *   * **平台与登录**：登录态失效必须在这里看得见 —— 而不是变成「今天没有新岗位」。
 */
export function TodayScreen(props: { revision: number; onGoJobs: () => void }) {
  const today = useAsync((signal) => fetchToday(signal), [props.revision])
  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision])
  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision])
  const [feedback, setFeedback] = useState<Feedback>(IDLE)

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

  const startCrawl = (): Promise<void> =>
    act('正在抓取…（会打开一个浏览器窗口）', async () => {
      const summary = await runCrawl({ platformId: '51job', criteria: { keyword: 'Java', city: '深圳' } })
      const run = summary.run
      return (
        `本轮 ${run.state}：命中 ${String(run.found)} · 新增 ${String(run.inserted)} · ` +
        `更新 ${String(run.updated)} · 隔离 ${String(run.quarantined)}` +
        (run.errorCode === null ? '' : ` · ${run.errorCode}`)
      )
    })

  const catchUp = (planId: number): Promise<void> =>
    act('正在补跑错过的轮次…', async () => {
      const summary = await runPlan(planId, true)
      return `补跑完成：${summary.run.state} · 新增 ${String(summary.run.inserted)}`
    })

  const login = (platformId: string): Promise<void> =>
    act('已打开登录页，请在弹出的浏览器窗口里完成登录（每 3 秒检测一次）', async () => {
      const status = await startLogin(platformId)
      return status.message ?? '登录引导已启动'
    })

  const data: TodayDto | null = today.state.status === 'ok' ? today.state.data : null
  const sched = scheduler.state.status === 'ok' ? scheduler.state.data : null

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

          <section className="jh-card">
            <h2 className="jh-card-title">定时抓取</h2>
            {scheduler.state.status === 'error' && <p className="jh-error">{scheduler.state.message}</p>}
            {sched !== null && (
              <>
                {sched.readOnly && (
                  <p className="jh-error">本实例只读：{sched.readOnlyReason ?? '另一个实例正在运行'}</p>
                )}
                <ul className="jh-kv">
                  <li>
                    <span>下次运行</span>
                    <span>{sched.nextRunAt ?? '—'}</span>
                  </li>
                  <li>
                    <span>上次运行</span>
                    <span>{sched.lastRunAt ?? '—'}</span>
                  </li>
                  <li>
                    <span>调度</span>
                    <span>{sched.scheduling ? (sched.armed ? '已武装' : '等待方案启用') : '未启动'}</span>
                  </li>
                  <li>
                    <span>租约</span>
                    <span>
                      {sched.lease.held
                        ? `本实例持有（pid ${String(sched.lease.pid ?? '?')}）`
                        : `他人持有（pid ${String(sched.lease.pid ?? '?')}）`}
                    </span>
                  </li>
                </ul>

                {sched.plans.length === 0 ? (
                  <p className="jh-muted">还没有搜索方案。</p>
                ) : (
                  <ul className="jh-list">
                    {sched.plans.map((plan) => (
                      <li key={plan.id}>
                        <b>{plan.name}</b> · {plan.platforms.join('/')} ·{' '}
                        {plan.schedule.enabled
                          ? `${plan.schedule.weekdays.length === 0 ? '每天' : `周${plan.schedule.weekdays.join(',')}`} ${String(plan.schedule.hour).padStart(2, '0')}:${String(plan.schedule.minute).padStart(2, '0')}`
                          : '不定时'}
                        <button
                          type="button"
                          className="jh-btn jh-btn-inline jh-btn-tiny"
                          disabled={feedback.running || sched.readOnly}
                          onClick={() =>
                            void act('正在按方案抓取…', async () => {
                              const summary = await runPlan(plan.id)
                              return `方案「${plan.name}」：${summary.run.state} · 新增 ${String(summary.run.inserted)}`
                            })
                          }
                        >
                          立即运行
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <button
              type="button"
              className="jh-btn"
              disabled={feedback.running || (sched?.readOnly ?? false)}
              onClick={() => void startCrawl()}
            >
              {feedback.running ? '执行中…' : '抓取一次（51job · 深圳 Java）'}
            </button>
            {feedback.message === null ? null : (
              <p className={feedback.tone === 'error' ? 'jh-error' : 'jh-muted'}>{feedback.message}</p>
            )}
          </section>

          <section className="jh-card">
            <h2 className="jh-card-title">平台与登录</h2>
            {platforms.state.status === 'error' && <p className="jh-error">{platforms.state.message}</p>}
            {platforms.state.status === 'ok' && platforms.state.data.items.length === 0 && (
              <p className="jh-muted">还没有注册平台。</p>
            )}
            {platforms.state.status === 'ok' && platforms.state.data.items.length > 0 && (
              <ul className="jh-list">
                {platforms.state.data.items.map((item) => (
                  <li key={item.id}>
                    <code>{item.id}</code> ·{' '}
                    <b className={item.health === 'healthy' ? 'jh-ok' : 'jh-error'}>{item.health}</b>
                    {' · '}
                    <span className={item.account.loggedIn ? 'jh-ok' : 'jh-warn'}>
                      {item.account.loggedIn ? '已登录' : '未登录'}
                    </span>
                    {' · '}
                    {item.login.state === 'running' ? (
                      <span className="jh-warn">登录检测中…</span>
                    ) : (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={feedback.running}
                        onClick={() => void login(item.id)}
                      >
                        登录
                      </button>
                    )}
                    {item.login.message === null ? null : (
                      <div className="jh-muted">{item.login.message}</div>
                    )}
                    {item.account.hint === null ? null : <div className="jh-muted">{item.account.hint}</div>}
                    {item.healthReason === null ? null : <div className="jh-muted">{item.healthReason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="jh-card">
            <h2 className="jh-card-title">最近一轮抓取</h2>
            {data.lastCrawl === null ? (
              <p className="jh-muted">还没抓过。</p>
            ) : (
              <ul className="jh-kv">
                <li><span>状态</span><b className={data.lastCrawl.state === 'ok' ? 'jh-ok' : 'jh-warn'}>{data.lastCrawl.state}</b></li>
                <li><span>开始</span><span>{data.lastCrawl.startedAt}</span></li>
                <li><span>命中</span><span>{data.lastCrawl.found}</span></li>
                <li><span>新增 / 更新</span><span>{data.lastCrawl.inserted} / {data.lastCrawl.updated}</span></li>
                <li><span>隔离</span><span>{data.lastCrawl.quarantined}</span></li>
                {data.lastCrawl.errorCode === null ? null : (
                  <li>
                    <span>错误</span>
                    <span className="jh-error">{data.lastCrawl.errorCode} · {data.lastCrawl.errorMsg}</span>
                  </li>
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
