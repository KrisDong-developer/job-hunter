/**
 * 岗位库（jobs 域）的路由：列表 / 筛选器取值集 / 批量标记 / 单岗位详情与标注。
 *
 * **顺序敏感**：`GET /jobs/facets` 与 `POST /jobs/batch/mark` 是**字面路径**，
 * 必须排在 `/:id`（下面的 `detail`）**之前** —— 否则 `facets` / `batch` 会被当成岗位 id 解析。
 * 下面两个私有解析器（`buildJobQuery` / `parseState`）与常量 `ORDER_BY_VALUES` 只服务本域，不外传。
 */
import { dataNotReady } from '../../runtime/contract.js'
import { MAX_JOB_EXPORT_IDS, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/config/limits.js'
import type { JobDto, JobPageDto } from '../../../shared/contract/dto/job.js'
import { JOB_FLAG_TYPES, JOB_ORDER_VALUES, JOB_STATES, JOB_STATE_LABEL } from '../../../shared/contract/enums/job.js'
import type { JobFlagType, JobOrderValue, JobState } from '../../../shared/contract/enums/job.js'
import { formatLocalDateTime } from '../../../shared/text/time-format.js'
import { csvEncode } from '../../domain/portability.js'
import { DomainError } from '../../util/errors.js'
import type { JobQuery } from '../../store/repo/jobs.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

function parseState(raw: string | null): JobState | undefined {
  if (raw === null || raw === '') return undefined
  if (!JOB_STATES.includes(raw as JobState)) {
    throw new DomainError('INVALID_INPUT', `非法岗位状态：${raw}`, {
      hint: `合法取值：${JOB_STATES.join(' / ')}`,
    })
  }
  return raw as JobState
}

function buildJobQuery(query: URLSearchParams): JobQuery {
  const state = parseState(query.get('state'))
  const orderByRaw = query.get('orderBy')
  if (orderByRaw !== null && orderByRaw !== '' && !JOB_ORDER_VALUES.includes(orderByRaw as never)) {
    throw new DomainError('INVALID_INPUT', `非法排序字段：${orderByRaw}`, {
      hint: `合法取值：${JOB_ORDER_VALUES.join(' / ')}`,
    })
  }

  const minSalaryRaw = query.get('minSalary')
  const minSalary = minSalaryRaw === null || minSalaryRaw === '' ? undefined : Number.parseInt(minSalaryRaw, 10)

  // 匹配分门槛（第五轮，批次 A）：0–100 的整数。
  // 与 `firstSeenSince` 同样的纪律：非法值**显式报错**而不是当没传 ——
  // 静默忽略会让用户对着"看起来筛了、其实没筛"的列表做判断。
  const minScoreRaw = query.get('minScore')
  const minScore = minScoreRaw === null || minScoreRaw === '' ? undefined : Number.parseInt(minScoreRaw, 10)
  if (minScore !== undefined && (!Number.isInteger(minScore) || minScore < 0 || minScore > 100)) {
    throw new DomainError('INVALID_INPUT', `匹配分门槛必须是 0–100 的整数：${minScoreRaw ?? ''}`, {
      hint: '匹配分是 L1 规则粗筛分，取值 0–100；不传 = 不限。',
    })
  }

  // 「只看新增」：`firstSeenSince` 是界面按时间窗算出来的 ISO 时刻。
  // 非法值**显式报错**而不是当没传 —— 静默忽略会让用户对着"看起来筛了、其实没筛"的
  // 列表做判断（和 SR-42 对筛选键的处理同一个理由）。
  const firstSeenSinceRaw = query.get('firstSeenSince')
  const firstSeenSince = firstSeenSinceRaw === null ? '' : firstSeenSinceRaw.trim()
  if (firstSeenSince !== '' && Number.isNaN(new Date(firstSeenSince).getTime())) {
    throw new DomainError('INVALID_INPUT', `首次见到时间不是合法时刻：${firstSeenSince}`, {
      hint: '传 ISO 时刻（如 2026-09-17T09:00:00.000Z）—— 界面的「只看新增」会自己算好。',
    })
  }

  // 多城市：逗号分隔（如 `cities=深圳,北京`）；空则不带。
  const cities = (query.get('cities') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  // 经验 / 学历：同样是逗号分隔多选，取值是平台原始串（不做枚举校验 —— 校验会
  // 把"库里真实存在但我不认识"的写法筛掉，而那恰恰是用户想筛的那一类）。
  const expReqs = (query.get('expReqs') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  const eduReqs = (query.get('eduReqs') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  // 屏蔽标注类型：逗号分隔，只认合法的 JOB_FLAG_TYPES，非法项静默丢弃
  // （非法值不该让整个列表查询崩掉 —— 它是界面拼出来的补充参数）。
  const excludeFlags = (query.get('excludeFlags') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is JobFlagType => (JOB_FLAG_TYPES as readonly string[]).includes(item))
  // 只看某一家公司的岗位（公司维度的「查看岗位」跳转用）。
  // 查询层一直支持（`JobQuery.companyId` 走 `j.company_id = ?` 精确匹配），
  // 这里只做透传；非法数字按"没传"处理 —— 它是跳转参数，不该把列表查询打挂。
  const companyIdRaw = query.get('companyId')
  const companyId = companyIdRaw === null || companyIdRaw === '' ? undefined : Number.parseInt(companyIdRaw, 10)

  return {
    ...(state === undefined ? {} : { state }),
    ...(companyId !== undefined && Number.isFinite(companyId) ? { companyId } : {}),
    ...(cities.length > 0 ? { cities } : query.get('city') === null || query.get('city') === '' ? {} : { city: query.get('city') as string }),
    ...(query.get('q') === null || query.get('q') === '' ? {} : { keyword: query.get('q') as string }),
    ...(query.get('platformId') === null || query.get('platformId') === ''
      ? {}
      : { platformId: query.get('platformId') as string }),
    ...(minSalary === undefined || !Number.isFinite(minSalary) ? {} : { minSalaryAtLeast: minSalary }),
    ...(minScore === undefined ? {} : { minMatchScore: minScore }),
    // 排除已拉黑公司（第五轮，批次 B）：**只在显式传 1 时生效**。
    // 默认不过滤是刻意的 —— 拉黑是人工标记，静默隐藏数据比不隐藏更危险；
    // 界面默认勾选这一项，并在头栏写明因此隐藏了几条。
    ...(query.get('excludeBlacklisted') === '1' ? { excludeBlacklistedCompanies: true } : {}),
    // 「只看新增」：只留首次见到时间 ≥ 该时刻的岗位（口径与首屏「今日新增」一致）
    ...(firstSeenSince === '' ? {} : { firstSeenSince }),
    ...(expReqs.length > 0 ? { expReqs } : {}),
    ...(eduReqs.length > 0 ? { eduReqs } : {}),
    ...(orderByRaw === null || orderByRaw === ''
      ? {}
      : { orderBy: orderByRaw as JobOrderValue }),
    ...(excludeFlags.length > 0 ? { excludeFlagTypes: excludeFlags } : {}),
    // 批次 4：按跨平台去重分组折叠（界面上的「跨平台折叠」开关）
    ...(query.get('groupDuplicates') === '1' ? { groupDuplicates: true } : {}),
    ...(query.get('desc') === null ? {} : { descending: query.get('desc') !== '0' && query.get('desc') !== 'false' }),
  }
}

// ── GET /jobs ──────────────────────────────────────────────────────
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'jobs')) {
    return undefined
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  const page = parsePositiveInt(req.query.get('page'), 1, 1, 10_000)
  const pageSize = parsePositiveInt(req.query.get('pageSize'), PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX)
  const filters = buildJobQuery(req.query)
  const items = jobService.query(filters, pageSize, (page - 1) * pageSize)
  const total = jobService.countMatching(filters)
  const body: JobPageDto = {
    items,
    // 全库"没打开过"的条数（**不带**当前筛选）：它是"要不要现在去扫一遍"的依据，
    // 跟着筛选变就答非所问了（见 DTO 里的说明）。
    unread: jobService.countMatching({ state: 'new' }),
    page,
    pageSize,
    total,
    hasMore: (page - 1) * pageSize + items.length < total,
    // 因为「排除已拉黑公司」被隐藏了几条（批次 B）：把同条件去掉黑名单再数一次，
    // 差额就是答案。只在这个筛选真的开着时才算 —— 否则白付一次 count。
    ...(filters.excludeBlacklistedCompanies === true
      ? { hiddenByBlacklist: jobService.countMatching({ ...filters, excludeBlacklistedCompanies: false }) - total }
      : {}),
  }
  return json(200, body)
}

// ── GET /jobs/facets：筛选器的取值集（城市 / 经验 / 学历）─────────────
// 放在 `/jobs/:id` 之前：`facets` 是字面路径，不能让它被当成岗位 id 解析。
export async function facets(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'facets')) {
    return undefined
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)
  return json(200, jobService.facets())
}

