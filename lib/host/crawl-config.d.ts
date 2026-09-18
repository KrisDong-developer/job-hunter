import type { Store } from './store/store.js';
export interface CrawlConfig {
    /** 一轮采集（一个方案的一次运行，含多关键词与详情补抓）最多多少分钟。 */
    roundBudgetMinutes: number;
}
export declare const CRAWL_CONFIG_FALLBACK: CrawlConfig;
/** 任意输入收敛成合法值（坏输入退默认；越界收到边界；小数四舍五入）。 */
export declare function normalizeCrawlConfig(input: unknown): CrawlConfig;
export declare function readCrawlConfig(store: Store): CrawlConfig;
export declare function writeCrawlConfig(store: Store, patch: Partial<CrawlConfig>, now: string): CrawlConfig;
//# sourceMappingURL=crawl-config.d.ts.map