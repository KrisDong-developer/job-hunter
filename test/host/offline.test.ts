import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeRequest, type RouteRequest, type RouteResult } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { isOfflineMode, NO_NETWORK_ENV, offlineDenied } from '../../src/host/util/offline.js'
import { cleanup, tempDataDir } from '../support/store.js'

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  body?: unknown,
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(),
    headers: {},
    sameOrigin: true,
    readJson: async () => body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

/** 在离线模式下跑一段；无论成败都恢复环境变量。 */
async function offline(fn: () => Promise<void>): Promise<void> {
  const before = process.env[NO_NETWORK_ENV]
  process.env[NO_NETWORK_ENV] = '1'
  try {
    await fn()
  } finally {
    if (before === undefined) delete process.env[NO_NETWORK_ENV]
    else process.env[NO_NETWORK_ENV] = before
  }
}

test('离线开关的取值判定：1/true/yes/on 算开，其它算关', () => {
  assert.equal(isOfflineMode({}), false)
  assert.equal(isOfflineMode({ [NO_NETWORK_ENV]: '' }), false)
  assert.equal(isOfflineMode({ [NO_NETWORK_ENV]: '0' }), false)
  assert.equal(isOfflineMode({ [NO_NETWORK_ENV]: 'false' }), false)
  for (const value of ['1', 'true', 'TRUE', 'yes', ' on ']) {
    assert.equal(isOfflineMode({ [NO_NETWORK_ENV]: value }), true, `${value} 应当算开启`)
  }
})

test('离线模式下抓取被拒，且失败原因可读（§14 的机制化兜底）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await offline(async () => {
      await assert.rejects(
        () => runtime.crawl({ platformId: '51job', criteria: { keyword: 'Java' } }),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.ok(error.message.includes('离线模式'), error.message)
          return true
        },
      )
      // 拒绝发生在打开浏览器之前 —— 没有 crawl_run 记录，也没有浏览器进程
      const store = runtime.store()
      assert.ok(store !== undefined)
      assert.equal(store.crawlRun.list(5).length, 0, '被拒的抓取不该留下运行记录')

      // 登录引导同样被拒（它也会真的打开招聘站）
      assert.throws(() => runtime.startLogin('51job'), /离线模式/)
    })
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('离线模式下 /crawl/run 返回 409 BLOCKED，而不是 500', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await offline(async () => {
      const result = await call(runtime, 'POST', '/crawl/run', { criteria: { keyword: 'Java' } })
      assert.equal(result.status, 409)
      const body = result.body as { code: string; message: string; hint?: string }
      assert.equal(body.code, 'BLOCKED')
      assert.ok(body.message.includes('离线模式'))
      assert.ok((body.hint ?? '').includes(NO_NETWORK_ENV), '提示里要写清怎么解除')
    })
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('离线模式对界面可见：/health 与 /today 都带 offline 标记', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const online = await call(runtime, 'GET', '/health')
    assert.equal((online.body as { offline: boolean }).offline, false)

    await offline(async () => {
      const health = await call(runtime, 'GET', '/health')
      assert.equal((health.body as { offline: boolean }).offline, true)
      const today = await call(runtime, 'GET', '/today')
      assert.equal((today.body as { offline: boolean }).offline, true)
    })

    // 关掉之后立刻恢复正常
    const restored = await call(runtime, 'GET', '/health')
    assert.equal((restored.body as { offline: boolean }).offline, false)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('offlineDenied 带着可执行的解除办法', () => {
  const error = offlineDenied('打开招聘网站登录页')
  assert.ok(error.message.includes('打开招聘网站登录页'))
  assert.ok(error.hint?.includes(NO_NETWORK_ENV))
  assert.equal(error.code, 'BLOCKED')
})
