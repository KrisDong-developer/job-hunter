import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchCompanies } from '../../src/client/net/companies.js'
import { ROUTE_PREFIX } from '../../src/shared/config/plugin.js'

/**
 * `fetchCompanies` 的 querystring 拼装（与 net-client.test.ts 同一套 mock fetch 模式）。
 * 约定：空值不传、布尔只在非默认时传、`desc` 恒传、页码换算成 offset。
 */

async function withFetch(
  run: (calls: Array<{ url: string }>) => Promise<void>,
): Promise<void> {
  const calls: Array<{ url: string }> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push({ url: String(url) })
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
  }) as typeof fetch
  try {
    await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

test('全空条件：只剩缺省排序与分页兜底参数（orderBy 显式传缺省键，desc/limit/offset 兜底）', async () => {
  await withFetch(async (calls) => {
    await fetchCompanies({ orderBy: 'jobCount', descending: true })
    assert.equal(calls[0]?.url, `${ROUTE_PREFIX}/companies?orderBy=jobCount&desc=1&limit=20&offset=0`)
  })
})

test('各条件都在时逐项拼上；页码换算成 offset', async () => {
  await withFetch(async (calls) => {
    await fetchCompanies({
      q: '华为',
      blacklisted: true,
      manualLabel: '外包',
      minJobCount: 5,
      orderBy: 'outsourcingScore',
      descending: false,
      limit: 50,
      offset: 100,
    })
    assert.equal(
      calls[0]?.url,
      `${ROUTE_PREFIX}/companies?q=%E5%8D%8E%E4%B8%BA&blacklisted=1&manualLabel=%E5%A4%96%E5%8C%85&minJobCount=5&orderBy=outsourcingScore&desc=0&limit=50&offset=100`,
    )
  })
})

test('blacklisted=false 传 0（"只看未拉黑"是要发给服务端的条件，不是缺省）', async () => {
  await withFetch(async (calls) => {
    await fetchCompanies({ blacklisted: false, minJobCount: 0, limit: 10 })
    assert.equal(calls[0]?.url, `${ROUTE_PREFIX}/companies?blacklisted=0&desc=1&limit=10&offset=0`)
  })
})

test('companyId 精确过滤走 fetchJobs（"只看某家公司"的跳转上下文）', async () => {
  await withFetch(async (calls) => {
    const { fetchJobs } = await import('../../src/client/net/jobs.js')
    await fetchJobs({ companyId: 42, page: 2, pageSize: 20 })
    const url = calls[0]?.url ?? ''
    assert.ok(url.startsWith(`${ROUTE_PREFIX}/jobs?`), url)
    assert.ok(url.includes('companyId=42'), url)
    assert.ok(url.includes('page=2'), url)
  })
})
