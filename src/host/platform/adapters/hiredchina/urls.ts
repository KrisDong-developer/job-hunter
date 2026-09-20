/**
 * HiredChina 列表页 URL 的**宿主机侧**构造（`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`）。
 *
 * 不碰 `document`、不发请求 —— 页面上下文的一切在 `./page.ts`。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import { platformCriterion } from '../../types.js'
import type { HiredChinaConfig } from './config.js'

/** 构造列表页 URL：`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`。 */
export function buildHiredChinaSearchUrl(
  config: HiredChinaConfig,
  criteria: SearchCriteria,
): string | null {
  // 本平台**没有城市 URL 筛选**（见文件头）—— 带城市即拒绝，绝不静默搜全国。
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  const type = platformCriterion(criteria, 'type')
  if (type !== '') params.set(config.urlParams.typeParam, type)
  const employment = platformCriterion(criteria, 'employment')
  if (employment !== '') params.set(config.urlParams.employmentParam, employment)
  const workMode = platformCriterion(criteria, 'workMode')
  if (workMode !== '') params.set(config.urlParams.workModeParam, workMode)
  if (criteria.page !== undefined && criteria.page > 1) {
    params.set(config.urlParams.pageParam, String(criteria.page))
  }
  const base = `${config.webBase}/${config.lang}${config.urlParams.jobsPath}`
  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}
