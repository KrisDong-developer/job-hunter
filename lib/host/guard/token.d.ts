import type { Actor, Danger } from './types.js';
/**
 * 进程内共享的令牌权威。
 *
 * 用**单例**是刻意的：危险实现位于 `guard/actions/`，它需要在首行拿到同一个权威去校验令牌。
 * 把权威从 guard 一路传进每个动作，只会让"忘记传"变成新的绕过方式。
 * 令牌本身是唯一对象、校验还要求它出现在当前 `AsyncLocalStorage` 上下文里，
 * 所以共享权威不会让两个 guard 互相干扰。
 */
export declare const guardAuthority: GuardAuthority;
export interface GuardToken {
    readonly id: string;
    readonly action: string;
    readonly actor: Actor;
    readonly danger: Danger;
    readonly issuedAt: number;
    /** 一次性：用过就作废。 */
    used: boolean;
}
export interface GuardAuthority {
    /** 签发一个一次性令牌。 */
    issue(input: {
        action: string;
        actor: Actor;
        danger: Danger;
    }): GuardToken;
    /** 在令牌的上下文中执行；期间 `current()` 可见。 */
    run<T>(token: GuardToken, fn: () => Promise<T>): Promise<T>;
    /** 当前异步上下文里的令牌。 */
    current(): GuardToken | undefined;
    /** 危险实现的首行校验。失败抛 `GUARD_DENIED`。 */
    assert(token: GuardToken | undefined, action: string): void;
    /** 供诊断：已签发但未结算的令牌数。 */
    liveCount(): number;
}
export declare function createGuardAuthority(): GuardAuthority;
//# sourceMappingURL=token.d.ts.map