/**
 * 采集方案工具：`job_plan_manage`（方案的查看/创建/修改/启停/删除/立即跑/一键暂停）。
 *
 * 与 `crawl.ts` 的分工：这个文件**只管方案与调度配置**，抓取本身是 `crawl.ts` 的事。
 * 方案的写入校验与界面完全同一套（SR-45）—— 工具塞非法条件与界面报同样的错，
 * 这里不做第二套判断。
 */
import { formatCriteriaLine } from '../../shared/text/criteria-label.js';
import { formatWeekdays } from '../../shared/text/time-format.js';
import { describeWindow } from '../scheduler/schedule.js';
import { DomainError } from '../util/errors.js';
import { asString, enumStr, int, requireData, schema, str, textResult, toolDefiner } from './kit.js';
/**
 * 一行一个方案的摘要。
 *
 * 窗口用「工作日 09:00–11:00」而不是「09:30」：**配置里本来就没有单点时刻**（SR-32），
 * 显示成单点会让用户以为他配的是个固定时刻，然后奇怪为什么每天时间不一样。
 */
function describePlans(plans, scheduler) {
    return [
        '现有方案：',
        ...plans.list().map((plan) => {
            const status = scheduler.planStatus.find((item) => item.planId === plan.id);
            const window = plan.schedule.enabled
                ? `${describeWindow(plan.schedule, formatWeekdays(plan.schedule.weekdays))}`
                : '不定时';
            const freshness = status?.freshness.level ?? 'cold';
            const hold = status?.riskPaused === true ? '｜**风控暂停**' : '';
            const why = status?.lastDecision?.decision === 'skipped' && status.lastDecision.message !== null
                ? `｜最近一次跳过：${status.lastDecision.message}`
                : '';
            // 条件行：多关键词方案把关键词列出来（criteria 里已经没有它了），
            // 其余条件照旧翻人话；两者都没有才写"不限"。
            const condition = plan.keywords.length > 0
                ? [`关键词：${plan.keywords.join('、')}`, formatCriteriaLine(plan.criteria) ?? '']
                    .filter((part) => part !== '')
                    .join('｜')
                : (formatCriteriaLine(plan.criteria) ?? '条件：不限');
            return (`#${String(plan.id)} ${plan.name}｜${plan.platforms.join(',')}｜` +
                `${condition}｜${plan.enabled ? '已启用' : '已停用'}｜` +
                `${window}｜新鲜度 ${freshness}${hold}${why}`);
        }),
    ].join('\n');
}
/** 把工具参数翻译成方案写入输入（缺的键不传，交给领域层沿用现值）。 */
function configPatchOf(args, name, planId, plans) {
    const patch = {};
    if (name !== undefined)
        patch['name'] = name;
    // 多关键词：数组透传，收敛与上限校验在领域层（与界面同一套，SR-45）。
    if (Array.isArray(args['keywords'])) {
        patch['keywords'] = args['keywords'].filter((item) => typeof item === 'string');
    }
    const criteria = {};
    const keyword = asString(args['keyword']);
    const city = asString(args['city']);
    const sort = asString(args['sort']);
    if (keyword !== undefined)
        criteria['keyword'] = keyword;
    if (city !== undefined)
        criteria['city'] = city;
    if (sort !== undefined)
        criteria['sort'] = sort;
    const posted = args['postedWithinDays'];
    if (typeof posted === 'number')
        criteria['postedWithinDays'] = String(posted);
    const maxPages = args['maxPages'];
    if (typeof maxPages === 'number')
        criteria['maxPages'] = String(maxPages);
    const platforms = Array.isArray(args['platforms'])
        ? args['platforms'].filter((item) => typeof item === 'string')
        : undefined;
    if (platforms !== undefined)
        patch['platforms'] = platforms;
    // 每平台覆盖项（批次 3）：原样透传，收敛与校验都在 `planService.validate` 里
    // —— 三条入口共用同一份校验（SR-45），这里不做第二套判断。
    const rawOverrides = args['platformOverrides'];
    if (typeof rawOverrides === 'object' && rawOverrides !== null && !Array.isArray(rawOverrides)) {
        patch['platformOverrides'] = rawOverrides;
    }
    const schedule = {};
    if (Array.isArray(args['weekdays'])) {
        schedule['weekdays'] = args['weekdays'].filter((item) => typeof item === 'number');
    }
    if (typeof args['windowStartHour'] === 'number')
        schedule['windowStartHour'] = args['windowStartHour'];
    if (typeof args['windowEndHour'] === 'number')
        schedule['windowEndHour'] = args['windowEndHour'];
    if (Object.keys(schedule).length > 0)
        patch['schedule'] = schedule;
    const postProcess = {};
    for (const key of ['score', 'flag', 'dedup']) {
        if (typeof args[key] === 'boolean')
            postProcess[key] = args[key];
    }
    if (Object.keys(postProcess).length > 0)
        patch['postProcess'] = postProcess;
    if (typeof args['enabled'] === 'boolean')
        patch['enabled'] = args['enabled'];
    // 读取现有条件后合并：`criteria` 在 DTO 里是"整体替换"，
    // 所以只改一个键时必须把现有条件带上，否则会静默丢掉其它键。
    if (Object.keys(criteria).length > 0) {
        const current = planId === undefined ? undefined : plans.get(planId);
        patch['criteria'] = { ...(current?.criteria ?? {}), ...criteria };
    }
    return patch;
}
export function plansTools(runtime) {
    const tool = toolDefiner(runtime);
    return [
        tool({
            name: 'job_plan_manage',
            description: '采集方案（抓什么 + 抓多深 + 什么时候抓 + 抓完做什么）的查看、创建、修改、启停、删除、立即跑一次。' +
                '写入校验与界面完全同一套（SR-45）—— 工具塞非法条件与界面报同样的错。',
            parameters: schema({
                action: enumStr(['list', 'create', 'update', 'enable', 'disable', 'remove', 'run', 'dimensions', 'pause', 'resume'], '要做的操作。dimensions = 看当前平台支持哪些筛选维度；pause/resume = 全局一键暂停定时（只停定时，手动仍可用）'),
                planId: int('方案 id（update/enable/disable/remove/run 需要）'),
                name: str('方案名（create 需要）'),
                keyword: str('搜索关键词（单数；多关键词用 keywords）'),
                keywords: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '多关键词（最多 10 个，逐个采集：第 1 个抓完再抓第 2 个，各自一条运行记录）。' +
                        '给了它就忽略 keyword/criteria.keyword',
                },
                city: str('城市'),
                platforms: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '平台集合；不填 = 全部已注册平台。未注册的平台会被明确拒绝（SR-39）',
                },
                sort: str('排序方式（取值域见 dimensions）'),
                postedWithinDays: int('只要多少天内发布的岗位'),
                maxPages: int('抓取页数上限（受适配器声明的上限约束）'),
                platformOverrides: {
                    type: 'object',
                    description: '每平台的覆盖项（批次 3）。形状：`{ "<平台id>": { "enabled": true|false, "maxPages": 数字|null } }`。' +
                        '`enabled:false` = 这个方案里暂时不抓它（不必把它从 platforms 里删掉）；' +
                        '`maxPages:null` = 用上面方案级的页数。键必须是 platforms 里有的平台，否则会被明确拒绝。',
                },
                weekdays: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: '0=周日…6=周六；空数组 = 每天。这是**偏好时段**的工作日掩码',
                },
                windowStartHour: int('偏好时段起点（本地时，0-23）。**不提供单点时刻**（SR-32）'),
                windowEndHour: int('偏好时段终点（本地时，0-23）。终点 ≤ 起点表示跨零点'),
                score: { type: 'boolean', description: '抓完是否打分（SR-44，默认开）' },
                flag: { type: 'boolean', description: '抓完是否做风险/黑话标注（SR-44，默认开）' },
                dedup: { type: 'boolean', description: '抓完是否做跨平台去重（SR-44，默认开）' },
                enabled: { type: 'boolean', description: '是否启用' },
            }, ['action']),
            ...textResult,
            timeoutMs: 5 * 60 * 1000,
            async run(args) {
                requireData(runtime);
                const plans = runtime.plans();
                const scheduler = runtime.schedulerStatus();
                const action = asString(args['action']);
                const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined;
                const name = asString(args['name']);
                switch (action) {
                    case 'list':
                        return { text: describePlans(plans, scheduler) };
                    case 'dimensions': {
                        const platforms = Array.isArray(args['platforms'])
                            ? args['platforms'].filter((item) => typeof item === 'string')
                            : runtime.registry().list().map((adapter) => adapter.id);
                        const dimensions = plans.dimensions(platforms);
                        return {
                            text: [
                                `平台 ${platforms.join(',')} 支持的筛选维度：`,
                                ...dimensions.map((dimension) => {
                                    if (!dimension.supported) {
                                        return `· ${dimension.label}：**不支持** —— ${dimension.disabledReason ?? ''}`;
                                    }
                                    const values = dimension.values.length === 0
                                        ? dimension.max === null
                                            ? '自由文本'
                                            : `正整数，上限 ${String(dimension.max)}`
                                        : dimension.values.map((item) => `${item.value}=${item.label}`).join(' / ');
                                    // 落到哪个请求参数上也要说 —— 模型据此判断"这个条件对哪些平台真的有效"
                                    // （同一个键在不同平台可能落到不同参数，甚至只对其中一家有效）。
                                    const wiring = dimension.platforms
                                        .filter((item) => item.declared)
                                        .map((item) => item.wire === null
                                        ? `${item.id}：不进请求`
                                        : `${item.id}：${item.wire.target === 'url' ? 'URL' : '请求体'}${item.wire.param === null ? '' : ` 参数 ${item.wire.param}`}`)
                                        .join('；');
                                    return (`· ${dimension.label}：${values} —— ${dimension.hint}` +
                                        (wiring === '' ? '' : `\n    落到：${wiring}`) +
                                        (dimension.conflict
                                            ? `\n    ⚠️ ${dimension.conflictNote ?? '各平台含义不同'}`
                                            : ''));
                                }),
                            ].join('\n'),
                        };
                    }
                    case 'create': {
                        if (name === undefined)
                            throw new DomainError('INVALID_INPUT', 'create 需要 name');
                        const patch = configPatchOf(args, name, planId, plans);
                        // 校验先跑一次，好把"和哪个方案重复"如实回报（SR-43：只提示，不合并）
                        const checked = plans.validate({
                            ...patch,
                            name,
                            platforms: patch['platforms'] ??
                                runtime.registry().list().map((adapter) => adapter.id),
                        });
                        const plan = plans.create({
                            ...patch,
                            name,
                            platforms: patch['platforms'] ??
                                runtime.registry().list().map((adapter) => adapter.id),
                        });
                        const duplicateNote = checked.duplicates.length === 0
                            ? ''
                            : `\n注意：与 ${checked.duplicates.map((item) => `#${String(item.planId)}「${item.name}」`).join('、')} 条件重复（${checked.duplicates[0]?.reason ?? ''}）。只提示，不会自动合并（SR-43）。`;
                        // 非致命提示（多平台：城市不支持 / 平台未校准 / 深度被截断）也要转述给模型 ——
                        // 它对应的都是"平台安静地返回 0 条"，不转述的话用户永远不知道
                        const noticeNote = checked.notices.length === 0
                            ? ''
                            : `\n提示（只提示，方案仍已保存）：\n${checked.notices.map((item) => `- ${item}`).join('\n')}`;
                        return {
                            text: `已创建方案 #${String(plan.id)}「${plan.name}」。${duplicateNote}${noticeNote}\n${describePlans(plans, scheduler)}`,
                            planId: plan.id,
                        };
                    }
                    case 'update':
                    case 'enable':
                    case 'disable': {
                        if (planId === undefined)
                            throw new DomainError('INVALID_INPUT', `${String(action)} 需要 planId`);
                        const patch = configPatchOf(args, name, planId, plans);
                        if (action === 'enable')
                            patch['enabled'] = true;
                        if (action === 'disable')
                            patch['enabled'] = false;
                        const plan = plans.update(planId, patch);
                        return { text: `已更新方案 #${String(plan.id)}。\n${describePlans(plans, scheduler)}` };
                    }
                    case 'remove': {
                        if (planId === undefined)
                            throw new DomainError('INVALID_INPUT', 'remove 需要 planId');
                        if (!plans.remove(planId))
                            throw new DomainError('NOT_FOUND', `方案不存在：${String(planId)}`);
                        return { text: `已删除方案 #${String(planId)}。` };
                    }
                    case 'run': {
                        if (planId === undefined)
                            throw new DomainError('INVALID_INPUT', 'run 需要 planId');
                        const summary = await runtime.runPlan(planId, 'manual');
                        return {
                            text: `方案 #${String(planId)} 已跑完：发现 ${String(summary.run.found)} 条，` +
                                `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}。`,
                        };
                    }
                    case 'pause':
                        runtime.setSchedulePaused(true, asString(args['name']) ?? '模型工具发起的一键暂停');
                        return { text: '已暂停**定时**抓取。手动「立即采集」仍然可用（SR-30）。' };
                    case 'resume':
                        runtime.setSchedulePaused(false);
                        return { text: '已恢复定时抓取。' };
                    default:
                        throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`, {
                            hint: '合法取值：list / create / update / enable / disable / remove / run / dimensions / pause / resume',
                        });
                }
            },
        }),
    ];
}
//# sourceMappingURL=plans.js.map