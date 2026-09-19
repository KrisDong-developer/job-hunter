/**
 * 批量打招呼（D3 / U1）：**预览**与**执行**。
 *
 * ## 为什么单独一个模块，而不是塞进 `actions.ts` 的编排里
 *
 * 因为它要能被**离线测**。真正的发送（`sendGreeting`）必须碰页面，
 * 而"批量"这件事本身——哪些条能发、为什么不能、逐条回执怎么组装——
 * 全是纯逻辑。所以这里把发送/生成/闸门都当作**注入的依赖**，
 * 于是"逐条过闸门、逐条回执"可以在没有浏览器的情况下被钉住。
 *
 * ## 两条设计决定
 *
 * 1. **预览必须预测准**，否则它会变成"看着挺好、点下去一半失败"的装饰。
 *    所以预览里做了两件真实模拟：
 *      * `duplicate_company`：同一家公司（冷却期内只让发一条，默认 24 小时）；
 *      * `quota_exhausted`：按**当前额度余量**推算，这一批里只有前 N 条能出去。
 *    这两件都不是查表得来的，而是照着 `checkCooldown` / `checkQuota` 的口径算的
 *    （额度余量直接读 `guardUsageOf`，与判定同源）。
 * 2. **逐条回执，永不整批失败**。一条失败不影响后面的条 —— 批量发消息最糟的形态是
 *    "第 3 条挂了，剩下 17 条不知道发没发"。所以这里每条独立 try/catch，
 *    返回的 `receipts` 与传入顺序一一对应。
 *
 * ⚠️ 这里**不**放行任何东西：真正的判定仍在每一条的 `sendOne` → `guard.run()` 里。
 * 预览只是"提前把话说明白"。
 */
import { BATCH_ITEM_INTERVAL_MS, BATCH_MAX_ITEMS } from '../../shared/config/batch.js';
import { GREETING_SEND_ACTION } from '../guard/actions/greeting.js';
import { messageOf } from '../util/errors.js';
import { assertBatchSize, CompanyDeduper, failureOf, interItemDelayMs, QuotaReserver, } from './batch.js';
/** 闸门预检用的输入：与 `sendGreeting` 构造的那一份**同形**（规则读的就是这几个字段）。 */
function guardInputOf(item, actor) {
    return {
        action: GREETING_SEND_ACTION,
        actor,
        danger: 'high',
        target: {
            jobId: item.jobId,
            platformId: item.platformId,
            ...(item.companyId === null ? {} : { companyId: item.companyId }),
        },
        payload: { jobTitle: item.title, company: item.company },
    };
}
/** 预览：**只读、无副作用**。同一时刻反复调用结果一致（模型生成的话术可能不同）。 */
export async function previewGreetingBatch(deps, input) {
    const deduper = new CompanyDeduper(deps.cooldownMinutes());
    // 包一层箭头函数：不依赖调用方把 `remainingToday` 实现成不绑 this 的形式
    const quota = new QuotaReserver((platformId) => deps.remainingToday(platformId));
    const items = [];
    for (const jobId of input.jobIds) {
        const job = deps.store.job.detail(jobId);
        if (job === undefined) {
            items.push({
                jobId,
                title: `#${String(jobId)}`,
                company: '',
                platformId: '',
                willSend: false,
                blocker: { code: 'missing', message: `岗位不存在（#${String(jobId)}）`, hint: '它可能已经被清理掉了。' },
                text: null,
                via: null,
                sideEffect: null,
            });
            continue;
        }
        const base = {
            jobId: job.id,
            title: job.title,
            company: job.companyName ?? '',
            platformId: job.platformId,
        };
        const blocked = (blocker) => ({
            ...base,
            willSend: false,
            blocker,
            text: null,
            via: null,
            sideEffect: deps.sideEffectOf(job.platformId),
        });
        // ① 平台能力与登录态：这两个不满足时连话术都不用生成
        const capability = deps.canSend(job.platformId);
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
        }, input.actor));
        if (!preview.ok) {
            items.push(blocked({
                code: 'guard_denied',
                message: preview.verdict.message ?? '被闸门拒绝',
                ...(preview.verdict.hint === undefined ? {} : { hint: preview.verdict.hint }),
                ...(preview.verdict.reason === undefined ? {} : { reason: preview.verdict.reason }),
            }));
            continue;
        }
        // ③ 批内同一家公司：冷却期只让发一条（默认 24 小时）。
        //    这不是查表，而是照 `checkCooldown` 的口径算 —— 第一个通过闸门的公司先把名额占掉。
        if (deduper.blocked(job.companyId)) {
            items.push(blocked({
                code: 'duplicate_company',
                message: `同一家公司（${job.companyName ?? `#${String(job.companyId)}`}）在这一批里已经排了一条`,
                hint: `冷却期 ${String(deduper.cooldownMinutes)} 分钟（默认 24 小时）。真人也只会联系一次 —— 想连发请先改冷却期。`,
            }));
            continue;
        }
        // ④ 批内额度预占：把"这一批发出去会消耗掉的名额"算进去
        const reserved = quota.take(job.platformId);
        if (!reserved.reserved) {
            items.push(blocked({
                code: 'quota_exhausted',
                message: `今天在 ${job.platformId} 的打招呼额度已经用完（${String(reserved.used)}/${String(reserved.limit)}），本批前面的条已占满`,
                hint: '明天再发，或到设置里调整每日额度（平台侧上限改不了）。',
            }));
            continue;
        }
        // ⑤ 到这一步才生成话术 —— 前面的检查已经把"注定发不出去"的项筛掉了
        let text;
        let via;
        try {
            const drafted = await deps.draft({ jobId: job.id });
            text = drafted.text;
            via = drafted.via;
        }
        catch (error) {
            items.push(blocked({
                code: 'draft_failed',
                message: `话术生成失败：${messageOf(error)}`,
                hint: '可以在设置里检查模型开关，或先在岗位详情里手动生成一次。',
            }));
            continue;
        }
        // 到这一步才占同公司的名额：话术都没生成出来就谈不上"这一条已经发出去了"
        deduper.take(job.companyId);
        items.push({
            ...base,
            willSend: true,
            blocker: null,
            text,
            via,
            sideEffect: deps.sideEffectOf(job.platformId),
        });
    }
    const sendable = items.filter((item) => item.willSend).length;
    return {
        generatedAt: deps.clock(),
        items,
        sendable,
        blocked: items.length - sendable,
        batchMax: BATCH_MAX_ITEMS,
        intervalMs: { ...BATCH_ITEM_INTERVAL_MS },
        note: '这是**预测**：同公司冷却与当日额度都在这一批内模拟过，但真正的判定仍发生在每一条的闸门上，' +
            '不一致时以实际结果为准。只会为"能发"的项生成话术 —— 注定发不出去的岗位不值得花模型调用。',
    };
}
/**
 * 逐条发送。
 *
 * 每条都：`sendOne`（= 过闸门 + 审批 + 记账）→ 成功/失败各记一条回执。
 * 条与条之间插入**随机间隔**（D3 的"随机间隔"；由宿主保证，界面与模型都绕不过）。
 */
