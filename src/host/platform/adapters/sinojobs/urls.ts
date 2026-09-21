/**
 * SinoJobs 的 URL 与请求体构造 —— **宿主机侧**（不碰 `document`）。
 *
 * 筛选条件不在 URL 里：URL 只承载页面自己的 `keywords`，真正的筛选全部走 POST body。
 * 完整实测记录（接口参数表、取值依据）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import { platformCriterion } from '../../types.js'
import type { SinoJobsConfig } from './config.js'
import { SINOJOBS_LIST_URL } from './config.js'

/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 与神仙外企同理：筛选条件**不在 URL 里**（全部走 POST body），URL 只承载
 * 页面自己的 `keywords`（仅供人核对）。城市仍然在这里校验 ——
 * 表里没有的城市直接返回 `null`（**不猜**，否则"城市没配"会变成一次静默的全国搜索）。
 */
export function buildSinoJobsSearchUrl(config: SinoJobsConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '' && config.addressCodes[criteria.city] === undefined) {
    return null
  }
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set('keywords', criteria.keyword)
  }
  const query = params.toString()
  return query === '' ? SINOJOBS_LIST_URL : `${SINOJOBS_LIST_URL}?${query}`
}

/**
 * 请求体字段名 —— **声明与构造共用这一份**（理由同 waiqi：声明里的 `wire.param`
 * 直接引用这里，于是"声明落到哪个参数"与"实际写哪个字段"不会各写一份字面量）。
 */
export const SINOJOBS_BODY_FIELDS = {
  keyword: 'keywords',
  city: 'address_id',
  jobType: 'job_type',
  workNature: 'work_nature',
  salaryRange: 'salary_range',
  experience: 'experience',
} as const

/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export function buildSinoJobsRequestBody(
  config: SinoJobsConfig,
  criteria: SearchCriteria,
  page: number,
): Record<string, string> {
  const body: Record<string, string> = {
    page: String(page),
    limit: String(config.pageSize),
    // 站点脚本始终提交这五个键（值为空串 = 不筛）。
    [SINOJOBS_BODY_FIELDS.keyword]: criteria.keyword ?? '',
    [SINOJOBS_BODY_FIELDS.jobType]: platformCriterion(criteria, 'jobType'),
    [SINOJOBS_BODY_FIELDS.workNature]: platformCriterion(criteria, 'workNature'),
    [SINOJOBS_BODY_FIELDS.salaryRange]: platformCriterion(criteria, 'salaryRange'),
    [SINOJOBS_BODY_FIELDS.experience]: platformCriterion(criteria, 'experience'),
    [SINOJOBS_BODY_FIELDS.city]: '',
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.addressCodes[criteria.city]
    // 地点码未配置就**不写值**（宁可搜全国，也不要写一个错的地点码）。
    // `buildSinoJobsSearchUrl` 已经先拦过一次，这里是第二道。
    if (code !== undefined) body[SINOJOBS_BODY_FIELDS.city] = code
  }
  // 逃生口：只有调用方显式构造 `criteria.extra` 时才会用到（方案条件走不到这里，
  // 见 plan-config.ts 的闭集规则）。
  for (const [key, value] of Object.entries(criteria.extra ?? {})) body[key] = value
  return body
}
