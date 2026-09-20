import type { CrawlSummaryDto } from '../../shared/contract/dto/crawl.js';
import { type Clock } from '../util/time.js';
import type { PlatformLocks } from '../platform/locks.js';
import { type BurstGuardLike } from '../platform/pacing.js';
import type { AdapterRegistry } from '../platform/registry.js';
import { type PageSource, type SearchCriteria } from '../platform/types.js';
import type { Store } from '../store/store.js';
import type { CompanyService } from './companies.js';
import type { JobService } from './jobs.js';
export interface CrawlDeps {
    store: Store;
    registry: AdapterRegistry;
    /** 按平台互斥：同一平台串行（忙则立刻失败），不同平台并发。见 platform/locks.ts。 */
    locks: PlatformLocks;
    /** 页面来源：真路径是浏览器，离线路径是 jsdom 夹具。 */
    pageSource: PageSource;
    jobs: JobService;
    companies: CompanyService;
    /**
     * 可选：突发惩罚守卫的工厂（P5/D-17a）。
     *
     * 适配器内部的高斯页间延时防的是"节奏规律"，这里防的是"连续快请求" ——
     * 15s 内 ≥3 页 / 45s 内 ≥6 页时加罚延迟。
     *
     * **按平台注入**（跨平台并发之后这是必须的）：突发规则的窗口是站点维度的，
     * 各平台各算各的等于规则形同失效。生产侧由 runtime 提供一个**按平台记忆**
     * 的工厂（同一平台共享同一份滑动窗口，跨轮次也连续）；
     * 这同时修掉一个旧缺口 —— 以前每次 runCrawl 各自 new 一份，同平台
     * 背靠背的两轮各自从零计数，窗口规则在轮与轮之间根本没生效。
     */
    createBurstGuard?: (platformId: string) => BurstGuardLike;
    /**
     * 可选：采集之后跑情报引擎（P4）。
     * 用窄接口而不是直接依赖 `IntelService`，避免 domain 层互相缠绕，也方便测试关掉它。
     */
    intel?: {
        /** SR-44：抓取后处理开关直接传给评估器，避免在 domain 之间再传一层配置。 */
        evaluateJob(jobId: number, now: string, switches?: {
            score?: boolean;
            flag?: boolean;
        }): unknown;
        recomputeCompany(companyId: number, now: string): unknown;
    } | undefined;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface RunCrawlOptions {
    platformId: string;
    planId?: number | null;
    criteria: SearchCriteria;
    /** 最多抓几页。优先取 `criteria.maxPages`（方案配置，SR-40），其次这里。 */
    maxPages?: number;
    /** SR-28/29：触发原因，落进 `crawl_run.reason`。 */
    reason?: string | null;
    /**
     * SR-44：抓取后处理开关。**默认全开**（不给就是全开）。
     *
     * 为什么由调用方注入而不是这里读方案：`crawl.ts` 不认识"方案"，
     * 它只认识"这次抓取"。让 domain 层去查方案会把两层的依赖搅在一起。
     */
    postProcess?: {
        score: boolean;
        flag: boolean;
        dedup: boolean;
    };
    /**
     * SR-46：本轮的**绝对**到点时刻（ISO）。到期后在**页与页之间**停手。
     *
     * 为什么是绝对时刻而不是"还剩多少毫秒"：这一轮里每个平台看到的必须是**同一个终点**
     * （调度器按本轮开始时刻算）。传剩余量的话，第二个平台会重新获得一份预算，
     * 多平台下就等于没有预算。
     *
     * 为什么只在页与页之间停：请求中途打断会留下一个状态未知的页面，同一浏览器上下文的
     * 下一次使用行为不可预期。宁可跑完当前这一页 —— 它最多就是一页的代价。
     */
    deadlineAt?: string | null;
}
/**
 * 跑一次抓取。**同一个平台**已有抓取在进行时立刻失败（不排队）——
 * 排队会让调用方以为"点一下就好"，而实际上会连跑两遍触发风控。
 * 不同平台不受影响（跨平台并发，见 platform/locks.ts）。
 */
export declare function runCrawl(deps: CrawlDeps, options: RunCrawlOptions): Promise<CrawlSummaryDto>;
//# sourceMappingURL=crawl.d.ts.map