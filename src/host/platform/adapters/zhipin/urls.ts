/**
 * BOSS 直聘的 URL 与请求体构造（宿主机侧，不碰 `document`）。
 *
 * 搜索页 URL 与列表接口的表单体都在这里；接口地址常量在 `./config.js`。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js'
import type { ZhipinConfig } from './config.js'

/** joblist 的表单体（照抄站点自己的参数集，含那些恒为空的筛选位）。 */
export function buildJoblistBody(arg: {
  query: string
  cityCode: string
  page: number
  pageSize: number
}): string {
  const params = new URLSearchParams()
  params.set('page', String(arg.page))
  params.set('pageSize', String(arg.pageSize))
  params.set('city', arg.cityCode)
  params.set('query', arg.query)
  for (const key of [
    'expectInfo',
    'multiSubway',
    'multiBusinessDistrict',
    'position',
    'jobType',
    'salary',
    'experience',
    'degree',
    'industry',
    'scale',
    'stage',
  ]) {
    params.set(key, '')
  }
  params.set('scene', '1')
  params.set('encryptExpectId', '')
  return params.toString()
}

/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null {
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
    params.set(config.urlParams.cityParam, code)
  }
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}
