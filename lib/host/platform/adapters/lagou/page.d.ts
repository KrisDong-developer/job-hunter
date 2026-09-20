/**
 * 拉勾的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob, RawJobDetail } from '../../types.js';
import type { LagouDetailSelectors, LagouSelectors } from './config.js';
/**
 * **在页面上下文里**解析详情页（选择器为经典结构，**待含登录夹具校准**）。
 * ⚠️ 必须完全自包含。详情页选择器未校准且有些字段需登录；打不开时调用方判墙兜底。
 */
export declare function extractDetailInPage(arg: {
    selectors: LagouDetailSelectors;
}): RawJobDetail;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * ⚠️ **待含登录夹具校准**。只认**结构性信号**（已登录时头部有用户头像/「我的」入口），
 * 不认"页面上有没有『登录』两个字" —— 正常结果页右上角一直有登录入口。
 */
export declare function isLoggedInInPage(): boolean;
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上被序列化送进浏览器执行）。
 * 解析以**语义模式**为主（与猎聘同族做法）：选择器是"锚点提示"，命中就细化，
 * 不命中就从卡片文本抠 —— 这样即使 class 变了，薪资/经验/学历/地点仍能采到。
 * 锚不中的字段留空/记 notes，由字段级断言隔离进 pending_repair，**不编**。
 */
export declare function extractJobsInPage(arg: {
    selectors: LagouSelectors;
    salaryPattern: string;
    jobIdPattern: string;
    infoSeparator: string;
    publishPattern: string;
}): RawJob[];
/**
 * **在页面上下文里**取「下一页」的真实 href（返回绝对 URL）。
 * 拉勾翻页靠 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 无法逐城推导 ——
 * 所以**读站点生成的分页链接**，而不是自己拼（zhaopin `nextPageUrlInPage` 同一套路）。
 */
export declare function nextPageUrlInPage(arg: {
    pagination: string;
    next: string;
}): string | null;
/** **在页面上下文里**判「下一页」是否可用。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    next: string;
}): boolean;
//# sourceMappingURL=page.d.ts.map