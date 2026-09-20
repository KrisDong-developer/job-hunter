/**
 * §18 数据清理 + J8 数据可携带性的路由测试。
 *
 * 这一批的价值全在"删除"和"搬家"这两件事上，所以断言的重点不是状态码：
 *
 *   1. **预览必须无副作用**：反复调用预览不许改变任何东西（否则"预览"这个词是假的）；
 *   2. **用户资产不许被清**：投递 / 打招呼 / 消息 / 面试 / 简历与附件既没有保留期配置，
 *      也要在"岗位清理"里被显式排除（外键是 SET NULL，删父行会把它们变成孤儿）；
 *   3. **VACUUM 真的跑了**：删除不等于释放，结果里给的前后文件大小必须可比；
 *   4. **导出能原样读回来**：CSV 的 BOM / 引号 / 字段内换行是三个最容易写错的地方，
 *      用 `csvEncode → csvParse` 往返断言钉住；
 *   5. **导入必须幂等**，且**拒绝**三类会污染岗位库的输入（.xlsx 二进制、非 UTF-8、缺标题行）。
 *
 * 全程离线：不访问任何真实站点，也不开浏览器。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { csvEncode, csvParse, IMPORT_PLATFORM_ID } from '../../src/host/domain/portability.js'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

/** 造一个"很久以前"的时刻（相对真实 now —— 清理按真实时钟判到期）。 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'data-1',
    title: '高级前端工程师',
    companyId: null,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/data-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。',
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: options.sameOrigin ?? true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

async function callBytes(
  runtime: HostRuntime,
  path: string,
  query = '',
): Promise<Extract<RouteResult, { kind: 'bytes' }>> {
  const req: RouteRequest = {
    method: 'GET',
    path,
    query: new URLSearchParams(query),
    headers: {},
    sameOrigin: true,
    readJson: async () => undefined,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'bytes') throw new Error(`期望 bytes 结果，得到 ${result.kind}`)
  return result
}

/** 直接写库造一条"很久以前"的抓取记录（清理的判据就是它的 started_at）。 */
function seedOldCrawlRun(runtime: HostRuntime, days: number): void {
  const store = runtime.store()
  assert.ok(store !== undefined)
  const id = store.crawlRun.start({ platformId: '51job', reason: 'manual' }, daysAgo(days))
  store.crawlRun.finish(id, { state: 'ok', pages: 1, found: 3, reason: 'manual' }, daysAgo(days))
}

// ─────────────────────────────────────────────────────────────────────
// 一、磁盘占用与预览
// ─────────────────────────────────────────────────────────────────────

