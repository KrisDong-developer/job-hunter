/**
 * 批量投递（L4）：**预览**与**执行**。
 *
 * ## 与 `greeting-batch.ts` 的关系
 *
 * 两者是同一个形状（预览 → 一次确认 → 逐条过闸门 → 逐条回执），共用机制在 `batch.ts`
 * （批内同公司去重、批内额度预占、条间随机间隔、上限校验、失败翻译）。
 * 这里只放**投递独有**的部分，而那些部分恰恰是投递更危险的地方：
 *
 * 1. **用哪份简历**：整批共用一份（`resumeFileId`，`null` = 平台内简历）。§4.4.2 要求
 *    审批时能看到"用了哪版简历"，所以它必须**先定下来**，而不是每条自己猜。
 * 2. **这份文件会不会真的传上去**：`sendResume` 的两个实现都对非空文件路径 fail-closed
 *    （实测：会话页没有"把本地文件发给 HR"的入口）。所以"选了本地附件"**不是**拦下这条的理由 ——
 *    平台只吃自己那份并不妨碍这次投递成功；它只决定一句话：这份文件到底传没传。
 *    逐条给 `uploadsResumeFile`，让界面与审批文案**都说得上实话**
 *    （否则用户以为自己传了一版，而平台上收到的其实是另一版）。
 * 3. **不可逆**：投递比打招呼重得多，所以回执里多一格 `delivery`。
 *    `pending`（动作发出去了但没能确认送达）必须与 `failed` 分开说 ——
 *    前者要用户去平台上核对，直接重投可能投两遍。
 *
 * ⚠️ 与打招呼同一条纪律：这里**不放行任何东西**。真正的判定在每一条的
 * `sendOne` → `guard.run()` 里（开关 / 隐身 / 窗口 / 休息日 / 额度 / 冷却 / 批量上限 / 审批）。
 */
import { BATCH_ITEM_INTERVAL_MS, BATCH_MAX_ITEMS } from '../../shared/config/batch.js';
import { DELIVERY_STATE_LABEL } from '../../shared/contract/enums/job.js';
import { APPLICATION_SEND_ACTION, resumeVersionTextOf } from '../guard/actions/application.js';
import { DomainError } from '../util/errors.js';
import { assertBatchSize, CompanyDeduper, failureOf, interItemDelayMs, QuotaReserver, } from './batch.js';
/**
 * "这个岗位的**另一个平台副本**已经投过了" —— 只提醒，不拦。
 *
 * 判定链：岗位在某个去重分组里 → 组内其它成员 → 它们有没有投递记录。
 * 分组是启发式的（可能判错），所以**绝不能**拿它拦下一次投递；但"同一家公司的两个
 * 平台副本各投一次"正是跨平台去重想帮用户避免的重复劳动 —— 必须让人看见。
 *
 * 提醒里带上**是哪一条、哪个平台**：只说"你已经投过了"用户没法核对，
 * 而这条判断本身是有可能错的。
 */
