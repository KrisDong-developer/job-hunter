/**
 * 前缀内部路由（§4.7）。
 *
 * **刻意与传输层解耦**：入参是 `RouteRequest`（方法/路径/查询/头/读体），
 * 出参是 `RouteResult`（JSON 或「这是一个 SSE 流」）。Node 的 `IncomingMessage` /
 * `ServerResponse` 只在 `http.ts` 里出现。
 * 这样做的直接好处：路由与参数校验可以**离线单测**，不必造假的流对象。
 *
 * 入口层零业务逻辑（P3）：这里只做协议转换 —— 解析参数、调用领域、序列化、映射错误。
 */
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../shared/constants.js';
import { SALARY_BASES } from '../../shared/dto.js';
import { APPLICATION_STAGES, JOB_FLAG_TYPES, JOB_STATES, RESUME_FORMATS, RESUME_LANGUAGES, RESUME_STATES, RESUME_TEMPLATES, TODO_KINDS, TODO_LEVELS, } from '../../shared/enums.js';
import { TONE_LABEL } from '../../shared/labels.js';
import { normalizeResumeContent } from '../../shared/resume.js';
import { DICTIONARY_KINDS } from '../store/repo/dictionary.js';
import { criteriaDimensionsFor } from '../domain/plan-config.js';
import { SKIP_REASON_LABEL } from '../scheduler/index.js';
import { ConfirmRequiredError } from '../guard/index.js';
import { dataNotReady } from '../runtime.js';
import { DomainError, messageOf } from '../util/errors.js';
import { revealDataFile } from '../util/reveal.js';
const ORDER_BY_VALUES = ['crawled_at', 'salary_min', 'title', 'last_seen_at', 'first_seen_at'];
function json(status, body) {
    return { kind: 'json', status, body };
}
function parsePositiveInt(raw, fallback, min, max) {
    if (raw === null || raw === '')
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
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
/** 数据层未就绪的路由一律走这个，错误信息可读且可被 GUI 直接展示。 */
function requireData(runtime) {
    if (!runtime.isReady())
        throw dataNotReady(runtime);
}
/** 读一个 JSON 对象体；不是对象就报 400。 */
async function readObject(req) {
    const raw = await req.readJson();
    if (raw === null || raw === undefined)
        return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new DomainError('INVALID_INPUT', '请求体必须是一个 JSON 对象');
    }
    return raw;
}
/** 把请求体收敛成**显式给出**的方案字段。没给的键一律不出现 —— 更新时靠这一点保留原值。 */
function planPatchOf(body) {
    const patch = {};
    if (typeof body['name'] === 'string')
        patch.name = body['name'];
    if (Array.isArray(body['platforms'])) {
        patch.platforms = body['platforms'].filter((value) => typeof value === 'string' && value !== '');
    }
    if (typeof body['criteria'] === 'object' && body['criteria'] !== null && !Array.isArray(body['criteria'])) {
        const criteria = {};
        for (const [key, value] of Object.entries(body['criteria'])) {
            // 数值型维度允许直接给数字（界面上的数字输入框就是这么发的）
            if (typeof value === 'string')
                criteria[key] = value;
            else if (typeof value === 'number' && Number.isFinite(value))
                criteria[key] = String(value);
        }
        patch.criteria = criteria;
    }
    if (typeof body['platformOverrides'] === 'object' &&
        body['platformOverrides'] !== null &&
        !Array.isArray(body['platformOverrides'])) {
        // 批次 3：每平台的覆盖项（`enabled` / `maxPages`）。
        // `maxPages` 同时接受数字与字符串 —— 界面上的数字输入框两种都可能发。
        // 语义是**整份替换**（与 criteria 一致），不是逐键合并：稀疏存储下
        // "把某平台的覆盖删掉"必须能表达得出来，逐键合并做不到这件事。
        const overrides = {};
        for (const [id, raw] of Object.entries(body['platformOverrides'])) {
            if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
                continue;
            const entry = raw;
            const parsed = {};
            if (typeof entry['enabled'] === 'boolean')
                parsed.enabled = entry['enabled'];
            const maxPages = entry['maxPages'];
            if (maxPages === null) {
                parsed.maxPages = null;
            }
            else if (typeof maxPages === 'number' && Number.isFinite(maxPages)) {
                parsed.maxPages = Math.trunc(maxPages);
            }
            else if (typeof maxPages === 'string' && maxPages.trim() !== '') {
                const value = Number.parseInt(maxPages, 10);
                parsed.maxPages = Number.isFinite(value) ? value : null;
            }
            overrides[id] = parsed;
        }
        patch.platformOverrides = overrides;
    }
    if (typeof body['schedule'] === 'object' && body['schedule'] !== null) {
        patch.schedule = scheduleOf(body['schedule']);
    }
    if (typeof body['postProcess'] === 'object' && body['postProcess'] !== null) {
        const source = body['postProcess'];
        const postProcess = {};
        for (const key of ['score', 'flag', 'dedup']) {
            if (typeof source[key] === 'boolean')
                postProcess[key] = source[key];
        }
        patch.postProcess = postProcess;
    }
    if (typeof body['enabled'] === 'boolean')
        patch.enabled = body['enabled'];
    return patch;
}
/**
 * 解析偏好时段（SR-1/32）。
 *
 * **不认识 `hour` / `minute`**：那正是 SR-32 要取消的"精确到分钟的单点时刻"。
 * 收到它们就明确报错并指出正确用法 —— 静默忽略会让调用方以为自己配成功了，
 * 而实际跑的是另一个时段（这类"看起来对、其实不对"的配置 bug 最难查）。
 */
function scheduleOf(source) {
    const schedule = {};
    const hourKeys = ['hour', 'minute'].filter((key) => source[key] !== undefined);
    if (hourKeys.length > 0) {
        throw new DomainError('INVALID_INPUT', `偏好时段不接受 ${hourKeys.join(' / ')}`, {
            hint: '配置的是**时段**而不是单点时刻（SR-32）：用 windowStartHour / windowEndHour ' +
                '（可加 windowStartMinute / windowEndMinute），触发点在这个时段内随机选。',
        });
    }
    const intField = (key, min, max) => {
        const value = source[key];
        if (value === undefined)
            return;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new DomainError('INVALID_INPUT', `${key} 必须是数字`);
        }
        const truncated = Math.trunc(value);
        if (truncated < min || truncated > max) {
            throw new DomainError('INVALID_INPUT', `${key} 必须在 ${String(min)}–${String(max)} 之间`);
        }
        ;
        schedule[key] = truncated;
    };
    intField('windowStartHour', 0, 23);
    intField('windowStartMinute', 0, 59);
    intField('windowEndHour', 0, 23);
    intField('windowEndMinute', 0, 59);
    intField('jitterMs', 0, 60 * 60 * 1000);
    intField('missedGraceMs', 0, 7 * 24 * 60 * 60 * 1000);
    if (Array.isArray(source['weekdays'])) {
        schedule.weekdays = source['weekdays'].filter((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6);
    }
    if (typeof source['enabled'] === 'boolean')
        schedule.enabled = source['enabled'];
    return schedule;
}
/**
 * 新建方案：缺省字段交给领域层。
 *
 * 注意 `platforms` **不在这里兜底** —— 写死 `['51job']` 会在多平台落地那天
 * 变成"新装的用户只抓到 51job"这种没人查得出来的 bug。
 * 缺省平台由路由层用**注册表**补齐（见 `POST /plans` 的处理）。
 */
