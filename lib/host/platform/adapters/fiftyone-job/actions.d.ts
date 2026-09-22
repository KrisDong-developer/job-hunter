import type { PageLike, SiteAdapter } from '../../types.js';
import type { FiftyOneConfig } from './config.js';
export interface FiftyOneActionsContext {
    config: FiftyOneConfig;
    /** 判墙实现留在 index.ts（`guard.detectBlock` 也要用它 —— 一处实现两个消费者），这里只拿断言入口。 */
    assertActionPage(page: PageLike): Promise<void>;
}
export declare function createFiftyOneActions(ctx: FiftyOneActionsContext): NonNullable<SiteAdapter['actions']>;
//# sourceMappingURL=actions.d.ts.map