test('GET /maintenance/storage：真实文件大小 + 按表占用 + 长期保留的类型', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    runtime.jobs()?.upsert(jobInput(), T)
    const result = await call(runtime, 'GET', '/maintenance/storage')
    assert.equal(result.status, 200)
    const body = result.body as {
      db: { bytes: number; walBytes: number }
      tables: Array<{ table: string; bytes: number; rows: number }>
      types: Array<{ id: string; rows: number; auto: boolean; retentionDays: number; note: string }>
      note: string
    }
    assert.ok(body.db.bytes > 0, '库文件一定有大小')
    assert.ok(body.tables.some((table) => table.table === 'job'), '按表要能看到 job')
    assert.ok(body.tables.some((table) => table.table.includes('索引')), '索引单独一栏（否则各表加起来对不上文件大小）')
    assert.ok(body.note.includes('dbstat'), body.note)

    // 长期保留的类型必须**显式列出并标明**：用户问"会不会删我的投递记录"时，
    // 界面要能指着这一屏回答，而不是靠口头保证
    const applications = body.types.find((type) => type.id === 'applications')
    assert.ok(applications !== undefined)
    assert.equal(applications.auto, false)
    assert.equal(applications.retentionDays, 0)
    assert.ok(applications.note.includes('长期保留'))

    // 可清理的类型都在
    for (const id of ['crawlRuns', 'auditLog', 'llmCalls', 'pendingRepair', 'jdText', 'jobs']) {
      assert.ok(body.types.some((type) => type.id === id), `缺少类型 ${id}`)
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 预览是只读的：反复调用不改变任何东西，且到期行数如实', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedOldCrawlRun(runtime, 40) // 默认保留 30 天 → 到期
    seedOldCrawlRun(runtime, 1) // 新的 → 不该被算进去
    const store = runtime.store()
    assert.ok(store !== undefined)

    const first = await call(runtime, 'POST', '/maintenance/cleanup/preview', { body: {} })
    assert.equal(first.status, 200)
    const plan = first.body as {
      items: Array<{ id: string; rows: number; willRun: boolean; reason: string; describe: string }>
      totalRows: number
      dbBytesBefore: number
      dbBytesAfterEstimate: number
      note: string
    }
    const crawlRuns = plan.items.find((item) => item.id === 'crawlRuns')
    assert.equal(crawlRuns?.rows, 1, '只有 40 天前那一条到期')
    assert.equal(crawlRuns?.willRun, true)
    assert.ok((crawlRuns?.reason ?? '').includes('30 天前'), crawlRuns?.reason)
    assert.ok((crawlRuns?.describe ?? '').length > 0)
    assert.ok(plan.note.includes('VACUUM'), '必须说明"删了不会立刻变小"')

    // 再调一次：结果一样，且数据一条没少 —— 这三点合起来才叫"预览无副作用"
    const second = await call(runtime, 'POST', '/maintenance/cleanup/preview', { body: {} })
    const plan2 = second.body as { totalRows: number; items: Array<{ id: string; rows: number }> }
    assert.equal(plan2.totalRows, plan.totalRows)
    assert.equal(store.crawlRun.list(50).length, 2, '预览不许删任何行')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('保留期设为 0（永久）时那一项不执行，但仍出现在预览里', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedOldCrawlRun(runtime, 400)
    await call(runtime, 'PATCH', '/settings', { body: { retention: { crawlRunsDays: 0 } } })
    const result = await call(runtime, 'POST', '/maintenance/cleanup/preview', { body: {} })
    const plan = result.body as { items: Array<{ id: string; rows: number; willRun: boolean; reason: string }> }
    const crawlRuns = plan.items.find((item) => item.id === 'crawlRuns')
    assert.equal(crawlRuns?.willRun, false)
    assert.equal(crawlRuns?.rows, 0)
    assert.ok((crawlRuns?.reason ?? '').includes('永久保留'), '要说明"为什么这一项没清"')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 二、执行清理
// ─────────────────────────────────────────────────────────────────────

test('POST /maintenance/cleanup 不带 confirm → 400，且什么都没删', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedOldCrawlRun(runtime, 40)
    const result = await call(runtime, 'POST', '/maintenance/cleanup', { body: {} })
    assert.equal(result.status, 400)
    assert.ok(((result.body as { hint?: string }).hint ?? '').includes('preview'))
    assert.equal(runtime.store()?.crawlRun.list(50).length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 确认后真的删了、真的 VACUUM 了，且**长期保留的用户资产一条没动**', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobId = runtime.jobs()?.upsert(jobInput(), T).id as number
    // 用户资产：一条 2 年前的投递 + 一条打招呼（都挂在同一个岗位上）
    store.pipeline.createApplication({ jobId, resumeId: null, channel: 'platform', actor: 'gui' }, daysAgo(700))
    store.pipeline.createGreeting(
      { jobId, platformId: '51job', content: '您好', actor: 'gui' },
      daysAgo(700),
    )
    // 另一个"从没被碰过"的老岗位（应当被清）
    const idleJobId = runtime
      .jobs()
      ?.upsert(jobInput({ platformJobId: 'idle-1', sourceUrl: 'https://x/idle-1' }), daysAgo(800)).id as number
    seedOldCrawlRun(runtime, 40)

    const result = await call(runtime, 'POST', '/maintenance/cleanup', {
      body: { confirm: true, only: ['crawlRuns', 'jdText', 'jobs'] },
    })
    assert.equal(result.status, 200)
    const outcome = (result.body as { result: { totalRows: number; vacuumed: boolean; dbBytesBefore: number; dbBytesAfter: number } }).result

    assert.ok(outcome.totalRows > 0)
    assert.equal(outcome.vacuumed, true, '删完必须 VACUUM（R16）')
    assert.ok(outcome.dbBytesAfter <= outcome.dbBytesBefore, 'VACUUM 之后只会更小')

    assert.equal(store.crawlRun.list(50).length, 0, '过期的抓取记录被清掉')
    assert.equal(runtime.jobs()?.detailFull(idleJobId).job.id, idleJobId, '先清 JD 字段，岗位行这一轮不动')
    assert.ok(runtime.jobs()?.detailFull(jobId) !== undefined, '被碰过的岗位绝不删')

    // 用户资产三件套：一条都没少
    assert.equal(store.pipeline.listApplications({ jobId }).length, 1)
    assert.equal(store.pipeline.listGreetings({ jobId }).length, 1)
    assert.ok(store.job.jdText(jobId) !== null, '投过的岗位，JD 也不该被清')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('only 只清指定类别；不认识的 id 直接 400（而不是静默什么都没清）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedOldCrawlRun(runtime, 40)
    const unknown = await call(runtime, 'POST', '/maintenance/cleanup', {
      body: { confirm: true, only: ['nope'] },
    })
    assert.equal(unknown.status, 400)
    assert.equal(runtime.store()?.crawlRun.list(50).length, 1, '报错时不许动数据')

    const only = await call(runtime, 'POST', '/maintenance/cleanup', { body: { confirm: true, only: ['jdText'] } })
    assert.equal(only.status, 200)
    assert.equal(runtime.store()?.crawlRun.list(50).length, 1, '没勾的类别不受影响')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('保留期配置非法值被收敛（负数 / 超大），界面上不会写出一个坏配置', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'PATCH', '/settings', {
      body: { retention: { crawlRunsDays: -5, jobsDays: 999999, autoCleanEnabled: true } },
    })
    assert.equal(result.status, 200)
    const retention = (result.body as { settings: { retention: { crawlRunsDays: number; jobsDays: number; autoCleanEnabled: boolean } } }).settings.retention
    assert.equal(retention.crawlRunsDays, 0, '负数收敛到 0（= 永久保留）')
    assert.equal(retention.jobsDays, 3650, '超大值收敛到上限')
    assert.equal(retention.autoCleanEnabled, true)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 三、导出
// ─────────────────────────────────────────────────────────────────────

test('CSV 编解码往返：BOM、逗号、引号、字段内换行都不许坏', () => {
  const rows = [
    ['高级前端工程师', '某某科技', '25-40K'],
    ['带,逗号', '带"引号"', '带\n换行'],
  ]
  const text = csvEncode(['岗位标题', '公司', '薪资'], rows)
  assert.ok(text.startsWith('\ufeff'), '必须带 BOM（否则中文 Excel 打开乱码）')

  // 表头前的 BOM 要被吃掉，否则第一列的列名会匹配不上
  const parsed = csvParse(text)
  assert.deepEqual(parsed[0], ['岗位标题', '公司', '薪资'])
  assert.deepEqual(parsed[1], rows[0])
  assert.deepEqual(parsed[2], rows[1], '字段内的引号与换行必须原样还原')

  // 末尾空行、单独的 CR、空字段
  assert.deepEqual(csvParse('a,b\r\n1,\r\n'), [['a', 'b'], ['1', '']])
  assert.deepEqual(csvParse('a,b\r1,2'), [['a', 'b'], ['1', '2']])
})

test('GET /data/export：json 全量备份 / csv 与 archive 是 zip / 未知格式 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    runtime.jobs()?.upsert(jobInput(), T)

    const json = await callBytes(runtime, '/data/export', 'format=json')
    assert.equal(json.contentType, 'application/json; charset=utf-8')
    assert.equal(json.disposition, 'attachment')
    assert.ok(json.fileName?.endsWith('.json'))
    const payload = JSON.parse(Buffer.from(json.bytes).toString('utf8')) as {
      meta: { app: string; schemaVersion: number }
      counts: Record<string, number>
      tables: Record<string, unknown[]>
    }
    assert.equal(payload.meta.app, 'dsh-job-hunter')
    assert.ok(payload.meta.schemaVersion > 0)
    assert.equal(payload.counts['job'], 1)
    assert.equal(payload.tables['job']?.length, 1)

    for (const format of ['csv', 'archive']) {
      const zip = await callBytes(runtime, '/data/export', `format=${format}`)
      assert.equal(zip.contentType, 'application/zip')
      assert.ok(zip.fileName?.endsWith('.zip'))
      assert.equal(Buffer.from(zip.bytes).subarray(0, 2).toString('latin1'), 'PK', '必须是合法 zip 开头')
      assert.ok(zip.bytes.byteLength > 100)
    }

    const bad = await call(runtime, 'GET', '/data/export', { query: 'format=xlsx' })
    assert.equal(bad.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('archive 会把简历附件的原文件一起打包', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // 直接往 files/ 放一个"附件"（导出只负责打包，不关心它是怎么生成的）
    mkdirSync(join(dir, 'files', '3'), { recursive: true })
    writeFileSync(join(dir, 'files', '3', 'resume.pdf'), Buffer.from('%PDF-1.4 fake', 'utf8'))
    const result = await callBytes(runtime, '/data/export', 'format=archive')
    const bytes = Buffer.from(result.bytes)
    // zip 的中央目录里有文件名（未压缩存储）：中文/ascii 名字都能直接找
    assert.ok(bytes.includes(Buffer.from('files/3/resume.pdf', 'utf8')), '附件路径应出现在 zip 里')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 四、导入
// ─────────────────────────────────────────────────────────────────────

test('★ CSV 导入：逐行错误如实报出、重复导入只更新（幂等）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const csv = [
      '岗位标题,公司,薪资,城市,来源链接',
      '后端工程师,甲科技,20-30K,深圳,https://x/a',
      '前端工程师,乙科技,25-40K,北京,https://x/b',
      ',丙科技,10-20K,上海,https://x/c',
    ].join('\r\n')

    const first = await call(runtime, 'POST', '/data/import', { body: { format: 'csv', content: csv } })
    assert.equal(first.status, 200)
    const result = (first.body as { result: { received: number; inserted: number; updated: number; skipped: number; errors: Array<{ row: number; message: string }> } }).result
    assert.equal(result.received, 3)
    assert.equal(result.inserted, 2)
    assert.equal(result.skipped, 1)
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0]?.row, 4, '行号要能对应到用户表格里的那一行（含表头）')
    assert.ok((result.errors[0]?.message ?? '').includes('岗位标题'))

    // 幂等：同一份再导一次 → 全部是"更新"，不新增
    const second = await call(runtime, 'POST', '/data/import', { body: { format: 'csv', content: csv } })
    const again = (second.body as { result: { inserted: number; updated: number } }).result
    assert.equal(again.inserted, 0)
    assert.equal(again.updated, 2)

    // 落到「手动导入」这个平台下（界面上要能看出来源，而不是一个裸 id）
    const store = runtime.store()
    assert.ok(store !== undefined)
    assert.equal(store.platform.get(IMPORT_PLATFORM_ID)?.displayName, '手动导入')
    const jobs = store.job.query({ platformId: IMPORT_PLATFORM_ID }, 10, 0)
    assert.equal(jobs.length, 2)
    assert.ok(jobs.every((job) => job.platformName === '手动导入'))
    assert.equal(jobs.find((job) => job.title === '后端工程师')?.salaryMin, 20000, '薪资要按同一份解析器入库')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('带 BOM 的 CSV 也能导（Excel 另存 UTF-8 时几乎一定带 BOM）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const csv = '\ufeff岗位标题,公司\r\n数据分析师,丁科技\r\n'
    const result = await call(runtime, 'POST', '/data/import', { body: { format: 'csv', content: csv } })
    const body = (result.body as { result: { inserted: number; errors: unknown[] } }).result
    assert.equal(body.inserted, 1)
    assert.deepEqual(body.errors, [])
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 三类会污染岗位库的输入要被**明确拒绝**（.xlsx / 非 UTF-8 / 空表）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // ① .xlsx 二进制：明确说不支持，并给出下一步
    const xlsx = await call(runtime, 'POST', '/data/import', {
      body: { format: 'csv', content: `PK\u0003\u0004${'x'.repeat(50)}` },
    })
    assert.equal(xlsx.status, 200, '这是"业务上的拒绝"，不是协议错误')
    const xlsxResult = (xlsx.body as { result: { inserted: number; note: string } }).result
    assert.equal(xlsxResult.inserted, 0)
    assert.ok(xlsxResult.note.includes('CSV UTF-8'), xlsxResult.note)

    // ② 非 UTF-8（出现替换字符）：宁可拒收，也不把乱码写进岗位库
    const gbk = await call(runtime, 'POST', '/data/import', {
      body: { format: 'csv', content: '岗位标题,公司\n\uFFFD\uFFFD\uFFFD,\uFFFD' },
    })
    const gbkResult = (gbk.body as { result: { inserted: number; note: string } }).result
    assert.equal(gbkResult.inserted, 0)
    assert.ok(gbkResult.note.includes('GBK'), gbkResult.note)

    // ③ 表头里没有"岗位标题"列 → 一行都不导
    const noTitle = await call(runtime, 'POST', '/data/import', {
      body: { format: 'csv', content: '公司,薪资\n甲,20K\n' },
    })
    const noTitleResult = (noTitle.body as { result: { inserted: number; note: string } }).result
    assert.equal(noTitleResult.inserted, 0)
    assert.ok(noTitleResult.note.includes('一行都没导入'))

    assert.equal(runtime.store()?.job.count(), 0, '三次拒绝之后岗位库必须还是空的')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('JSON 导入：接受导出的表行（snake_case），也接受裸数组', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const payload = {
      meta: { app: 'dsh-job-hunter' },
      tables: {
        job: [
          { title: '测试工程师', company_name: '戊科技', salary_raw: '15-25K', city: '杭州', source_url: 'https://x/d' },
        ],
      },
    }
    const result = await call(runtime, 'POST', '/data/import', {
      body: { format: 'json', content: JSON.stringify(payload) },
    })
    const body = (result.body as { result: { inserted: number } }).result
    assert.equal(body.inserted, 1)

    const bare = await call(runtime, 'POST', '/data/import', {
      body: { format: 'json', content: JSON.stringify([{ title: '算法工程师', city: '北京' }]) },
    })
    assert.equal((bare.body as { result: { inserted: number } }).result.inserted, 1)
    assert.equal(runtime.store()?.job.count(), 2)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('导入与清理都过同源校验；未注册平台之类的参数错误也可读', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const cross = await call(runtime, 'POST', '/data/import', {
      body: { format: 'csv', content: '岗位标题\nx' },
      sameOrigin: false,
    })
    assert.equal(cross.status, 403)

    const clean = await call(runtime, 'POST', '/maintenance/cleanup', {
      body: { confirm: true },
      sameOrigin: false,
    })
    assert.equal(clean.status, 403)

    const noContent = await call(runtime, 'POST', '/data/import', { body: { format: 'csv', content: '  ' } })
    assert.equal(noContent.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 五、工具面与只读实例
// ─────────────────────────────────────────────────────────────────────

test('data_transfer 工具：导出落盘到 exports/，导入能读回那个文件名', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    runtime.jobs()?.upsert(jobInput(), T)

    const saved = runtime.saveExport('json')
    assert.ok(saved.path.startsWith(join(dir, 'exports')), saved.path)
    assert.ok(existsSync(saved.path))
    assert.ok(saved.entries.some((entry) => entry.name === 'data.json'))
    assert.ok(saved.bytes > 0)

    // 读回来：只认文件名（内容是文本，所以只有 json 能被"读回来"）
    const text = runtime.readExportFile(saved.fileName)
    const payload = JSON.parse(text) as { counts: Record<string, number> }
    assert.equal(payload.counts['job'], 1)

    // csv / archive 是二进制 zip —— 落盘归落盘，读回只支持文本
    const csv = runtime.saveExport('csv')
    assert.ok(existsSync(csv.path))
    assert.ok(csv.entries.some((entry) => entry.name === 'csv/jobs.csv'))

    // 路径穿越要被拒（与 system/reveal 同一条纪律）
    assert.throws(() => runtime.readExportFile('../data.db'))
    assert.throws(() => runtime.readExportFile('sub/dir.csv'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('只读实例（另一个进程持有租约）不许清理、不许导入，但**可以导出**', async () => {
  const dir = tempDataDir()
  mkdirSync(dir, { recursive: true })
  // 造一个"另一个实例刚心跳过"的租约。
  // ⚠️ 必须在建 runtime **之前**写它：租约判据是 pid + 心跳新鲜度，
  // 而同一进程里两个 runtime 的 pid 相同 —— 那样两边都会认为租约是自己的。
  const now = new Date().toISOString()
  writeFileSync(
    join(dir, 'lease.json'),
    JSON.stringify({ pid: 999_999, label: '另一个窗口', startedAt: now, heartbeatAt: now }),
  )
  const reader = createHostRuntime({ dataDir: dir })
  await reader.ready()
  try {
    assert.equal(reader.schedulerStatus().lease.held, false, '本实例应当只读')

    const cleanupResult = await call(reader, 'POST', '/maintenance/cleanup', { body: { confirm: true } })
    assert.equal(cleanupResult.status, 409)
    assert.equal((cleanupResult.body as { code: string }).code, 'CONFLICT')

    const importResult = await call(reader, 'POST', '/data/import', {
      body: { format: 'csv', content: '岗位标题\nx' },
    })
    assert.equal(importResult.status, 409)

    // 导出是只读的：备份数据不该被租约挡住（"另一个窗口开着就不能备份"没有道理）
    const exported = await callBytes(reader, '/data/export', 'format=json')
    const payload = JSON.parse(Buffer.from(exported.bytes).toString('utf8')) as { meta: { app: string } }
    assert.equal(payload.meta.app, 'dsh-job-hunter')
  } finally {
    reader.close()
    cleanup(dir)
  }
})

test('持有者心跳过期后：只读实例的下一次操作自动接管（不再需要手动「重新检测」）', async () => {
  const dir = tempDataDir()
  mkdirSync(dir, { recursive: true })
  // 阶段一：对方**活着**（心跳新鲜）→ 本实例只读（复现 2026-09-20 的双宿主竞速）。
  const now = new Date().toISOString()
  const leasePath = join(dir, 'lease.json')
  writeFileSync(
    leasePath,
    JSON.stringify({ pid: 999_999, label: '另一个窗口', startedAt: now, heartbeatAt: now }),
  )
  const reader = createHostRuntime({ dataDir: dir })
  await reader.ready()
  try {
    assert.equal(reader.schedulerStatus().lease.held, false, '阶段一：本实例应当只读')
    const blocked = await call(reader, 'POST', '/maintenance/cleanup', { body: { confirm: true } })
    assert.equal(blocked.status, 409, '对方活着时必须仍被 CONFLICT 挡住（不许抢活人的锁）')

    // 阶段二：对方**死了**（心跳停在 5 分钟前）。此时用户的下一次操作应内联接管，
    // 而不是抛 CONFLICT 等用户去点「重新检测」—— 这正是 ensureLease 补的那一环。
    const dead = new Date(Date.now() - 5 * 60_000).toISOString()
    writeFileSync(
      leasePath,
      JSON.stringify({ pid: 999_999, label: '另一个窗口', startedAt: now, heartbeatAt: dead }),
    )
    const takenOver = await call(reader, 'POST', '/maintenance/cleanup', { body: { confirm: true } })
    assert.equal(takenOver.status, 200, '持有者已死：同一次操作里接管并继续执行')
    assert.equal(reader.schedulerStatus().lease.held, true, '接管后本实例持有租约')
  } finally {
    reader.close()
    cleanup(dir)
  }
})

test('导出的 JSON 能被原样读回（自洽性：搬走再搬回来不丢字段）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const jobId = runtime.jobs()?.upsert(jobInput(), T).id as number
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.pipeline.createGreeting({ jobId, platformId: '51job', content: '您好，看到您的岗位', actor: 'gui' }, T)

    const exported = await callBytes(runtime, '/data/export', 'format=json')
    const payload = JSON.parse(Buffer.from(exported.bytes).toString('utf8')) as {
      tables: { greeting: Array<{ content: string; job_id: number }> }
    }
    assert.equal(payload.tables.greeting[0]?.content, '您好，看到您的岗位')
    assert.equal(payload.tables.greeting[0]?.job_id, jobId)

    // 写进一个临时文件再读回来，确认字节里没有奇怪的东西（例如未转义的换行）
    const path = join(dir, 'roundtrip.json')
    writeFileSync(path, Buffer.from(exported.bytes))
    const reread = JSON.parse(readFileSync(path, 'utf8')) as { counts: Record<string, number> }
    assert.equal(reread.counts['greeting'], 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
