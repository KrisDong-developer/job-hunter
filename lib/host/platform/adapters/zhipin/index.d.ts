import type { AdapterLogger, SiteAdapter } from '../../types.js';
import type { ZhipinConfig } from './config.js';
export interface ZhipinAdapterOptions {
    config?: ZhipinConfig;
    delayRangeMs?: [number, number];
    waitForListMs?: number;
    /** 诊断日志：只用于上报"接口通道静默降级了"这一类**不报警的坏法**。 */
    logger?: AdapterLogger;
}
/** 构造 BOSS 直聘适配器。 */
export declare function createZhipinAdapter(options?: ZhipinAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map