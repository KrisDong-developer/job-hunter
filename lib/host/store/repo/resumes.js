import { inspectResume, normalizeResumeContent } from '../../../shared/resume.js';
import { asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
function toRecord(row) {
    return {
        id: asInt(row['id']),
        name: asText(row['name']),
        direction: asText(row['direction']),
        language: asText(row['language'], 'zh'),
        content: normalizeResumeContent(asJson(row['content_json'], {})),
        state: asText(row['state'], 'active'),
        isDefault: asInt(row['is_default'], 0) !== 0,
        rev: asInt(row['rev'], 1),
        createdAt: asText(row['created_at']),
        updatedAt: asText(row['updated_at']),
    };
}
export function createResumeRepo(db) {
    const selectAll = db.prepare('SELECT * FROM resume ORDER BY is_default DESC, updated_at DESC');
    const selectActive = db.prepare("SELECT * FROM resume WHERE state = 'active' ORDER BY is_default DESC, updated_at DESC");
    const selectOne = db.prepare('SELECT * FROM resume WHERE id = ?');
    const selectDefault = db.prepare('SELECT * FROM resume WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1');
    const insertResume = db.prepare(`INSERT INTO resume (name, direction, language, content_json, state, is_default, rev, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    const updateResume = db.prepare(`UPDATE resume SET name = ?, direction = ?, language = ?, content_json = ?, state = ?, is_default = ?, rev = ?, updated_at = ?
     WHERE id = ?`);
    const bumpRev = db.prepare('UPDATE resume SET rev = rev + 1, updated_at = ? WHERE id = ?');
    const clearDefault = db.prepare('UPDATE resume SET is_default = 0 WHERE is_default = 1');
    const setDefaultStmt = db.prepare('UPDATE resume SET is_default = 1, updated_at = ? WHERE id = ?');
    const delResume = db.prepare('DELETE FROM resume WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM resume');
    const insertFile = db.prepare(`INSERT INTO resume_file (resume_id, format, template, path, bytes, file_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const selectFiles = db.prepare('SELECT * FROM resume_file WHERE resume_id = ? ORDER BY id DESC');
    const selectFile = db.prepare('SELECT * FROM resume_file WHERE id = ?');
    const deleteFile = db.prepare('DELETE FROM resume_file WHERE id = ?');
    const countFilesStmt = db.prepare('SELECT count(*) AS n FROM resume_file WHERE resume_id = ?');
    const toFile = (row) => ({
        id: asInt(row['id']),
        resumeId: asInt(row['resume_id']),
        format: asText(row['format']),
        template: asText(row['template'], 'concise'),
        path: asText(row['path']),
        bytes: asInt(row['bytes']),
        fileName: asText(row['file_name']),
        createdAt: asText(row['created_at']),
    });
    const readOrThrow = (id) => {
        const row = selectOne.get(id);
        if (row === undefined)
            throw new Error(`resume ${String(id)} 不存在`);
        return toRecord(row);
    };
    return {
        list(options = {}) {
            const rows = (options.includeArchived === false || options.state === 'active'
                ? selectActive.all()
                : selectAll.all());
            return rows.map(toRecord);
        },
        get(id) {
            const row = selectOne.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        create(input, now) {
            const name = input.name.trim() === '' ? '新简历' : input.name.trim();
            const result = insertResume.run(name, input.direction ?? '', input.language ?? 'zh', JSON.stringify(input.content), input.state ?? 'active', input.isDefault === true ? 1 : 0, now, now);
            const id = asId(result.lastInsertRowid);
            if (input.isDefault === true) {
                db.prepare('UPDATE resume SET is_default = 0 WHERE id != ?').run(id);
            }
            return readOrThrow(id);
        },
        update(id, patch, now) {
            const current = readOrThrow(id);
            // 只有**内容真的变了**才递增 rev。
            // 实测踩过：早先只要请求里带了 content 就 +1，于是界面把没改过的内容原样 PATCH 回来
            // 也会让所有匹配分被判过期 —— 而"分数动不动就失效"会让用户干脆不看那个提示。
            const nextContent = patch.content ?? current.content;
            const contentChanged = patch.content !== undefined && JSON.stringify(patch.content) !== JSON.stringify(current.content);
            updateResume.run(patch.name ?? current.name, patch.direction ?? current.direction, patch.language ?? current.language, JSON.stringify(nextContent), patch.state ?? current.state, patch.isDefault === undefined ? (current.isDefault ? 1 : 0) : patch.isDefault ? 1 : 0, contentChanged ? current.rev + 1 : current.rev, now, id);
            if (patch.isDefault === true) {
                db.prepare('UPDATE resume SET is_default = 0 WHERE id != ?').run(id);
            }
            return readOrThrow(id);
        },
        remove(id) {
            return delResume.run(id).changes > 0;
        },
        setDefault(id, now) {
            readOrThrow(id);
            clearDefault.run();
            setDefaultStmt.run(now, id);
            return readOrThrow(id);
        },
        defaultResume() {
            const row = selectDefault.get();
            return row === undefined ? undefined : toRecord(row);
        },
        summaries(options = {}) {
            const records = this.list(options);
            return records.map((record) => ({
                id: record.id,
                name: record.name,
                direction: record.direction,
                language: record.language,
                state: record.state,
                isDefault: record.isDefault,
                rev: record.rev,
                updatedAt: record.updatedAt,
                counts: {
                    skills: record.content.skills.length,
                    experiences: record.content.experiences.length,
                    projects: record.content.projects.length,
                    education: record.content.education.length,
                    files: this.countFiles(record.id),
                },
                issues: inspectResume(record.content).length,
            }));
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
        addFile(input, now) {
            const result = insertFile.run(input.resumeId, input.format, input.template, input.path, input.bytes, input.fileName, now);
            return toFile(selectFile.get(asId(result.lastInsertRowid)));
        },
        listFiles(resumeId) {
            return selectFiles.all(resumeId).map(toFile);
        },
        getFile(fileId) {
            const row = selectFile.get(fileId);
            return row === undefined ? undefined : toFile(row);
        },
        removeFile(fileId) {
            return deleteFile.run(fileId).changes > 0;
        },
        countFiles(resumeId) {
            const row = countFilesStmt.get(resumeId);
            return asInt(row?.['n']);
        },
        revision() {
            const current = this.defaultResume();
            return current === undefined
                ? { resumeId: null, rev: 0 }
                : { resumeId: current.id, rev: current.rev };
        },
    };
}
/** 把仓储记录转成对外 DTO（补上附件列表与定制数）。 */
export function toResumeDto(record, files, tailoringCount) {
    return {
        id: record.id,
        name: record.name,
        direction: record.direction,
        language: record.language,
        state: record.state,
        isDefault: record.isDefault,
        content: record.content,
        rev: record.rev,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        files,
        tailoringCount,
    };
}
export { asTextOrNull };
//# sourceMappingURL=resumes.js.map