export function appliedSiblingWarning(store, jobId) {
    const group = store.dedupGroup.findByJob(jobId);
    if (group === undefined)
        return null;
    for (const memberId of group.memberIds) {
        if (memberId === jobId)
            continue;
        const applied = store.pipeline.listApplications({ jobId: memberId, limit: 1 });
        if (applied.length === 0)
            continue;
        const sibling = store.job.detail(memberId);
        const date = applied[0]?.sentAt ?? '';
        return (`⚠️ 同一岗位的另一个平台副本已经投过了：${sibling?.platformId ?? `#${String(memberId)}`} 的「` +
            `${sibling?.title ?? ''}」（${date === '' ? '时间未记' : date.slice(0, 10)}）。` +
            '分组是按公司+城市+薪资+标题相似度判的，可能判错 —— 请自己核对一下再决定。');
    }
    return null;
}
/** 闸门预检用的输入：与 `sendApplication` 构造的那一份**同形**（规则读的就是这几个字段）。 */
function guardInputOf(item, actor, payload) {
    return {
        action: APPLICATION_SEND_ACTION,
        actor,
        danger: 'high',
        target: {
            jobId: item.jobId,
            platformId: item.platformId,
            ...(item.companyId === null ? {} : { companyId: item.companyId }),
        },
        payload: {
            jobTitle: item.title,
            company: item.company,
            resumeVersion: payload.resumeVersion,
            resumeFileId: payload.resumeFileId,
            ...(payload.sideEffect === null ? {} : { sideEffect: payload.sideEffect }),
        },
    };
}
/** 预览：**只读、无副作用**。反复调用结果一致（鉴权/额度读数可能随时间变）。 */
export async function previewApplicationBatch(deps, input) {
    const deduper = new CompanyDeduper(deps.cooldownMinutes());
    // 包一层箭头函数：不依赖调用方把 `remainingToday` 实现成不绑 this 的形式
    const quota = new QuotaReserver((platformId) => deps.remainingToday(platformId));
    const resumeFileId = input.resumeFileId;
    const resumeLabel = resumeFileId === null ? null : deps.resumeLabelOf(resumeFileId);
    // 整批共用一份简历 ⇒ "这份附件不存在"是整个请求的问题，不是某一条的问题：
    // 逐条报同一个错只会让用户以为 5 个岗位都坏了
    if (resumeFileId !== null && resumeLabel === null) {
        throw new DomainError('NOT_FOUND', `简历附件不存在：#${String(resumeFileId)}`, {
            hint: '它可能已经被删掉了；到「简历」页重新导出一份再投。',
        });
    }
    /** 审批与计划里对"用哪版简历"的说法只有一份（`resumeVersionTextOf`），避免两处各写一句。 */
    const items = [];
    /** 这一批里**至少有一条**会真的把选中的文件传上去（`false` = 全都只作本地登记）。 */
    let uploadsAny = false;
    for (const jobId of input.jobIds) {
        const job = deps.store.job.detail(jobId);
        if (job === undefined) {
            items.push({
                jobId,
                title: `#${String(jobId)}`,
                company: '',
                platformId: '',
                willDeliver: false,
                blocker: { code: 'missing', message: `岗位不存在（#${String(jobId)}）`, hint: '它可能已经被清理掉了。' },
                sideEffect: null,
                warning: null,
            });
            continue;
        }
        const base = {
            jobId: job.id,
            title: job.title,
            company: job.companyName ?? '',
            platformId: job.platformId,
        };
        /** 这一条**所在的平台**会不会真的把选中的文件传上去（没选文件时恒为 false，不进聚合）。 */
        const uploadsHere = resumeFileId !== null && deps.acceptsLocalResume(job.platformId);
        const blocked = (blocker) => ({
            ...base,
            willDeliver: false,
            blocker,
            sideEffect: deps.sideEffectOf(job.platformId),
            // 被拦下的那条不需要"重复投递"的提醒 —— 它本来就投不出去
            warning: null,
        });
        // ① 平台能力与登录态：不满足时后面几项都不用看了
        const capability = deps.platformBlocker(job.platformId);
        if (capability !== null) {
            items.push(blocked(capability));
            continue;
        }
        // ② 闸门预检（开关 / 发送窗口 / 休息日 / 隐身 / 额度 / 冷却）
        const preview = deps.previewGuard(guardInputOf({
            jobId: job.id,
            platformId: job.platformId,
            companyId: job.companyId,
            title: job.title,
            company: job.companyName ?? '',
        }, input.actor, {
            // 逐条给：这一句只进审批文案（规则不读它），但必须与真正发送时**同源**
            resumeVersion: resumeVersionTextOf({ label: resumeLabel, uploads: uploadsHere }),
            resumeFileId,
            sideEffect: deps.sideEffectOf(job.platformId),
        }));
        if (!preview.ok) {
            items.push(blocked({
                code: 'guard_denied',
                message: preview.verdict.message ?? '被闸门拒绝',
                ...(preview.verdict.hint === undefined ? {} : { hint: preview.verdict.hint }),
                ...(preview.verdict.reason === undefined ? {} : { reason: preview.verdict.reason }),
            }));
            continue;
        }
        // ④ 批内同一家公司：冷却期只让投一条（默认 24 小时）—— 照 `checkCooldown` 的口径算
        if (deduper.blocked(job.companyId)) {
            items.push(blocked({
                code: 'duplicate_company',
                message: `同一家公司（${job.companyName ?? `#${String(job.companyId)}`}）在这一批里已经排了一条`,
                hint: `冷却期 ${String(deduper.cooldownMinutes)} 分钟（默认 24 小时）。同一家公司投两份简历是最典型的机器行为。`,
            }));
            continue;
        }
        // ⑤ 批内额度预占：把"这一批发出去会消耗掉的名额"算进去
        const reserved = quota.take(job.platformId);
        if (!reserved.reserved) {
            items.push(blocked({
                code: 'quota_exhausted',
                message: `今天在 ${job.platformId} 的投递额度已经用完（${String(reserved.used)}/${String(reserved.limit)}），本批前面的条已占满`,
                hint: '明天再投，或到设置里调整每日额度（平台侧上限改不了）。',
            }));
            continue;
        }
        // 到这里才占同公司的名额：前面任何一步没过都谈不上"这条已经投出去了"
        deduper.take(job.companyId);
        if (uploadsHere)
            uploadsAny = true;
        items.push({
            ...base,
            willDeliver: true,
            blocker: null,
            sideEffect: deps.sideEffectOf(job.platformId),
            warning: appliedSiblingWarning(deps.store, job.id),
        });
    }
    const sendable = items.filter((item) => item.willDeliver).length;
    return {
        generatedAt: deps.clock(),
        items,
        sendable,
        blocked: items.length - sendable,
        batchMax: BATCH_MAX_ITEMS,
        intervalMs: { ...BATCH_ITEM_INTERVAL_MS },
        resumeFileId,
        resumeLabel,
        // 结构化而不是写进 note：界面要据此显示一句醒目的话，模型也要能判读
        // （文案那句在审批路径上由 `resumeVersionTextOf` 统一生成）
        uploadsResumeFile: resumeFileId === null ? null : uploadsAny,
        note: '这是**预测**：同公司冷却与当日额度余量都在这一批内模拟过，但真正的判定仍发生在每一条的闸门上，' +
            '不一致时以实际结果为准。投递**不可逆** —— 逐条回执里会给出送达状态。',
    };
}
/**
 * 逐条投递。
 *
 * 每条都：`sendOne`（= 过闸门 + 审批 + 适配器投递 + 成功后记账）→ 成功/失败各记一条回执。
 * 条与条之间插入**随机间隔**（D3 的"随机间隔"；由宿主保证，界面与模型都绕不过）。
 */
