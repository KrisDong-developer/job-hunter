import type { DatabaseSync } from 'node:sqlite';
import type { PlanDto, PlanSchedule } from '../../../shared/dto.js';
/** 默认定时：工作日 09:30 那一轮，抖动 10 分钟。 */
export declare const DEFAULT_SCHEDULE: PlanSchedule;
export interface PlanUpsertInput {
    name: string;
    platforms: string[];
    criteria?: Record<string, string>;
    schedule?: Partial<PlanSchedule>;
    enabled?: boolean;
}
export interface PlanRepo {
    create(input: PlanUpsertInput, now: string): PlanDto;
    update(id: number, patch: Partial<PlanUpsertInput>, now: string): PlanDto;
    get(id: number): PlanDto | undefined;
    list(): PlanDto[];
    remove(id: number): boolean;
    /** 定时器算完下一轮之后回写。 */
    setRunTimes(id: number, times: {
        lastRunAt?: string | null;
        nextRunAt?: string | null;
    }): void;
    count(): number;
}
/** 把外部传进来的 schedule 收敛成合法值 —— 定时配置坏掉会静默不跑，必须拦住。 */
export declare function normalizeSchedule(patch: Partial<PlanSchedule> | undefined, base?: PlanSchedule): PlanSchedule;
export declare function createPlanRepo(db: DatabaseSync): PlanRepo;
//# sourceMappingURL=plans.d.ts.map