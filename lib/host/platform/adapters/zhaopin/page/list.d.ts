/**
 * 智联**列表页**的页面上下文函数：卡片解析 / 登录态 / 下一页地址 / 总页数与当前页。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js';
import type { ZhaopinConfig } from '../config.js';
/**
 * **在页面上下文里**把内嵌的 `__INITIAL_STATE__` 载荷读成紧凑数组。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。
 *
 * ⚠️ 也**绝不能返回整个 state** —— `page.evaluate` 只能回传标量 JSON，
 * 而这个载荷有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 为什么从 `document` 的 script 文本里解析，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 */
/**
 * 载荷解析**必须**留在 `extractJobsInPage` 内部，不能提成模块级函数：
 * 页面函数会被序列化后送进浏览器，闭包不存在，引用任何模块作用域的符号都会
 * `ReferenceError` 并导致整页解析失败（51job 踩过同一个坑）。
 */
/**
 * **在页面上下文里**解析列表页（DOM 为主，内嵌载荷补字段）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量或函数都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。所以**载荷解析与配平全部内联在函数体里** ——
 * 抽成模块级的 `readStateFromPage()` 看着更整洁，但一上真浏览器就整页失败。
 * `test/platform/zhaopin.test.ts` 的「按源码重建」护栏就是钉死这条的。
 *
 * ⚠️ 载荷**绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，
 * 而它在真实页面上有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 合并策略：`__INITIAL_STATE__.positionList` 与 `.joblist-box__item` **渲染顺序一致**
 * （实测都是 20 条、逐条对得上），按索引配对；DOM 能给的优先用 DOM
 * （它是"页面实际展示了什么"的直接证据），DOM 给不了的（发布时间/行业/公司规模）
 * 用载荷补。
 *
 * 为什么从 `document` 的 script 文本里解析载荷，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: ZhaopinConfig): RawJob[];
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 只认**结构性信号**，不认文案：实测 `/sou/` 结果页在未登录时会给列表容器和
 * 每张卡片加上 `-unlogin` 修饰类（`positionlist__list-unlogin` /
 * `joblist-box__item-unlogin`），底部还有一个 `positionlist__login-foot`。
 * 这些比"页面上有没有『登录』两个字"稳得多 —— 后者在**正常结果页**上同样成立
 * （右上角一直有登录入口），拿它判断会导致"永远判定为未登录"。
 */
export declare function isLoggedInInPage(_arg: {
    loginPopup: string;
    loginGateText: string;
}): boolean;
/**
 * **在页面上下文里**取下一页的无 query path 地址。
 *
 * 为什么读真实 href 而不是自己拼：站点把关键词编码成了自己的 token
 * （`/sou/jl765/kw01500O80EO062/p2`），明文塞进 path 会被判无效并返回 0 条。
 * 分页区的 href 是**站点自己生成的**，直接用它最稳，也顺带满足 robots（无 query）。
 */
export declare function nextPageUrlInPage(arg: {
    pagination: string;
}): string | null;
/** 站点自报的总页数（用于"别翻过实际页数"）。 */
export declare function totalPagesInPage(): number;
/** 当前页码（从内嵌载荷里读）。 */
export declare function currentPageInPage(): number;
//# sourceMappingURL=list.d.ts.map