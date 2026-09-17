/**
 * 登录态检测与引导（§4.2.3）。
 *
 * 需求 §7 点名的坑：**抓到登录墙必须报 `NOT_LOGGED_IN`，绝不允许当作「没有新岗位」**。
 * 所以这里做的不是"猜用户有没有登录"这种含糊事，而是：
 *   1. 把「被登录墙挡住」这个事实**持久化**到 `account_state`；
 *   2. 主动产生待办告警（P8：失败必须可见）；
 *   3. 登录引导：打开登录页 → 轮询 → 成功即回写状态并关掉告警。
 */
import type { AccountStateDto, LoginStatusDto } from '../../shared/dto.js'
import type { EventBus } from '../http/sse.js'
import type { Store } from '../store/store.js'
import { DomainError, messageOf } from '../util/errors.js'
import { systemClock, type Clock } from '../util/time.js'
import type { AdapterRegistry } from './registry.js'
import type { PageLike, PageSource, SiteAdapter } from './types.js'

export interface AccountStateRecord {
  platformId: string
  loggedIn: boolean
  hiddenFromCurrentEmployer: boolean | null
  lastCheckAt: string | null
  hint: string | null
  updatedAt: string | null
}

export interface SessionService {
  status(platformId: string): AccountStateRecord
  list(): AccountStateRecord[]
  markLoggedIn(platformId: string): void
  /** 记录「被登录墙挡住」，并按需产生待办。 */
  markLoginRequired(platformId: string, hint: string): void
  /** D4 隐身状态（高危动作前强制校验，P5 用；这里只负责存）。 */
  recordHidden(platformId: string, hidden: boolean | null): void
}

export function toAccountDto(record: AccountStateRecord): AccountStateDto {
  return {
    platformId: record.platformId,
    loggedIn: record.loggedIn,
    hiddenFromCurrentEmployer: record.hiddenFromCurrentEmployer,
    lastCheckAt: record.lastCheckAt,
    hint: record.hint,
    updatedAt: record.updatedAt,
  }
}

export function createSessionService(store: Store, clock: Clock = systemClock): SessionService {
  /**
   * `account_state.platform_id` 有指向 `platform` 的外键，而**登录引导可能发生在任何一次抓取之前**
   * （全新安装：先登录再抓）。所以写账号态之前先确保平台实体存在 ——
   * 否则这里会抛 FOREIGN KEY constraint failed，表现为「点登录没反应」。
   */
  const ensurePlatform = (platformId: string): void => {
    if (store.platform.get(platformId) === undefined) {
      store.platform.ensure({ id: platformId, displayName: platformId }, clock())
    }
  }

  const read = (platformId: string): AccountStateRecord =>
    store.account.get(platformId) ?? {
      platformId,
      loggedIn: false,
      hiddenFromCurrentEmployer: null,
      lastCheckAt: null,
      hint: null,
      updatedAt: null,
    }

  return {
    status: read,

    list(): AccountStateRecord[] {
      return store.account.list()
    },

    markLoggedIn(platformId): void {
      const now = clock()
      ensurePlatform(platformId)
      store.account.upsert(
        {
          platformId,
          loggedIn: true,
          hiddenFromCurrentEmployer: read(platformId).hiddenFromCurrentEmployer,
          hint: null,
        },
        now,
      )
      // 登录好了，对应的告警待办就该消失
      store.todo.closeByRef('login-required', platformId, now)
    },

    markLoginRequired(platformId, hint): void {
      const now = clock()
      ensurePlatform(platformId)
      store.account.upsert(
        {
          platformId,
          loggedIn: false,
          hiddenFromCurrentEmployer: read(platformId).hiddenFromCurrentEmployer,
          hint,
        },
        now,
      )
      store.todo.createOnce(
        {
          kind: 'login-required',
          level: 'urgent',
          title: `${platformId} 需要登录`,
          ref: platformId,
          detail: { hint },
        },
        now,
      )
    },

    recordHidden(platformId, hidden): void {
      const before = read(platformId)
      ensurePlatform(platformId)
      store.account.upsert(
        { platformId, loggedIn: before.loggedIn, hiddenFromCurrentEmployer: hidden, hint: before.hint },
        clock(),
      )
    },
  }
}

export interface LoginFlowDeps {
  registry: AdapterRegistry
  session: SessionService
  pageSource: PageSource
  events: EventBus
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
  pollIntervalMs?: number
  timeoutMs?: number
  /** 便于测试控制"等待"。 */
  sleep?: (ms: number) => Promise<void>
}

export interface LoginFlow {
  /** 打开登录页并开始轮询。**立即返回**，进度通过 `status()` 查。 */
  start(platformId: string): LoginStatusDto
  status(platformId: string): LoginStatusDto
  /** 直接驱动一轮检测（测试与「手动再查一次」都用它）。 */
  pollOnce(platformId: string): Promise<LoginStatusDto>
  cancelAll(): void
}

interface FlowState {
  state: 'idle' | 'running' | 'succeeded' | 'failed'
  message: string | null
  startedAt: string | null
  cancelled: boolean
  /** 登录页句柄：轮询期间**保持打开**，否则用户没法在上面登录。 */
  page: PageLike | null
}

const IDLE: FlowState = { state: 'idle', message: null, startedAt: null, cancelled: false, page: null }

