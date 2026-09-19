import { useMemo, useRef, useState } from 'react'
import {
  CRAWL_STATE_LABEL,
  HEALTH_STATE_LABEL,
  TODO_KIND_LABEL,
  TODO_LEVEL_LABEL,
} from '../../shared/enums.js'
import { formatClock, formatJitter, formatRelative } from '../../shared/time-format.js'
import {
  ApiError,
  closeTodo,
  fetchPlatforms,
  fetchSchedulerStatus,
  fetchToday,
  resumeConfirmAction,
  runDefaultPlan,
  runPlan,
  startLogin,
  type TodayDto,
} from '../api.js'
import { InlineMd } from '../inline-md.js'
import { useAsync, type AsyncState } from '../use-async.js'
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
 * `confirm-action` 待办的**可恢复目标** —— 宿主只接受带 `jobId` 的那些
 * （见 `POST /todos/:id/confirm-actions/resume`）。
 *
 * 正文不入库（§4.1），所以"一键执行"是做不到的：宿主只交回 `{action, target}`，
 * 界面能做的诚实的事是**带用户回到那个岗位**让他重新发起。
 */
function confirmTargetJobIdOf(todo: { detail: unknown }): number | null {
  if (todo.detail === null || typeof todo.detail !== 'object') return null
  const target = (todo.detail as { target?: unknown }).target
  if (target === null || target === undefined || typeof target !== 'object') return null
  const value = (target as { jobId?: unknown }).jobId
  return typeof value === 'number' ? value : null
}

/** 待办级别 / 类别 → 中文。认不出的键原样返回 —— 不假装认识。 */
function todoLevelLabel(level: string): string {
  return (TODO_LEVEL_LABEL as Record<string, string>)[level] ?? level
}

function todoKindLabel(kind: string): string {
  return (TODO_KIND_LABEL as Record<string, string>)[kind] ?? kind
}

/**
 * 重新拉取期间沿用**上一次成功**的数据。
 *
 * `useAsync` 的 `reload()` 会把状态打回 `loading`，而本屏的内容整块挂在
 * `data !== null` 上 —— 于是每次点完「立即采集 / 忽略」界面都会闪成一句
 * 「正在读取今日概况…」，连刚写进去的执行结果也一起消失。
 *
 * 这里只兜住这一次闪断：加载中接着显示上一次的数据；**出错则不给旧数据**，
 * 那时界面该如实报错，而不是继续把过期的"今天"摆在那里。
 */
