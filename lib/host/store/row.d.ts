/**
 * sqlite 行值的安全读取。
 *
 * `node:sqlite` 的返回值类型是 `null | number | bigint | string | Uint8Array`，
 * 直接当 string/number 用会到处是断言。这里集中收敛，顺便把 bigint 归一成 number。
 */
/** 一行结果。 */
export type Row = Record<string, SqlValue>;
export type SqlValue = null | number | bigint | string | Uint8Array;
export declare function asText(value: SqlValue | undefined, fallback?: string): string;
export declare function asTextOrNull(value: SqlValue | undefined): string | null;
export declare function asInt(value: SqlValue | undefined, fallback?: number): number;
export declare function asIntOrNull(value: SqlValue | undefined): number | null;
export declare function asRealOrNull(value: SqlValue | undefined): number | null;
export declare function asReal(value: SqlValue | undefined, fallback?: number): number;
export declare function asBool(value: SqlValue | undefined, fallback?: boolean): boolean;
/** 解析 JSON 列；坏数据一律退化为 fallback，绝不让一条脏 JSON 打断查询。 */
export declare function asJson<T>(value: SqlValue | undefined, fallback: T): T;
/** 把 number | bigint 的 lastInsertRowid 归一成 number。 */
export declare function asId(value: number | bigint): number;
//# sourceMappingURL=row.d.ts.map