import type { EnrichmentProvider } from './types.js'
import { tianyanchaProvider } from './providers/tianyancha/navigator.js'

/**
 * 工商数据源注册表 —— 一张 map，不做 adapter 那套重量级（平台锁/健康/账号态
 * 都绑定在招聘平台的 platform 表上，工商源用不到，也不该把结构拖过来）。
 * 新增一个源 = providers/ 下建目录 + 这里登记一行。
 */
const PROVIDERS: ReadonlyMap<string, EnrichmentProvider> = new Map([
  [tianyanchaProvider.id, tianyanchaProvider],
])

export function enrichmentProviderOf(id: string): EnrichmentProvider | undefined {
  return PROVIDERS.get(id)
}

/** 默认源（设置面还没有源选择的今天，编排层用主源起步）。 */
export const DEFAULT_PROVIDER_ID = tianyanchaProvider.id