// ── POST /jobs/batch/mark：批量标记（同一状态应用到多个岗位）─────────
export async function batchMark(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(segments.length === 3 && segments[0] === 'jobs' && segments[1] === 'batch' && segments[2] === 'mark')) {
    return undefined
  }
  if (method !== 'POST') throw new DomainError('INVALID_INPUT', '批量标记只支持 POST')
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)
  const body = await readObject(req)
  const ids = Array.isArray(body['ids'])
    ? body['ids'].filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)
    : []
  const state = body['state']
  if (typeof state !== 'string' || !JOB_STATES.includes(state as JobState)) {
    throw new DomainError('INVALID_INPUT', '批量标记需要合法的 state', {
      hint: `合法取值：${JOB_STATES.join(' / ')}`,
    })
  }
  if (ids.length === 0) {
    throw new DomainError('INVALID_INPUT', 'ids 不能为空，且每一项都必须是正整数')
  }
  const applied: Array<{ id: number; state: string }> = []
  const missing: number[] = []
  for (const id of [...new Set(ids)]) {
    try {
      const updated = jobService.mark(id, state as JobState)
      applied.push({ id: updated.id, state: updated.state })
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOT_FOUND') {
        missing.push(id)
        continue
      }
      throw error
    }
  }
  if (applied.length > 0) {
    runtime.events().publish('jobs.marked', { ids: applied.map((item) => item.id), state })
  }
  return json(200, { ok: true, applied, missing, total: applied.length })
}

