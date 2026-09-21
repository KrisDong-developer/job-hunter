/**
 * 51job 的 URL 构造（宿主机侧）：字段 → URL 参数的拼装，**不碰 `document`**。
 *
 * ⚠️ 本平台唯一一处签名变更：原实现是工厂内的闭包（读闭包里的 `config`），
 * 搬到这里后 `config` 变成第一个显式参数，闭包体一字未改。
 *
 * 完整实测记录（字段映射来源、SR-40 抓取深度三件套为什么不塞默认值）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import type { FiftyOneConfig } from './config.js'

export function buildSearchUrl(config: FiftyOneConfig, criteria: SearchCriteria): string | null {
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
    params.set(config.urlParams.cityParam, code)
  }
  if (criteria.page !== undefined && criteria.page > 1) {
    params.set(config.urlParams.pageParam, String(criteria.page))
  }
  // SR-40：抓取深度的三件套。**只在用户真的配了的时候才写进 URL** ——
  // 塞一个平台默认值会改变"什么都没配"时的行为，那是静默改变语义。
  if (criteria.sort !== undefined && criteria.sort !== '') {
    params.set(config.urlParams.sortParam, criteria.sort)
  }
  if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
    params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays))
  }
  // 逃生口：只有调用方显式构造 `criteria.extra` 时才用得到（方案条件走不到这里 ——
  // `criteriaToSearchCriteria` 的闭集规则把非类型化槽位的键一律放进 `platform` 命名空间，
  // 而那条兜底曾经把 `posInfo` 这种内部键名当参数名发出去过）。
  for (const [key, value] of Object.entries(criteria.extra ?? {})) params.set(key, value)
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}
