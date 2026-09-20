import type { PageLike, SiteAdapter } from '../../types.js';
import type { ZhipinConfig } from './config.js';
export interface ZhipinActionsContext {
    config: ZhipinConfig;
    /** 判墙实现留在 index.ts（`guard.detectBlock` 也要用它 —— 一处实现两个消费者），这里只拿断言入口。 */
    assertActionPage(page: PageLike): Promise<void>;
}
export declare function createZhipinActions(ctx: ZhipinActionsContext): NonNullable<SiteAdapter['actions']>;
//# sourceMappingURL=actions.d.ts.map