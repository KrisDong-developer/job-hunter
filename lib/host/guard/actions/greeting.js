import { DomainError, messageOf } from '../../util/errors.js';
import { systemClock } from '../../util/time.js';
import { guardAuthority } from '../token.js';
export const GREETING_SEND_ACTION = 'greeting.send';
/**
 * 平台层面的预检：适配器实现了 `sayHello` 没有、登录态还在不在。
 *
 * 单条发送、批量预览**共用这一份**：批量预览如果自己再写一套"能不能发"的判断，
 * 两份迟早会漂移 —— 而漂移的表现恰恰是预览说能发、点下去才失败，那比没有预览更恼火。
 *
 * 顺序是刻意的：**能力先于登录**。"这个平台压根不支持打招呼"比"你还没登录"更接近事实 ——
 * 登录了也还是一样发不出去，先说后者会让人白登录一次。
 */
export function greetingPlatformBlocker(deps, platformId) {
    const adapter = deps.registry.get(platformId);
    if (adapter === undefined) {
        return {
            code: 'platform_unsupported',
            message: `未注册的平台：${platformId}`,
            hint: '这个平台可能已经从适配器里下线了。',
        };
    }
    if (adapter.actions?.sayHello === undefined) {
        return {
            code: 'platform_unsupported',
            message: `${adapter.displayName} 的适配器还没实现打招呼动作`,
            hint: '平台自身没有稳定的"发起聊天"入口契约，所以这里如实标成发不出去 —— ' +
                '不会让你点下去再失败（更不会静默变成"已发送"）。',
        };
    }
    const account = deps.session.status(platformId);
    if (!account.loggedIn) {
        return {
            code: 'not_logged_in',
            message: `${adapter.displayName} 未登录`,
            hint: `请先在「平台与登录」里完成 ${platformId} 的登录。`,
        };
    }
    return null;
}
/**
 * 只读预检：岗位在不在，以及这个平台能不能发（后者走 `greetingPlatformBlocker`）。
 *
 * @param deps 只要这三个依赖，所以不需要页面、也不会产生任何副作用
 */
export function greetingReadinessOf(deps, jobId) {
    const job = deps.store.job.detail(jobId);
    if (job === undefined) {
        return { ok: false, code: 'NOT_FOUND', message: `岗位不存在：${String(jobId)}`, hint: '它可能已被删除。' };
    }
    const platformBlocker = greetingPlatformBlocker(deps, job.platformId);
    if (platformBlocker !== null) {
        return {
            ok: false,
            // 两种预检码映射回发送路径原有的错误码：调用方（单条发送）看到的行为与以前一致
            code: platformBlocker.code === 'not_logged_in' ? 'NOT_LOGGED_IN' : 'ADAPTER_BROKEN',
            message: platformBlocker.message,
            hint: platformBlocker.hint,
        };
    }
    return { ok: true, job, adapterName: deps.registry.get(job.platformId)?.displayName ?? job.platformId };
}
/**
 * 发送打招呼。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function sendGreeting(deps, guardToken, input) {
    // ── 第一行：机制化强制 ────────────────────────────────────────────
    guardAuthority.assert(guardToken, GREETING_SEND_ACTION);
    const clock = deps.clock ?? systemClock;
    // 能力与登录态的判据与批量预览**共用一份**（见 `greetingReadinessOf`）。
    // 这里再查一次不是重复：审批期间登录可能已经失效。
    const ready = greetingReadinessOf(deps, input.jobId);
    if (!ready.ok) {
        throw new DomainError(ready.code, ready.message, { hint: ready.hint });
    }
    const job = ready.job;
    const sayHello = deps.registry.get(job.platformId)?.actions?.sayHello;
    if (sayHello === undefined) {
        // 上面刚查过，这里只是给类型收窄；理论上不可达，所以语气要如实
        throw new DomainError('ADAPTER_BROKEN', `${ready.adapterName} 的适配器还没实现打招呼动作`);
    }
    const page = await deps.pageSource.acquire();
    try {
        const result = await sayHello(page, { title: job.title, company: job.companyName ?? '', sourceUrl: job.sourceUrl }, input.text);
        if (!result.ok) {
            throw new DomainError('INTERNAL', result.message ?? '发送打招呼失败', {
                hint: '平台返回了失败。不要立刻重试 —— 先确认页面上发生了什么。',
            });
        }
        deps.logger?.info(`[guard] 已向「${job.companyName ?? job.title}」发送打招呼（未记录正文）`);
        // 记账放在**发送成功之后**：失败也记"已打招呼"会让状态机从第一天起就说谎。
        // 记账本身失败不能反过来说"发送失败" —— 消息确实发出去了，所以只告警。
        try {
            deps.record?.({
                jobId: job.id,
                platformId: job.platformId,
                content: input.text,
                actor: guardToken.actor,
                delivery: result.delivery,
            });
        }
        catch (error) {
            deps.logger?.warn(`[guard] 打招呼已发出，但接触记录写入失败：${messageOf(error)}`);
        }
        return {
            jobId: job.id,
            platformId: job.platformId,
            company: job.companyName ?? '',
            title: job.title,
            sentAt: clock(),
            // 审计与返回值都只留长度，不留正文
            textLength: input.text.length,
        };
    }
    catch (error) {
        if (error instanceof DomainError)
            throw error;
        throw new DomainError('INTERNAL', `发送打招呼失败：${messageOf(error)}`);
    }
    finally {
        await deps.pageSource.release(page).catch(() => undefined);
    }
}
//# sourceMappingURL=greeting.js.map