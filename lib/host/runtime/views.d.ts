import type { AdapterHealthDto, CrawlStatusDto, FieldHealthDto, HealthDto, LoginStatusDto, PlatformOverviewDto, SchedulerStatusDto } from '../../shared/dto.js';
import type { HealthState } from '../../shared/enums.js';
import type { AdapterRegistry } from '../platform/registry.js';
import { type LoginFlow, type SessionService } from '../platform/session.js';
import type { PlatformGate } from '../scheduler/index.js';
import type { Store } from '../store/store.js';
import type { ToolRegistrationReport } from '../tools/types.js';
import type { Clock } from '../util/time.js';
/** 健康快照的**原始**形状（未加 `platformId`）。 */
export interface AdapterHealthSnapshot {
    health: HealthState;
    failStreak: number;
    lastOkAt: string | null;
    reason: string | null;
    fields: FieldHealthDto[];
}
/**
 * 一个平台的健康快照。
 *
 * 数据层未就绪时给"健康"默认值 —— 这不是粉饰：那一页整页都处于"数据层未就绪"，
 * 由一个顶层标记说明（`/health` 的 `dataReady`、平台矩阵的 `blocked: null`），
 * 而不是让每个平台各自显示一个假的 broken。
 */
export declare function adapterSnapshotOf(store: Store | undefined, platformId: string): AdapterHealthSnapshot;
/** 全部注册适配器的健康快照（`/health` 与 `/crawl/status` 共用同一份）。 */
export declare function adapterHealthDtos(store: Store | undefined, registry: AdapterRegistry): AdapterHealthDto[];
export interface HealthViewDeps {
    store: Store | undefined;
    registry: AdapterRegistry;
    version: string;
    startedAt: number;
    /** 数据层失败原因；就绪时传 null（未就绪分支会把它当 `dataError` 报出去）。 */
    dataError: string | null;
    tools: ToolRegistrationReport | null;
}
/** `GET /health` 的快照。数据层没就绪时也安全返回（如实说没就绪，而不是不给数据）。 */
export declare function buildHealth(deps: HealthViewDeps): HealthDto;
export interface CrawlStatusViewDeps {
    store: Store | undefined;
    registry: AdapterRegistry;
    /** 平台锁是否被持有（装配点知道，这里不猜）。 */
    busy: boolean;
}
export declare function buildCrawlStatus(deps: CrawlStatusViewDeps): CrawlStatusDto;
export interface PlatformOverviewDeps {
    store: Store | undefined;
    registry: AdapterRegistry;
    /** 登录态服务；数据层未就绪时可能还不存在。 */
    sessionOf: () => SessionService | undefined;
    /** 登录引导流程；同上（它是数据层就绪之后才建的）。 */
    loginFlowOf: () => LoginFlow | undefined;
    /** 平台门 —— 矩阵的「今天能跑」那一格**必须**是它的返回值，不能另写一套判定。 */
    gate: PlatformGate;
    clock: Clock;
}
/** 平台总览矩阵：一屏看完每个平台"是什么"与"现在能不能跑、为什么不能"。 */
export declare function buildPlatforms(deps: PlatformOverviewDeps): PlatformOverviewDto[];
export interface LoginStatusViewDeps {
    registry: AdapterRegistry;
    sessionOf: () => SessionService | undefined;
    loginFlowOf: () => LoginFlow | undefined;
}
export declare function buildLoginStatuses(deps: LoginStatusViewDeps): LoginStatusDto[];
/**
 * 数据层未就绪时的调度状态。
 *
 * 如实报告，并且**每个字段都给一个真值** —— 少一个字段就是界面上一个 `undefined`，
 * 比空态更难查。
 */
export declare function unavailableSchedulerStatus(readOnlyReason: string, lease: SchedulerStatusDto['lease']): SchedulerStatusDto;
//# sourceMappingURL=views.d.ts.map