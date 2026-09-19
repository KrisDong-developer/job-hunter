import { ASSESSMENT_KINDS, ASSESSMENT_KIND_LABEL, ASSESSMENT_STATES, ASSESSMENT_STATE_LABEL, CAMPUS_BATCHES, CAMPUS_BATCH_LABEL, CAMPUS_STAGES, CAMPUS_STAGE_LABEL, TRIPARTITE_STATES, TRIPARTITE_STATE_LABEL, } from '../../shared/enums.js';
import { formatLocalMoment } from '../../shared/time-format.js';
import { DomainError } from '../util/errors.js';
import { asString, enumStr, int, requireData, schema, str, textResult, toInt, toolDefiner, } from './kit.js';
export function campusTools(runtime) {
    const tool = toolDefiner(runtime);
    return [
        tool({
            name: 'campus_manage',
            description: '校招支线：网申记录、批次时间窗、笔试/测评（**硬截止**）、三方协议、宣讲会。' +
                '**中危**：模型发起的写操作需要审批。查看来龙去脉用 action=list / action=deadlines。',
            parameters: schema({
                action: enumStr(['list', 'windows', 'create', 'advance', 'assessment', 'assessment-state', 'tripartite', 'tripartite-state', 'talks'], '要做的操作'),
                campusId: int('校招记录 id'),
                companyId: int('公司 id'),
                jobId: int('关联岗位 id'),
                batch: enumStr(CAMPUS_BATCHES, '秋招/春招'),
                stage: enumStr(CAMPUS_STAGES, '目标校招状态'),
                applyOpenAt: str('网申开放时间（ISO）'),
                applyCloseAt: str('网申截止时间（ISO）'),
                assessmentId: int('测评 id'),
                assessmentKind: enumStr(ASSESSMENT_KINDS, '笔试/测评类型'),
                dueAt: str('测评截止时间（ISO）—— 必填，校招的笔试错过就出局'),
                durationMin: int('测评时长（分钟）'),
                assessmentState: enumStr(ASSESSMENT_STATES, '测评状态'),
                platform: str('测评平台'),
                tripartiteId: int('三方协议 id'),
                signDeadline: str('三方签署截止（ISO）'),
                penaltySummary: str('违约条款摘要'),
                tripartiteState: enumStr(TRIPARTITE_STATES, '三方状态'),
                talkAt: str('宣讲会时间（ISO）'),
                talkPlace: str('宣讲会地点'),
                talkOnline: { type: 'boolean', description: '是否线上' },
                note: str('备注'),
            }, ['action']),
            ...textResult,
            async run(args) {
                requireData(runtime);
                const service = runtime.campus();
                const action = asString(args['action']);
                if (action === 'list') {
                    const items = service.list({
                        ...(asString(args['batch']) === undefined ? {} : { batch: asString(args['batch']) }),
                        ...(asString(args['stage']) === undefined ? {} : { stage: asString(args['stage']) }),
                    });
                    if (items.length === 0)
                        return { text: '还没有校招记录。用 action=create 建一条。' };
                    return {
                        text: [
                            `共 ${String(items.length)} 条校招记录：`,
                            ...items.map((item) => `#${String(item.id)} ${item.companyName ?? '未知公司'}｜${CAMPUS_BATCH_LABEL[item.batch]}｜` +
                                `${CAMPUS_STAGE_LABEL[item.stage]}` +
                                `${item.applyCloseAt === null ? '' : `｜网申截止 ${item.applyCloseAt.slice(0, 10)}`}` +
                                `${item.assessments.length === 0 ? '' : `｜测评 ${String(item.assessments.length)} 场`}`),
                        ].join('\n'),
                    };
                }
                if (action === 'windows') {
                    return {
                        text: [
                            '批次时间窗：',
                            ...service.windows().map((window) => `· ${CAMPUS_BATCH_LABEL[window.batch]}：${String(window.count)} 条记录，` +
                                `${String(window.openCount)} 个还在"意向"` +
                                `${window.nextCloseAt === null ? '' : `，最近一个截止 ${window.nextCloseAt.slice(0, 10)}`}`),
                            '校招是季节性的，错过窗口就等一年 —— 截止时间要盯着。',
                        ].join('\n'),
                    };
                }
                if (action === 'talks') {
                    const talks = service.listTalkSessions();
                    if (talks.length === 0)
                        return { text: '还没有宣讲会记录。' };
                    return {
                        text: [
                            `共 ${String(talks.length)} 场宣讲会：`,
                            ...talks.map((talk) => `· ${talk.at.slice(0, 16).replace('T', ' ')}｜${talk.companyName ?? ''}｜` +
                                `${talk.online ? '线上' : (talk.place ?? '地点未填')}`),
                        ].join('\n'),
                    };
                }
                // 以下都是写操作 → 中危，模型发起时走审批
                return await runtime.guard().run({
                    action: `campus.${action}`,
                    actor: 'model',
                    danger: 'mid',
                    ...(typeof args['jobId'] === 'number' ? { target: { jobId: args['jobId'] } } : {}),
                    payload: { action, args: { ...args } },
                }, async () => {
                    switch (action) {
                        case 'create': {
                            const campus = service.create({
                                ...(typeof args['companyId'] === 'number' ? { companyId: args['companyId'] } : {}),
                                ...(typeof args['jobId'] === 'number' ? { jobId: args['jobId'] } : {}),
                                ...(asString(args['batch']) === undefined ? {} : { batch: asString(args['batch']) }),
                                ...(asString(args['applyOpenAt']) === undefined ? {} : { applyOpenAt: asString(args['applyOpenAt']) }),
                                ...(asString(args['applyCloseAt']) === undefined ? {} : { applyCloseAt: asString(args['applyCloseAt']) }),
                                ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) }),
                            });
                            return { text: `已建校招记录 #${String(campus.id)}（${CAMPUS_BATCH_LABEL[campus.batch]}）。` };
                        }
                        case 'advance': {
                            const id = toInt(args['campusId'], 0, 1, Number.MAX_SAFE_INTEGER);
                            const stage = asString(args['stage']);
                            if (id === 0 || stage === undefined) {
                                throw new DomainError('INVALID_INPUT', 'advance 需要 campusId 与 stage');
                            }
                            const campus = service.advance(id, stage, {
                                ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) }),
                            });
                            return { text: `校招 #${String(id)} 状态改为「${CAMPUS_STAGE_LABEL[campus.stage]}」。` };
                        }
                        case 'assessment': {
                            const dueAt = asString(args['dueAt']);
                            if (dueAt === undefined) {
                                throw new DomainError('INVALID_INPUT', 'dueAt（截止时间）必填', {
                                    hint: '校招的笔试错过就出局，没有截止时间的记录做不出提醒。',
                                });
                            }
                            const assessment = service.addAssessment({
                                ...(typeof args['campusId'] === 'number' ? { campusApplicationId: args['campusId'] } : {}),
                                ...(asString(args['platform']) === undefined ? {} : { platform: asString(args['platform']) }),
                                ...(asString(args['assessmentKind']) === undefined
                                    ? {}
                                    : { kind: asString(args['assessmentKind']) }),
                                dueAt,
                                ...(typeof args['durationMin'] === 'number' ? { durationMin: args['durationMin'] } : {}),
                            });
                            return {
                                text: `已记录测评 #${String(assessment.id)}：${ASSESSMENT_KIND_LABEL[assessment.kind]}，` +
                                    `截止 ${assessment.dueAt ?? ''}（还剩 ${String(assessment.hoursLeft ?? 0)} 小时）。\n` +
                                    '⚠ 这是**不可逆**节点：错过就是终态。',
                            };
                        }
                        case 'assessment-state': {
                            const id = toInt(args['assessmentId'], 0, 1, Number.MAX_SAFE_INTEGER);
                            const state = asString(args['assessmentState']);
                            if (id === 0 || state === undefined) {
                                throw new DomainError('INVALID_INPUT', 'assessment-state 需要 assessmentId 与 assessmentState');
                            }
                            const assessment = service.setAssessmentState(id, state);
                            return { text: `测评 #${String(id)} 状态改为「${ASSESSMENT_STATE_LABEL[assessment.state]}」。` };
                        }
                        case 'tripartite': {
                            const tripartite = service.addTripartite({
                                ...(typeof args['campusId'] === 'number' ? { campusApplicationId: args['campusId'] } : {}),
                                ...(asString(args['signDeadline']) === undefined
                                    ? {}
                                    : { signDeadline: asString(args['signDeadline']) }),
                                ...(asString(args['penaltySummary']) === undefined
                                    ? {}
                                    : { penaltySummary: asString(args['penaltySummary']) }),
                            });
                            return {
                                text: `已记录三方协议 #${String(tripartite.id)}` +
                                    `${tripartite.signDeadline === null ? '' : `（签署截止 ${tripartite.signDeadline}）`}。\n` +
                                    '⚠ 三方是**不可逆**节点，签署前请确认违约条款。',
                            };
                        }
                        case 'tripartite-state': {
                            const id = toInt(args['tripartiteId'], 0, 1, Number.MAX_SAFE_INTEGER);
                            const state = asString(args['tripartiteState']);
                            if (id === 0 || state === undefined) {
                                throw new DomainError('INVALID_INPUT', 'tripartite-state 需要 tripartiteId 与 tripartiteState');
                            }
                            return {
                                text: `三方协议 #${String(id)} 状态改为「${TRIPARTITE_STATE_LABEL[service.setTripartiteState(id, state).state]}」。`,
                            };
                        }
                        default:
                            throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`);
                    }
                });
            },
        }),
        tool({
            name: 'campus_deadlines',
            description: '所有**不可逆硬截止**：校招笔试/测评截止、网申截止、三方签署截止（按到期时间排序）。低危，只读。' +
                '这些节点错过就是终态，所以 24 小时以内的会被标为紧急。',
            parameters: schema({}),
            ...textResult,
            async run() {
                requireData(runtime);
                const service = runtime.campus();
                const items = service.deadlines();
                const overdue = service.overdue();
                if (items.length === 0) {
                    return {
                        text: overdue.length === 0
                            ? '没有待处理的硬截止。'
                            : `有 ${String(overdue.length)} 个已过期的硬截止 —— 见下面的过期清单。`,
                    };
                }
                return {
                    text: [
                        `共 ${String(items.length)} 个硬截止（按到期时间）：`,
                        ...items.map((item) => `${item.overdue ? '⛔ 已过期' : item.urgent ? '⚠ 紧急' : '·'} ${item.label}｜` +
                            `${formatLocalMoment(item.dueAt, new Date(), { withRelative: false }) ?? item.dueAt}｜` +
                            `${item.overdue ? `已过 ${String(Math.abs(item.hoursLeft))} 小时` : `还剩 ${String(item.hoursLeft)} 小时`}`),
                        '',
                        '这些节点都是**不可逆**的：校招笔试错过即终态，网申错过要等下一季。',
                    ].join('\n'),
                };
            },
        }),
    ];
}
//# sourceMappingURL=campus.js.map