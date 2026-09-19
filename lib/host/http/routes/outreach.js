/**
 * 触达域路由：`POST /jobs/:id/greeting/draft`（生成话术）、`POST /greeting/send`（发送，两段式确认）、
 * `POST /inbox/sync`（同步收件箱）、`POST /jobs/:id/detect-stage`（探测接触阶段）、
 * `GET|POST /greeting/templates`（话术模板）。
 *
 * 归属规则：`/jobs/:id/greeting/draft` 与 `/jobs/:id/detect-stage` 虽然挂在 `/jobs` 前缀下，
 * 但按**行为**归属在本模块 —— 它们调用的是 `runtime.draftGreeting` / `runtime.probeContactStage`，
 * 而不是 jobs.ts 里的岗位读写。
 */
import { dataNotReady } from '../../runtime/contract.js';
import { TONE_LABEL } from '../../../shared/labels.js';
import { DomainError } from '../../util/errors.js';
import { json, readObject, requireData } from './kit.js';
/** 原 router.ts L1111-1135。 */
export async function greetingDraft(ctx) {
    const { runtime, req, segments, method } = ctx;
    // ── 打招呼话术与发送（P5）──────────────────────────────────────────
    // 生成是低危的；发送是高危的，`POST /greeting/send` 第一次会返回 409 + 确认文案，
    // 用户确认后带 `confirm: true` 重发。模型工具走的是同一道闸门（只是"问"的方式不同）。
    if (segments.length >= 2 && segments[0] === 'jobs' && segments[2] === 'greeting' && segments[3] === 'draft') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '生成话术只支持 POST');
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`);
        const body = await readObject(req);
        const tone = body['tone'];
        if (tone !== undefined && (typeof tone !== 'string' || !(tone in TONE_LABEL))) {
            throw new DomainError('INVALID_INPUT', 'tone 取值不合法', {
                hint: `合法取值：${Object.keys(TONE_LABEL).join(' / ')}`,
            });
        }
        const highlights = Array.isArray(body['highlights'])
            ? body['highlights'].filter((item) => typeof item === 'string').slice(0, 3)
            : undefined;
        const draft = await runtime.draftGreeting({
            jobId: id,
            ...(tone === undefined ? {} : { tone: tone }),
            ...(highlights === undefined ? {} : { highlights }),
        });
        return json(200, { ok: true, draft });
    }
    return undefined;
}
/** 原 router.ts L1137-1155。 */
export async function greetingSend(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (segments.length === 2 && segments[0] === 'greeting' && segments[1] === 'send') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '发送打招呼只支持 POST');
        requireData(runtime);
        const body = await readObject(req);
        const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
        if (!Number.isFinite(jobId) || jobId <= 0) {
            throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
        }
        const text = typeof body['text'] === 'string' && body['text'].trim() !== '' ? body['text'] : undefined;
        // `confirm: true` 是**界面上的用户**这一次的确认（两段式 HTTP）。
        // 模型工具没有这条路径 —— 它的确认只能来自 `ctx.approval`。
        const result = await runtime.sendGreeting({
            jobId,
            ...(text === undefined ? {} : { text }),
            actor: 'gui',
            ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
        });
        return json(200, { ok: true, result });
    }
    return undefined;
}
/** 原 router.ts L1157-1174。 */
export async function inboxSync(ctx) {
    const { runtime, req, segments, method } = ctx;
    /**
     * 同步收件箱（§13 U6）：把平台会话列表读进本地消息表。
     *
     * 低危，所以**没有两段式确认** —— 它不对外发任何东西。仍然经闸门（会开真实页面）。
     */
    if (segments.length === 2 && segments[0] === 'inbox' && segments[1] === 'sync') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '同步收件箱只支持 POST');
        requireData(runtime);
        const body = await readObject(req);
        const platformId = typeof body['platformId'] === 'string' ? body['platformId'].trim() : '';
        if (platformId === '') {
            throw new DomainError('INVALID_INPUT', 'platformId 不能为空', {
                hint: '例如 {"platformId":"zhipin"}。',
            });
        }
        const result = await runtime.syncInbox({ platformId, actor: 'gui' });
        return json(200, { ok: true, result });
    }
    return undefined;
}
/** 原 router.ts L1176-1190。 */
export async function detectStage(ctx) {
    const { runtime, segments, method } = ctx;
    /**
     * 探测某岗位在平台上的**接触阶段**（HR 是否已读/已回）。
     *
     * 低危（只看不发）→ 没有两段式确认，但仍然经闸门（会开真实页面）。
     * ⚠️ **只探测、不改状态**（识别 ≠ 改状态，§4.3）：返回的是平台事实，
     * 要不要据此推进接触态由用户显式决定 —— 误判一次会漏掉一个真在推进的岗位。
     */
    if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'detect-stage') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '探测接触阶段只支持 POST');
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`);
        const result = await runtime.probeContactStage({ jobId: id, actor: 'gui' });
        return json(200, { ok: true, result });
    }
    return undefined;
}
/** 原 router.ts L1908-1941。 */
export async function greetingTemplates(ctx) {
    const { runtime, req, segments, method } = ctx;
    // 话术模板（§11.3 `GreetingTemplate`）
    if (segments.length >= 1 && segments[0] === 'greeting' && segments[1] === 'templates') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        if (method === 'GET') {
            return json(200, {
                items: store.pipeline.listTemplates().map((template) => ({
                    ...template,
                    // 回复率：次数太少时不给百分比（与 analytics 同一条原则）
                    replyRate: template.uses === 0 ? null : template.replies / template.uses,
                })),
            });
        }
        if (method === 'POST') {
            const body = await readObject(req);
            if (typeof body['name'] !== 'string' || typeof body['body'] !== 'string') {
                throw new DomainError('INVALID_INPUT', 'name 与 body 都必填');
            }
            const template = store.pipeline.upsertTemplate({
                ...(typeof body['id'] === 'number' ? { id: body['id'] } : {}),
                name: body['name'],
                body: body['body'],
                ...(Array.isArray(body['vars'])
                    ? { vars: body['vars'].filter((item) => typeof item === 'string') }
                    : {}),
                ...(typeof body['scene'] === 'string' ? { scene: body['scene'] } : {}),
            }, new Date().toISOString());
            return json(201, { ok: true, template });
        }
    }
    return undefined;
}
//# sourceMappingURL=outreach.js.map