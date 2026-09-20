/**
 * 拉勾适配器的配置面：选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 merge。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/** 列表页选择器（默认射到经典结构，**待 probe:lagou 夹具校准**，DB 可覆盖）。 */
export interface LagouSelectors {
    /** 岗位卡片容器。 */
    card: string;
    /** 标题链接（标题 + 详情 URL + 岗位 id 三合一）。 */
    titleLink: string;
    /** 标题节点（经典 DOM 内嵌在 titleLink 里）。 */
    titleNode: string;
    /** 薪资。 */
    salary: string;
    /** 公司链接。 */
    company: string;
    /** 「城市·区域」容器（经典结构在 li_b_l 里，文本形如【深圳-南山】）。 */
    location: string;
    /** 「经验 / 学历」所在行。 */
    infoLine: string;
    /** 职位标签。 */
    jobTags: string;
    /** 发布时间。 */
    publish: string;
    /** 分页容器。 */
    pagination: string;
    /** 「下一页」链接。 */
    next: string;
}
/** 详情页选择器集（经典结构，**待含登录夹具校准**，DB 可覆盖）。 */
export interface LagouDetailSelectors {
    /** 标题（经典 `//div[@class='name']/h1`）。 */
    title: string;
    /** 「薪资 / 城市 / 经验 / 学历 / 性质」这一行（经典 `dd.job_request`）。 */
    request: string;
    /** JD 全文（经典 `dd.job_bt`）。 */
    jdText: string;
    /** 公司。 */
    company: string;
}
/** 字段 → URL 参数映射。 */
export interface LagouUrlParams {
    /** 基础地址；关键词拼成 `${base}list_<关键词>`。 */
    base: string;
    /** 城市参数（中文名，全国 = 省略该参数）。 */
    cityParam: string;
    /** 排序参数（实测 `px=new` = 最新）。 */
    sortParam: string;
}
export interface LagouConfig {
    selectors: LagouSelectors;
    urlParams: LagouUrlParams;
    /**
     * 城市名 → 城市名（identity）。拉勾 `city` 参数就是**中文城市名**，全国 → 空串 = 省参。
     * 这份枚举只为 UI 筛选器给常用城市；未列出的城市以自由文本照收（不需要码表）。
     */
    cityNames: Record<string, string>;
    /** 薪资文本模式（序列化进页面）。 */
    salaryPattern: string;
    /** 详情链接里抠纯数字 id 的模式（`/wn/jobs/<id>.html` 或 `/jobs/<id>.html`）。 */
    jobIdPattern: string;
    /** 「经验/学历」行里的分隔符（页面显示形如「经验3-5年 / 本科」，是「 / 」）。 */
    infoSeparator: string;
    /** 发布时间的文本模式（`YYYY-MM-DD` 形态）。 */
    publishPattern: string;
    /** 详情页选择器（**待含登录夹具校准**）。 */
    detailSelectors: LagouDetailSelectors;
    /**
     * v2 接口化解析（对照猎聘/神仙外企双通道）：非空启用时 `readListPage` 先在页面上下文里
     * POST `positionAjax.json`，拿到的字段比 DOM 富（createTime/companySize/financeStage/industryField），
     * 失败或空结果自动回退 DOM —— 永不比 v1 差。接口需要页面会话的 anti-forge cookie/token，是否被
     * 服务端接受**待真实抓取验证**；不接受也无妨，静默走 DOM 通道。
     */
    searchApiOrigin: string;
    searchApiPath: string;
    /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
    searchApiEnabled: boolean;
}
/** 城市名清单（identity 映射；全过 = 不带 city 参数）。 */
export declare const LAGOU_CITY_NAMES: Record<string, string>;
export declare const LAGOU_SALARY_PATTERN = "\\d+(?:\\.\\d+)?k\\s*[-~]\\s*\\d+(?:\\.\\d+)?k(?:\\.\\d+)?|\\d+(?:\\.\\d+)?k\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/** 详情链接形态：`/wn/jobs/<纯数字>.html`（新）或 `/jobs/<纯数字>.html`（旧）。 */
export declare const LAGOU_JOB_ID_PATTERN = "/(?:wn/jobs|jobs)/(\\d+)\\.html";
/** 经验/学历分隔符（页面显示「经验3-5年 / 本科」，是带空格的「 / 」）。 */
export declare const LAGOU_INFO_SEPARATOR = "/";
/** 发布时间形态：`YYYY-MM-DD`。 */
export declare const LAGOU_PUBLISH_PATTERN = "\\d{4}[-/]\\d{2}[-/]\\d{2}";
/** 搜索接口（v2 双通道）：POST `/jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`。 */
export declare const LAGOU_SEARCH_API_PATH = "/jobs/positionAjax.json";
/** 详情页选择器默认值（经典结构，`//div[@class='name']/h1` 等；**待含登录夹具校准**）。 */
export declare const DEFAULT_LAGOU_DETAIL_SELECTORS: LagouDetailSelectors;
/** 排序取值域：只有「最新」（`px=new`）有线上证据（搜索页排序区回显 px=new）。 */
export declare const LAGOU_SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 发布时间窗：拉勾搜索 URL 不暴露该维度（那套筛选走 positionAjax POST），值域为空。 */
export declare const LAGOU_POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 单次抓取页数上限。拉勾 antiBot=high（WAF 滑块），给得保守：
 * 默认 3 页、上限 10 页。
 */
export declare const LAGOU_DEFAULT_MAX_PAGES = 3;
export declare const LAGOU_MAX_PAGES = 10;
export declare const DEFAULT_LAGOU_CONFIG: LagouConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeLagouConfig(override: unknown): LagouConfig;
/**
 * 拉勾特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 最特有的一条是 **WAF 滑块页的 URL 特征**：`appkey: "CF_APP_WAF"`、sceneId 随机，
 * URL 变成 `/s/list_<随机hex>`，正文「请滑动滑块进行验证」—— 判 `captcha`，命中即停
 * （C12：重试等于再撞一次滑块）。文案也一并带上，与 URL 特征双保险。
 */
export declare const LAGOU_BLOCK_SIGNALS: {
    readonly urlPatterns: readonly ["lagou\\.com/s/list_"];
    readonly captchaSelectors: readonly [".geetest_box", "#nc_1_wrapper", ".slide-verify-panel"];
    readonly captchaText: readonly ["请滑动滑块进行验证", "为了更好的访问体验", "请完成验证", "滑动滑块"];
    readonly loginText: readonly ["手机号登录", "邮箱登录"];
};
//# sourceMappingURL=config.d.ts.map