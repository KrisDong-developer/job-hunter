import type { SiteAdapter } from '../../types.js';
import type { FiftyOneConfig } from './config.js';
export interface FiftyOneAdapterOptions {
    config?: FiftyOneConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 51job 适配器。 */
export declare function createFiftyOneAdapter(options?: FiftyOneAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map