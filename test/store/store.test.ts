import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { openDatabase, resolveDbPath } from '../../src/host/store/db.js'
import { currentVersion, MIGRATIONS } from '../../src/host/store/migrate.js'
import { SCHEMA_V1 } from '../../src/host/store/schema.js'
import { APPLICATION_ID } from '../../src/shared/config/plugin.js'
import { DomainError } from '../../src/host/util/errors.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T1 = '2026-09-16T01:00:00.000Z'
const T2 = '2026-09-16T02:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: '173674707',
    title: '全栈开发工程师',
    companyId: null,
    salaryRaw: '1.3-1.8万',
    salaryMin: 13000,
    salaryMax: 18000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '5年及以上',
    eduReq: '本科',
    tags: ['react', 'Java'],
    sourceUrl: 'https://jobs.51job.com/all/173674707.html',
    publishedAt: T1,
    ...overrides,
  }
}

test('迁移建库并把 user_version 推到最新', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    assert.equal(currentVersion(store.db), MIGRATIONS.at(-1)?.version)
    assert.equal(store.path, resolveDbPath(dir))
    store.close()
  } finally {
    cleanup(dir)
  }
})

test('重复打开幂等：不再有迁移可应用', () => {
  const dir = tempDataDir()
  try {
    openTestStore(dir).close()
    const reopened = openTestStore(dir)
    assert.deepEqual(reopened.migration.applied, [])
    assert.equal(reopened.migration.from, reopened.migration.to)
    reopened.close()
  } finally {
    cleanup(dir)
  }
})

test('application_id 不符 → 拒绝打开（不误开别人的库）', () => {
  const dir = tempDataDir()
  try {
    mkdirSync(dir, { recursive: true })
    const path = resolveDbPath(dir)

    // 有表、但没有 application_id
    const foreign = new DatabaseSync(path)
    foreign.exec('CREATE TABLE other(id INTEGER PRIMARY KEY)')
    foreign.close()
    assert.throws(
      () => openDatabase(path),
      (error: unknown) => error instanceof DomainError && error.code === 'DATA_UNAVAILABLE',
    )

    // 有表、且 application_id 是别人的
    const other = new DatabaseSync(path)
    other.exec('PRAGMA application_id = 123')
    other.close()
    assert.throws(
      () => openDatabase(path),
      (error: unknown) => error instanceof DomainError && error.code === 'DATA_UNAVAILABLE',
    )
  } finally {
    cleanup(dir)
  }
})

test('全新文件会被认领为本项目的库', () => {
  const dir = tempDataDir()
  try {
    mkdirSync(dir, { recursive: true })
    const path = resolveDbPath(dir)
    const db = openDatabase(path)
    const row = db.prepare('PRAGMA application_id').get() as { application_id?: number }
    assert.equal(row.application_id, APPLICATION_ID)
    assert.equal(currentVersion(db), 0)
    db.close()
  } finally {
    cleanup(dir)
  }
})

test('岗位 upsert 幂等，且不覆盖用户处置态与首次见到时间', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)

    const first = store.job.upsert(jobInput(), T1)
    assert.equal(first.outcome, 'inserted')

    assert.equal(store.job.mark(first.id, 'saved'), true)

    const second = store.job.upsert(jobInput({ title: '全栈开发工程师（改）' }), T2)
    assert.equal(second.outcome, 'updated')
    assert.equal(second.id, first.id)
    assert.equal(store.job.count(), 1)

    const row = store.job.detail(first.id)
    assert.ok(row)
    assert.equal(row.title, '全栈开发工程师（改）')
    assert.equal(row.state, 'saved', '处置态不能被抓取覆盖')
    assert.equal(row.firstSeenAt, T1, '首次见到的时间不能被抓取覆盖')
    assert.equal(row.lastSeenAt, T2)
  } finally {
    cleanup(dir)
  }
})

