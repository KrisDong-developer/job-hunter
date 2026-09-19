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
    /**
     * 配置的两层视图（J2 / `GET|PUT /platforms/:id/adapter-config`）。
     *
     * `defaults` = 代码默认（界面用来对照"哪些是覆盖来的"）；
     * `merge` **必须与 `build` 内部用的是同一个函数** —— 否则界面上看到的"生效值"
     * 与适配器实际拿到的不是同一份，而那种不一致比不显示更糟
     * （用户会照着错的生效值去判断选择器改没改对）。
     */
    config: {
        defaults: unknown;
        merge: (override: unknown) => unknown;
    };
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
/** 适配器配置覆盖在 `setting` 表里的键（ADR-19：DB 为权威）。 */
export declare const ADAPTER_CONFIG_KEY = "adapter-config";
/**
 * 一份配置覆盖的字符上限。
 *
 * 覆盖的语义是"只写要改的那几个键"（`mergeAdapterConfig` 会把没写的沿用默认值），
 * 所以正常值是几百字符。给一个上界是为了让"把整份配置复制进来"这种用法
 * **当场被拒**，而不是在库里悄悄长出一团没人看得懂、也没人敢删的 JSON。
 */
export declare const ADAPTER_CONFIG_MAX_CHARS = 64000;
/**
 * 按 `ADAPTER_SPECS` 注册全部适配器，并顺带登记平台实体。
 *
 * 两件事必须一起做：`account_state` 有指向 `platform` 的外键，而用户可能在
 * 第一次抓取之前就先点「登录」—— 所以"注册了适配器却没有 platform 行"会让登录直接失败。
 */
export declare function registerAdapters(options: RegisterAdaptersOptions): void;
/** 按 id 找注册规格（`GET|PUT /platforms/:id/adapter-config` 用）。 */
export declare function adapterSpecOf(id: string): AdapterSpec | undefined;
/**
 * 用一份新的覆盖**重建并热替换**适配器（J2：改完立刻生效，不要求重启插件）。
 *
 * 为什么必须重建而不是只写库：适配器的配置是在 `build` 时**快照**进闭包的
 * （`createXxxAdapter({ config })`），只写库要等下次装配才生效 ——
 * 而"界面说改好了、实际还是旧选择器"正是 J2 要消灭的那类问题。
 */
export declare function rebuildAdapter(spec: AdapterSpec, override: unknown, registry: AdapterRegistry): SiteAdapter;
//# sourceMappingURL=adapters.d.ts.map