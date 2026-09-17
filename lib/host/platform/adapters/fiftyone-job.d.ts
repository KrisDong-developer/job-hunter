/**
 * 前程无忧（51job）适配器。
 *
 * 两条设计要点：
 *
 * 1. **选择器与字段→URL 映射是配置，不是硬编码**（ADR-19 / D-18）。
 *    代码里带一份默认值，DB 里的覆盖优先（`setting` 表：scope='platform'、scope_ref='51job'、
 *    key='adapter-config'）。选择器坏了自己在 UI 改，不用等发版（J2 / R5）。
 *
 * 2. **解析函数是自包含的**，因为它在真路径上会被序列化后送进浏览器执行
 *    （`page.evaluate`）。它只读全局 `document`、只依赖入参 `config`，
 *    绝不引用模块作用域的自由变量 —— 否则真路径会 ReferenceError。
 *    离线测试用 jsdom 提供同一个 `document`，于是**同一份代码**在两条路径上跑。
 */
import type { BlockKind } from '../../../shared/enums.js';
import type { RawJob, SiteAdapter } from '../types.js';
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
 * 51job 支持的排序取值域（实测于搜索页 URL）。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export declare const SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 发布时间窗取值域（天）。 */
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
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字上限）都会变成 `ReferenceError: X is not defined`。
 * 这条曾经真的踩过：`MAX_CARDS` 原本是模块级常量，离线 jsdom 测试照样通过
 * （Node 里闭包还在），一上真浏览器就整页解析失败。
 * 兜底办法是 `test/platform/fiftyone.test.ts` 里的「按源码重建函数」测试。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: FiftyOneConfig): RawJob[];
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙。
 *
 * 命中即停、交还人工，**不硬重试**（C12 / P5）。宁可少抓，也不能把账号搞坏。
 */
export declare function detectBlockInPage(arg: {
    card: string;
}): BlockKind | null;
export interface FiftyOneAdapterOptions {
    config?: FiftyOneConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 51job 适配器。 */
export declare function createFiftyOneAdapter(options?: FiftyOneAdapterOptions): SiteAdapter;
/** 在页面上下文里找「下一页」是否可用（P1 只用于判断是否还有更多页）。 */
export declare function hasNextPageInPage(_arg: Record<string, never>): boolean;
//# sourceMappingURL=fiftyone-job.d.ts.map