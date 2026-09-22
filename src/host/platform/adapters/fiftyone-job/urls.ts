/**
 * 51job 的 URL 构造（宿主机侧）：字段 → URL 参数的拼装，**不碰 `document`**。
 *
 * ⚠️ 本平台唯一一处签名变更：原实现是工厂内的闭包（读闭包里的 `config`），
 * 搬到这里后 `config` 变成第一个显式参数，闭包体一字未改。
 *
 * 完整实测记录（字段映射来源、SR-40 抓取深度三件套为什么不塞默认值）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import { platformCriterion } from '../../types.js'
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
  // ⚠️ **刻意不发 `issueDate`**（2026-09-21 探针实测，带对照组）：
  //   基线 20 张卡 → 加 `issueDate=7` **0 张** → 再把基线放最后跑一次又是 20 张
  //   （对照组排除了"站点在限流后续加载"这种解释）。
  // 也就是说这个参数**被接受但会把结果集清空** —— 发了它只会让这一轮静默抓回 0 条，
  // 而用户看到的是"今天没岗位"。维度本身仍是"不可用"（页面上没有对应的筛选控件），
  // 老方案里若还存着 `postedWithinDays`，也**不许**再把它拼进 URL。
  // 要恢复它，先探明合法取值（`7` 这类天数不是）。
  // 逃生口：只有调用方显式构造 `criteria.extra` 时才用得到（方案条件走不到这里 ——
  // `criteriaToSearchCriteria` 的闭集规则把非类型化槽位的键一律放进 `platform` 命名空间，
  // 而那条兜底曾经把 `posInfo` 这种内部键名当参数名发出去过）。
  // 2026-09-21 点击探针实测的三个筛选（点「本科」→ `degree=04`，点「1-3年」→ `workYear=02`，
  // 点「国企」→ `companyType=04`）。站点的 key 顺序是
  // `keyword · searchType · jobArea · <这三个> · sortType · pageNum` —— 我们只补自己声明过的。
  // 与 sort 同款：**只在真的配了的时候才写**，不塞平台默认值（那会静默改变"什么都没配"的行为）。
  for (const [key, param] of [
    ['degree', config.urlParams.degreeParam],
    ['workYear', config.urlParams.workYearParam],
    ['companyType', config.urlParams.companyTypeParam],
    ['companySize', config.urlParams.companySizeParam],
    ['jobType', config.urlParams.jobTypeParam],
  ] as const) {
    const value = platformCriterion(criteria, key)
    if (value !== '') params.set(param, value)
  }
  for (const [key, value] of Object.entries(criteria.extra ?? {})) params.set(key, value)
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}
