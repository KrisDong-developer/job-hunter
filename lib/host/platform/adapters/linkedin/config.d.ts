/**
 * LinkedIn（www.linkedin.com）的配置面：结构锚点集（列表 + 详情）、URL 参数映射、
 * guest 端点路径、分页步长、jobId / 薪资正则、页数上下限、发布时间窗、判墙信号 ——
 * 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * 完整调研记录（guest 端点策略、Trusted Types 教训、筛选参数真伪、详情锚点）见 `./index.ts` 文件头。
 */
/**
 * ⚠️ **Trusted Types（2026-09-20 v2 探针两次真机实测）**：LinkedIn 的 CSP 启用
 * Trusted Types，页面上下文里 `el.innerHTML = 字符串` 与 `DOMParser.parseFromString`
 * **都会**抛「requires TrustedHTML」。⇒ 任何「fetch 回 HTML 字符串再解析」的路线
 * 在真实页面上是死路（jsdom 离线测试测不出 —— 没有 CSP）。本适配器的 guest 通道
 * 因此是**导航式**：gotoSearch 直接导航到 guest 端点，浏览器自己渲染片段成文档，
 * 解析活 DOM —— 不经过任何注入 sink。
 */
/** 列表卡片的结构锚点集（base-card 族；2026-09-20 真机 10/10 命中）。 */
export interface LinkedInSelectors {
    /** 岗位卡片：`div.base-card`（guest 端点渲染出的文档与搜索页 SSR 直出同构）。 */
    card: string;
    /** 标题链接：`a.base-card__full-link`（href 内嵌 /jobs/view/{slug}-{id}）。 */
    titleLink: string;
    /** 标题节点（链接文本的规范化来源）。 */
    title: string;
    /** 公司名（内层通常还有一个 `a.hidden-nested-link`）。 */
    company: string;
    /** 地点。 */
    location: string;
    /** 薪资（多数卡片没有该节点 —— LinkedIn 把薪资藏给登录会员）。 */
    salary: string;
    /** 发布时间（`time[class*="listdate"]`，`datetime` 属性是 ISO 日期）。 */
    time: string;
    /** 卡片上的平台实体 urn 属性名（`data-entity-urn="urn:li:jobPosting:{id}"`）。 */
    entityUrnAttr: string;
}
/**
 * 详情页结构锚点（2026-09-20 `probe:linkedin-v2` 真机快照逐项证实，
 * 快照：`.probe-linkedin-capture/v2-detail-page-*.html`）：
 *
 * ```html
 * <h1 class="… topcard__title">Senior Software Engineer</h1>
 * <a class="topcard__org-name-link …">Traveloka</a>
 * <span class="topcard__flavor topcard__flavor--bullet">上海市</span>
 * <span class="posted-time-ago__text …">3 周前</span>
 * <div class="description__text description__text--rich">
 *   <section class="show-more-less-html …">
 *     <div class="show-more-less-html__markup …">…JD 全文（<br> 分段）…</div>
 *   </section>
 * </div>
 * <ul class="description__job-criteria-list">
 *   <li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">职位级别</h3>
 *     <span class="description__job-criteria-text …">中高级</span></li>
 *   …（职位性质 / 职能类别 / 行业）
 * </ul>
 * ```
 */
export interface LinkedInDetailSelectors {
    title: string;
    company: string;
    /** 地点徽章（flavor-row 里带 bullet 的那个）。 */
    location: string;
    /** JD 正文容器（show-more-less 的 markup 是全文，clamp 是 CSS 层的事，textContent 完整）。 */
    jd: string;
    /** criteria 列表项（h3 标题 + span 值）。 */
    criteriaItem: string;
    criteriaHeader: string;
    criteriaText: string;
    postedTime: string;
    /** criteria 里「职位级别」的标题文本（值 → expReq）。可 DB 覆盖（多语言界面）。 */
    expHeader: string;
}
/**
 * 字段 → URL 参数映射。
 *
 * ⚠️ **只保留 guest 端点真认的四个**（2026-09-20 v2 实测）：
 * `keywords` / `location` / `start` / `f_TPR`。f_E（经验）、f_WT（工作方式）、
 * f_AL（Easy Apply）、sortBy 在 guest 端点上**全部被忽略**（f_E=4 与对照 id 集合
 * 差异 0；sortBy=DD 序列不降序）—— 参数拼了也不改结果，**不声明这些维度**
 * （「让契约说实话」：拼一个不生效的参数就是在骗配置界面）。
 */
