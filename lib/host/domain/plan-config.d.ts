/**
 * 采集方案的**唯一校验实现**（SR-45）。
 *
 * 三条入口 —— GUI（HTTP `/plans`）、模型工具（`job_plan_manage`）、HTTP —— 必须共用这一份，
 * 否则"工具与界面各塞非法条件，报错不一致"是必然的：
 * 界面拦住了、模型绕过去了，用户看到的两套规则，然后**只相信严的那一套**。
 *
 * 校验做的三件事：
 *   1. **平台必须在注册表里**（SR-39：选到不存在的平台要报可读错，不能空跑）；
 *   2. **筛选键必须被某个平台的适配器声明过**（SR-41/42）——
 *      未声明的键**显式报错**，不静默丢弃；
 *   3. **取值域受声明约束**（SR-41）：声明了 `values` 的维度只接受域内的值。
 *
 * 还有一件**不报错但要说出来**的事：重复方案（SR-43）只提示、不合并。
 */
import type { PlanDto, PlanPostProcess, PlanSchedule } from '../../shared/dto.js';
import type { AdapterRegistry } from '../platform/registry.js';
import type { SearchCriteria } from '../platform/types.js';
export interface PlanConfigInput {
    name?: string;
    platforms?: string[];
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
 * 界面据它渲染筛选器：**不支持的维度禁用而非隐藏**，并把 `hint` 显示出来
 * —— 隐藏会让用户以为功能坏了（§5.5 能力驱动的 UI）。
 */
export interface CriteriaDimensionDto {
    key: string;
    label: string;
    values: Array<{
        value: string;
        label: string;
    }>;
    max: number | null;
    hint: string;
    /** 当前方案是否支持它。false = 界面上禁用 + 说明原因。 */
    supported: boolean;
    /** 不支持的原因。 */
    disabledReason: string | null;
    /** 数值型维度（界面渲染成数字输入而不是下拉）。 */
    numeric: boolean;
}
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