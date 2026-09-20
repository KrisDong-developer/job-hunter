/**
 * 公司画像与人工复核（打标签 / 拉黑）。
 */
import type { CompanyDetailDto } from '../../shared/contract/dto/job.js'
import { request } from './client.js'

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

