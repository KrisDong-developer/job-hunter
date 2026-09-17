import { ASSESSMENT_KINDS, ASSESSMENT_STATES, CAMPUS_BATCHES, CAMPUS_STAGES, TRIPARTITE_STATES, } from '../../shared/enums.js';
import { systemClock } from '../util/time.js';
import { DomainError } from '../util/errors.js';
/** 距截止多久开始算"紧急"。24 小时以内的硬截止才是 urgent —— 再早会变成狼来了。 */
export const URGENT_WITHIN_HOURS = 24;
/** 距截止多久开始进入"要提醒"的范围。 */
export const WARN_WITHIN_HOURS = 72;
export function createCampusService(deps) {
    const { store } = deps;
    const clock = deps.clock ?? systemClock;
    const decorateCampus = (record) => {
        const company = record.companyId === null ? undefined : store.company.get(record.companyId);
        const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
        return {
            ...record,
            companyName: company?.name ?? null,
            jobTitle: job?.title ?? null,
            assessments: store.branch
                .listAssessments({ campusApplicationId: record.id })
                .map((item) => ({
                ...item,
                hoursLeft: item.dueAt === null ? null : hoursBetween(clock(), item.dueAt),
            })),
        };
    };
    const decorateAssessment = (record) => ({
        ...record,
        hoursLeft: record.dueAt === null ? null : hoursBetween(clock(), record.dueAt),
    });
    const toDeadlineDto = (deadline) => ({
        ...deadline,
        urgent: deadline.hoursLeft <= URGENT_WITHIN_HOURS,
        overdue: deadline.hoursLeft < 0,
    });
    /**
     * 推进校招状态**并留痕**。
     *
     * 抽成一个内部函数，是因为"改了状态却忘了写事件"这件事在实测里发生了三次
     * （测评完成、建三方、三方签署各漏一次）—— 而事件表是唯一能回答
     * "这个状态是谁改的、凭什么"的地方。把两条动作绑在一个函数里，
     * 以后新增路径就不可能只做一半。
     */
    const advanceCampusStage = (campusId, to, evidenceRef) => {
        const before = store.branch.getCampusApplication(campusId);
        if (before === undefined || before.stage === to)
            return;
        store.branch.updateCampusApplication(campusId, { stage: to }, clock());
        store.pipeline.appendStageEvent({
            entity: 'campus',
            entityId: campusId,
            fromStage: before.stage,
            toStage: to,
            source: 'auto',
            evidenceRef: evidenceRef ?? null,
        }, clock());
    };
    return {
        create(input) {
            if (input.batch !== undefined && !CAMPUS_BATCHES.includes(input.batch)) {
                throw new DomainError('INVALID_INPUT', `不支持的批次：${String(input.batch)}`, {
                    hint: `合法取值：${CAMPUS_BATCHES.join(' / ')}`,
                });
            }
            const record = store.branch.createCampusApplication({
                companyId: input.companyId ?? null,
                jobId: input.jobId ?? null,
                ...(input.batch === undefined ? {} : { batch: input.batch }),
                applyOpenAt: input.applyOpenAt ?? null,
                applyCloseAt: input.applyCloseAt ?? null,
                note: input.note ?? null,
            }, clock());
            // 与社招投递共用同一张事件表：状态机不同，但"每次变更都要留痕"是同一条规则
            store.pipeline.appendStageEvent({ entity: 'campus', entityId: record.id, fromStage: null, toStage: 'intent', source: 'manual' }, clock());
            deps.logger?.info(`[campus] 新建校招记录 #${String(record.id)}（批次 ${record.batch}）`);
            return decorateCampus(record);
        },
        advance(id, stage, options = {}) {
            const current = store.branch.getCampusApplication(id);
            if (current === undefined) {
                throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`, { detail: { campusApplicationId: id } });
            }
            if (!CAMPUS_STAGES.includes(stage)) {
                throw new DomainError('INVALID_INPUT', `不支持的校招状态：${String(stage)}`, {
                    hint: `合法取值：${CAMPUS_STAGES.join(' / ')}`,
                });
            }
            if (stage === current.stage)
                return decorateCampus(current);
            const backward = CAMPUS_STAGES.indexOf(stage) < CAMPUS_STAGES.indexOf(current.stage);
            if (backward && options.allowBackward !== true) {
                throw new DomainError('INVALID_INPUT', `不允许把校招状态从「${current.stage}」回退到「${stage}」`, {
                    hint: '回退要显式带 allowBackward: true。三方协议那类不可逆节点尤其不该被随手改回去。',
                    detail: { from: current.stage, to: stage },
                });
            }
            const updated = store.branch.updateCampusApplication(id, { stage }, clock());
            if (updated === undefined)
                throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`);
            store.pipeline.appendStageEvent({
                entity: 'campus',
                entityId: id,
                fromStage: current.stage,
                toStage: stage,
                source: 'manual',
                note: options.note ?? null,
            }, clock());
            return decorateCampus(updated);
        },
        get(id) {
            const record = store.branch.getCampusApplication(id);
            if (record === undefined) {
                throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`);
            }
            return decorateCampus(record);
        },
        list(filter = {}) {
            return store.branch.listCampusApplications(filter).map(decorateCampus);
        },
        windows() {
            const now = clock();
            return CAMPUS_BATCHES.map((batch) => {
                const items = store.branch.listCampusApplications({ batch, limit: 500 });
                const upcoming = items
                    .map((item) => item.applyCloseAt)
                    .filter((value) => value !== null && value >= now)
                    .sort();
                return {
                    batch,
                    count: items.length,
                    openCount: items.filter((item) => item.stage === 'intent').length,
                    nextCloseAt: upcoming[0] ?? null,
                };
            });
        },
        addAssessment(input) {
            if (input.kind !== undefined && !ASSESSMENT_KINDS.includes(input.kind)) {
                throw new DomainError('INVALID_INPUT', `不支持的测评类型：${String(input.kind)}`, {
                    hint: `合法取值：${ASSESSMENT_KINDS.join(' / ')}`,
                });
            }
            // 笔试截止是**不可逆**的，所以建的时候就必须有截止时间 ——
            // 没有截止时间的测评等于没有提醒，等于没用。
            if (input.dueAt === undefined || input.dueAt === null || input.dueAt === '') {
                throw new DomainError('INVALID_INPUT', '笔试/测评必须给截止时间（dueAt）', {
                    hint: '校招的笔试错过就出局，没有截止时间的记录做不出提醒。',
                });
            }
            const record = store.branch.createAssessment({
                campusApplicationId: input.campusApplicationId ?? null,
                ...(input.platform === undefined ? {} : { platform: input.platform }),
                ...(input.kind === undefined ? {} : { kind: input.kind }),
                at: input.at ?? null,
                dueAt: input.dueAt,
                durationMin: input.durationMin ?? null,
            }, clock());
            // 建档即把校招记录推进到"待笔试"，但**只在已经网申之后**。
            //
            // 为什么停在 `intent` 时不动它：§12.7 的顺序是 意向 → 已网申 → 待笔试，
            // 从 `intent` 直接跳到 `assessment_pending` 会**凭空发明"已网申"这一步**；
            // 而只走到 `applied` 又是在替用户改状态。项目的既定哲学是
            // 「自动识别提出，人工确认」（§12.1 的"自动识别 + 人工确认"）——
            // 所以这里只做**不产生歧义的那一步**：已网申之后才有"待笔试"可言。
            if (record.campusApplicationId !== null) {
                const campus = store.branch.getCampusApplication(record.campusApplicationId);
                if (campus !== undefined && campus.stage === 'applied') {
                    advanceCampusStage(campus.id, 'assessment_pending', `assessment:${String(record.id)}`);
                }
                else if (campus !== undefined && campus.stage === 'intent') {
                    deps.logger?.warn(`[campus] 校招记录 #${String(campus.id)} 还在"意向"就先记了笔试 —— ` +
                        '状态没有自动改（不替用户改状态），但如果确实已经网申，请把状态推到「已网申」。');
                }
            }
            deps.logger?.info(`[campus] 新增测评 #${String(record.id)}，截止 ${record.dueAt ?? '未填'}`);
            return decorateAssessment(record);
        },
        setAssessmentState(id, state, result) {
            if (!ASSESSMENT_STATES.includes(state)) {
                throw new DomainError('INVALID_INPUT', `不支持的测评状态：${String(state)}`);
            }
            const current = store.branch.getAssessment(id);
            if (current === undefined)
                throw new DomainError('NOT_FOUND', `测评不存在：${String(id)}`);
            /**
             * `missed` 是**终态且不可逆**（§12.7：笔试错过即出局）。
             *
             * 允许把它改回 `pending` 会让"错过"变成一件可以抹掉的事 ——
             * 而现实里错过的笔试没有第二次。所以这里显式挡住，并给出可读原因。
             */
            if (current.state === 'missed' && state !== 'missed') {
                throw new DomainError('INVALID_INPUT', '已经错过的笔试/测评不能改回未完成状态', {
                    hint: '校招的笔试错过就是终态（§12.7）。如果实际上参加了，请让学校/公司重置后重新记录一条，' +
                        '而不是把这条改成"完成" —— 那会让记录与事实不符。',
                    detail: { assessmentId: id, from: current.state, to: state },
                });
            }
            const updated = store.branch.updateAssessment(id, { state, result: result ?? null }, clock());
            if (updated === undefined)
                throw new DomainError('NOT_FOUND', `测评不存在：${String(id)}`);
            store.pipeline.appendStageEvent({ entity: 'assessment', entityId: id, fromStage: current.state, toStage: state, source: 'manual' }, clock());
            // 完成了就推进校招记录；**错过了不推进** —— 错过是终态，不是进度
            if (updated.campusApplicationId !== null && state === 'done') {
                advanceCampusStage(updated.campusApplicationId, 'assessment_done', `assessment:${String(id)}`);
            }
            return decorateAssessment(updated);
        },
        listAssessments(filter = {}) {
            return store.branch.listAssessments(filter).map(decorateAssessment);
        },
        addTalkSession(input) {
            const record = store.branch.createTalkSession({
                companyId: input.companyId ?? null,
                at: input.at,
                place: input.place ?? null,
                online: input.online === true,
                url: input.url ?? null,
                worthGoing: input.worthGoing ?? null,
                note: input.note ?? null,
            }, clock());
            return { ...record, companyName: record.companyId === null ? null : (store.company.get(record.companyId)?.name ?? null) };
        },
        listTalkSessions() {
            return store.branch.listTalkSessions().map((record) => ({
                ...record,
                companyName: record.companyId === null ? null : (store.company.get(record.companyId)?.name ?? null),
            }));
        },
        addTripartite(input) {
            const record = store.branch.createTripartite({
                campusApplicationId: input.campusApplicationId ?? null,
                issuedAt: input.issuedAt ?? null,
                signDeadline: input.signDeadline ?? null,
                penaltySummary: input.penaltySummary ?? null,
            }, clock());
            if (record.campusApplicationId !== null) {
                advanceCampusStage(record.campusApplicationId, 'tripartite_pending', `tripartite:${String(record.id)}`);
            }
            deps.logger?.warn(`[campus] 新增三方协议 #${String(record.id)}：这是**不可逆**节点，签署前请确认违约条款`);
            return { ...record };
        },
        setTripartiteState(id, state) {
            if (!TRIPARTITE_STATES.includes(state)) {
                throw new DomainError('INVALID_INPUT', `不支持的三方状态：${String(state)}`);
            }
            const current = store.branch.listTripartite({ limit: 500 }).find((item) => item.id === id);
            if (current === undefined)
                throw new DomainError('NOT_FOUND', `三方协议不存在：${String(id)}`);
            /**
             * 已签不能改回待签（§4.L L5：**三方协议是不可逆节点**，违约有真实代价）。
             *
             * 真的违约了要改成 `breached`，而不是假装没签过 ——
             * 抹掉签署记录等于把"我签过"这件事从数据里删掉，而那正是违约纠纷里最要紧的事实。
             */
            if (current.state === 'signed' && state !== 'signed' && state !== 'breached') {
                throw new DomainError('INVALID_INPUT', '已签署的三方协议不能改回待签', {
                    hint: '三方签署是不可逆节点。如果确实违约了，请把状态改为「违约」并在违约条款里写清代价。',
                    detail: { tripartiteId: id, from: current.state, to: state },
                });
            }
            const updated = store.branch.updateTripartite(id, { state }, clock());
            if (updated === undefined)
                throw new DomainError('NOT_FOUND', `三方协议不存在：${String(id)}`);
            store.pipeline.appendStageEvent({ entity: 'tripartite', entityId: id, fromStage: current.state, toStage: state, source: 'manual' }, clock());
            if (updated.campusApplicationId !== null && state === 'signed') {
                advanceCampusStage(updated.campusApplicationId, 'tripartite_signed', `tripartite:${String(id)}`);
            }
            return { ...updated };
        },
        listTripartite() {
            return store.branch.listTripartite().map((record) => ({ ...record }));
        },
        deadlines() {
            return store.branch.deadlines(clock()).map(toDeadlineDto);
        },
        overdue() {
            return store.branch
                .deadlines(clock())
                .map(toDeadlineDto)
                .filter((deadline) => deadline.overdue);
        },
    };
}
function hoursBetween(fromIso, toIso) {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to))
        return 0;
    return Math.round((to - from) / 3_600_000);
}
//# sourceMappingURL=campus.js.map