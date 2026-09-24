/**
 * 公司画像与识别依据（P4）的路由块。
 * 管 GET /companies（列表）、GET /companies/:id（详情：画像 + 信号 + 岗位 + 标记计数 + 工商快照）、
 * PATCH /companies/:id（人工复核：白名单键的黑名单 / 备注 / 人工标签）、
 * POST /companies/:id/enrich（工商补全：天眼查免登录浏览器通道）。
 */
import type {
  CompanyDetailDto,
  CompanyEnrichmentDto,
  CompanyPageDto,
  CompanyProfileDto,
} from '../../../shared/contract/dto/job.js'
import { COMPANY_ORDER_VALUES, type CompanyOrderValue } from '../../../shared/contract/enums/job.js'
import type { CompanyEnrichmentRecord, CompanyProfileRecord, CompanyRecord } from '../../store/repo/companies.js'
import { enrichCompany } from '../../enrichment/index.js'
import { dataNotReady } from '../../runtime/contract.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 与原 `dispatch` 里的同名闭包一致：每次调用取当前时刻。 */
const now = (): string => new Date().toISOString()

/**
 * repo 的两表记录 → 扁平 `CompanyProfileDto`（列表与详情共用同一形状，见 `CompanyPageDto`）。
 * 此前列表路由直接把 `{company, profile}` 嵌套漏出去 —— 那是宿主内部类型，
 * 且列表版 profile 有四个字段是占位值，属于无意契约。
 */
function toProfileDto(
  company: CompanyRecord,
  profile: CompanyProfileRecord | null | undefined,
): CompanyProfileDto {
  return {
    id: company.id,
    name: company.name,
    nameNorm: company.nameNorm,
    industry: company.industry,
    size: company.size,
    nature: company.nature,
    jobCount: profile?.jobCount ?? 0,
    geoSpread: profile?.geoSpread ?? 0,
    stackDiversity: profile?.stackDiversity ?? 0,
    onsiteRatio: profile?.onsiteRatio ?? null,
    nameKeywordHits: profile?.nameKeywordHits ?? 0,
    outsourcingScore: profile?.outsourcingScore ?? null,
    fraudScore: profile?.fraudScore ?? null,
    manualLabel: profile?.manualLabel ?? null,
    note: company.note,
    blacklisted: company.blacklisted,
  }
}

/** 工商快照记录 → DTO（repo 字段与 DTO 同名，只剥内部列）。 */
function toEnrichmentDto(record: CompanyEnrichmentRecord): CompanyEnrichmentDto {
  return {
    provider: record.provider,
    matchedName: record.matchedName,
    creditCode: record.creditCode,
    confidence: record.confidence,
    regStatus: record.regStatus,
    estDate: record.estDate,
    regCapital: record.regCapital,
    orgType: record.orgType,
    legalPerson: record.legalPerson,
    industry: record.industry,
    staffNum: record.staffNum,
    suitCount: record.suitCount,
    investCount: record.investCount,
    licenseCount: record.licenseCount,
    tags: record.tags,
    sourceUrl: record.sourceUrl,
    fetchedAt: record.fetchedAt,
  }
}

/**
 * POST /companies/:id/enrich —— 工商补全（按需一次性，照 `POST /crawl/run` 的形态）。
 *
 * body 可带 `pickUrl`（多候选时用户点选的那条，来自上一次 `pick-one` 的返回）。
 * 成功三种形态：done（已入库）/ pick-one（要人工点选）/ unmatched（工商库查无此主体，
 * 也是留痕）。撞墙（登录墙/验证码）与每日超额（20 家，写死）抛 DomainError，
 * 由统一错误协议翻给界面。
 */
export async function enrich(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'companies' && segments[2] === 'enrich')) {
    return undefined
  }
  requireData(runtime)
  const store = runtime.store()
  const browser = runtime.browser()
  if (store === undefined || browser === undefined) throw dataNotReady(runtime)

  const companyId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(companyId)) {
    throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  const pickUrl = typeof body['pickUrl'] === 'string' && body['pickUrl'] !== '' ? body['pickUrl'] : undefined
  const pickName = typeof body['pickName'] === 'string' && body['pickName'] !== '' ? body['pickName'] : undefined
  if (pickUrl !== undefined && !/^\/company\/\d+/.test(pickUrl) && !/^https:\/\/www\.tianyancha\.com\/company\/\d+/.test(pickUrl)) {
    throw new DomainError('INVALID_INPUT', 'pickUrl 必须是天眼查的公司详情链接')
  }

  const outcome = await enrichCompany(
    {
      browser,
      companies: store.company,
      settings: store.setting,
      onEnriched: (id) => runtime.events().publish('company.enriched', { companyId: id }),
    },
    companyId,
    pickUrl === undefined ? undefined : { url: pickUrl, name: pickName },
  )
  if (outcome.kind === 'done') {
    return json(200, { ok: true, outcome: { kind: 'done', enrichment: toEnrichmentDto(outcome.enrichment) } })
  }
  if (outcome.kind === 'pick-one') {
    return json(200, { ok: true, outcome: { kind: 'pick-one', candidates: outcome.candidates } })
  }
  return json(200, { ok: true, outcome: { kind: 'unmatched' } })
}

