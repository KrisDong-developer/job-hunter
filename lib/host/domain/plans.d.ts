/**
 * 搜索方案领域服务（§4.3）。
 *
 * 方案 = 抓什么（平台 + 条件）+ 什么时候抓（`PlanSchedule`）。
 * 定时配置坏掉会**静默不跑**，所以写入前一律经 `normalizeSchedule` 收敛。
 */
import type { PlanDto } from '../../shared/dto.js';
import type { PlanRepo, PlanUpsertInput } from '../store/repo/plans.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export declare function defaultPlanInput(): PlanUpsertInput;
export interface PlanService {
    list(): PlanDto[];
    get(id: number): PlanDto;
    create(input: PlanUpsertInput): PlanDto;
    update(id: number, patch: Partial<PlanUpsertInput>): PlanDto;
    remove(id: number): boolean;
    /** 完全没有方案时建一个默认方案；已有方案则返回 null。 */
    ensureDefault(): PlanDto | null;
    repo(): PlanRepo;
}
export declare function createPlanService(store: Store, clock?: Clock): PlanService;
//# sourceMappingURL=plans.d.ts.map