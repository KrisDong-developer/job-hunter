import { DomainError, messageOf } from '../../util/errors.js';
import { systemClock } from '../../util/time.js';
import { guardAuthority } from '../token.js';
export const GREETING_SEND_ACTION = 'greeting.send';
/**
 * 发送打招呼。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function sendGreeting(deps, guardToken, input) {
    // ── 第一行：机制化强制 ────────────────────────────────────────────
    guardAuthority.assert(guardToken, GREETING_SEND_ACTION);
    const clock = deps.clock ?? systemClock;
    const job = deps.store.job.detail(input.jobId);
    if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`);
    }
    const adapter = deps.registry.get(job.platformId);
    if (adapter === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${job.platformId}`);
    }
    // 二次确认登录态：审批期间登录可能已经失效
    const account = deps.session.status(job.platformId);
    if (!account.loggedIn) {
        throw new DomainError('NOT_LOGGED_IN', `${adapter.displayName} 未登录`, {
            hint: `请先在「平台与登录」里完成 ${job.platformId} 的登录，再重试。`,
            detail: { platformId: job.platformId },
        });
    }
    const sayHello = adapter.actions?.sayHello;
    if (sayHello === undefined) {
        // 诚实地说"还没做"，而不是假装成功 —— 这是 P8「失败必须可见」的直接体现
        throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现打招呼动作`, {
            hint: '目前只有 job/greeting_draft 这类低危能力可用；真正发送需要在适配器里实现 chat 流程。' +
                '在此之前发送一律失败，不会静默变成"已发送"。',
            detail: { platformId: job.platformId, action: GREETING_SEND_ACTION },
        });
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