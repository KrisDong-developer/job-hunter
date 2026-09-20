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
 * 构造**会话列表**接口的请求体（表单编码，Node 侧纯函数）。
 *
 * 结构照抄页面自己那一次（2026-09-19 采样、2026-09-20 复验）：
 * `imUserType=0&imId=<可空>&imApp=1&pageSize=30&curPage=0`，**`curPage` 0 起**。
 *
 * ⚠️ `imId` **留空是实测结论，不是省事**：2026-09-20 探针三个变体（空 `imId` /
 * 完全不传该参数 / 带真实 `imId`）全部 `flag=1` 且行数相同 —— 服务端靠 cookie 认人。
 * 真实值来自 cookie `imId_0`（非 httpOnly），但**不需要**去读它（少一处会变的东西）。
 */
export function buildContactListBody(arg: { page: number; pageSize: number }): string {
  const params = new URLSearchParams()
  params.set('imUserType', '0')
  params.set('imId', '')
  params.set('imApp', '1')
  params.set('pageSize', String(arg.pageSize))
  // criteria/调用方给的是 1 起；猎聘 curPage 是 0 起（采样实测）。
  params.set('curPage', String(Math.max(0, arg.page - 1)))
  return params.toString()
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
