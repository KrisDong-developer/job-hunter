/**
 * BOSS 直聘的**列表页页面上下文函数**：滚动加载、卡片解析、元素定位、登录态锚点。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js';
import type { ZhipinSelectors } from '../config.js';
/**
 * **在页面上下文里**滚动加载：滚到底 → 等新卡片出现 → 重复。
 *
 * 为什么需要它：BOSS 的搜索结果**没有可寻址的第 N 页**（`&page=2` 实测无效），
 * 唯一的翻页手段就是滚动触发的懒加载。所以"抓得更深"只能在一次页面加载之内做厚。
 *
 * 两个刻意的收手条件：
 *   * 某一轮**没有新增卡片**就停（平台封顶 300 条时就是这个表现，再滚也是白滚）；
 *   * 每轮只等到 `stepTimeoutMs` —— 站点不响应时不能让整轮预算被一个页面吃干。
 *
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function scrollToLoadInPage(arg: {
    card: string;
    rounds: number;
    stepTimeoutMs: number;
}): Promise<number>;
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function extractJobsInPage(arg: {
    selectors: ZhipinSelectors;
    jobIdPattern: string;
}): RawJob[];
/** 页面上下文的元素定位结果（拟人点击的坐标来源 + 跳转线索）。 */
export interface ZhipinElementInfo {
    found: boolean;
    x: number;
    y: number;
    text: string;
    /**
     * 元素自带的跳转线索（`redirect-url` / `data-url` / `href`）。
     *
     * BOSS 的「立即沟通」按钮带 `redirect-url="/web/geek/chat/..."`。当点击**没能让
     * 当前页跳转**时（例如按钮 `target=_blank` 另开了标签页，而我们的 PageLike 只看得到
     * 当前页），用这个地址让当前页自己导航过去 —— BossHunter `_navigate_to_chat_redirect`
     * 就是为这个坑写的。
     */
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
 * 2026-09-18 实测因此把 `.btn-startchat-wrap` 从候选里剔除，见 `chatButton` 的注释。
 *
 * ⚠️ 必须完全自包含。`scrollIntoView` 在离线夹具里不存在，故整段 try/catch。
 */
export declare function elementCenterInPage(arg: {
    selector: string;
    textIncludes?: string;
}): ZhipinElementInfo;
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export declare function hasSelectorInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据来自两份真实快照的对比 —— 未登录夹具 `test/fixtures/zhipin-search.html`
 * vs 真实登录态快照 `test/fixtures/zhipin-search-logged-in.html`：
 *
 * | 锚点 | 未登录 | 已登录 |
 * |---|---|---|
 * | `a[ka="header-username"]`（页头「求职者」下拉） | 无 | **有** |
 * | `a[ka="header-login"]`（页头「登录/注册」） | **有** | 无 |
 *
 * 两者都不在 ⇒ 返回 `null`（**判不出来**），由适配器落成 `false`（保守：
 * 宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export declare function isLoggedInByMarkersInPage(arg: {
    loggedIn: string;
    notLoggedIn: string;
}): boolean | null;
//# sourceMappingURL=list.d.ts.map