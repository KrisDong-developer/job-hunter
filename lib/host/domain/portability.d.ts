import type { DataExportEntryDto, DataImportResultDto } from '../../shared/contract/dto/storage.js';
import type { DataExportFormat } from '../../shared/contract/enums/storage.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/** 导入进来的岗位挂在这个虚拟平台下（不参与抓取，只在界面上标出"手动导入"）。 */
export declare const IMPORT_PLATFORM_ID = "import";
export declare const IMPORT_PLATFORM_NAME = "\u624B\u52A8\u5BFC\u5165";
/** 行 → CSV 文本。用 CRLF：Excel 与记事本都认。 */
export declare function csvEncode(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string;
/**
 * CSV → 二维数组（RFC 4180 的子集，够用）。
 *
 * 手写而不是引依赖：要处理的就是引号、转义引号、字段内换行这三件事，
 * 而这三个恰好是"自己写容易错"的地方，所以下面有测试直接钉它们。
 */
export declare function csvParse(text: string): string[][];
export interface ExportResult {
    fileName: string;
    bytes: Uint8Array;
    /** 归档里有什么（工具与界面用它说清"这次导出拿到了什么"）。 */
    entries: DataExportEntryDto[];
    note: string;
}
/**
 * 导出。返回内存里的字节（调用方决定是回给浏览器还是写到 `exports/`）。
 */
export declare function exportData(deps: {
    store: Store;
    filesDir: string;
    format: DataExportFormat;
}, clock?: Clock): ExportResult;
export interface ImportDeps {
    store: Store;
    /** 登记公司用（与抓取路径同一个实现，避免两套归一化）。 */
    ensureCompany: (input: {
        name: string;
        industry?: string | null;
        size?: string | null;
        nature?: string | null;
    }) => number;
    /** 可选：导入后立刻算一遍匹配分与标注，让新导入的岗位与抓取来的长得一样。 */
    evaluate?: (jobId: number) => void;
}
/**
 * 导入岗位（CSV 或 JSON）。
 *
 * 幂等：同一个岗位重复导入只会更新，不会重复建行（键见 `jobInputOf`）。
 */
export declare function importJobs(deps: ImportDeps, payload: {
    format: 'csv' | 'json';
    content: string;
}, clock?: Clock): DataImportResultDto;
//# sourceMappingURL=portability.d.ts.map