export interface LinkedInUrlParams {
    keywordParam: string;
    locationParam: string;
    /** 分页偏移（按 `pageSize` 步进，0 起）。 */
    startParam: string;
    /** 发布时间窗（`f_TPR=r<秒>`，**实测生效**：r86400 → 全部 datetime 落在当天）。 */
    timeRangeParam: string;
}
export interface LinkedInConfig {
    /** 站点域。默认全球站 www.linkedin.com（中国版 InCareer 已于 2023-08 停运）。 */
    host: string;
    selectors: LinkedInSelectors;
    detailSelectors: LinkedInDetailSelectors;
    urlParams: LinkedInUrlParams;
    /** guest 匿名列表端点的路径（导航式主通道的落点）。 */
    guestApiPath: string;
    /**
     * 搜索页导航时附带的 trk 参数值 —— 社区实测它显著降低未登录会话被 authwall
     * 拦截的概率。主通道（guest 端点）不需要它；`auth.checkUrl` 的搜索页仍带。
     */
    guestTrk: string;
    /**
     * 每页条数。**2026-09-20 v2 真机定案**：start=0/10/20 三页各 10 条、页间零重叠，
     * **匿名侧同样 10 条**（与登录态无关）—— 不是社区文档说的 25。满页判据用它。
     */
    pageSize: number;
    /** 从卡片 `data-entity-urn` 抠岗位 id 的模式。 */
    jobUrnPattern: string;
    /** 标题链接 href 里抠岗位 id 的兜底模式（`/jobs/view/{slug}-{id}`）。 */
    jobIdFromUrlPattern: string;
    /** 薪资文本模式（LinkedIn 展示形态：`$120,000.00/yr - $150,000.00/yr` 等）。 */
    salaryPattern: string;
    /**
     * 登录标记选择器（逗号分隔候选，任一命中 = 已登录）。
     *
     * **2026-09-20 真机两侧对比定案**（`probe:linkedin-login`，同一搜索页上扫）：
     * `img.global-nav__me-photo` / `.global-nav__me` 已登录侧各 1 命中、未登录侧 0。
     */
    loggedInSelector: string;
}
export declare const LINKEDIN_JOB_URN_PATTERN = "urn:li:jobPosting:(\\d+)";
export declare const LINKEDIN_JOB_ID_FROM_URL_PATTERN = "/jobs/view/(?:[^/?#]*-)?(\\d+)";
export declare const LINKEDIN_SALARY_PATTERN = "[$\u20AC\u00A3\u00A5\u20B9]\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*[-\u2013\u2014~]\\s*[$\u20AC\u00A3\u00A5\u20B9]?\\s?\\d[\\d,]*(?:\\.\\d+)?)?\\s*/\\s*(?:yr|year|hr|hour|mo|month)";
/**
 * 单次抓取页数。LinkedIn 是业内最激进的风控之一（专属 999 状态码、authwall、
 * checkpoint 挑战、封号风险），给得保守：默认 2 页、上限 5 页（每页 10 条）。
 * 单查询平台侧封顶约 1000 条，但那不是我们应该碰的深度。
 */
export declare const LINKEDIN_DEFAULT_MAX_PAGES = 2;
export declare const LINKEDIN_MAX_PAGES = 5;
/**
 * 发布时间窗：f_TPR=r<秒>，**guest 端点实测生效**（2026-09-20：r86400 → 全部
 * datetime 落在当天）。LinkedIn 接受任意秒数 —— 表里是常用档（closed:false）。
 */
export declare const LINKEDIN_POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 地点建议值。LinkedIn 的 `location` 是**自由文本**（直接吃英文地名，
 * 中文地名多数也能解析），表里只是给中文用户的常用起点 —— closed:false。
 */
export declare const LINKEDIN_CITY_SUGGESTIONS: readonly string[];
export declare const DEFAULT_LINKEDIN_CONFIG: LinkedInConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeLinkedInConfig(override: unknown): LinkedInConfig;
/**
 * LinkedIn 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * ⚠️ 词表条目一律**无空白**：`detectBlockWithSignals` 判文案前会把整页文本
 * 去掉全部空白（`text.replace(/\s+/g, '')`）再 `includes` —— 带空格的英文短语
 * **永远匹配不上**。这里全部写成去空白后的形态。
 *
 * `skipLoginWall`：**必须跳过**通用登录墙词表 —— LinkedIn 游客页页头本来就长着
 * Sign in / Join now 按钮，文案判据会把正常页面误判成登录墙。登录墙只用**地址级**
 * 判据（`/authwall`、`/login`，见 `page.ts` 的 `wallKindInPage`）。
 */
export declare const LINKEDIN_BLOCK_SIGNALS: {
    readonly captchaText: readonly ["quicksecuritycheck", "securityverification", "verifyyouridentity", "verifyyouarehuman", "unusualactivity"];
    readonly rateText: readonly ["toomanyrequests", "tryagainlater", "limitreached"];
};
/** 见 `LINKEDIN_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
export declare function linkedinBlockFlags(host: string): {
    expectedHost: string;
    skipLoginWall: boolean;
};
//# sourceMappingURL=config.d.ts.map