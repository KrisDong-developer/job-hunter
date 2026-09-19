import { APPLICATION_SEND_ACTION, sendApplication, } from '../guard/actions/application.js';
import { GREETING_SEND_ACTION, sendGreeting } from '../guard/actions/greeting.js';
import { INBOX_SYNC_ACTION, syncInbox } from '../guard/actions/inbox.js';
import { REPLY_SEND_ACTION, sendReply } from '../guard/actions/reply.js';
import { SETTINGS_WRITE_ACTION } from '../guard/actions/settings.js';
import { STAGE_PROBE_ACTION, probeContactStage } from '../guard/actions/stage.js';
import { browserPageSource } from '../platform/browser.js';
import { platformFacts } from '../platform/platform-facts.js';
import { describeSettingsPatch } from '../settings.js';
import { DomainError } from '../util/errors.js';
import { dataNotReady } from './contract.js';
export function createRuntimeActions(deps) {
    const { registry, browser, events, clock } = deps;
    const logger = deps.logger;
    /** 数据层没就绪时的统一错误（形状只要求 `failure()`，见 contract.ts）。 */
    const notReady = () => dataNotReady({ failure: deps.failureOf });
    return {
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
                    deps.pipelineOf()?.recordGreetingSent(recorded);
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
            const filePath = input.filePath ?? null;
            const sideEffect = platformFacts(job.platformId).applicationSideEffect;
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
                    // §4.4.2 要求审批文案写清"用了哪版简历"
                    resumeVersion: filePath === null ? '平台内简历（未指定本地版本）' : `本地文件：${filePath}`,
                    resumeFileId: filePath === null ? null : filePath,
                    // 平台自己还会做的额外动作（如智联投递时会替你发一句招呼语）——
                    // **来自平台事实表**，不是各入口自己写死；没有这一格的平台就不会出现这一行。
                    ...(sideEffect === undefined ? {} : { sideEffect }),
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
                        actor: recorded.actor,
                        note: recorded.filePath === null
                            ? '平台内简历投递（适配器执行）'
                            : `本地简历投递（适配器执行）：${recorded.filePath}`,
                    });
                },
            }, token, { jobId: job.id, filePath }));
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
    };
}
//# sourceMappingURL=actions.js.map