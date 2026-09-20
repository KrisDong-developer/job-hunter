import type { SiteAdapter } from '../../types.js';
import type { WaiqiConfig } from './config.js';
export interface WaiqiAdapterOptions {
    config?: WaiqiConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等页面渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造神仙外企适配器。 */
export declare function createWaiqiAdapter(options?: WaiqiAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map