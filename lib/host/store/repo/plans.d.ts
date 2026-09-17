import type { DatabaseSync } from 'node:sqlite';
import type { PlanDto, PlanPostProcess, PlanSchedule } from '../../../shared/dto.js';
import { detectTimezone } from '../../util/time.js';
/**
 * 默认排程（D-19 / SR-1）：**工作日 09:00–11:00 之间随机选点**。
 *
 * 注意这里没有"09:30"这个单点 —— SR-32 明确不提供"精确到分钟的单点时刻"。
 * 旧的"固定时刻"配置在 `normalizeSchedule` 里被翻译成等价的 1 小时窗口，
 * 所以历史数据不会失效，只是语义升级了。
 */
export declare const DEFAULT_SCHEDULE: PlanSchedule;
/** SR-44：抓取后处理默认**全开** —— 默认行为不变是升级的底线。 */
export declare const DEFAULT_POST_PROCESS: PlanPostProcess;
/**
 * 本机时区名（SR-5：存本地墙钟 + 时区快照）。
 *
 * 实现搬到了 `util/time.ts`（调度器也要用它），这里转出去让既有调用方不用改。
 */
export { detectTimezone };
/**
 * 把外部传进来的 schedule 收敛成合法值 —— 定时配置坏掉会静默不跑，必须拦住。
 *
 * ## 两件必须做的事
 *
 * 1. **旧字段翻译**：历史配置只有 `hour` / `minute`。直接丢掉的话，
 *    用户升级后方案会跑去默认的 09:00–11:00，而他配的是 07:00 —— 静默改了用户的行为。
 *    所以没有窗口字段时，用 `hour` 生成一个 1 小时窗口 `[hour:minute, hour+1:minute)`。
 * 2. **窗口校验**：跨零点合法（`22:00–02:00`），但起点终点完全相同不合法
 *    （那是一个零长度窗口，等于"永远不跑"，而用户不会以为自己配了个永不触发的东西）。
 */
/**
 * 历史配置形状：只有单点时刻。**只读入、不写出** ——
 * 类型上单独列出来是为了让"升级路径"这件事在签名里就看得见（SR-32 取消了这个形状）。
 */
export interface LegacyScheduleFields {
    hour?: number;
    minute?: number;
}
export declare function normalizeSchedule(patch: (Partial<PlanSchedule> & LegacyScheduleFields) | undefined, base?: PlanSchedule): PlanSchedule;
/** 后处理开关收敛（SR-44）：默认全开，只有显式 `false` 才关。 */
export declare function normalizePostProcess(patch: Partial<PlanPostProcess> | undefined): PlanPostProcess;
export interface PlanUpsertInput {
    name: string;
    platforms: string[];
    criteria?: Record<string, string>;
    schedule?: Partial<PlanSchedule>;
    enabled?: boolean;
    postProcess?: Partial<PlanPostProcess>;
}
/** SR-20/21/22：调度引擎写回的运行时状态。 */
export interface PlanEnginePatch {
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    failStreak?: number;
    /** `null` 表示**清掉**退避（成功之后必须能清）。 */
    backoffUntil?: string | null;
    riskPaused?: boolean;
    riskReason?: string | null;
}
/** 引擎运行时状态。 */
export interface PlanEngineState {
    failStreak: number;
    backoffUntil: string | null;
    riskPaused: boolean;
    riskReason: string | null;
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
    /** SR-7/20/21：引擎状态回写（尝试/成功时刻、退避、连续失败、风控暂停）。 */
    setEngine(id: number, patch: PlanEnginePatch): void;
    /** 读运行时引擎状态（不在 `PlanDto` 里：它属于"引擎"而不是"配置"）。 */
    engineState(id: number): PlanEngineState;
    count(): number;
}
export declare function createPlanRepo(db: DatabaseSync): PlanRepo;
export type { PlanDto, PlanPostProcess, PlanSchedule };
//# sourceMappingURL=plans.d.ts.map