/**
 * 简历（P6 / A3 / R9）相关端点：`/resumes` 系列 —— 列表（GET /resumes）、新建（POST /resumes）、
 * **导入（POST /resumes/import：粘贴文本 → 结构化）**、单条（GET /resumes/:id）、
 * 更新（PATCH /resumes/:id）、删除（DELETE /resumes/:id）、复制（POST /resumes/:id/duplicate）、
 * 设为默认（POST /resumes/:id/default）、预览（GET /resumes/:id/preview，返回 bytes）、
 * 导出（POST /resumes/:id/export）、**上传自有附件（POST /resumes/:id/files）**；
 * 附件下载/删除（/files/:id）；简历定制（POST /resume/tailor）与定制记录（/tailorings）。
 */
import { RESUME_FORMATS, RESUME_LANGUAGES, RESUME_STATES, RESUME_TEMPLATES } from '../../../shared/contract/enums/resume.js';
import { normalizeResumeContent } from '../../../shared/domain/resume-content.js';
import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, parseRecordId, readObject, requireData } from './kit.js';
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
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'resumes'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
    const includeArchived = req.query.get('archived') !== '0';
    return json(200, { items: service.list({ includeArchived }) });
}
export async function create(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 1 && segments[0] === 'resumes'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
    const body = await readObject(req);
    return json(201, { ok: true, resume: service.create(resumeWriteOf(body)) });
}
export async function get(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'resumes'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    const resume = service.get(resumeId);
    return json(200, { ...resume, issues: service.inspect(resumeId) });
}
/**
 * `POST /resumes/import` —— 把粘贴的简历文本解析成结构化（A3）。
 *
 * ## 为什么收的是**文本**而不是文件
 *
 * 本仓库没有 PDF/DOCX 解析库。硬写一个"看起来能跑"的解析器，结果是**脏数据进简历库**
 * ——而那正是本仓库最不愿写进去的东西（宁可不做，也不写错的）。
 * 用户从 PDF / Word 里选中复制再粘进来即可（两者都能复制文本）；
 * 想把 PDF 原样存档就调 `POST /resumes/:id/files`。
 *
 * ## 为什么 200 与 201 都可能
 *
 * `save: false` 时只解析、不落库（返回 200）——那是"先看看解析成什么样"的用法；
 * 落库成功返回 201，与其他创建类端点一致。
 */
export async function importResume(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'resumes' && segments[1] === 'import')) {
        return undefined;
    }
    requireData(runtime);
    const body = await readObject(req);
    const text = body['text'];
    if (typeof text !== 'string') {
        throw new DomainError('INVALID_INPUT', 'text 必填（把简历正文粘贴进来）', {
            hint: '从 PDF / Word 里选中正文复制再粘进来。本工具**不解析 PDF/DOCX 字节** —— ' +
                '扫描件先转成可复制的文本，或者用 POST /resumes/:id/files 把原文件存成附件。',
        });
    }
    const language = body['language'];
    const result = await runtime.resumes().importResume({
        text,
        ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
        ...(typeof body['direction'] === 'string' ? { direction: body['direction'] } : {}),
        ...(typeof language === 'string' && RESUME_LANGUAGES.includes(language)
            ? { language: language }
            : {}),
        ...(typeof body['save'] === 'boolean' ? { save: body['save'] } : {}),
        ...(typeof body['useLlm'] === 'boolean' ? { useLlm: body['useLlm'] } : {}),
    });
    if (result.resume !== null) {
        runtime.events().publish('resume.imported', {
            id: result.resume.id,
            via: result.via,
            issues: result.issues.length,
        });
    }
    return json(result.resume === null ? 200 : 201, { ok: true, ...result });
}
/**
 * `POST /resumes/:id/files` —— 上传用户**自己的** PDF / DOCX 作为附件（R9 / D7）。
 *
 * 形状（`fileName` + `contentBase64`）是刻意的：
 *   * 不收**路径**——路径会让"上传"变成"读宿主任意文件"，与本仓库
 *     `system/reveal` 不收路径是同一条纪律；
 *   * 体积与文件头校验在**领域层**（`uploadFile`），这一层只做类型检查 ——
 *     这样界面、工具与 HTTP 三条入口过的是同一套判断。
 */
export async function uploadFile(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'files')) {
        return undefined;
    }
    requireData(runtime);
    const resumeId = parseRecordId(segments[1] ?? null, '简历');
    const body = await readObject(req);
    const fileName = body['fileName'];
    const contentBase64 = body['contentBase64'];
    if (typeof fileName !== 'string' || fileName.trim() === '') {
        throw new DomainError('INVALID_INPUT', 'fileName 必填（附件的文件名，用于 HR 那一侧显示）');
    }
    if (typeof contentBase64 !== 'string' || contentBase64.trim() === '') {
        throw new DomainError('INVALID_INPUT', 'contentBase64 必填', {
            hint: '把文件读成纯 base64（不带 data: 前缀）放进这个字段。',
        });
    }
    const file = runtime.resumes().uploadFile(resumeId, {
        fileName,
        contentBase64,
        ...(typeof body['format'] === 'string' ? { format: body['format'] } : {}),
    });
    runtime.events().publish('resume.file.uploaded', {
        resumeId,
        fileId: file.id,
        format: file.format,
        bytes: file.bytes,
    });
    return json(201, { ok: true, file });
}
export async function patch(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'resumes'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    return json(200, { ok: true, resume: service.update(resumeId, resumePatchOf(body)) });
}
export async function remove(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'resumes'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    if (!service.remove(resumeId)) {
        throw new DomainError('NOT_FOUND', `简历不存在：${String(resumeId)}`);
    }
    return json(200, { ok: true });
}
export async function duplicate(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'duplicate')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    const name = typeof body['name'] === 'string' ? body['name'] : undefined;
    return json(201, { ok: true, resume: service.duplicate(resumeId, name) });
}
export async function setDefault(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'default')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    return json(200, { ok: true, resume: service.setDefault(resumeId) });
}
export async function preview(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'preview')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
    // 预览：直接吐 HTML，界面用 iframe 打开就是所见即所得
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
/** `export` 是保留字、不能当函数名 —— 所以导出名是 `exportResume`，路由表里也写这个名字。 */
export async function exportResume(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'export')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.resumes();
    const resumeId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(resumeId)) {
        throw new DomainError('INVALID_INPUT', `非法简历 id：${segments[1] ?? ''}`);
    }
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
export async function files(ctx) {
    const { runtime, segments, method } = ctx;
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
    return undefined;
}
export async function tailor(ctx) {
    const { runtime, req, segments, method } = ctx;
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
    return undefined;
}
export async function tailoringsList(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'tailorings'))
        return undefined;
    requireData(runtime);
    const service = runtime.resumes();
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
export async function tailoringsAdopt(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'tailorings' && segments[2] === 'adopt')) {
        return undefined;
    }
    requireData(runtime);
    const service = runtime.resumes();
    const tailoringId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(tailoringId)) {
        throw new DomainError('INVALID_INPUT', `非法定制 id：${segments[1] ?? ''}`);
    }
    const body = await readObject(req);
    const adopted = body['adopted'] !== false;
    return json(200, { ok: true, tailoring: service.adopt(tailoringId, adopted) });
}
//# sourceMappingURL=resumes.js.map