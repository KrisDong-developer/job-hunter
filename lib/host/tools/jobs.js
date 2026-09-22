import { JOB_FLAG_LABEL, JOB_STATES } from '../../shared/contract/enums/job.js';
import { CONTACT_STAGE_LABEL } from '../../shared/contract/enums/pipeline.js';
import { JOB_STATE_LABEL } from '../../shared/contract/enums/job.js';
import { DETAIL_KEYS, formatDetailLine, formatJobDetailTitle, formatJobListLine, summarizeJd } from '../../shared/text/tool-format.js';
import { DomainError } from '../util/errors.js';
import { ARRAY_OF_OBJECT, TOOL_BATCH_MAX, TOOL_LIST_MAX, asString, enumStr, int, num, positiveId, requireData, schema, str, textResult, toInt, toolDefiner, } from './kit.js';
function jobLines(jobs) {
    return jobs.map((job) => formatJobListLine({
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        city: job.city,
        district: job.district,
        salaryRaw: job.salaryRaw,
        matchScore: job.matchScore,
        flagTypes: job.flagTypes,
    }));
}
/** 岗位谓词：把工具参数翻成 `JobQuery`（与 HTTP 的 `buildJobQuery` 同一套字段）。 */
function queryOf(args) {
    const state = asString(args['state']);
    if (state !== undefined && !JOB_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', `state 取值不合法：${state}`, {
            hint: `合法取值：${JOB_STATES.join(' / ')}`,
        });
    }
    const city = asString(args['city']);
    const keyword = asString(args['keyword']);
    const minSalary = typeof args['minSalary'] === 'number' ? args['minSalary'] : undefined;
    // 「只看新增」：与 HTTP 层同一条规则 —— 非法时刻**显式报错**，不当没传
    // （否则模型会拿到一份"以为筛了、其实没筛"的列表去做判断）。
    const firstSeenSince = asString(args['firstSeenSince']);
    if (firstSeenSince !== undefined && Number.isNaN(new Date(firstSeenSince).getTime())) {
        throw new DomainError('INVALID_INPUT', `firstSeenSince 不是合法时刻：${firstSeenSince}`, {
            hint: '传 ISO 时刻，如 2026-09-17T00:00:00.000Z。',
        });
    }
    return {
        ...(state === undefined ? {} : { state: state }),
        ...(city === undefined ? {} : { city }),
        ...(keyword === undefined ? {} : { keyword }),
        ...(minSalary === undefined ? {} : { minSalaryAtLeast: minSalary }),
        ...(firstSeenSince === undefined ? {} : { firstSeenSince }),
        orderBy: 'last_seen_at',
        descending: true,
    };
}
export function jobsTools(runtime) {
    const tool = toolDefiner(runtime);
    return [
        tool({
            name: 'job_search',
            description: '按关键词/城市搜索岗位并入库（会真的打开浏览器抓取一次），然后返回库里匹配的岗位。' +
                '想只看已入库的岗位用 job_query，不要用这个。',
            // 抓一次要几十秒：给足超时，否则模型会看到"超时"而实际抓取仍在跑
            timeoutMs: 5 * 60 * 1000,
            parameters: schema({
                keyword: str('搜索关键词，如 "Java"、"前端"'),
                city: str('城市，如 "深圳"'),
                platformId: str('平台 id；不填用第一个已注册平台'),
                planId: int('用已有搜索方案抓取（填了它就不用给 keyword/city）'),
                limit: int(`返回条数上限（默认 10，最多 ${String(TOOL_LIST_MAX)}）`),
            }),
            outputSchema: {
                type: 'object',
                properties: { summary: { type: 'string' }, jobs: ARRAY_OF_OBJECT },
            },
            render: (_args, value) => value.summary,
            async run(args) {
                const { jobs } = requireData(runtime);
                const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined;
                const limit = toInt(args['limit'], 10, 1, TOOL_LIST_MAX);
                const keyword = asString(args['keyword']);
                const city = asString(args['city']);
                let headline;
                if (planId !== undefined) {
                    const summary = await runtime.runPlan(planId, 'manual');
                    headline =
                        `按方案 #${String(planId)} 抓取完成：发现 ${String(summary.run.found)} 条，` +
                            `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}`;
                }
                else {
                    const platformId = asString(args['platformId']) ?? runtime.registry().list()[0]?.id;
                    if (platformId === undefined) {
                        throw new DomainError('NOT_FOUND', '没有已注册的平台，无法搜索', {
                            hint: '先在界面里确认平台适配器已加载。',
                        });
                    }
                    const summary = await runtime.crawl({
                        platformId,
                        criteria: {
                            ...(keyword === undefined ? {} : { keyword }),
                            ...(city === undefined ? {} : { city }),
                        },
                    });
                    const what = [keyword, city].filter((part) => part !== undefined).join(' / ') || '（无关键词）';
                    headline =
                        `搜索「${what}」完成：发现 ${String(summary.run.found)} 条，` +
                            `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}` +
                            (summary.quarantined > 0 ? `，${String(summary.quarantined)} 条字段不合格被隔离` : '');
                }
                const filters = queryOf({
                    ...(keyword === undefined ? {} : { keyword }),
                    ...(city === undefined ? {} : { city }),
                });
                const items = jobs.query(filters, limit, 0);
                const total = jobs.countMatching(filters);
                const summary = [
                    headline,
                    `库里匹配 ${String(total)} 条，显示前 ${String(items.length)} 条：`,
                    ...jobLines(items),
                ].join('\n');
                return { summary, jobs: items };
            },
        }),
        tool({
            // 注意：**不能**叫 job_list —— 宿主自带一个同名的「列出后台任务」工具（见 index.ts 文件头说明）
            name: 'job_query',
            description: '查询已经入库的岗位（筛选/排序/分页）。不抓取，只读库。',
            parameters: schema({
                state: enumStr(JOB_STATES, '处置态筛选'),
                city: str('按城市筛选'),
                keyword: str('标题关键词（模糊匹配，只作粗筛）'),
                minSalary: num('月薪下限（K）不低于该值'),
                firstSeenSince: str('只看新增：只返回首次见到时间 ≥ 该 ISO 时刻的岗位（如 2026-09-17T00:00:00.000Z）。' +
                    '「存量/增量」的分界就是它 —— 再抓一轮不会让老岗位变成新增。'),
                page: int('页码，从 1 开始'),
                pageSize: int(`每页条数（默认 10，最多 ${String(TOOL_LIST_MAX)}）`),
            }),
            outputSchema: {
                type: 'object',
                properties: { total: { type: 'integer' }, jobs: ARRAY_OF_OBJECT },
            },
            render: (_args, value) => [
                `库里共 ${String(value.total)} 条，返回 ${String(value.jobs.length)} 条：`,
                ...jobLines(value.jobs),
            ].join('\n'),
            async run(args) {
                const { jobs } = requireData(runtime);
                const filters = queryOf(args);
                const page = toInt(args['page'], 1, 1, 10_000);
                const pageSize = toInt(args['pageSize'], 10, 1, TOOL_LIST_MAX);
                const items = jobs.query(filters, pageSize, (page - 1) * pageSize);
                return { total: jobs.countMatching(filters), jobs: items };
            },
        }),
        tool({
            name: 'job_detail',
            description: '一个岗位的详情：薪资/城市/要求、匹配分与逐条理由、风险标注、JD 摘要与来源链接。',
            parameters: schema({ jobId: int('岗位 id（列表里的 #数字）') }, ['jobId']),
            ...textResult,
            async run(args) {
                const { jobs, store } = requireData(runtime);
                const id = positiveId(args.jobId, 'jobId');
                const detail = jobs.detailFull(id);
                const job = detail.job;
                const lines = [formatJobDetailTitle(job.id, job.title, job.companyName)];
                const place = job.district === '' ? job.city : `${job.city} ${job.district}`;
                lines.push(formatDetailLine(DETAIL_KEYS.company, job.companyName ?? '未知公司'));
                lines.push(formatDetailLine(DETAIL_KEYS.place, place === '' ? '未知' : place));
                lines.push(formatDetailLine(DETAIL_KEYS.salary, job.salaryRaw === '' ? '面议' : job.salaryRaw));
                lines.push(formatDetailLine(DETAIL_KEYS.requirement, [job.expReq, job.eduReq].filter((part) => part !== '').join(' · ') || '未写明'));
                if (job.matchScore === null) {
                    lines.push(formatDetailLine(DETAIL_KEYS.match, '还没算（可以用 job_match_explain 算）'));
                }
                else {
                    const reasons = detail.matchReasons
                        .slice(0, 4)
                        .map((reason) => `${reason.text}(${String(reason.weight)})`)
                        .join('；');
                    lines.push(formatDetailLine(DETAIL_KEYS.match, `${String(Math.round(job.matchScore))}（规则粗筛分，不是完整评估）${reasons === '' ? '' : `｜${reasons}`}`));
                }
                if (detail.flags.length > 0) {
                    lines.push(formatDetailLine(DETAIL_KEYS.flags, detail.flags
                        .map((flag) => `${JOB_FLAG_LABEL[flag.flagType]}（${flag.evidence[0] ?? '见详情'}）`)
                        .join('；')));
                }
                lines.push(formatDetailLine(DETAIL_KEYS.jd, summarizeJd(store.job.jdText(job.id))));
                lines.push(formatDetailLine(DETAIL_KEYS.url, job.sourceUrl));
                lines.push(`当前处置态：${JOB_STATE_LABEL[job.state]}`);
                // 接触态与最近一次打招呼：此前 job_detail 完全不提这两件事，
                // 于是模型在对话里只能看到"处置态"，回答不了"我打过招呼了吗、HR 读了吗"。
                const pipeline = runtime.pipeline();
                const latestGreeting = pipeline.listGreetings({ jobId: job.id, limit: 1 })[0];
                lines.push(`接触态：${CONTACT_STAGE_LABEL[pipeline.contactStage(job.id)]}` +
                    (latestGreeting === undefined
                        ? '（还没有打招呼记录）'
                        : `（最近一次打招呼 ${latestGreeting.sentAt.slice(0, 16).replace('T', ' ')}` +
                            `${latestGreeting.templateName === null ? '' : ` · 模板「${latestGreeting.templateName}」`}）`));
                return { text: lines.join('\n') };
            },
        }),
        tool({
            name: 'job_mark',
            description: '给岗位打处置态：收藏 / 忽略 / 归档 / 标为新 / 标为已读。低危，不需要审批。',
            parameters: schema({
                jobId: int('岗位 id'),
                state: enumStr(JOB_STATES, '目标处置态'),
            }, ['jobId', 'state']),
            outputSchema: { type: 'object', properties: { job: { type: 'object' } } },
            render: (_args, value) => `已把 #${String(value.job.id)}「${value.job.title}」标记为「${JOB_STATE_LABEL[value.job.state]}」。`,
            async run(args) {
                const { jobs } = requireData(runtime);
                const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER);
                const state = args.state;
                if (!JOB_STATES.includes(state)) {
                    throw new DomainError('INVALID_INPUT', `state 取值不合法：${String(state)}`, {
                        hint: `合法取值：${JOB_STATES.join(' / ')}`,
                    });
                }
                const job = jobs.mark(id, state);
                runtime.events().publish('job.updated', { id: job.id, state: job.state });
                return { job };
            },
        }),
        tool({
            name: 'job_dedup',
            description: '把全库跨平台重复的岗位**复核一遍**：同一个岗位在多个平台各抓一条时，合并成一组。' +
                '低危、可逆（分组随时可拆），不需要审批。' +
                '用在"刚打开去重开关"或"刚改过抓取范围"之后补做一次 —— 否则要干等下一轮抓取，' +
                '而那一轮可能一条新岗位都没有。',
            parameters: schema({}),
            ...textResult,
            async run() {
                requireData(runtime);
                const result = runtime.sweepDedup();
                const text = [
                    `全库复核完成：看过 ${String(result.scanned)} 条` +
                        (result.skippedGrouped > 0 ? `（跳过已在分组里的 ${String(result.skippedGrouped)} 条）` : '') +
                        '。',
                    `合并 ${String(result.merged)} 条，新建 ${String(result.newGroups)} 组，现在共 ${String(result.groups)} 组。`,
                    // 复核现在会**重判已有分组**（字段改过之后原来的合并可能已经不成立）——
                    // 拆了几条、解散了几组必须报出来，否则用户不知道自己的分组被动过。
                    result.unmerged > 0 || result.dissolved > 0
                        ? `同时重判了已有分组：拆出 ${String(result.unmerged)} 条不再成立的合并` +
                            (result.dissolved > 0 ? `、解散 ${String(result.dissolved)} 组（不足两条）` : '') +
                            '。'
                        : '',
                    // 覆盖率：公司没归并的岗位**根本没查过** —— 不报出来，用户读到的就是"没有重复"
                    result.skippedNoCompany > 0
                        ? `另有 ${String(result.skippedNoCompany)} 条因为公司没归并、判不了重（不算"没有重复"，是"没查过"）。`
                        : '',
                    result.candidates > 0
                        ? `另有 ${String(result.candidates)} 条**疑似**跨平台重复（标题相似度不够，没自动合并）—— 需要人看一眼。`
                        : '没有疑似待确认的。',
                    '合并是可逆的：在「采集」页的跨平台去重卡片里可以随时拆开。',
                ].join('\n');
                return { ...result, text };
            },
        }),
        tool({
            name: 'job_match_explain',
            description: '批量算 L1 规则粗筛分并给出逐条理由（薪资/城市/经验/学历/关键词命中/风险标注）。' +
                '这是**规则打分**，不是模型评估；关掉模型也能用。',
            parameters: schema({
                jobIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: `要算的岗位 id；不填则取最近 ${String(TOOL_BATCH_MAX)} 条`,
                },
            }),
            ...textResult,
            async run(args) {
                const { jobs } = requireData(runtime);
                const intel = runtime.intel();
                const raw = Array.isArray(args['jobIds']) ? args['jobIds'] : [];
                if (raw.length > TOOL_BATCH_MAX) {
                    throw new DomainError('GUARD_DENIED', `一次最多算 ${String(TOOL_BATCH_MAX)} 个岗位（§22.4 批量上限）`, {
                        hint: `请分批，每批不超过 ${String(TOOL_BATCH_MAX)} 个。`,
                        detail: { reason: 'batch' },
                    });
                }
                const ids = raw.length > 0
                    ? raw.map((value) => toInt(value, 0, 1, Number.MAX_SAFE_INTEGER)).filter((id) => id > 0)
                    : jobs.latest(TOOL_BATCH_MAX).map((job) => job.id);
                const now = new Date().toISOString();
                const lines = [`算分范围：${ids.map((id) => `#${String(id)}`).join('、')}`];
                for (const id of ids) {
                    intel.evaluateJob(id, now);
                    const detail = jobs.detailFull(id);
                    const score = detail.job.matchScore === null ? '—' : String(Math.round(detail.job.matchScore));
                    lines.push(`#${String(id)} ${detail.job.title}｜粗筛 ${score}`);
                    if (detail.matchReasons.length === 0) {
                        lines.push('  （没有命中任何规则项）');
                    }
                    else {
                        for (const reason of detail.matchReasons.slice(0, 6)) {
                            lines.push(`  · ${reason.text}（权重 ${String(reason.weight)}）`);
                        }
                    }
                    if (detail.flags.length > 0) {
                        lines.push(`  ⚠ ${detail.flags.map((flag) => JOB_FLAG_LABEL[flag.flagType]).join('、')}`);
                    }
                }
                lines.push('说明：这是规则粗筛分，不是完整评估；需要语义分析要显式开模型（P9）。');
                return { text: lines.join('\n') };
            },
        }),
    ];
}
//# sourceMappingURL=jobs.js.map