export async function sendApplicationBatch(deps, input) {
    assertBatchSize(input.jobIds.length, BATCH_MAX_ITEMS, '投递');
    const startedAt = Date.now();
    const receipts = [];
    for (let index = 0; index < input.jobIds.length; index += 1) {
        const jobId = input.jobIds[index];
        if (jobId === undefined)
            continue;
        // 间隔插在**条与条之间**：第一条不等（用户刚点完确认），最后一条后面也不用等
        const delay = interItemDelayMs(index, deps.random, BATCH_ITEM_INTERVAL_MS);
        if (delay !== null)
            await deps.sleep(delay);
        const job = deps.store.job.detail(jobId);
        const base = {
            jobId,
            title: job?.title ?? `#${String(jobId)}`,
            company: job?.companyName ?? '',
        };
        try {
            const result = await deps.sendOne({
                jobId,
                resumeFileId: input.resumeFileId,
                actor: input.actor,
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
                // 整批条数带进闸门：§22.4 的批量上限按"这次调用涉及几个岗位"算
                batchSize: input.jobIds.length,
            });
            receipts.push({
                ...base,
                ok: true,
                sentAt: result.sentAt,
                delivery: result.delivery,
                code: null,
                message: null,
                hint: null,
            });
        }
        catch (error) {
            // 一条失败**绝不**影响后面的条：批量最糟的形态是"第 3 条挂了，剩下几条不知道投没投"
            const failure = failureOf(error);
            receipts.push({
                ...base,
                ok: false,
                sentAt: null,
                delivery: null,
                code: failure.code,
                message: failure.message,
                hint: failure.hint,
            });
        }
    }
    const sent = receipts.filter((receipt) => receipt.ok).length;
    const failed = receipts.length - sent;
    /** 只到"已发出·未确认"的那些：**必须单独说出来**，否则用户会以为全都投成功了。 */
    const unconfirmed = receipts.filter((receipt) => receipt.ok && receipt.delivery !== null && receipt.delivery !== 'delivered').length;
    return {
        executedAt: deps.clock(),
        receipts,
        sent,
        failed,
        elapsedMs: Date.now() - startedAt,
        note: `逐条过闸门、逐条回执：成功 ${String(sent)} 条、失败 ${String(failed)} 条。` +
            (unconfirmed === 0
                ? ''
                : `其中 ${String(unconfirmed)} 条只到「${DELIVERY_STATE_LABEL.pending}」—— ` +
                    '动作可能已经生效，**先去平台上核对，不要直接重投**（投递不像打招呼，投重了收不回来）。') +
            '每条之间插了 3–9 秒随机间隔 ——慢是有意的，连点是最明显的机器信号。' +
            '失败原因逐条给出，没有"整批失败"这种状态。',
    };
}
//# sourceMappingURL=application-batch.js.map