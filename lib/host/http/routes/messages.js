/**
 * 消息中心相关的端点（§13 U6）：收件箱（GET /inbox）、记录一条消息
 * （POST /messages）、标记已读（POST /messages/:id/read）、回复
 * （POST /messages/:id/reply）、面试信息抽取（POST /messages/:id/extract-interview）、
 * 草拟回复（POST /messages/:id/draft-reply）。
 */
import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, readObject, requireData } from './kit.js';
export async function inbox(ctx) {
    const { runtime, req, segments, method } = ctx;
    // ── P7：消息中心（§13 U6）────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'inbox') {
        requireData(runtime);
        const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
        return json(200, runtime.messages().inbox({
            ...(Number.isFinite(jobId) ? { jobId } : {}),
            ...(req.query.get('unread') === '1' ? { unreadOnly: true } : {}),
            limit: parsePositiveInt(req.query.get('limit'), 50, 1, 200),
        }));
    }
    return undefined;
}
export async function post(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (method === 'POST' && segments.length === 1 && segments[0] === 'messages') {
        requireData(runtime);
        const body = await readObject(req);
        const direction = body['direction'];
        if (direction !== 'hr' && direction !== 'me') {
            throw new DomainError('INVALID_INPUT', 'direction 必须是 hr 或 me');
        }
        if (typeof body['content'] !== 'string' || body['content'].trim() === '') {
            throw new DomainError('INVALID_INPUT', 'content 不能为空');
        }
        const message = runtime.messages().record({
            platformId: typeof body['platformId'] === 'string' ? body['platformId'] : 'manual',
            direction,
            content: body['content'],
            ...(typeof body['jobId'] === 'number' ? { jobId: body['jobId'] } : {}),
            ...(typeof body['conversationId'] === 'string' ? { conversationId: body['conversationId'] } : {}),
            ...(typeof body['at'] === 'string' ? { at: body['at'] } : {}),
        });
        runtime.events().publish('message.recorded', { id: message.id, direction });
        return json(201, { ok: true, message });
    }
    return undefined;
}
export async function read(ctx) {
    const { runtime, segments, method } = ctx;
    if (segments.length === 3 && segments[0] === 'messages' && segments[2] === 'read') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '标记已读只支持 POST');
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法消息 id：${segments[1] ?? ''}`);
        if (!runtime.messages().markRead(id)) {
            throw new DomainError('NOT_FOUND', `消息不存在或已读过：${String(id)}`);
        }
        return json(200, { ok: true });
    }
    return undefined;
}
export async function reply(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (segments.length === 3 && segments[0] === 'messages' && segments[2] === 'reply') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '回复只支持 POST');
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法消息 id：${segments[1] ?? ''}`);
        const body = await readObject(req);
        if (typeof body['content'] !== 'string' || body['content'].trim() === '') {
            throw new DomainError('INVALID_INPUT', 'content 不能为空');
        }
        // **高危**：会真的对外发消息（走 `message.reply` 闸门 → 适配器）。
        // 界面上的用户要两段式确认（模型走 ctx.approval）
        const reply = await runtime.replyToMessage({
            messageId: id,
            content: body['content'],
            actor: 'gui',
            ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
        });
        return json(200, { ok: true, reply });
    }
    return undefined;
}
export async function extractInterview(ctx) {
    const { runtime, segments, method } = ctx;
    if (method === 'POST' && segments.length === 3 && segments[0] === 'messages' && segments[2] === 'extract-interview') {
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法消息 id：${segments[1] ?? ''}`);
        // 只识别、不写库：这条只是"HR 可能约了这些"的建议，创建面试由用户在界面上确认。
        const extraction = await runtime.messages().extractInterview(id);
        runtime.events().publish('message.extracted', { id, via: extraction.via });
        return json(200, { ok: true, extraction });
    }
    return undefined;
}
export async function draftReply(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (method === 'POST' && segments.length === 3 && segments[0] === 'messages' && segments[2] === 'draft-reply') {
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法消息 id：${segments[1] ?? ''}`);
        const body = await readObject(req);
        const scenario = body['scenario'];
        if (typeof scenario !== 'string')
            throw new DomainError('INVALID_INPUT', 'scenario 必填');
        // 只生成草稿、不发送；真正发送仍走 /messages/:id/reply（闸门 + 两段式确认）。
        const draft = await runtime.messages().draftReply({ messageId: id, scenario: scenario });
        runtime.events().publish('message.reply_drafted', { id, scenario: draft.scenario, via: draft.via });
        return json(200, { ok: true, draft });
    }
    return undefined;
}
//# sourceMappingURL=messages.js.map