import type { PageLike, SiteAdapter } from '../../types.js';
import type { ZhaopinConfig } from './config.js';
export interface ZhaopinActionsContext {
    config: ZhaopinConfig;
    /** 抓取请求之间的拟人延时区间（工厂从 `options.delayRangeMs` 读到的那一份）。 */
    delayRangeMs: [number, number];
    /** 判墙实现留在 index.ts（`guard.detectBlock` 也要用它 —— 一处实现两个消费者），这里只拿断言入口。 */
    assertActionPage(page: PageLike): Promise<void>;
    /**
     * 等会话页容器渲染出来的上限（ms），工厂从 `options.waitForListMs` 读到的那一份。
     *
     * ⚠️ 这是搬运时**必须**补上的一项：`readInbox` 原实现读的是工厂闭包里的
     * `options.waitForListMs`（数据以接口为准，这次等待只是"页面确实到了会话页"的旁证）。
     */
    waitForListMs?: number;
}
/**
 * 装配智联的动作链。**这里是动作链唯一的入口**：`index.ts` 只负责把配置、延时区间
 * 与判墙断言传进来（判墙不能搬走 —— `guard.detectBlock` 是它的另一个消费者）。
 */
export declare function createZhaopinActions(ctx: ZhaopinActionsContext): NonNullable<SiteAdapter['actions']>;
//# sourceMappingURL=actions.d.ts.map