/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上，非二手资料）
 *
 * * **列表页**：`https://www.iguopin.com/jobList?keyword=<明文>` 生效（实测 `keyword=Java`
 *   返回 java 相关岗位）；同一站点还有 `/job` 路由，与 `/jobList` 是**新旧路由别名**，
 *   解析不依赖路由名，只锚岗位详情链接。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（实证命中
 *   「财税管理岗（校招）」详情页）。页面含：标题、更新于、薪资、公司、
 *   「职位性质 / 招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / 报名截止」、
 *   「职位介绍」（= JD 全文）。
 * * **列表条目 DOM 语义结构**（WebFetch 纯文本还原，每条卡片）：
 *
 *   ```
 *   <标题>
 *   「<城市-区域>」                    ← 全角书名号包裹，如「北京-石景山区」
 *   <薪资><性质><经验><学历>            ← 如「面议校招应届生本科」「10~13K校招应届生硕士」
 *   <职位职能/部门>                    ← 一条职能或部门文本（可能是详情链接文本）
 *   [公司名](company?id=<19位数字>)     ← 公司链接（语义锚点）
 *   <公司内部门>（可选）
 *   国企500-1000人商务服务业            ← 公司性质｜规模｜行业（可选）
 *   申请职位                           ← 投递按钮（忽略）
 *   ```
 *
 * ## 诚实标注的两处"未确证"（**不编**，见 §2 / §6）
 *
 * 1. **分页参数未确证**：列表底部有数字分页（`- 1 2 … 20 -`），但 `?p=2` 抓到与首页
 *    相同的条目 —— 参数名可能不是 `p`，也可能 WebFetch 命中了两套结果。在 probe:guopin
 *    落盘真实夹具确认前，`hasNextPage` 恒 false、`maxPages=1`（单页采集，绝不去猜参数）。
 * 2. **列表卡片 class / 城市码未确证**：本适配器**不编 class 锚点**，改以「岗位详情链接」
 *    为语义锚点，向上 `closest(container)` 取单条容器（`container` 是 DB 可覆盖的配置，
 *    默认宽松取 `li / .job-item / [class*='card']` 之一）；并将各字段词表全部放进配置，
 *    待 `npm run probe:guopin` 保存真实夹具后校准成精确选择器（与猎聘 v1 同思路）。
 *    城市筛选栏有北京/上海…，但 URL 城市参数未实证 → `cityCodes` 先置空，**不编**，
 *    未列出的城市 `buildSearchUrl` 返回 null（入口层拒绝）。
 *
 * ## 薪资「面议」是合法值
 *
 * 国聘不少岗位薪资为「面议」。`validate.ts` 的字段级判定把「面议」当**合法值**、
 * 只有**空串**才算缺失 —— 所以薪资总能解析到（至少「面议」），`requiredFields`
 * 可用完整核心四字段。解析失败留空则由 sentinel 隔离进 `pending_repair`。
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
/**
 * 单次抓取的页数上限。分页参数未确证（见文件头）→ v1 单页采集是平台事实，不是保守取舍。
 * 等 probe:guopin 夹具确认分页参数后放开。
 */
export declare const GUOPIN_MAX_PAGES = 1;
/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface GuopinSelectors {
    /** 岗位详情链接锚点（卡片内跳转详情）。 */
    detailLink: string;
    /** 公司链接锚点。 */
    companyLink: string;
    /** 单条卡片容器，向上 `closest()` 用它包裹详情链接（宽松默认，待夹具校准成精确 class）。 */
    container: string;
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
 * **在页面上下文里**解析列表页 —— 语义锚点（详见文件头），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 策略：以「岗位详情链接」为锚（国聘列表卡片内标题/职能可点跳详情），
 * 每找到一个详情链接 → 用 `closest(container)` 定位单条容器 → 文本抽取各字段。
 * 抠不到 id 的卡片记 note、`platformJobId` 留空（由 sentinel 兜底隔离），不编。
 */
export declare function extractJobsInPage(arg: GuopinConfig): RawJob[];
/**
 * **在页面上下文里**解析详情页（`/job/detail?id=`）。
 * ⚠️ 自包含；详情选择器为语义锚点，待 probe:guopin 详情夹具校准。
 */
export declare function extractDetailInPage(arg: {
    selectors: GuopinSelectors;
    jobIdPattern: string;
}): RawJobDetail;
/**
 * **在页面上下文里**判断撞上风控 / 登录墙。
 * 国聘是政府平台：antiBot 低档，走通用文案判定，不编平台特有墙信号。
 */
export declare function detectBlockInPage(arg: {
    detailLink: string;
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