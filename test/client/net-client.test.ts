import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, NeedsConfirmError, request } from '../../src/client/net/client.js'
import { ROUTE_PREFIX } from '../../src/shared/constants.js'

/**
 * 客户端与宿主之间**唯一**的 HTTP 出口。
 *
 * 它值得测，因为三件事全靠它一处保证：
 *   ① 所有请求都落在 `/job-hunter` 前缀下（§5.2 的单一路由约定）；
 *   ② 宿主的统一响应协议 `{ ok, code, message, hint? }` 被翻成 `ApiError`；
 *   ③ `display` 永远优先宿主给的 `hint` —— 界面层直接把它显示给用户，
 *      这里错了用户就会看到机器话。
 */

/** 用假的 fetch 跑一次请求；`calls` 记录实际发出的 URL 与 init。 */
async function withFetch(
  reply: { status: number; text: string },
  run: (calls: Array<{ url: string; init: RequestInit }>) => Promise<void>,
): Promise<void> {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(reply.text, { status: reply.status })
  }) as typeof fetch
  try {
    await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

const headersOf = (init: RequestInit): Record<string, string> => (init.headers ?? {}) as Record<string, string>

test('成功：返回解析后的 body，URL 带统一前缀，无 body 时不发 content-type', async () => {
  await withFetch({ status: 200, text: JSON.stringify({ ok: true, value: 42 }) }, async (calls) => {
    const body = await request<{ ok: boolean; value: number }>('/demo')
    assert.equal(body.value, 42)
    assert.equal(calls[0]?.url, `${ROUTE_PREFIX}/demo`)
    const headers = headersOf(calls[0]?.init ?? {})
    assert.equal(headers['accept'], 'application/json')
    assert.equal(headers['content-type'], undefined, '没有 body 却带了 content-type')
  })
})

test('有 body 时补上 content-type，并原样透传调用方的 header', async () => {
  await withFetch({ status: 200, text: '{}' }, async (calls) => {
    await request('/demo', { method: 'POST', body: '{}', headers: { 'x-probe': '1' } })
    const headers = headersOf(calls[0]?.init ?? {})
    assert.equal(headers['content-type'], 'application/json')
    assert.equal(headers['x-probe'], '1')
    assert.equal(calls[0]?.init.method, 'POST')
  })
})

test('空响应体返回 null（列表接口用 204/空体表达"没有"），不抛错', async () => {
  await withFetch({ status: 200, text: '' }, async () => {
    assert.equal(await request('/empty'), null)
  })
})

test('非 2xx：翻成 ApiError，且 display 优先用宿主给的 hint', async () => {
  const payload = JSON.stringify({ ok: false, code: 'GUARD_DENIED', message: 'guard denied', hint: '今日额度用完了' })
  await withFetch({ status: 403, text: payload }, async () => {
    const caught = await request('/demo').then(
      () => null,
      (error: unknown) => error,
    )
    assert.ok(caught instanceof ApiError)
    assert.equal(caught.status, 403)
    assert.equal(caught.code, 'GUARD_DENIED')
    assert.equal(caught.message, 'guard denied')
    assert.equal(caught.hint, '今日额度用完了')
    assert.equal(caught.display, '今日额度用完了')
  })
})

test('非 2xx 且响应体不是 JSON：退化成 HTTP_<status>，仍然是一句话不是异常堆栈', async () => {
  await withFetch({ status: 500, text: '<html>502 bad gateway</html>' }, async () => {
    const caught = await request('/demo').then(
      () => null,
      (error: unknown) => error,
    )
    assert.ok(caught instanceof ApiError)
    assert.equal(caught.code, 'HTTP_500')
    assert.equal(caught.message, 'HTTP 500')
    assert.equal(caught.display, 'HTTP 500', '没有 hint 时 display 应退回 message')
  })
})

test('NeedsConfirmError：高危动作的"先确认"信号自带确认文案', () => {
  const error = new NeedsConfirmError('将向 3 个岗位投递简历，确认吗？')
  assert.ok(error instanceof Error)
  assert.equal(error.name, 'NeedsConfirmError')
  assert.equal(error.code, 'NEEDS_CONFIRM')
  assert.equal(error.confirmText, '将向 3 个岗位投递简历，确认吗？')
})
