import type { SiteAdapter } from '../../types.js';
import type { SinoJobsConfig } from './config.js';
export interface SinoJobsAdapterOptions {
    config?: SinoJobsConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等页面渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 SinoJobs 适配器。 */
export declare function createSinoJobsAdapter(options?: SinoJobsAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map