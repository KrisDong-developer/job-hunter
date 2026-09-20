import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull } from '../row.js';
const toTemplate = (row) => {
    const via = asText(row['via'], 'manual');
    return {
        id: asInt(row['id']),
        resumeId: asIntOrNull(row['resume_id']),
        name: asText(row['name']),
        body: asText(row['body']),
        vars: asJson(row['vars_json'], []),
        scene: asText(row['scene']),
        via: via === 'llm' ? 'llm' : via === 'rule' ? 'rule' : 'manual',
        uses: asInt(row['uses']),
        replies: asInt(row['replies']),
        createdAt: asText(row['created_at']),
        updatedAt: asText(row['updated_at']),
    };
};
const toGreeting = (row) => ({
    id: asInt(row['id']),
    jobId: asIntOrNull(row['job_id']),
    platformId: asText(row['platform_id']),
    templateId: asIntOrNull(row['template_id']),
    content: asText(row['content']),
    sentAt: asText(row['sent_at']),
    channel: asText(row['channel'], 'platform'),
    actor: asText(row['actor'], 'gui'),
    stage: asText(row['stage'], 'greeted'),
    stageAt: asText(row['stage_at']),
    repliedAt: asTextOrNull(row['replied_at']),
});
const toMessage = (row) => ({
    id: asInt(row['id']),
    platformId: asText(row['platform_id']),
    conversationId: asText(row['conversation_id']),
    direction: asText(row['direction']),
    content: asText(row['content']),
    at: asText(row['at']),
    attachmentRef: asTextOrNull(row['attachment_ref']),
    jobId: asIntOrNull(row['job_id']),
    readAt: asTextOrNull(row['read_at']),
});
const toApplication = (row) => ({
    id: asInt(row['id']),
    jobId: asIntOrNull(row['job_id']),
    resumeId: asIntOrNull(row['resume_id']),
    resumeFileId: asIntOrNull(row['resume_file_id']),
    channel: asText(row['channel'], 'platform'),
    sentAt: asText(row['sent_at']),
    stage: asText(row['stage'], 'sent'),
    stageAt: asText(row['stage_at']),
    actor: asText(row['actor'], 'gui'),
    note: asTextOrNull(row['note']),
});
const toStageEvent = (row) => ({
    id: asInt(row['id']),
    entity: asText(row['entity']),
    entityId: asInt(row['entity_id']),
    fromStage: asTextOrNull(row['from_stage']),
    toStage: asText(row['to_stage']),
    at: asText(row['at']),
    source: asText(row['source'], 'manual'),
    evidenceRef: asTextOrNull(row['evidence_ref']),
    note: asTextOrNull(row['note']),
});
const toInterview = (row) => ({
    id: asInt(row['id']),
    applicationId: asIntOrNull(row['application_id']),
    jobId: asIntOrNull(row['job_id']),
    round: asInt(row['round'], 1),
    at: asText(row['at']),
    tz: asText(row['tz'], 'Asia/Shanghai'),
    place: asTextOrNull(row['place']),
    link: asTextOrNull(row['link']),
    contact: asTextOrNull(row['contact']),
    kind: asText(row['kind'], 'video'),
    state: asText(row['state'], 'pending'),
    commuteMin: asIntOrNull(row['commute_min']),
    review: asJson(row['review_json'], {}),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
});
const toQuestionNote = (row) => ({
    id: asInt(row['id']),
    question: asText(row['question']),
    myAnswer: asText(row['my_answer']),
    betterAnswer: asText(row['better_answer']),
    topic: asText(row['topic']),
    companyId: asIntOrNull(row['company_id']),
    interviewId: asIntOrNull(row['interview_id']),
    times: asInt(row['times'], 1),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
});
function tally(rows, column) {
    const out = {};
    for (const row of rows) {
        const key = asText(row[column]);
        out[key] = (out[key] ?? 0) + 1;
    }
    return out;
}
export function createPipelineRepo(db) {
    const insertTemplate = db.prepare(`INSERT INTO greeting_template (name, body, vars_json, scene, resume_id, via, uses, replies, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`);
    const updateTemplate = db.prepare('UPDATE greeting_template SET name = ?, body = ?, vars_json = ?, scene = ?, via = ?, updated_at = ? WHERE id = ?');
    const selectTemplates = db.prepare('SELECT * FROM greeting_template ORDER BY uses DESC, id DESC');
    const selectTemplatesByResume = db.prepare('SELECT * FROM greeting_template WHERE resume_id = ? ORDER BY uses DESC, id DESC');
    const selectTemplatesGeneric = db.prepare('SELECT * FROM greeting_template WHERE resume_id IS NULL ORDER BY uses DESC, id DESC');
    const selectTemplate = db.prepare('SELECT * FROM greeting_template WHERE id = ?');
    const deleteTemplate = db.prepare('DELETE FROM greeting_template WHERE id = ?');
    const deleteTemplatesByResume = db.prepare('DELETE FROM greeting_template WHERE resume_id = ?');
    const bumpUses = db.prepare('UPDATE greeting_template SET uses = uses + 1 WHERE id = ?');
    const bumpReplies = db.prepare('UPDATE greeting_template SET replies = replies + 1 WHERE id = ?');
    const insertGreeting = db.prepare(`INSERT INTO greeting (job_id, platform_id, template_id, content, sent_at, channel, actor, stage, stage_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectGreeting = db.prepare('SELECT * FROM greeting WHERE id = ?');
    const selectGreetingsAll = db.prepare('SELECT * FROM greeting ORDER BY sent_at DESC LIMIT ?');
    const selectGreetingsByJob = db.prepare('SELECT * FROM greeting WHERE job_id = ? ORDER BY sent_at DESC LIMIT ?');
    const selectGreetingsByStage = db.prepare('SELECT * FROM greeting WHERE stage = ? ORDER BY sent_at DESC LIMIT ?');
    const selectLatestGreeting = db.prepare('SELECT * FROM greeting WHERE job_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1');
    const advanceGreetingStmt = db.prepare(`UPDATE greeting SET stage = ?, stage_at = ?,
       replied_at = CASE WHEN ? IN ('replied', 'interview_scheduled') THEN COALESCE(replied_at, ?) ELSE replied_at END
     WHERE id = ? AND stage != ?`);
    const greetingStageCounts = db.prepare('SELECT stage, count(*) AS n FROM greeting GROUP BY stage');
    const insertMessage = db.prepare(`INSERT INTO message (platform_id, conversation_id, direction, content, at, attachment_ref, job_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectMessage = db.prepare('SELECT * FROM message WHERE id = ?');
    const selectMessagesAll = db.prepare('SELECT * FROM message ORDER BY at DESC LIMIT ?');
    const selectMessagesByJob = db.prepare('SELECT * FROM message WHERE job_id = ? ORDER BY at DESC LIMIT ?');
    const selectMessagesUnread = db.prepare('SELECT * FROM message WHERE read_at IS NULL ORDER BY at DESC LIMIT ?');
    const selectMessageByKey = db.prepare(`SELECT * FROM message
     WHERE platform_id = ? AND conversation_id = ? AND direction = ? AND content = ?
     ORDER BY id DESC LIMIT 1`);
    const markRead = db.prepare('UPDATE message SET read_at = ? WHERE id = ? AND read_at IS NULL');
    const selectMessageById = db.prepare('SELECT * FROM message WHERE id = ?');
    const countUnreadStmt = db.prepare('SELECT count(*) AS n FROM message WHERE read_at IS NULL');
    const insertApplication = db.prepare(`INSERT INTO application (job_id, resume_id, resume_file_id, channel, sent_at, stage, stage_at, actor, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectApplication = db.prepare('SELECT * FROM application WHERE id = ?');
    const selectApplicationsAll = db.prepare('SELECT * FROM application ORDER BY sent_at DESC LIMIT ?');
    const selectApplicationsByJob = db.prepare('SELECT * FROM application WHERE job_id = ? ORDER BY sent_at DESC LIMIT ?');
    const selectApplicationsByStage = db.prepare('SELECT * FROM application WHERE stage = ? ORDER BY sent_at DESC LIMIT ?');
    const advanceApplicationStmt = db.prepare('UPDATE application SET stage = ?, stage_at = ? WHERE id = ? AND stage != ?');
    const applicationStageCounts = db.prepare('SELECT stage, count(*) AS n FROM application GROUP BY stage');
    const boardStmt = db.prepare(`SELECT a.*, j.title AS job_title, c.name AS company_name
     FROM application a
     LEFT JOIN job j ON j.id = a.job_id
     LEFT JOIN company c ON c.id = j.company_id
     ORDER BY a.stage_at DESC LIMIT ?`);
    const insertStageEvent = db.prepare(`INSERT INTO stage_event (entity, entity_id, from_stage, to_stage, at, source, evidence_ref, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectStageEvents = db.prepare('SELECT * FROM stage_event WHERE entity = ? AND entity_id = ? ORDER BY at DESC, id DESC LIMIT ?');
    const selectRecentStageEvents = db.prepare('SELECT * FROM stage_event ORDER BY id DESC LIMIT ?');
    const insertInterview = db.prepare(`INSERT INTO interview (application_id, job_id, round, at, tz, place, link, contact, kind, state, commute_min, review_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '{}', ?, ?)`);
    const selectInterview = db.prepare('SELECT * FROM interview WHERE id = ?');
    const selectInterviewsAll = db.prepare('SELECT * FROM interview ORDER BY at LIMIT ?');
    const selectInterviewsWindow = db.prepare('SELECT * FROM interview WHERE at >= ? AND at <= ? ORDER BY at LIMIT ?');
    const selectInterviewsByJob = db.prepare('SELECT * FROM interview WHERE job_id = ? ORDER BY at DESC LIMIT ?');
    const selectInterviewsByState = db.prepare('SELECT * FROM interview WHERE state = ? ORDER BY at LIMIT ?');
    const deleteInterview = db.prepare('DELETE FROM interview WHERE id = ?');
    const insertQuestionNote = db.prepare(`INSERT INTO question_note
       (question, my_answer, better_answer, topic, company_id, interview_id, times, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    const selectQuestionByText = db.prepare('SELECT * FROM question_note WHERE question = ? AND topic = ? ORDER BY id DESC LIMIT 1');
    // `company_id` 用 coalesce：第一次记的时候公司还不知道（没关联岗位），
    // 后来又记一次时知道"这是哪家问的" —— 那时应当补上，而不是永远留空
    const bumpQuestion = db.prepare(`UPDATE question_note
        SET times = times + 1, my_answer = ?, better_answer = ?,
            company_id = coalesce(?, company_id), updated_at = ?
      WHERE id = ?`);
    const updateQuestion = db.prepare(`UPDATE question_note
        SET question = ?, my_answer = ?, better_answer = ?, topic = ?,
            company_id = ?, interview_id = ?, updated_at = ?
      WHERE id = ?`);
    const selectQuestion = db.prepare('SELECT * FROM question_note WHERE id = ?');
    const selectQuestionsAll = db.prepare('SELECT * FROM question_note ORDER BY times DESC, id DESC LIMIT ?');
    const selectQuestionsByTopic = db.prepare('SELECT * FROM question_note WHERE topic = ? ORDER BY times DESC LIMIT ?');
    const selectQuestionsByCompany = db.prepare('SELECT * FROM question_note WHERE company_id = ? ORDER BY times DESC, id DESC LIMIT ?');
    const deleteQuestion = db.prepare('DELETE FROM question_note WHERE id = ?');
    const getInterviewOrThrow = (id) => {
        const row = selectInterview.get(id);
        if (row === undefined)
            throw new Error(`interview ${String(id)} 不存在`);
        return toInterview(row);
    };
    return {
        // ── 模板 ──────────────────────────────────────────────────────
        listTemplates(options) {
            const rows = options?.resumeId === undefined
                ? selectTemplates.all()
                : options.resumeId === null
                    ? selectTemplatesGeneric.all()
                    : selectTemplatesByResume.all(options.resumeId);
            return rows.map(toTemplate);
        },
        upsertTemplate(input, now) {
            const via = input.via ?? 'manual';
            if (input.id === undefined) {
                const result = insertTemplate.run(input.name, input.body, JSON.stringify(input.vars ?? []), input.scene ?? '', input.resumeId ?? null, via, now, now);
                return toTemplate(selectTemplate.get(asId(result.lastInsertRowid)));
            }
            updateTemplate.run(input.name, input.body, JSON.stringify(input.vars ?? []), input.scene ?? '', via, now, input.id);
            const row = selectTemplate.get(input.id);
            if (row === undefined)
                throw new Error(`greeting_template ${String(input.id)} 不存在`);
            return toTemplate(row);
        },
        removeTemplate(id) {
            return Number(deleteTemplate.run(id).changes) > 0;
        },
        removeTemplatesByResume(resumeId) {
            return Number(deleteTemplatesByResume.run(resumeId).changes);
        },
        bumpTemplate(id, field) {
            if (field === 'uses')
                bumpUses.run(id);
            else
                bumpReplies.run(id);
        },
        // ── 打招呼 ────────────────────────────────────────────────────
        createGreeting(input, now) {
            const stage = input.stage ?? 'greeted';
            const result = insertGreeting.run(input.jobId, input.platformId, input.templateId ?? null, input.content, now, input.channel ?? 'platform', input.actor, stage, now, now);
            return toGreeting(selectGreeting.get(asId(result.lastInsertRowid)));
        },
        listGreetings(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.jobId !== undefined
                ? selectGreetingsByJob.all(filter.jobId, limit)
                : filter.stage !== undefined
                    ? selectGreetingsByStage.all(filter.stage, limit)
                    : selectGreetingsAll.all(limit));
            return rows.map(toGreeting);
        },
        getGreeting(id) {
            const row = selectGreeting.get(id);
            return row === undefined ? undefined : toGreeting(row);
        },
        latestGreeting(jobId) {
            const row = selectLatestGreeting.get(jobId);
            return row === undefined ? undefined : toGreeting(row);
        },
        advanceGreeting(id, to, now) {
            return Number(advanceGreetingStmt.run(to, now, to, now, id, to).changes) > 0;
        },
        countGreetingsByStage() {
            const rows = greetingStageCounts.all();
            const out = {};
            for (const row of rows)
                out[asText(row['stage'])] = asInt(row['n']);
            return out;
        },
        // ── 消息 ─────────────────────────────────────────────────────
        createMessage(input, now) {
            const result = insertMessage.run(input.platformId, input.conversationId ?? '', input.direction, input.content, input.at ?? now, input.attachmentRef ?? null, input.jobId ?? null, now);
            return toMessage(selectMessage.get(asId(result.lastInsertRowid)));
        },
        listMessages(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.jobId !== undefined
                ? selectMessagesByJob.all(filter.jobId, limit)
                : filter.unreadOnly === true
                    ? selectMessagesUnread.all(limit)
                    : selectMessagesAll.all(limit));
            return rows.map(toMessage);
        },
        markMessageRead(id, now) {
            return Number(markRead.run(now, id).changes) > 0;
        },
        findMessage(input) {
            const row = selectMessageByKey.get(input.platformId, input.conversationId, input.direction, input.content);
            return row === undefined ? undefined : toMessage(row);
        },
        getMessage(id) {
            const row = selectMessageById.get(id);
            return row === undefined ? undefined : toMessage(row);
        },
        countUnread() {
            const row = countUnreadStmt.get();
            return asInt(row?.['n']);
        },
        // ── 投递 ─────────────────────────────────────────────────────
        createApplication(input, now) {
            const stage = input.stage ?? 'sent';
            const result = insertApplication.run(input.jobId, input.resumeId ?? null, input.resumeFileId ?? null, input.channel ?? 'platform', now, stage, now, input.actor, input.note ?? null, now);
            return toApplication(selectApplication.get(asId(result.lastInsertRowid)));
        },
        listApplications(filter = {}) {
            const limit = filter.limit ?? 200;
            const rows = (filter.jobId !== undefined
                ? selectApplicationsByJob.all(filter.jobId, limit)
                : filter.stage !== undefined
                    ? selectApplicationsByStage.all(filter.stage, limit)
                    : selectApplicationsAll.all(limit));
            return rows.map(toApplication);
        },
        getApplication(id) {
            const row = selectApplication.get(id);
            return row === undefined ? undefined : toApplication(row);
        },
        advanceApplication(id, to, now) {
            return Number(advanceApplicationStmt.run(to, now, id, to).changes) > 0;
        },
        countApplicationsByStage() {
            return tally(applicationStageCounts.all(), 'stage');
        },
        boardRows() {
            return boardStmt.all(500).map((row) => ({
                ...toApplication(row),
                jobTitle: asTextOrNull(row['job_title']),
                companyName: asTextOrNull(row['company_name']),
            }));
        },
        // ── 状态事件 ──────────────────────────────────────────────────
        appendStageEvent(input, now) {
            const result = insertStageEvent.run(input.entity, input.entityId, input.fromStage, input.toStage, now, input.source, input.evidenceRef ?? null, input.note ?? null);
            return asId(result.lastInsertRowid);
        },
        listStageEvents(entity, entityId, limit = 50) {
            return selectStageEvents.all(entity, entityId, limit).map(toStageEvent);
        },
        recentStageEvents(limit) {
            return selectRecentStageEvents.all(limit).map(toStageEvent);
        },
        // ── 面试 ─────────────────────────────────────────────────────
        createInterview(input, now) {
            const result = insertInterview.run(input.applicationId ?? null, input.jobId ?? null, input.round ?? 1, input.at, input.tz ?? 'Asia/Shanghai', input.place ?? null, input.link ?? null, input.contact ?? null, input.kind ?? 'video', input.commuteMin ?? null, now, now);
            return toInterview(selectInterview.get(asId(result.lastInsertRowid)));
        },
        updateInterview(id, patch, now) {
            const current = selectInterview.get(id);
            if (current === undefined)
                return undefined;
            const record = toInterview(current);
            const next = {
                round: patch.round ?? record.round,
                at: patch.at ?? record.at,
                state: patch.state ?? record.state,
                place: patch.place === undefined ? record.place : patch.place,
                link: patch.link === undefined ? record.link : patch.link,
                contact: patch.contact === undefined ? record.contact : patch.contact,
                kind: patch.kind ?? record.kind,
                commuteMin: patch.commuteMin === undefined ? record.commuteMin : patch.commuteMin,
                review: patch.review ?? record.review,
            };
            db.prepare(`UPDATE interview SET round = ?, at = ?, state = ?, place = ?, link = ?, contact = ?, kind = ?,
           commute_min = ?, review_json = ?, updated_at = ? WHERE id = ?`).run(next.round, next.at, next.state, next.place, next.link, next.contact, next.kind, next.commuteMin, JSON.stringify(next.review), now, id);
            return getInterviewOrThrow(id);
        },
        getInterview(id) {
            const row = selectInterview.get(id);
            return row === undefined ? undefined : toInterview(row);
        },
        listInterviews(filter = {}) {
            const limit = filter.limit ?? 200;
            const rows = (filter.from !== undefined && filter.to !== undefined
                ? selectInterviewsWindow.all(filter.from, filter.to, limit)
                : filter.jobId !== undefined
                    ? selectInterviewsByJob.all(filter.jobId, limit)
                    : filter.state !== undefined
                        ? selectInterviewsByState.all(filter.state, limit)
                        : selectInterviewsAll.all(limit));
            return rows.map(toInterview);
        },
        removeInterview(id) {
            return Number(deleteInterview.run(id).changes) > 0;
        },
        // ── 错题本 ───────────────────────────────────────────────────
        upsertQuestionNote(input, now) {
            const topic = input.topic ?? '';
            const existing = selectQuestionByText.get(input.question, topic);
            if (existing !== undefined) {
                const record = toQuestionNote(existing);
                bumpQuestion.run(input.myAnswer ?? record.myAnswer, input.betterAnswer ?? record.betterAnswer, input.companyId ?? null, now, record.id);
                return toQuestionNote(selectQuestion.get(record.id));
            }
            const result = insertQuestionNote.run(input.question, input.myAnswer ?? '', input.betterAnswer ?? '', topic, input.companyId ?? null, input.interviewId ?? null, now, now);
            return toQuestionNote(selectQuestion.get(asId(result.lastInsertRowid)));
        },
        listQuestionNotes(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.topic !== undefined
                ? selectQuestionsByTopic.all(filter.topic, limit)
                : filter.companyId !== undefined
                    ? selectQuestionsByCompany.all(filter.companyId, limit)
                    : selectQuestionsAll.all(limit));
            return rows.map(toQuestionNote);
        },
        getQuestionNote(id) {
            const row = selectQuestion.get(id);
            return row === undefined ? undefined : toQuestionNote(row);
        },
        updateQuestionNote(id, patch, now) {
            const current = this.getQuestionNote(id);
            if (current === undefined)
                return undefined;
            updateQuestion.run(patch.question ?? current.question, patch.myAnswer ?? current.myAnswer, patch.betterAnswer ?? current.betterAnswer, patch.topic ?? current.topic, patch.companyId === undefined ? current.companyId : patch.companyId, patch.interviewId === undefined ? current.interviewId : patch.interviewId, now, id);
            return toQuestionNote(selectQuestion.get(id));
        },
        removeQuestionNote(id) {
            return Number(deleteQuestion.run(id).changes) > 0;
        },
    };
}
//# sourceMappingURL=pipeline.js.map