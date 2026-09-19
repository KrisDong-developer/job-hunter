import type { DatabaseSync } from 'node:sqlite';
import type { HealthState } from '../../../shared/contract/enums/crawl.js';
/** 一个平台的运行记录。 */
export interface PlatformRecord {
    id: string;
    displayName: string;
    enabled: boolean;
    capabilities: unknown;
    health: HealthState;
    healthReason: string | null;
    failStreak: number;
    lastOkAt: string | null;
    createdAt: string;
}
export interface EnsurePlatformInput {
    id: string;
    displayName: string;
    capabilities?: unknown;
}
export interface PlatformRepo {
    /** 幂等登记平台；已存在时只补 display_name / capabilities，**不覆盖 enabled 与健康态**。 */
    ensure(input: EnsurePlatformInput, now: string): void;
    get(id: string): PlatformRecord | undefined;
    list(): PlatformRecord[];
    setHealth(id: string, health: HealthState, reason: string | null, now: string): void;
    /** 一次成功：清零 fail_streak、记 last_ok_at、健康态回 healthy。 */
    recordSuccess(id: string, now: string): void;
    /** 一次失败：fail_streak +1，返回新的连续失败次数。 */
    recordFailure(id: string, now: string): number;
}
export declare function createPlatformRepo(db: DatabaseSync): PlatformRepo;
//# sourceMappingURL=platforms.d.ts.map