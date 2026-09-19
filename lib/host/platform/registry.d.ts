import type { SiteAdapter } from './types.js';
/**
 * 适配器注册表（§3 `platform/registry.ts`）。
 *
 * P1 只有 51job 一个；多平台时这里就是「按 id 找到适配器」的唯一入口。
 * 注册返回 disposer，随 fiber 卸载 —— 不留下全局残留（C15）。
 */
export interface AdapterRegistry {
    register(adapter: SiteAdapter): () => void;
    /**
     * **热替换**一个已注册的适配器（J2：改完配置立刻生效，不要求重启插件）。
     *
     * 与 `register` 的分工：后者对重名**抛错**（那是防止两个 bundle 抢同一个 id 的护栏），
     * 这里则是明确的"我用新配置重建了同一个平台，换上去"。没注册过的 id 直接抛错 ——
     * 静默新增会让"替换"变成"注册"，那条护栏就白设了。
     */
    replace(adapter: SiteAdapter): void;
    get(id: string): SiteAdapter | undefined;
    list(): SiteAdapter[];
    has(id: string): boolean;
}
export declare function createAdapterRegistry(): AdapterRegistry;
//# sourceMappingURL=registry.d.ts.map