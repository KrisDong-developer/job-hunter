import { APPLICATION_CHANNELS, APPLICATION_STAGES, NO_PROGRESS_DAYS, STAGE_ORDER, TERMINAL_STAGES, stageRank } from '../../shared/contract/enums/pipeline.js';
import { systemClock } from '../util/time.js';
import { DomainError } from '../util/errors.js';
/** 未读超时阈值（小时）——超过就建议放弃（§3.3）。 */
export const UNREAD_TIMEOUT_HOURS = 72;
/** 已读未回超时阈值（小时）——超过就建议改简历/话术，而不是继续加量（§3.3 / §3.2）。 */
export const READ_TIMEOUT_HOURS = 24 * 7;
export function createPipelineService(deps) {
    const { store } = deps;
    const clock = deps.clock ?? systemClock;
    const decorate = (record) => {
        const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
        return {
            ...record,
            jobTitle: job?.title ?? null,
            companyName: job?.companyName ?? null,
            events: store.pipeline
                .listStageEvents('application', record.id, 20)
                .map((event) => ({ ...event })),
        };
    };
    const requireApplication = (id) => {
        const record = store.pipeline.getApplication(id);
        if (record === undefined) {
            throw new DomainError('NOT_FOUND', `投递记录不存在：${String(id)}`, {
                hint: '用 /board 或 /applications 看当前有哪些投递。',
                detail: { applicationId: id },
            });
        }
        return record;
    };
    /**
     * 落一条投递 + 首条状态事件。
     *
     * `recordApplication`（用户手动记一笔）与 `recordApplicationSent`（guard 的投递动作**成功之后**
     * 回调）共用 —— 两条路径各写一遍必然漂移，而"投递记录缺了状态事件"会让看板的历史说不出凭什么。
     */
    const insertApplication = (input) => {
        const record = store.pipeline.createApplication({
            jobId: input.jobId,
            resumeId: input.resumeId,
            resumeFileId: input.resumeFileId,
            channel: input.channel,
            actor: input.actor,
            note: input.note,
        }, clock());
        store.pipeline.appendStageEvent({
            entity: 'application',
            entityId: record.id,
            fromStage: null,
            toStage: 'sent',
            source: input.actor === 'model' ? 'model' : 'manual',
            note: input.note,
        }, clock());
        return decorate(record);
    };
    return {
        async recordApplication(input) {
            const job = store.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, { detail: { jobId: input.jobId } });
            }
            const channel = input.channel ?? 'platform';
            if (!APPLICATION_CHANNELS.includes(channel)) {
                throw new DomainError('INVALID_INPUT', `不支持的投递渠道：${String(channel)}`, {
                    hint: `合法取值：${APPLICATION_CHANNELS.join(' / ')}`,
                });
            }
            const resumeId = input.resumeId ?? store.resume.defaultResume()?.id ?? null;
            if (resumeId === null) {
                throw new DomainError('INVALID_INPUT', '还没有任何简历版本，无法记录投递', {
                    hint: '投递必须记下"用了哪份简历"——这是归因分析的基础（§11.3 / R6）。',
                });
            }
            // 投递是**高危**动作：走闸门（模型发起时必然要审批）。
            const run = deps.guardRun;
            const create = async () => insertApplication({
                jobId: job.id,
                resumeId,
                resumeFileId: input.resumeFileId ?? null,
                channel,
                actor: input.actor,
                note: input.note ?? null,
            });
            const result = run === undefined
                ? await create()
                : await run({
                    action: 'application.send',
                    actor: input.actor,
                    danger: 'high',
                    target: {
                        jobId: job.id,
                        platformId: job.platformId,
                        ...(job.companyId === null ? {} : { companyId: job.companyId }),
                    },
                    payload: {
                        jobTitle: job.title,
                        company: job.companyName ?? '',
                        channel,
                        // §4.4.2：审批文案必须写清"用了哪版简历"
                        resumeVersion: `#${String(resumeId)}`,
                        resumeFileId: input.resumeFileId ?? null,
                    },
                    ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
                }, create);
            deps.logger?.info(`[pipeline] 记录投递：岗位 #${String(job.id)}，渠道 ${channel}`);
            return result;
        },
        /**
         * 投递**已成功发出之后**记一笔（供 guard 的 `application.send` 动作回调）。
         *
         * 与 `recordApplication` 的关键差别：**不再走一次闸门** —— 调用方此刻已经在
         * `guard.run` 的令牌上下文里了，再走一次会变成"确认两次"甚至拿不到令牌。
         *
         * ⚠️ **不认识的版本一律记 null，不回退到"当前默认简历"**。
         * 适配器投递走的是**平台上那一份**简历，我们并不知道它与本地哪一版对应；
         * 填一个默认版本会让"按简历版本看转化率"（§13 U7 / F3 的 A/B）把结果归因到
         * 一份可能根本没投出去的简历上 —— 那比留空糟得多。留空只是少一行样本。
         */
        recordApplicationSent(input) {
            const job = store.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, { detail: { jobId: input.jobId } });
            }
            const channel = input.channel ?? 'platform';
            const record = insertApplication({
                jobId: job.id,
                resumeId: input.resumeId ?? null,
                resumeFileId: input.resumeFileId ?? null,
                channel,
                actor: input.actor,
                note: input.note ?? null,
            });
            deps.logger?.info(`[pipeline] 记录投递（已发出）：岗位 #${String(job.id)}，渠道 ${channel}`);
            return record;
        },
        advance(input) {
            const record = requireApplication(input.applicationId);
            if (!APPLICATION_STAGES.includes(input.to)) {
                throw new DomainError('INVALID_INPUT', `不支持的投递阶段：${String(input.to)}`, {
                    hint: `合法取值：${APPLICATION_STAGES.join(' / ')}`,
                });
            }
            if (input.to === record.stage)
                return decorate(record);
            const backward = stageRank(input.to) < stageRank(record.stage);
            // 终态回退是允许的（HR 有时会反悔），但必须显式说明 —— 否则就是手滑
            if (backward && input.allowBackward !== true) {
                throw new DomainError('INVALID_INPUT', `不允许把状态从「${record.stage}」回退到「${input.to}」`, {
                    hint: '回退要显式带上 allowBackward: true，并说明原因（会记进状态事件里）。',
                    detail: { from: record.stage, to: input.to },
                });
            }
            const changed = store.pipeline.advanceApplication(input.applicationId, input.to, clock());
            if (!changed)
                return decorate(requireApplication(input.applicationId));
            store.pipeline.appendStageEvent({
                entity: 'application',
                entityId: input.applicationId,
                fromStage: record.stage,
                toStage: input.to,
                source: input.source ?? (input.actor === 'model' ? 'model' : 'manual'),
                evidenceRef: input.evidenceRef ?? null,
                note: input.note ?? null,
            }, clock());
            deps.logger?.info(`[pipeline] 投递 #${String(input.applicationId)}：${record.stage} → ${input.to}` +
                `${backward ? '（回退）' : ''}`);
            return decorate(requireApplication(input.applicationId));
        },
        list(filter = {}) {
            return store.pipeline.listApplications(filter).map(decorate);
        },
        get(id) {
            return decorate(requireApplication(id));
        },
        board() {
            const rows = store.pipeline.boardRows();
            const columns = STAGE_ORDER.map((stage) => ({
                stage,
                cards: rows
                    .filter((row) => row.stage === stage)
                    .map((row) => ({
                    applicationId: row.id,
                    jobId: row.jobId ?? 0,
                    jobTitle: row.jobTitle,
                    companyName: row.companyName,
                    channel: row.channel,
                    stage: row.stage,
                    stageAt: row.stageAt,
                    sentAt: row.sentAt,
                    resumeId: row.resumeId,
                    daysSinceStage: daysBetween(row.stageAt, clock()),
                })),
            }));
            return {
                generatedAt: clock(),
                columns,
                total: rows.length,
                /** 待跟进：卡在中间阶段太久的（不进终态的都算在途）。 */
                staleCount: rows.filter((row) => !TERMINAL_STAGES.includes(row.stage) && daysBetween(row.stageAt, clock()) >= NO_PROGRESS_DAYS).length,
            };
        },
        history(jobId) {
            const applications = store.pipeline.listApplications({ jobId, limit: 50 });
            const greetings = store.pipeline.listGreetings({ jobId, limit: 50 });
            const events = [];
            for (const application of applications) {
                for (const event of store.pipeline.listStageEvents('application', application.id, 50)) {
                    events.push({ ...event, entity: 'application' });
                }
            }
            for (const greeting of greetings) {
                for (const event of store.pipeline.listStageEvents('greeting', greeting.id, 50)) {
                    events.push({ ...event, entity: 'greeting' });
                }
            }
            return events.sort((a, b) => b.at.localeCompare(a.at));
        },
        // ── 接触态 ────────────────────────────────────────────────────
        recordGreetingSent(input) {
            const stage = input.stage ?? 'greeted';
            const record = store.pipeline.createGreeting({
                jobId: input.jobId,
                platformId: input.platformId,
                templateId: input.templateId ?? null,
                content: input.content,
                channel: input.channel ?? 'platform',
                actor: input.actor,
                stage,
            }, clock());
            store.pipeline.appendStageEvent({
                entity: 'greeting',
                entityId: record.id,
                fromStage: 'none',
                toStage: stage,
                source: input.actor === 'model' ? 'model' : 'manual',
            }, clock());
            if (input.templateId !== undefined && input.templateId !== null) {
                store.pipeline.bumpTemplate(input.templateId, 'uses');
            }
            return record;
        },
        advanceContact(input) {
            const latest = store.pipeline.latestGreeting(input.jobId);
            if (latest === undefined) {
                throw new DomainError('NOT_FOUND', `岗位 #${String(input.jobId)} 还没有打招呼记录`, {
                    hint: '接触态挂在打招呼记录上（§7.0：最新一条即当前接触态），没有记录就没有可推进的状态。',
                    detail: { jobId: input.jobId },
                });
            }
            if (input.to === latest.stage)
                return latest;
            const changed = store.pipeline.advanceGreeting(latest.id, input.to, clock());
            if (!changed)
                return store.pipeline.latestGreeting(input.jobId) ?? latest;
            store.pipeline.appendStageEvent({
                entity: 'greeting',
                entityId: latest.id,
                fromStage: latest.stage,
                toStage: input.to,
                source: input.source ?? 'manual',
                evidenceRef: input.evidenceRef ?? null,
                note: input.note ?? null,
            }, clock());
            // 收到回复 → 给模板记一次回复，用于算回复率（§11.3）
            if (input.to === 'replied' || input.to === 'interview_scheduled') {
                if (latest.templateId !== null)
                    store.pipeline.bumpTemplate(latest.templateId, 'replies');
            }
            return store.pipeline.latestGreeting(input.jobId) ?? latest;
        },
        contactStage(jobId) {
            return store.pipeline.latestGreeting(jobId)?.stage ?? 'none';
        },
        listGreetings(filter = {}) {
            const templates = new Map(store.pipeline.listTemplates().map((template) => [template.id, template.name]));
            return store.pipeline.listGreetings(filter).map((record) => {
                const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
                return {
                    id: record.id,
                    jobId: record.jobId,
                    jobTitle: job?.title ?? null,
                    companyName: job?.companyName ?? null,
                    platformId: record.platformId,
                    templateId: record.templateId,
                    // 模板被删了就是 null：宁可显示"没有模板"，也不要显示一个指向空处的 id
                    templateName: record.templateId === null ? null : (templates.get(record.templateId) ?? null),
                    content: record.content,
                    sentAt: record.sentAt,
                    channel: record.channel,
                    actor: record.actor,
                    stage: record.stage,
                    stageAt: record.stageAt,
                    repliedAt: record.repliedAt,
                };
            });
        },
        followUpSuggestions() {
            const now = clock();
            const dismissed = new Set(store.setting.get('followup-dismissed', 'global') ?? []);
            const out = [];
            for (const greeting of store.pipeline.listGreetings({ limit: 200 })) {
                if (greeting.jobId === null)
                    continue;
                // 已回复/已约面的不再催 —— 那是另一条流程（面试）
                if (greeting.stage === 'replied' || greeting.stage === 'interview_scheduled')
                    continue;
                if (greeting.stage === 'none')
                    continue;
                const idleHours = hoursBetween(greeting.stageAt, now);
                const job = store.job.detail(greeting.jobId);
                const base = {
                    jobId: greeting.jobId,
                    jobTitle: job?.title ?? null,
                    companyName: job?.companyName ?? null,
                    stage: greeting.stage,
                    idleHours: Math.round(idleHours),
                };
                if (greeting.stage === 'delivered' && idleHours >= UNREAD_TIMEOUT_HOURS) {
                    if (dismissed.has(`${greeting.jobId}:unread-timeout`))
                        continue;
                    out.push({
                        ...base,
                        kind: 'unread-timeout',
                        message: `打了招呼 ${String(Math.round(idleHours / 24))} 天，HR 一直没读`,
                        advice: '未读超时通常说明这个岗位的 HR 不活跃或不看这类消息 —— 建议放弃，把时间给别的岗位。',
                    });
                }
                else if (greeting.stage === 'read' && idleHours >= READ_TIMEOUT_HOURS) {
                    if (dismissed.has(`${greeting.jobId}:read-no-reply`))
                        continue;
                    out.push({
                        ...base,
                        kind: 'read-no-reply',
                        message: `已读未回已经 ${String(Math.round(idleHours / 24))} 天`,
                        advice: '读了没回**不是**没戏，通常是你呈现出来的东西和岗位要求对不上 —— 该改简历或话术，而不是继续加量（§3.2）。',
                    });
                }
            }
            return out.sort((a, b) => b.idleHours - a.idleHours);
        },
        resolveFollowUp(jobId, kind) {
            const key = `${jobId}:${kind}`;
            const existing = store.setting.get('followup-dismissed', 'global') ?? [];
            if (existing.includes(key))
                return;
            store.setting.set('followup-dismissed', 'global', '', [...existing, key], clock());
        },
    };
}
function hoursBetween(fromIso, toIso) {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to))
        return 0;
    return Math.max(0, (to - from) / 3_600_000);
}
function daysBetween(fromIso, toIso) {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to))
        return 0;
    return Math.max(0, Math.floor((to - from) / 86_400_000));
}
//# sourceMappingURL=pipeline.js.map