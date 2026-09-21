/**
 * Indeed 的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、jobkey / 薪资正则、
 * 页数上下限、平台判墙信号与开关 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `indeedBlockFlags` 由 `./index.ts` 在判墙时按 `config.host` 调用，故导出。
 *
 * 完整实测记录（2026-09-18「停运」调查 → 2026-09-21 复核推翻）见 `./index.ts` 文件头。
 */
/** 结构锚点集（2026-09-21 按 cn.indeed.com 真实搜索页校准；DB 可覆盖）。 */
export interface IndeedSelectors {
    /** 职位标题链接：`a.jcs-JobTitle`（就业界稳定；href 内嵌 `jk=` 平台 id）。 */
    titleLink: string;
    /** 公司名（教程/site:indeed 文档形态）。 */
    company: string;
    /** 地点。 */
    location: string;
    /** 薪资。 */
    salary: string;
    /** 发布日期。 */
    date: string;
    /**
     * 分页容器。⚠️ 2026-09-21 真实页实测：必须是 `nav[aria-label="pagination"]` ——
     * 页头还有 `<nav class="gnav" aria-label="主要国家">` 排在文档前面，宽泛的
     * `nav[aria-label]` 会先抓到 gnav，导致「下一页」永远找不到（hasNext 恒 false）。
     */
    pagination: string;
    /** 「下一页」锚点。 */
    nextPage: string;
    /** 「下一页」被禁用时打在这个属性上（如 `aria-disabled="true"`）。 */
    nextPageDisabledAttr: string;
}
/** 字段 → URL 参数映射（get_jobs / Indeed 公开约定同款：`q` / `l` / `start`）。 */
export interface IndeedUrlParams {
    keywordParam: string;
    locationParam: string;
    /** 分页偏移参数（按 `pageSize` 递增）。 */
    startParam: string;
}
/**
 * 详情页（`/viewjob?jk=`）结构锚点 —— 2026-09-21 `probe:indeed-detail` 三页实测 **3/3 命中**：
 * 标题/公司/地点/JD 全文都有稳定锚点；**无 JSON-LD JobPosting**，发布日期走内嵌载荷
 * （`hiringInsightsModel.age`，见 `INDEED_POSTED_AGE_PATTERN`），薪资在详情页同样无源。
 */
export interface IndeedDetailSelectors {
    /** 职位标题：`h1[data-testid="jobsearch-JobInfoHeader-title"]`（h1 与 testid 同元素）。 */
    title: string;
    /** 公司名：页头内联 `[data-testid="inlineHeader-companyName"]`。 */
    company: string;
    /** 地点：页头内联 `[data-testid="inlineHeader-companyLocation"]`。 */
    location: string;
    /** JD 全文容器：`#jobDescriptionText`（就业界多年稳定 id，3/3 实测）。 */
    description: string;
}
export interface IndeedConfig {
    /** 站点域；默认 cn.indeed.com（2026-09-21 实测可用，见文件头复核记录）。 */
    host: string;
    selectors: IndeedSelectors;
    /** 详情页（`/viewjob?jk=`）锚点。 */
    detailSelectors: IndeedDetailSelectors;
    urlParams: IndeedUrlParams;
    /**
     * 每页条数 = `start` 参数的步进。⚠️ 2026-09-21 真实页 href 算术定案为 **10**
     * （`pagination-page-2`→`start=10`、`page-3`→`start=20`、「下一页」→`start=10`）——
     * 旧默认 15 来自全球版惯例，与 cn 站真实翻页链接不符。
     */
    pageSize: number;
    /** 从职位链接 href 里抠 `jk=<jobkey>` 的模式。 */
    jobKeyPattern: string;
    /** 薪资文本模式（字符串形态，序列化进页面）。 */
    salaryPattern: string;
}
export declare const INDEED_JOB_KEY_PATTERN = "[?&]jk=([A-Za-z0-9]+)";
export declare const INDEED_SALARY_PATTERN = "\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07]?\\s*[-~\u81F3]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07]?(?:\\s*\u5143?(?:/\u6708|/\u5E74|\u6708\u85AA|\u5E74\u85AA))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07](?:\\s*\u5143?(?:/\u6708|/\u5E74|\u6708\u85AA|\u5E74\u85AA))?\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/**
 * 从详情页内嵌载荷抠发布日期文本 —— 2026-09-21 三页实测：详情页**无 JSON-LD
 * JobPosting**、无日期 DOM 节点，唯一来源是内嵌 JSON 的
 * `"hiringInsightsModel":{"age":"30+天前"}`（`jobMetadataFooterModel.age` 同值，作回落）。
 */
export declare const INDEED_POSTED_AGE_PATTERN = "\"hiringInsightsModel\":\\{[^{}]*\"age\":\"([^\"]+)\"|\"jobMetadataFooterModel\":\\{[^{}]*\"age\":\"([^\"]+)\"";
/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export declare const INDEED_DEFAULT_MAX_PAGES = 3;
export declare const INDEED_MAX_PAGES = 5;
export declare const DEFAULT_INDEED_CONFIG: IndeedConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeIndeedConfig(override: unknown): IndeedConfig;
/**
 * 匿名侧登录入口链接选择器 —— `isLoggedIn` 的**回落**判据（2026-09-21 两侧实测：
 * 未登录搜索页命中 2 处、已登录搜索页 0 处）。权威判据是页面载荷 `"isLoggedIn"`，
 * 见 `./page.ts` 的 `isLoggedInInPage`。
 */
export declare const INDEED_ANON_LOGIN_LINK = "a[href*=\"account.indeed.com\"]";
/**
 * Indeed 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare 挑战的 DOM 特征**（`#challenge-error-title` / `.cf-error-*` /
 *     `challenges.cloudflare.com` 的 iframe）—— 通用词表里没有 Cloudflare；
 *   * **验证码文案**：Indeed 是「需要进行其他验证」+ 英文 `Ray ID` / `captcha` / `robot`。
 *     它们必须进 `captchaText` 而**不是** `rateText` —— 判定顺序上验证码在前，
 *     但语义错了会让界面把"人机验证"说成"限流"，给用户的下一步动作完全不同；
 *   * `expectedHost`：2026-09-21 复核实测，cn 站的墙有两种形态 —— 旧记录的
 *     302 → www.indeed.com，以及首访可能被送到 `secure.indeed.com/auth` 登录墙
 *     （带 cf_clearance 的 profile 复访时直出列表）。两者都是**地址级**事实，
 *     由 `expectedHost` 统一判 `blank`，不用文案去猜；
 *   * `skipLoginWall`：登录墙的真实形态是**跨域跳转**（地址级判据已覆盖），且
 *     未登录实测可搜 —— 若让通用词表按"0 条 + 登录文案"去判 `login-required`，
 *     会把"0 结果"误报成"需要登录"。
 */
export declare const INDEED_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly ["#challenge-error-title", ".cf-error-details", ".cf-error-h1", "[id^=\"challenge-running\"]", "iframe[src*=\"challenges.cloudflare.com\"]"];
    readonly captchaText: readonly ["需要进行其他验证", "请稍候", "Ray ID", "cloudflare", "cf-error", "验证码", "captcha", "安全验证", "robot"];
    readonly rateText: readonly ["请求过于频繁"];
};
/** 见 `INDEED_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
export declare function indeedBlockFlags(host: string): {
    expectedHost: string;
    skipLoginWall: boolean;
};
//# sourceMappingURL=config.d.ts.map