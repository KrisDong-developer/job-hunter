/**
 * 搜索方案领域服务（§4.3）。
 *
 * 方案 = 抓什么（平台 + 条件 + 抓取深度）+ 什么时候抓（`PlanSchedule`）+ 抓完做什么（后处理）。
 *
 * ## 两条不变量
 *
 * 1. **写入前一律校验** —— 定时配置坏掉会**静默不跑**，筛选条件坏掉会**静默不筛**，
 *    两种都是"用户以为自己配好了"的坑。所以这里统一走 `validatePlanConfig`（SR-45）：
 *    GUI / 模型工具 / HTTP 三条入口共用**同一份**校验，报错完全一致。
 * 2. **重复方案只提示，不合并**（SR-43）—— 合并会替用户抹掉他的两个意图。
 */
import type { PlanDto, PlanPostProcess, PlanSchedule } from '../../shared/contract/dto/plan.js';
import type { PlanRepo, PlanUpsertInput } from '../store/repo/plans.js';
import type { Store } from '../store/store.js';
import type { AdapterRegistry } from '../platform/registry.js';
import type { Clock } from '../util/time.js';
import type { CriteriaDimensionDto } from '../../shared/contract/dto/plan.js';
import { type PlanConfigInput, type ValidatedPlanConfig } from './plan-config.js';
/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export declare function defaultPlanInput(): PlanUpsertInput;
/** `validate()` 的结果：多一个"和谁重复"的提示，供界面在保存前展示。 */
export interface PlanValidationResult extends ValidatedPlanConfig {
    dimensions: CriteriaDimensionDto[];
}
export interface PlanService {
    list(): PlanDto[];
    get(id: number): PlanDto;
    create(input: PlanConfigInput): PlanDto;
    update(id: number, patch: PlanConfigInput): PlanDto;
    remove(id: number): boolean;
    /** 完全没有方案时建一个默认方案；已有方案则返回 null。 */
    ensureDefault(): PlanDto | null;
    /**
     * 只校验、不写库（SR-43/45）。
     *
     * 界面"保存前先问一句"靠它；模型工具与 HTTP 的写入路径内部也调它 ——
     * 所以**界面能看到的错误和工具能看到的错误是同一份**。
     */
    validate(input: PlanConfigInput, selfId?: number): PlanValidationResult;
    /** SR-41：当前平台集合支持的筛选维度（界面渲染筛选器用）。 */
    dimensions(platforms: string[]): CriteriaDimensionDto[];
    /** SR-39：可选平台来自注册表。 */
    availablePlatforms(): Array<{
        id: string;
        displayName: string;
    }>;
    repo(): PlanRepo;
}
export declare function createPlanService(store: Store, clock?: Clock, registry?: AdapterRegistry): PlanService;
export type { PlanPostProcess, PlanSchedule, PlanConfigInput };
//# sourceMappingURL=plans.d.ts.map