/**
 * H1/H2/H3/H4：Offer 的登记、逐项对比与截止倒计时。
 *
 * 这块补的是求职闭环的**最后一段**：在此之前"拿到 offer"只以 `application.stage='offer'`
 * 的形式存在 —— 那是一个阶段，不是一份报价。所以这里断言的是三件真实的事：
 *   1. 待遇明细填进去之后，**年现金总包要算得出来**（不填月数就不猜 12，如实为 null）；
 *   2. 对比表要指出**哪一格更好、差多少**，并且**不替用户下结论**（社保基数那类不判优劣）；
 *   3. 截止倒计时必须进今日（错过 = 自动放弃，H3）。
 *
 * 本文件不发任何网络请求，也不开浏览器。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
const DAY_MS = 86_400_000

function jobInput(companyId: number | null): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'o-1',
    title: '后端开发工程师',
    companyId,
    salaryRaw: '30-45K',
    salaryMin: 30000,
    salaryMax: 45000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['java'],
    sourceUrl: 'https://jobs.51job.com/all/o-1.html',
    publishedAt: T,
  }
}

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
  options: { query?: string; body?: unknown } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

/**
 * 距现在约 `days` 天的时刻。
 *
 * 刻意**多给几小时**、不落在整天边界上：`daysLeft` 是"还剩几个整天"（按绝对值取整），
 * 而 `Date.now()` 在构造与断言之间总会走掉几毫秒 —— 正好 N 天会被算成"还剩 N-1 天"，
 * 那是口径正确、夹具不对。
 */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS + 6 * 3_600_000).toISOString()
}

