import type { SiteAdapter } from './types.js';
/**
 * 适配器注册表（§3 `platform/registry.ts`）。
 *
 * P1 只有 51job 一个；多平台时这里就是「按 id 找到适配器」的唯一入口。
 * 注册返回 disposer，随 fiber 卸载 —— 不留下全局残留（C15）。
 */
export interface AdapterRegistry {
    register(adapter: SiteAdapter): () => void;
    get(id: string): SiteAdapter | undefined;
    list(): SiteAdapter[];
    has(id: string): boolean;
}
export declare function createAdapterRegistry(): AdapterRegistry;
//# sourceMappingURL=registry.d.ts.map