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
export declare const NO_NETWORK_ENV = "DSH_JOB_HUNTER_NO_NETWORK";
export declare function isOfflineMode(env?: NodeJS.ProcessEnv): boolean;
/** 离线模式下的统一拒绝。`what` 是要做的事（中文）。 */
export declare function offlineDenied(what: string): DomainError;
/** 在会发起真实访问的动作前调用；离线模式下直接抛。 */
export declare function assertNetworkAllowed(what: string): void;
//# sourceMappingURL=offline.d.ts.map