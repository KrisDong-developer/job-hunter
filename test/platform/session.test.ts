import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEventBus } from '../../src/host/http/sse.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createLoginFlow, createSessionService } from '../../src/host/platform/session.js'
import type { PageLike, PageSource, SiteAdapter } from '../../src/host/platform/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

function fakeAdapter(options: { loggedIn: () => boolean; withAuth?: boolean }): SiteAdapter {
  const adapter: SiteAdapter = {
    id: 'fake',
    displayName: 'Fake',
    // 测试替身也走事实表：未登记的 id 会拿到"保守默认"（实验性 + 全部未验证）
    ...platformFacts('fake'),
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      fieldCompleteness: 'low',
      antiBot: 'low',
    },
    requiredFields: ['title'],
    criteriaDimensions: [],
    maxPages: 1,
    criteria: { buildSearchUrl: () => 'https://example.com/search' },
    crawl: {
      gotoSearch: async () => undefined,
      readListPage: async () => [],
      hasNextPage: async () => false,
    },
    guard: { detectBlock: async () => null },
  }
  if (options.withAuth !== false) {
    adapter.auth = {
      loginUrl: 'https://example.com/login',
      isLoggedIn: async () => options.loggedIn(),
    }
  }
  return adapter
}

function fakePageSource(): PageSource {
  const page = {
    goto: async () => undefined,
    url: () => 'https://example.com',
    evaluate: async (fn: unknown) => (fn as (arg: unknown) => unknown)(undefined),
    waitForTimeout: async () => undefined,
  } as unknown as PageLike
  return {
    acquire: async () => page,
    release: async () => undefined,
  }
}

function harness(options: { loggedIn?: boolean; withAuth?: boolean; registered?: boolean } = {}) {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  let loggedIn = options.loggedIn ?? false
  if (options.registered !== false) {
    registry.register(fakeAdapter({ loggedIn: () => loggedIn, ...(options.withAuth === undefined ? {} : { withAuth: options.withAuth }) }))
  }
  const events = createEventBus()
  const session = createSessionService(store)
  const flow = createLoginFlow({
    registry,
    session,
    pageSource: fakePageSource(),
    events,
    clock: () => '2026-09-16T01:00:00.000Z',
    pollIntervalMs: 1,
    timeoutMs: 60_000,
  })
  return {
    store,
    registry,
    events,
    session,
    flow,
    setLoggedIn: (value: boolean) => {
      loggedIn = value
    },
    close: () => {
      flow.cancelAll()
      const dir = store.dataDir
      store.close()
      cleanup(dir)
    },
  }
}

test('记录登录墙：落库 + 主动产生待办（且只产生一条）', () => {
  const h = harness()
  try {
    h.session.markLoginRequired('fake', '被登录墙挡住了')
    const account = h.session.status('fake')
    assert.equal(account.loggedIn, false)
    assert.equal(account.hint, '被登录墙挡住了')
    assert.ok(account.lastCheckAt !== null)

    const todos = h.store.todo.listOpen()
    assert.equal(todos.length, 1)
    assert.equal(todos[0]?.kind, 'login-required')
    assert.equal(todos[0]?.level, 'urgent')

    // 再来一次不会刷屏
    h.session.markLoginRequired('fake', '还是没登录')
    assert.equal(h.store.todo.listOpen().length, 1)
  } finally {
    h.close()
  }
})

test('登录成功：状态回写并关掉告警待办', () => {
  const h = harness()
  try {
    h.session.markLoginRequired('fake', '需要登录')
    assert.equal(h.store.todo.countOpen(), 1)

    h.session.markLoggedIn('fake')
    assert.equal(h.session.status('fake').loggedIn, true)
    assert.equal(h.session.status('fake').hint, null)
    assert.equal(h.store.todo.countOpen(), 0)
  } finally {
    h.close()
  }
})

test('轮询：还没登录就保持 running，并把事实记下来', async () => {
  const h = harness({ loggedIn: false })
  try {
    h.flow.start('fake')
    assert.equal(h.flow.status('fake').state, 'running')

    const result = await h.flow.pollOnce('fake')
    assert.equal(result.state, 'running')
    assert.equal(result.account.loggedIn, false)
    assert.equal(h.session.status('fake').loggedIn, false)
  } finally {
    h.close()
  }
})

test('轮询：登录成功后流转到 succeeded 并推事件', async () => {
  const h = harness({ loggedIn: false })
  try {
    const seen: string[] = []
    h.events.subscribe((event) => seen.push(event.type))

    h.flow.start('fake')
    h.setLoggedIn(true)
    const result = await h.flow.pollOnce('fake')

    assert.equal(result.state, 'succeeded')
    assert.equal(result.account.loggedIn, true)
    assert.equal(h.session.status('fake').loggedIn, true)
    assert.ok(seen.includes('login.succeeded'))
  } finally {
    h.close()
  }
})

test('检测抛错：流转到 failed 而不是静默', async () => {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  const adapter = fakeAdapter({ loggedIn: () => false })
  adapter.auth = {
    loginUrl: 'https://example.com/login',
    isLoggedIn: async () => {
      throw new Error('页面崩了')
    },
  }
  registry.register(adapter)
  const events = createEventBus()
  const session = createSessionService(store)
  const flow = createLoginFlow({
    registry,
    session,
    pageSource: fakePageSource(),
    events,
    clock: () => '2026-09-16T01:00:00.000Z',
  })
  try {
    const seen: string[] = []
    events.subscribe((event) => seen.push(event.type))
    flow.start('fake')
    const result = await flow.pollOnce('fake')
    assert.equal(result.state, 'failed')
    assert.ok(result.message?.includes('页面崩了'))
    assert.ok(seen.includes('login.failed'))
  } finally {
    flow.cancelAll()
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('未注册平台 / 没有 auth 契约：明确报错，不假装成功', () => {
  const missing = harness({ registered: false })
  try {
    assert.throws(
      () => missing.flow.start('fake'),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  } finally {
    missing.close()
  }

  const noAuth = harness({ withAuth: false })
  try {
    assert.throws(
      () => noAuth.flow.start('fake'),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
  } finally {
    noAuth.close()
  }
})
