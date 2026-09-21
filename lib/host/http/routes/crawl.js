/**
 * 采集（crawl）与筛选维度的路由：`/crawl` 的状态 / 历史 / 触发，以及筛选维度查询。
 *
 * **顺序敏感**：`GET /crawl/status`、`GET /crawl/runs`、`POST /crawl/run` 第二段是同前缀
 * 字面量，分别由 `status` / `runs` / `run` 三个 handler 精确匹配；`POST /crawl`（`once`）
 * 是另一条独立路径，靠 `segments.length === 1` 与前者区分。维度接口在 `/criteria/dimensions`。
 */
import { dataNotReady } from '../../runtime/contract.js';
import { DomainError } from '../../util/errors.js';
import { criteriaDimensionsFor, criteriaToSearchCriteria } from '../../domain/plan-config.js';
import { previewOf } from '../../platform/preview.js';
import { json, parsePositiveInt, readObject, requireData } from './kit.js';
// ── GET /crawl/status ──────────────────────────────────────────────
export async function status(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'status')) {
        return undefined;
    }
    return json(200, runtime.crawlStatus());
}
// ── GET /crawl/runs ────────────────────────────────────────────────
export async function runs(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'runs')) {
        return undefined;
    }
    requireData(runtime);
    const limit = parsePositiveInt(req.query.get('limit'), 20, 1, 100);
    const platformId = req.query.get('platformId');
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    return json(200, {
        items: store.crawlRun.list(limit, platformId === null || platformId === '' ? undefined : platformId),
    });
}
// ── POST /crawl/run ────────────────────────────────────────────────
export async function run(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'run')) {
        return undefined;
    }
    requireData(runtime);
    const raw = await req.readJson();
    const input = raw !== null && typeof raw === 'object' ? raw : {};
    const adapters = runtime.registry().list();
    const platformId = typeof input['platformId'] === 'string' && input['platformId'] !== ''
        ? input['platformId']
        : adapters[0]?.id;
    if (platformId === undefined) {
        throw new DomainError('NOT_FOUND', '没有已注册的平台');
    }
    const criteria = input['criteria'] !== null && typeof input['criteria'] === 'object'
        ? input['criteria']
        : {};
    const summary = await runtime.crawl({ platformId, criteria });
    return json(200, summary);
}
// ── A2："抓取一次"走**默认方案**（不再写死 {51job, 深圳, Java}）──────
// 没有方案时先建一个默认方案，所以这个入口永远有一个真实条件，而不是一个字面量。
export async function once(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 1 && segments[0] === 'crawl')) {
        return undefined;
    }
    requireData(runtime);
    const planService = runtime.plans();
    planService.ensureDefault();
    const first = planService.list().find((plan) => plan.enabled) ?? planService.list()[0];
    if (first === undefined) {
        throw new DomainError('INVALID_INPUT', '还没有任何方案，请先去「采集」页建一个', {
            hint: '方案决定抓什么（平台 + 条件 + 抓取深度）。',
        });
    }
    const summary = await runtime.runPlan(first.id, 'manual');
    return json(200, { ...summary, planId: first.id, planName: first.name });
}
// ── SR-41：当前平台支持哪些筛选维度（界面据此渲染筛选器）─────────────
export async function dimensions(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'criteria' && segments[1] === 'dimensions')) {
        return undefined;
    }
    requireData(runtime);
    const platforms = (req.query.get('platforms') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    const effective = platforms.length === 0 ? runtime.registry().list().map((adapter) => adapter.id) : platforms;
    return json(200, {
        items: criteriaDimensionsFor(runtime.registry(), effective),
        platforms: effective,
        available: runtime
            .registry()
            .list()
            .map((adapter) => ({ id: adapter.id, displayName: adapter.displayName })),
    });
}
// ── POST /criteria/preview：干跑，看这份条件对每个平台会请求什么 ──────────
/**
 * 把方案条件翻成"每个平台**实际会发出的请求**"。**不发任何请求**：走的是采集主链
 * 用来拼 URL / body 的同一批纯函数（`platform/preview.ts`）。
 *
 * 为什么值得一条接口：界面上写的条件、校验放行的条件、真正发出去的请求是三件事，
 * 而它们分叉时用户什么都看不到 —— "筛了没结果"与"根本没筛"长得一模一样。
 * 这条接口把那第三件事变成可读的数据，方案表单在保存前就能显示
 * "这个条件落到哪个参数上、哪个条件根本没有平台会用"。
 *
 * 低危：只读注册表、不写库、不开浏览器。
 */
export async function previewCriteria(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'criteria' && segments[1] === 'preview')) {
        return undefined;
    }
    requireData(runtime);
    const body = await readObject(req);
    const platforms = Array.isArray(body['platforms'])
        ? body['platforms'].filter((value) => typeof value === 'string' && value !== '')
        : runtime
            .registry()
            .list()
            .map((adapter) => adapter.id);
    const criteria = {};
    const raw = body['criteria'];
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'string')
                criteria[key] = value;
            else if (typeof value === 'number' && Number.isFinite(value))
                criteria[key] = String(value);
        }
    }
    // 与采集主链**同一个**转换：预览与真实请求的分叉点只允许有一处。
    const search = criteriaToSearchCriteria(criteria);
    return json(200, {
        criteria: search,
        items: platforms.map((platformId) => {
            const adapter = runtime.registry().get(platformId);
            if (adapter === undefined) {
                return { platformId, displayName: platformId, request: null, error: '未注册的平台' };
            }
            try {
                const request = previewOf(adapter, search);
                return {
                    platformId,
                    displayName: adapter.displayName,
                    request,
                    // 构造不出请求不是"没条件"，而是**这个平台这一轮会被跳过**（如城市码未配置）——
                    // 必须说出来，否则界面上它看起来和"什么都没配"一样。
                    error: request === null
                        ? '这份条件构造不出请求（例如城市码未配置）—— 这一轮这个平台会被跳过'
                        : null,
                };
            }
            catch (error) {
                return {
                    platformId,
                    displayName: adapter.displayName,
                    request: null,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }),
    });
}
//# sourceMappingURL=crawl.js.map