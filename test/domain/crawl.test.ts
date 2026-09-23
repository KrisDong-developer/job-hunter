import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createCompanyService } from '../../src/host/domain/companies.js'
import { runCrawl, type CrawlDeps } from '../../src/host/domain/crawl.js'
import { createJobService } from '../../src/host/domain/jobs.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import {
  DEFAULT_FIFTYONE_CONFIG,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job/config.js'
import { createPlatformLocks } from '../../src/host/platform/locks.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { readYieldSnapshot } from '../../src/host/platform/yield-baseline.js'
import type { PageSource, SiteAdapter } from '../../src/host/platform/types.js'
import { PlatformBlockedError } from '../../src/host/platform/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import { CORE_FIELD_MISS_THRESHOLD } from '../../src/shared/config/crawl.js'
import { fixturePageSource, inlinePageSource, JsdomPage } from '../support/jsdom-page.js'
import { cleanup, fixedClock, fixtureHtmlPath, openTestStore } from '../support/store.js'

const SEARCH_URL = 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000'
const CRITERIA = { keyword: 'Java', city: '深圳' }

/** 把选择器改坏，但**保留卡片容器** —— 这正是 §4.2.4 要抓的「静默失败」。 */
const BROKEN_CONFIG: FiftyOneConfig = {
  ...DEFAULT_FIFTYONE_CONFIG,
  selectors: {
    ...DEFAULT_FIFTYONE_CONFIG.selectors,
    title: '.nope-title',
    salary: '.nope-salary',
    company: '.nope-company',
    tracking: '[sensorsname="NopeNever"]',
  },
}

interface Harness {
  deps: CrawlDeps
  /** 换一套适配器配置（模拟“在 UI 里把选择器改回来”）。 */
  useConfig(config: FiftyOneConfig): void
  close(): void
}

function harness(
  options: {
    config?: FiftyOneConfig
    pageSource?: PageSource
    clock?: () => string
    /**
     * 给适配器换一个详情实现（P2 详情补抓的测试用）。
     *
     * 51job 自 2026-09-21 起自带 `detail`（候选选择器，见适配器 `page/detail.ts`）；
     * 这里仍然显式换一个，才能验证"补抓**由谁触发、触发几次、结果是否回写**"这条接线，
     * 而不是去验证某个平台的解析（那是各平台自己的测试）。
     */
    detail?: SiteAdapter['detail']
  } = {},
): Harness {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  const build = (config: FiftyOneConfig): SiteAdapter => {
    const adapter = createFiftyOneAdapter({ config })
    return options.detail === undefined ? adapter : { ...adapter, detail: options.detail }
  }
  let dispose = registry.register(build(options.config ?? DEFAULT_FIFTYONE_CONFIG))

  const deps: CrawlDeps = {
    store,
    registry,
    locks: createPlatformLocks(),
    pageSource:
      options.pageSource ??
      fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
    jobs: createJobService(store),
    companies: createCompanyService(store),
    clock: options.clock ?? fixedClock(),
  }

  return {
    deps,
    useConfig(config): void {
      dispose()
      dispose = registry.register(build(config))
    },
    close(): void {
      const dataDirPath = store.dataDir
      store.close()
      cleanup(dataDirPath)
    },
  }
}

test('离线夹具跑通一次完整采集并入库', async () => {
  const h = harness()
  try {
    const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(summary.run.state, 'ok')
    assert.equal(summary.run.found, 20)
    assert.equal(summary.run.inserted, 20)
    assert.equal(summary.run.quarantined, 0)
    assert.equal(summary.quarantined, 0)
    assert.equal(summary.degraded, null)

    assert.equal(h.deps.store.job.count(), 20)
    assert.ok(h.deps.store.company.count() > 0, '公司实体应该被建出来')

    // 薪资已按 §4.10.2 归一化
    const first = h.deps.store.job.query({}, 50).find((job) => job.platformJobId === '173674707')
    assert.ok(first)
    assert.equal(first.salaryMin, 13000)
    assert.equal(first.salaryMax, 18000)
    assert.equal(first.companyName, '深圳市明泰海科技术有限公司')
    assert.equal(first.city, '深圳')

    // 平台被登记为健康
    assert.equal(h.deps.store.platform.get('51job')?.health, 'healthy')
    assert.equal(h.deps.store.platform.get('51job')?.lastOkAt !== null, true)

    // 字段命中全部到位
    assert.ok(summary.fieldPresence.every((entry) => entry.present === entry.records))
  } finally {
    h.close()
  }
})

