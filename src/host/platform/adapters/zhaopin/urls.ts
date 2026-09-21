/**
 * 智联的 URL 构造（**宿主机侧**）：搜索页 URL 与会话列表接口地址。
 *
 * 不碰 `document`、不发请求 —— 页面内解析见 `./page/*.ts`。
 * 「第 1 页用 `?kw=`、第 2 页起优先用站点自发的无 query path」这条 robots 取舍，
 * 以及 `/jobs?jl=` **不是**搜索页的实测事实，见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import type { ZhaopinConfig } from './config.js'

/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - 第 1 页：`https://www.zhaopin.com/sou/jl765?kw=Java&order=4`
 *   - 第 2 页起：**优先**用站点给的无 query path 形式；这里只能构造 query 兜底，
 *     真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`）。
 */
export function buildZhaopinSearchUrl(config: ZhaopinConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    // 城市码未配置就返回 null —— **不猜**。猜错会静默搜到别的城市。
    if (code === undefined) return null
  }

  // 城市码放路径段：`/sou/jl<code>`；没指定城市时用「全国」码，保持 URL 形状一致。
  const code = criteria.city !== undefined && criteria.city !== '' ? (config.cityCodes[criteria.city] as string) : config.cityCodes['全国']
  const base = code === undefined ? config.urlParams.base : `${config.urlParams.base}/jl${code}`

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.page !== undefined && criteria.page > 1) {
    params.set(config.urlParams.pageParam, String(criteria.page))
  }
  // SR-40：只在用户真的配了的时候才写进 URL，避免静默改变默认行为。
  if (criteria.sort !== undefined && criteria.sort !== '') {
    params.set(config.urlParams.sortParam, criteria.sort)
  }
  if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
    params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays))
  }
  // 逃生口：只有调用方显式构造 `criteria.extra` 时才用得到（方案条件走不到这里 ——
  // `criteriaToSearchCriteria` 的闭集规则把非类型化槽位的键一律放进 `platform` 命名空间）。
  for (const [key, value] of Object.entries(criteria.extra ?? {})) params.set(key, value)

  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}

/**
 * 会话列表接口地址（某个页号的最简调用形式：**不带** at/rt 与任何自定义头 —— 实测四个变体等价）。
 *
 * ⚠️ `PageSize` 与 `pageSize` **两个参数名都要带**：实测的真实请求里两个都出现了，
 * 而只带一个是否也生效**没单独验证过** —— 一次只读请求多带一个参数没有代价，就不去赌。
 */
export function buildTalkListUrl(config: ZhaopinConfig, pageNo: number): string {
  const size = String(config.talkListPageSize)
  return (
    `${config.talkListApi}?pageNo=${String(pageNo)}` +
    `&PageSize=${size}&pageSize=${size}` +
    '&sessionType=1&imMessageListType=1&communicateStatusType=0'
  )
}
