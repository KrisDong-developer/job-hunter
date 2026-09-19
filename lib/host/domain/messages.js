import { REPLY_SCENARIOS } from '../../shared/contract/enums/message.js';
import { extractJson } from '../ai/prompts.js';
import { systemClock } from '../util/time.js';
import { DomainError } from '../util/errors.js';
/** 每种情境给模型的指令与规则降级模板（生成 ≠ 发送，只是草稿）。 */
const SCENARIO_PLAN = {
    'negotiate-time': {
        instruction: '对方刚约了面试时间，但要礼貌地协商另一个时间。语气温和，先致谢，再给出"更合适"的具体理由或个人可用的几个时段，别用"随便"。',
        template: '您好，收到您安排面试的消息，非常感谢。很抱歉，您提的这个时间我这边刚好不太方便，能否麻烦您看看可否调整？我下面这些时段基本都可以：本周三下午、周四全天、周五上午。麻烦您帮忙协调一下，谢谢！',
    },
    salary: {
        instruction: '礼貌地询问这个岗位的薪资结构。对方是 HR，语气专业克制，不显得盯着钱。',
        template: '您好，想进一步了解一下这个岗位的薪资构成，比如基本薪资、绩效/提成的占比，以及年终奖大约几个月？方便的话麻烦您介绍一下，谢谢！',
    },
    decline: {
        instruction: '婉拒面试邀约。真诚地感谢，给出职业规划层面的简短理由，留有余地（以后仍可合作），不贬低对方。',
        template: '非常感谢您的邀请，您的团队和这个岗位都让我很感兴趣。不过综合我的职业规划来看，现阶段暂时不便接受这次邀约。希望以后还有合作的机会，祝您招聘顺利！',
    },
};
/**
 * 面试邀约的规则词表。
 *
 * 刻意**保守**：宁可漏判（用户自己看得见消息）也不要误判成"要面试了"。
 * 所以只收"几乎只可能出现在邀约里"的词，不收"沟通""聊聊"这类中性词。
 */
export const INVITE_KEYWORDS = [
    '面试',
    '面谈',
    '笔试',
    '复试',
    '初试',
    '一面',
    '二面',
    '终面',
    '视频面试',
    '电话沟通',
    '约个时间',
    '预约时间',
    '方便的时间',
    '入职时间',
    '薪资期望',
    'offer',
    '录用',
    '简历通过',
    '安排面试',
];
/** 只在 HR 发来的消息里找信号 —— 我自己说的"期待面试"不算邀约。 */
export function detectInvite(content, direction) {
    if (direction !== 'hr')
        return { hit: false, keywords: [] };
    const hits = INVITE_KEYWORDS.filter((keyword) => content.includes(keyword));
    return { hit: hits.length > 0, keywords: [...hits] };
}
/**
 * 识别入口：模型可用且用途开启走模型（可信但经 untrusted 隔离 + 结构校验），
 * 否则退化到规则识别。返回值里带 `via` / `notes`，让界面如实标注来源（J10）。
 */
async function extractInterviewSuggestion(content, ai) {
    if (ai === undefined) {
        return {
            value: ruleExtract(content),
            via: 'fallback',
            notes: ['未配置模型，用规则识别 —— 只认常见的中文日期/关键词，不准处请手动改。'],
        };
    }
    const outcome = await ai.call({
        purpose: 'message_extract',
        instruction: '从这条 HR 消息里抽出面试安排。只输出 JSON，不解释。识别不到的项目给空字符串。',
        untrusted: [{ label: 'HR消息', text: content }],
        outputSpec: '{"at":"可被解析的日期时间(如 2026-09-20 14:00 或 9月20日 14:00；没有则空字符串)","kind":"onsite|video|phone|other(线上对应 video、电话对应 phone、线下/现场对应 onsite；没有则空字符串)","place":"地点(没有则空字符串)","link":"会议/链接 URL(没有则空字符串)"}',
        ref: { entity: 'message' },
    }, {
        parse: (raw) => {
            const parsed = extractJson(raw);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
                return undefined;
            return normalizeModelExtract(parsed);
        },
        fallback: () => ruleExtract(content),
    });
    return { value: outcome.value, via: outcome.via, notes: outcome.notes };
}
/** 模型输出 → 结构化结果；至少要有时间或链接才认为"确实识别出了内容"，否则降级。 */
function normalizeModelExtract(raw) {
    const get = (key) => {
        const value = raw[key];
        return value === null || value === undefined ? '' : String(value).trim();
    };
    let at = null;
    const atRaw = get('at');
    if (atRaw !== '') {
        const parsed = new Date(atRaw);
        if (!Number.isNaN(parsed.getTime()))
            at = parsed.toISOString();
    }
    let kind = null;
    const k = get('kind').toLowerCase();
    if (['onsite', '线下', '现场'].includes(k))
        kind = 'onsite';
    else if (['video', '线上', '视频'].includes(k))
        kind = 'video';
    else if (['phone', '电话'].includes(k))
        kind = 'phone';
    else if (k !== '')
        kind = 'other';
    const place = get('place') || null;
    const link = get('link') || null;
    // 一个都没识别到 → 刻意**不去**触发降级（规则也是同样的空）；让空值原样返回，
    // 界面据此显示"没识别出内容，请手动填"，而不是假装模型给了一串靠谱字段。
    return { at, kind, place, link };
}
/**
 * 规则降级识别：**保守**，只为常见写法定中轴 ——
 * 中文日期/时间/关键字 + URL + 地点关键词。宁可漏，不给假。
 * 导出供测试直接断言（同 `detectInvite`）。
 */
