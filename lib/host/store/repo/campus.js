import { ASSESSMENT_KIND_LABEL, CAMPUS_BATCH_LABEL } from '../../../shared/enums.js';
import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull } from '../row.js';
const toCampus = (row) => ({
    id: asInt(row['id']),
    companyId: asIntOrNull(row['company_id']),
    jobId: asIntOrNull(row['job_id']),
    batch: asText(row['batch'], 'autumn'),
    stage: asText(row['stage'], 'intent'),
    stageAt: asText(row['stage_at']),
    applyOpenAt: asTextOrNull(row['apply_open_at']),
    applyCloseAt: asTextOrNull(row['apply_close_at']),
    note: asTextOrNull(row['note']),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
});
const toAssessment = (row) => ({
    id: asInt(row['id']),
    campusApplicationId: asIntOrNull(row['campus_application_id']),
    platform: asText(row['platform']),
    kind: asText(row['kind'], 'written'),
    at: asTextOrNull(row['at']),
    dueAt: asTextOrNull(row['due_at']),
    durationMin: asIntOrNull(row['duration_min']),
    state: asText(row['state'], 'pending'),
    result: asTextOrNull(row['result']),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
});
const toTalk = (row) => ({
    id: asInt(row['id']),
    companyId: asIntOrNull(row['company_id']),
    at: asText(row['at']),
    place: asTextOrNull(row['place']),
    online: asInt(row['online'], 0) !== 0,
    url: asTextOrNull(row['url']),
    worthGoing: asTextOrNull(row['worth_going']),
    note: asTextOrNull(row['note']),
    createdAt: asText(row['created_at']),
});
const toTripartite = (row) => ({
    id: asInt(row['id']),
    campusApplicationId: asIntOrNull(row['campus_application_id']),
    issuedAt: asTextOrNull(row['issued_at']),
    signDeadline: asTextOrNull(row['sign_deadline']),
    state: asText(row['state'], 'pending'),
    penaltySummary: asTextOrNull(row['penalty_summary']),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
});
const toVisa = (row) => ({
    id: asInt(row['id']),
    jobId: asInt(row['job_id']),
    stance: asText(row['stance'], 'unknown'),
    identityLimit: asTextOrNull(row['identity_limit']),
    evidence: asJson(row['evidence_json'], []),
    source: asText(row['source'], 'rule'),
    uncertainty: asTextOrNull(row['uncertainty']),
    createdAt: asText(row['created_at']),
});
const toCoverLetter = (row) => ({
    id: asInt(row['id']),
    jobId: asIntOrNull(row['job_id']),
    resumeId: asIntOrNull(row['resume_id']),
    language: asText(row['language'], 'en'),
    content: asText(row['content']),
    via: asText(row['via'], 'rule'),
    notes: asJson(row['notes_json'], []),
    createdAt: asText(row['created_at']),
});
function hoursBetween(fromIso, toIso) {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to))
        return 0;
    return Math.round((to - from) / 3_600_000);
}
export function createBranchRepo(db) {
    const insertCampus = db.prepare(`INSERT INTO campus_application (company_id, job_id, batch, stage, stage_at, apply_open_at, apply_close_at, note, created_at, updated_at)
     VALUES (?, ?, ?, 'intent', ?, ?, ?, ?, ?, ?)`);
    const selectCampus = db.prepare('SELECT * FROM campus_application WHERE id = ?');
    const selectCampusAll = db.prepare('SELECT * FROM campus_application ORDER BY stage_at DESC LIMIT ?');
    const selectCampusByBatch = db.prepare('SELECT * FROM campus_application WHERE batch = ? ORDER BY stage_at DESC LIMIT ?');
    const selectCampusByStage = db.prepare('SELECT * FROM campus_application WHERE stage = ? ORDER BY stage_at DESC LIMIT ?');
    const selectCampusByCompany = db.prepare('SELECT * FROM campus_application WHERE company_id = ? ORDER BY stage_at DESC LIMIT ?');
    const insertAssessment = db.prepare(`INSERT INTO assessment (campus_application_id, platform, kind, at, due_at, duration_min, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`);
    const selectAssessment = db.prepare('SELECT * FROM assessment WHERE id = ?');
    const selectAssessmentAll = db.prepare('SELECT * FROM assessment ORDER BY COALESCE(due_at, at, created_at) LIMIT ?');
    const selectAssessmentByApp = db.prepare('SELECT * FROM assessment WHERE campus_application_id = ? ORDER BY id DESC LIMIT ?');
    const selectAssessmentByState = db.prepare('SELECT * FROM assessment WHERE state = ? ORDER BY COALESCE(due_at, at) LIMIT ?');
    const insertTalk = db.prepare(`INSERT INTO talk_session (company_id, at, place, online, url, worth_going, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectTalk = db.prepare('SELECT * FROM talk_session ORDER BY at LIMIT ?');
    const insertTripartite = db.prepare(`INSERT INTO tripartite (campus_application_id, issued_at, sign_deadline, state, penalty_summary, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`);
    const selectTripartite = db.prepare('SELECT * FROM tripartite WHERE id = ?');
    const selectTripartiteAll = db.prepare('SELECT * FROM tripartite ORDER BY COALESCE(sign_deadline, created_at) LIMIT ?');
    const selectTripartiteByState = db.prepare('SELECT * FROM tripartite WHERE state = ? ORDER BY COALESCE(sign_deadline, created_at) LIMIT ?');
    const upsertVisa = db.prepare(`INSERT INTO visa_requirement (job_id, stance, identity_limit, evidence_json, source, uncertainty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`);
    const selectVisaByJob = db.prepare('SELECT * FROM visa_requirement WHERE job_id = ? ORDER BY id DESC LIMIT 1');
    const selectVisaAll = db.prepare('SELECT * FROM visa_requirement ORDER BY id DESC LIMIT ?');
    const selectVisaByStance = db.prepare('SELECT * FROM visa_requirement WHERE stance = ? ORDER BY id DESC LIMIT ?');
    const deleteVisaByJob = db.prepare('DELETE FROM visa_requirement WHERE job_id = ?');
    const insertCoverLetter = db.prepare(`INSERT INTO cover_letter (job_id, resume_id, language, content, via, notes_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const selectCoverLetter = db.prepare('SELECT * FROM cover_letter WHERE id = ?');
    const selectCoverLetterAll = db.prepare('SELECT * FROM cover_letter ORDER BY id DESC LIMIT ?');
    const selectCoverLetterByJob = db.prepare('SELECT * FROM cover_letter WHERE job_id = ? ORDER BY id DESC LIMIT ?');
    const setJobBranch = db.prepare('UPDATE job SET campus_batch = COALESCE(?, campus_batch), remote_kind = COALESCE(?, remote_kind), visa_stance = COALESCE(?, visa_stance) WHERE id = ?');
    return {
        createCampusApplication(input, now) {
            const result = insertCampus.run(input.companyId ?? null, input.jobId ?? null, input.batch ?? 'autumn', now, input.applyOpenAt ?? null, input.applyCloseAt ?? null, input.note ?? null, now, now);
            return toCampus(selectCampus.get(asId(result.lastInsertRowid)));
        },
        updateCampusApplication(id, patch, now) {
            const current = selectCampus.get(id);
            if (current === undefined)
                return undefined;
            const record = toCampus(current);
            const stage = patch.stage ?? record.stage;
            db.prepare(`UPDATE campus_application SET stage = ?, stage_at = ?, batch = ?, apply_open_at = ?, apply_close_at = ?, note = ?, updated_at = ?
         WHERE id = ?`).run(stage, stage === record.stage ? record.stageAt : now, patch.batch ?? record.batch, patch.applyOpenAt === undefined ? record.applyOpenAt : patch.applyOpenAt, patch.applyCloseAt === undefined ? record.applyCloseAt : patch.applyCloseAt, patch.note === undefined ? record.note : patch.note, now, id);
            return toCampus(selectCampus.get(id));
        },
        getCampusApplication(id) {
            const row = selectCampus.get(id);
            return row === undefined ? undefined : toCampus(row);
        },
        listCampusApplications(filter = {}) {
            const limit = filter.limit ?? 200;
            const rows = (filter.batch !== undefined
                ? selectCampusByBatch.all(filter.batch, limit)
                : filter.stage !== undefined
                    ? selectCampusByStage.all(filter.stage, limit)
                    : filter.companyId !== undefined
                        ? selectCampusByCompany.all(filter.companyId, limit)
                        : selectCampusAll.all(limit));
            return rows.map(toCampus);
        },
        createAssessment(input, now) {
            const result = insertAssessment.run(input.campusApplicationId ?? null, input.platform ?? '', input.kind ?? 'written', input.at ?? null, input.dueAt ?? null, input.durationMin ?? null, now, now);
            return toAssessment(selectAssessment.get(asId(result.lastInsertRowid)));
        },
        updateAssessment(id, patch, now) {
            const current = selectAssessment.get(id);
            if (current === undefined)
                return undefined;
            const record = toAssessment(current);
            db.prepare('UPDATE assessment SET state = ?, result = ?, due_at = ?, at = ?, updated_at = ? WHERE id = ?').run(patch.state ?? record.state, patch.result === undefined ? record.result : patch.result, patch.dueAt === undefined ? record.dueAt : patch.dueAt, patch.at === undefined ? record.at : patch.at, now, id);
            return toAssessment(selectAssessment.get(id));
        },
        getAssessment(id) {
            const row = selectAssessment.get(id);
            return row === undefined ? undefined : toAssessment(row);
        },
        listAssessments(filter = {}) {
            const limit = filter.limit ?? 200;
            const rows = (filter.campusApplicationId !== undefined
                ? selectAssessmentByApp.all(filter.campusApplicationId, limit)
                : filter.state !== undefined
                    ? selectAssessmentByState.all(filter.state, limit)
                    : selectAssessmentAll.all(limit));
            return rows.map(toAssessment);
        },
        createTalkSession(input, now) {
            const result = insertTalk.run(input.companyId ?? null, input.at, input.place ?? null, input.online === true ? 1 : 0, input.url ?? null, input.worthGoing ?? null, input.note ?? null, now);
            return toTalk(db.prepare('SELECT * FROM talk_session WHERE id = ?').get(asId(result.lastInsertRowid)));
        },
        listTalkSessions(limit = 50) {
            return selectTalk.all(limit).map(toTalk);
        },
        createTripartite(input, now) {
            const result = insertTripartite.run(input.campusApplicationId ?? null, input.issuedAt ?? null, input.signDeadline ?? null, input.penaltySummary ?? null, now, now);
            return toTripartite(selectTripartite.get(asId(result.lastInsertRowid)));
        },
        updateTripartite(id, patch, now) {
            const current = selectTripartite.get(id);
            if (current === undefined)
                return undefined;
            const record = toTripartite(current);
            db.prepare('UPDATE tripartite SET state = ?, sign_deadline = ?, penalty_summary = ?, updated_at = ? WHERE id = ?').run(patch.state ?? record.state, patch.signDeadline === undefined ? record.signDeadline : patch.signDeadline, patch.penaltySummary === undefined ? record.penaltySummary : patch.penaltySummary, now, id);
            return toTripartite(selectTripartite.get(id));
        },
        listTripartite(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.state !== undefined ? selectTripartiteByState.all(filter.state, limit) : selectTripartiteAll.all(limit));
            return rows.map(toTripartite);
        },
        upsertVisaRequirement(input, now) {
            // 同一个岗位只保留最新一条判断：旧的依据会被覆盖，
            // 因为"提不提供担保"是一个结论，留着多条互相矛盾的结论只会让人更迷惑
            deleteVisaByJob.run(input.jobId);
            const result = upsertVisa.run(input.jobId, input.stance, input.identityLimit ?? null, JSON.stringify(input.evidence ?? []), input.source ?? 'rule', input.uncertainty ?? null, now);
            void result;
            const row = selectVisaByJob.get(input.jobId);
            return toVisa(row);
        },
        getVisaRequirement(jobId) {
            const row = selectVisaByJob.get(jobId);
            return row === undefined ? undefined : toVisa(row);
        },
        listVisaRequirements(filter = {}) {
            const limit = filter.limit ?? 200;
            const rows = (filter.stance !== undefined ? selectVisaByStance.all(filter.stance, limit) : selectVisaAll.all(limit));
            return rows.map(toVisa);
        },
        createCoverLetter(input, now) {
            const result = insertCoverLetter.run(input.jobId, input.resumeId ?? null, input.language ?? 'en', input.content, input.via ?? 'rule', JSON.stringify(input.notes ?? []), now);
            return toCoverLetter(selectCoverLetter.get(asId(result.lastInsertRowid)));
        },
        listCoverLetters(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.jobId !== undefined ? selectCoverLetterByJob.all(filter.jobId, limit) : selectCoverLetterAll.all(limit));
            return rows.map(toCoverLetter);
        },
        getCoverLetter(id) {
            const row = selectCoverLetter.get(id);
            return row === undefined ? undefined : toCoverLetter(row);
        },
        setJobBranches(jobId, patch) {
            // 只有**真的识别出来**才写：`unknown` 属于"没识别出来"，
            // 写成 'unknown' 会让"识别列可空"这条约定失效 ——
            // 而筛选时"没识别"与"识别为未识别"是两件事，混在一起就再也分不开。
            setJobBranch.run(patch.campusBatch ?? null, patch.remoteKind === null || patch.remoteKind === undefined || patch.remoteKind === 'unknown'
                ? null
                : patch.remoteKind, patch.visaStance === null || patch.visaStance === undefined || patch.visaStance === 'unknown'
                ? null
                : patch.visaStance, jobId);
        },
        deadlines(now) {
            const out = [];
            // ① 笔试/测评截止 —— 校招最不可逆的一点（§12.7）
            for (const assessment of this.listAssessments({ limit: 500 })) {
                if (assessment.dueAt === null)
                    continue;
                if (assessment.state === 'done' || assessment.state === 'missed')
                    continue;
                out.push({
                    kind: 'assessment',
                    refId: assessment.id,
                    label: `${assessment.platform === '' ? '' : `${assessment.platform} `}${ASSESSMENT_KIND_LABEL[assessment.kind]}截止`,
                    dueAt: assessment.dueAt,
                    hoursLeft: hoursBetween(now, assessment.dueAt),
                    irreversible: true,
                });
            }
            // ② 网申截止 —— 错过就等一年（§4.L L1）
            //
            // 只对**还没网申**（`intent`）的行产生截止节点：一旦交了申请，
            // "网申截止"对你就不再是待办了（它变成招聘方的流程节点，不是你的行动项）。
            // `windows().openCount` 用的是同一个定义，两处口径必须一致。
            for (const campus of this.listCampusApplications({ limit: 500 })) {
                if (campus.applyCloseAt === null)
                    continue;
                if (campus.stage !== 'intent')
                    continue;
                out.push({
                    kind: 'apply-close',
                    refId: campus.id,
                    label: `${CAMPUS_BATCH_LABEL[campus.batch]}网申截止`,
                    dueAt: campus.applyCloseAt,
                    hoursLeft: hoursBetween(now, campus.applyCloseAt),
                    irreversible: true,
                });
            }
            // ③ 三方签署截止 —— 违约有真实代价（§4.L L5）
            for (const tripartite of this.listTripartite({ limit: 500 })) {
                if (tripartite.state !== 'pending' || tripartite.signDeadline === null)
                    continue;
                out.push({
                    kind: 'tripartite',
                    refId: tripartite.id,
                    label: '三方协议签署截止',
                    dueAt: tripartite.signDeadline,
                    hoursLeft: hoursBetween(now, tripartite.signDeadline),
                    irreversible: true,
                });
            }
            return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
        },
    };
}
//# sourceMappingURL=campus.js.map