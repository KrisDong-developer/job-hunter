/**
 * 登录态检测与引导（§4.2.3）。
 *
 * 需求 §7 点名的坑：**抓到登录墙必须报 `NOT_LOGGED_IN`，绝不允许当作「没有新岗位」**。
 * 所以这里做的不是"猜用户有没有登录"这种含糊事，而是：
 *   1. 把「被登录墙挡住」这个事实**持久化**到 `account_state`；
 *   2. 主动产生待办告警（P8：失败必须可见）；
 *   3. 登录引导：打开登录页 → 轮询 → 成功即回写状态并关掉告警。
 */
import type { AccountStateDto, LoginStatusDto } from '../../shared/dto.js';
import type { EventBus } from '../http/sse.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
import type { AdapterRegistry } from './registry.js';
import type { PageSource } from './types.js';
export interface AccountStateRecord {
    platformId: string;
    loggedIn: boolean;
    hiddenFromCurrentEmployer: boolean | null;
    lastCheckAt: string | null;
    hint: string | null;
    updatedAt: string | null;
}
export interface SessionService {
    status(platformId: string): AccountStateRecord;
    list(): AccountStateRecord[];
    markLoggedIn(platformId: string): void;
    /** 记录「被登录墙挡住」，并按需产生待办。 */
    markLoginRequired(platformId: string, hint: string): void;
    /** D4 隐身状态（高危动作前强制校验，P5 用；这里只负责存）。 */
    recordHidden(platformId: string, hidden: boolean | null): void;
}
export declare function toAccountDto(record: AccountStateRecord): AccountStateDto;
export declare function createSessionService(store: Store, clock?: Clock): SessionService;
export interface LoginFlowDeps {
    registry: AdapterRegistry;
    session: SessionService;
    pageSource: PageSource;
    events: EventBus;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    pollIntervalMs?: number;
    timeoutMs?: number;
    /** 便于测试控制"等待"。 */
    sleep?: (ms: number) => Promise<void>;
}
export interface LoginFlow {
    /** 打开登录页并开始轮询。**立即返回**，进度通过 `status()` 查。 */
    start(platformId: string): LoginStatusDto;
    status(platformId: string): LoginStatusDto;
    /** 直接驱动一轮检测（测试与「手动再查一次」都用它）。 */
    pollOnce(platformId: string): Promise<LoginStatusDto>;
    cancelAll(): void;
    /**
     * 是否有平台正在跑登录引导（轮询中）。
     *
     * 给"浏览器空闲自关"当守卫用：登录窗口是**用户正在操作**的那个页面，
     * 空闲到点把它关掉等于把用户正在输密码的窗口关掉。
     */
    isRunning(): boolean;
}
export declare function createLoginFlow(deps: LoginFlowDeps): LoginFlow;
//# sourceMappingURL=session.d.ts.map