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
}
/**
 * 跑一次抓取。已有抓取在进行时**立刻失败**（不排队）——
 * 排队会让调用方以为“点一下就好”，而实际上会连跑两遍触发风控。
 */
export declare function runCrawl(deps: CrawlDeps, options: RunCrawlOptions): Promise<CrawlSummaryDto>;
//# sourceMappingURL=crawl.d.ts.map