function toStatus(platformId: string, flow: FlowState, session: SessionService): LoginStatusDto {
  return {
    platformId,
    state: flow.state,
    message: flow.message,
    startedAt: flow.startedAt,
    account: toAccountDto(session.status(platformId)),
  }
}

export function createLoginFlow(deps: LoginFlowDeps): LoginFlow {
  const clock = deps.clock ?? systemClock
  const pollIntervalMs = deps.pollIntervalMs ?? 3000
  const timeoutMs = deps.timeoutMs ?? 5 * 60 * 1000
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const flows = new Map<string, FlowState>()

  const flowOf = (platformId: string): FlowState => flows.get(platformId) ?? IDLE
  const setFlow = (platformId: string, flow: FlowState): void => {
    flows.set(platformId, flow)
  }

  const requireAuth = (platformId: string): NonNullable<SiteAdapter['auth']> => {
    const adapter = deps.registry.get(platformId)
    if (adapter === undefined) throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`)
    if (adapter.auth === undefined) {
      throw new DomainError('INVALID_INPUT', `${platformId} 没有声明登录入口`, {
        hint: '该适配器不需要登录，或还没实现 auth 契约。',
      })
    }
    return adapter.auth
  }

  const finish = async (platformId: string, flow: FlowState): Promise<void> => {
    setFlow(platformId, flow)
    const page = flow.page
    if (page !== null) {
      setFlow(platformId, { ...flow, page: null })
      await deps.pageSource.release(page).catch(() => undefined)
    }
  }

  const pollOnce = async (platformId: string): Promise<LoginStatusDto> => {
    const auth = requireAuth(platformId)
    const flow = flowOf(platformId)
    if (flow.state !== 'running') return toStatus(platformId, flow, deps.session)

    let page = flow.page
    try {
      if (page === null) {
        page = await deps.pageSource.acquire()
        setFlow(platformId, { ...flow, page })
      }
      if (await auth.isLoggedIn(page)) {
        deps.session.markLoggedIn(platformId)
        deps.events.publish('login.succeeded', { platformId })
        await finish(platformId, {
          state: 'succeeded',
          message: '登录成功',
          startedAt: flow.startedAt,
          cancelled: false,
          page,
        })
      } else {
        deps.session.markLoginRequired(platformId, '尚未登录，请在弹出的浏览器窗口里完成登录')
      }
      return toStatus(platformId, flowOf(platformId), deps.session)
    } catch (error) {
      const message = messageOf(error)
      deps.logger?.warn(`[session] ${platformId} 登录态检测失败：${message}`)
      await finish(platformId, {
        state: 'failed',
        message,
        startedAt: flow.startedAt,
        cancelled: false,
        page,
      })
      deps.events.publish('login.failed', { platformId, message })
      return toStatus(platformId, flowOf(platformId), deps.session)
    }
  }

  /** 后台循环：不阻塞路由。 */
  const runLoop = async (platformId: string, deadlineMs: number): Promise<void> => {
    while (flowOf(platformId).state === 'running' && !flowOf(platformId).cancelled) {
      if (new Date(clock()).getTime() > deadlineMs) {
        const deadline = flowOf(platformId)
        deps.events.publish('login.failed', { platformId, message: '登录超时' })
        await finish(platformId, {
          state: 'failed',
          message: '登录超时，请重试',
          startedAt: deadline.startedAt,
          cancelled: false,
          page: deadline.page,
        })
        return
      }
      await sleep(pollIntervalMs)
      if (flowOf(platformId).cancelled) return
      const result = await pollOnce(platformId)
      if (result.state !== 'running') return
    }
  }

  return {
    start(platformId): LoginStatusDto {
      const auth = requireAuth(platformId)
      const existing = flowOf(platformId)
      if (existing.state === 'running') return toStatus(platformId, existing, deps.session)

      const startedAt = clock()
      const running: FlowState = {
        state: 'running',
        message: '已打开登录页，请在弹出的浏览器窗口里完成登录',
        startedAt,
        cancelled: false,
        page: null,
      }
      setFlow(platformId, running)

      // 打开登录页是异步的，但路由不能等它 —— 先返回，进度用 status() 轮询
      void (async () => {
        try {
          const page = await deps.pageSource.acquire()
          setFlow(platformId, { ...flowOf(platformId), page })
          await page.goto(auth.loginUrl)
          deps.logger?.info(`[session] 已打开 ${platformId} 登录页：${auth.loginUrl}`)
        } catch (error) {
          const message = messageOf(error)
          await finish(platformId, {
            state: 'failed',
            message: `打不开登录页：${message}`,
            startedAt,
            cancelled: false,
            page: flowOf(platformId).page,
          })
        }
      })()

      void runLoop(platformId, new Date(startedAt).getTime() + timeoutMs)
      return toStatus(platformId, running, deps.session)
    },

    status(platformId): LoginStatusDto {
      return toStatus(platformId, flowOf(platformId), deps.session)
    },

    pollOnce,

    cancelAll(): void {
      for (const [platformId, flow] of flows) {
        if (flow.state === 'running') {
          // 卸载时把登录页也放掉，不留孤儿页面
          void deps.pageSource.release(flow.page ?? ({} as PageLike)).catch(() => undefined)
        }
        flows.set(platformId, { ...flow, cancelled: true, state: flow.state === 'running' ? 'idle' : flow.state, page: null })
      }
    },
  }
}
