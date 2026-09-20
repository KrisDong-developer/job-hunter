/**
 * HiredChina 的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob, RawJobDetail } from '../../types.js';
import type { HiredChinaConfig, HiredChinaDetailSelectors } from './config.js';
/**
 * **在页面上下文里**解析列表页 —— 按「卡片身份锚 + 字段底色」策略（见文件头）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param config 由宿主序列化传入
 */
export declare function extractJobsInPage(arg: HiredChinaConfig): RawJob[];
/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm` JD）探针注明，待详情夹具校准。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。company 也仅从徽章行外的
 * 常用锚点 best-effort，捞不到就留空（调用方用列表的公司兜底）。
 */
export declare function extractDetailInPage(arg: {
    selectors: HiredChinaDetailSelectors;
}): RawJobDetail;
/**
 * **在页面上下文里**判断是否还有下一页：分页容器里是否存在「页码 > 当前页」的链接。
 * ⚠️ 自包含。`currentPage` 由宿主传入（真实路径上记录在 pending WeakMap 里）。
 */
export declare function hasNextPageInPage(arg: {
    selector: string;
    currentPage: number;
}): boolean;
//# sourceMappingURL=page.d.ts.map