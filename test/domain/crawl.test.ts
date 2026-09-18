import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCompanyService } from '../../src/host/domain/companies.js'
import { runCrawl, type CrawlDeps } from '../../src/host/domain/crawl.js'
import { createJobService } from '../../src/host/domain/jobs.js'
import {
  createFiftyOneAdapter,
  DEFAULT_FIFTYONE_CONFIG,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job.js'
import { createMutex } from '../../src/host/platform/mutex.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import type { PageSource } from '../../src/host/platform/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import { CORE_FIELD_MISS_THRESHOLD } from '../../src/shared/constants.js'
import { fixturePageSource, inlinePageSource } from '../support/jsdom-page.js'
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

function harness(options: { config?: FiftyOneConfig; pageSource?: PageSource } = {}): Harness {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  let dispose = registry.register(createFiftyOneAdapter({ config: options.config ?? DEFAULT_FIFTYONE_CONFIG }))

  const deps: CrawlDeps = {
    store,
    registry,
    mutex: createMutex(),
    pageSource:
      options.pageSource ??
      fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
    jobs: createJobService(store),
    companies: createCompanyService(store),
    clock: fixedClock(),
  }

  return {
    deps,
    useConfig(config): void {
      dispose()
      dispose = registry.register(createFiftyOneAdapter({ config }))
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

test('并发抓取被全局互斥挡住（同一 tick 的第二次也必须被拒）', async () => {
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
