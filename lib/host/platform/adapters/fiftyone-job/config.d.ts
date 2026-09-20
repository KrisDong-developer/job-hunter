/** 51job 列表页的选择器集。**每一项都可以在 UI 里改。** */
export interface FiftyOneSelectors {
    /** 卡片容器。 */
    card: string;
    title: string;
    salary: string;
    area: string;
    tags: string;
    company: string;
    /** 公司行里的「行业 / 性质 / 规模」三个 span。 */
    companyMeta: string;
    /** 承载跟踪载荷的元素（里面有 jobId / 发布时间 / 经验 / 学历）。 */
    tracking: string;
    /** 跟踪载荷所在的属性名。 */
    trackingAttr: string;
}
/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * SR-40 追加了"抓取深度"三件套（页数/排序/时间窗）的映射 ——
 * 它们**也**是 URL 参数，所以同样进配置、同样可人工修。
 */
export interface FiftyOneUrlParams {
    base: string;
    keywordParam: string;
    cityParam: string;
    pageParam: string;
    /** 排序方式（`sortType`）。取值域见 `SORT_OPTIONS`。 */
    sortParam: string;
    /** 发布时间窗（`issueDate`），单位=天。 */
    postedWithinParam: string;
}
/**
 * 51job 支持的排序取值域（探针实测 2026-09，搜索页「综合/活跃/最新/薪资/距离」五个按钮）。
 *
 * 取值来自探针逐项点击排序按钮后，读取 API `we.51job.com/api/job/search-pc` 请求里
 * `sortType=` 的实值（并用激活态 `.ss.on` 双重确认）：
 *
 * | 按钮文字 | sortType |
 * |---|---|
 * | 综合排序 | `0` |
 * | 最新优先 | `1` |
 * | 薪资优先 | `3` |
 * | 活跃职位优先 | `5` |
 * | 距离优先 | （未启用，无实值） |
 *
 * ⚠️ **「距离优先」故意不列出**：探针点击后按钮无「on」高亮、也不发请求（疑似依赖
 * 定位/经纬度上下文，当前未启用时点击不生效）。没测出实值就不编 —— 编错了用户选了
 * 只会静默拿到另一种排序（更糟）。所以 `render` 里只有上面四档。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export declare const SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 发布时间窗取值域（天）。
 *
 * **探针实测：本页面不存在「发布时间」筛选控件**（全文无「24小时/三天/一周/一个月」等文案）。
 * API 虽保留 `issueDate` 参数但恒为空。所以值域为空 —— 界面据此禁用该维度并给出原因，
 * 而不是摆一堆点击后不生效的选项。
 */
export declare const POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 页数上限：再大也不会更"全"，只会更容易触发风控。 */
export declare const FIFTYONE_MAX_PAGES = 5;
export interface FiftyOneConfig {
    selectors: FiftyOneSelectors;
    urlParams: FiftyOneUrlParams;
    /** 城市名 → 平台城市码。 */
    cityCodes: Record<string, string>;
    /** 详情页 URL 模板，`{jobId}` 会被替换。 */
    detailUrlTemplate: string;
}
export declare const DEFAULT_FIFTYONE_CONFIG: FiftyOneConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeFiftyOneConfig(override: unknown): FiftyOneConfig;
/**
 * 51job 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 两条必须显式带上，否则会**悄悄改变行为**：
 *   * 阿里云 WAF 滑块：`waf-nc-title` 文案 + `aliyunwaf_` 脚本名（get_jobs 实战特征）；
 *   * 登录墙用的是**很宽的词**（`登录|注册|扫码`），而不是通用词表里那几个完整短语 ——
 *     收紧成"扫码登录"这类短语会让一条"登录后继续"的墙**判不出来**，
 *     而 `auth.isLoggedIn` 正是靠 `block !== 'login-required'` 反推的：
 *     判不出来就会报告"已登录"，然后安静地抓到 0 条（正是本项目一直在修的那类静默失败）；
 *   * `loginTextLength` 放到极大 = **保留**它原本"没有长度上限"的语义。
 *     通用词表的 800 上限是为了防"导航栏里有『登录』但没卡片"的误判，
 *     那是个**收紧**，应当作为独立改动 + 独立断言来做，不能混在迁移里。
 */
export declare const FIFTYONE_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
    readonly loginText: readonly ["登录", "注册", "扫码"];
    readonly loginTextLength: 1000000;
    readonly blankTextLength: 80;
};
//# sourceMappingURL=config.d.ts.map