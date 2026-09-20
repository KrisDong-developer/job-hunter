/**
 * 猎聘的 **宿主侧**（Node）URL 与搜索请求体构造 —— 这一层不碰 `document`。
 *
 * 页面内的 fetch 通道在 `./api.ts`。完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import type { LiepinConfig } from './config.js'

/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null {
  let cityCode: string | undefined
  if (criteria.city !== undefined && criteria.city !== '') {
    cityCode = config.cityCodes[criteria.city]
    if (cityCode === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (cityCode !== undefined && cityCode !== '') {
    params.set(config.urlParams.cityParam, cityCode)
    params.set(config.urlParams.cityAliasParam, cityCode)
  }
  // criteria.page 是 1 起；猎聘 currentPage 是 0 起（get_jobs 实测首页为 0）。
  const page = criteria.page === undefined ? 1 : criteria.page
  params.set(config.urlParams.pageParam, String(Math.max(0, page - 1)))

  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown> {
  const page = criteria.page === undefined ? 1 : criteria.page
  const form: Record<string, unknown> = {
    city: cityCode,
    dq: cityCode,
    pubTime: '',
    currentPage: String(Math.max(0, page - 1)),
    pageSize: 40,
    key: criteria.keyword ?? '',
    suggestTag: '',
    workYearCode: '',
    compId: '',
    compName: '',
    compTag: '',
    industry: '',
    salaryCode: '',
    jobKind: '',
    compScale: '',
    compKind: '',
    compStage: '',
    eduLevel: '',
    salaryLow: '',
    salaryHigh: '',
  }
  return {
    data: {
      mainSearchPcConditionForm: form,
      passThroughForm: { scene: 'init', skId: '', fkId: '', ckId: '' },
    },
  }
}
