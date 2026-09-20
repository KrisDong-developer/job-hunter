/**
 * 国聘网的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、城市码表、
 * 各字段的正则常量、页数上限、登录锚点、平台判墙信号 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `GUOPIN_CARD` / `GUOPIN_COMPANY_LINK` / `GUOPIN_SALARY` / `GUOPIN_DETAIL_COMPANY` 只被本文件的
 * `DEFAULT_GUOPIN_CONFIG` 用到，所以保持模块私有（不导出）。
 *
 * 完整实测记录（列表卡片真实 DOM、薪资 18/20、无平台 id 的后果、翻页点击契约、
 * 登录锚点、详情页真实结构）见 `./index.ts` 文件头 —— 2026-09-20 登录态探针全面校准过一轮。
 */
/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export declare const GUOPIN_JOB_ID_PATTERN = "/job/detail\\?id=(\\d+)";
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export declare const GUOPIN_DETAIL_URL_TEMPLATE = "https://www.iguopin.com/job/detail?id={jobId}";
/** 登录页（未登录列表页头 `a.login` 的 href 实测为 `/login?redirect=…`）。 */
export declare const GUOPIN_LOGIN_URL = "https://www.iguopin.com/login";
/** 薪资文本模式：列表 `.job-salary` / 详情薪资的合法性校验（面议、`10~13K`、`8~9K·16薪`、`1.5K`…实测形态）。 */
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
 * 单次抓取的页数上限。**20 来自 ant 分页自报**（2026-09-20 登录态实测：
 * `ul.ant-pagination` 文本「12345•••20跳至页」），不是拍的保守值。
 *
 * ⚠️ 翻页方式（同日 `npm run probe:guopin-pagination` 实测定案）：
 *   * URL `?page=2` **无效**（SPA 忽略，active 仍为 1）—— 不能像智联那样靠 URL 寻址；
 *   * 真鼠标点 `.ant-pagination-item-2` **有效**（active=2、数据换 9/20）——
 *     但翻页在页面内完成，URL 不变。⇒ `gotoSearch` 收到 `page>1` 时靠**连点 next** 到位
 *     （见 `page/list.ts` 的 `turnToPageInPage`），`hasNextPage` 读 next 的 disabled 状态。
 */
export declare const GUOPIN_MAX_PAGES = 20;
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
    /** 列表薪资（`.job-info .job-salary`；实测 18/20 卡片有，读不到留空）。 */
    salary: string;
    /** 公司「性质/规模/行业」三项（`.company-info .company-info-item`，顺序固定）。 */
    companyInfoItems: string;
    /** 职能标签（`.job-tag .ant-tag`，进 tags）。 */
    jobTags: string;
    /** 标题（`.title-box .title-section .title`；页面无 h1）。 */
    detailTitle: string;
    /**
     * 薪资。⚠️ 快照样本（引才计划岗）**没有**薪资节点 —— 薪资不是每个详情页都有，
     * 保留语义候选兜底，读到就过 `salaryPattern` 校验。
     */
    detailSalary: string;
    /** 公司名（`.job-company-desc .company-title`；logo 链接里没有文本，别用 `a[href*="/company"]`）。 */
    detailCompany: string;
    /** JD 全文（`.job-intro-section .job-duty`）。 */
    detailJdText: string;
    /** 「职位性质/最低学历/报名截止/工作经验…」键值对（`.overview-item`：overview-title + overview-desc，按 title 文本归类）。 */
    detailOverviewItems: string;
    /** 详情页职能标签（`.intro-tag-wrap .intro-tag`，进 tags）。 */
    detailIntroTags: string;
    /** 公司标签（`.job-company-tag .company-tag` ×4：服务类型/性质/行业/规模，**顺序不固定**，按词表归类性质与规模）。 */
    detailCompanyTags: string;
    /** 更新时间（`.update-time`「更新于 2026-09-12」→ publishedAt）。 */
    detailUpdateTime: string;
    /** 分页容器（`ul.ant-pagination`）。 */
    pagination: string;
    /** 「下一页」按钮（`li.ant-pagination-next`）。 */
    paginationNext: string;
    /** 「下一页」不可用的标记（`li.ant-pagination-next.ant-pagination-disabled` —— ant 库级稳定类名）。 */
    paginationNextDisabled: string;
    /** 当前页（`.ant-pagination-item-active`，`title` 属性是页码）。 */
    paginationActive: string;
}
/** 登录态锚点（两端实测：未登录夹具 vs 2026-09-20 登录态快照，命中数 1/0 与 0/1）。 */
export interface GuopinLoginSelectors {
    /** 已登录：页头用户区（`.avatar-box .user-name`，文本是脱敏手机号；未登录 0）。 */
    loggedIn: string;
    /** 未登录：页头「登录/注册」（`a.login`，href 是 `/login?redirect=…`；登录态 0）。 */
    notLoggedIn: string;
}
export interface GuopinUrlParams {
    base: string;
    keywordParam: string;
}
export interface GuopinConfig {
    selectors: GuopinSelectors;
    /** 登录态锚点（`auth.isLoggedIn` 用）。 */
    loginSelectors: GuopinLoginSelectors;
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
    /**
     * 点击翻页后，**每一步**等「当前页码变化」的上限（ms）。
     *
     * 为什么进配置：离线夹具是静态 DOM，点了 next 页码不会变（没有 React），
     * 只能靠超时收手 —— 测试要把它调到几十毫秒，否则每个用例白等十几秒
     * （与 zhipin 的 `scrollStepTimeoutMs` 同一个理由）。
     */
    pageTurnTimeoutMs: number;
}
export declare const DEFAULT_GUOPIN_CONFIG: GuopinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeGuopinConfig(override: unknown): GuopinConfig;
/**
 * 国聘特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 国聘是政府平台、antiBot 低档，原实现就写着"**走通用文案判定，不编平台特有墙信号**" ——
 * 所以这里是最轻的一档：只多几条验证码选择器与文案。
 *
 * 两处必须显式带上（否则会悄悄改行为）：
 *   * `人机验证` 留在 **`rateText`** 而不是搬去 `captchaText`：搬过去会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginTextLength` 放到极大 = **保留**它原本"登录墙不看页面长度"的语义。
 */
export declare const GUOPIN_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".geetest_box", "#nc_1_wrapper", ".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
    readonly rateText: readonly ["人机验证"];
    readonly loginText: readonly ["请登录", "登录后才能"];
    readonly loginTextLength: 1000000;
};
//# sourceMappingURL=config.d.ts.map