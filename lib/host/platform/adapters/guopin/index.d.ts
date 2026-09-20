import type { SiteAdapter } from '../../types.js';
import type { GuopinConfig } from './config.js';
export interface GuopinAdapterOptions {
    config?: GuopinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造国聘网适配器。 */
export declare function createGuopinAdapter(options?: GuopinAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map