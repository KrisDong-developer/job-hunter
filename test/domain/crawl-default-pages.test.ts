import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCrawl, type CrawlDeps } from '../../src/host/domain/crawl.js'
import { createCompanyService } from '../../src/host/domain/companies.js'
import { createJobService } from '../../src/host/domain/jobs.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import { createPlatformLocks } from '../../src/host/platform/locks.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import type { PageLike, PageSource, RawJob, SiteAdapter } from '../../src/host/platform/types.js'
import { cleanup, fixedClock, openTestStore } from '../support/store.js'

/**
 * `defaultMaxPages` 的取用链（SR-40 的补丁）。
 *
 * 以前 hint 文案写着"默认 3 页"、执行链却永远是 1 页 —— 文案与事实分家。
 * 这里用计数桩把整条链钉住：不配 maxPages 时到底抓几页，由**适配器声明**说了算。
 */

function countingAdapter(options: { defaultMaxPages: number; maxPages: number }): {
  adapter: SiteAdapter
  gotoCount: () => number
} {
  let gotoCount = 0
  const adapter: SiteAdapter = {
    id: 'counter',
    displayName: 'Counter',
    ...platformFacts('counter'),
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
    maxPages: options.maxPages,
    defaultMaxPages: options.defaultMaxPages,
    criteria: { buildSearchUrl: () => 'https://example.com/search' },
    crawl: {
      async gotoSearch(): Promise<void> {
        gotoCount += 1
      },
      async readListPage(): Promise<RawJob[]> {
        // 每页都有货、永远有下一页 —— 页数完全由 maxPages 链决定
        return [
          {
            platformJobId: `j-${String(gotoCount)}`,
            title: '岗位',
            salaryRaw: '',
            company: '',
            sourceUrl: 'https://example.com/j',
          },
        ]
      },
      hasNextPage: async () => true,
    },
    guard: { detectBlock: async () => null },
  }
  return { adapter, gotoCount: () => gotoCount }
}

/** 不导航、不等待的空页面。 */
const stubPage: PageLike = {
  url: () => 'https://example.com/search',
  goto: async () => undefined,
  evaluate: async <R, _A>(_fn: (_arg: _A) => R, _arg: _A): Promise<R> => [] as unknown as R,
  waitForTimeout: async () => undefined,
}
const stubSource: PageSource = {
  acquire: async () => stubPage,
  release: async () => undefined,
}

function harness(adapter: SiteAdapter): { deps: CrawlDeps; close: () => void } {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(adapter)
  return {
    deps: {
      store,
      registry,
      locks: createPlatformLocks(),
      pageSource: stubSource,
      jobs: createJobService(store),
      companies: createCompanyService(store),
      clock: fixedClock(),
    },
    close: (): void => {
      const dir = store.dataDir
      store.close()
      cleanup(dir)
    },
  }
}

test('不配 maxPages → 用适配器的 defaultMaxPages（不再是永远 1 页）', async () => {
  const { adapter, gotoCount } = countingAdapter({ defaultMaxPages: 3, maxPages: 8 })
  const h = harness(adapter)
  try {
    const summary = await runCrawl(h.deps, { platformId: 'counter', criteria: {} })
    assert.equal(gotoCount(), 3, '方案没配页数时，抓取深度 = 适配器声明默认值')
    assert.equal(summary.run.pages, 3)
    assert.equal(summary.run.found, 3)
  } finally {
    h.close()
  }
})

test('方案配了 maxPages → 仍以方案为准（默认值不越权）', async () => {
  const { adapter, gotoCount } = countingAdapter({ defaultMaxPages: 3, maxPages: 8 })
  const h = harness(adapter)
  try {
    await runCrawl(h.deps, { platformId: 'counter', criteria: { maxPages: 2 } })
    assert.equal(gotoCount(), 2)
  } finally {
    h.close()
  }
})

test('defaultMaxPages 也要受上限钳制（声明 5、上限 3 → 3 页）', async () => {
  const { adapter, gotoCount } = countingAdapter({ defaultMaxPages: 5, maxPages: 3 })
  const h = harness(adapter)
  try {
    await runCrawl(h.deps, { platformId: 'counter', criteria: {} })
    assert.equal(gotoCount(), 3, '默认值不能绕过平台上限（截断语义与方案值一致）')
  } finally {
    h.close()
  }
})

test('没声明默认（undefined 兜底）→ 1 页，保持旧行为', async () => {
  const { adapter, gotoCount } = countingAdapter({ defaultMaxPages: 1, maxPages: 5 })
  // 直接模拟"字段缺失"的老适配器：断言取用链的最后一档仍然存在
  const legacy = { ...adapter, defaultMaxPages: undefined } as unknown as SiteAdapter
  const h = harness(legacy)
  try {
    await runCrawl(h.deps, { platformId: 'counter', criteria: {} })
    assert.equal(gotoCount(), 1)
  } finally {
    h.close()
  }
})