export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  // GET /companies —— 列表（公司维度）：关键词 / 拉黑 / 人工标签 / 最少岗位数 / 排序。
  // 排序键与 `COMPANY_ORDER_VALUES` 同一份 —— 界面下拉、宿主校验、repo 取值域必须一致。
  const q = req.query.get('q')
  const blacklisted = req.query.get('blacklisted')
  const manualLabel = req.query.get('manualLabel')
  const orderByRaw = req.query.get('orderBy')
  const orderBy: CompanyOrderValue | undefined =
    orderByRaw !== null && (COMPANY_ORDER_VALUES as readonly string[]).includes(orderByRaw)
      ? (orderByRaw as CompanyOrderValue)
      : undefined
  const result = store.company.list({
    ...(q === null || q === '' ? {} : { q }),
    ...(blacklisted === null || blacklisted === '' ? {} : { blacklisted: blacklisted !== '0' }),
    ...(manualLabel === null || manualLabel === '' ? {} : { manualLabel }),
    // 0 与"不筛"是同一个意思（jobCount ≥ 0 恒真），缺省值直接用 0 表达"不限"
    minJobCount: parsePositiveInt(req.query.get('minJobCount'), 0, 0, 1_000_000),
    ...(orderBy === undefined ? {} : { orderBy, descending: req.query.get('desc') !== '0' }),
    limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
    offset: parsePositiveInt(req.query.get('offset'), 0, 0, 500_000),
  })
  const body: CompanyPageDto = {
    items: result.items.map((entry) => toProfileDto(entry.company, entry.profile)),
    total: result.total,
  }
  return json(200, body)
}

export async function review(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  const companyId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(companyId)) {
    throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`)
  }
  const company = store.company.get(companyId)
  if (company === undefined) {
    throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`)
  }

  // PATCH /companies/:id —— 人工复核（只认白名单键）
  const body = await readObject(req)
  const patch: { blacklisted?: boolean; note?: string | null; manualLabel?: string | null } = {}
  if (typeof body['blacklisted'] === 'boolean') patch.blacklisted = body['blacklisted']
  if (body['note'] !== undefined) patch.note = typeof body['note'] === 'string' ? body['note'] : null
  if (body['manualLabel'] !== undefined) {
    patch.manualLabel = typeof body['manualLabel'] === 'string' && body['manualLabel'] !== '' ? body['manualLabel'] : null
  }
  const reviewed = store.company.updateReview(companyId, patch, now())
  runtime.events().publish('company.reviewed', { companyId, blacklisted: patch.blacklisted })
  return json(200, { ok: true, reviewed })
}

export async function detail(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  const companyId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(companyId)) {
    throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`)
  }
  const company = store.company.get(companyId)
  if (company === undefined) {
    throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`)
  }

  const profile = store.company.getProfile(companyId)
  const jobs = jobService.query({ companyId }, 50, 0)
  const flagCounts: Record<string, number> = {}
  for (const job of jobs) {
    for (const type of job.flagTypes) flagCounts[type] = (flagCounts[type] ?? 0) + 1
  }
  // 工商快照：没查过就没有这个键（界面据此区分"未查"与"查过但缺字段"）
  const enrichmentRecord = store.company.getEnrichment(companyId)

  const body: CompanyDetailDto = {
    company: toProfileDto(company, profile),
    signals: store.signal.listByCompany(companyId).map((signal) => ({
      type: signal.type,
      weight: signal.weight,
      evidence: signal.evidence,
      source: signal.source,
      createdAt: signal.createdAt,
    })),
    jobs,
    flagCounts,
    ...(enrichmentRecord === undefined ? {} : { enrichment: toEnrichmentDto(enrichmentRecord) }),
  }
  return json(200, body)
}
