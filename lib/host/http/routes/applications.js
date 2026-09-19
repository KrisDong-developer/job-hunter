/**
 * 投递流水线相关的端点：投递简历（POST /applications/deliver）、投递记录
 * （GET/POST /applications、GET /applications/:id、POST /applications/:id/advance）、
 * 看板（GET /board）、岗位跟进历史（GET /jobs/:id/history）以及跟进建议
 * （GET /followups、POST /followups/resolve）。
 *
 * 每条路由的 matcher 都是**精确形状**（方法 + 段数 + 字面量），所以这里没有顺序约束：
 * `/applications/deliver` 不会被 `/applications/:id` 抢走 —— 后者只认 `GET`，而 `deliver` 是 `POST`。
 */
import { APPLICATION_STAGES } from '../../../shared/enums.js';
import { DomainError } from '../../util/errors.js';
import { json, readObject, requireData } from './kit.js';
/**
 * 投递简历（高危，两段式确认）。
 *
 * ⚠️ 与 `POST /applications`（记一笔投递）**不是一回事**：这条会真的用适配器把简历发出去。
 */
export async function deliver(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (segments.length === 2 && segments[0] === 'applications' && segments[1] === 'deliver') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '投递简历只支持 POST');
        requireData(runtime);
        const body = await readObject(req);
        const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
        if (!Number.isFinite(jobId) || jobId <= 0) {
            throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
        }
        const filePath = typeof body['filePath'] === 'string' && body['filePath'].trim() !== '' ? body['filePath'] : null;
        // `confirm: true` 是**界面上的用户**这一次的确认（两段式 HTTP）；模型工具没有这条路径
        const result = await runtime.sendApplication({
            jobId,
            filePath,
            actor: 'gui',
            ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
        });
        return json(200, { ok: true, result });
    }
    return undefined;
}
// ── P7：投递流水线（§4.7 / §13 U5）────────────────────────────────
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'applications')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.pipeline();
    const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
    const stage = req.query.get('stage');
    return json(200, {
        items: service.list({
            ...(Number.isFinite(jobId) ? { jobId } : {}),
            ...(stage === null || stage === '' ? {} : { stage: parseStage(stage) }),
        }),
    });
}
export async function create(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 1 && segments[0] === 'applications')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.pipeline();
    const body = await readObject(req);
    const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
    if (!Number.isFinite(jobId) || jobId <= 0) {
        throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
    }
    const application = await service.recordApplication({
        jobId,
        actor: 'gui',
        ...(typeof body['resumeId'] === 'number' ? { resumeId: body['resumeId'] } : {}),
        ...(typeof body['resumeFileId'] === 'number' ? { resumeFileId: body['resumeFileId'] } : {}),
        ...(typeof body['channel'] === 'string' ? { channel: body['channel'] } : {}),
        ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
        // 界面上的二次确认（§4.4.2 的两段式）
        ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
    });
    runtime.events().publish('application.created', { id: application.id, jobId });
    return json(201, { ok: true, application });
}
export async function get(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'applications')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.pipeline();
    const applicationId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(applicationId)) {
        throw new DomainError('INVALID_INPUT', `非法投递 id：${segments[1] ?? ''}`);
    }
    return json(200, service.get(applicationId));
}
export async function advance(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'applications' && segments[2] === 'advance')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.pipeline();
    const applicationId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(applicationId)) {
        throw new DomainError('INVALID_INPUT', `非法投递 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    const to = body['to'];
    if (typeof to !== 'string')
        throw new DomainError('INVALID_INPUT', 'advance 需要 to');
    const application = service.advance({
        applicationId,
        to: parseStage(to),
        actor: 'gui',
        ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
        ...(body['allowBackward'] === true ? { allowBackward: true } : {}),
    });
    runtime.events().publish('application.advanced', { id: applicationId, stage: application.stage });
    return json(200, { ok: true, application });
}
export async function board(ctx) {
    const { runtime, segments, method } = ctx;
    if (method === 'GET' && segments.length === 1 && segments[0] === 'board') {
        requireData(runtime);
        return json(200, runtime.pipeline().board());
    }
    return undefined;
}
export async function jobHistory(ctx) {
    const { runtime, segments, method } = ctx;
    // 某个岗位的跟进历史（状态事件）——详情页要能回答"凭什么"
    if (method === 'GET' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'history') {
        requireData(runtime);
        const jobId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(jobId))
            throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`);
        return json(200, {
            items: runtime.pipeline().history(jobId),
            contactStage: runtime.pipeline().contactStage(jobId),
        });
    }
    return undefined;
}
export async function followups(ctx) {
    const { runtime, segments, method } = ctx;
    // 跟进建议（U0 今日与流水线页都用）
    if (method === 'GET' && segments.length === 1 && segments[0] === 'followups') {
        requireData(runtime);
        return json(200, { items: runtime.followUps() });
    }
    return undefined;
}
export async function followupsResolve(ctx) {
    const { runtime, req, segments, method } = ctx;
    // 处置一条跟进建议（§12.2 收口）：建议是推导出的，没有 id，用 jobId+kind 定位
    if (method === 'POST' && segments.length === 2 && segments[0] === 'followups' && segments[1] === 'resolve') {
        requireData(runtime);
        const body = await readObject(req);
        const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
        const kind = body['kind'];
        if (!Number.isFinite(jobId) || jobId <= 0) {
            throw new DomainError('INVALID_INPUT', 'jobId 必填且为正整数');
        }
        if (kind !== 'unread-timeout' && kind !== 'read-no-reply') {
            throw new DomainError('INVALID_INPUT', 'kind 必须是 unread-timeout 或 read-no-reply', {
                hint: '跟进建议只有这两类（见 GET /followups）。',
            });
        }
        runtime.pipeline().resolveFollowUp(jobId, kind);
        runtime.events().publish('followup.resolved', { jobId, kind });
        return json(200, { ok: true });
    }
    return undefined;
}
function parseStage(raw) {
    if (!APPLICATION_STAGES.includes(raw)) {
        throw new DomainError('INVALID_INPUT', `不支持的投递阶段：${raw}`, {
            hint: `合法取值：${APPLICATION_STAGES.join(' / ')}`,
        });
    }
    return raw;
}
//# sourceMappingURL=applications.js.map