test('重复抓取幂等：只更新不新增（§6.1）', async () => {
  const h = harness()
  try {
    await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    const second = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(second.run.state, 'ok')
    assert.equal(second.run.inserted, 0)
    assert.equal(second.run.updated, 20)
    assert.equal(h.deps.store.job.count(), 20, '重复跑不能产生重复数据')
    assert.equal(h.deps.store.company.count(), h.deps.store.company.count())
  } finally {
    h.close()
  }
})

test('故意破坏选择器：触发降级告警，且一条脏数据都没进主表', async () => {
  const h = harness({ config: BROKEN_CONFIG })
  try {
    const summaries = []
    for (let round = 0; round < CORE_FIELD_MISS_THRESHOLD; round += 1) {
      summaries.push(await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA }))
    }

    // 每条记录都被字段断言拦下
    assert.ok(summaries.every((summary) => summary.quarantined === 20))
    assert.ok(summaries.every((summary) => summary.run.state === 'partial'))
    assert.ok(summaries.every((summary) => summary.run.inserted === 0))

    // ★ 核心断言：主表干净 —— 不写脏数据（§4.2.4 / ADR-20）
    assert.equal(h.deps.store.job.count(), 0)
    assert.equal(h.deps.store.company.count(), 0)

    // 原始片段留在隔离队列里，供修好选择器后重放
    assert.equal(
      h.deps.store.repair.countPending('51job'),
      20 * CORE_FIELD_MISS_THRESHOLD,
    )
    const pending = h.deps.store.repair.listPending('51job', 1)
    assert.ok(pending[0]?.missingFields.includes('title'))
    assert.ok(pending[0]?.missingFields.includes('source_url'))

    // 逐字段连续缺失计数到位
    const fields = h.deps.store.fieldHealth.list('51job')
    assert.equal(fields.length, 4)
    assert.ok(fields.every((field) => field.consecutiveMiss === CORE_FIELD_MISS_THRESHOLD))

    // 降级 + 主动告警（待办只开一条，不会被每轮刷屏）
    assert.equal(h.deps.store.platform.get('51job')?.health, 'degraded')
    const todos = h.deps.store.todo.listOpen()
    assert.equal(todos.length, 1)
    assert.equal(todos[0]?.kind, 'adapter-degraded')
    assert.equal(todos[0]?.level, 'urgent')

    // 最后一轮明确回报了降级原因
    assert.equal(summaries.at(-1)?.degraded?.platformId, '51job')
    assert.ok((summaries.at(-1)?.degraded?.reasons.length ?? 0) > 0)
  } finally {
    h.close()
  }
})

test('降级后暂停写入；选择器改回来即自动恢复并关掉待办', async () => {
  const h = harness({ config: BROKEN_CONFIG })
  try {
    for (let round = 0; round < CORE_FIELD_MISS_THRESHOLD; round += 1) {
      await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    }
    assert.equal(h.deps.store.platform.get('51job')?.health, 'degraded')

    // 模拟「在 UI 里把选择器改回来」
    h.useConfig(DEFAULT_FIFTYONE_CONFIG)
    const recovered = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(h.deps.store.platform.get('51job')?.health, 'healthy')
    assert.equal(h.deps.store.todo.countOpen(), 0, '恢复后待办应被关掉')
    assert.equal(recovered.run.inserted, 20)
    assert.equal(h.deps.store.job.count(), 20)
    assert.ok(
      h.deps.store.fieldHealth.list('51job').every((field) => field.consecutiveMiss === 0),
    )
  } finally {
    h.close()
  }
})

test('撞上滑块：本轮记 failed、不写库、按阈值置为失效并告警', async () => {
  const captcha = inlinePageSource({
    html: '<html><body><div class="geetest_panel">请完成安全验证</div></body></html>',
    url: SEARCH_URL,
  })
  const h = harness({ pageSource: captcha })
  try {
    const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(summary.run.state, 'failed')
    assert.equal(summary.run.errorCode, 'BLOCKED')
    assert.equal(h.deps.store.job.count(), 0)

    // 连撞到阈值 → broken + 待办
    for (let round = 1; round < CORE_FIELD_MISS_THRESHOLD; round += 1) {
      await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    }
    assert.equal(h.deps.store.platform.get('51job')?.health, 'broken')
    const todos = h.deps.store.todo.listOpen()
    assert.ok(todos.some((todo) => todo.kind === 'adapter-broken'))
  } finally {
    h.close()
  }
})

