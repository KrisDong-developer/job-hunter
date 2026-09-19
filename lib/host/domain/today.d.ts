/**
 * U0 今日聚合（§5.4：首屏要回答「今天干什么」）。
 *
 * 只聚合**现在真有数据**的东西。待跟进 / 面试 / 额度分别属于 P7 与 P5（guard），
 * 这里刻意不返回恒为 0 的占位字段 —— 界面上显示一个假的「0 个面试」比不显示更误导。
 */
import type { TodayDto } from '../../shared/contract/dto/today.js';
import type { Store } from '../store/store.js';
import type { OfferService } from './offers.js';
import type { AdapterRegistry } from '../platform/registry.js';
import { type Clock } from '../util/time.js';
export interface TodayDeps {
    store: Store;
    registry: AdapterRegistry;
    clock?: Clock;
    /** 未关闭待办最多返回多少条。 */
    todoLimit?: number;
    /**
     * Offer 服务（可选）。
     *
     * 为什么用 `Pick` 而不是整个 `OfferService`：首屏只要两个读数，
     * 而"首屏依赖了哪些能力"应当一眼看得出来 —— 传整个服务会让这里慢慢长成第二个聚合层。
     */
    offers?: Pick<OfferService, 'openCount' | 'upcoming'>;
}
export declare function buildToday(deps: TodayDeps): TodayDto;
/** 数据层没就绪时的 U0：如实说明原因，而不是给一片空白。 */
export declare function buildTodayUnavailable(reason: string, now: string): TodayDto;
//# sourceMappingURL=today.d.ts.map