import type { SiteAdapter } from '../../types.js';
import type { IndeedConfig } from './config.js';
export interface IndeedAdapterOptions {
    config?: IndeedConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 Indeed 适配器。 */
export declare function createIndeedAdapter(options?: IndeedAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map