function useSticky<T>(state: AsyncState<T>): T | null {
  const last = useRef<T | null>(null)
  if (state.status === 'ok') last.current = state.data
  return state.status === 'ok' ? state.data : state.status === 'loading' ? last.current : null
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
export function TodayScreen(props: {
  revision: number
  onGoJobs: () => void
  /** 打开某个岗位的详情（「待确认动作」要把用户带回目标上下文）。 */
  onGoJob: (jobId: number) => void
  onGoCollect: () => void
}) {
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

  /**
   * A2：「抓取一次」不写死 `{51job, 深圳, Java}` —— 它跑本屏**正在倒计时的那条方案**。
   *
   * 为什么不一律交给后端的"默认方案"：那个取的是 id 最小的启用方案，
   * 而本屏写着「下次自动采集 · 方案「X」」—— 两者可以是两条不同的方案，
   * 用户点下去跑了另一条，界面上没有任何地方能让他看出来。
   * 没有定时方案时才退回默认方案（例如只有一条"纯手动"方案的情形）。
   */
  const startCrawl = (): Promise<void> =>
    act('正在采集…（会打开一个浏览器窗口）', async () => {
      const summary =
        nextTrigger === null
          ? await runDefaultPlan()
          : { ...(await runPlan(nextTrigger.planId)), planName: nextTrigger.planName }
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

  /**
   * 「待确认动作」待办：关掉它，并把用户带到目标岗位重新发起。
   *
   * 宿主**不重放**原动作（正文不入库，§4.1），所以按钮不叫"一键执行"而是"去处理"：
   * 界面能做的只有"带你回到那个上下文"。也正因为要走人，这里不用 `act`
   * —— 那会在一个已经卸载的屏上再拉一次数据。
   */
  const resumeConfirm = async (todoId: number, jobId: number): Promise<void> => {
    setFeedback({ running: true, tone: 'ok', message: '正在打开这条动作的目标岗位…' })
    try {
      await resumeConfirmAction(todoId)
      setFeedback(IDLE)
      props.onGoJob(jobId)
    } catch (error) {
      report(error)
    }
  }

  const data: TodayDto | null = useSticky(today.state)
  const sched = useSticky(scheduler.state)
  const platformItems = useSticky(platforms.state)?.items ?? []
  const unhealthy = platformItems.filter(
    (item) =>
      item.health !== 'healthy' ||
      // 「没检测过」不是「未登录」（与「采集」页同一条口径）：全新安装时
      // `account_state` 是空的，把空当未登录会让首屏对每个平台都报一次假警报，
      // 而调度侧恰恰把这种账号当"可以跑"（见 platformGate 的注释）。
      (!item.account.loggedIn && item.account.lastCheckAt !== null),
  )

  // 新鲜度取**最旧**的那个方案：只要有一个陈旧，"今天的数据"就整体不算新鲜。
  // 只看**启用中**的方案 —— 停用的方案不该让首屏永远挂着"陈旧"，
  // 也与后端的 `refreshSuggested` 对齐（它同样只算 enabled 的那些）。
  const measured = sched === null ? [] : sched.planStatus.filter((item) => item.enabled)
  const worst =
    measured.length === 0
      ? null
      : measured.reduce((acc, item) =>
          (item.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) >
          (acc.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY)
            ? item
            : acc,
        )
  // `triggers` 是按**方案顺序**给的，不是按时间排的 —— 不排序就会把"第二条方案的下次时间"
  // 当成"下次自动采集"（真正最早的那个在 `sched.nextRunAt`，那是武装定时器用的）。
  const nextTrigger =
    sched === null || sched.triggers.length === 0
      ? null
      : ([...sched.triggers].sort((left, right) =>
          left.nextRunAt < right.nextRunAt ? -1 : left.nextRunAt > right.nextRunAt ? 1 : 0,
        )[0] ?? null)

  return (
    <div className="jh-screen">
      {/* 只有**没有东西可显示**时才占这一行：重新拉取期间沿用旧数据（见 useSticky），
          再插一句"正在读取"会把整块内容顶下去 —— 那正是要消掉的闪断 */}
      {today.state.status === 'loading' && data === null && (
        <p className="jh-muted">正在读取今日概况…</p>
      )}

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

      {/* 数据层没就绪时只报原因：下面整块数字都是空集，摆出来就是自相矛盾 */}
      {data !== null && data.dataReady && (
        <>
          {/* ── 数据新鲜度 + 下一次动作（D6 的核心）────────────────────── */}
          <section className="jh-card">
            <div className="jh-today-head">
              {worst === null ? (
                <span className="jh-muted">
                  {sched !== null && sched.planStatus.length > 0
                    ? '没有启用定时的方案 —— 数据不会自动更新。'
                    : '还没有采集方案。'}
                </span>
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
                        `${item.id} ${
                          item.health !== 'healthy' ? HEALTH_STATE_LABEL[item.health] : '未登录'
                        }`,
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
              <b>{data.openTodoCount}</b>
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
                  const confirmJobId = confirmTargetJobIdOf(todo)
                  return (
                    <li key={todo.id} className={`jh-todo jh-todo-${todo.level}`}>
                      <span className="jh-todo-level">{todoLevelLabel(todo.level)}</span>
                      <div className="jh-todo-body">
                        <div className="jh-todo-title">{todo.title}</div>
                        <div className="jh-muted">
                          {todoKindLabel(todo.kind)}
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
                              /* 只读实例不许开浏览器（宿主也会拒绝）—— 与「立即采集」同一条纪律 */
                              disabled={feedback.running || (sched?.readOnly ?? false)}
                              onClick={() => void login(todo.ref as string)}
                            >
                              去登录
                            </button>
                          )}
                          {todo.kind === 'confirm-action' && confirmJobId !== null && (
                            <button
                              type="button"
                              className="jh-btn jh-btn-inline"
                              disabled={feedback.running}
                              onClick={() => void resumeConfirm(todo.id, confirmJobId)}
                            >
                              去处理
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
