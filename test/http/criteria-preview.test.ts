/**
 * `POST /criteria/preview` —— 把方案条件翻成"每个平台**实际会发出的请求**"的干跑接口。
 *
 * 为什么值得一条路由级测试（而不只是适配器单测）：
 *   * 界面拿到的就是这条接口的形状，路由参数（`platforms` 数组 / `criteria` 的字符串化）
 *     与适配器内部形状是两回事；
 *   * 这条接口是"声明 → 表单 → 校验 → **真实请求**"这条链上最后一环的出口，
 *     链上任何一处错位（键没进 `platform` 命名空间、参数名写错、body 型平台没实现
 *     `preview`）都会在这里表现为"请求里少了那个参数"；
 *   * 它必须是**干跑**：不开浏览器、不写库。测试里连 `page` 都没有，能跑通就说明它是纯函数路径。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeRequest, type RouteRequest, type RouteResult } from '../../src/host/http/router.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import { cleanup, tempDataDir } from '../support/store.js'

type JsonResult = Extract<RouteResult, { kind: 'json' }>

async function call(
  runtime: ReturnType<typeof createHostRuntime>,
  path: string,
  body?: unknown,
): Promise<JsonResult> {
  const req: RouteRequest = {
    method: 'POST',
    path,
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin: true,
    readJson: async () => body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

interface PreviewItem {
  platformId: string
  displayName: string
  request: {
    url: string
    method: string
    params: Record<string, string>
    body?: string
    crawlOnly: string[]
  } | null
  error: string | null
}

function itemsOf(result: JsonResult): PreviewItem[] {
  return (result.body as { items: PreviewItem[] }).items
}

test('干跑：神仙外企的行业 / 职能落到平台自己的参数名上', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    const result = await call(runtime, '/criteria/preview', {
      platforms: ['waiqi'],
      criteria: { keyword: 'Java', city: '深圳', businessCategory: '33', posInfo: '323' },
    })
    assert.equal(result.status, 200)
    const items = itemsOf(result)
    assert.equal(items.length, 1)
    const request = items[0]?.request
    assert.ok(request !== null && request !== undefined, '神仙外企是接口型平台，必须有请求可看')
    assert.equal(request.method, 'POST')
    assert.equal(request.params['businessCategoryIdList'], '33')
    assert.equal(request.params['posIds'], '323')
    // 平台**不认**我们内部那两个键名 —— 它们出现在参数里就说明又走了 extra 的透传
    assert.equal(request.params['businessCategory'], undefined)
    assert.equal(request.params['posInfo'], undefined)
    // 采集深度旋钮不进请求，但必须如实列出来（界面要把它和筛选条件分开说）
    assert.ok(request.crawlOnly.includes('maxPages'), request.crawlOnly.join('、'))
  } finally {
    cleanup(dir)
  }
})

test('干跑：URL 型平台给出真实地址与参数（含平台自己的键名）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    const result = await call(runtime, '/criteria/preview', {
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳', sort: '1' },
    })
    const request = itemsOf(result)[0]?.request
    assert.ok(request !== null && request !== undefined)
    assert.equal(request.method, 'GET')
    assert.ok(request.url.includes('we.51job.com'), request.url)
    // 参数名是 51job 自己的（keyword / jobArea / sortType）——不是我们的键名
    assert.equal(request.params['keyword'], 'Java')
    assert.equal(request.params['sortType'], '1')
    assert.ok(request.params['jobArea'] !== undefined, JSON.stringify(request.params))
  } finally {
    cleanup(dir)
  }
})

test('干跑：构造不出请求时如实报错，而不是给一个空请求', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // 国聘的城市表是空的（封闭）→ 带城市根本构造不出搜索地址
    const result = await call(runtime, '/criteria/preview', {
      platforms: ['guopin'],
      criteria: { keyword: 'Java', city: '深圳' },
    })
    const item = itemsOf(result)[0]
    assert.equal(item?.request, null)
    assert.ok(
      typeof item?.error === 'string' && item.error.includes('跳过'),
      `必须说清"这一轮这个平台会被跳过"：${item?.error ?? '（空）'}`,
    )
  } finally {
    cleanup(dir)
  }
})

test('干跑：不传 platforms = 全部已注册平台（界面用不上，但工具/脚本会用）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    const result = await call(runtime, '/criteria/preview', { criteria: { keyword: 'Java' } })
    const items = itemsOf(result)
    assert.ok(items.length >= 10, `应当覆盖全部已注册平台，实际 ${String(items.length)} 个`)
    assert.ok(items.some((item) => item.platformId === 'linkedin'))
  } finally {
    cleanup(dir)
  }
})
