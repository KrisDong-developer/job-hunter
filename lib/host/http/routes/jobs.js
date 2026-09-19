/**
 * 岗位库（jobs 域）的路由：列表 / 筛选器取值集 / 批量标记 / 单岗位详情与标注。
 *
 * **顺序敏感**：`GET /jobs/facets` 与 `POST /jobs/batch/mark` 是**字面路径**，
 * 必须排在 `/:id`（下面的 `detail`）**之前** —— 否则 `facets` / `batch` 会被当成岗位 id 解析。
 * 下面两个私有解析器（`buildJobQuery` / `parseState`）与常量 `ORDER_BY_VALUES` 只服务本域，不外传。
 */
import { dataNotReady } from '../../runtime/contract.js';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/constants.js';
import { JOB_FLAG_TYPES, JOB_STATES } from '../../../shared/enums.js';
import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, readObject, requireData } from './kit.js';
const ORDER_BY_VALUES = ['crawled_at', 'salary_min', 'title', 'last_seen_at', 'first_seen_at'];
function parseState(raw) {
    if (raw === null || raw === '')
        return undefined;
    if (!JOB_STATES.includes(raw)) {
        throw new DomainError('INVALID_INPUT', `非法岗位状态：${raw}`, {
            hint: `合法取值：${JOB_STATES.join(' / ')}`,
        });
    }
    return raw;
}
function buildJobQuery(query) {
    const state = parseState(query.get('state'));
    const orderByRaw = query.get('orderBy');
    if (orderByRaw !== null && orderByRaw !== '' && !ORDER_BY_VALUES.includes(orderByRaw)) {
        throw new DomainError('INVALID_INPUT', `非法排序字段：${orderByRaw}`, {
            hint: `合法取值：${ORDER_BY_VALUES.join(' / ')}`,
        });
    }
    const minSalaryRaw = query.get('minSalary');
    const minSalary = minSalaryRaw === null || minSalaryRaw === '' ? undefined : Number.parseInt(minSalaryRaw, 10);
    // 「只看新增」：`firstSeenSince` 是界面按时间窗算出来的 ISO 时刻。
    // 非法值**显式报错**而不是当没传 —— 静默忽略会让用户对着"看起来筛了、其实没筛"的
    // 列表做判断（和 SR-42 对筛选键的处理同一个理由）。
    const firstSeenSinceRaw = query.get('firstSeenSince');
    const firstSeenSince = firstSeenSinceRaw === null ? '' : firstSeenSinceRaw.trim();
    if (firstSeenSince !== '' && Number.isNaN(new Date(firstSeenSince).getTime())) {
        throw new DomainError('INVALID_INPUT', `首次见到时间不是合法时刻：${firstSeenSince}`, {
            hint: '传 ISO 时刻（如 2026-09-17T09:00:00.000Z）—— 界面的「只看新增」会自己算好。',
        });
    }
    // 多城市：逗号分隔（如 `cities=深圳,北京`）；空则不带。
    const cities = (query.get('cities') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    // 经验 / 学历：同样是逗号分隔多选，取值是平台原始串（不做枚举校验 —— 校验会
    // 把"库里真实存在但我不认识"的写法筛掉，而那恰恰是用户想筛的那一类）。
    const expReqs = (query.get('expReqs') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    const eduReqs = (query.get('eduReqs') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    // 屏蔽标注类型：逗号分隔，只认合法的 JOB_FLAG_TYPES，非法项静默丢弃
    // （非法值不该让整个列表查询崩掉 —— 它是界面拼出来的补充参数）。
    const excludeFlags = (query.get('excludeFlags') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => JOB_FLAG_TYPES.includes(item));
    return {
        ...(state === undefined ? {} : { state }),
        ...(cities.length > 0 ? { cities } : query.get('city') === null || query.get('city') === '' ? {} : { city: query.get('city') }),
        ...(query.get('q') === null || query.get('q') === '' ? {} : { keyword: query.get('q') }),
        ...(query.get('platformId') === null || query.get('platformId') === ''
            ? {}
            : { platformId: query.get('platformId') }),
        ...(minSalary === undefined || !Number.isFinite(minSalary) ? {} : { minSalaryAtLeast: minSalary }),
        // 「只看新增」：只留首次见到时间 ≥ 该时刻的岗位（口径与首屏「今日新增」一致）
        ...(firstSeenSince === '' ? {} : { firstSeenSince }),
        ...(expReqs.length > 0 ? { expReqs } : {}),
        ...(eduReqs.length > 0 ? { eduReqs } : {}),
        ...(orderByRaw === null || orderByRaw === ''
            ? {}
            : { orderBy: orderByRaw }),
        ...(excludeFlags.length > 0 ? { excludeFlagTypes: excludeFlags } : {}),
        // 批次 4：按跨平台去重分组折叠（界面上的「跨平台折叠」开关）
        ...(query.get('groupDuplicates') === '1' ? { groupDuplicates: true } : {}),
        ...(query.get('desc') === null ? {} : { descending: query.get('desc') !== '0' && query.get('desc') !== 'false' }),
    };
}
// ── GET /jobs ──────────────────────────────────────────────────────
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'jobs')) {
        return undefined;
    }
    requireData(runtime);
    const jobService = runtime.jobs();
    if (jobService === undefined)
        throw dataNotReady(runtime);
    const page = parsePositiveInt(req.query.get('page'), 1, 1, 10_000);
    const pageSize = parsePositiveInt(req.query.get('pageSize'), PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX);
    const filters = buildJobQuery(req.query);
    const items = jobService.query(filters, pageSize, (page - 1) * pageSize);
    const total = jobService.countMatching(filters);
    const body = {
        items,
        page,
        pageSize,
        total,
        hasMore: (page - 1) * pageSize + items.length < total,
    };
    return json(200, body);
}
// ── GET /jobs/facets：筛选器的取值集（城市 / 经验 / 学历）─────────────
// 放在 `/jobs/:id` 之前：`facets` 是字面路径，不能让它被当成岗位 id 解析。
export async function facets(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'facets')) {
        return undefined;
    }
    requireData(runtime);
    const jobService = runtime.jobs();
    if (jobService === undefined)
        throw dataNotReady(runtime);
    return json(200, jobService.facets());
}
// ── POST /jobs/batch/mark：批量标记（同一状态应用到多个岗位）─────────
export async function batchMark(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(segments.length === 3 && segments[0] === 'jobs' && segments[1] === 'batch' && segments[2] === 'mark')) {
        return undefined;
    }
    if (method !== 'POST')
        throw new DomainError('INVALID_INPUT', '批量标记只支持 POST');
    requireData(runtime);
    const jobService = runtime.jobs();
    if (jobService === undefined)
        throw dataNotReady(runtime);
    const body = await readObject(req);
    const ids = Array.isArray(body['ids'])
        ? body['ids'].filter((value) => typeof value === 'number' && Number.isInteger(value) && value > 0)
        : [];
    const state = body['state'];
    if (typeof state !== 'string' || !JOB_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', '批量标记需要合法的 state', {
            hint: `合法取值：${JOB_STATES.join(' / ')}`,
        });
    }
    if (ids.length === 0) {
        throw new DomainError('INVALID_INPUT', 'ids 不能为空，且每一项都必须是正整数');
    }
    const applied = [];
    const missing = [];
    for (const id of [...new Set(ids)]) {
        try {
            const updated = jobService.mark(id, state);
            applied.push({ id: updated.id, state: updated.state });
        }
        catch (error) {
            if (error instanceof DomainError && error.code === 'NOT_FOUND') {
                missing.push(id);
                continue;
            }
            throw error;
        }
    }
    if (applied.length > 0) {
        runtime.events().publish('jobs.marked', { ids: applied.map((item) => item.id), state });
    }
    return json(200, { ok: true, applied, missing, total: applied.length });
}
// ── GET /jobs/:id ──────────────────────────────────────────────────
export async function detail(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'jobs')) {
        return undefined;
    }
    const idRaw = segments[1] ?? '';
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id)) {
        throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`);
    }
    requireData(runtime);
    const jobService = runtime.jobs();
    if (jobService === undefined)
        throw dataNotReady(runtime);
    // P4：详情带上标注依据与匹配理由 —— 界面上的每个结论都要能回答「凭什么」
    return json(200, jobService.detailFull(id));
}
// ── POST /jobs/:id/mark ────────────────────────────────────────────
export async function mark(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'mark')) {
        return undefined;
    }
    const idRaw = segments[1] ?? '';
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id)) {
        throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`);
    }
    requireData(runtime);
    const jobService = runtime.jobs();
    if (jobService === undefined)
        throw dataNotReady(runtime);
    const raw = await req.readJson();
    const body = raw !== null && typeof raw === 'object' ? raw : {};
    if (typeof body.state !== 'string' || !JOB_STATES.includes(body.state)) {
        throw new DomainError('INVALID_INPUT', 'mark 需要一个合法的 state', {
            hint: `合法取值：${JOB_STATES.join(' / ')}`,
        });
    }
    const updated = jobService.mark(id, body.state);
    runtime.events().publish('job.updated', { id: updated.id, state: updated.state });
    return json(200, { ok: true, job: updated });
}
//# sourceMappingURL=jobs.js.map