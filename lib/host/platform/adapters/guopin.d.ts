/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上 + probe 夹具实证，非二手资料）
 *
 * * **列表页**：真实路由 `/jobList?keyword=<明文>` **302 到 `/job?keyword=Java`**
 *   （probe 实证，2026-09-18）。未登录可看、服务端 SSR。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（WebFetch 实证命中
 *   「财税管理岗（校招）」详情页）。页面含标题 / 更新于 / 薪资 / 公司 / 职位性质 /
 *   招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / **报名截止** / 职位介绍（度量 JD）。
 * * **列表卡片真实 DOM**（probe 实证，`test/fixtures/guopin-search.html`）：
 *
 *   ```html
 *   <div class="job-card">
 *     <div class="job-title" title="java后端 「北京-东城区」">   ← 标题+城市（全角书名号）
 *       <div class="job-name">java后端</div>
 *     </div>
 *     <div class="job-info">     ← 3 个 tag：「性质/经验/学历」（顺序不固定，经验偶缺）
 *       <span class="tag-item">校招</span><span>应届生</span><span>本科</span>
 *     </div>
 *     <div class="job-tag"><span class="ant-tag">Java工程师</span>…</div>
 *     <a class="company-name" href="/company?id=…" title="…">…</a>  ← 公司（文本可能省略号截断）
 *     <div class="company-info">  ← 顺序固定 ×3：性质/规模/行业
 *       <span class="company-info-item">国企</span><span>1000-2000人</span><span>软件和信息技术服务业</span>
 *     </div>
 *   </div>
 *   ```
 *
 * ## ⚠️ 两个 phase-1 就被 probe 推翻的事实（决定本适配器形态）
 *
 * 1. **列表卡片无薪资**：`.job-info` 只有性质/经验/学历，薪资只出现在详情页。
 *    因此 `requiredFields` **不含 `salary_raw`**（否则每条都被隔离）；`salaryRaw` 留空，
 *    由详情抓取（detail.extract）补。
 * 2. **列表页无平台 id**：无 `/job/detail?id=` 链接、无 `__NEXT_DATA__`/`jobId`/`positionId`
 *    持久化载荷。id 只在详情页。⇒ **upsert 幂等键用内容哈希**（用户拍板）：
 *    `platformJobId = "ch:" + FNV1a(title|company|city|district)`，deterministic，
 *    同岗位重复抓不重复；`sourceUrl` 存列表页 URL（不编详情 URL）。
 *
 * ## 分页 / 城市码：仍未确证（**不编**）
 *
 * * **分页参数未确证**：真实路由 `/job?keyword=` 无页码参数；从页面底部数字分页拿到
 *   真实 href 前，`hasNextPage` 恒 false、`maxPages=1`（单页采集，绝不去猜参数）。
 * * **城市码未实测**：筛选栏有北京/上海…，但 URL 城市参数未实证 → `cityCodes` 置空，
 *   未列出城市 `buildSearchUrl` 返回 null（入口层拒绝）。
 *
 * ## 判定墙
 *
 * 国聘是政府背景平台，未观测到 CDP 检测（对应 §7.1「51job/智联/神仙外企」那一档）。
 * `detectBlock` 走通用文案判定：验证控件 → 频控 → 登录墙 → 空页。列表页未登录可看
 * （投递才要登录），所以 `searchWithoutLogin: true`；antiBot 如实定 `low`。
 */
