import type { PageLike, SiteAdapter } from '../../types.js';
import type { LiepinConfig } from './config.js';
export interface LiepinActionsContext {
    config: LiepinConfig;
    /**
     * 判墙断言（实现留在 `index.ts` 的 `detectBlockOf` —— 采集与动作**共用同一份信号集**）。
     *
     * 动作链自己导航、自己发请求，主链的 `guard.detectBlock` 看不到途中的风控页，
     * 所以每个动作在导航之后必须自己判一次（见 `types.ts` 对 `actions` 的说明）。
     */
    assertActionPage(page: PageLike): Promise<void>;
    /** 抓取请求之间的随机延时区间（页与页之间用，避免连续快请求）。 */
    delayRangeMs: [number, number];
}
export declare function createLiepinActions(ctx: LiepinActionsContext): NonNullable<SiteAdapter['actions']>;
//# sourceMappingURL=actions.d.ts.map