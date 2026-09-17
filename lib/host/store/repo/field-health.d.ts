import type { DatabaseSync } from 'node:sqlite';
import type { CoreField } from '../../../shared/enums.js';
/** 一个核心字段的健康计数（§4.2.4）。 */
export interface FieldHealthRecord {
    field: CoreField;
    consecutiveMiss: number;
    missTotal: number;
    hitTotal: number;
    lastMissAt: string | null;
    lastHitAt: string | null;
}
export interface FieldHealthRepo {
    list(platformId: string): FieldHealthRecord[];
    /** 本轮该字段有命中：连续缺失清零。 */
    recordHit(platformId: string, field: CoreField, now: string): void;
    /** 本轮该字段整页都没解析出来：连续缺失 +1。@returns 新的连续缺失次数 */
    recordMiss(platformId: string, field: CoreField, now: string): number;
    /** 修好选择器并重放成功后调用：把该平台所有字段计数清零。 */
    reset(platformId: string): void;
}
export declare function createFieldHealthRepo(db: DatabaseSync): FieldHealthRepo;
//# sourceMappingURL=field-health.d.ts.map