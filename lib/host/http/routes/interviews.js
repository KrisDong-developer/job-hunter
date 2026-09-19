import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, readObject, requireData } from './kit.js';
// ── P7：面试日程（§13 U7）────────────────────────────────────────
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'interviews')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const from = req.query.get('from');
    const to = req.query.get('to');
    return json(200, {
        items: service.list({
            ...(from === null || to === null ? {} : { from, to }),
            limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
        }),
        conflicts: service.conflicts(),
    });
}
export async function create(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 1 && segments[0] === 'interviews')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const body = await readObject(req);
    if (typeof body['at'] !== 'string' || body['at'] === '') {
        throw new DomainError('INVALID_INPUT', 'at（面试时间）必填');
    }
    const interview = service.upsert({
        at: body['at'],
        ...(typeof body['applicationId'] === 'number' ? { applicationId: body['applicationId'] } : {}),
        ...(typeof body['jobId'] === 'number' ? { jobId: body['jobId'] } : {}),
        ...(typeof body['round'] === 'number' ? { round: body['round'] } : {}),
        ...(typeof body['tz'] === 'string' ? { tz: body['tz'] } : {}),
        ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
        ...(typeof body['link'] === 'string' ? { link: body['link'] } : {}),
        ...(typeof body['contact'] === 'string' ? { contact: body['contact'] } : {}),
        ...(typeof body['kind'] === 'string' ? { kind: body['kind'] } : {}),
        ...(typeof body['commuteMin'] === 'number' ? { commuteMin: body['commuteMin'] } : {}),
    });
    runtime.events().publish('interview.scheduled', { id: interview.id, at: interview.at });
    return json(201, { ok: true, interview });
}
export async function conflicts(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews' && segments[1] === 'conflicts')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    return json(200, { items: service.conflicts() });
}
export async function upcoming(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews' && segments[1] === 'upcoming')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const hours = parsePositiveInt(req.query.get('hours'), 72, 1, 24 * 30);
    return json(200, { items: service.upcoming(hours) });
}
export async function get(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    return json(200, service.get(interviewId));
}
export async function patch(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'interviews')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    const interview = service.upsert({
        id: interviewId,
        at: typeof body['at'] === 'string' ? body['at'] : service.get(interviewId).at,
        ...(typeof body['round'] === 'number' ? { round: body['round'] } : {}),
        ...(typeof body['state'] === 'string' ? { state: body['state'] } : {}),
        ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
        ...(typeof body['link'] === 'string' ? { link: body['link'] } : {}),
        ...(typeof body['contact'] === 'string' ? { contact: body['contact'] } : {}),
        ...(typeof body['kind'] === 'string' ? { kind: body['kind'] } : {}),
        ...(typeof body['commuteMin'] === 'number' ? { commuteMin: body['commuteMin'] } : {}),
    });
    return json(200, { ok: true, interview });
}
export async function remove(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'interviews')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    if (!service.remove(interviewId))
        throw new DomainError('NOT_FOUND', `面试不存在：${String(interviewId)}`);
    return json(200, { ok: true });
}
export async function setState(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'state')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    const state = body['state'];
    if (typeof state !== 'string')
        throw new DomainError('INVALID_INPUT', 'state 必填');
    return json(200, {
        ok: true,
        interview: service.setState(interviewId, state, {
            ...(body['allowReschedule'] === true ? { allowReschedule: true } : {}),
        }),
    });
}
export async function review(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'review')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    return json(200, { ok: true, interview: service.review(interviewId, body) });
}
export async function prep(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'prep')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.interviews();
    const interviewId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(interviewId)) {
        throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
    }
    return json(200, service.prep(interviewId));
}
//# sourceMappingURL=interviews.js.map