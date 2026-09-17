import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { openDatabase, resolveDbPath } from '../../src/host/store/db.js'
import { currentVersion, MIGRATIONS } from '../../src/host/store/migrate.js'
import { SCHEMA_V1 } from '../../src/host/store/schema.js'
import { APPLICATION_ID } from '../../src/shared/constants.js'
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
