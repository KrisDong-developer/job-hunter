import type { CrawlSummaryDto } from '../../shared/dto.js';
import { type Clock } from '../util/time.js';
import type { Mutex } from '../platform/mutex.js';
import type { AdapterRegistry } from '../platform/registry.js';
import type { PageSource, SearchCriteria } from '../platform/types.js';
import type { Store } from '../store/store.js';
import type { CompanyService } from './companies.js';
import type { JobService } from './jobs.js';
export interface CrawlDeps {
    store: Store;
    registry: AdapterRegistry;
    mutex: Mutex;
    /** 页面来源：真路径是浏览器，离线路径是 jsdom 夹具。 */
    pageSource: PageSource;
    jobs: JobService;
    companies: CompanyService;
    /**
     * 可选：采集之后跑情报引擎（P4）。
     * 用窄接口而不是直接依赖 `IntelService`，避免 domain 层互相缠绕，也方便测试关掉它。
     */
    intel?: {
        evaluateJob(jobId: number, now: string): unknown;
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
    /** 最多抓几页（P1 默认 1 页）。 */
    maxPages?: number;
}
/**
 * 跑一次抓取。已有抓取在进行时**立刻失败**（不排队）——
 * 排队会让调用方以为“点一下就好”，而实际上会连跑两遍触发风控。
 */
export declare function runCrawl(deps: CrawlDeps, options: RunCrawlOptions): Promise<CrawlSummaryDto>;
//# sourceMappingURL=crawl.d.ts.map