function planCreateOf(body) {
    const patch = planPatchOf(body);
    return {
        name: patch.name ?? '未命名方案',
        ...(patch.platforms === undefined ? {} : { platforms: patch.platforms }),
        ...(patch.platformOverrides === undefined ? {} : { platformOverrides: patch.platformOverrides }),
        ...(patch.criteria === undefined ? {} : { criteria: patch.criteria }),
        ...(patch.schedule === undefined ? {} : { schedule: patch.schedule }),
        ...(patch.postProcess === undefined ? {} : { postProcess: patch.postProcess }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    };
}
/**
 * 解析配置补丁（P5）。
 *
 * 只认识 `ai`、`guard`、`browser` 三个顶层键，其余一律忽略 ——
 * 让界面**不可能**通过手搓 JSON 去碰它不该碰的东西。
 * guard 那半边的键是否合法由 `guard/actions/settings.ts` 判定（模型有禁止项，用户没有）。
 * browser 暴露 `idleCloseMinutes`（数字）、`engine`（字符串枚举）、`stealthInit`（布尔）
 * —— 取值合法性由 `normalizeBrowserConfig` 收敛，这里只做类型白名单。
 */
function settingsPatchOf(body) {
    const patch = {};
    const ai = body['ai'];
    if (typeof ai === 'object' && ai !== null) {
        const source = ai;
        const purposes = typeof source['purposes'] === 'object' && source['purposes'] !== null
            ? source['purposes']
            : undefined;
        patch.ai = {
            ...(typeof source['enabled'] === 'boolean' ? { enabled: source['enabled'] } : {}),
            ...(purposes === undefined ? {} : { purposes: purposes }),
        };
    }
    const guard = body['guard'];
    if (typeof guard === 'object' && guard !== null) {
        const source = guard;
        const levels = typeof source['levels'] === 'object' && source['levels'] !== null
            ? source['levels']
            : undefined;
        patch.guard = {
            ...(levels === undefined ? {} : { levels: levels }),
            ...(typeof source['requireApproval'] === 'boolean' ? { requireApproval: source['requireApproval'] } : {}),
            ...(typeof source['auditEnabled'] === 'boolean' ? { auditEnabled: source['auditEnabled'] } : {}),
            ...(typeof source['batchLimit'] === 'number' ? { batchLimit: source['batchLimit'] } : {}),
            ...(typeof source['cooldownMinutes'] === 'number' ? { cooldownMinutes: source['cooldownMinutes'] } : {}),
            ...(typeof source['sendWindow'] === 'string' ? { sendWindow: source['sendWindow'] } : {}),
            ...(typeof source['dayOffProbability'] === 'number' ? { dayOffProbability: source['dayOffProbability'] } : {}),
            ...(typeof source['dailyLimits'] === 'object' && source['dailyLimits'] !== null
                ? { dailyLimits: source['dailyLimits'] }
                : {}),
        };
    }
    const browser = body['browser'];
    if (typeof browser === 'object' && browser !== null) {
        const source = browser;
        patch.browser = {
            ...(typeof source['idleCloseMinutes'] === 'number' ? { idleCloseMinutes: source['idleCloseMinutes'] } : {}),
            // "每轮采集结束后就关"（用户要求）：布尔白名单；与分钟那一格的优先级在 idleCloseMsOf
            ...(typeof source['closeAfterRun'] === 'boolean' ? { closeAfterRun: source['closeAfterRun'] } : {}),
            // D-17a：引擎偏好与 stealth 注入开关（类型白名单；取值由 normalizeBrowserConfig 收敛）
            ...(typeof source['engine'] === 'string' ? { engine: source['engine'] } : {}),
            ...(typeof source['stealthInit'] === 'boolean' ? { stealthInit: source['stealthInit'] } : {}),
        };
    }
    return patch;
}
/**
 * 解析简历写入体（P6）。
 *
 * 与配置补丁同样的思路：**只认识白名单里的键**，其余一律忽略，
 * 让界面不可能通过手搓 JSON 去碰它不该碰的东西（例如直接改 `rev`）。
 */
function resumeWriteOf(body) {
    const patch = resumePatchOf(body);
    return {
        name: typeof body['name'] === 'string' && body['name'].trim() !== '' ? body['name'].trim() : '新简历',
        content: patch.content ?? normalizeResumeContent({}),
        ...(patch.direction === undefined ? {} : { direction: patch.direction }),
        ...(patch.language === undefined ? {} : { language: patch.language }),
        ...(patch.state === undefined ? {} : { state: patch.state }),
        ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
    };
}
/** 简历补丁：缺项一律**不传**，让领域层保留原值（`rev` 只为真变动递增）。 */
function resumePatchOf(body) {
    const patch = {};
    if (typeof body['name'] === 'string' && body['name'].trim() !== '')
        patch.name = body['name'].trim();
    if (typeof body['direction'] === 'string')
        patch.direction = body['direction'];
    if (typeof body['language'] === 'string' && RESUME_LANGUAGES.includes(body['language'])) {
        patch.language = body['language'];
    }
    if (typeof body['state'] === 'string' && RESUME_STATES.includes(body['state'])) {
        patch.state = body['state'];
    }
    if (typeof body['isDefault'] === 'boolean')
        patch.isDefault = body['isDefault'];
    // 内容整个替换：不做字段级 merge —— 简历是一棵树，半合并出来的树比替换更难排查
    if (body['content'] !== undefined && body['content'] !== null && typeof body['content'] === 'object') {
        patch.content = normalizeResumeContent(body['content']);
    }
    return patch;
}
function parseFormat(raw) {
    if (typeof raw === 'string' && RESUME_FORMATS.includes(raw)) {
        return raw;
    }
    if (raw === undefined || raw === null || raw === '')
        return 'pdf';
    throw new DomainError('INVALID_INPUT', `不支持的导出格式：${String(raw)}`, {
        hint: `合法取值：${RESUME_FORMATS.join(' / ')}`,
    });
}
function parseTemplate(raw) {
    if (raw === null || raw === '')
        return 'concise';
    if (!RESUME_TEMPLATES.includes(raw)) {
        throw new DomainError('INVALID_INPUT', `不支持的模板：${raw}`, {
            hint: `合法取值：${RESUME_TEMPLATES.join(' / ')}`,
        });
    }
    return raw;
}
function contentTypeOf(format) {
    switch (format) {
        case 'pdf':
            return 'application/pdf';
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        default:
            return 'text/html; charset=utf-8';
    }
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
/**
 * 一个去重分组的对外形状。**列表与单个分组共用这一份**。
 *
 * 成员上带 `salaryRaw` / `sourceUrl` / `platformName`：岗位库的「跨平台对照」
 * 要在一张表里比薪资、并让人跳去那个平台的原页面。少这几个字段，界面就得为
 * 每个成员再拉一次详情（N+1 次往返，而它要的只是三个字段）。
 */
function dedupGroupItem(store, group) {
    return {
        id: group.id,
        primaryJobId: group.primaryJobId,
        basis: group.basis,
        score: group.score,
        createdAt: group.createdAt,
        members: group.memberIds
            .map((jobId) => store.job.detail(jobId))
            .filter((job) => job !== undefined)
            .map((job) => ({
            id: job.id,
            platformId: job.platformId,
            platformName: job.platformName,
            title: job.title,
            companyName: job.companyName,
            city: job.city,
            salaryRaw: job.salaryRaw,
            sourceUrl: job.sourceUrl,
            state: job.state,
            isPrimary: job.id === group.primaryJobId,
        })),
    };
}
function dedupGroupItems(store, limit) {
    return store.dedupGroup.list(limit).map((group) => dedupGroupItem(store, group));
}
async function dispatch(runtime, req) {
    const segments = req.path.split('/').filter((part) => part !== '');
    const method = req.method.toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD';
    const now = () => new Date().toISOString();
    // 变更类请求必须过同源校验（C4：宿主对我们的路由不提供任何鉴权）
    if (isMutation && !req.sameOrigin) {
        return json(403, { ok: false, code: 'CROSS_ORIGIN', message: '跨站请求被拒绝' });
    }
    // ── GET /health ────────────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
        return json(200, runtime.health());
    }
    // ── POST /system/reveal ────────────────────────────────────────────
    // 「设置 → 诊断与调用日志 → 数据文件」那一行的「打开所在文件夹」。
    // **不接受任何路径参数**：只能打开数据文件自己的目录（见 util/reveal.ts），
    // 所以界面拼不出"打开任意目录"的请求。POST 因此也自动过同源校验。
    //
    // 200 里带 ok 而不是直接 200=成功：打开失败（系统没有文件管理器）是**业务结果**
    // 不是协议错误，界面要如实转述，所以不用状态码表达。
    if (method === 'POST' && segments.length === 2 && segments[0] === 'system' && segments[1] === 'reveal') {
        requireData(runtime);
        const dataPath = runtime.health().dataPath;
        if (dataPath === null || dataPath === '') {
            throw new DomainError('DATA_UNAVAILABLE', '还没有数据文件，没有可打开的目录');
        }
        const result = await revealDataFile(dataPath);
        return json(200, {
            ok: result.ok,
            dir: result.dir,
            ...(result.reason === null ? {} : { reason: result.reason }),
        });
    }
    // ── GET /today ─────────────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'today') {
        // 数据层没就绪也返回 200：U0 要能把「为什么没有数据」显示出来
        return json(200, runtime.today());
    }
    // ── GET /events（SSE）──────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'events') {
        return { kind: 'sse' };
    }
    // ── GET /jobs ──────────────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'jobs') {
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
    if (method === 'GET' && segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'facets') {
        requireData(runtime);
        const jobService = runtime.jobs();
        if (jobService === undefined)
            throw dataNotReady(runtime);
        return json(200, jobService.facets());
    }
    // ── POST /jobs/batch/mark：批量标记（同一状态应用到多个岗位）─────────
    if (segments.length === 3 && segments[0] === 'jobs' && segments[1] === 'batch' && segments[2] === 'mark') {
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
    // ── GET /jobs/:id ／ POST /jobs/:id/mark ───────────────────────────
    if (segments.length >= 2 && segments[0] === 'jobs') {
        const idRaw = segments[1] ?? '';
        const id = Number.parseInt(idRaw, 10);
        if (!Number.isFinite(id)) {
            throw new DomainError('INVALID_INPUT', `非法岗位 id：${idRaw}`);
        }
        requireData(runtime);
        const jobService = runtime.jobs();
        if (jobService === undefined)
            throw dataNotReady(runtime);
        if (method === 'GET' && segments.length === 2) {
            // P4：详情带上标注依据与匹配理由 —— 界面上的每个结论都要能回答「凭什么」
            return json(200, jobService.detailFull(id));
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'mark') {
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
    }
    // ── GET /crawl/status ／ GET /crawl/runs ／ POST /crawl/run ─────────
    if (segments.length === 2 && segments[0] === 'crawl') {
        const action = segments[1];
        if (method === 'GET' && action === 'status') {
            return json(200, runtime.crawlStatus());
        }
        if (method === 'GET' && action === 'runs') {
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
        if (method === 'POST' && action === 'run') {
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
    }
    // ── 公司画像与识别依据（P4）：列表浏览 + 单公司详情 + 人工复核 ──────
    if (segments.length >= 1 && segments[0] === 'companies') {
        requireData(runtime);
        const store = runtime.store();
        const jobService = runtime.jobs();
        if (store === undefined || jobService === undefined)
            throw dataNotReady(runtime);
        // GET /companies —— 列表（外包/诈骗/黑名单集中曝光）
        if (method === 'GET' && segments.length === 1) {
            const blacklisted = req.query.get('blacklisted');
            const manualLabel = req.query.get('manualLabel');
            const result = store.company.list({
                ...(blacklisted === null || blacklisted === '' ? {} : { blacklisted: blacklisted !== '0' }),
                ...(manualLabel === null || manualLabel === '' ? {} : { manualLabel }),
                limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
                offset: parsePositiveInt(req.query.get('offset'), 0, 0, 500_000),
            });
            return json(200, { items: result.items, total: result.total });
        }
        const companyId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(companyId)) {
            throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`);
        }
        const company = store.company.get(companyId);
        if (company === undefined) {
            throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`);
        }
        // PATCH /companies/:id —— 人工复核（只认白名单键）
        if (method === 'PATCH' && segments.length === 2) {
            const body = await readObject(req);
            const patch = {};
            if (typeof body['blacklisted'] === 'boolean')
                patch.blacklisted = body['blacklisted'];
            if (body['note'] !== undefined)
                patch.note = typeof body['note'] === 'string' ? body['note'] : null;
            if (body['manualLabel'] !== undefined) {
                patch.manualLabel = typeof body['manualLabel'] === 'string' && body['manualLabel'] !== '' ? body['manualLabel'] : null;
            }
            const reviewed = store.company.updateReview(companyId, patch, now());
            runtime.events().publish('company.reviewed', { companyId, blacklisted: patch.blacklisted });
            return json(200, { ok: true, reviewed });
        }
        if (method !== 'GET' || segments.length !== 2) {
            throw new DomainError('INVALID_INPUT', '公司信息只支持 GET（列表/详情）与 PATCH（复核）');
        }
        const profile = store.company.getProfile(companyId);
        const jobs = jobService.query({ companyId }, 50, 0);
        const flagCounts = {};
        for (const job of jobs) {
            for (const type of job.flagTypes)
                flagCounts[type] = (flagCounts[type] ?? 0) + 1;
        }
        const body = {
            company: {
                id: company.id,
                name: company.name,
                nameNorm: company.nameNorm,
                industry: company.industry,
                size: company.size,
                nature: company.nature,
                jobCount: profile?.jobCount ?? 0,
                geoSpread: profile?.geoSpread ?? 0,
                stackDiversity: profile?.stackDiversity ?? 0,
                onsiteRatio: profile?.onsiteRatio ?? null,
                nameKeywordHits: profile?.nameKeywordHits ?? 0,
                outsourcingScore: profile?.outsourcingScore ?? null,
                fraudScore: profile?.fraudScore ?? null,
                manualLabel: profile?.manualLabel ?? null,
                blacklisted: company.blacklisted,
            },
            signals: store.signal.listByCompany(companyId).map((signal) => ({
                type: signal.type,
                weight: signal.weight,
                evidence: signal.evidence,
                source: signal.source,
                createdAt: signal.createdAt,
            })),
            jobs,
            flagCounts,
        };
        return json(200, body);
    }
    // ── 去重复核（§4.10.1 铁律 2：去重必须可逆，人工能拆开）─────────────
    if (segments.length >= 1 && segments[0] === 'dedup') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        // GET /dedup/groups —— 列出分组，附每个成员的岗位摘要（判断是否误判）
        if (method === 'GET' && segments.length === 2 && segments[1] === 'groups') {
            return json(200, {
                items: dedupGroupItems(store, parsePositiveInt(req.query.get('limit'), 50, 1, 200)),
                count: store.dedupGroup.count(),
            });
        }
        // POST /dedup/run —— **全库复核一遍**（批次 4：去重可独立触发）
        //
        // 为什么需要它：去重以前只在抓取的后处理里发生，于是"刚打开去重开关"或
        // "去重规则改过之后"这两个场合都没有入口 —— 只能干等下一轮抓取，
        // 而那一轮可能一条新岗位都没有。
        if (method === 'POST' && segments.length === 2 && segments[1] === 'run') {
            const result = runtime.sweepDedup();
            return json(200, { ...result, items: dedupGroupItems(store, 50) });
        }
        // DELETE /dedup/groups/:id —— 拆分整组：所有成员独立，删除分组
        if (method === 'DELETE' && segments.length === 3 && segments[0] === 'dedup' && segments[1] === 'groups') {
            const groupId = Number.parseInt(segments[2] ?? '', 10);
            if (!Number.isFinite(groupId))
                throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`);
            if (store.dedupGroup.get(groupId) === undefined) {
                throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`);
            }
            store.dedupGroup.deleteGroup(groupId);
            return json(200, { ok: true });
        }
        // GET /dedup/groups/:id —— 单个分组（岗位库"按组折叠"展开时按需拉这一条）
        if (method === 'GET' && segments.length === 3 && segments[1] === 'groups') {
            const groupId = Number.parseInt(segments[2] ?? '', 10);
            if (!Number.isFinite(groupId))
                throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`);
            const group = store.dedupGroup.get(groupId);
            if (group === undefined)
                throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`);
            return json(200, { group: dedupGroupItem(store, group) });
        }
        // POST /dedup/groups/:id/split —— 把一个岗位从组里拆出（不再是合并岗位）
        if (method === 'POST' && segments.length === 4 && segments[1] === 'groups' && segments[3] === 'split') {
            const groupId = Number.parseInt(segments[2] ?? '', 10);
            if (!Number.isFinite(groupId))
                throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`);
            const body = await readObject(req);
            const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
            if (!Number.isFinite(jobId) || jobId <= 0)
                throw new DomainError('INVALID_INPUT', 'jobId 必填且为正整数');
            const group = store.dedupGroup.get(groupId);
            if (group === undefined)
                throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`);
            if (!group.memberIds.includes(jobId)) {
                throw new DomainError('INVALID_INPUT', `岗位 #${String(jobId)} 不属于分组 #${String(groupId)}`);
            }
            store.dedupGroup.removeMember(groupId, jobId);
            return json(200, { ok: true });
        }
        throw new DomainError('INVALID_INPUT', '不认识的去重操作', { hint: '合法路径：GET /dedup/groups、GET /dedup/groups/:id、POST /dedup/run、DELETE /dedup/groups/:id、POST /dedup/groups/:id/split' });
    }
    // ── 情报引擎：词表与重算（P4）──────────────────────────────────────
    if (segments.length === 2 && segments[0] === 'intel' && segments[1] === 'dictionary') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        if (method === 'GET') {
            return json(200, { items: store.dictionary.list() });
        }
        if (method === 'POST') {
            const body = await readObject(req);
            const kind = body['kind'];
            const term = body['term'];
            if (typeof kind !== 'string' || !DICTIONARY_KINDS.includes(kind)) {
                throw new DomainError('INVALID_INPUT', 'kind 必须是合法的词表类别', {
                    hint: `合法取值：${DICTIONARY_KINDS.join(' / ')}`,
                });
            }
            if (typeof term !== 'string' || term.trim() === '') {
                throw new DomainError('INVALID_INPUT', 'term 不能为空');
            }
            store.dictionary.upsert({
                kind: kind,
                term: term.trim(),
                ...(typeof body['meaning'] === 'string' ? { meaning: body['meaning'] } : {}),
                ...(typeof body['weight'] === 'number' ? { weight: body['weight'] } : {}),
                ...(typeof body['enabled'] === 'boolean' ? { enabled: body['enabled'] } : {}),
            });
            return json(200, { ok: true, items: store.dictionary.list() });
        }
    }
    if (segments.length === 2 && segments[0] === 'intel' && segments[1] === 'recompute') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '重算只支持 POST');
        requireData(runtime);
        const store = runtime.store();
        const jobService = runtime.jobs();
        if (store === undefined || jobService === undefined)
            throw dataNotReady(runtime);
        const intel = runtime.intel();
        const now = new Date().toISOString();
        let jobs = 0;
        for (const job of jobService.query({}, PAGE_SIZE_MAX, 0)) {
            intel.evaluateJob(job.id, now);
            jobs += 1;
        }
        return json(200, {
            ok: true,
            jobs,
            note: `重算了最近 ${String(jobs)} 条岗位（单次上限 ${String(PAGE_SIZE_MAX)}）；超出部分等后续阶段接调度做全量重算`,
        });
    }
    // ── 搜索方案与调度（P3）─────────────────────────────────────────────
    if (segments.length >= 1 && segments[0] === 'plans') {
        requireData(runtime);
        const planService = runtime.plans();
        if (method === 'GET' && segments.length === 1) {
            return json(200, { items: planService.list() });
        }
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            const input = planCreateOf(body);
            // SR-39：缺省平台 = **注册表里的全部平台**，不是写死的 '51job'。
            // 写死会在多平台落地那天变成"新装的用户只抓到 51job"这种没人查得出来的 bug。
            if (input.platforms === undefined || input.platforms.length === 0) {
                input.platforms = runtime.registry().list().map((adapter) => adapter.id);
            }
            // SR-43：先校验一次，把"与谁重复"如实回给调用方（保存仍然成功 —— 只提示不合并）
            const checked = planService.validate(input);
            const plan = planService.create(input);
            return json(201, { ok: true, plan, duplicates: checked.duplicates, notices: checked.notices });
        }
        // 草稿校验（没有 id 的新方案）：新建方案在保存**之前**也需要
        // "与谁重复 / 哪些平台会返回空"。保存后才提示已经晚了一步。
        // 与上面那条共用 `planService.validate` —— 三条入口一份实现的约定不变（SR-45）。
        if (method === 'POST' && segments.length === 2 && segments[1] === 'validate') {
            const body = await readObject(req);
            const input = planCreateOf(body);
            if (input.platforms === undefined || input.platforms.length === 0) {
                input.platforms = runtime.registry().list().map((adapter) => adapter.id);
            }
            return json(200, { ok: true, validation: planService.validate(input) });
        }
        const planId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(planId)) {
            throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`);
        }
        // SR-45："只校验、不写库"—— 界面保存前先问一句靠它。
        // 它与下面的写入路径、与模型工具调的都是 `planService.validate`，所以三边报错完全一致。
        if (method === 'POST' && segments.length === 3 && segments[2] === 'validate') {
            const body = await readObject(req);
            const input = planCreateOf(body);
            const current = planService.get(planId);
            return json(200, {
                ok: true,
                validation: planService.validate({
                    name: input.name,
                    platforms: input.platforms ?? current.platforms,
                    criteria: input.criteria ?? current.criteria,
                    schedule: { ...current.schedule, ...(input.schedule ?? {}) },
                    enabled: input.enabled ?? current.enabled,
                    postProcess: { ...current.postProcess, ...(input.postProcess ?? {}) },
                }, planId),
            });
        }
        if (method === 'PATCH' && segments.length === 2) {
            const body = await readObject(req);
            const patch = planPatchOf(body);
            const current = planService.get(planId);
            const checked = planService.validate({
                name: patch.name ?? current.name,
                platforms: patch.platforms ?? current.platforms,
                criteria: patch.criteria ?? current.criteria,
                schedule: { ...current.schedule, ...(patch.schedule ?? {}) },
                enabled: patch.enabled ?? current.enabled,
                postProcess: { ...current.postProcess, ...(patch.postProcess ?? {}) },
            }, planId);
            return json(200, {
                ok: true,
                plan: planService.update(planId, patch),
                duplicates: checked.duplicates,
                notices: checked.notices,
            });
        }
        if (method === 'DELETE' && segments.length === 2) {
            const removed = planService.remove(planId);
            if (!removed)
                throw new DomainError('NOT_FOUND', `方案不存在：${String(planId)}`);
            return json(200, { ok: true });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'run') {
            const body = await readObject(req);
            const reason = body['catchUp'] === true ? 'catch-up' : 'manual';
            const summary = await runtime.runPlan(planId, reason);
            return json(200, summary);
        }
        // SR-21：风控暂停只能由**人工确认**恢复，系统不会自动恢复。
        if (method === 'POST' && segments.length === 3 && segments[2] === 'resume') {
            runtime.resumeRisk(planId);
            return json(200, { ok: true, plan: planService.get(planId) });
        }
    }
    // ── A2："抓取一次"走**默认方案**（不再写死 {51job, 深圳, Java}）──────
    // 没有方案时先建一个默认方案，所以这个入口永远有一个真实条件，而不是一个字面量。
    if (method === 'POST' && segments.length === 1 && segments[0] === 'crawl') {
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
    if (method === 'GET' && segments.length === 2 && segments[0] === 'criteria' && segments[1] === 'dimensions') {
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
    // ── R20：租约的"重新检测"与"人工接管"────────────────────────────
    //
    // 界面上原来只有一句"非租约持有者连手动跑也会被拒绝"—— 那是**死胡同**提示：
    // 用户知道了原因，却没有任何下一步可做。这两条接口就是那个下一步。
    if (segments.length === 3 && segments[0] === 'schedule' && segments[1] === 'lease') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '租约操作只支持 POST');
        requireData(runtime);
        if (segments[2] === 'recheck') {
            return json(200, { ok: true, status: runtime.recheckLease() });
        }
        if (segments[2] === 'takeover') {
            return json(200, { ok: true, status: runtime.takeoverLease() });
        }
        throw new DomainError('INVALID_INPUT', `不认识的租约操作：${segments[2] ?? ''}`, {
            hint: '合法取值：recheck / takeover',
        });
    }
    // ── B3/SR-30：全局一键暂停（**只停定时**，手动永远可用）──────────────
    if (segments.length === 2 && segments[0] === 'schedule' && segments[1] === 'pause') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '暂停/恢复只支持 POST');
        requireData(runtime);
        const body = await readObject(req);
        const paused = body['paused'] !== false;
        runtime.setSchedulePaused(paused, typeof body['reason'] === 'string' ? body['reason'] : undefined);
        return json(200, { ok: true, status: runtime.schedulerStatus() });
    }
    // ── SR-17/26：跳过原因 → 人话（界面与工具共用同一份，避免两处说法漂移）──
    if (method === 'GET' && segments.length === 2 && segments[0] === 'schedule' && segments[1] === 'reasons') {
        return json(200, { items: SKIP_REASON_LABEL });
    }
    // ── 调度状态（P3）──────────────────────────────────────────────────
    if (method === 'GET' && segments.length === 2 && segments[0] === 'scheduler' && segments[1] === 'status') {
        return json(200, runtime.schedulerStatus());
    }
    // ── 平台与登录态（P3）──────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'platforms') {
        return json(200, { items: runtime.platforms() });
    }
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
    if (method === 'GET' && segments.length === 2 && segments[0] === 'login' && segments[1] === 'status') {
        return json(200, { items: runtime.loginStatuses() });
    }
    if (segments.length === 4 && segments[0] === 'platforms' && segments[2] === 'login' && segments[3] === 'start') {
        if (method !== 'POST') {
            throw new DomainError('INVALID_INPUT', '登录引导只支持 POST');
        }
        requireData(runtime);
        const platformId = segments[1] ?? '';
        return json(200, { ok: true, login: runtime.startLogin(platformId) });
    }
    // ── 待办（P3：补跑待办要让用户能关掉）──────────────────────────────
    if (segments.length >= 1 && segments[0] === 'todos') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        // ── GET /todos 列表 + 筛选（kind / level）────────────────────
        if (method === 'GET' && segments.length === 1) {
            const kindRaw = req.query.get('kind');
            const levelRaw = req.query.get('level');
            if (kindRaw !== null && kindRaw !== '' && !TODO_KINDS.includes(kindRaw)) {
                throw new DomainError('INVALID_INPUT', `非法待办类别：${kindRaw}`, {
                    hint: `合法取值：${TODO_KINDS.join(' / ')}`,
                });
            }
            if (levelRaw !== null && levelRaw !== '' && !TODO_LEVELS.includes(levelRaw)) {
                throw new DomainError('INVALID_INPUT', `非法待办级别：${levelRaw}`, {
                    hint: `合法取值：${TODO_LEVELS.join(' / ')}`,
                });
            }
            return json(200, {
                items: store.todo.listOpen({
                    limit: parsePositiveInt(req.query.get('limit'), 50, 1, 500),
                    ...(kindRaw === null || kindRaw === '' ? {} : { kind: kindRaw }),
                    ...(levelRaw === null || levelRaw === '' ? {} : { level: levelRaw }),
                }),
                countOpen: store.todo.countOpen(),
            });
        }
        const todoId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(todoId))
            throw new DomainError('INVALID_INPUT', `非法待办 id：${segments[1] ?? ''}`);
        // ── GET /todos/:id 单条（含 detail）────────────────────────────
        if (method === 'GET' && segments.length === 2) {
            const todo = store.todo.get(todoId);
            if (todo === undefined)
                throw new DomainError('NOT_FOUND', `待办不存在：${String(todoId)}`);
            return json(200, todo);
        }
        // ── D：POST /todos/:id/confirm-actions/resume ─────────────────
        // guard 在审批超时/无界面时把高危动作落成一条 kind='confirm-action' 待办。
        // 正文全文不入库存（§4.1），所以这里不能"原样重放"，而是：
        //   关闭待办 + 把 {action, target, actor} 意图交回界面，由界面带用户到正确上下文重新发起。
        if (method === 'POST' && segments.length === 4 && segments[2] === 'confirm-actions' && segments[3] === 'resume') {
            const todo = store.todo.get(todoId);
            if (todo === undefined || todo.state !== 'open') {
                throw new DomainError('NOT_FOUND', `待办不存在或已关闭：${String(todoId)}`);
            }
            if (todo.kind !== 'confirm-action') {
                throw new DomainError('INVALID_INPUT', `这条待办不是待确认动作（kind=${String(todo.kind)}）`);
            }
            const detail = todo.detail;
            const action = detail.action;
            const target = detail.target ?? {};
            if (typeof action !== 'string' || typeof target['jobId'] !== 'number') {
                throw new DomainError('INVALID_INPUT', '这条待确认动作缺少可恢复的目标（action/jobId），无法恢复', {
                    hint: '可能来自更早版本；直接关闭即可。',
                });
            }
            store.todo.close(todoId, now());
            return json(200, {
                ok: true,
                intent: { action, actor: detail.actor ?? 'gui', target },
                note: '原正文未入库（隐私策略），已带你到目标上下文；请重新发起。',
            });
        }
        if (segments.length === 3 && segments[2] === 'close') {
            const closed = store.todo.close(todoId, now());
            if (!closed)
                throw new DomainError('NOT_FOUND', `待办不存在或已关闭：${String(todoId)}`);
            return json(200, { ok: true });
        }
    }
    // ── 审计与模型调用留痕（P5：I5 知情同意要可查）─────────────────────
    if (method === 'GET' && segments.length === 2 && segments[0] === 'llm' && segments[1] === 'calls') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 500);
        const purpose = req.query.get('purpose');
        return json(200, {
            items: store.llmCall.list(limit, purpose === null || purpose === '' ? undefined : purpose),
            stats: store.llmCall.stats(),
            /** 口径说明必须在响应里 —— 用户看到的"外发字段"就是这些字段名。 */
            note: 'fields 是这次调用实际发给模型的字段清单（不含正文）。',
        });
    }
    if (method === 'GET' && segments.length === 1 && segments[0] === 'audit') {
        requireData(runtime);
        const store = runtime.store();
        if (store === undefined)
            throw dataNotReady(runtime);
        const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 500);
        const actor = req.query.get('actor');
        const action = req.query.get('action');
        return json(200, {
            items: store.audit.list(limit, {
                ...(actor === null || actor === '' ? {} : { actor }),
                ...(action === null || action === '' ? {} : { action }),
            }),
            count: store.audit.count(),
            /** 审计只存摘要与长度，不存正文（§4.1 审计表隐私策略）。 */
            note: 'detail 只保留字段摘要与长度，正文不入审计表；正文请到对应业务记录里看。',
        });
    }
    // ── 插件配置（P5）─────────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'settings') {
        requireData(runtime);
        return json(200, runtime.settings().snapshot());
    }
    if (method === 'PATCH' && segments.length === 1 && segments[0] === 'settings') {
        requireData(runtime);
        const body = await readObject(req);
        const next = await runtime.updateSettings(settingsPatchOf(body), 'gui');
        return json(200, { ok: true, settings: next });
    }
    // ── P6：简历（版本、体检、附件、定制）──────────────────────────────
    if (segments.length >= 1 && segments[0] === 'resumes') {
        requireData(runtime);
        const service = runtime.resumes();
        if (method === 'GET' && segments.length === 1) {
            const includeArchived = req.query.get('archived') !== '0';
            return json(200, { items: service.list({ includeArchived }) });
        }
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            return json(201, { ok: true, resume: service.create(resumeWriteOf(body)) });
        }
        const resumeId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(resumeId)) {
            throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
        }
        if (method === 'GET' && segments.length === 2) {
            const resume = service.get(resumeId);
            return json(200, { ...resume, issues: service.inspect(resumeId) });
        }
        if (method === 'PATCH' && segments.length === 2) {
            const body = await readObject(req);
            return json(200, { ok: true, resume: service.update(resumeId, resumePatchOf(body)) });
        }
        if (method === 'DELETE' && segments.length === 2) {
            if (!service.remove(resumeId)) {
                throw new DomainError('NOT_FOUND', `简历不存在：${String(resumeId)}`);
            }
            return json(200, { ok: true });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'duplicate') {
            const body = await readObject(req);
            const name = typeof body['name'] === 'string' ? body['name'] : undefined;
            return json(201, { ok: true, resume: service.duplicate(resumeId, name) });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'default') {
            return json(200, { ok: true, resume: service.setDefault(resumeId) });
        }
        // 预览：直接吐 HTML，界面用 iframe 打开就是所见即所得
        if (method === 'GET' && segments.length === 3 && segments[2] === 'preview') {
            const template = parseTemplate(req.query.get('template'));
            const html = service.preview(resumeId, template);
            return {
                kind: 'bytes',
                status: 200,
                contentType: 'text/html; charset=utf-8',
                bytes: new TextEncoder().encode(html),
                disposition: 'inline',
            };
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'export') {
            const body = await readObject(req);
            const format = parseFormat(body['format']);
            const template = parseTemplate(typeof body['template'] === 'string' ? body['template'] : null);
            const file = await service.exportResume(resumeId, { format, template });
            runtime.events().publish('resume.exported', {
                resumeId,
                fileId: file.id,
                format: file.format,
                bytes: file.bytes,
            });
            return json(200, { ok: true, file });
        }
    }
    // 附件下载/预览（PDF 用 inline 让浏览器直接打开）
    if (segments.length === 2 && segments[0] === 'files') {
        requireData(runtime);
        const fileId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(fileId))
            throw new DomainError('INVALID_INPUT', `非法附件 id：${segments[1] ?? ''}`);
        // 删除附件：领域层的 removeFile 早就在了，只是一直没有入口 ——
        // 而界面文案写着"只有你显式删除才会消失"，说到就得做到。
        if (method === 'DELETE') {
            const removed = runtime.resumes().removeFile(fileId);
            if (!removed)
                throw new DomainError('NOT_FOUND', `附件不存在或已被删除：${String(fileId)}`);
            return json(200, { ok: true });
        }
        if (method !== 'GET')
            throw new DomainError('INVALID_INPUT', '附件只支持 GET / DELETE');
        const file = runtime.resumes().readFile(fileId);
        if (file === undefined) {
            throw new DomainError('NOT_FOUND', `附件不存在或文件已丢失：${String(fileId)}`, {
                hint: '重新导出一次即可。',
            });
        }
        return {
            kind: 'bytes',
            status: 200,
            contentType: contentTypeOf(file.format),
            bytes: file.bytes,
            fileName: file.fileName,
            // PDF 与 HTML 直接看；docx 浏览器看不了，交给系统打开
            disposition: file.format === 'docx' ? 'attachment' : 'inline',
        };
    }
    // 简历定制：生成与采用
    if (segments.length === 2 && segments[0] === 'resume' && segments[1] === 'tailor') {
        if (method !== 'POST')
            throw new DomainError('INVALID_INPUT', '定制只支持 POST');
        requireData(runtime);
        const body = await readObject(req);
        const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
        if (!Number.isFinite(jobId) || jobId <= 0) {
            throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
        }
        const tailoring = await runtime.resumes().tailor({
            jobId,
            ...(typeof body['resumeId'] === 'number' ? { resumeId: body['resumeId'] } : {}),
            ...(typeof body['useLlm'] === 'boolean' ? { useLlm: body['useLlm'] } : {}),
        });
        runtime.events().publish('resume.tailored', {
            jobId,
            tailoringId: tailoring.id,
            via: tailoring.via,
        });
        return json(200, { ok: true, tailoring });
    }
    if (segments.length >= 1 && segments[0] === 'tailorings') {
        requireData(runtime);
        const service = runtime.resumes();
        if (method === 'GET' && segments.length === 1) {
            const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
            const resumeId = Number.parseInt(req.query.get('resumeId') ?? '', 10);
            return json(200, {
                items: service.listTailorings({
                    ...(Number.isFinite(jobId) ? { jobId } : {}),
                    ...(Number.isFinite(resumeId) ? { resumeId } : {}),
                    limit: parsePositiveInt(req.query.get('limit'), 20, 1, 100),
                }),
            });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'adopt') {
            const tailoringId = Number.parseInt(segments[1] ?? '', 10);
            if (!Number.isFinite(tailoringId)) {
                throw new DomainError('INVALID_INPUT', `非法定制 id：${segments[1] ?? ''}`);
            }
            const body = await readObject(req);
            const adopted = body['adopted'] !== false;
            return json(200, { ok: true, tailoring: service.adopt(tailoringId, adopted) });
        }
    }
    // ── P7：投递流水线（§4.7 / §13 U5）────────────────────────────────
    if (segments.length >= 1 && segments[0] === 'applications') {
        requireData(runtime);
        const service = runtime.pipeline();
        if (method === 'GET' && segments.length === 1) {
            const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
            const stage = req.query.get('stage');
            return json(200, {
                items: service.list({
                    ...(Number.isFinite(jobId) ? { jobId } : {}),
                    ...(stage === null || stage === '' ? {} : { stage: parseStage(stage) }),
                }),
            });
        }
        if (method === 'POST' && segments.length === 1) {
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
        const applicationId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(applicationId)) {
            throw new DomainError('INVALID_INPUT', `非法投递 id：${segments[1] ?? ''}`);
        }
        if (method === 'GET' && segments.length === 2) {
            return json(200, service.get(applicationId));
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'advance') {
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
    }
    if (method === 'GET' && segments.length === 1 && segments[0] === 'board') {
        requireData(runtime);
        return json(200, runtime.pipeline().board());
    }
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
        // **高危**：会真的对外发消息。界面上的用户要两段式确认（模型走 ctx.approval）
        const message = await runtime.messages().reply({
            messageId: id,
            content: body['content'],
            actor: 'gui',
            ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
        });
        runtime.events().publish('message.replied', { id: message.id });
        return json(200, { ok: true, message });
    }
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
    // ── P7：面试日程（§13 U7）────────────────────────────────────────
    if (segments.length >= 1 && segments[0] === 'interviews') {
        requireData(runtime);
        const service = runtime.interviews();
        if (method === 'GET' && segments.length === 1) {
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
        if (method === 'POST' && segments.length === 1) {
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
        if (method === 'GET' && segments.length === 2 && segments[1] === 'conflicts') {
            return json(200, { items: service.conflicts() });
        }
        if (method === 'GET' && segments.length === 2 && segments[1] === 'upcoming') {
            const hours = parsePositiveInt(req.query.get('hours'), 72, 1, 24 * 30);
            return json(200, { items: service.upcoming(hours) });
        }
        const interviewId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(interviewId)) {
            throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`);
        }
        if (method === 'GET' && segments.length === 2) {
            return json(200, service.get(interviewId));
        }
        if (method === 'PATCH' && segments.length === 2) {
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
        if (method === 'DELETE' && segments.length === 2) {
            if (!service.remove(interviewId))
                throw new DomainError('NOT_FOUND', `面试不存在：${String(interviewId)}`);
            return json(200, { ok: true });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'state') {
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
        if (method === 'POST' && segments.length === 3 && segments[2] === 'review') {
            const body = await readObject(req);
            return json(200, { ok: true, interview: service.review(interviewId, body) });
        }
        if (method === 'GET' && segments.length === 3 && segments[2] === 'prep') {
            return json(200, service.prep(interviewId));
        }
    }
    // ── P7：看板与归因（§13 U8）──────────────────────────────────────
    //
    // 全局筛选：三个接口共用一组 query 参数。解析与校验都在这里做完 ——
    // 非法的时间或 id 一路传到服务层，只会换来一个看不懂的空结果。
    const analyticsFilterOf = () => {
        const iso = (value, name) => {
            if (value === null || value === '')
                return undefined;
            if (!Number.isFinite(Date.parse(value))) {
                throw new DomainError('INVALID_INPUT', `${name} 不是合法时间：${value}`, {
                    hint: '用 ISO 格式，例如 2026-09-01 或 2026-09-01T00:00:00Z。',
                });
            }
            return value;
        };
        const resumeIdRaw = req.query.get('resumeId');
        let resumeId;
        if (resumeIdRaw !== null && resumeIdRaw !== '') {
            const parsed = Number.parseInt(resumeIdRaw, 10);
            if (!Number.isFinite(parsed)) {
                throw new DomainError('INVALID_INPUT', `resumeId 不是数字：${resumeIdRaw}`);
            }
            resumeId = parsed;
        }
        const from = iso(req.query.get('from'), 'from');
        const to = iso(req.query.get('to'), 'to');
        const city = req.query.get('city');
        const keyword = req.query.get('q');
        const direction = req.query.get('direction');
        return {
            ...(from === undefined ? {} : { from }),
            ...(to === undefined ? {} : { to }),
            ...(city === null || city === '' ? {} : { city }),
            ...(keyword === null || keyword === '' ? {} : { keyword }),
            ...(direction === null || direction === '' ? {} : { direction }),
            ...(resumeId === undefined ? {} : { resumeId }),
        };
    };
    if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'funnel') {
        requireData(runtime);
        return json(200, runtime.analytics().funnel(analyticsFilterOf()));
    }
    if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'attribution') {
        requireData(runtime);
        return json(200, runtime.analytics().attribution(analyticsFilterOf()));
    }
    if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'salary') {
        requireData(runtime);
        const filter = analyticsFilterOf();
        // 城市/关键词由岗位库自己筛；时间窗是**岗位库的时间轴**，与投递时间不是一回事
        return json(200, runtime.analytics().salaryBand({
            ...(filter.city === undefined ? {} : { city: filter.city }),
            ...(filter.keyword === undefined ? {} : { keyword: filter.keyword }),
            ...(filter.from === undefined ? {} : { from: filter.from }),
            ...(filter.to === undefined ? {} : { to: filter.to }),
        }));
    }
    // ── 批次 F：箱线图 / 本地基准 / 简历 A/B（看板遗留）────────────────
    /** F1：薪资箱线图。口径必须显式传（默认月薪下限），不接受"让服务猜一个"。 */
    if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'salary' && segments[2] === 'box') {
        requireData(runtime);
        const filter = analyticsFilterOf();
        const basisRaw = req.query.get('basis');
        if (basisRaw !== null && basisRaw !== '' && !SALARY_BASES.includes(basisRaw)) {
            throw new DomainError('INVALID_INPUT', `不认识的口径：${basisRaw}`, {
                hint: `合法取值：${SALARY_BASES.join(' / ')}。这一项必须显式给 —— "月薪下限"与"年薪折算"算出来的中位数可以差几成，不写清就是误导。`,
            });
        }
        return json(200, runtime.analytics().salaryBox({
            ...(filter.city === undefined ? {} : { city: filter.city }),
            ...(filter.keyword === undefined ? {} : { keyword: filter.keyword }),
            ...(basisRaw === null || basisRaw === '' ? {} : { basis: basisRaw }),
        }));
    }
    /** F2：本地基准对比 —— 用自己抓到的岗位库当基准（绝不联网、绝不编行业数据）。 */
    if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'salary' && segments[2] === 'baseline') {
        requireData(runtime);
        return json(200, runtime.analytics().salaryBaseline(analyticsFilterOf()));
    }
    /** F3：简历版本 A/B 对比（每格带样本量，不做显著性检验）。 */
    if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'resume' && segments[2] === 'compare') {
        requireData(runtime);
        return json(200, runtime.analytics().resumeCompare(analyticsFilterOf()));
    }
    // 跟进建议（U0 今日与流水线页都用）
    if (method === 'GET' && segments.length === 1 && segments[0] === 'followups') {
        requireData(runtime);
        return json(200, { items: runtime.followUps() });
    }
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
    // ── P8：校招支线（§4.L / §13）─────────────────────────────────────
    if (segments.length >= 1 && segments[0] === 'campus') {
        requireData(runtime);
        const service = runtime.campus();
        if (method === 'GET' && segments.length === 1) {
            const batch = req.query.get('batch');
            const stage = req.query.get('stage');
            return json(200, {
                items: service.list({
                    ...(batch === null || batch === '' ? {} : { batch: batch }),
                    ...(stage === null || stage === '' ? {} : { stage: stage }),
                }),
                windows: service.windows(),
            });
        }
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            const campus = service.create({
                ...(typeof body['companyId'] === 'number' ? { companyId: body['companyId'] } : {}),
                ...(typeof body['jobId'] === 'number' ? { jobId: body['jobId'] } : {}),
                ...(typeof body['batch'] === 'string' ? { batch: body['batch'] } : {}),
                ...(typeof body['applyOpenAt'] === 'string' ? { applyOpenAt: body['applyOpenAt'] } : {}),
                ...(typeof body['applyCloseAt'] === 'string' ? { applyCloseAt: body['applyCloseAt'] } : {}),
                ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
            });
            runtime.events().publish('campus.created', { id: campus.id, batch: campus.batch });
            return json(201, { ok: true, campus });
        }
        const campusId = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(campusId)) {
            throw new DomainError('INVALID_INPUT', `非法校招记录 id：${segments[1] ?? ''}`);
        }
        if (method === 'GET' && segments.length === 2)
            return json(200, service.get(campusId));
        if (method === 'POST' && segments.length === 3 && segments[2] === 'advance') {
            const body = await readObject(req);
            const stage = body['stage'];
            if (typeof stage !== 'string')
                throw new DomainError('INVALID_INPUT', 'stage 必填');
            const campus = service.advance(campusId, stage, {
                ...(body['allowBackward'] === true ? { allowBackward: true } : {}),
                ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
            });
            runtime.events().publish('campus.advanced', { id: campusId, stage: campus.stage });
            return json(200, { ok: true, campus });
        }
    }
    if (segments.length >= 1 && segments[0] === 'assessments') {
        requireData(runtime);
        const service = runtime.campus();
        if (method === 'GET' && segments.length === 1) {
            const state = req.query.get('state');
            return json(200, {
                items: service.listAssessments(state === null || state === '' ? {} : { state: state }),
            });
        }
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            const assessment = service.addAssessment({
                ...(typeof body['campusApplicationId'] === 'number' ? { campusApplicationId: body['campusApplicationId'] } : {}),
                ...(typeof body['platform'] === 'string' ? { platform: body['platform'] } : {}),
                ...(typeof body['kind'] === 'string' ? { kind: body['kind'] } : {}),
                ...(typeof body['at'] === 'string' ? { at: body['at'] } : {}),
                ...(typeof body['dueAt'] === 'string' ? { dueAt: body['dueAt'] } : {}),
                ...(typeof body['durationMin'] === 'number' ? { durationMin: body['durationMin'] } : {}),
            });
            runtime.events().publish('assessment.created', { id: assessment.id, dueAt: assessment.dueAt });
            return json(201, { ok: true, assessment });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'state') {
            const id = Number.parseInt(segments[1] ?? '', 10);
            if (!Number.isFinite(id))
                throw new DomainError('INVALID_INPUT', `非法测评 id：${segments[1] ?? ''}`);
            const body = await readObject(req);
            const state = body['state'];
            if (typeof state !== 'string')
                throw new DomainError('INVALID_INPUT', 'state 必填');
            return json(200, {
                ok: true,
                assessment: service.setAssessmentState(id, state, typeof body['result'] === 'string' ? body['result'] : null),
            });
        }
    }
    if (segments.length >= 1 && segments[0] === 'tripartite') {
        requireData(runtime);
        const service = runtime.campus();
        if (method === 'GET' && segments.length === 1)
            return json(200, { items: service.listTripartite() });
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            const tripartite = service.addTripartite({
                ...(typeof body['campusApplicationId'] === 'number' ? { campusApplicationId: body['campusApplicationId'] } : {}),
                ...(typeof body['issuedAt'] === 'string' ? { issuedAt: body['issuedAt'] } : {}),
                ...(typeof body['signDeadline'] === 'string' ? { signDeadline: body['signDeadline'] } : {}),
                ...(typeof body['penaltySummary'] === 'string' ? { penaltySummary: body['penaltySummary'] } : {}),
            });
            return json(201, { ok: true, tripartite });
        }
        if (method === 'POST' && segments.length === 3 && segments[2] === 'state') {
            const id = Number.parseInt(segments[1] ?? '', 10);
            if (!Number.isFinite(id))
                throw new DomainError('INVALID_INPUT', `非法三方 id：${segments[1] ?? ''}`);
            const body = await readObject(req);
            if (typeof body['state'] !== 'string')
                throw new DomainError('INVALID_INPUT', 'state 必填');
            return json(200, {
                ok: true,
                tripartite: service.setTripartiteState(id, body['state']),
            });
        }
    }
    if (method === 'GET' && segments.length === 1 && segments[0] === 'talks') {
        requireData(runtime);
        return json(200, { items: runtime.campus().listTalkSessions() });
    }
    if (method === 'POST' && segments.length === 1 && segments[0] === 'talks') {
        requireData(runtime);
        const body = await readObject(req);
        if (typeof body['at'] !== 'string' || body['at'] === '') {
            throw new DomainError('INVALID_INPUT', 'at（宣讲会时间）必填');
        }
        return json(201, {
            ok: true,
            talk: runtime.campus().addTalkSession({
                at: body['at'],
                ...(typeof body['companyId'] === 'number' ? { companyId: body['companyId'] } : {}),
                ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
                ...(typeof body['online'] === 'boolean' ? { online: body['online'] } : {}),
                ...(typeof body['url'] === 'string' ? { url: body['url'] } : {}),
                ...(typeof body['worthGoing'] === 'string' ? { worthGoing: body['worthGoing'] } : {}),
                ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
            }),
        });
    }
    // 硬截止：U0 与流水线页都要看这个（**不可逆**，所以单独一个端点）
    if (method === 'GET' && segments.length === 1 && segments[0] === 'deadlines') {
        requireData(runtime);
        const service = runtime.campus();
        return json(200, { items: service.deadlines(), overdue: service.overdue() });
    }
    // ── P8：海外支线（§4.M）──────────────────────────────────────────
    if (segments.length >= 1 && segments[0] === 'overseas') {
        requireData(runtime);
        const service = runtime.overseas();
        if (method === 'POST' && segments.length === 2 && segments[1] === 'analyze') {
            const body = await readObject(req);
            const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
            if (!Number.isFinite(jobId) || jobId <= 0)
                throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
            return json(200, { ok: true, ...service.analyzeJob(jobId) });
        }
        if (method === 'GET' && segments.length === 2 && segments[1] === 'visa') {
            const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
            if (!Number.isFinite(jobId))
                throw new DomainError('INVALID_INPUT', 'jobId 必填');
            return json(200, service.getVisa(jobId));
        }
        if (method === 'POST' && segments.length === 2 && segments[1] === 'visa') {
            const body = await readObject(req);
            const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
            const stance = body['stance'];
            if (!Number.isFinite(jobId) || jobId <= 0)
                throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
            if (typeof stance !== 'string')
                throw new DomainError('INVALID_INPUT', 'stance 必填');
            return json(200, {
                ok: true,
                visa: service.setVisa(jobId, stance, {
                    ...(typeof body['identityLimit'] === 'string' ? { identityLimit: body['identityLimit'] } : {}),
                }),
            });
        }
        if (method === 'GET' && segments.length === 2 && segments[1] === 'jobs') {
            const stance = req.query.get('stance');
            const remoteKind = req.query.get('remote');
            return json(200, {
                items: service.filterJobs({
                    ...(stance === null || stance === '' ? {} : { stance: stance }),
                    ...(remoteKind === null || remoteKind === '' ? {} : { remoteKind: remoteKind }),
                }),
            });
        }
    }
    // 时区双重显示（M3：算错时区 = 直接错过面试）
    if (method === 'GET' && segments.length === 1 && segments[0] === 'timezone') {
        requireData(runtime);
        const at = req.query.get('at');
        const tz = req.query.get('tz');
        if (at === null || at === '' || tz === null || tz === '') {
            throw new DomainError('INVALID_INPUT', '需要 at（ISO 时间）与 tz（对方时区，如 America/New_York）');
        }
        return json(200, runtime.overseas().displayInterviewTime(at, tz));
    }
    // 英文简历体检（M1：**只检查，不翻译**）
    if (method === 'GET' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'english-check') {
        requireData(runtime);
        const id = Number.parseInt(segments[1] ?? '', 10);
        if (!Number.isFinite(id))
            throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
        const issues = runtime.overseas().inspectEnglish(id);
        return json(200, {
            items: issues,
            note: '这里只做**检查**，不提供中→英翻译 —— 机翻简历是海外求职最致命的错误（§4.M）。',
        });
    }
    if (segments.length >= 1 && segments[0] === 'cover-letters') {
        requireData(runtime);
        const service = runtime.overseas();
        if (method === 'GET' && segments.length === 1) {
            const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10);
            return json(200, { items: service.listCoverLetters(Number.isFinite(jobId) ? jobId : undefined) });
        }
        if (method === 'POST' && segments.length === 1) {
            const body = await readObject(req);
            const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN;
            if (!Number.isFinite(jobId) || jobId <= 0)
                throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数');
            const letter = await service.draftCoverLetter({
                jobId,
                ...(typeof body['language'] === 'string' ? { language: body['language'] } : {}),
                ...(typeof body['resumeId'] === 'number' ? { resumeId: body['resumeId'] } : {}),
                ...(typeof body['useLlm'] === 'boolean' ? { useLlm: body['useLlm'] } : {}),
            });
            runtime.events().publish('coverLetter.created', { id: letter.id, jobId });
            return json(201, { ok: true, coverLetter: letter });
        }
    }
    return json(404, { ok: false, code: 'NOT_FOUND', path: req.path });
}
function parseStage(raw) {
    if (!APPLICATION_STAGES.includes(raw)) {
        throw new DomainError('INVALID_INPUT', `不支持的投递阶段：${raw}`, {
            hint: `合法取值：${APPLICATION_STAGES.join(' / ')}`,
        });
    }
    return raw;
}
/**
 * 唯一入口。所有领域错误在这里翻译成 HTTP（§9 映射表）。
 */
export async function routeRequest(runtime, req) {
    try {
        return await dispatch(runtime, req);
    }
    catch (error) {
        if (error instanceof DomainError) {
            return json(error.status, error.toJson());
        }
        // 「需要用户确认」不是拒绝（§4.4.2）：返回 409 + 确认文案，
        // 界面显示给用户，用户同意后带 confirm:true 重发同一个请求。
        if (error instanceof ConfirmRequiredError) {
            return json(409, {
                ok: false,
                code: 'NEEDS_CONFIRM',
                message: error.message,
                action: error.request.action,
                danger: error.request.danger,
                confirmText: error.text(),
            });
        }
        return json(500, { ok: false, code: 'INTERNAL', message: messageOf(error) });
    }
}
//# sourceMappingURL=router.js.map