// ── GET/PUT /jobs/views：保存的筛选视图（第五轮，批次 B2）────────────
// 与 `facets` 同理：`views` 是字面路径，必须排在 `/jobs/:id` 之前 ——
// 否则 `views` 会被当成岗位 id 解析（那条守则在 `route-precedence.test.ts` 里钉着）。
export async function views(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'views')) {
    return undefined
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  if (method === 'GET') return json(200, jobService.jobViews())
  if (method === 'PUT') {
    // 整体覆盖写（幂等）：一次 PUT 换掉全部视图，避免"改一半"的中间态。
    const body = await readObject(req)
    return json(200, jobService.saveJobViews(body, new Date().toISOString()))
  }
  throw new DomainError('INVALID_INPUT', '保存的筛选视图只支持 GET（读）与 PUT（整体覆盖写）')
}

// ── GET /jobs/export：把选中的岗位导成 CSV（第五轮，批次 D2）─────────
//
// 为什么用 GET + 前端 `<a download>` 直下，而不是 fetch + Blob：
// 与 `GET /data/export` 同一个理由（见 `client/net/ops.ts` 的注释）——
// 导出的是文件，交给浏览器原生下载更稳（不进 JS 堆、文件名与断点都归它管）。
// 代价是 id 列表要落在 URL 上，所以有 `MAX_JOB_EXPORT_IDS` 这个上限。
const JOB_EXPORT_HEADER = [
  '公司',
  '岗位',
  '薪资',
  '城市',
  '经验',
  '学历',
  '平台',
  '状态',
  '匹配分',
  '最近见到',
  '首次见到',
  '原链接',
] as const

