import type { SiteAdapter } from './types.js'

/**
 * 适配器注册表（§3 `platform/registry.ts`）。
 *
 * P1 只有 51job 一个；多平台时这里就是「按 id 找到适配器」的唯一入口。
 * 注册返回 disposer，随 fiber 卸载 —— 不留下全局残留（C15）。
 */
export interface AdapterRegistry {
  register(adapter: SiteAdapter): () => void
  get(id: string): SiteAdapter | undefined
  list(): SiteAdapter[]
  has(id: string): boolean
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, SiteAdapter>()
  return {
    register(adapter): () => void {
      if (adapters.has(adapter.id)) {
        throw new Error(`适配器 id 重复：${adapter.id}`)
      }
      adapters.set(adapter.id, adapter)
      return () => {
        adapters.delete(adapter.id)
      }
    },
    get(id): SiteAdapter | undefined {
      return adapters.get(id)
    },
    list(): SiteAdapter[] {
      return [...adapters.values()]
    },
    has(id): boolean {
      return adapters.has(id)
    },
  }
}
