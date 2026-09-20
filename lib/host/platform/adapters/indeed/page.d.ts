/**
 * Indeed 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 —— 列表页解析与翻页判断。
 *
 * 完整实测记录（JCS 结构、"同卡"向上爬的锚点策略、下一页的 `aria-disabled` 禁用态）见 `./index.ts` 文件头。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 */
import type { RawJob } from '../../types.js';
import type { IndeedSelectors } from './config.js';
/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export declare function extractJobsInPage(arg: {
    selectors: IndeedSelectors;
    host: string;
    jobKeyPattern: string;
    salaryPattern: string;
}): RawJob[];
/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledAttr: string;
}): boolean;
//# sourceMappingURL=page.d.ts.map