import type { BlockKind } from '../../../shared/enums.js';
import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export declare const GUOPIN_JOB_ID_PATTERN = "/job/detail\\?id=(\\d+)";
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export declare const GUOPIN_DETAIL_URL_TEMPLATE = "https://www.iguopin.com/job/detail?id={jobId}";
/** 薪资文本模式（组合行 `10~13K校招应届生硕士` 的薪资格，或独立「面议」）。 */
export declare const GUOPIN_SALARY_PATTERN = "\u9762\u8BAE|\\d+(?:\\.\\d+)?\\s*~\\s*\\d+(?:\\.\\d+)?\\s*[kK\u4E07](?:\\s*[\u00B7x\u00D7]\\s*\\d+\\s*\u85AA)?|\\d+(?:\\.\\d+)?\\s*[kK\u4E07](?:\\s*[\u00B7x\u00D7]\\s*\\d+\\s*\u85AA)?|\\d+(?:\\.\\d+)?\\s*\u5143/\u5929";
/** 城市模式：国聘用全角书名号 `「<城市-区域>」` 包裹（实测多种形态，缺省按 城市/区域 拆）。 */
export declare const GUOPIN_CITY_PATTERN = "\u300C([^\u300C\u300D]*)\u300D";
/** 经验词表（组合行尾部，实测诸形态）。 */
export declare const GUOPIN_EXP_PATTERN = "(\u5E94\u5C4A\u751F|\u5728\u6821\u751F|\u7ECF\u9A8C\u4E0D\u9650|1\u5E74\u4EE5\u5185|1-3\u5E74|3-5\u5E74|5-10\u5E74|10-15\u5E74|15-20\u5E74|20\u5E74\u4EE5\u4E0A|\\d+\u5E74)";
/** 学历词表。 */
export declare const GUOPIN_EDU_PATTERN = "(\u535A\u58EB|\u7855\u58EB|\u672C\u79D1|\u5927\u4E13|\u65E0\u5B66\u5386\u8981\u6C42|\u4E2D\u4E13|\u9AD8\u4E2D)";
/** 招聘性质词表（放 tags，国聘是重要筛选维度：校招/社招/实习/见习/公职/兼职）。 */
export declare const GUOPIN_NATURE_PATTERN = "(\u6821\u62DB|\u793E\u62DB|\u5B9E\u4E60|\u89C1\u4E60|\u516C\u804C\u7C7B|\u517C\u804C)";
/** 公司性质词表（从 `国企500-1000人商务服务业` 这类行拆出）。 */
export declare const GUOPIN_NATURE_COMPANY_PATTERN = "(\u56FD\u6709\u4F01\u4E1A|\u56FD\u4F01|\u6C11\u8425\u4F01\u4E1A|\u6C11\u8425|\u4E0A\u5E02\u516C\u53F8|\u4E8B\u4E1A\u5355\u4F4D|\u5730\u65B9\u653F\u5E9C|\u5916\u5546\u72EC\u8D44|\u4E2D\u5916\u5408\u8D44|\u5176\u4ED6)";
/** 公司规模模式（`1000-2000人` / `50人以下`）。 */
export declare const GUOPIN_SIZE_PATTERN = "(\\d+\\s*-\\s*\\d+\u4EBA|\\d+\u4EBA(?:\u4EE5\u4E0B|\u4EE5\u4E0A|\u4EE5\u5185)?)";
/** 详情页报名截止模式（详情页正文「报名截止：2026-12-12 23:50:05」，为硬截止铺路）。 */
export declare const GUOPIN_DEADLINE_PATTERN = "\u62A5\u540D\u622A\u6B62[:\uFF1A]\\s*([\\d\\-\\s:]+)";
/**
 * 单次抓取的页数上限。分页参数未确证（见文件头）→ v1 单页采集是平台事实，不是保守取舍。
 * 等 probe:guopin 夹具确认分页参数后放开。
 */