export async function exportList(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'export')) {
    return undefined
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  const ids = (req.query.get('ids') ?? '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)
  if (ids.length === 0) {
    throw new DomainError('INVALID_INPUT', 'ids 不能为空（逗号分隔的岗位 id）', {
      hint: '界面的「导出选中」会把勾选的行 id 拼好再传。',
    })
  }
  if (ids.length > MAX_JOB_EXPORT_IDS) {
    throw new DomainError('INVALID_INPUT', `一次最多导出 ${String(MAX_JOB_EXPORT_IDS)} 条`, {
      hint: '分批导出，或先在筛选里缩小范围。',
    })
  }

  // `repo.query` 单次上限是 PAGE_SIZE_MAX，所以按块取；取完按**请求里的顺序**重排，
  // 让文件里的行序等于用户勾选的顺序（而不是库里的抓取时间序）。
  const wanted = [...new Set(ids)]
  const byId = new Map<number, JobDto>()
  for (let offset = 0; offset < wanted.length; offset += PAGE_SIZE_MAX) {
    const chunk = jobService.query({ ids: wanted.slice(offset, offset + PAGE_SIZE_MAX) }, PAGE_SIZE_MAX, 0)
    for (const job of chunk) byId.set(job.id, job)
  }
  const missing = wanted.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    // 不静默少给：文件一旦落盘就没人知道"本来还有两条"，而用户可能正是为了那两条才导的。
    // 让他刷新列表（那两条本来也已经不在列表里了）再导一次，比给一份少了行的文件好。
    throw new DomainError('INVALID_INPUT', `有 ${String(missing.length)} 条岗位已不存在：${missing.join('、')}`, {
      hint: '这些岗位可能已被清理。刷新列表后重新勾选再导出。',
    })
  }

  const now = new Date()
  const rows: unknown[][] = wanted
    .map((id) => byId.get(id))
    .filter((job): job is JobDto => job !== undefined)
    .map((job) => [
      job.companyName ?? '',
      job.title,
      job.salaryRaw,
      job.district === '' ? job.city : `${job.city}·${job.district}`,
      job.expReq,
      job.eduReq,
      job.platformName ?? job.platformId,
      JOB_STATE_LABEL[job.state],
      job.matchScore === null ? '' : Math.round(job.matchScore),
      formatLocalDateTime(job.lastSeenAt, now),
      formatLocalDateTime(job.firstSeenAt, now),
      job.sourceUrl,
    ])

  const csv = csvEncode(JOB_EXPORT_HEADER, rows)
  const day = now.toISOString().slice(0, 10)
  // 文件名保持 ASCII：Content-Disposition 里的中文要靠 RFC 5987 编码，
  // 而各家浏览器/下载器对它的处理并不一致 —— 一个能被所有环境稳定保存的名字更要紧。
  return {
    kind: 'bytes',
    status: 200,
    contentType: 'text/csv; charset=utf-8',
    bytes: Buffer.from(csv, 'utf8'),
    fileName: `jobs-${day}.csv`,
    disposition: 'attachment',
  }
}

// ── GET /jobs/:id ──────────────────────────────────────────────────
export async function detail(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'jobs')) {
    return undefined
  }
  const idRaw = segments[1] ?? ''
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`)
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  // P4：详情带上标注依据与匹配理由 —— 界面上的每个结论都要能回答「凭什么」
  return json(200, jobService.detailFull(id))
}

// ── POST /jobs/:id/read ────────────────────────────────────────────
/**
 * 记一次**已读**（用户打开了详情）。
 *
 * 与 `/mark` 分开是刻意的：`/mark` 是**用户的决定**（收藏/忽略/归档），
 * 这条是**事实**（我看了）。混用一个端点的话，"打开详情"迟早会变成"改处置态" ——
 * 那正是"浏览了还显示新"与"不小心改掉收藏"两种毛病共用的病根。
 *
 * 幂等：重复调用安全（`read_at` 只写第一次）。读不到岗位是 404，不静默成功。
 */
export async function read(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'read')) {
    return undefined
  }
  const idRaw = segments[1] ?? ''
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`)
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  const updated: JobDto = jobService.markRead(id, new Date().toISOString())
  runtime.events().publish('job.updated', { id: updated.id, state: updated.state })
  return json(200, { ok: true, job: updated })
}

// ── POST /jobs/:id/mark ────────────────────────────────────────────
export async function mark(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'mark')) {
    return undefined
  }
  const idRaw = segments[1] ?? ''
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`)
  }
  requireData(runtime)
  const jobService = runtime.jobs()
  if (jobService === undefined) throw dataNotReady(runtime)

  const raw = await req.readJson()
  const body = raw !== null && typeof raw === 'object' ? (raw as { state?: unknown }) : {}
  if (typeof body.state !== 'string' || !JOB_STATES.includes(body.state as JobState)) {
    throw new DomainError('INVALID_INPUT', 'mark 需要一个合法的 state', {
      hint: `合法取值：${JOB_STATES.join(' / ')}`,
    })
  }
  const updated: JobDto = jobService.mark(id, body.state as JobState)
  runtime.events().publish('job.updated', { id: updated.id, state: updated.state })
  return json(200, { ok: true, job: updated })
}
