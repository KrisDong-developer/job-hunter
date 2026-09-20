/**
 * 国聘网的**列表页页面上下文函数**：卡片遍历解析、点击翻页、分页状态、登录态锚点。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录（卡片真实 DOM、薪资 18/20、内容哈希幂等键、翻页点击契约）见 `../index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js';
import type { GuopinConfig } from '../config.js';
/**
 * **在页面上下文里**解析列表页 —— 卡片遍历（probe 实证结构），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 事实（2026-09-18 probe 实证 `test/fixtures/guopin-search.html`，2026-09-20 复核修正）：
 *   * 卡片容器 `.job-card`；标题 `.job-name`；城市在 `.job-title[title]`（`标题 「城市-区域」`）；
 *   * `.job-info .tag-item` 是「性质/经验/学历」（顺序不固定，经验偶缺，按词表归类）；
 *   * `.job-info .job-salary` 是薪资（**18/20 卡片有**：面议 / 10~13K / 8~9K·16薪…；
 *     旧结论"列表卡片无薪资"是对恰好无薪资首卡的过采样，已推翻 —— 读不到留空由详情页兜底）；
 *   * **列表卡片无岗位 id、无详情链接 / 持久化载荷** —— 详见文件头；
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
 * **在页面上下文里**连点「下一页」直到目标页（自包含）。
 *
 * 为什么是"点击"而不是 URL 参数（2026-09-20 `probe:guopin-pagination` 实测定案）：
 *   * URL `?page=2` 被 SPA **忽略**（active 仍是 1）—— 智联式的 URL 寻址在国聘不成立；
 *   * 真鼠标点 `.ant-pagination-item-2` **有效**（active=2、数据换 9/20）。
 *
 * 实现口径：
 *   * 点击用 `element.click()`（**采集侧**翻页，不是打招呼那种高危动作 —— §7 的 CDP Input
 *     级要求不适用；ant-design 是 React，合成事件挂在 root 上，`el.click()` 的原生冒泡
 *     会被 onChange 正常接到）。探针已实证 CDP 点击有效，这条是它的等效低风险实现；
 *   * 每点一步都**等 `.ant-pagination-item-active` 的页码真的变了**才点下一步 ——
 *     不看页码就连点，会把"点了没反应"当成翻页成功，重复读同一页还不自知；
 *   * 任何一步失败（next 不在 / disabled / 超时页码没变）都返回 false，
 *     由 `gotoSearch` 抛错（fail-closed：翻不到目标页就别读假数据）。
 */
export declare function turnToPageInPage(arg: {
    next: string;
    nextDisabled: string;
    active: string;
    targetPage: number;
    stepTimeoutMs: number;
}): Promise<boolean>;
/**
 * **在页面上下文里**读「还有没有下一页」（自包含）。
 *
 * 判据（2026-09-20 实测的 ant 分页结构）：`li.ant-pagination-next` 存在且
 * **不带** `ant-pagination-disabled` → 还有下一页；分页区整个不在（0 条结果 /
 * 离线夹具）→ false。主链在 `pageNo < maxPages` 时才会问，这里如实回答。
 */
export declare function hasNextPageInPage(arg: {
    next: string;
    nextDisabled: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含；与 zhipin 的同名函数同构）。
 *
 * 判据来自两份真实页面的对比（命中数两端验证，2026-09-20）：
 *
 * | 锚点 | 未登录夹具 | 登录态快照 |
 * |---|---|---|
 * | `.avatar-box .user-name`（页头用户区，文本是脱敏手机号） | 无 | **有** |
 * | `a.login`（页头「登录/注册」，href 是 `/login?redirect=…`） | **有** | 无 |
 *
 * 两者都不在 ⇒ 返回 `null`（**判不出来**），由适配器落成 `false`（保守：
 * 宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export declare function isLoggedInByMarkersInPage(arg: {
    loggedIn: string;
    notLoggedIn: string;
}): boolean | null;
//# sourceMappingURL=list.d.ts.map