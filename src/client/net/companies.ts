/**
 * 公司画像与人工复核（打标签 / 拉黑）。
 */
import type {
  CompanyDetailDto,
  CompanyEnrichmentDto,
  CompanyListParams,
  CompanyPageDto,
  EnrichmentCandidateDto,
} from '../../shared/contract/dto/job.js'
import { request } from './client.js'

/**
 * 工商补全（天眼查免登录浏览器通道，按需一次性）。
 *
 * 成功三种形态：`done`（已入库，详情栏刷新即见）/ `pick-one`（多个候选要人工
 * 点选，把所选的 `url` 作为 `pick` 再调一次）/ `unmatched`（工商库查无此主体，
 * 已留痕）。撞墙与每日超额走统一错误协议（`ApiError.display` 直接可读）。
 */
export async function enrichCompany(
  companyId: number,
  pick?: { url: string; name?: string },
): Promise<
  | { kind: 'done'; enrichment: CompanyEnrichmentDto }
  | { kind: 'pick-one'; candidates: EnrichmentCandidateDto[] }
  | { kind: 'unmatched' }
> {
  const body = await request<{
    ok: boolean
    outcome:
      | { kind: 'done'; enrichment: CompanyEnrichmentDto }
      | { kind: 'pick-one'; candidates: EnrichmentCandidateDto[] }
      | { kind: 'unmatched' }
  }>(`/companies/${String(companyId)}/enrich`, {
    method: 'POST',
    body: JSON.stringify(
      pick === undefined ? {} : { pickUrl: pick.url, ...(pick.name === undefined ? {} : { pickName: pick.name }) },
    ),
  })
  return body.outcome
}

/**
 * 公司列表（岗位库的「公司维度」）。
 *
 * 查询串的拼法照 `fetchJobs` 的惯例：空值不传、布尔只在非默认时传、
 * `desc` 恒传（服务端只在传了 `orderBy` 时才看它）。
 * 接口是 offset 分页，页码换算在这里做（`offset = (page-1) * limit`）。
 */
export async function fetchCompanies(
  params: CompanyListParams,
  signal?: AbortSignal,
): Promise<CompanyPageDto> {
  const query = new URLSearchParams()
  if (params.q !== undefined && params.q !== '') query.set('q', params.q)
  if (params.blacklisted === true) query.set('blacklisted', '1')
  else if (params.blacklisted === false) query.set('blacklisted', '0')
  if (params.manualLabel !== undefined && params.manualLabel !== '') query.set('manualLabel', params.manualLabel)
  if (params.minJobCount !== undefined && params.minJobCount !== null && params.minJobCount > 0) {
    query.set('minJobCount', String(params.minJobCount))
  }
  if (params.orderBy !== undefined) query.set('orderBy', params.orderBy)
  query.set('desc', params.descending === false ? '0' : '1')
  query.set('limit', String(params.limit ?? 20))
  query.set('offset', String(params.offset ?? 0))
  return await request<CompanyPageDto>(`/companies?${query.toString()}`, signal === undefined ? {} : { signal })
}

/**
 * 公司详情：画像 + 识别信号留痕 + 该公司的在手岗位（≤50）+ 标注汇总。
 *
 * 这份接口一直都在，只是客户端从来没调过 —— 于是岗位详情里只能显示
 * "在手岗位 37"这个数字，看不到那 37 条是什么。
 */
export async function fetchCompanyDetail(
  companyId: number,
  signal?: AbortSignal,
): Promise<CompanyDetailDto> {
  return await request<CompanyDetailDto>(
    `/companies/${String(companyId)}`,
    signal === undefined ? {} : { signal },
  )
}

/**
 * 人工复核：打标签 / 拉黑 / 备注。**只发生命中的键**，缺的键沿用现值（不会清空备注）。
 *
 * `note` 是第五轮补上的：后端一直收这个键、导出的 CSV 也一直有这一列，
 * 只是客户端的类型与界面都没有它 —— 于是"为什么拉黑这家"没地方写。
 */
export async function updateCompanyReview(
  companyId: number,
  patch: { blacklisted?: boolean; manualLabel?: string | null; note?: string | null },
): Promise<void> {
  await request<{ ok: boolean }>(`/companies/${String(companyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