export async function sendGreetingBatch(deps, input) {
    assertBatchSize(input.items.length, BATCH_MAX_ITEMS, '发送');
    const startedAt = Date.now();
    const receipts = [];
    for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index];
        if (item === undefined)
            continue;
        // 间隔插在**条与条之间**：第一条不等（用户刚点完确认），最后一条后面也不用等
        const delay = interItemDelayMs(index, deps.random, BATCH_ITEM_INTERVAL_MS);
        if (delay !== null)
            await deps.sleep(delay);
        const job = deps.store.job.detail(item.jobId);
        const base = {
            jobId: item.jobId,
            title: job?.title ?? `#${String(item.jobId)}`,
            company: job?.companyName ?? '',
        };
        try {
            const result = await deps.sendOne({
                jobId: item.jobId,
                ...(item.text === undefined || item.text.trim() === '' ? {} : { text: item.text }),
                actor: input.actor,
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
                // 整批条数带进闸门：§22.4 的批量上限按"这次调用涉及几个岗位"算，
                // 而不是按"这一个请求发了几条"算
                batchSize: input.items.length,
            });
            receipts.push({
                ...base,
                ok: true,
                sentAt: result.sentAt,
                textLength: result.textLength,
                code: null,
                message: null,
                hint: null,
            });
        }
        catch (error) {
            // 一条失败**绝不**影响后面的条：批量最糟的形态是"第 3 条挂了，
            // 剩下 17 条不知道发没发"。所以这里吞掉异常、如实回执。
            const failure = failureOf(error);
            receipts.push({
                ...base,
                ok: false,
                sentAt: null,
                textLength: null,
                code: failure.code,
                message: failure.message,
                hint: failure.hint,
            });
        }
    }
    const sent = receipts.filter((receipt) => receipt.ok).length;
    return {
        executedAt: deps.clock(),
        receipts,
        sent,
        failed: receipts.length - sent,
        elapsedMs: Date.now() - startedAt,
        note: `逐条过闸门、逐条回执：成功 ${String(sent)} 条、失败 ${String(receipts.length - sent)} 条。` +
            '每条之间插了 3–9 秒随机间隔（D3 的"随机间隔"）——慢是有意的，连点是最明显的机器信号。' +
            '失败原因逐条给出，没有"整批失败"这种状态。',
    };
}
//# sourceMappingURL=greeting-batch.js.map