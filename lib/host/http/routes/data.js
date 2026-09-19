/**
 * 数据可携带性路由（J8）：导出（JSON / CSV / 归档）与导入（岗位）。
 *
 * ## 为什么导出走 `kind: 'bytes'`
 *
 * 导出的东西是文件（zip / json），不是 JSON API 响应 —— 走字节流才能带上
 * `Content-Disposition`，浏览器点一下就是"下载"。界面因此不需要自己去读流、拼 Blob。
 *
 * ## 为什么导入是 `POST` 且内容在 body 里
 *
 * 与"导出"对称：导出把文件给用户，导入则要求用户把文件内容**贴进来**。
 * 内容在 body 里意味着它受传输层的 `MAX_BODY_BYTES`（64KB）约束 ——
 * 所以界面会**按行分批**（每批一个自洽的 CSV：表头 + N 行），
 * 而不是把这个安全常量悄悄调大。导入是幂等的，分批不会重复建岗位。
 *
 * ## 一处**明确不做**
 *
 * Excel 的 `.xlsx` 二进制不支持（解析它要解包 + 解析 XML，做错了会把脏数据写进岗位库）。
 * 检测到就直接拒收，并给出可执行的下一步：另存为 CSV UTF-8。见 `domain/portability.ts`。
 */
import { DATA_EXPORT_FORMATS } from '../../../shared/contract/enums/storage.js';
import { DomainError } from '../../util/errors.js';
import { json, readObject, requireData } from './kit.js';
const CONTENT_TYPES = {
    json: 'application/json; charset=utf-8',
    csv: 'application/zip',
    archive: 'application/zip',
};
function parseFormat(raw) {
    if (raw === null || raw === '')
        return 'json';
    if (DATA_EXPORT_FORMATS.includes(raw))
        return raw;
    throw new DomainError('INVALID_INPUT', `不支持的导出格式：${raw}`, {
        hint: '合法取值：json（全量备份）/ csv（分表 CSV，Excel 可读）/ archive（含简历附件的 zip）。',
    });
}
// ── GET /data/export ───────────────────────────────────────────────
export async function exportData(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'data' && segments[1] === 'export')) {
        return undefined;
    }
    requireData(runtime);
    const format = parseFormat(req.query.get('format'));
    const result = runtime.exportData(format);
    return {
        kind: 'bytes',
        status: 200,
        contentType: CONTENT_TYPES[format],
        bytes: result.bytes,
        fileName: result.fileName,
        // 导出就是用来"存下来"的，一律 attachment（inline 会让 json 在标签页里刷出几兆文本）
        disposition: 'attachment',
    };
}
// ── POST /data/import ──────────────────────────────────────────────
export async function importData(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'data' && segments[1] === 'import')) {
        return undefined;
    }
    requireData(runtime);
    const body = await readObject(req);
    const format = body['format'];
    if (format !== 'csv' && format !== 'json') {
        throw new DomainError('INVALID_INPUT', 'format 必须是 csv 或 json', {
            hint: 'CSV 是 Excel 的通用交换格式（请另存为 CSV UTF-8）；JSON 接受本插件导出的字段名。',
        });
    }
    const content = body['content'];
    if (typeof content !== 'string' || content.trim() === '') {
        throw new DomainError('INVALID_INPUT', 'content 不能为空（把文件内容贴进来）', {
            hint: '内容放在请求体里，受 64KB 上限约束 —— 大文件请按行分批（导入是幂等的）。',
        });
    }
    const result = runtime.importJobs({ format, content });
    return json(200, { ok: true, result });
}
//# sourceMappingURL=data.js.map