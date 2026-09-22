/**
 * 七个**编排**：闸门 + 一次性令牌 + 副作用回写 + 事件广播。
 *
 * ## 它们为什么不是领域层
 *
 * 这些方法本身**不实现业务**：真正干活的在 `guard/actions/*`（发送/投递/回复/同步）
 * 与领域服务（话术草稿、接触态、设置）。它们做的是把那几件事**按对的顺序接起来**，
 * 而顺序正是危险所在 —— 比如"本地那条 `direction='me'` 必须等**发送成功之后**才写"
 * （早一步写，看板与接触态从第一天开始就说谎）。
 *
 * 所以这是一层编排，不是一层实现；抽出它的收益是让装配点只剩接线，
 * 而这一层能被一屏读完（一屏读不完的顺序约束，等于没有约束）。
 *
 * ## 依赖为什么全是 `xxxOf: () => ...`
 *
 * 数据层是异步就绪的（§4.9）：这些服务在装配点上都是**可变的槽**
 * （数据层没起来时是 undefined）。传取值函数而不是快照，
 * 保证"调用那一刻"拿到的是当前那一个 —— 与 `gate.ts` 的 `storeOf` 同一个理由。
 */
import { join } from 'node:path';
import { APPLICATION_SEND_ACTION, applicationPlatformBlocker, resumeVersionTextOf, sendApplication, } from '../guard/actions/application.js';
import { GREETING_SEND_ACTION, greetingPlatformBlocker, greetingReadinessOf, sendGreeting, } from '../guard/actions/greeting.js';
import { INBOX_SYNC_ACTION, syncInbox } from '../guard/actions/inbox.js';
import { REPLY_SEND_ACTION, sendReply } from '../guard/actions/reply.js';
import { SETTINGS_WRITE_ACTION } from '../guard/actions/settings.js';
import { STAGE_PROBE_ACTION, probeContactStage } from '../guard/actions/stage.js';
import { guardUsageOf, readGuardConfig } from '../guard/rules.js';
import { browserPageSource } from '../platform/browser.js';
import { platformFacts } from '../platform/platform-facts.js';
import { describeSettingsPatch } from '../settings.js';
import { DomainError } from '../util/errors.js';
import { dataNotReady } from './contract.js';
import { appliedSiblingWarning, previewApplicationBatch, sendApplicationBatch as sendApplicationBatchOf, } from './application-batch.js';
import { previewGreetingBatch, sendGreetingBatch as sendGreetingBatchOf, } from './greeting-batch.js';
export function createRuntimeActions(deps) {
    const { registry, browser, events, clock } = deps;
    const logger = deps.logger;
    /** 数据层没就绪时的统一错误（形状只要求 `failure()`，见 contract.ts）。 */
    const notReady = () => dataNotReady({ failure: deps.failureOf });
    /**
     * 批量打招呼的依赖装配。
     *
     * `sendOne` 由调用方传进来（就是下面对象上的 `sendGreeting`）——
     * 这样"逐条过闸门"走的是**同一条单条发送路径**，批量里没有任何绕过闸门的捷径。
     */
    const batchDepsOf = (input) => ({
        store: input.opened,
        draft: async (draftInput) => {
            const service = deps.outreachOf();
            if (service === undefined)
                throw notReady();
            return await service.draft(draftInput);
        },
        sendOne: input.sendOne,
        previewGuard: (guardInput) => input.gate.preview(guardInput),
        canSend: (platformId) => {
            // 判据与单条发送**共用一份**（`greetingPlatformBlocker`）——
            // 预览里说能发、点下去才失败是最糟的形态，而两份判断迟早会漂移。
            return greetingPlatformBlocker({ registry, session: input.session }, platformId);
        },
        sideEffectOf: (platformId) => platformFacts(platformId).greetingSideEffect ?? null,
        cooldownMinutes: () => readGuardConfig(input.opened).cooldownMinutes,
        remainingToday: (platformId) => {
            // 与 `checkQuota` 同源的读数（`guardUsageOf`）：预览说"还剩 3 条"与实际被拒的时机一致
            const entry = guardUsageOf(input.opened, clock, platformId).find((row) => row.action === GREETING_SEND_ACTION);
            if (entry === undefined)
                return null;
            return { remaining: entry.remaining, limit: entry.limit, used: entry.used };
        },
        clock,
        sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
        random: () => Math.random(),
    });
    /**
     * 把「这次投递**登记**用哪份简历」解析成：适配器要的绝对路径（**只有平台接受上传时**）+
     * 审批文案要的可读标签 + 记账归因要的版本 id。
     *
     * ⚠️ 两件事必须分清（这是本函数存在的全部理由）：
     *   1. **登记**：这份简历写进 `application.resume_id` / `resume_file_id` —— 归因要用（§11.3 / R6）；
     *   2. **上传**：把文件真的交给平台。**只有平台事实 `resumeSource === 'local'` 时才做** ——
     *      其余平台（实测 zhipin / zhaopin）没有"把本地文件发给 HR"的入口，硬把路径交给适配器
     *      只会让它 fail-closed，把一次本来能成的投递变成失败。
     *      那种情况下我们**照投**（平台用它自己那份），并如实把这件事写进审批文案。
     *
     * ⚠️ 入参只能是 `resume_file.id`：路径由这里自己从库里查。让请求体直接给一个绝对路径，
     * 就是一个"任意路径读文件"的洞（与 `readExportFile` 同一条纪律）。
     */
    const resolveResumeOf = (opened, platformId, resumeFileId) => {
        if (resumeFileId === null) {
            return { uploadPath: null, label: null, resumeId: null, uploads: false };
        }
        const file = opened.resume.getFile(resumeFileId);
        if (file === undefined) {
            throw new DomainError('NOT_FOUND', `简历附件不存在：#${String(resumeFileId)}`, {
                hint: '它可能已经被删掉了；到「简历」页重新导出一份再投。',
            });
        }
        const resume = opened.resume.get(file.resumeId);
        const uploads = platformFacts(platformId).resumeSource === 'local';
        return {
            uploadPath: uploads ? join(deps.filesDir, file.path) : null,
            // 标签里带简历名与文件名 —— §4.4.2 要的"用了哪版简历"指的就是这个，
            // 而不是一个绝对路径（路径对用户没有信息量，还会把本机目录结构写进库）
            label: `${resume?.name ?? `简历 #${String(file.resumeId)}`} · ${file.fileName}`,
            resumeId: file.resumeId,
            uploads,
        };
    };
    /**
     * 批量投递的依赖装配（与 `batchDepsOf` 同一个理由：`sendOne` 就是上面那个
     * `sendApplication`，所以批量里没有任何绕过闸门的捷径）。
     */
    const applicationBatchDepsOf = (input) => ({
        store: input.opened,
        sendOne: input.sendOne,
        previewGuard: (guardInput) => input.gate.preview(guardInput),
        platformBlocker: (platformId) => 
        // 判据与单条投递**共用一份**（`applicationPlatformBlocker`）
        applicationPlatformBlocker({ registry, session: input.session }, platformId),
        acceptsLocalResume: (platformId) => platformFacts(platformId).resumeSource === 'local',
        resumeLabelOf: (resumeFileId) => {
            const file = input.opened.resume.getFile(resumeFileId);
            if (file === undefined)
                return null;
            const resume = input.opened.resume.get(file.resumeId);
            return `${resume?.name ?? `简历 #${String(file.resumeId)}`} · ${file.fileName}`;
        },
        sideEffectOf: (platformId) => platformFacts(platformId).applicationSideEffect ?? null,
        cooldownMinutes: () => readGuardConfig(input.opened).cooldownMinutes,
        remainingToday: (platformId) => {
            // 与 `checkQuota` 同源的读数（`guardUsageOf`）
            const entry = guardUsageOf(input.opened, clock, platformId).find((row) => row.action === APPLICATION_SEND_ACTION);
            if (entry === undefined)
                return null;
            return { remaining: entry.remaining, limit: entry.limit, used: entry.used };
        },
        clock,
        sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
        random: () => Math.random(),
    });
    const actions = {
        async draftGreeting(input) {
            const service = deps.outreachOf();
            if (service === undefined)
                throw notReady();
            return await service.draft({
                jobId: input.jobId,
                ...(input.tone === undefined ? {} : { tone: input.tone }),
                ...(input.highlights === undefined ? {} : { highlights: input.highlights }),
                ...(input.extra === undefined ? {} : { extra: input.extra }),
            });
        },
        async sendGreeting(input) {
            const opened = deps.storeOf();
            const service = deps.outreachOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || service === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const job = opened.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
                    hint: '它可能已被删除；先用 job_query 看当前有哪些岗位。',
                });
            }
            // 文本没给就现生成 —— 生成是**低危**的（不发送），所以它理应发生在闸门之前
            let text = input.text?.trim() ?? '';
            let via = 'given';
            if (text === '') {
                const draft = await service.draft({ jobId: job.id });
                text = draft.text;
                via = draft.via;
            }
            const greetingSideEffect = platformFacts(job.platformId).greetingSideEffect;
            const result = await gate.run({
                action: GREETING_SEND_ACTION,
                actor: input.actor,
                danger: 'high',
                target: {
                    jobId: job.id,
                    platformId: job.platformId,
                    ...(job.companyId === null ? {} : { companyId: job.companyId }),
                },
                payload: {
                    // 正文只用于**审批展示**；审计里只留长度（§4.1）
                    text,
                    jobTitle: job.title,
                    company: job.companyName ?? '',
                    // §4.4.2 要求审批文案显示"用了哪版简历" —— 打招呼不用简历，如实写出来
                    resumeVersion: '不适用（打招呼只发文本）',
                    draftVia: via,
                    // §22.4 的批量上限：批量逐条发送时把**整批条数**带上，否则每条都像单条，
                    // `checkBatch` 永远不触发（那等于没有上限）
                    ...(input.batchSize === undefined || input.batchSize <= 1 ? {} : { count: input.batchSize }),
                    // 平台自己还会做的额外动作（平台事实）：BOSS 点了「立即沟通」会**先替你发一句
                    // 平台默认招呼语**，随后我们才发上面这段 text —— 一次动作两条消息，用户得知道。
                    ...(greetingSideEffect === undefined ? {} : { sideEffect: greetingSideEffect }),
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => await sendGreeting({
                store: opened,
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                clock,
                ...(logger === undefined ? {} : { logger }),
                // P7：发送**成功后**记一笔接触记录（接触态的载体，§7.0）
                record: (recorded) => {
                    deps.pipelineOf()?.recordGreetingSent({
                        jobId: recorded.jobId,
                        platformId: recorded.platformId,
                        content: recorded.content,
                        actor: recorded.actor,
                        // 平台侧**确认送达**才记「已送达」，否则停在「已打招呼」——
                        // 这一步决定了"未读超时"那条跟进建议会不会触发（§3.3 / §12.2）
                        stage: recorded.delivery === 'delivered' ? 'delivered' : 'greeted',
                    });
                    events.publish('greeting.recorded', {
                        jobId: recorded.jobId,
                        actor: recorded.actor,
                    });
                },
            }, token, { jobId: job.id, text }));
            events.publish('greeting.sent', {
                jobId: result.jobId,
                platformId: result.platformId,
                company: result.company,
                actor: input.actor,
            });
            return result;
        },
        async replyToMessage(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            const messageService = deps.messagesOf();
            if (opened === undefined || gate === undefined || sessionService === undefined || messageService === undefined) {
                throw notReady();
            }
            const text = input.content.trim();
            if (text === '') {
                // **必须在闸门之前**：这条正文会被逐字打进输入框，为空的话用户确认完才发现发不出去
                throw new DomainError('INVALID_INPUT', '回复内容不能为空');
            }
            // 审批文案要写清"发给谁、回的是哪条"（§4.4.2），所以这里先读一次目标。
            // 真正的定位与发送在闸门里（`guard/actions/reply.ts`）**再做一遍** ——
            // 审批期间对方可能已经把它移出会话列表，那一步不该信任这里的快照。
            const target = opened.pipeline.getMessage(input.messageId);
            if (target === undefined) {
                throw new DomainError('NOT_FOUND', `消息不存在：${String(input.messageId)}`, {
                    hint: '先用 inbox_list 看看当前有哪些消息。',
                    detail: { messageId: input.messageId },
                });
            }
            if (target.jobId === null) {
                throw new DomainError('INVALID_INPUT', '这条消息没有关联岗位，无法定位到具体会话，不能回复', {
                    hint: '回复要靠"发往哪个岗位的会话"来定位；请把它关联到岗位，或直接去平台上回。',
                    detail: { messageId: target.id, platformId: target.platformId },
                });
            }
            const job = opened.job.detail(target.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(target.jobId)}`, {
                    detail: { jobId: target.jobId },
                });
            }
            const result = await gate.run({
                action: REPLY_SEND_ACTION,
                actor: input.actor,
                danger: 'high',
                target: {
                    jobId: job.id,
                    platformId: job.platformId,
                    ...(job.companyId === null ? {} : { companyId: job.companyId }),
                },
                payload: {
                    // 正文只用于**审批展示**；审计里只留摘要与长度（§4.1）
                    text,
                    toJob: job.title,
                    company: job.companyName ?? '',
                    replyTo: target.content.slice(0, 80),
                    // §4.4.2 要求审批文案写清"用了哪版简历" —— 回复只发文本，如实写出来
                    resumeVersion: '不适用（回复只发文本）',
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => await sendReply({
                store: opened,
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                clock,
                ...(logger === undefined ? {} : { logger }),
                // 发送**成功之后**才落本地那条 `direction='me'` ——
                // 发失败了也记"我已回复"，看板与接触态从第一天开始就说谎（与打招呼同一条原则）
                record: (recorded) => {
                    messageService.record({
                        platformId: recorded.platformId,
                        direction: 'me',
                        content: recorded.content,
                        jobId: recorded.jobId,
                    });
                },
            }, token, { messageId: target.id, text }));
            events.publish('message.replied', {
                messageId: result.messageId,
                jobId: result.jobId,
                platformId: result.platformId,
            });
            return result;
        },
        async syncInbox(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            const messageService = deps.messagesOf();
            if (opened === undefined || gate === undefined || sessionService === undefined || messageService === undefined) {
                throw notReady();
            }
            const result = await gate.run({
                action: INBOX_SYNC_ACTION,
                actor: input.actor,
                // 低危：只读平台会话列表 + 写本地库，不对外发任何东西
                danger: 'low',
                target: { platformId: input.platformId },
            }, async (token) => await syncInbox({
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                ...(logger === undefined ? {} : { logger }),
                // 去重口径留在消息中心（同「平台+会话+方向+正文」算同一条）
                record: (recorded) => messageService.recordOnce({
                    platformId: recorded.platformId,
                    direction: recorded.direction,
                    content: recorded.content,
                    conversationId: recorded.conversationId,
                    ...(recorded.at === null ? {} : { at: recorded.at }),
                }),
            }, token, { platformId: input.platformId }));
            if (result.recorded > 0) {
                events.publish('inbox.synced', {
                    platformId: result.platformId,
                    recorded: result.recorded,
                    unread: result.unread,
                });
            }
            return result;
        },
        async probeContactStage(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const result = await gate.run({
                action: STAGE_PROBE_ACTION,
                actor: input.actor,
                // 低危：只读平台上的状态标记，**一个字段都不写**（本地库也不写）
                danger: 'low',
                target: { jobId: input.jobId },
            }, async (token) => await probeContactStage({
                store: opened,
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                clock,
                ...(logger === undefined ? {} : { logger }),
            }, token, { jobId: input.jobId }));
            events.publish('contact.stage.probed', {
                jobId: result.jobId,
                platformId: result.platformId,
                stage: result.stage,
            });
            return result;
        },
        async sendApplication(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const job = opened.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
                    hint: '它可能已被删除；先用 job_query 看当前有哪些岗位。',
                });
            }
            // 简历：外部只给 id，路径由这里查出来（见 `resolveResumeOf`）
            const resumeFileId = input.resumeFileId ?? null;
            const resume = resolveResumeOf(opened, job.platformId, resumeFileId);
            const sideEffect = platformFacts(job.platformId).applicationSideEffect;
            const duplicateWarning = appliedSiblingWarning(opened, job.id);
            const result = await gate.run({
                action: APPLICATION_SEND_ACTION,
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
                    // §4.4.2 要求审批文案写清"用了哪版简历" —— 而且必须连"会不会真的传上去"一起说
                    resumeVersion: resumeVersionTextOf({ label: resume.label, uploads: resume.uploads }),
                    resumeFileId,
                    // 平台自己还会做的额外动作（如智联投递时会替你发一句招呼语）——
                    // **来自平台事实表**，不是各入口自己写死；没有这一格的平台就不会出现这一行。
                    ...(sideEffect === undefined ? {} : { sideEffect }),
                    // 同一岗位的另一个平台副本已经投过 → 写进审批文案（模型那条路径没有预览，
                    // 用户就是在审批屏上做决定的）。只提醒，不拦。
                    ...(duplicateWarning === null ? {} : { duplicateApplicationWarning: duplicateWarning }),
                    // §22.4 的批量上限：批量逐条投递时把**整批条数**带上（与打招呼同一格）
                    ...(input.batchSize === undefined || input.batchSize <= 1 ? {} : { count: input.batchSize }),
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => await sendApplication({
                store: opened,
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                clock,
                ...(logger === undefined ? {} : { logger }),
                // 投递**成功之后**记一笔（接触态/看板的载体，§12.1）
                record: (recorded) => {
                    deps.pipelineOf()?.recordApplicationSent({
                        jobId: recorded.jobId,
                        // R6 的"这版投了哪个岗"：以前这两格从来没从投递路径传下来，
                        // 于是适配器投出去的记录只能退回"默认简历"——归因是错的。
                        resumeId: resume.resumeId,
                        resumeFileId,
                        actor: recorded.actor,
                        note: resume.label === null
                            ? '平台内简历投递（适配器执行）'
                            : `本地简历投递（适配器执行）：${resume.label}`,
                    });
                },
            }, token, 
            // 只有平台接受上传时才把路径交出去（否则适配器会 fail-closed，
            // 把一次本来能成的投递变成失败 —— 见 `resolveResumeOf`）
            { jobId: job.id, filePath: resume.uploadPath }));
            events.publish('application.sent', {
                jobId: result.jobId,
                platformId: result.platformId,
                company: result.company,
                actor: input.actor,
                delivery: result.delivery,
            });
            return result;
        },
        async updateSettings(patch, actor, guiConfirmed) {
            const opened = deps.storeOf();
            const service = deps.settingsOf();
            const gate = deps.guardOf();
            if (opened === undefined || service === undefined || gate === undefined)
                throw notReady();
            // 禁止项检查看的是**顶层键**，所以 guard 那半边要摊平传进去
            //（否则 `requireApproval` 藏在 patch.guard 里就查不到了）。
            const guardPatch = (patch.guard ?? {});
            const description = describeSettingsPatch(patch);
            return await gate.run({
                action: SETTINGS_WRITE_ACTION,
                actor,
                danger: 'mid',
                payload: { patch: guardPatch, description },
                ...(guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => {
                const next = service.update(patch, token);
                events.publish('settings.updated', { by: actor, description });
                return next;
            });
        },
        async previewGreetingBatch(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const plan = await previewGreetingBatch(batchDepsOf({ opened, gate, session: sessionService, sendOne: (one) => actions.sendGreeting(one) }), { jobIds: input.jobIds, actor: input.actor });
            events.publish('greeting.batch.previewed', {
                total: plan.items.length,
                sendable: plan.sendable,
                blocked: plan.blocked,
            });
            return plan;
        },
        async sendGreetingBatch(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const result = await sendGreetingBatchOf(batchDepsOf({ opened, gate, session: sessionService, sendOne: (one) => actions.sendGreeting(one) }), {
                items: input.items,
                actor: input.actor,
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            });
            // 逐条会各自发 `greeting.sent`（在 sendGreeting 里），这里再补一条批级事件
            // 让「今日」这类页面知道该整体刷新一次
            events.publish('greeting.batch.sent', {
                sent: result.sent,
                failed: result.failed,
                actor: input.actor,
            });
            logger?.info(`[actions] 批量打招呼：成功 ${String(result.sent)} 条 · 失败 ${String(result.failed)} 条 · ` +
                `耗时 ${String(result.elapsedMs)} ms`);
            return result;
        },
        async previewApplicationBatch(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const plan = await previewApplicationBatch(applicationBatchDepsOf({
                opened,
                gate,
                session: sessionService,
                sendOne: (one) => actions.sendApplication(one),
            }), { jobIds: input.jobIds, resumeFileId: input.resumeFileId, actor: input.actor });
            events.publish('application.batch.previewed', {
                total: plan.items.length,
                sendable: plan.sendable,
                blocked: plan.blocked,
            });
            return plan;
        },
        async sendApplicationBatch(input) {
            const opened = deps.storeOf();
            const gate = deps.guardOf();
            const sessionService = deps.sessionOf();
            if (opened === undefined || gate === undefined || sessionService === undefined) {
                throw notReady();
            }
            const result = await sendApplicationBatchOf(applicationBatchDepsOf({
                opened,
                gate,
                session: sessionService,
                sendOne: (one) => actions.sendApplication(one),
            }), {
                jobIds: input.jobIds,
                resumeFileId: input.resumeFileId,
                actor: input.actor,
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            });
            // 逐条各自发 `application.sent`（在 sendApplication 里），这里再补一条批级事件
            // 让「今日」/「流水线」这类页面知道该整体刷新一次
            events.publish('application.batch.sent', {
                sent: result.sent,
                failed: result.failed,
                actor: input.actor,
            });
            logger?.info(`[actions] 批量投递：成功 ${String(result.sent)} 条 · 失败 ${String(result.failed)} 条 · ` +
                `耗时 ${String(result.elapsedMs)} ms`);
            return result;
        },
    };
    return actions;
}
//# sourceMappingURL=actions.js.map