/**
 * 离线闸门（§14：**自动化测试绝不访问真实招聘站**）。
 *
 * 为什么需要一段代码来管这件事：把"别访问真实站点"写成规矩是不够的。
 * 实测踩到过 —— 端到端脚本里模型仍然选了会抓取的 `job_search`，
 * 于是一次自动化运行真的打到了 51job。规矩要靠机制兜住，不能靠自觉。
 *
 * 打开方式：`DSH_JOB_HUNTER_NO_NETWORK=1`。
 * 打开后**一切会发起真实网络访问的动作**都被拒绝（抓取、登录引导），
 * 拒绝信息里直接说明这是离线模式、以及怎么关掉它 —— 不让用户对着一个
 * 莫名其妙的失败猜半天。
 *
 * 每次调用都重新读环境变量：测试要能在同一个进程里开关它。
 */
import { DomainError } from './errors.js';
export const NO_NETWORK_ENV = 'DSH_JOB_HUNTER_NO_NETWORK';
/** 允许触发真实网络访问的开关，取值 `1` / `true` / `yes`（大小写不敏感）。 */
const ON = new Set(['1', 'true', 'yes', 'on']);
export function isOfflineMode(env = process.env) {
    const raw = env[NO_NETWORK_ENV];
    if (typeof raw !== 'string')
        return false;
    const value = raw.trim().toLowerCase();
    return value !== '' && ON.has(value);
}
/** 离线模式下的统一拒绝。`what` 是要做的事（中文）。 */
export function offlineDenied(what) {
    return new DomainError('BLOCKED', `离线模式：不允许${what}`, {
        hint: '这是为了满足「自动化测试绝不访问真实招聘站」而设的开关。' +
            `去掉环境变量 ${NO_NETWORK_ENV} 重启即可解除。`,
        detail: { reason: 'offline-mode' },
    });
}
/** 在会发起真实访问的动作前调用；离线模式下直接抛。 */
export function assertNetworkAllowed(what) {
    if (isOfflineMode())
        throw offlineDenied(what);
}
//# sourceMappingURL=offline.js.map