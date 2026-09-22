/**
 * 51job 的**列表页页面上下文函数**：卡片解析、翻页判断、元素定位、登录态锚点。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js';
import type { FiftyOneConfig } from '../config.js';
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
 * 在页面上下文里找「下一页」是否可用（P1 只用于判断是否还有更多页）。
 *
 * 探针实测（2026-09）：51job 搜索页分页是 Element Plus：
 * `div.el-pagination.is-background > button.btn-prev + ul.el-pager + button.btn-next`，
 * 最大页数固定 50。**「下一页」的禁用态是按钮原生 `disabled` 属性**（实测末页时
 * `<button class="btn-next" disabled="disabled">`，DOM 上没有 `.is-disabled` 类）。
 * 所以这里必须查 `disabled` 属性而非 class —— 旧代码查 `.next:not(.disabled)` 会在末页误判「还有下一页」。
 */
export declare function hasNextPageInPage(_arg: Record<string, never>): boolean;
/** 页面上下文的元素定位结果（拟人点击的坐标来源 + 跳转线索）。 */
export interface FiftyOneElementInfo {
    found: boolean;
    x: number;
    y: number;
    text: string;
    /** 元素自带的跳转线索（`href` / `redirect-url`）。 */
    href: string;
}
/**
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标。
 *
 * 规则：只统计**可见**（有尺寸且没被 display/visibility/pointer-events 关掉）的元素；
 * `textIncludes` 非空时再按文本过滤；取**第一个命中的**。
 *
 * ⚠️ 逗号选择器返回的是**文档顺序**，不是候选优先级 —— 所以候选里只能放**同类可点元素**
 * （别放容器 div：容器总排在里面的链接之前，会被先选中）。
 * ⚠️ 必须完全自包含。`scrollIntoView` 在离线夹具里不存在，故整段 try/catch。
 */
export declare function elementCenterInPage(arg: {
    selector: string;
    textIncludes?: string;
}): FiftyOneElementInfo;
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export declare function hasSelectorInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据（2026-09-21 由真实夹具 `51job-sz.html` 校准未登录一侧）：
 *
 * | 锚点 | 未登录 | 已登录 |
 * |---|---|---|
 * | `.loginBtnClick`（页头「登录/注册」，实测命中 2 处） | **有** | 无 |
 * | `.header .user-name` 等已登录候选 | 无 | ⚠️ 未实测（登录态夹具缺位） |
 *
 * ⚠️ 旧判据是"整页判墙 ≠ login-required ⇒ 已登录"：51job 搜索**不需要登录**，
 * 未登录照样有卡片 —— 于是未登录夹具上恒判"已登录"。结构性锚点把这一侧纠正过来；
 * 已登录一侧的候选未实测，判不出来时仍按"未登录"处理（保守：宁可漏判已登录，
 * 也不要把被登录墙挡住当成"今天没有新岗位"）。已登录锚点可经 DB 覆盖修正，不必发版。
 */
export declare function isLoggedInByMarkersInPage(arg: {
    loggedIn: string;
    notLoggedIn: string;
}): boolean | null;
//# sourceMappingURL=list.d.ts.map