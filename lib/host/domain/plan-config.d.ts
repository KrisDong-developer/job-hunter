import type { CriteriaDimensionDto, PlanDto, PlanPlatformOverrideDto, PlanPostProcess, PlanSchedule } from '../../shared/contract/dto/plan.js';
import type { AdapterRegistry } from '../platform/registry.js';
import type { SearchCriteria } from '../platform/types.js';
export interface PlanConfigInput {
    name?: string;
    platforms?: string[];
    /**
     * 多关键词（逐个采集，方案级）。非空时 `criteria.keyword` 被忽略并从结果里剔除 ——
     * **单一事实源**：两处都写只会让"到底按哪个跑"变成悬案。
     */
    keywords?: string[];
    /** 每平台的覆盖项（稀疏）。 */
    platformOverrides?: Record<string, Partial<PlanPlatformOverrideDto>>;
    criteria?: Record<string, string>;
    schedule?: Partial<PlanSchedule>;
    enabled?: boolean;
    postProcess?: Partial<PlanPostProcess>;
}
export interface PlanValidationContext {
    registry: AdapterRegistry;
    /** 编辑已有方案时传它的 id，用于把"自己"从重复检测里排除。 */
    selfId?: number;
    /** 现有方案（重复检测用）。 */
    existing?: PlanDto[];
}
export interface ValidatedPlanConfig {
    name: string;
    platforms: string[];
    /** 收敛后的多关键词（trim/去重；空 = 老形态，按 criteria.keyword 跑一趟）。 */
    keywords: string[];
    /** 收敛后的每平台覆盖项（稀疏：等于默认的条目不在里面）。 */
    platformOverrides: Record<string, PlanPlatformOverrideDto>;
    criteria: Record<string, string>;
    schedule: PlanSchedule;
    enabled: boolean;
    postProcess: PlanPostProcess;
    /** SR-42：被忽略的键（本版一律报错，所以只会是空数组；留着是为了将来改成"忽略"时不用改签名）。 */
    ignoredKeys: string[];
    /** SR-43：与哪些方案重复（只看，不合并）。 */
    duplicates: Array<{
        planId: number;
        name: string;
        reason: string;
    }>;
    /**
     * **非致命**但用户必须知道的事（多平台相关）。
     *
     * 为什么值得一个专门的通道：它们对应的失败形态都是"平台安静地返回 0 条"，
     * 从数据里根本查不出来（0 条与 0 条长得一样）。报错太严（用户没法同时选
     * 能力不同的平台），不报又必然有人踩 —— 所以走"提示但不阻断"。
     */
    notices: string[];
}
/**
 * 把 `Record<string,string>` 归一成适配器认识的 `SearchCriteria`。
 *
 * 数值维度在这里转型：`'3'` → `3`。转不动就报错 —— 静默当成 0 会让
 * "页数上限设成 abc"变成"只抓 1 页"，而用户以为自己改了配置。
 */
export declare function criteriaToSearchCriteria(criteria: Record<string, string>): SearchCriteria;
/**
 * 校验一份方案配置。**不写库**，只回答"这份配置合法吗、和谁重复"。
 *
 * @throws DomainError('INVALID_INPUT') 平台未注册 / 条件键未声明 / 取值越域
 */
export declare function validatePlanConfig(input: PlanConfigInput, context: PlanValidationContext): ValidatedPlanConfig;
/** 条件是否等价（比较前先排序键，避免键顺序造成假不等）。 */
export declare function sameCriteria(a: Record<string, string>, b: Record<string, string>): boolean;
/**
 * 给界面用的一份"这个平台能筛什么"的快照（SR-41）。
 *
 * 形状的权威定义在 `shared/contract/dto/plan.ts` —— 宿主生产、界面消费，
 * 声明只能有一份（这里曾经另写了一遍同名同字段的接口）。
 */
/** 所有可能出现的维度键（用于"不支持"的维度也出现在界面上并解释原因）。 */
/**
 * 所有可能出现的维度键（用于"不支持"的维度也出现在界面上并解释原因）。
 *
 * ⚠️ 这是**固定槽位表**，不是"全部维度" —— 适配器自己声明的新维度由
 * `criteriaDimensionsFor` 的 `supported.keys()` 自动并进来（见下方 `keys`）。
 * 列在这里的键会**对每个平台都出现**（不支持的显示为禁用 + 原因），
 * 所以只列"跨平台都说得通"的几个：关键词 / 城市 / 排序 / 时间 / 页数，
 * 以及神仙外企引入的工作经验 / 学历 / 职位范围。
 */
export declare const ALL_DIMENSION_KEYS: readonly ["keyword", "city", "workExp", "education", "type", "sort", "postedWithinDays", "maxPages"];
export declare function criteriaDimensionsFor(registry: AdapterRegistry, platforms: string[]): CriteriaDimensionDto[];
//# sourceMappingURL=plan-config.d.ts.map