test('平台配额耗尽（quota-exhausted）：报 PLATFORM_QUOTA 而不是 BLOCKED，且文案说明今天停手', async () => {
  const quota = inlinePageSource({
    html: '<html><body><div class="toast">您今日投递太多，休息一下明天再来</div></body></html>',
    url: SEARCH_URL,
  })
  const h = harness({ pageSource: quota })
  try {
    const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(summary.run.state, 'failed')
    assert.equal(summary.run.errorCode, 'PLATFORM_QUOTA', '配额耗尽是与频控不同的信号（调度器据此直接风控暂停）')
    assert.ok(summary.run.errorMsg?.includes('额度'), '错误文案要说明是平台侧额度，而不是含糊的"命中风控"')
    assert.equal(h.deps.store.job.count(), 0)
  } finally {
    h.close()
  }
})

test('同平台的并发抓取被挡住（同一 tick 的第二次也必须被拒）；不同平台不受影响（见 locks.test）', async () => {
  const h = harness()
  try {
    const first = runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    const second = runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    await assert.rejects(
      second,
      (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
    )
    const done = await first
    assert.equal(done.run.inserted, 20)
  } finally {
    h.close()
  }
})

test('未注册的平台 → NOT_FOUND', async () => {
  const h = harness()
  try {
    await assert.rejects(
      runCrawl(h.deps, { platformId: 'boss', criteria: CRITERIA }),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  } finally {
    h.close()
  }
})

/** 页面正常、筛选器文案齐全，只是结果为空 —— 不能被误判成 blank。 */
const EMPTY_RESULT_HTML = `<html><body>
      <div class="search-containter"><div class="j_result"><div class="j_tlc"><div class="tleft">
        <span class="ss on">综合排序</span><span class="ss">活跃职位优先</span><span class="ss">最新优先</span>
        <span class="ss">薪资优先</span><span class="ss">距离优先</span>
      </div></div>
      <div class="joblist"><div class="empty-result">
        抱歉，没有找到符合当前筛选条件的职位。建议减少筛选条件，或更换关键词后重新搜索；
        也可以切换工作地点，或查看系统为你推荐的相似职位。
      </div></div>
      <div class="filter">工作地点 北京 上海 广州 深圳 武汉 西安 杭州 南京 成都 重庆 东莞 其他城市</div>
      <div class="filter">工作职能 行业领域 月薪范围 工作类型 工作年限 学历要求 公司性质 公司规模 清空</div>
      </div></div>
    </body></html>`

test('页面正常但一条都没解析出来 → partial + NO_RECORDS（不静默降级成“没有新岗位”）', async () => {
  const empty = inlinePageSource({ html: EMPTY_RESULT_HTML, url: SEARCH_URL })
  const h = harness({ pageSource: empty })
  try {
    const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    assert.equal(summary.run.state, 'partial')
    assert.equal(summary.run.errorCode, 'NO_RECORDS')
    assert.equal(summary.run.found, 0)
  } finally {
    h.close()
  }
})

test('批次 5：量级骤降 → yield-drop 待办；回到常态 → 自动关闭（走真实 runCrawl 主链）', async () => {
  // 同一个 harness 里切换页面源：先 5 轮常态（真实夹具 20 条），再一轮"空结果"。
  const normal = fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL })
  const empty = inlinePageSource({ html: EMPTY_RESULT_HTML, url: SEARCH_URL })
  let mode: 'normal' | 'empty' = 'normal'
  const h = harness({
    pageSource: {
      acquire: () => (mode === 'normal' ? normal.acquire() : empty.acquire()),
      release: (page) => (mode === 'normal' ? normal.release(page) : empty.release(page)),
    },
  })
  try {
    for (let round = 0; round < 5; round += 1) {
      const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
      assert.equal(summary.run.state, 'ok')
      assert.ok(summary.run.found > 0, '常态轮次应当抓到东西 —— 否则基线立不起来')
    }

    // 第 6 轮：页面正常但一条都没有 —— 字段健康全绿、quarantined=0，
    // 只有跟这个平台自己的历史比才知道"这不正常"。
    mode = 'empty'
    const dropped = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    assert.equal(dropped.run.found, 0)

    const todo = h.deps.store.todo.listOpen().find((item) => item.kind === 'yield-drop')
    assert.ok(
      todo !== undefined,
      '5 轮常态之后来一轮 0 条 —— 必须产生量级告警（否则用户只看到"今天没岗位"）',
    )
    assert.equal(todo.level, 'warn')

    // 恢复：回到常态就该关掉 —— 挂着不清的告警会被用户学会无视
    mode = 'normal'
    await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    assert.equal(
      h.deps.store.todo.listOpen().some((item) => item.kind === 'yield-drop'),
      false,
      '恢复即关闭',
    )
  } finally {
    h.close()
  }
})