export function ruleExtract(content) {
    let at = null;
    // 链接
    const matched = /\bhttps?:\/\/[^\s，。；()（）]+/i.exec(content);
    const link = matched?.[0]?.replace(/[，。；()（）]+$/, '') || null;
    // 形式
    let kind = null;
    if (/线上|视频|zoom|腾讯会议/i.test(content))
        kind = 'video';
    else if (/电话|致电|来电|电话沟通/i.test(content))
        kind = 'phone';
    else if (/现场|线下|到公司|到访|onsite/i.test(content))
        kind = 'onsite';
    // 时间：ISO 风格 → 中文「x月x日 时:分」→ 「明天/今天 + 时:分」
    const seg = (m, i) => (m !== null && m[i] !== undefined ? m[i] : '');
    const num = (m, i, fallback = 0) => {
        const raw = seg(m, i);
        return raw === '' ? fallback : Number.parseInt(raw, 10);
    };
    const isoMatch = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(content);
    if (isoMatch !== null) {
        const d = new Date(num(isoMatch, 1), num(isoMatch, 2, 1) - 1, num(isoMatch, 3, 1), num(isoMatch, 4), num(isoMatch, 5));
        if (!Number.isNaN(d.getTime()))
            at = d.toISOString();
    }
    else {
        const cnMatch = /(\d{1,2})月(\d{1,2})日(?:[^\d:]|)(?:(\d{1,2})[:：](\d{2}))?/.exec(content);
        if (cnMatch !== null) {
            const now = new Date();
            const month = num(cnMatch, 1, 1);
            const day = num(cnMatch, 2, 1);
            const hour = num(cnMatch, 3);
            const minute = num(cnMatch, 4);
            let year = now.getFullYear();
            const make = (y) => new Date(y, month - 1, day, hour, minute);
            const d = make(year);
            at = d.getTime() < now.getTime() ? make(year + 1).toISOString() : d.toISOString();
        }
        else if (/明天/.test(content)) {
            const timeMatch = /(\d{1,2})[:：](\d{2})/.exec(content);
            const d = new Date(Date.now() + 86_400_000);
            d.setHours(num(timeMatch, 1, 10), num(timeMatch, 2), 0, 0);
            at = d.toISOString();
        }
        else if (/今天|今日/.test(content)) {
            const timeMatch = /(\d{1,2})[:：](\d{2})/.exec(content);
            if (timeMatch !== null) {
                const d = new Date();
                d.setHours(num(timeMatch, 1), num(timeMatch, 2), 0, 0);
                at = d.toISOString();
            }
        }
    }
    // 地点：跟着"地点/地址/位于"等明确的引导词；"来/到"太宽松（会在普通句子里乱抓），不采用。
    const placeMatch = /(?:地点|地址|位于|在|到访)\s*[:：]?\s*([^，。；\n]{2,})/.exec(content);
    const place = placeMatch?.[1]?.trim().slice(0, 60) || null;
    return { at, kind, place, link };
}
export function createMessageService(deps) {
    const { store } = deps;
    const clock = deps.clock ?? systemClock;
    const decorate = (record) => {
        const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
        return {
            ...record,
            jobTitle: job?.title ?? null,
            companyName: job?.companyName ?? null,
            inviteSignal: detectInvite(record.content, record.direction),
        };
    };
    /** 真正落库的那一步（`record` 与 `recordOnce` 共用，避免两条路径漂移）。 */
    const recordMessage = (input) => {
        if (input.content.trim() === '') {
            throw new DomainError('INVALID_INPUT', '消息内容不能为空');
        }
        const record = store.pipeline.createMessage({
            platformId: input.platformId,
            direction: input.direction,
            content: input.content,
            ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
            ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
            ...(input.attachmentRef === undefined ? {} : { attachmentRef: input.attachmentRef }),
            ...(input.at === undefined ? {} : { at: input.at }),
        }, clock());
        const dto = decorate(record);
        // 识别到邀约信号 → 只发事件给界面提示，**不动状态**
        if (dto.inviteSignal?.hit === true) {
            deps.logger?.info(`[messages] 消息 #${String(dto.id)} 疑似面试邀约（命中：${dto.inviteSignal.keywords.join('、')}）—— ` +
                '只作为建议，状态需要你确认后才改');
        }
        return dto;
    };
    return {
        record(input) {
            return recordMessage(input);
        },
        recordOnce(input) {
            if (input.content.trim() === '') {
                throw new DomainError('INVALID_INPUT', '消息内容不能为空');
            }
            const existing = store.pipeline.findMessage({
                platformId: input.platformId,
                conversationId: input.conversationId ?? '',
                direction: input.direction,
                content: input.content,
            });
            if (existing !== undefined)
                return { message: decorate(existing), created: false };
            return { message: recordMessage(input), created: true };
        },
        inbox(filter = {}) {
            const items = store.pipeline
                .listMessages({
                ...(filter.jobId === undefined ? {} : { jobId: filter.jobId }),
                ...(filter.unreadOnly === undefined ? {} : { unreadOnly: filter.unreadOnly }),
                ...(filter.limit === undefined ? {} : { limit: filter.limit }),
            })
                .map(decorate);
            return { items, unread: store.pipeline.countUnread(), total: items.length };
        },
        markRead(id) {
            return store.pipeline.markMessageRead(id, clock());
        },
        unreadCount() {
            return store.pipeline.countUnread();
        },
        async extractInterview(id) {
            // 用 `getMessage(id)` 而不是 `listMessages({limit:500}).find(...)`：后者在消息超过
            // 500 条之后会**静默查不到**（表现为"消息不存在"），是一个只有老库才会踩到的假故障。
            const record = store.pipeline.getMessage(id);
            if (record === undefined) {
                throw new DomainError('NOT_FOUND', `消息不存在：${String(id)}`, { detail: { messageId: id } });
            }
            const { value, via, notes } = await extractInterviewSuggestion(record.content, deps.ai);
            return {
                messageId: id,
                jobId: record.jobId,
                ...value,
                via,
                notes,
            };
        },
        async draftReply(input) {
            const plan = SCENARIO_PLAN[input.scenario];
            if (plan === undefined) {
                throw new DomainError('INVALID_INPUT', `不认识的拟稿情境：${String(input.scenario)}`, {
                    hint: `合法取值：${REPLY_SCENARIOS.map((item) => item.key).join(' / ')}`,
                });
            }
            const record = store.pipeline
                .listMessages({ limit: 500 })
                .find((item) => item.id === input.messageId);
            if (record === undefined) {
                throw new DomainError('NOT_FOUND', `消息不存在：${String(input.messageId)}`, {
                    detail: { messageId: input.messageId },
                });
            }
            const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
            const { text, via, notes } = await draftReplyText(record.content, job?.title ?? null, input.scenario, deps.ai);
            return { messageId: input.messageId, text, via, notes, scenario: input.scenario };
        },
    };
}
/**
 * 拟一段回复草稿（纯文本，非 JSON）。模型可用走模型，否则用内置模板降级。
 */
async function draftReplyText(content, jobTitle, scenario, ai) {
    const plan = SCENARIO_PLAN[scenario];
    const context = jobTitle === null ? '' : `（对方在聊的岗位是「${jobTitle}」）`;
    if (ai === undefined) {
        return { text: plan.template, via: 'fallback', notes: ['未配置模型，用了内置模板 —— 请改成你的真实语气。'] };
    }
    const outcome = await ai.call({
        purpose: 'reply_draft',
        instruction: `${plan.instruction} ${context}\n下面是对方发来的消息，请针对它拟一段回复。`,
        untrusted: [{ label: 'HR消息', text: content }],
        outputSpec: '只输出一段可直接发送的中文回复文本，不要解释、不要加引号或前缀。',
        ref: { entity: 'message', scenario },
    }, {
        parse: (raw) => {
            const text = raw.trim().replace(/^[「"']|[」"']$/g, '');
            return text === '' ? undefined : text;
        },
        fallback: () => plan.template,
    });
    return { text: outcome.value, via: outcome.via, notes: outcome.notes };
}
//# sourceMappingURL=messages.js.map