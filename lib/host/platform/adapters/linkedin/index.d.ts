import type { SiteAdapter } from '../../types.js';
import type { LinkedInConfig } from './config.js';
export interface LinkedInAdapterOptions {
    config?: LinkedInConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等卡片文档渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 LinkedIn 适配器。 */
export declare function createLinkedInAdapter(options?: LinkedInAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map