// ── SR-46：到点中止（单轮预算的平台内那一半）──────────────────────────

/**
 * 造一个"时间随翻页流逝"的页面源：每导航一次就过去 10 分钟。
 *
 * 为什么把时间挂在导航上：到点中止问的是"**开新页之前**到点了吗"，
 * 用真实时间无法重复，用"按调用次数计数的时钟"又会随内部实现细节（多调一次就错位）。
 */
function pagingPageSource(startIso: string): {
  pageSource: PageSource
  navigations: () => number
  now: () => Date
  close: () => void
} {
  let nowMs = new Date(startIso).getTime()
  let navigations = 0
  const page = new JsdomPage({
    html: readFileSync(fixtureHtmlPath(), 'utf8'),
    url: SEARCH_URL,
    onGoto: () => {
      navigations += 1
      nowMs += 10 * 60 * 1000
    },
  })
  return {
    pageSource: {
      async acquire(): Promise<typeof page> {
        return page
      },
      async release(): Promise<void> {
        /* 单页夹具无需释放 */
      },
    },
    navigations: () => navigations,
    now: () => new Date(nowMs),
    close: () => {
      page.close()
    },
  }
}

test('SR-46：到点中止 —— 已抓到的照常入库，剩余页**连导航都不发**，且不算失败', async () => {
  const start = '2026-09-16T00:00:00.000Z'
  const paging = pagingPageSource(start)
  const h = harness({ pageSource: paging.pageSource, clock: () => paging.now().toISOString() })
  try {
    const summary = await runCrawl(h.deps, {
      platformId: '51job',
      criteria: { ...CRITERIA, maxPages: 3 },
      // 15 分钟到点：第 1 页跑完 +10，第 2 页跑完 +20 → 第 3 页之前正好越过
      deadlineAt: new Date(new Date(start).getTime() + 15 * 60 * 1000).toISOString(),
    })

    assert.equal(
      summary.run.state,
      'aborted',
      '到点中止是**第四种**结局：不是 partial（数据不全），也不是 failed（平台有问题）',
    )
    assert.equal(summary.run.errorCode, 'DEADLINE_REACHED')
    assert.equal(summary.run.pages, 2, '完成了两页')
    assert.equal(summary.run.found, 40, '已完成那两页的数据照常带走')
    assert.equal(h.deps.store.job.count(), 20, '照常入库（第二页是幂等更新，不产生重复）')
    assert.equal(paging.navigations(), 2, '第 3 页**根本没请求** —— 到点就不该再发一次导航')

    // 中止**不是**失败：连续失败计数与健康态都不该动（否则健康的平台会被推去冷却）
    assert.equal(h.deps.store.platform.get('51job')?.failStreak, 0)
    assert.equal(h.deps.store.platform.get('51job')?.health, 'healthy')
  } finally {
    h.close()
    paging.close()
  }
})

test('SR-46：到点时刻早于第一页时一次导航都不发，且**不能**报成"选择器失效"', async () => {
  const h = harness({ clock: () => '2026-09-16T01:00:00.000Z' })
  try {
    const summary = await runCrawl(h.deps, {
      platformId: '51job',
      criteria: { ...CRITERIA, maxPages: 2 },
      deadlineAt: '2026-09-16T00:00:00.000Z', // 早就过去了
    })

    assert.equal(summary.run.pages, 0)
    assert.equal(summary.run.state, 'aborted')
    assert.equal(
      summary.run.errorCode,
      'DEADLINE_REACHED',
      '报成 NO_RECORDS 会把用户引去查选择器 —— 一个根本不存在的问题',
    )
    assert.equal(h.deps.store.job.count(), 0)
  } finally {
    h.close()
  }
})

