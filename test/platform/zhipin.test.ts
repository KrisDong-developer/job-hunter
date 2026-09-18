import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildZhipinSearchUrl,
  createZhipinAdapter,
  DEFAULT_ZHIPIN_CONFIG,
} from '../../src/host/platform/adapters/zhipin.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.zhipin.com/web/geek/job?query=Java&city=101280600'
const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'zhipin-search.html')

function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

function browserLikePage(html: string, url = SEARCH_URL): PageLike {
  const inner = new JsdomPage({ html, url })
  return {
    goto: (target) => inner.goto(target),
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
  }
}

test('搜索 URL：query + city（BossHunter 同款形态）', () => {
  assert.equal(
    buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java', city: '深圳' }),
    'https://www.zhipin.com/web/geek/job?query=Java&city=101280600',
  )
  assert.ok(
    (buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java' }) ?? '').includes('city=') === false,
  )
  // 城市码未知 → null（不猜）
  assert.equal(buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java', city: '火星' }), null)
})

test('适配器声明符合平台事实：未登录可搜、薪资隐藏（medium）、antiBot=high', () => {
  const adapter = createZhipinAdapter()
  assert.equal(adapter.id, 'zhipin')
  assert.equal(adapter.displayName, 'BOSS直聘')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  assert.equal(adapter.capabilities.antiBot, 'high')
  assert.equal(adapter.maxPages, 1, '未登录无分页（平台事实）')
  assert.ok(
    !adapter.requiredFields.includes('salary_raw' as never),
    '未登录薪资隐藏，salary_raw 不得进必需字段（否则全部被隔离）',
  )
  assert.equal(adapter.actions, undefined)
  assert.ok(adapter.detail !== undefined, '详情选择器有 BossHunter 验证证据，应声明')
})

test('判墙：BOSS 滑块页 URL → captcha；频控/配额文案', async () => {
  const adapter = createZhipinAdapter()
  const slider = browserLikePage(
    '<html><body>滑块验证</body></html>',
    'https://www.zhipin.com/web/user/safe/verify-slider?seed=xyz',
  )
  assert.equal(await adapter.guard.detectBlock(slider), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>您访问过于频繁，请稍后再试</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')

  const quota = browserLikePage('<html><body><div>今日沟通次数过多，休息一下明天再来</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(quota), 'quota-exhausted')
})

test('真实夹具解析（probe:zhipin 保存后启用）：未登录视图的字段形态', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:zhipin`)
    return
  }
  const adapter = createZhipinAdapter()
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))

  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, `夹具不该被判墙（实际：${String(block)}）`)

  const jobs = await adapter.crawl.readListPage(page)
  assert.ok(jobs.length >= 10, `夹具应解析出 ≥10 条（实测 15），实际 ${String(jobs.length)}`)

  for (const job of jobs) {
    assert.ok(job.title.length > 0)
    assert.ok(job.sourceUrl.startsWith('https://www.zhipin.com/job_detail/'), `详情链接形态：${job.sourceUrl}`)
    assert.ok(job.platformJobId.length > 0, '加密 id 必须抠出（幂等键）')
    // 未登录事实：薪资隐藏、boss-name 是公司名
    assert.ok(job.company.length > 0, 'boss-name 必须解析为公司名')
  }
  const first = jobs[0]
  assert.ok((first?.notes ?? []).some((note) => note.includes('薪资隐藏')), '薪资缺失要记 notes 说明原因')

  const hit = (pick: (job: (typeof jobs)[number]) => unknown): number =>
    jobs.filter((job) => pick(job) !== undefined && pick(job) !== '').length
  console.log(
    `[zhipin-fixture] ${String(jobs.length)} 张卡片 · ` +
      `city ${String(hit((j) => j.city))} · district ${String(hit((j) => j.district))} · ` +
      `exp ${String(hit((j) => j.expReq))} · edu ${String(hit((j) => j.eduReq))} · ` +
      `salary ${String(hit((j) => j.salaryRaw))}（未登录隐藏属预期）`,
  )

  // 未登录无分页区 → hasNextPage 恒 false
  assert.equal(await adapter.crawl.hasNextPage(page), false)
})
