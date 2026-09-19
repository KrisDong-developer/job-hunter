/**
 * storage 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
/**
 * 保留策略（§18.2 分层保留 / §15）。
 *
 * 所有字段都是**天**，`0` = 永不自动清理。默认值来自 `RETENTION_DEFAULTS`。
 */
export interface RetentionPolicy {
    crawlRunsDays: number;
    auditLogDays: number;
    /** §18.2 定的是「长期」，所以默认 0；用户也可以给它一个期限。 */
    llmCallsDays: number;
    pendingRepairDays: number;
    /** JD 纯文本：清的是 `job.jd_text` / `jd_summary` **字段**，不删岗位行。 */
    jdTextDays: number;
    /** 岗位结构化数据；只有"从没被碰过"的才会被删（见 `store/cleanup.ts`）。 */
    jobsDays: number;
    /** 定时清理（默认关，见 `RETENTION_AUTO_CLEAN_DEFAULT` 的理由）。 */
    autoCleanEnabled: boolean;
}
/** 存储占用的一行（按表，`dbstat` 的真实分页大小）。 */
export interface StorageTableDto {
    table: string;
    bytes: number;
    rows: number;
}
/** 一种保留类型的现状（行数与占用）。 */
export interface StorageTypeDto {
    id: string;
    label: string;
    /** 当前库里符合"该类型"的行数。 */
    rows: number;
    /** 该类型所占字节（按所在表的真实分页大小均摊，估算）。 */
    bytes: number;
    /** 是否参与自动清理；`false` = 长期保留（用户资产）。 */
    auto: boolean;
    /** 当前保留天数（0 = 永久）。长期保留的类型固定为 0。 */
    retentionDays: number;
    /** 一句话说明它是什么 —— 尤其长期保留的，要说清为什么留。 */
    note: string;
}
/** `GET /maintenance/storage`（§18.3 P3：磁盘占用可视化）。 */
export interface StorageUsageDto {
    generatedAt: string;
    dataDir: string;
    /** 主库文件与 WAL 的**实际**大小（`fs.stat`，不是估算）。 */
    db: {
        path: string;
        bytes: number;
        walBytes: number;
    };
    /** 附件目录（`files/`）的实际占用。 */
    attachments: {
        dir: string;
        fileCount: number;
        bytes: number;
    };
    /** 导出归档目录（`exports/`）；不存在时全 0。 */
    exports: {
        dir: string;
        fileCount: number;
        bytes: number;
    };
    /** 按表的真实占用，从大到小。 */
    tables: StorageTableDto[];
    /** 按保留类型的现状。 */
    types: StorageTypeDto[];
    /**
     * 口径说明必须随响应下发：`tables` 是真实分页大小，`types` 是均摊估算，
     * 两者不能相加（同一张表可能被多个类型共用）。
     */
    note: string;
}
/** 清理预览里的一条（§18.3 P2：**清理前预览**，P0）。 */
export interface CleanupPlanItemDto {
    id: string;
    label: string;
    /** 将删除的行数（`mode='clear-column'` 时是"将被置空的字段所在行数"）。 */
    rows: number;
    /** 预计释放的字节。 */
    bytes: number;
    /** 为什么会清它（人话，含"多少条早于多少天前"）。 */
    reason: string;
    /** 清它会失去什么 —— 逐条说清，用户据此判断要不要勾上。 */
    describe: string;
    /** 真正会被执行吗。`false` = 保留期为 0（永久保留）或这类数据当前不产生。 */
    willRun: boolean;
}
/**
 * `POST /maintenance/cleanup/preview`。
 *
 * **只读、无副作用** —— 它必须能被反复调用而不改变任何东西（否则"预览"这个词就是假的）。
 */
export interface CleanupPlanDto {
    generatedAt: string;
    items: CleanupPlanItemDto[];
    totalRows: number;
    totalBytes: number;
    /** 清理前的 db 文件大小（真实）。 */
    dbBytesBefore: number;
    /** 预计清理后的 db 大小（估算：`dbBytesBefore − totalBytes`，下限为 0）。 */
    dbBytesAfterEstimate: number;
    /** §18.1/R16：删完必须 VACUUM 才会真的变小，这句话要如实说。 */
    note: string;
}
/** `POST /maintenance/cleanup` 的执行结果。 */
export interface CleanupResultDto {
    executedAt: string;
    items: Array<{
        id: string;
        label: string;
        rows: number;
        bytes: number;
    }>;
    totalRows: number;
    /** VACUUM 前后的**真实**文件大小 —— 这一格就是"清理有没有用"的证据。 */
    dbBytesBefore: number;
    dbBytesAfter: number;
    vacuumed: boolean;
    note: string;
}
/**
 * 归档里的一份文件（供界面与工具说明"导出里有什么"，不用于传输）。
 */
export interface DataExportEntryDto {
    name: string;
    bytes: number;
    rows: number | null;
}
/** `POST /data/import` 的结果。 */
export interface DataImportResultDto {
    format: 'csv' | 'json';
    /** 解析出多少行（含被跳过的）。 */
    received: number;
    inserted: number;
    updated: number;
    skipped: number;
    /**
     * 逐行错误（**最多 20 条**）。不静默吞掉：导入最怕"看起来成功了，
     * 其实 30 行没进来"，用户拿着残表去投递会比报错糟得多。
     */
    errors: Array<{
        row: number;
        message: string;
    }>;
    /** 被截断的错误条数（>0 时说明还有更多）。 */
    moreErrors: number;
    note: string;
}
//# sourceMappingURL=storage.d.ts.map