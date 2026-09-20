import type { AdapterLogger, SiteAdapter } from '../../types.js';
import { type LiepinConfig } from './config.js';
export interface LiepinAdapterOptions {
    config?: LiepinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先；高斯 + 犹豫见 pacing.ts）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
    /** 诊断日志：只用于上报"接口通道静默降级了"这一类**不报警的坏法**。 */
    logger?: AdapterLogger;
}
/** 构造猎聘适配器。 */
export declare function createLiepinAdapter(options?: LiepinAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map