// ── 身份断言：没有平台岗位 id 的记录一律不写库 ──────────────────────────
//
// 这里钉的是一个**会静默毁数据**的坏法：身份键是 `(platform_id, platform_job_id)`，
// 空 id 会让整页记录互相覆盖 —— 第一张卡插入、其余每一张都更新那一行，
// 一页 20 条最后只剩 1 条（字段还是最后那张卡的）。它比"0 条"隐蔽：
// 0 条会被判成 `suspicious` 并记 NO_RECORDS，这个会让采集**报成功**。

/** 造一个"列表能解析、但 id 正则烂了"的适配器：`ids` 决定每条有没有身份键。 */
function identityAdapter(ids: readonly string[]): SiteAdapter {
  return {
    id: 'noidentity',
    displayName: 'NoIdentity',
    ...platformFacts('noidentity'),
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      fieldCompleteness: 'low',
      antiBot: 'low',
    },
    // 只要求 title —— 身份键**不在**这里管（它是写库路径的不变量，见 crawl.ts 里的说明）
    requiredFields: ['title'],
    criteriaDimensions: [],
    maxPages: 1,
    defaultMaxPages: 1,
    criteria: { buildSearchUrl: () => 'https://example.com/search' },
    crawl: {
      async gotoSearch(): Promise<void> {},
      async readListPage(): Promise<RawJob[]> {
        return ids.map((platformJobId, index) => ({
          platformJobId,
          title: `岗位 ${String(index)}`,
          salaryRaw: '',
          company: `公司 ${String(index)}`,
          // ⚠️ source_url 是**独立的**（真实适配器就是这样：id 锚不到时退回 href），
          // 所以这些记录能过字段断言，只有身份断言拦得住 —— 正是要测的那条缝。
          sourceUrl: `https://example.com/job/${String(index)}`,
        }))
      },
      hasNextPage: async () => false,
    },
    guard: { detectBlock: async () => null },
  }
}

test('整页都没有平台岗位 id → 一条都不写，且如实报 NO_IDENTITY（不是"抓到了 4 条"）', async () => {
  const h = harness(identityAdapter(['', '', '', '']))
  try {
    const summary = await runCrawl(h.deps, { platformId: 'noidentity', criteria: {} })
    assert.equal(summary.run.found, 4, '页面确实解析出了 4 条 —— 这正是它危险的地方')
    assert.equal(h.deps.store.job.count(), 0, '一条都不许写：写进去会互相覆盖成 1 条')
    assert.equal(summary.run.inserted, 0)
    assert.equal(summary.quarantined, 4)
    assert.equal(summary.run.state, 'partial', '丢了 4 条不能算 ok')
    assert.equal(summary.run.errorCode, 'NO_IDENTITY', '必须与"一条都没解析出来"分开报')
    assert.equal(h.deps.store.repair.countPending('noidentity'), 4, '每一条都要进修复队列')
    const pending = h.deps.store.repair.listPending('noidentity', 1)[0]
    assert.ok(
      pending?.missingFields.includes('platformJobId') === true,
      `修复队列里要写清缺的是身份键：${JSON.stringify(pending?.missingFields ?? [])}`,
    )
  } finally {
    h.close()
  }
})

test('只有一部分没有身份键 → 有键的照常入库，坏的那几条隔离（不整轮报废）', async () => {
  const h = harness(identityAdapter(['a-1', '', 'a-2', '']))
  try {
    const summary = await runCrawl(h.deps, { platformId: 'noidentity', criteria: {} })
    assert.equal(h.deps.store.job.count(), 2, '有身份键的两条必须照常入库')
    assert.equal(summary.run.inserted, 2)
    assert.equal(summary.quarantined, 2)
    assert.equal(summary.run.state, 'partial')
    assert.equal(summary.run.errorCode, null, '不是"整轮全坏"，不该报平台级失败码')
  } finally {
    h.close()
  }
})

test('身份键只算"去掉空白后为空" —— 纯空白同样不该变成一条', async () => {
  const h = harness(identityAdapter(['  ', '   ']))
  try {
    const summary = await runCrawl(h.deps, { platformId: 'noidentity', criteria: {} })
    assert.equal(h.deps.store.job.count(), 0, '空白 id 与空 id 同样是「没有身份键」')
    assert.equal(summary.run.errorCode, 'NO_IDENTITY')
  } finally {
    h.close()
  }
})
