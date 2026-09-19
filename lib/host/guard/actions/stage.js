import { CONTACT_STAGE_LABEL } from '../../../shared/contract/enums/pipeline.js';
import { DomainError, messageOf } from '../../util/errors.js';
import { systemClock } from '../../util/time.js';
import { guardAuthority } from '../token.js';
export const STAGE_PROBE_ACTION = 'contact.stage';
/**
 * 探测一个岗位当前的接触阶段。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function probeContactStage(deps, guardToken, input) {
    // ── 第一行：机制化强制 ────────────────────────────────────────────
    guardAuthority.assert(guardToken, STAGE_PROBE_ACTION);
    const clock = deps.clock ?? systemClock;
    const job = deps.store.job.detail(input.jobId);
    if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
            detail: { jobId: input.jobId },
        });
    }
    const adapter = deps.registry.get(job.platformId);
    if (adapter === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${job.platformId}`);
    }
    const account = deps.session.status(job.platformId);
    if (!account.loggedIn) {
        throw new DomainError('NOT_LOGGED_IN', `${adapter.displayName} 未登录`, {
            hint: `请先在「平台与登录」里完成 ${job.platformId} 的登录，再重试。`,
            detail: { platformId: job.platformId },
        });
    }
    const detect = adapter.actions?.detectStage;
    if (detect === undefined) {
        // 说实话：没实现就说没实现，别返回一个"看起来像 none"的东西
        throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现"探测接触阶段"`, {
            hint: '目前只有 zhipin 实现了它。在此之前不要据此改动接触态。',
            detail: { platformId: job.platformId, action: STAGE_PROBE_ACTION },
        });
    }
    const page = await deps.pageSource.acquire();
    try {
        const stage = await detect(page, {
            title: job.title,
            company: job.companyName ?? '',
            sourceUrl: job.sourceUrl,
        });
        deps.logger?.info(`[guard] 探测接触阶段：岗位 #${String(job.id)}（${job.platformId}）→ ${stage ?? '判不出来'}`);
        return {
            jobId: job.id,
            platformId: job.platformId,
            stage,
            note: stage === null
                ? '平台侧判不出这个岗位的阶段：会话可能不在列表里（从没打过招呼，或已被平台移出保留窗口），' +
                    '也可能状态标记认不出来 —— 这两种情况不敢猜，所以不给结论。**没有改动任何本地状态。**'
                : `平台侧看到的是「${CONTACT_STAGE_LABEL[stage]}」。**没有改动任何本地状态** —— 要不要推进接触态由你显式确认。`,
            checkedAt: clock(),
        };
    }
    catch (error) {
        if (error instanceof DomainError)
            throw error;
        throw new DomainError('INTERNAL', `探测接触阶段失败：${messageOf(error)}`);
    }
    finally {
        await deps.pageSource.release(page).catch(() => undefined);
    }
}
//# sourceMappingURL=stage.js.map