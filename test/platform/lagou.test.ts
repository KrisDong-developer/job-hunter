import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildLagouSearchUrl,
  createLagouAdapter,
  DEFAULT_LAGOU_CONFIG,
} from '../../src/host/platform/adapters/lagou.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.lagou.com/jobs/list_Java?city=%E6%B7%B1%E5%9C%B3&px=new'
const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'lagou-search.html')

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

test('搜索 URL：关键词进路径段、城市用中文名、全国省参', () => {
  assert.equal(
    buildLagouSearchUrl(DEFAULT_LAGOU_CONFIG, { keyword: 'Java', city: '深圳' }),
    'https://www.lagou.com/jobs/list_Java?city=%E6%B7%B1%E5%9C%B3',
  )
  // 全国 = 不带 city 参数
  assert.ok(
    (buildLagouSearchUrl(DEFAULT_LAGOU_CONFIG, { keyword: 'Java', city: '全国' }) ?? '').includes('city=') === false,
  )
  // 显式配「最新」才写 px=new
  assert.equal(
    buildLagouSearchUrl(DEFAULT_LAGOU_CONFIG, { keyword: 'Python', city: '杭州', sort: 'new' }),
    'https://www.lagou.com/jobs/list_Python?city=%E6%9D%AD%E5%B7%9E&px=new',
  )
  // 第 2 页起 URL 拼不了 → null（翻页走「下一页」真实 href，不猜拼音 slug）
  assert.equal(buildLagouSearchUrl(DEFAULT_LAGOU_CONFIG, { keyword: 'Java', city: '深圳', page: 2 }), null)
})

test('适配器声明符合平台事实：可免登搜、WAF 反爬（antiBot=high）、无 detail/actions', () => {
  const adapter = createLagouAdapter()
  assert.equal(adapter.id, 'lagou')
  assert.equal(adapter.displayName, '拉勾')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.antiBot, 'high', '2026-09 调研：拉勾 WAF 滑块（CF_APP_WAF）对自动化流量高频拦截')
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  assert.equal(adapter.actions, undefined)
  assert.equal(adapter.detail, undefined, '详情页选择器未做真机校准，不声明')
})

test('判墙：WAF 滑块页（URL /s/list_ 与正文文案）→ captcha；频控/配额', async () => {
  const adapter = createLagouAdapter()
  const wafByUrl = browserLikePage('<html><body>验证</body></html>', 'https://www.lagou.com/s/list_c0e652a60ac8b7fe')
  assert.equal(await adapter.guard.detectBlock(wafByUrl), 'captcha')

  const wafByText = browserLikePage('<html><body>为了更好的访问体验，请滑动滑块进行验证</body></html>')
  assert.equal(await adapter.guard.detectBlock(wafByText), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>您访问过于频繁，请稍后再试</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')

  const quota = browserLikePage('<html><body><div>今日投递太多，达到上限</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(quota), 'quota-exhausted')
})

const CLASSIC_ITEM = `<li class="con_list_item">
  <div class="list_item_top">
    <div class="position">
      <div class="p_top">
        <a class="position_link" href="https://www.lagou.com/wn/jobs/9959194.html?show=abc123">
          <span class="position_name">Java工程师</span>
        </a>
      </div>
      <div class="p_bot">
        <div class="li_b_l">【深圳-南山区】</div>
        <div class="li_b_r"><div class="money">15k-30k</div><div class="format-time">2026-09-10</div></div>
      </div>
    </div>
    <div class="company"><div class="company_name"><a href="#">某科技公司</a></div></div>
  </div>
  <div class="list_item_bot">
    <div class="li_b_l">经验3-5年 / 本科</div>
    <div class="li_b_r"><span class="labels">五险一金</span><span class="labels">年终奖</span></div>
  </div>
</li>`

test('列表解析（经典结构 + 语义锚点）：核心字段、id、城市/区、经验/学历、发布时间', async (t) => {
  const adapter = createLagouAdapter()
  const page = browserLikePage(`<html><body><ul>${CLASSIC_ITEM}${CLASSIC_ITEM}</ul></body></html>`)

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 2)
  const job = jobs[0]
  assert.ok(job !== undefined)
  assert.equal(job.title, 'Java工程师')
  assert.equal(job.salaryRaw, '15k-30k')
  assert.equal(job.company, '某科技公司')
  assert.equal(job.platformJobId, '9959194', '详情链接要抠出纯数字 id（幂等键）')
  assert.ok(job.sourceUrl.startsWith('https://www.lagou.com/wn/jobs/9959194.html'))
  assert.equal(job.city, '深圳')
  assert.equal(job.district, '南山区')
  assert.equal(job.expReq, '3-5年')
  assert.equal(job.eduReq, '本科')
  assert.equal(job.publishedAt, '2026-09-10T00:00:00.000Z')
  assert.deepEqual(job.tags, ['五险一金', '年终奖'])
})

test('分页：读「下一页」真实 href（不自己拼拼音 slug）', async () => {
  const adapter = createLagouAdapter()
  const pager = `<div class="pager_container"><a class="pager_next" href="https://www.lagou.com/hangzhou-zhaopin/Python/2/">下一页</a></div>`
  const page = browserLikePage(`<html><body><ul>${CLASSIC_ITEM}</ul>${pager}</body></html>`)
  assert.equal(await adapter.crawl.hasNextPage(page), true)

  const noMore = browserLikePage(
    `<html><body><ul>${CLASSIC_ITEM}</ul><div class="pager_container"><a class="pager_next disabled" href="#">下一页</a></div></body></html>`,
  )
  assert.equal(await adapter.crawl.hasNextPage(noMore), false)
})

test('真实夹具解析（probe:lagou 保存后启用）：未校准选择器如实降级不炸', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:lagou`)
    return
  }
  const adapter = createLagouAdapter()
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))
  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, `夹具不该被判墙（实际：${String(block)}）`)
  const jobs = await adapter.crawl.readListPage(page)
  // 选择器未校准也不该抛 —— 锚不中的字段走语义模式/留空，由字段断言隔离。
  assert.ok(Array.isArray(jobs))
})