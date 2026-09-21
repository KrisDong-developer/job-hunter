import type { AdapterLogger, SiteAdapter } from '../../types.js';
import type { LinkedInConfig } from './config.js';
export interface LinkedInAdapterOptions {
    config?: LinkedInConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等卡片文档渲染出来的上限（ms）。 */
    waitForListMs?: number;
    /** 诊断日志：只用于上报「薪资回填通道被墙/失败」这一类不报警的坏法。 */
    logger?: AdapterLogger;
}
/** 构造 LinkedIn 适配器。 */
export declare function createLinkedInAdapter(options?: LinkedInAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map