test('查询强制 LIMIT 且支持筛选与排序', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    for (let index = 0; index < 5; index += 1) {
      store.job.upsert(
        jobInput({
          platformJobId: `p${String(index)}`,
          title: index % 2 === 0 ? 'Java 工程师' : '前端工程师',
          salaryMin: 10000 + index * 1000,
          city: index < 3 ? '深圳' : '杭州',
        }),
        T1,
      )
    }

    assert.equal(store.job.query({}, 2).length, 2, '必须尊重 LIMIT')
    assert.equal(store.job.query({ city: '深圳' }).length, 3)
    assert.equal(store.job.query({ keyword: 'Java' }).length, 3)
    assert.equal(store.job.query({ minSalaryAtLeast: 13000 }).length, 2)

    const desc = store.job.query({ orderBy: 'salary_min', descending: true }, 5)
    assert.equal(desc[0]?.salaryMin, 14000)
    const asc = store.job.query({ orderBy: 'salary_min', descending: false }, 5)
    assert.equal(asc[0]?.salaryMin, 10000)
  } finally {
    cleanup(dir)
  }
})

test('公司按归一化名去重，别名可命中', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const a = store.company.ensure({ name: '北京字节跳动科技有限公司', nameNorm: '字节跳动' }, T1)
    const b = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, T1)
    assert.equal(b.created, false)
    assert.equal(b.id, a.id)
    assert.equal(store.company.count(), 1)

    store.company.addAlias(a.id, '字节跳动科技')
    const hit = store.company.findByAlias('字节跳动科技')
    assert.equal(hit?.id, a.id)
    // 模糊串不该命中
    assert.equal(store.company.findByAlias('字节'), undefined)
  } finally {
    cleanup(dir)
  }
})

test('公司画像重算统计岗位数与技术栈广度', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const company = store.company.ensure({ name: '某某科技', nameNorm: '某某科技' }, T1)
    store.job.upsert(jobInput({ platformJobId: 'a', companyId: company.id, tags: ['java', 'sql'], city: '深圳' }), T1)
    store.job.upsert(jobInput({ platformJobId: 'b', companyId: company.id, tags: ['java', 'vue'], city: '杭州' }), T1)

    const profile = store.company.recomputeProfile(company.id, T2)
    assert.equal(profile.jobCount, 2)
    assert.equal(profile.stackDiversity, 3, 'java / sql / vue 去重后 3 个')
    assert.equal(profile.geoSpread, 2)
  } finally {
    cleanup(dir)
  }
})

test('降级待办用 createOnce 去重，不会被每轮刷屏', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const input = {
      kind: 'adapter-degraded' as const,
      level: 'urgent' as const,
      title: '适配器降级',
      ref: '51job',
    }
    assert.notEqual(store.todo.createOnce(input, T1), null)
    assert.equal(store.todo.createOnce(input, T2), null)
    assert.equal(store.todo.countOpen(), 1)
    assert.equal(store.todo.closeByRef('adapter-degraded', '51job', T2), 1)
    assert.equal(store.todo.countOpen(), 0)
    // 关掉之后可以重新开一条
    assert.notEqual(store.todo.createOnce(input, T2), null)
  } finally {
    cleanup(dir)
  }
})

test('v1 → v2 迁移：老库能升上来，且迁移前留下备份', () => {
  const dir = tempDataDir()
  try {
    mkdirSync(dir, { recursive: true })
    const path = resolveDbPath(dir)

    // 手工造一个「已经用了 P1，还没有 P4 的表」的库
    const legacy = openDatabase(path)
    legacy.exec(SCHEMA_V1)
    legacy.exec('PRAGMA user_version = 1')
    legacy.exec(
      `INSERT INTO job (platform_id, platform_job_id, title, salary_raw, city, district,
        exp_req, edu_req, tags_json, source_url, first_seen_at, last_seen_at, crawled_at, state)
       VALUES ('51job', 'legacy-1', '老岗位', '20-30K', '深圳', '南山区', '', '', '[]',
        'https://example.com/legacy', '${T1}', '${T1}', '${T1}', 'new')`,
    )
    legacy.close()

    const store = openTestStore(dir)
    assert.equal(currentVersion(store.db), MIGRATIONS.at(-1)?.version)
    // 从 v1 升到最新版本：**只应用缺的那些**，已有的版本不重放
    assert.deepEqual(
      store.migration.applied.map((migration) => migration.version),
      MIGRATIONS.filter((migration) => migration.version > 1).map((migration) => migration.version),
      '只应用缺的那些版本，且按顺序',
    )
    assert.ok(store.migration.backupPath !== null, '从已有库迁移必须先备份')
    assert.ok(existsSync(store.migration.backupPath), '备份文件要真的存在')

    // 老数据还在，新表可用
    assert.equal(store.job.count(), 1)
    assert.equal(store.dictionary.count(), 0)
    assert.equal(store.flag.count(), 0)
    assert.equal(store.signal.count(), 0)
    assert.equal(store.dedupGroup.count(), 0)
    // v3 的两张安全表也要在（审计与模型调用留痕）
    assert.equal(store.audit.count(), 0)
    assert.equal(store.llmCall.count(), 0)
    store.close()

    // 再打开一次不再迁移
    const again = openTestStore(dir)
    assert.deepEqual(again.migration.applied, [])
    again.close()
  } finally {
    cleanup(dir)
  }
})