export declare const GUOPIN_MAX_PAGES = 1;
/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface GuopinSelectors {
    /** 列表卡片容器（probe 实证：`div.job-card`）。 */
    card: string;
    /** 标题节点（`.job-name`，纯标题）。 */
    jobName: string;
    /** 标题容器上带「城市-区域」的 title 属性名（`.job-title[title]`，如 `java后端 「北京-东城区」`）。 */
    jobTitleAttr: string;
    /** 卡片内「性质/经验/学历」标签（`.job-info .tag-item`，顺序不固定，按词表归类）。 */
    jobInfoItems: string;
    /** 公司链接（`.company-name`）。 */
    companyLink: string;
    /** 公司「性质/规模/行业」三项（`.company-info .company-info-item`，顺序固定）。 */
    companyInfoItems: string;
    /** 职能标签（`.job-tag .ant-tag`，进 tags）。 */
    jobTags: string;
    /** 详情页选择器。 */
    detailTitle: string;
    detailSalary: string;
    detailCompany: string;
    /** JD 全文（职位介绍）。 */
    detailJdText: string;
    /** 分页容器（未确证，占位）。 */
    pagination: string;
}
export interface GuopinUrlParams {
    base: string;
    keywordParam: string;
}
export interface GuopinConfig {
    selectors: GuopinSelectors;
    urlParams: GuopinUrlParams;
    /**
     * 城市码。**只放实测确认过的**；调研期筛选栏有城市名但 URL 城市参数未实证，故 v1 置空。
     * 未列出城市 `buildSearchUrl` 返回 null（入口层拒绝），**不猜**。逐城实测后写 DB 覆盖。
     */
    cityCodes: Record<string, string>;
    /** 从详情链接里抠平台 id 的模式。 */
    jobIdPattern: string;
    detailUrlTemplate: string;
    salaryPattern: string;
    cityPattern: string;
    expPattern: string;
    eduPattern: string;
    /** 招聘性质词（校招/社招…，进 tags）。 */
    naturePattern: string;
    /** 公司性质词。 */
    companyNaturePattern: string;
    /** 公司规模模式。 */
    companySizePattern: string;
    /** 详情页报名截止模式（为接入 campus 硬截止铺路；解析不到则省略）。 */
    deadlinePattern: string;
}
export declare const DEFAULT_GUOPIN_CONFIG: GuopinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeGuopinConfig(override: unknown): GuopinConfig;
/** 用平台 id 构造详情 URL。 */
export declare function buildGuopinJobDetailUrl(config: GuopinConfig, jobId: string): string;
/**
 * 构造列表页 URL：`https://www.iguopin.com/jobList?keyword=<kw>`。
 * 城市码未配置（v1 空表）时带城市即返回 null —— **不猜**。
 * 页码：分页参数未确证，v1 单页（不加页码参数）。
 */
export declare function buildGuopinSearchUrl(config: GuopinConfig, criteria: SearchCriteria): string | null;
/**
 * **在页面上下文里**解析列表页 —— 卡片遍历（probe 实证结构），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 事实（2026-09-18 probe 实证 `test/fixtures/guopin-search.html`）：
 *   * 卡片容器 `.job-card`；标题 `.job-name`；城市在 `.job-title[title]`（`标题 「城市-区域」`）；
 *   * `.job-info .tag-item` 是「性质/经验/学历」（顺序不固定，经验偶缺，按词表归类）；
 *   * **列表卡片无薪资、无岗位 id、无详情链接 / 持久化载荷** —— 详见文件头；
 *   * 公司 `.company-name`（文本可能被省略号截断，用 title 属性补全）；
   *   * `.company-info .company-info-item` 顺序固定：性质/规模/行业；
   *   * `.job-tag .ant-tag` 是职能标签（进 tags）。
 *
 * 幂等键：列表无 id → `platformJobId` 用内容哈希（FNV-1a，同步、自包含）——
 * `ch:` + hash(title|company|city|district)，deterministic，同岗位重复抓不重复。
 * ▸ 这是用户拍板的方案（列表页无 id 的适应层兜底），不是平台 id；`sourceUrl` 存列表页 url。
 */
export declare function extractJobsInPage(arg: GuopinConfig): RawJob[];
/**
 * **在页面上下文里**解析详情页（`/job/detail?id=`）。
 * ⚠️ 自包含；详情选择器为语义锚点，待 probe:guopin 详情夹具校准。
 */
export declare function extractDetailInPage(arg: {
    selectors: GuopinSelectors;
    jobIdPattern: string;
    deadlinePattern: string;
}): RawJobDetail;
/**
 * **在页面上下文里**判断撞上风控 / 登录墙。
 * 国聘是政府平台：antiBot 低档，走通用文案判定，不编平台特有墙信号。
 */
export declare function detectBlockInPage(arg: {
    card: string;
}): BlockKind | null;
export interface GuopinAdapterOptions {
    config?: GuopinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造国聘网适配器。 */
export declare function createGuopinAdapter(options?: GuopinAdapterOptions): SiteAdapter;
//# sourceMappingURL=guopin.d.ts.map