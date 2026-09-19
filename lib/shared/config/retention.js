/**
 * 数据保留与清理（§18）。
 */
/**
 * retention 相关常量（host 与 client 共享）。只放标量，不放运行时对象（§4.3）。
 */
// 数据保留与清理（§18）
/** 保留策略在 `setting` 表里的键（`scope='global'`、`scope_ref=''`）。 */
export const RETENTION_KEY = 'retentionPolicy';
/**
 * 各数据类型的默认保留天数（§18.2 分层保留）。
 *
 * `0` = **永不自动清理**。几条刻意的取值：
 *   * 岗位结构化数据 730 天（24 个月）——§18.2 的原值。但删岗位有条件：
 *     只有"从没被碰过"的才会被删（见 `store/cleanup.ts` 的 NOT EXISTS 条件），
 *     因为 `application` / `greeting` / `message` / `interview` / `tailoring` 的外键是
 *     **SET NULL** —— 删掉父行会把用户资产变成孤儿，那比占空间糟得多。
 *   * 投递 / 打招呼 / 消息记录 = 0：它们是归因与复盘的核心，也是用户自己的资产（§18.2「长期」）。
 *   * 简历与附件不在本表 —— 它们**只能由用户显式删除**（`/files/:id`），绝不进自动清理。
 */
export const RETENTION_DEFAULTS = {
    crawlRunsDays: 30,
    auditLogDays: 365,
    /** 模型调用留痕：§18.2 定的是「长期」，所以默认 0（永久）。 */
    llmCallsDays: 0,
    pendingRepairDays: 30,
    /** JD 纯文本：体积大头，中保留（§18.2）。清的是**字段**，不删岗位行。 */
    jdTextDays: 180,
    jobsDays: 730,
};
/** `0` 是合法值（= 永久保留），但负数与超大值不是。 */
export const RETENTION_MIN_DAYS = 0;
export const RETENTION_MAX_DAYS = 3_650;
/**
 * 定时清理**默认关闭**。
 *
 * §18.3 的 P1 只要求"可关闭"，没说默认开。默认关的理由是删除不可逆，
 * 而当前实现**不存原始 HTML/截图**（§18.1 估算出的"几十 GB"在实现里并不存在），
 * 所以磁盘压力远小于文档假设 —— 让用户先手动跑一次预览、看清要删什么再打开。
 */
export const RETENTION_AUTO_CLEAN_DEFAULT = false;
/** 导出归档落盘的子目录名（`<dataDir>/exports`）。也是模型工具唯一允许读写的目录。 */
export const EXPORTS_DIR_NAME = 'exports';
//# sourceMappingURL=retention.js.map