/**
 * 危险动作实现：**投递简历**（`application.send` 的平台侧执行）。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * 真正"把简历发出去"这件事只能经 `guard.run()` 拿到令牌后走到这里。
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 *
 * 与 `pipeline.recordApplication` 的分工：
 *   * `recordApplication` = 用户说"我把简历投了"，记一笔（本身也过闸门）；
 *   * 本文件 = **适配器真的把简历发出去了**，然后由 `record` 回调落库。
 *     两件事都叫"投递"，但一件是记账，一件是对外发东西。
 *
 * `delivery` 是这条动作里唯一不能猜的东西：适配器没说 `delivered` 就不算发出去了，
 * 失败时把 `delivery` / `evidence` 原样带进错误 detail，让上层能如实转述。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { DeliveryState } from '../../../shared/contract/enums/job.js';
import type { JobDto } from '../../../shared/contract/dto/job.js';
import type { PageSource } from '../../platform/types.js';
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardToken } from '../token.js';
export declare const APPLICATION_SEND_ACTION = "application.send";
export interface ApplicationSendDeps {
    store: Store;
    registry: AdapterRegistry;
    session: SessionService;
    pageSource: PageSource;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    /**
     * 投递**成功之后**记一笔（P7）。
     *
     * 与 `greeting.ts` 的 `record` 同一分工：这条动作的职责是"把简历发出去"，
     * 落库口径属于 pipeline 的语义。必须发生在**成功之后** —— 发失败了也记一条"已投递"，
     * 看板从第一天开始就说谎。
     */
    record?: (input: {
        jobId: number;
        platformId: string;
        actor: string;
        filePath: string | null;
        delivery: DeliveryState;
    }) => void;
}
export interface ApplicationSendInput {
    jobId: number;
    /**
     * 本地简历文件的**绝对路径**；`null` = 走平台内简历（BOSS 求职者网页端只支持这一种）。
     *
     * ⚠️ 这一格**不接受外部输入**：路径由 `runtime/actions.ts` 从 `resume_file.id`
     * 自己查出来（`join(filesDir, path)`）。HTTP 与工具层只收 id ——
     * 让请求体直接给一个绝对路径就是一个"任意路径读文件"的洞
     * （与 `readExportFile` 同一条纪律）。
     */
    filePath: string | null;
}
export interface ApplicationSendResult {
    jobId: number;
    platformId: string;
    company: string;
    title: string;
    sentAt: string;
    delivery: DeliveryState;
    /** 适配器给的可读说明（例如"平台只支持平台内简历"）。 */
    detail?: string;
}
/**
 * 「用了哪版简历」那句话（§4.4.2 要求审批文案含它）。
 *
 * 三段必须都在，因为它们是三件不同的事：**哪一份**、**会不会真的传上去**、
 * 以及**没传的话平台会用什么**。只写一个文件名（上一版写的是绝对路径）会让用户
 * 以为自己传了这一版，而平台上收到的其实是另一版 —— 投递不可逆，这种误解代价最大。
 *
 * 放在这一层是因为**批量预览与单条审批共用同一句话**：两处各写一句必然漂移。
 */
export declare function resumeVersionTextOf(input: {
    label: string | null;
    uploads: boolean;
}): string;
/** 「这个平台现在能不能投」的**只读预检**结果（与岗位无关，只看平台能力与登录态）。 */
export interface ApplicationPlatformBlocker {
    code: 'platform_unsupported' | 'not_logged_in';
    message: string;
    hint: string;
}
/**
 * 平台层面的预检：适配器实现了 `sendResume` 没有、登录态还在不在。
 *
 * 单条投递、批量预览**共用这一份**（与 `greetingPlatformBlocker` 同一个理由：
 * 写两份判断迟早漂移，而漂移的表现是"预览说能投、点下去才失败"）。
 *
 * 顺序是刻意的：**能力先于登录**。"这个平台压根没接投递"比"你还没登录"更接近事实 ——
 * 登录了也还是一样投不出去。
 */
export declare function applicationPlatformBlocker(deps: {
    registry: AdapterRegistry;
    session: SessionService;
}, platformId: string): ApplicationPlatformBlocker | null;
/** 「这条现在能不能投」的**只读预检**结果（岗位 + 平台）。 */
export type ApplicationReadiness = {
    ok: true;
    job: JobDto;
    adapterName: string;
} | {
    ok: false;
    code: 'NOT_FOUND' | 'NOT_LOGGED_IN' | 'ADAPTER_BROKEN';
    message: string;
    hint: string;
};
/**
 * 只读预检：岗位在不在，以及这个平台能不能投（后者走 `applicationPlatformBlocker`）。
 *
 * @param deps 只要这三个依赖，所以不需要页面、也不会产生任何副作用
 */
export declare function applicationReadinessOf(deps: {
    store: Store;
    registry: AdapterRegistry;
    session: SessionService;
}, jobId: number): ApplicationReadiness;
/**
 * 投递简历（平台侧执行）。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function sendApplication(deps: ApplicationSendDeps, guardToken: GuardToken, input: ApplicationSendInput): Promise<ApplicationSendResult>;
//# sourceMappingURL=application.d.ts.map