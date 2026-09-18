import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 列表页选择器集（BossHunter 生产选择器 + 本项目夹具双重验证）。 */
export interface ZhipinSelectors {
    card: string;
    cardBox: string;
    /** 职位名链接（标题 + href 三合一）。 */
    jobName: string;
    /** 薪资（未登录为空元素）。 */
    salary: string;
    /** 「经验 / 学历」标签列表。 */
    tagList: string;
    /** 公司名（未登录视图装在 boss-name 里；BossHunter 兜底 company-name）。 */
    company: string;
    /** 「城市·区域·地标」文本。 */
    location: string;
}
/** 详情页选择器集（BossHunter site-patterns 2026-05-26 验证）。 */
export interface ZhipinDetailSelectors {
    title: string;
    salary: string;
    /** 经验/学历 span（顺序固定：先经验后学历）。 */
    tags: string;
    jdText: string;
    companySider: string;
}
export interface ZhipinConfig {
    selectors: ZhipinSelectors;
    detailSelectors: ZhipinDetailSelectors;
    urlParams: {
        base: string;
        keywordParam: string;
        cityParam: string;
    };
    cityCodes: Record<string, string>;
    jobIdPattern: string;
    /**
     * 滚动加载时，**每一轮等新卡片出现的上限**（ms）。
     *
     * 为什么进配置：离线夹具是静态 DOM，永远等不到"新卡片"，只能靠超时收手 ——
     * 测试要把它调到几十毫秒，否则每个用例白等十几秒。
     */
    scrollStepTimeoutMs: number;
}
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export declare const ZHIPIN_CITY_CODES: Record<string, string>;
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export declare const ZHIPIN_JOB_ID_PATTERN = "/job_detail/([0-9a-zA-Z~_-]+)\\.html";
/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export declare const ZHIPIN_MAX_PAGES = 1;
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export declare const ZHIPIN_PAGE_SIZE = 15;
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export declare const ZHIPIN_MAX_SCROLL_ROUNDS = 20;
export declare const DEFAULT_ZHIPIN_CONFIG: ZhipinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeZhipinConfig(override: unknown): ZhipinConfig;
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export declare function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null;
/**
 * **在页面上下文里**滚动加载：滚到底 → 等新卡片出现 → 重复。
 *
 * 为什么需要它：BOSS 的搜索结果**没有可寻址的第 N 页**（`&page=2` 实测无效），
 * 唯一的翻页手段就是滚动触发的懒加载。所以"抓得更深"只能在一次页面加载之内做厚。
 *
 * 两个刻意的收手条件：
 *   * 某一轮**没有新增卡片**就停（平台封顶 300 条时就是这个表现，再滚也是白滚）；
 *   * 每轮只等到 `stepTimeoutMs` —— 站点不响应时不能让整轮预算被一个页面吃干。
 *
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function scrollToLoadInPage(arg: {
    card: string;
    rounds: number;
    stepTimeoutMs: number;
}): Promise<number>;
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function extractJobsInPage(arg: {
    selectors: ZhipinSelectors;
    jobIdPattern: string;
}): RawJob[];
/**
 * **在页面上下文里**解析详情页（选择器：BossHunter site-patterns 2026-05-26 验证）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 */
export declare function extractDetailInPage(arg: {
    selectors: ZhipinDetailSelectors;
}): RawJobDetail;
export interface ZhipinAdapterOptions {
    config?: ZhipinConfig;
    delayRangeMs?: [number, number];
    waitForListMs?: number;
}
/** 构造 BOSS 直聘适配器。 */
export declare function createZhipinAdapter(options?: ZhipinAdapterOptions): SiteAdapter;
//# sourceMappingURL=zhipin.d.ts.map