test('字段健康计数：连续缺失累加、命中清零', () => {  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    assert.equal(store.fieldHealth.recordMiss('51job', 'title', T1), 1)
    assert.equal(store.fieldHealth.recordMiss('51job', 'title', T1), 2)
    store.fieldHealth.recordHit('51job', 'title', T1)
    assert.equal(store.fieldHealth.list('51job')[0]?.consecutiveMiss, 0)
    assert.equal(store.fieldHealth.list('51job')[0]?.missTotal, 2)
    assert.equal(store.fieldHealth.list('51job')[0]?.hitTotal, 1)
  } finally {
    cleanup(dir)
  }
})

// ── SR-15（A3）：崩溃安全 —— 悬挂的 running 必须被收敛 ─────────────────

test('SR-15：超过阈值的 running 会被收敛为 failed，并说明原因', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const now = '2026-09-16T12:00:00.000Z'

    // 三小时前开始的一轮（进程被强杀，finish 没机会跑）
    const orphan = store.crawlRun.start({ platformId: '51job', planId: null }, '2026-09-16T09:00:00.000Z')
    // 刚刚开始的一轮（正常在跑）
    const live = store.crawlRun.start({ platformId: '51job', planId: null }, '2026-09-16T11:55:00.000Z')

    assert.equal(store.crawlRun.countRunning(), 2)

    const reaped = store.crawlRun.reapStale(now)
    assert.equal(reaped, 1, '只收敛超过 2 小时的那一条')

    const after = store.crawlRun.get(orphan)
    assert.equal(after?.state, 'failed', '悬挂的 running 必须是终态，不能永远显示"正在跑"')
    assert.equal(after?.errorCode, 'ORPHANED')
    assert.ok((after?.errorMsg ?? '').includes('进程'), '原因要可读，不能只给一个错误码')
    assert.ok(after?.endedAt !== null, '收敛时必须补上结束时刻')

    const stillLive = store.crawlRun.get(live)
    assert.equal(stillLive?.state, 'running', '**还在跑的那一轮绝不能被误判** —— 那会让用户以为数据是坏的')
    assert.equal(store.crawlRun.countRunning(), 1)

    // 幂等：再收敛一次不会重复计数
    assert.equal(store.crawlRun.reapStale(now), 0)
  } finally {
    cleanup(dir)
  }
})

test('SR-15：阈值可注入，边界上的记录不被误收敛', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const start = '2026-09-16T09:00:00.000Z'
    const id = store.crawlRun.start({ platformId: '51job', planId: null }, start)
    // 恰好等于阈值那一刻：不算超时（`<` 而不是 `<=`）
    assert.equal(store.crawlRun.reapStale('2026-09-16T11:00:00.000Z', 2 * 60 * 60 * 1000), 0)
    assert.equal(store.crawlRun.get(id)?.state, 'running')
    // 超过一秒就收敛
    assert.equal(store.crawlRun.reapStale('2026-09-16T11:00:01.000Z', 2 * 60 * 60 * 1000), 1)
    assert.equal(store.crawlRun.get(id)?.state, 'failed')
  } finally {
    cleanup(dir)
  }
})

// ── SR-34（A4）：重抓不得覆盖用户处置态 ────────────────────────────────

