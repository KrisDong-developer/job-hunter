import type { AdapterLogger, SiteAdapter } from '../../types.js';
import type { SinoJobsConfig } from './config.js';
export interface SinoJobsAdapterOptions {
    config?: SinoJobsConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等页面渲染出来的上限（ms）。 */
    waitForListMs?: number;
    /**
     * 诊断日志：只用于上报"**不报警的坏法**"（接口成功但一条都没解析出来这一类
     * 形状漂移）—— 它们不会让采集失败，健康度与量级基线也都不响，日志是唯一的出口。
     * 与 zhipin 的 `enrichFromApi` 降级告警同一套纪律。
     */
    logger?: AdapterLogger;
}
/** 构造 SinoJobs 适配器。 */
export declare function createSinoJobsAdapter(options?: SinoJobsAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map