import type { DatabaseSync } from 'node:sqlite';
/**
 * 审计表（§4.4.3 / §4.1 审计表隐私策略）。
 *
 * **铁律：审计只存字段摘要与长度，涉敏正文不入表。**
 * 话术全文、简历全文这类内容如果原样写进审计，审计表自己就成了隐私黑洞 ——
 * 而审计的保留期通常比业务数据长得多。
 * 所以 `detail` 走 `summarize()` 收口，只留"有哪些字段、各多长、哈希前 8 位"。
 */
export interface AuditRecord {
    id: number;
    at: string;
    actor: string;
    action: string;
    target: Record<string, unknown>;
    detail: Record<string, unknown>;
    result: string;
    reason: string | null;
    approval: unknown;
    durationMs: number | null;
}
export interface AuditInput {
    actor: string;
    action: string;
    target?: Record<string, unknown>;
    detail?: unknown;
    result: 'ok' | 'denied' | 'error';
    reason?: string | null;
    approval?: unknown;
    durationMs?: number | null;
}
/**
 * 把任意载荷压缩成"字段摘要 + 长度"。
 *
 * - 字符串：`{ length, preview }`，敏感字段不保留 preview；
 * - 数组：`{ count, sample }`（sample 最多 3 项）；
 * - 对象：递归一层，深了就只记 `{ keys }`。
 */
export declare function summarize(value: unknown, depth?: number, keyHint?: string): unknown;
export interface AuditRepo {
    write(input: AuditInput, now: string): number;
    list(limit: number, filter?: {
        actor?: string;
        action?: string;
    }): AuditRecord[];
    /**
     * 统计某个动作在某时刻之后成功了多少次 —— 额度的计数来源。
     * 用审计表而不是另建计数器：审计表本来就是"今天做过什么"的事实来源，
     * 另建计数器只会多一处可能与事实不一致的状态。
     */
    countByAction(action: string, sinceIso: string, onlyOk?: boolean, platformId?: string): number;
    count(): number;
}
export declare function createAuditRepo(db: DatabaseSync): AuditRepo;
//# sourceMappingURL=audit.d.ts.map