test('SR-46：中止的那一轮不进量级基线、也不算"最近一轮"（半截的条数没有发言权）', async () => {
  const h = harness()
  try {
    for (let round = 0; round < 5; round += 1) {
      const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
      assert.equal(summary.run.state, 'ok')
    }

    // 第 6 轮：还没抓到任何东西就到点了（pages=0、found=0）
    const aborted = await runCrawl(h.deps, {
      platformId: '51job',
      criteria: CRITERIA,
      deadlineAt: '2020-01-01T00:00:00.000Z',
    })
    assert.equal(aborted.run.state, 'aborted')
    assert.equal(aborted.run.found, 0)

    const snapshot = readYieldSnapshot(h.deps.store, '51job')
    assert.equal(snapshot.baseline, 20, '基线只取 ok 的轮次（既有语义）')
    assert.equal(
      snapshot.lastFound,
      20,
      '"最近一轮"要跳过中止轮 —— 拿半截的 0 条去比，必然误报一次骤降',
    )
    assert.equal(snapshot.level, 'ok')
    assert.equal(
      h.deps.store.todo.listOpen().some((item) => item.kind === 'yield-drop'),
      false,
      '不能因为"我们自己到点了"就弹一条量级骤降告警',
    )
  } finally {
    h.close()
  }
})

// ── P2：详情补抓（列表不含 JD 的平台，如猎聘）────────────────────────

/** 详情页夹具：正文够长（51job 的 blank 阈值是 80 字），且不含任何风控标记。 */
const DETAIL_OK_HTML = `<html><body><div class="job-detail">${'岗位职责与任职要求：负责后端服务的设计与开发。'.repeat(
  10,
)}</div></body></html>`
const DETAIL_CAPTCHA_HTML =
  '<html><body><div class="geetest_panel">请完成安全验证</div></body></html>'

test('详情补抓：缺 JD 的岗位全量点到、JD 回写到位；第二轮缺口清零后一条都不再点', async () => {
  let calls = 0
  const h = harness({
    detail: {
      async extract(page) {
        calls += 1
        const url = page.url()
        return {
          platformJobId: '',
          title: '',
          salaryRaw: '',
          company: '',
          sourceUrl: url,
          jdText: `JD@${url}`,
        }
      },
    },
  })
  try {
    const first = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    assert.equal(first.run.state, 'ok')
    assert.equal(first.run.inserted, 20)
    assert.equal(calls, 20, '每条新增岗位点进去一次')

    // ★ 回写必须落到**这一条自己**身上（错位是最难发现的一种坏法）
    const jobs = h.deps.store.job.query({}, 50)
    assert.equal(jobs.length, 20)
    for (const job of jobs) {
      assert.equal(
        h.deps.store.job.jdText(job.id),
        `JD@${job.sourceUrl}`,
        `JD 落错行了（${job.platformJobId}）`,
      )
    }

    // 第二轮全是老岗位 → 详情一条都不点（否则每轮都重复点一遍，白烧配额）
    const second = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })
    assert.equal(second.run.inserted, 0)
    assert.equal(calls, 20, '老岗位不再点进去 —— JD 已经取过了')
  } finally {
    h.close()
  }
})

test('详情补抓撞上风控：整轮 failed 且说明已停手，但列表数据一条不丢', async () => {
  const searchHtml = readFileSync(fixtureHtmlPath(), 'utf8')
  let detailNavigations = 0
  const page = new JsdomPage({
    html: searchHtml,
    url: SEARCH_URL,
    // 列表页沿用真实夹具；详情页前两条正常，第 3 条开始被拦
    loader: (url) => {
      if (!url.includes('jobs.51job.com')) return undefined
      detailNavigations += 1
      return detailNavigations >= 3 ? DETAIL_CAPTCHA_HTML : DETAIL_OK_HTML
    },
  })
  const h = harness({
    pageSource: {
      async acquire(): Promise<typeof page> {
        return page
      },
      async release(): Promise<void> {
        /* 单页夹具无需释放 */
      },
    },
    detail: {
      async extract(pageLike) {
        const url = pageLike.url()
        return {
          platformJobId: '',
          title: '',
          salaryRaw: '',
          company: '',
          sourceUrl: url,
          jdText: `JD@${url}`,
        }
      },
    },
  })
  try {
    const summary = await runCrawl(h.deps, { platformId: '51job', criteria: CRITERIA })

    assert.equal(
      summary.run.state,
      'failed',
      '详情阶段撞墙是平台级信号，不能悄悄算成"这一条解析失败"',
    )
    assert.equal(summary.run.errorCode, 'BLOCKED')
    assert.ok(summary.run.errorMsg?.includes('已停手'), '要说清楚停手了，而不是含糊报错')

    // ★ 列表数据已经入库了，不该因为详情阶段撞墙而回滚或丢弃
    assert.equal(h.deps.store.job.count(), 20)
    assert.equal(summary.run.inserted, 20)
    assert.equal(detailNavigations, 3, '命中即停 —— 不该继续点第 4 条')

    const withJd = h.deps.store.job
      .query({}, 50)
      .filter((job) => h.deps.store.job.jdText(job.id) !== null)
    assert.equal(withJd.length, 2, '撞墙前已经取到的 JD 要留住')
  } finally {
    h.close()
    page.close()
  }
})

