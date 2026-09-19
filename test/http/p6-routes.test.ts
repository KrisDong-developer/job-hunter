/**
 * P6 简历路由测试（§4.7 / §17 / §4.1）。
 *
 * 直接驱动 `routeRequest`，不造假 req/res —— 路由层与传输层解耦就是为了这个。
 * 覆盖三块：
 *   1. 简历 CRUD / 附件下载 / 预览 / 定制的**协议契约**（状态码、形状、contentType）；
 *   2. **迁移 v4**：老库能升上来、`job` 多出算分版本两列、三张新表就位、重开不再迁移；
 *   3. **§4.1 分数失效**：简历一改，之前算过的分必须被判定为过期。
 *
 * 本文件不发任何网络请求：导出只走 docx / html（不需要 headless Chromium）。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { test } from 'node:test'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { openDatabase, resolveDbPath } from '../../src/host/store/db.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { currentVersion, MIGRATIONS } from '../../src/host/store/migrate.js'
import { SCHEMA_V1 } from '../../src/host/store/schema.js'
import type { ResumeContent } from '../../src/shared/domain/resume-content.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
/** 迁移测试里的"老数据"时间戳。 */
const T_LEGACY = '2026-09-16T01:00:00.000Z'

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// ─────────────────────────────────────────────────────────────────────
// 夹具与驱动
// ─────────────────────────────────────────────────────────────────────

function resumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    basics: {
      name: '张三',
      title: '后端开发',
      phone: '13800001111',
      email: 'zhangsan@example.com',
      city: '杭州',
      years: 5,
    },
    summary: '五年后端经验，做过订单与支付系统。',
    skills: [
      { name: 'Java', level: '精通', years: 5, evidence: '订单中台' },
      { name: 'MySQL', level: '熟练', years: 5, evidence: '支付对账' },
    ],
    experiences: [
      {
        company: '杭州云启科技有限公司',
        title: '高级后端工程师',
        start: '2021-07',
        end: '2024-06',
        city: '杭州',
        highlights: ['把订单接口 P99 从 800ms 压到 120ms', '负责支付对账，日处理 200 万笔'],
        stack: ['Java', 'MySQL'],
      },
    ],
    projects: [
      { name: '订单中台', role: '核心开发', highlights: ['拆分订单状态机，线上事故下降 60%'], stack: ['Java'] },
    ],
    education: [{ school: '浙江大学', major: '软件工程', degree: '本科', start: '2015-09', end: '2019-06' }],
    extras: [{ label: '语言', text: '英语 CET-6' }],
    ...overrides,
  }
}

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p6-1',
    title: 'Java 后端开发',
    companyId: null,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '杭州',
    district: '西湖区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['mysql'],
    sourceUrl: 'https://jobs.51job.com/all/p6-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责订单系统。任职要求：熟悉 MySQL。',
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function route(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<RouteResult> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: options.sameOrigin ?? true,
    readJson: async () => options.body,
  }
  return await routeRequest(runtime, req)
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const result = await route(runtime, method, path, options)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

/** 建一份能通过体检的简历，返回它的 id。 */
async function createResume(runtime: HostRuntime, name = 'Java 后端 · 2026 春'): Promise<number> {
  const result = await call(runtime, 'POST', '/resumes', { body: { name, content: resumeContent() } })
  assert.equal(result.status, 201)
  return (result.body as { resume: { id: number } }).resume.id
}

// ─────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────

