/**
 * 国聘网的 URL 构造（宿主机侧）：列表页 URL 与详情页 URL，**不碰 `document`**。
 *
 * 两个函数原本就是"接收 config 的顶层函数"，搬运时签名与函数体一字未改。
 *
 * 完整实测记录（真实路由 `/jobList` → `/job` 的 302、详情页路由形态、分页参数未确证、城市码为何置空）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import type { GuopinConfig } from './config.js'

/** 用平台 id 构造详情 URL。 */
export function buildGuopinJobDetailUrl(config: GuopinConfig, jobId: string): string {
  return config.detailUrlTemplate.split('{jobId}').join(jobId)
}

/**
 * 构造列表页 URL：`https://www.iguopin.com/jobList?keyword=<kw>`。
 * 城市码未配置（v1 空表）时带城市即返回 null —— **不猜**。
 * 页码：分页参数未确证，v1 单页（不加页码参数）。
 */
export function buildGuopinSearchUrl(config: GuopinConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}
