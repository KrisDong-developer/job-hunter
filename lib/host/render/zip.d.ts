export interface ZipEntry {
    name: string;
    data: Buffer;
}
/**
 * 打一个 ZIP（只支持 deflate，够用）。
 *
 * 结构严格按 PKWARE APPNOTE：local file header → 压缩数据 → 中央目录 → EOCD。
 *
 * 刻意**不写目录项**（`word/`、`csv/` 这类）：中央目录里没有它们，解压端也会按名字建目录，
 * 少几个条目就少几处可以写错的地方。
 */
export declare function buildZip(entries: readonly ZipEntry[]): Uint8Array;
//# sourceMappingURL=zip.d.ts.map