test('SR-34：四种处置态在重抓之后**一个都不能变**', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    // saved 那条已在上面覆盖过；这里把 ignored / archived / seen 也钉住 ——
    // "只看 saved 就够了"是错的：用户忽略一个岗位的意图和收藏一样强，
    // 而重抓把它变回 new 会让他以为"我明明忽略过了"。
    for (const state of ['seen', 'saved', 'ignored', 'archived'] as const) {
      const created = store.job.upsert(jobInput({ platformJobId: `state-${state}` }), T1)
      store.job.mark(created.id, state)
    }

    for (const state of ['seen', 'saved', 'ignored', 'archived'] as const) {
      store.job.upsert(
        jobInput({ platformJobId: `state-${state}`, title: `改过标题-${state}`, salaryMin: 9000 }),
        T2,
      )
      const row = store.job.query({ platformId: '51job' }).find((job) => job.platformJobId === `state-${state}`)
      assert.equal(row?.state, state, `${state} 不能被重抓覆盖`)
      assert.equal(row?.title, `改过标题-${state}`, '抓取字段**要**更新')
      assert.equal(row?.salaryMin, 9000, '抓取字段**要**更新')
      assert.equal(row?.firstSeenAt, T1, '首次见到的时间是事实，不能被覆盖')
    }
  } finally {
    cleanup(dir)
  }
})

// ── schema v7：调度字段与运行原因 ─────────────────────────────────────

test('v7：plan 的引擎字段与 crawl_run 的 reason 可写可读', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const at = '2026-09-16T01:00:00.000Z'
    const plan = store.plan.create(
      { name: '引擎测试', platforms: ['51job'], criteria: { keyword: 'Java' } },
      at,
    )
    assert.equal(plan.lastAttemptAt, null)
    assert.equal(plan.lastSuccessAt, null)
    assert.equal(plan.timezone.length > 0, true, 'SR-5：创建时就记下时区快照')
    assert.deepEqual(plan.postProcess, { score: true, flag: true, dedup: true })

    // SR-7：失败只推进 attempt，不推进 success
    store.plan.setEngine(plan.id, { lastAttemptAt: '2026-09-16T02:00:00.000Z', failStreak: 1 })
    let after = store.plan.get(plan.id)
    assert.equal(after?.lastAttemptAt, '2026-09-16T02:00:00.000Z')
    assert.equal(after?.lastSuccessAt, null, '失败绝不能推进 last_success_at —— 那会让新鲜度永远看起来是新鲜的')

    // 成功才推进 success，并清零退避
    store.plan.setEngine(plan.id, {
      lastAttemptAt: '2026-09-16T03:00:00.000Z',
      lastSuccessAt: '2026-09-16T03:00:00.000Z',
      failStreak: 0,
      backoffUntil: null,
    })
    after = store.plan.get(plan.id)
    assert.equal(after?.lastSuccessAt, '2026-09-16T03:00:00.000Z')
    assert.equal(after?.lastRunAt, '2026-09-16T03:00:00.000Z', '兼容字段跟着 success 走')

    // 退避与风控暂停要能**清掉**（清不掉就是永远不退避 → 永远不再试）
    store.plan.setEngine(plan.id, { backoffUntil: '2026-09-16T04:00:00.000Z', failStreak: 2 })
    assert.equal(store.plan.engineState(plan.id).backoffUntil, '2026-09-16T04:00:00.000Z')
    store.plan.setEngine(plan.id, { backoffUntil: null })
    assert.equal(store.plan.engineState(plan.id).backoffUntil, null, '退避必须能被清掉')

    store.plan.setEngine(plan.id, { riskPaused: true, riskReason: '风控' })
    assert.equal(store.plan.engineState(plan.id).riskPaused, true)
    store.plan.setEngine(plan.id, { riskPaused: false, riskReason: null })
    assert.equal(store.plan.engineState(plan.id).riskPaused, false)

    // SR-28/29：触发原因与跳过原因随运行记录落库
    const runId = store.crawlRun.start({ platformId: '51job', planId: plan.id, reason: 'schedule' }, at)
    store.crawlRun.finish(runId, { state: 'aborted', reason: 'schedule', skipReason: 'not_logged_in' }, at)
    const run = store.crawlRun.get(runId)
    assert.equal(run?.reason, 'schedule')
    assert.equal(run?.skipReason, 'not_logged_in')
  } finally {
    cleanup(dir)
  }
})