test('POST /resumes 建档 → GET 列表 → GET 详情带体检结果', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const created = await call(runtime, 'POST', '/resumes', {
      body: { name: 'Java 后端 · 2026 春', content: resumeContent() },
    })
    assert.equal(created.status, 201)
    const body = created.body as {
      ok: boolean
      resume: { id: number; name: string; rev: number; isDefault: boolean; issues?: unknown }
    }
    assert.equal(body.ok, true)
    assert.equal(body.resume.name, 'Java 后端 · 2026 春')
    assert.equal(body.resume.rev, 1)
    assert.equal(body.resume.isDefault, true, '第一份自动启用')

    const listed = await call(runtime, 'GET', '/resumes')
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: Array<{ id: number; issues: number; counts: { skills: number } }> })
      .items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.id, body.resume.id)
    assert.equal(items[0]?.counts.skills, 2)

    const detail = await call(runtime, 'GET', `/resumes/${String(body.resume.id)}`)
    assert.equal(detail.status, 200)
    const one = detail.body as { id: number; issues: Array<{ level: string }>; content: ResumeContent }
    assert.equal(one.id, body.resume.id)
    assert.deepEqual(one.issues, [], '这份简历填得全，不该有体检问题')
    assert.equal(one.content.basics.name, '张三')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('PATCH /resumes/:id：只改名字不动 rev，改内容才加 rev', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = await createResume(runtime)

    const renamed = await call(runtime, 'PATCH', `/resumes/${String(id)}`, {
      body: { name: 'Java 后端 · 秋招' },
    })
    assert.equal(renamed.status, 200)
    const afterRename = (renamed.body as { resume: { name: string; rev: number; content: ResumeContent } }).resume
    assert.equal(afterRename.name, 'Java 后端 · 秋招')
    assert.equal(afterRename.rev, 1, '改名不该让匹配分失效')

    const edited = await call(runtime, 'PATCH', `/resumes/${String(id)}`, {
      body: { content: { ...resumeContent(), summary: '改过的简介。' } },
    })
    assert.equal(edited.status, 200)
    const afterEdit = (edited.body as { resume: { rev: number; content: ResumeContent } }).resume
    assert.equal(afterEdit.rev, 2, '内容变了 rev 必须往前走')
    assert.equal(afterEdit.content.summary, '改过的简介。')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /resumes/:id/duplicate 与 /default', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const first = await createResume(runtime, 'Java 后端')

    const duplicated = await call(runtime, 'POST', `/resumes/${String(first)}/duplicate`, {
      body: { name: 'Java 后端 · 副本' },
    })
    assert.equal(duplicated.status, 201)
    const copy = (duplicated.body as { resume: { id: number; isDefault: boolean; content: ResumeContent } }).resume
    assert.equal(copy.isDefault, false, '副本不该抢走启用位')

    const made = await call(runtime, 'POST', `/resumes/${String(copy.id)}/default`)
    assert.equal(made.status, 200)
    assert.equal((made.body as { resume: { isDefault: boolean } }).resume.isDefault, true)

    const both = (await call(runtime, 'GET', '/resumes')).body as { items: Array<{ id: number; isDefault: boolean }> }
    assert.equal(both.items.filter((item) => item.isDefault).length, 1, '启用位同时只能有一个')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 附件与预览
// ─────────────────────────────────────────────────────────────────────

test('POST /resumes/:id/export 出 docx，GET /files/:id 能以正确的类型下回来', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = await createResume(runtime)

    const exported = await call(runtime, 'POST', `/resumes/${String(id)}/export`, {
      body: { format: 'docx' },
    })
    assert.equal(exported.status, 200)
    const file = (exported.body as { file: { id: number; format: string; fileName: string; bytes: number } }).file
    assert.equal(file.format, 'docx')
    assert.equal(file.fileName, '张三-后端开发-5年.docx')
    assert.ok(file.bytes > 1000, `导出的 docx 太小了（${String(file.bytes)} 字节）`)

    const download = await route(runtime, 'GET', `/files/${String(file.id)}`)
    assert.equal(download.kind, 'bytes')
    if (download.kind !== 'bytes') throw new Error('附件下载必须是二进制响应')
    assert.equal(download.status, 200)
    assert.equal(download.contentType, DOCX_CONTENT_TYPE)
    assert.equal(download.disposition, 'attachment', 'docx 浏览器看不了，交给系统打开')
    assert.deepEqual([...download.bytes.subarray(0, 2)], [0x50, 0x4b], 'docx 是一个 ZIP')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /resumes/:id/preview 直接吐出 HTML', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = await createResume(runtime)
    const preview = await route(runtime, 'GET', `/resumes/${String(id)}/preview`)
    assert.equal(preview.kind, 'bytes')
    if (preview.kind !== 'bytes') throw new Error('预览必须是二进制响应')
    assert.equal(preview.status, 200)
    assert.ok(preview.contentType.startsWith('text/html'), `contentType 不对：${preview.contentType}`)
    assert.equal(preview.disposition, 'inline', '预览要能直接在标签页里看')
    assert.ok(new TextDecoder().decode(preview.bytes).includes('张三'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 定制
// ─────────────────────────────────────────────────────────────────────

test('POST /resume/tailor：真岗位走规则定制，假岗位 404，非数字 jobId 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    await createResume(runtime)
    const jobId = store.job.upsert(jobInput(), T).id

    const tailored = await call(runtime, 'POST', '/resume/tailor', { body: { jobId } })
    assert.equal(tailored.status, 200)
    const tailoring = (tailored.body as { tailoring: { id: number; via: string; jobId: number; content: ResumeContent } })
      .tailoring
    assert.equal(tailoring.via, 'rule', '没配模型时如实标注是规则结果')
    assert.equal(tailoring.jobId, jobId)
    assert.equal(tailoring.content.basics.title, 'Java 后端开发', '定制结果要瞄准这个岗位')

    const missing = await call(runtime, 'POST', '/resume/tailor', { body: { jobId: 999_999 } })
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'NOT_FOUND')

    for (const bogus of ['abc', 0, -1, null]) {
      const bad = await call(runtime, 'POST', '/resume/tailor', { body: { jobId: bogus } })
      assert.equal(bad.status, 400, `jobId=${String(bogus)} 应当被判为非法输入`)
      assert.equal((bad.body as { code: string }).code, 'INVALID_INPUT')
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /tailorings?jobId= 与 POST /tailorings/:id/adopt', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    await createResume(runtime)
    const jobA = store.job.upsert(jobInput({ platformJobId: 'p6-a' }), T).id
    const jobB = store.job.upsert(jobInput({ platformJobId: 'p6-b' }), T).id
    await call(runtime, 'POST', '/resume/tailor', { body: { jobId: jobA } })
    await call(runtime, 'POST', '/resume/tailor', { body: { jobId: jobB } })

    const listed = await call(runtime, 'GET', '/tailorings', { query: `jobId=${String(jobA)}` })
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: Array<{ id: number; jobId: number; adopted: boolean }> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.jobId, jobA)
    assert.equal(items[0]?.adopted, false)

    const adopted = await call(runtime, 'POST', `/tailorings/${String(items[0]?.id ?? 0)}/adopt`, {
      body: { adopted: true },
    })
    assert.equal(adopted.status, 200)
    assert.equal((adopted.body as { tailoring: { adopted: boolean } }).tailoring.adopted, true)

    const after = await call(runtime, 'GET', '/tailorings', { query: `jobId=${String(jobA)}` })
    assert.equal((after.body as { items: Array<{ adopted: boolean }> }).items[0]?.adopted, true)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 边界
// ─────────────────────────────────────────────────────────────────────

test('跨站 POST /resumes 被拒（C4：宿主对我们的路由不提供任何鉴权）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'POST', '/resumes', {
      body: { name: '偷偷建的', content: resumeContent() },
      sameOrigin: false,
    })
    assert.equal(result.status, 403)
    assert.equal((result.body as { code: string }).code, 'CROSS_ORIGIN')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('数据层没就绪时 POST /resumes 给出可读的 DATA_UNAVAILABLE', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    const result = await call(runtime, 'POST', '/resumes', { body: { name: 'x', content: {} } })
    assert.equal(result.status, 503)
    assert.equal((result.body as { code: string }).code, 'DATA_UNAVAILABLE')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 迁移 v4（§4.1 启动引导与迁移安全）
// ─────────────────────────────────────────────────────────────────────

test('迁移 v4：老库升上来，job 多出算分版本两列，三张新表就位', () => {
  const dir = tempDataDir()
  try {
    // 不写死版本号：这个断言一加阶段就要改，而它想表达的其实是"v4 已经被纳入迁移链"。
    // 写死会让加 v5 时的失败看起来像 v4 坏了。
    assert.ok(
      (MIGRATIONS.at(-1)?.version ?? 0) >= 4,
      `当前最高版本应当 >= 4，实际 ${String(MIGRATIONS.at(-1)?.version)}`,
    )
    assert.ok(
      MIGRATIONS.some((migration) => migration.version === 4),
      'v4 必须在迁移链里',
    )

    mkdirSync(dir, { recursive: true })
    const path = resolveDbPath(dir)

    // 手工造一个「已经用了 P1，还没有 P6 的表」的库
    const legacy = openDatabase(path)
    legacy.exec(SCHEMA_V1)
    legacy.exec('PRAGMA user_version = 1')
    legacy.exec(
      `INSERT INTO job (platform_id, platform_job_id, title, salary_raw, city, district,
        exp_req, edu_req, tags_json, source_url, first_seen_at, last_seen_at, crawled_at, state)
       VALUES ('51job', 'legacy-1', '老岗位', '20-30K', '深圳', '南山区', '', '', '[]',
        'https://example.com/legacy', '${T_LEGACY}', '${T_LEGACY}', '${T_LEGACY}', 'new')`,
    )
    legacy.close()

    const store = openTestStore(dir)
    try {
      assert.equal(currentVersion(store.db), MIGRATIONS.at(-1)?.version, '升到当前最高版本')
      assert.deepEqual(
        store.migration.applied.map((migration) => migration.version),
        MIGRATIONS.filter((migration) => migration.version > 1).map((migration) => migration.version),
        '只应用缺的那些版本，且按顺序',
      )
      assert.ok(store.migration.backupPath !== null, '从已有库迁移必须先备份')
      assert.ok(existsSync(store.migration.backupPath), '备份文件要真的存在')

      // §4.1：算分时用的是哪一版简历，必须跟着分数一起存
      const columns = (store.db.prepare('PRAGMA table_info(job)').all() as Array<{ name: string }>).map(
        (column) => column.name,
      )
      assert.ok(columns.includes('score_rev'), 'job 缺 score_rev 列')
      assert.ok(columns.includes('score_resume_id'), 'job 缺 score_resume_id 列')

      const tables = (
        store.db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name)
      for (const table of ['resume', 'resume_file', 'tailoring']) {
        assert.ok(tables.includes(table), `缺少新表：${table}`)
      }

      // 新表是空的，老数据一条不少
      assert.equal(store.resume.count(), 0)
      assert.equal(store.tailoring.list({}).length, 0)
      const fileCount = store.db.prepare('SELECT count(*) AS n FROM resume_file').get() as { n: number }
      assert.equal(fileCount.n, 0)
      assert.equal(store.job.count(), 1, '迁移不能弄丢老数据')
    } finally {
      store.close()
    }

    // 再打开一次不再迁移
    const again = openTestStore(dir)
    try {
      assert.deepEqual(again.migration.applied, [])
      assert.equal(currentVersion(again.db), MIGRATIONS.at(-1)?.version, '重开时不再迁移，版本保持最高')
    } finally {
      again.close()
    }
  } finally {
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// §4.1 分数过期
// ─────────────────────────────────────────────────────────────────────

test('简历内容一改，之前算过的分立刻被判为过期（§4.1）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobs = runtime.jobs()
    assert.ok(jobs !== undefined)

    const resumeId = await createResume(runtime)
    const jobId = store.job.upsert(jobInput(), T).id

    runtime.intel().evaluateJob(jobId, T)
    const fresh = jobs.detail(jobId)
    assert.equal(fresh.scoreStale, false, '刚算完的分不该是过期的')
    assert.equal(fresh.scoreRev, 1)
    assert.equal(fresh.scoreResumeId, resumeId, '分数要记住是哪一版简历算的')

    const patched = await call(runtime, 'PATCH', `/resumes/${String(resumeId)}`, {
      body: { content: { ...resumeContent(), summary: '改过的简介。' } },
    })
    assert.equal((patched.body as { resume: { rev: number } }).resume.rev, 2)

    const stale = jobs.detail(jobId)
    assert.equal(stale.scoreStale, true, '简历改了，旧分数必须被判定为过期，而不是继续自信地展示')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('简历参与匹配偏好：简历优先于搜索方案，并让"无简历"时算的分作废', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobs = runtime.jobs()
    assert.ok(jobs !== undefined)

    const jobId = store.job.upsert(
      jobInput({ title: '高级前端工程师', tags: ['react'], city: '杭州', jdText: '任职要求：熟悉 React。' }),
      T,
    ).id

    // ① 还没有简历：偏好只能来自搜索方案（首装自带一个默认方案），与这份简历无关
    const before = runtime.intel().evaluateJob(jobId, T)
    assert.ok(before !== null)
    const planProfile = runtime.intel().matchProfile()
    assert.equal(planProfile.cities.includes('杭州'), false, '没有简历时，城市偏好不可能来自简历')
    assert.equal(planProfile.keywords.includes('React'), false)
    assert.equal(jobs.detail(jobId).scoreStale, false)

    // ② 有了简历：简历是比搜索方案更靠前的偏好来源（§4.5.1）
    await call(runtime, 'POST', '/resumes', {
      body: {
        name: '前端方向',
        content: resumeContent({
          basics: { name: '张三', title: '前端开发', city: '杭州', years: 3 },
          skills: [{ name: 'React', level: '熟练', years: 3, evidence: '订单中台' }],
        }),
      },
    })

    const profile = runtime.intel().matchProfile()
    assert.deepEqual(profile.cities, ['杭州'], '简历里的城市要盖过搜索方案')
    assert.ok(profile.keywords.includes('React'), '简历里的技能要成为匹配关键词')
    assert.equal(
      jobs.detail(jobId).scoreStale,
      true,
      '有了简历之后，之前按搜索方案算出来的分必须作废',
    )

    // ③ 重算：命中简历里的技能与城市，分数与理由都要反映出来
    const after = runtime.intel().evaluateJob(jobId, T)
    assert.ok(after !== null)
    assert.ok(
      after.match.score > before.match.score,
      `命中简历技能后分数应当更高：${String(before.match.score)} → ${String(after.match.score)}`,
    )
    assert.ok(
      after.match.reasons.some((reason) => reason.kind === 'hit' && reason.text.includes('React')),
      `理由要能回答"凭什么"：${after.match.reasons.map((reason) => reason.text).join('／')}`,
    )
    assert.ok(after.match.reasons.some((reason) => reason.kind === 'hit' && reason.text.includes('杭州')))
    assert.equal(jobs.detail(jobId).scoreStale, false, '刚重算完的分不该是过期的')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
