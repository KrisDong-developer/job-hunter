import { DomainError } from '../util/errors.js';
import { asString, enumStr, requireData, schema, str, textResult, toolDefiner } from './kit.js';
const FORMAT_HINT = 'json = 全量结构化备份；csv = 分表 CSV（Excel 可直接打开，带 BOM 不乱码）；archive = 含简历附件原文件的 zip';
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${String(bytes)} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
export function dataTools(runtime) {
    const tool = toolDefiner(runtime);
    return [
        tool({
            name: 'data_transfer',
            description: '本地求职数据的搬家与体检。四种动作：\n' +
                '· `storage` = 看磁盘占用（数据库文件 / 附件 / 按表）与各类型数据的行数。低危只读。\n' +
                '· `cleanup_preview` = **清理预览**：按保留策略算出"将删多少行、释放多少空间"。只读、无副作用。\n' +
                '· `export` = 导出到本机数据目录的 `exports/`，返回文件路径。低危。\n' +
                '· `import` = 导入岗位清单（CSV / JSON），幂等 —— 同一份表导两次只会更新。\n' +
                '⚠️ **执行清理不在这里**：删除不可撤销，只能在界面上「设置 → 数据」里由用户亲手确认。\n' +
                '⚠️ Excel 的 `.xlsx` 二进制不支持，请先另存为 CSV UTF-8。',
            parameters: schema({
                action: enumStr(['storage', 'cleanup_preview', 'export', 'import'], '要做什么'),
                format: enumStr(['json', 'csv', 'archive'], `导出格式（export 用）。${FORMAT_HINT}`),
                file: str('要导入的文件名（import 用；必须是 exports/ 目录下的文件，不接受路径）'),
                content: str('要导入的内容（import 用；CSV 或 JSON 文本，与 file 二选一）'),
                importFormat: enumStr(['csv', 'json'], '内容的格式（用 content 时必须给）'),
            }, ['action']),
            ...textResult,
            async run(args) {
                requireData(runtime);
                const action = asString(args['action']);
                if (action === 'storage') {
                    const usage = runtime.storage();
                    const lines = [
                        `数据目录：${usage.dataDir}`,
                        `数据库文件：${formatBytes(usage.db.bytes)}（WAL ${formatBytes(usage.db.walBytes)}）`,
                        `简历附件：${String(usage.attachments.fileCount)} 个文件 / ${formatBytes(usage.attachments.bytes)}`,
                        `导出目录：${String(usage.exports.fileCount)} 个文件 / ${formatBytes(usage.exports.bytes)}`,
                        '',
                        '占用最大的几张表：',
                        ...usage.tables.slice(0, 8).map((table) => `· ${table.table}：${formatBytes(table.bytes)}（${String(table.rows)} 行）`),
                        '',
                        '按类型（清理口径）：',
                        ...usage.types.map((type) => `· ${type.label}：${String(type.rows)} 行 / ${formatBytes(type.bytes)}` +
                            `（${type.auto ? (type.retentionDays <= 0 ? '永久保留' : `保留 ${String(type.retentionDays)} 天`) : '长期保留'}）`),
                        '',
                        usage.note,
                    ];
                    return { text: lines.join('\n') };
                }
                if (action === 'cleanup_preview') {
                    const plan = runtime.cleanupPreview();
                    const lines = [
                        `清理预览（${plan.generatedAt.slice(0, 16).replace('T', ' ')}）：` +
                            `共 ${String(plan.totalRows)} 行，预计释放 ${formatBytes(plan.totalBytes)}`,
                        `数据库当前 ${formatBytes(plan.dbBytesBefore)}，预计清理后约 ${formatBytes(plan.dbBytesAfterEstimate)}`,
                        '',
                        ...plan.items.map((item) => `· ${item.label}：${String(item.rows)} 行 / ${formatBytes(item.bytes)}${item.willRun ? '' : '（不执行）'}\n` +
                            `  ${item.reason}\n  ${item.describe}`),
                        '',
                        plan.note,
                        '',
                        '要真正执行，请让用户在界面上「设置 → 数据」里确认 —— 模型这一侧只提供预览。',
                    ];
                    return { text: lines.join('\n') };
                }
                if (action === 'export') {
                    const format = asString(args['format']);
                    if (format !== 'json' && format !== 'csv' && format !== 'archive') {
                        throw new DomainError('INVALID_INPUT', 'format 必须是 json / csv / archive', {
                            hint: FORMAT_HINT,
                        });
                    }
                    const saved = runtime.saveExport(format);
                    return {
                        text: [
                            `已导出到：${saved.path}`,
                            `大小：${formatBytes(saved.bytes)}`,
                            '',
                            '归档内容：',
                            ...saved.entries.slice(0, 10).map((entry) => `· ${entry.name}：${formatBytes(entry.bytes)}${entry.rows === null ? '' : `（${String(entry.rows)} 行）`}`),
                            saved.entries.length > 10 ? `· …共 ${String(saved.entries.length)} 项` : '',
                            '',
                            saved.note,
                        ]
                            .filter((line) => line !== '')
                            .join('\n'),
                    };
                }
                if (action === 'import') {
                    const file = asString(args['file']);
                    const content = asString(args['content']);
                    const formatArg = asString(args['importFormat']);
                    let payload;
                    if (content !== undefined && content.trim() !== '') {
                        if (formatArg !== 'csv' && formatArg !== 'json') {
                            throw new DomainError('INVALID_INPUT', '用 content 导入时必须给 importFormat（csv 或 json）', {
                                hint: '也可以用 file 指明 exports/ 目录下的文件名，由扩展名推断格式。',
                            });
                        }
                        payload = { format: formatArg, content };
                    }
                    else if (file !== undefined && file !== '') {
                        const text = runtime.readExportFile(file);
                        payload = { format: file.toLowerCase().endsWith('.json') ? 'json' : 'csv', content: text };
                    }
                    else {
                        throw new DomainError('INVALID_INPUT', 'import 需要 file 或 content 之一', {
                            hint: 'file = exports/ 目录下的文件名（先用 export 动作导出）；content = 直接给 CSV/JSON 文本。',
                        });
                    }
                    const result = runtime.importJobs(payload);
                    const lines = [
                        result.note,
                        `解析 ${String(result.received)} 行：新增 ${String(result.inserted)} · 更新 ${String(result.updated)} · 跳过 ${String(result.skipped)}`,
                    ];
                    if (result.errors.length > 0) {
                        lines.push('', '逐行问题：');
                        for (const error of result.errors)
                            lines.push(`· 第 ${String(error.row)} 行：${error.message}`);
                        if (result.moreErrors > 0)
                            lines.push(`· …还有 ${String(result.moreErrors)} 条未列出`);
                    }
                    return { text: lines.join('\n') };
                }
                throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`, {
                    hint: '合法取值：storage / cleanup_preview / export / import',
                });
            },
        }),
    ];
}
//# sourceMappingURL=data.js.map