test('v7 迁移：老库的 last_run_at 被回填成 attempt + success', () => {
  const dir = tempDataDir()
  try {
    // 造一个停在 v6 的库：直接把 v7 之前的迁移跑完，再插一条 plan 行
    const store = openTestStore(dir)
    const at = '2026-09-10T01:00:00.000Z'
    const plan = store.plan.create({ name: '老方案', platforms: ['51job'] }, at)
    // 模拟"老库只有 last_run_at"：直接写底层列，把新列清空
    store.db.prepare('UPDATE plan SET last_run_at = ?, last_attempt_at = NULL, last_success_at = NULL WHERE id = ?')
      .run('2026-09-12T07:00:00.000Z', plan.id)
    const row = store.plan.get(plan.id)
    assert.equal(row?.lastAttemptAt, '2026-09-12T07:00:00.000Z', '回退到 last_run_at，而不是显示"从未跑过"')
    assert.equal(row?.lastSuccessAt, '2026-09-12T07:00:00.000Z')
  } finally {
    cleanup(dir)
  }
})
// ── 空值不覆盖已有的好值（2026-09-21 修）──────────────────────────────
//
// 起因：upsert 的更新分支是覆盖式的，`crawl.ts` 把这一轮解析出的字段直接写进来。
// 某轮平台把城市/经验/薪资掩码成空，上一轮拿到的好值就被**静默写掉**了 ——
// 列表里这条岗位还在，字段却空了，而且没有任何日志会说这件事。

test('upsert：这一轮解析为空 → 保留上一轮的好值（不静默清空）', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const first = store.job.upsert(jobInput(), T1).id

    // 第二轮：平台把薪资掩码了、城市/区/经验/学历都没解析出来、标签也没了
    store.job.upsert(
      jobInput({
        salaryRaw: '',
        salaryMin: null,
        salaryMax: null,
        city: '',
        district: '',
        expReq: '',
        eduReq: '',
        tags: [],
      }),
      T2,
    )

    const job = store.job.detail(first)
    assert.equal(job?.salaryRaw, '1.3-1.8万', '掩码成空的薪资不许写掉明文薪资')
    assert.equal(job?.salaryMin, 13000)
    assert.equal(job?.salaryMax, 18000)
    assert.equal(job?.city, '深圳')
    assert.equal(job?.district, '南山区')
    assert.equal(job?.expReq, '5年及以上')
    assert.equal(job?.eduReq, '本科')
    assert.deepEqual(store.job.detail(first)?.tags, ['react', 'Java'], '标签同样不许被空数组清掉')
    store.close()
  } finally {
    cleanup(dir)
  }
})

test('upsert：这一轮解析出**新值**时照常覆盖（上一条不是"冻结"）', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const id = store.job.upsert(jobInput(), T1).id
    store.job.upsert(
      jobInput({ salaryRaw: '2-3万', salaryMin: 20000, salaryMax: 30000, city: '杭州', tags: ['go'] }),
      T2,
    )
    const job = store.job.detail(id)
    assert.equal(job?.salaryRaw, '2-3万')
    assert.equal(job?.salaryMin, 20000)
    assert.equal(job?.city, '杭州')
    assert.deepEqual(job?.tags, ['go'])
    store.close()
  } finally {
    cleanup(dir)
  }
})

test('upsert：来源链接与标题仍然直接覆盖（必填字段，空值早被断言拦下）', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const id = store.job.upsert(jobInput(), T1).id
    store.job.upsert(
      jobInput({ title: '全栈开发工程师（改）', sourceUrl: 'https://jobs.51job.com/all/173674707.html?v=2' }),
      T2,
    )
    const job = store.job.detail(id)
    assert.equal(job?.title, '全栈开发工程师（改）')
    assert.equal(job?.sourceUrl, 'https://jobs.51job.com/all/173674707.html?v=2')
    store.close()
  } finally {
    cleanup(dir)
  }
})