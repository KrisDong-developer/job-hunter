/**
 * 路由表的**顺序不变量**。
 *
 * 为什么单独一个文件：`http/router.ts` 的路由表是「有序数组」，**顺序即语义** ——
 * 字面量段会与参数段抢同一形状的路径，容器块还会靠"不返回"往下穿透。
 * 这些约束在原实现里是隐式的（靠 if 链的书写顺序），重构时最容易悄悄改坏，
 * 而且在正常功能测试里**看不出来**（改坏了只是某条路径报错，别处照常绿）。
 *
 * 所以这里逐条钉死：
 *   · 字面量 vs 参数：`/jobs/facets`、`/jobs/batch/mark`、`/applications/deliver`、
 *     `/interviews/conflicts|upcoming`、`/greeting/templates`
 *   · 容器穿透：`/jobs/:id/*` 与 `/resumes/:id/english-check` 必须能走到后面的块
 *
 * 每条断言都注明「它防的是什么」—— 断言失败时先看那行注释，不要直接把期望值改掉。
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { routeRequest, type RouteRequest, type RouteResult } from '../../src/host/http/router.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import { cleanup, tempDataDir } from '../support/store.js'

type JsonResult = Extract<RouteResult, { kind: 'json' }>

/** 数据层打不开的实例：造一个「有业务表但没有 application_id」的库（同 router.test.ts 的手法）。 */
async function openBrokenRuntime(): Promise<{ runtime: ReturnType<typeof createHostRuntime>; dir: string }> {
  const dir = tempDataDir()
  mkdirSync(dir, { recursive: true })
  const foreign = new DatabaseSync(join(dir, 'data.db'))
  foreign.exec('CREATE TABLE other(id INTEGER PRIMARY KEY)')
  foreign.close()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

/** 直接调用路由，不需要造假的 req/res 流对象（与 router.test.ts 同一手法）。 */
async function call(
  runtime: ReturnType<typeof createHostRuntime>,
  method: string,
  path: string,
  options: { body?: unknown; sameOrigin?: boolean } = {},
): Promise<JsonResult> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin: options.sameOrigin ?? true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

function codeOf(result: JsonResult): string | null {
  const body = result.body as { code?: string } | null
  return body?.code ?? null
}

function messageOf(result: JsonResult): string | null {
  const body = result.body as { message?: string } | null
  return body?.message ?? null
}

test('路由顺序：字面量段必须赢过参数段', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // `/jobs/facets` 若排在 `/jobs/:id` 之后，`facets` 会被当成 id → 400 非法岗位 id
    const facets = await call(runtime, 'GET', '/jobs/facets')
    assert.equal(facets.status, 200, '/jobs/facets 被 /jobs/:id 吞掉了')

    // 反向确认参数路径仍然会解析出 id：`abc` 必须报 400 而不是 404
    const badId = await call(runtime, 'GET', '/jobs/abc')
    assert.equal(badId.status, 400)
    assert.equal(messageOf(badId), '非法岗位 id：abc', '参数路径的 id 校验被绕过了')

    // `/jobs/batch/mark` 若排在后面，`batch` 会被当成 id → 400 非法岗位 id
    const batch = await call(runtime, 'POST', '/jobs/batch/mark', { body: {} })
    assert.equal(batch.status, 400)
    assert.equal(
      messageOf(batch),
      '批量标记需要合法的 state',
      '/jobs/batch/mark 被 /jobs/:id 吞掉了（报的是 id 相关错误）',
    )

    // `/applications/deliver` 若排在 `/applications` 大块之后，`deliver` 会被当成 id → 400 非法投递 id
    const deliver = await call(runtime, 'POST', '/applications/deliver', { body: {} })
    assert.equal(deliver.status, 400)
    assert.equal(
      messageOf(deliver),
      'jobId 必须是正整数',
      '/applications/deliver 被 /applications/:id 吞掉了',
    )

    // `/interviews/conflicts` 与 `/interviews/upcoming` 必须排在 `/interviews/:id` 之前
    const conflicts = await call(runtime, 'GET', '/interviews/conflicts')
    assert.equal(conflicts.status, 200, '/interviews/conflicts 被 /interviews/:id 吞掉了')
    const upcoming = await call(runtime, 'GET', '/interviews/upcoming')
    assert.equal(upcoming.status, 200, '/interviews/upcoming 被 /interviews/:id 吞掉了')

    // `/greeting/templates` 不能被 `/greeting/send` 之类同长度的块先接走
    const templates = await call(runtime, 'GET', '/greeting/templates')
    assert.equal(templates.status, 200, '/greeting/templates 被同长度的 /greeting/* 吞掉了')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('路由顺序：容器块必须把不认识的子路径放过去（穿透）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // `/jobs/:id` 容器对 len4 不接 → 必须让 outreach.greetingDraft 处理；
    // 若容器把 len4 也吞了，这里会变成"非法岗位 id"之类的 400，而不是岗位不存在的 404
    const greeting = await call(runtime, 'POST', '/jobs/99999/greeting/draft', { body: {} })
    assert.equal(greeting.status, 404)
    assert.equal(messageOf(greeting), '没有找到岗位 99999', '/jobs/:id 容器吞掉了 /jobs/:id/greeting/draft')

    // `/jobs/:id` 容器对"未知子路径"不接 → 最终 404，而不是内部的 400
    const unknown = await call(runtime, 'GET', '/jobs/99999/unknown')
    assert.equal(unknown.status, 404, '容器把不认识的子路径当成自己的了')
    assert.equal(codeOf(unknown), 'NOT_FOUND')

    // `/resumes` 容器对 len3 的 `english-check` 不接 → 必须穿透到 overseas 那一块
    const englishCheck = await call(runtime, 'GET', '/resumes/99999/english-check')
    assert.equal(englishCheck.status, 404)
    assert.equal(
      messageOf(englishCheck),
      '简历不存在：99999',
      '/resumes 容器吞掉了 /resumes/:id/english-check（没穿透到海外体检）',
    )

    // 穿透顺序的另一面：`/resumes` 容器自己的 id 校验仍然先跑 —— 非数字 id 报的是它的错
    const badResumeId = await call(runtime, 'GET', '/resumes/abc/english-check')
    assert.equal(badResumeId.status, 400)
    assert.equal(messageOf(badResumeId), '非法简历 id：abc')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('前置校验在路由表之前：变更类请求必须过同源检查', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // 跨源校验若被放进某个 handler 里，就会有路径漏网 —— 它必须是路由表**之前**的一步
    const crossOrigin = await call(runtime, 'POST', '/plans', { body: {}, sameOrigin: false })
    assert.equal(crossOrigin.status, 403)
    assert.equal(codeOf(crossOrigin), 'CROSS_ORIGIN')

    // 读请求不受同源校验影响（C4：同源只拦变更类）
    const read = await call(runtime, 'GET', '/plans', { sameOrigin: false })
    assert.equal(read.status, 200, '同源校验把读请求也拦了')

    // 路由表整体兜底：谁都不接才是 404
    const missing = await call(runtime, 'GET', '/不存在的路径')
    assert.equal(missing.status, 404)
    assert.equal(codeOf(missing), 'NOT_FOUND')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('精确匹配：没有任何 handler 服务的路径一律 404（不再有"前缀通吃"的容器）', async () => {
  // 锁的是"容器块 → 精确 matcher"那轮改造的核心收益：
  // 以前 `/plans` 这类前缀会把整片路径空间**认领**下来，于是没人服务的路径也会先进到
  // 那一段里跑 requireData、解析 id，报出与路由无关的 400 / 503。
  const cases: Array<[string, string]> = [
    ['GET', '/jobs/abc/unknown'],
    ['GET', '/plans/abc'],
    ['DELETE', '/companies/99999'],
    ['GET', '/dedup/unknown'],
    ['GET', '/todos/99999/unknown'],
    ['GET', '/overseas/unknown'],
    ['DELETE', '/cover-letters'],
  ]

  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    for (const [method, path] of cases) {
      const result = await call(runtime, method, path)
      assert.equal(result.status, 404, `${method} ${path} 应当 404（没有任何 handler 服务它）`)
      assert.equal(codeOf(result), 'NOT_FOUND')
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }

  // 数据层未就绪时也必须还是 404 —— 这是以前最刺眼的一处：容器的 requireData 先跑，
  // 于是"打错的路径"报 503 DATA_UNAVAILABLE，把排错方向指到了数据层。
  const broken = await openBrokenRuntime()
  try {
    for (const [method, path] of cases) {
      const result = await call(broken.runtime, method, path)
      assert.equal(result.status, 404, `${method} ${path} 未就绪时也应当 404，而不是 503`)
      assert.equal(codeOf(result), 'NOT_FOUND')
    }
  } finally {
    broken.runtime.close()
    cleanup(broken.dir)
  }
})

test('精确匹配只改"谁来接"，不改"接了之后的校验"', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // 被服务的形状（方法 + 段数都对）仍然走各自的 id 校验并报 400
    const patchPlan = await call(runtime, 'PATCH', '/plans/abc', { body: {} })
    assert.equal(patchPlan.status, 400)
    assert.equal(messageOf(patchPlan), '非法方案 id：abc')

    const patchCompany = await call(runtime, 'PATCH', '/companies/abc', { body: {} })
    assert.equal(patchCompany.status, 400)
    assert.equal(messageOf(patchCompany), '非法公司 id：abc')

    const todo = await call(runtime, 'GET', '/todos/abc')
    assert.equal(todo.status, 400)
    assert.equal(messageOf(todo), '非法待办 id：abc')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
