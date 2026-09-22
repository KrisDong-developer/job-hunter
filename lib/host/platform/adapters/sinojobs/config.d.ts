/**
 * SinoJobs 的配置面：字段名 / 选择器接口 / 值域 / 地点码表 / 种子表 / 判墙信号常量 + `merge*`。
 *
 * 纯数据 + 纯函数，**不含**任何 `document` / 页面上下文逻辑（那些在 `./page.ts`）。
 * 完整实测记录（接口契约、robots 取舍、逐项实测证据）见 `./index.ts` 文件头。
 */
/** 页面外壳地址（人看的入口；筛选条件不在 URL 里，见 `buildSinoJobsSearchUrl`）。 */
export declare const SINOJOBS_WEB_BASE = "https://sinojobs.com.cn";
/** 列表接口路径（POST，表单编码）。 */
export declare const SINOJOBS_API_PATH = "/Recruitment/indexAjaxPage.html";
export declare const SINOJOBS_LIST_URL = "https://sinojobs.com.cn/Recruitment/index.html";
/** 详情页 URL 模板。`{jobId}` 会被替换（详情页是服务端渲染的静态 HTML）。 */
export declare const SINOJOBS_DETAIL_URL_TEMPLATE = "https://sinojobs.com.cn/Recruitment/content.html?id={jobId}";
/**
 * 单页容量。站点自己用 15（分页插件 `pageSizeOpt: 5/10/15/20` 家族），
 * 实测接口收 20/50/100 都正常 —— 用 20 在"站点自己用过的取值"里取最大，
 * 少几轮请求（全量 78 条 → 4 页）。
 */
export declare const SINOJOBS_PAGE_SIZE = 20;
/**
 * 页数上限。全量池实测 78 条（20 条/页 → 4 页），关键词搜索只会更少。
 * 给 6 页留足余量，同时把抓取深度压得保守（§P5 保守优先）。
 */
export declare const SINOJOBS_MAX_PAGES = 6;
/** 薪资取值域（页面筛选项 `#work-salary strong[rel]`，rel 即接口 `salary_range`）。 */
export declare const SINOJOBS_SALARY_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 经验取值域（`#work-year strong[rel]`，rel 即接口 `experience`）。 */
export declare const SINOJOBS_EXPERIENCE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 工作性质取值域（`#work_nature`，值即接口 `work_nature`）。 */
export declare const SINOJOBS_WORK_NATURE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 地点取值域（`address_id`）。
 *
 * 取值来自平台自己的级联接口 `POST /Common/selectAddress.html`（实测）：
 * 第一级是 `10000`=国内 / `10001`=国外；选国内后第二级就是省份（北京=1、上海=3…
 * 海外=35）。站点搜索用的是 `select[name="work_city[]"]:last` 的**最后一级**值，
 * 所以省级 id 直接可当 `address_id` 用（实测 `address_id=3` → 只回上海岗）。
 *
 * 只放**实测拿到**的省级值；城市级（三级）id 要逐市点一遍级联才拿得到，未内置 ——
 * 需要时走 DB 覆盖 `config.addressCodes`（`setting(scope='platform', scope_ref='sinojobs', key='adapter-config')`）。
 */
export declare const SINOJOBS_ADDRESS_CODES: Record<string, string>;
/**
 * 行业类别取值域（`job_type`）—— 实测 seed，来自页面 `#job_type` 的全部 43 项。
 *
 * 与城市同一套「人工维护 + DB 覆盖」逻辑；站点增删行业时在 DB 覆盖 `jobTypeList` 即可。
 */
export declare const SINOJOBS_JOB_TYPE_SEED: Array<{
    id: string;
    name: string;
}>;
/**
 * 记录字段名 → 我们的语义。平台改字段名时**在 DB 里覆盖着改**即可（ADR-19）。
 * 右边一列全部来自实测响应原文（`test/fixtures/sinojobs-list-payload.json`）。
 */
export interface SinoJobsFields {
    id: string;
    title: string;
    company: string;
    /** 城市文本（`国外` / `上海` / `常州`…）。 */
    workCity: string;
    /** 发布时间，**Unix 秒**（字符串）。 */
    releaseTime: string;
    /** 截止时间，Unix 秒（字符串）。 */
    endTime: string;
    /** 置顶时间戳；null 或值（字符串化后空串 = 未置顶）。 */
    topTime: string;
    salaryRange: string;
    experience: string;
    education: string;
    companyId: string;
    logo: string;
}
export interface SinoJobsConfig {
    webBase: string;
    apiPath: string;
    /** 单页容量（默认 `SINOJOBS_PAGE_SIZE`）。 */
    pageSize: number;
    detailUrlTemplate: string;
    /** 地点名 → `address_id`。 */
    addressCodes: Record<string, string>;
    /** 行业类别（`job_type`）取值域。实测 seed，可在 DB 覆盖扩充。 */
    jobTypeList: Array<{
        id: string;
        name: string;
    }>;
    fields: SinoJobsFields;
    /** 只用于"等页面渲染"，**不用于解析**（解析走接口 / 详情页 DOM；翻页判据是接口 total）。 */
    selectors: {
        card: string;
    };
    /**
     * 详情页解析用的选择器（详情页是服务端渲染的静态 HTML，结构来自真实镜像夹具
     * `test/fixtures/sinojobs-detail.html`：概要与正文分居 `.Resume-info1` / `.Resume-info2`）。
     */
    detail: {
        /**
         * 概要区容器（标题 `h5` / 公司 `h6` / 信息列表 `ul` 都在这里面）。
         *
         * 为什么要限定作用域：正文区的小节标题（「职位描述」/「任职要求」…）也是 `h6`
         * —— 概要区一旦缺位，"全局取第一个 h6"就会把**小节标题当公司名**写进结果。
         * 容器未命中时相关字段按未锚定处理（留空 + note），**不回退整页**（fail-closed）。
         */
        headBox: string;
        /** 职位名（概要区里的 `h5`；缺位时由 `document.title` 去站名后缀兜底）。 */
        title: string;
        /** 公司名（概要区第一个 `h6`）。 */
        company: string;
        /** 信息列表（薪资 / 城市 / 经验 / 工作性质 / 发布时间 五项）。 */
        infoList: string;
        /** 正文区容器（职位描述 / 任职要求 / 联系方式 / 公司信息的 `h6` + `p`）。 */
        bodyBox: string;
        /** JD 段落（正文区里的 `p`）。 */
        jdBlocks: string;
    };
}
export declare const DEFAULT_SINOJOBS_CONFIG: SinoJobsConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeSinoJobsConfig(override: unknown): SinoJobsConfig;
/**
 * SinoJobs 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 走"**共享词表、自有结构**"（同 zhaopin）：列表不是 DOM 渲染的，"卡片数"由上层算好后传进来，
 * 而且它有一个独有的**弹窗判据**（`.xcConfirm` 里带登录字样）——
 * 这既是结构差异，也不适合塞进共享函数。
 */
export declare const SINOJOBS_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
    readonly blankTextLength: 80;
};
//# sourceMappingURL=config.d.ts.map