import type { AdapterRegistry } from '../platform/registry.js';
import type { SiteAdapter } from '../platform/types.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
/** 只用到 info —— 装配点的 logger 形状这里不需要整个。 */
export interface AdapterLogger {
    info(message: string): void;
}
/** 一个平台的注册规格。 */
export interface AdapterSpec {
    /** 与 `setting` 里 `adapter-config` 的作用域键、以及适配器自己声明的 `id` 必须一致。 */
    id: string;
    /** 用 DB 里那份覆盖（可能为 undefined）构造适配器。 */
    build: (override: unknown, delayRangeMs: [number, number]) => SiteAdapter;
    /** 没有 DB 覆盖时要额外说的一句话（拼在"配置来源"后面）。 */
    noOverrideNote?: string;
}
/**
 * **平台清单**。顺序即注册顺序（也是 `/platforms` 与城市取值域的遍历顺序）。
 *
 * P5：请求之间要随机延时，别踩出规律性的节奏 —— 十个平台共用同一档区间，
 * 所以它由 `registerAdapters` 统一注入，不在每行里各写一遍。
 */
export declare const ADAPTER_SPECS: readonly AdapterSpec[];
export interface RegisterAdaptersOptions {
    store: Store;
    registry: AdapterRegistry;
    clock: Clock;
    logger?: AdapterLogger;
}
/**
 * 按 `ADAPTER_SPECS` 注册全部适配器，并顺带登记平台实体。
 *
 * 两件事必须一起做：`account_state` 有指向 `platform` 的外键，而用户可能在
 * 第一次抓取之前就先点「登录」—— 所以"注册了适配器却没有 platform 行"会让登录直接失败。
 */
export declare function registerAdapters(options: RegisterAdaptersOptions): void;
//# sourceMappingURL=adapters.d.ts.map