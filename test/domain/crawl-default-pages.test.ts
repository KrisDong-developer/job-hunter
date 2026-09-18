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