/** 「已经过去约 `days` 天」的时刻（同样避开整天边界，保证读出来就是 -N）。 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS - 6 * 3_600_000).toISOString()
}

test('登记 offer：年现金总包算得出来；不填月数就不猜（如实为 null）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const full = await call(runtime, 'POST', '/offers', {
      body: {
        companyName: 'A 公司',
        role: '后端开发',
        comp: { monthlyBase: 20000, monthsPerYear: 15, bonusYearly: 30000, housingFundRatio: 12 },
        deadline: inDays(5),
      },
    })
    assert.equal(full.status, 201)
    const offer = (full.body as { offer: { id: number; annualCash: number | null; daysLeft: number | null } }).offer
    assert.equal(offer.annualCash, 20000 * 15 + 30000, '月 base × 月数 + 年终奖')
    assert.equal(offer.daysLeft, 5)

    // 只填 base、没填月数：**不假设 12 薪**（"没有信息"与"12 薪"是两个结论）
    const partial = await call(runtime, 'POST', '/offers', {
      body: { companyName: 'B 公司', comp: { monthlyBase: 25000 } },
    })
    assert.equal((partial.body as { offer: { annualCash: number | null } }).offer.annualCash, null)
    assert.equal((partial.body as { offer: { daysLeft: number | null } }).offer.daysLeft, null)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('登记校验：没有身份 / 非法时间 / 不存在的岗位，都必须明确拒绝', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // 三样身份一个都没有 → 之后谁都认不出这是哪家的 offer
    const anonymous = await call(runtime, 'POST', '/offers', { body: { role: '后端开发' } })
    assert.equal(anonymous.status, 400)
    assert.ok(JSON.stringify(anonymous.body).includes('公司名'))

    const badDeadline = await call(runtime, 'POST', '/offers', {
      body: { companyName: 'A 公司', deadline: '下周三之前' },
    })
    assert.equal(badDeadline.status, 400, '静默丢掉一个日期 = 用户以为填上了（最坏的一种错）')

    const badState = await call(runtime, 'POST', '/offers', {
      body: { companyName: 'A 公司', state: 'maybe' },
    })
    assert.equal(badState.status, 400)

    const missingJob = await call(runtime, 'POST', '/offers', { body: { jobId: 9999 } })
    assert.equal(missingJob.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('挂到岗位上：公司与岗位名自动补齐；岗位维度能反查', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const company = store.company.ensure({ name: '某大厂', nameNorm: '某大厂' }, T)
    const jobId = store.job.upsert(jobInput(company.id), T).id

    const created = await call(runtime, 'POST', '/offers', { body: { jobId, comp: { monthlyBase: 30000 } } })
    assert.equal(created.status, 201)
    const offer = (created.body as { offer: { companyId: number | null; companyName: string; role: string } }).offer
    assert.equal(offer.companyId, company.id)
    assert.equal(offer.companyName, '某大厂', '公司名从岗位带出来，用户不用再填一次')
    assert.equal(offer.role, '后端开发工程师', '岗位名同理')

    const byJob = await call(runtime, 'GET', `/jobs/${String(jobId)}/offers`)
    assert.equal(byJob.status, 200)
    assert.equal((byJob.body as { items: unknown[] }).items.length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('对比：指出哪一格更好、差多少，但不替用户判断方向不唯一的项', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const a = await call(runtime, 'POST', '/offers', {
      body: {
        companyName: 'A 公司',
        // 20000 × 15 = 30 万
        comp: { monthlyBase: 20000, monthsPerYear: 15, housingFundRatio: 12, socialInsuranceBase: 20000 },
        deadline: inDays(3),
      },
    })
    const b = await call(runtime, 'POST', '/offers', {
      body: {
        companyName: 'B 公司',
        // 30000 × 12 = 36 万（base 更高、总包更高）
        comp: { monthlyBase: 30000, monthsPerYear: 12, housingFundRatio: 5, socialInsuranceBase: 8000 },
        deadline: inDays(10),
      },
    })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)

    const compared = await call(runtime, 'POST', '/offers/compare', { body: {} })
    assert.equal(compared.status, 200, '/offers/compare 被 /offers/:id 吞掉了？')
    const result = compared.body as {
      via: string
      advice: string | null
      facts: string[]
      rows: Array<{
        key: string
        values: Array<string | null>
        numbers: Array<number | null>
        differs: boolean
        bestIndex: number | null
        gaps: Array<number | null>
      }>
    }

    assert.equal(result.via, 'rule', '没配模型时如实标注是规则口径')
    assert.equal(result.advice, null, '没有模型就**不编一段建议**')

    const row = (key: string) => {
      const found = result.rows.find((item) => item.key === key)
      assert.ok(found !== undefined, `对比表缺了 ${key} 这一行`)
      return found
    }

    // 月 base：B 更高 → bestIndex = 1（B 是第二份）
    const base = row('monthlyBase')
    assert.equal(base.differs, true)
    assert.equal(base.bestIndex, 1)
    assert.equal(base.gaps[0], 10000, '差 1 万要说出来')

    // 年发放月数：A 更高 → bestIndex = 0
    assert.equal(row('monthsPerYear').bestIndex, 0)

    // 年现金总包：B 36 万 vs A 30 万
    const cash = row('annualCash')
    assert.equal(cash.numbers[0], 300000)
    assert.equal(cash.numbers[1], 360000)
    assert.equal(cash.bestIndex, 1)
    assert.equal(cash.gaps[0], 60000)

    // 社保基数：方向不唯一（当期到手与长期待遇是取舍），**不判优劣**
    const social = row('socialInsuranceBase')
    assert.equal(social.differs, true)
    assert.equal(social.bestIndex, null, '这类项不下"哪格更好"的结论')

    const facts = result.facts.join('\n')
    assert.ok(facts.includes('36 万'), `规则结论要指出总包最高的那一份：${facts}`)
    assert.ok(facts.includes('最早到期'), `规则结论要指出谁快到期：${facts}`)

    // 只登记一份时对比没有意义 —— 明确拒绝而不是给一张一行表
    assert.equal((await call(runtime, 'POST', '/offers/compare', { body: { offerIds: [1] } })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('改条件重算总包；状态只由人写，非法取值被拒', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const created = await call(runtime, 'POST', '/offers', {
      body: { companyName: 'A 公司', comp: { monthlyBase: 20000, monthsPerYear: 12 } },
    })
    const id = (created.body as { offer: { id: number; annualCash: number | null } }).offer.id
    assert.equal((created.body as { offer: { annualCash: number | null } }).offer.annualCash, 240000)

    // 谈上去了：整份替换 comp（与 criteria / resume.content 同一个语义）
    const patched = await call(runtime, 'PATCH', `/offers/${String(id)}`, {
      body: { comp: { monthlyBase: 26000, monthsPerYear: 14 }, deadline: inDays(2) },
    })
    assert.equal(patched.status, 200)
    const updated = (patched.body as { offer: { annualCash: number | null; daysLeft: number | null } }).offer
    assert.equal(updated.annualCash, 26000 * 14)
    assert.equal(updated.daysLeft, 2)

    const accepted = await call(runtime, 'POST', `/offers/${String(id)}/state`, { body: { state: 'accepted' } })
    assert.equal(accepted.status, 200)
    assert.equal((accepted.body as { offer: { state: string } }).offer.state, 'accepted')

    const bogus = await call(runtime, 'POST', `/offers/${String(id)}/state`, { body: { state: '想着呢' } })
    assert.equal(bogus.status, 400)

    const removed = await call(runtime, 'DELETE', `/offers/${String(id)}`)
    assert.equal(removed.status, 200)
    assert.equal((await call(runtime, 'DELETE', `/offers/${String(id)}`)).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('截止倒计时进今日：还没决定的才提醒，已过期的也要出现', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await call(runtime, 'POST', '/offers', {
      body: { companyName: '快到期公司', role: '后端', deadline: inDays(2) },
    })
    await call(runtime, 'POST', '/offers', {
      body: { companyName: '已经过期公司', role: '后端', deadline: daysAgo(1) },
    })
    // 已接受的不该再被催（OFFER_OPEN_STATES 的用处）
    const done = await call(runtime, 'POST', '/offers', {
      body: { companyName: '已签公司', role: '后端', deadline: inDays(1) },
    })
    const doneId = (done.body as { offer: { id: number } }).offer.id
    await call(runtime, 'POST', `/offers/${String(doneId)}/state`, { body: { state: 'accepted' } })

    const today = await call(runtime, 'GET', '/today')
    assert.equal(today.status, 200)
    const body = today.body as {
      offerOpenCount: number
      offersDueSoon: Array<{ companyName: string; daysLeft: number; state: string }>
    }
    assert.equal(body.offerOpenCount, 2, '还没决定的才计数')
    const names = body.offersDueSoon.map((item) => item.companyName)
    assert.ok(names.includes('快到期公司'))
    assert.ok(names.includes('已经过期公司'), '已过期的是最需要立刻看到的一种')
    assert.equal(names.includes('已签公司'), false)
    const expired = body.offersDueSoon.find((item) => item.companyName === '已经过期公司')
    assert.equal(expired?.daysLeft, -1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('列表按"还没决定优先、再按截止时间"排 —— 首屏与列表口径一致', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await call(runtime, 'POST', '/offers', { body: { companyName: '晚截止', deadline: inDays(20) } })
    const early = await call(runtime, 'POST', '/offers', { body: { companyName: '早截止', deadline: inDays(1) } })
    const decided = await call(runtime, 'POST', '/offers', { body: { companyName: '已拒绝', deadline: inDays(0) } })
    const decidedId = (decided.body as { offer: { id: number } }).offer.id
    await call(runtime, 'POST', `/offers/${String(decidedId)}/state`, { body: { state: 'declined' } })

    const list = await call(runtime, 'GET', '/offers')
    const names = (list.body as { items: Array<{ companyName: string }> }).items.map((item) => item.companyName)
    assert.deepEqual(names, ['早截止', '晚截止', '已拒绝'], '没决定的排前面，已定的沉底')
    assert.equal((list.body as { openCount: number }).openCount, 2)
    assert.ok(early.status === 201)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
