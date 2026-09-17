/**
 * 离线跑一次真实采集流程（`npm run crawl:fixture`）。
 *
 * 这是 P1 出口标准「能抓一次并入库」的可执行形态：**不碰任何真实招聘网站**，
 * 用保存下来的 51job 列表页 HTML 走完整链路
 * （适配器 → 字段断言 → 隔离 → 薪资归一化 → 公司实体 → 幂等入库 → crawl_run → 健康计数）。
 *
 * 用法：
 *   node scripts/run-ts.mjs test/tools/crawl-fixture.ts                        # 正常跑一轮
 *   ... --rounds 3 --break-selectors                                          # 故意破坏选择器跑 3 轮
 *   ... --data-dir D:\tmp\jh-demo                                             # 指定数据目录（便于事后翻库）
 */
import { parseArgs } from 'node:util'
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
import { openStore } from '../../src/host/store/store.js'
import { fixturePageSource } from '../support/jsdom-page.js'
import { fixtureHtmlPath } from '../support/store.js'

const { values } = parseArgs({
  options: {
    rounds: { type: 'string', default: '1' },
    'break-selectors': { type: 'boolean', default: false },
    'data-dir': { type: 'string' },
  },
  allowPositionals: true,
})

const rounds = Math.max(1, Number.parseInt(values.rounds ?? '1', 10) || 1)
const breakSelectors = values['break-selectors'] === true
const SEARCH_URL = 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000'

/** 故意把字段选择器改坏，但保留卡片容器 —— 模拟「选择器腐烂」的静默失败。 */
const BROKEN: FiftyOneConfig = {
  ...DEFAULT_FIFTYONE_CONFIG,
  selectors: {
    ...DEFAULT_FIFTYONE_CONFIG.selectors,
    title: '.nope-title',
    salary: '.nope-salary',
    company: '.nope-company',
    tracking: '[sensorsname="NopeNever"]',
  },
}

const config = breakSelectors ? BROKEN : DEFAULT_FIFTYONE_CONFIG

const store = openStore({
  ...(values['data-dir'] === undefined ? {} : { dataDir: values['data-dir'] }),
  logger: { info: (message) => console.log(message), warn: (message) => console.warn(message) },
})

const registry = createAdapterRegistry()
registry.register(createFiftyOneAdapter({ config }))

const deps: CrawlDeps = {
  store,
  registry,
  mutex: createMutex(),
  pageSource: fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
  jobs: createJobService(store),
  companies: createCompanyService(store),
  logger: { info: (message) => console.log(message), warn: (message) => console.warn(message) },
}

console.log('─'.repeat(72))
console.log(`离线采集演练 · ${breakSelectors ? '★ 选择器已被故意破坏' : '正常夹具'} · ${String(rounds)} 轮`)
console.log(`数据目录：${store.dataDir}`)
console.log(`夹具：${fixtureHtmlPath()}`)
console.log('─'.repeat(72))

try {
  for (let round = 1; round <= rounds; round += 1) {
    const summary = await runCrawl(deps, { platformId: '51job', criteria: { keyword: 'Java', city: '深圳' } })
    const run = summary.run
    console.log(
      `第 ${String(round)} 轮 → ${run.state.padEnd(7)} 页面 ${String(run.pages)} · ` +
        `命中 ${String(run.found)} · 新增 ${String(run.inserted)} · 更新 ${String(run.updated)} · ` +
        `跳过 ${String(run.skipped)} · 隔离 ${String(run.quarantined)}` +
        (run.errorCode === null ? '' : ` · ${run.errorCode}`),
    )
    if (summary.degraded !== null) {
      console.log(`         ⚠ 降级：${summary.degraded.reasons.join('；')}`)
    }
  }

  const platform = store.platform.get('51job')
  const fields = store.fieldHealth.list('51job')
  const todos = store.todo.listOpen()

  console.log('─'.repeat(72))
  console.log('数据层现状')
  console.log(`  岗位(job)          ${String(store.job.count())}`)
  console.log(`  公司(company)      ${String(store.company.count())}`)
  console.log(`  待修复(pending)    ${String(store.repair.countPending('51job'))}`)
  console.log(`  抓取轮次(crawl_run) ${String(store.crawlRun.count())}`)
  console.log(`  平台健康           ${platform?.health ?? '-'}${platform?.healthReason ? `（${platform.healthReason}）` : ''}`)
  if (fields.length > 0) {
    console.log('  逐字段连续缺失     ' + fields.map((field) => `${field.field}=${String(field.consecutiveMiss)}`).join(' '))
  }
  if (todos.length > 0) {
    console.log('  未关闭待办')
    for (const todo of todos) console.log(`    [${todo.level}] ${todo.kind} · ${todo.title}`)
  }

  const sample = store.job.query({}, 3)
  if (sample.length > 0) {
    console.log('  样本')
    for (const job of sample) {
      console.log(
        `    ${job.title} | ${job.salaryRaw} → ${String(job.salaryMin)}-${String(job.salaryMax)} | ` +
          `${job.city}${job.district} | ${job.companyName ?? '-'}`,
      )
    }
  }

  console.log('─'.repeat(72))
  const dirty = store.job.count() > 0 && breakSelectors
  console.log('P1 出口标准自检：')
  console.log(`  ${store.crawlRun.count() >= rounds ? '✔' : '✘'} 跑通完整采集并留下 crawl_run 记录`)
  console.log(`  ${breakSelectors ? (dirty ? '✘ 脏数据进主表了！' : '✔') : store.job.count() === 20 ? '✔' : '✘'} ${
    breakSelectors ? '破坏选择器时不写脏数据' : '离线解析入库 20 条'
  }`)
  console.log(`  ${todos.some((todo) => todo.kind === 'adapter-degraded') === breakSelectors ? '✔' : '✘'} 降级告警${
    breakSelectors ? '已触发' : '未误触发'
  }`)
  console.log('─'.repeat(72))
} finally {
  store.close()
}
