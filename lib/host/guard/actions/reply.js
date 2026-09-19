import { DomainError, messageOf } from '../../util/errors.js';
import { systemClock } from '../../util/time.js';
import { guardAuthority } from '../token.js';
export const REPLY_SEND_ACTION = 'message.reply';
/**
 * 回复一条 HR 消息。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function sendReply(deps, guardToken, input) {
    // ── 第一行：机制化强制 ────────────────────────────────────────────
    guardAuthority.assert(guardToken, REPLY_SEND_ACTION);
    const clock = deps.clock ?? systemClock;
    const target = deps.store.pipeline.getMessage(input.messageId);
    if (target === undefined) {
        throw new DomainError('NOT_FOUND', `消息不存在：${String(input.messageId)}`, {
            detail: { messageId: input.messageId },
        });
    }
    if (target.jobId === null) {
        // 没有岗位就定位不到会话（平台侧要靠公司/岗位标题匹配那一行）—— 如实拒绝，不乱猜一个会话
        throw new DomainError('INVALID_INPUT', '这条消息没有关联岗位，无法定位到具体会话，不能回复', {
            hint: '回复需要知道"发往哪个岗位的会话"；请在带岗位的消息上回复，或先把它关联到岗位。',
            detail: { messageId: target.id, platformId: target.platformId },
        });
    }
    const job = deps.store.job.detail(target.jobId);
    if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(target.jobId)}`, {
            detail: { jobId: target.jobId },
        });
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
    const reply = adapter.actions?.reply;
    if (reply === undefined) {
        // 诚实地说"还没做"，而不是静默只写本地记录（那正是这个文件存在的原因）
        throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现"回复消息"`, {
            hint: '在此之前回复一律失败 —— 不会再出现"本地记了一条、平台上没发出去"的情况。' +
                '目前只有 zhipin 实现了 reply。',
            detail: { platformId: job.platformId, action: REPLY_SEND_ACTION },
        });
    }
    const page = await deps.pageSource.acquire();
    try {
        const result = await reply(page, { title: job.title, company: job.companyName ?? '', sourceUrl: job.sourceUrl }, input.text);
        if (!result.ok) {
            // ⚠️ 不落本地记录：把适配器给的 delivery / evidence 原样带上，让上层如实转述
            throw new DomainError('INTERNAL', result.message ?? '回复发送失败', {
                hint: result.delivery === 'pending'
                    ? '动作看起来已经发出，但没能确认送达 —— 请去平台上核对，不要立刻重试（可能重复发送）。'
                    : '平台侧没有把这条回复发出去。先确认页面上发生了什么，不要立刻重试。',
                detail: {
                    platformId: job.platformId,
                    delivery: result.delivery,
                    evidence: result.evidence,
                },
            });
        }
        deps.logger?.info(`[guard] 已回复「${job.companyName ?? job.title}」（delivery=${result.delivery}，未记录正文）`);
        try {
            deps.record?.({
                jobId: job.id,
                platformId: job.platformId,
                content: input.text,
                actor: guardToken.actor,
            });
        }
        catch (error) {
            deps.logger?.warn(`[guard] 回复已发出，但本地记录写入失败：${messageOf(error)}`);
        }
        return {
            messageId: target.id,
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
        throw new DomainError('INTERNAL', `发送回复失败：${messageOf(error)}`);
    }
    finally {
        await deps.pageSource.release(page).catch(() => undefined);
    }
}
//# sourceMappingURL=reply.js.map