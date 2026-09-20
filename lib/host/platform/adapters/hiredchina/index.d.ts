import type { SiteAdapter } from '../../types.js';
import type { HiredChinaConfig } from './config.js';
export interface HiredChinaAdapterOptions {
    config?: HiredChinaConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
}
/** 构造 HiredChina 适配器。 */
export declare function createHiredChinaAdapter(options?: HiredChinaAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map