test('详情补抓到点即停：列表数据照常入库，本轮记 aborted 并给出原因', async () => {
  const start = '2026-09-16T00:00:00.000Z'
  const paging = pagingPageSource(start) // 每导航一次 +10 分钟
  let calls = 0
  const h = harness({
    pageSource: paging.pageSource,
    clock: () => paging.now().toISOString(),
    detail: {
      async extract(page) {
        calls += 1
        const url = page.url()
        return {
          platformJobId: '',
          title: '',
          salaryRaw: '',
          company: '',
          sourceUrl: url,
          jdText: `JD@${url}`,
        }
      },
    },
  })
  try {
    const summary = await runCrawl(h.deps, {
      platformId: '51job',
      criteria: { ...CRITERIA, maxPages: 1 },
      // 第 1 页跑完 +10；第 1 条详情跑完 +20 → 第 2 条之前正好越过 15 分钟
      deadlineAt: new Date(new Date(start).getTime() + 15 * 60 * 1000).toISOString(),
    })

    assert.equal(summary.run.inserted, 20, '列表那一页照常入库')
    assert.equal(calls, 1, '到点后不再点下一条详情')
    assert.equal(summary.run.state, 'aborted')
    assert.equal(
      summary.run.errorCode,
      'DEADLINE_REACHED',
      'aborted 的轮次必须能说出为什么 —— 否则界面上只有一个莫名其妙的"已中止"',
    )
    assert.ok(summary.run.errorMsg?.includes('详情补抓'))

    const withJd = h.deps.store.job
      .query({}, 50)
      .filter((job) => h.deps.store.job.jdText(job.id) !== null)
    assert.equal(withJd.length, 1)
  } finally {
    h.close()
    paging.close()
  }
})

// ── 适配器自报风控（接口返回码那一类）──────────────────────────────────
//
// 判墙（`detectBlock`）跑在**发请求之前**，所以"接口返回 429 / 需要登录"这类证据
// 只能由适配器在拿到应答时抛出来。以前它会被归成 `PARSE_FAILED`：
// 既拿不到"该退避/该停手"的语义，也不会走平台级风控暂停 —— 而那正是 SR-22 要拦的。

/** 造一个"解析阶段抛风控错误"的采集环境，返回这一轮的结果。 */
async function crawlWithBlockingParse(
  kind: 'rate-limited' | 'quota-exhausted' | 'login-required',
): Promise<Awaited<ReturnType<typeof runCrawl>>> {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  const base = createFiftyOneAdapter({ config: DEFAULT_FIFTYONE_CONFIG })
  registry.register({
    ...base,
    crawl: {
      ...base.crawl,
      readListPage: async () => {
        throw new PlatformBlockedError(kind, `接口返回 ${kind}`)
      },
    },
  })
  const deps: CrawlDeps = {
    store,
    registry,
    locks: createPlatformLocks(),
    pageSource: fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
    jobs: createJobService(store),
    companies: createCompanyService(store),
    clock: fixedClock(),
  }
  try {
    return await runCrawl(deps, { platformId: '51job', criteria: CRITERIA })
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
}

test('适配器自报限流 → 记成 BLOCKED（不是 PARSE_FAILED），错误里保留平台原话', async () => {
  const summary = await crawlWithBlockingParse('rate-limited')
  assert.equal(summary.run.state, 'failed')
  assert.equal(summary.run.errorCode, 'BLOCKED')
  assert.ok(summary.run.errorMsg?.includes('rate-limited'), summary.run.errorMsg ?? '')
})

test('适配器自报额度耗尽 → PLATFORM_QUOTA；自报登录墙 → NOT_LOGGED_IN', async () => {
  // 两者的处置完全不同：额度耗尽当天停手（退避没用），登录墙要生成登录待办
  assert.equal((await crawlWithBlockingParse('quota-exhausted')).run.errorCode, 'PLATFORM_QUOTA')
  assert.equal((await crawlWithBlockingParse('login-required')).run.errorCode, 'NOT_LOGGED_IN')
})
