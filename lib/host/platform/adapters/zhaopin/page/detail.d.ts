/**
 * 智联**详情页**（`/jobdetail/{id}.htm`）的页面上下文函数。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJobDetail } from '../../../types.js';
import type { ZhaopinConfig } from '../config.js';
/**
 * **在页面上下文里**解析职位详情页，返回完整 `RawJobDetail`（列表扫码的字段 + `jdText`）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，闭包不存在。只依赖
 * `config`、`document`、`location` —— 任何模块级符号都会 `ReferenceError`。
 *
 * ⚠️ **关键掩码事实（2026-09-18 实测）**：详情页未登录时 **DOM 层薪资/地址被掩码**
 * （`**-**元` / `深圳**********`），但 `__INITIAL_STATE__.jobDetail.detailedPosition` 里
 * 是真实值（`salary: "1-1.1万"`）。所以薪资/JD 正文等**以载荷为准**，DOM 只兜底公司名
 * 这类页面本体就暴露的东西。
 *
 * 载荷字段名（平台自己的，不是 `RawJob` 的）：`positionName`（标题）、`salary`、
 * `positionWorkingExp`、`education`、`description`（JD 纯文本）、`welfareTags`。
 */
export declare function extractJobDetailInPage(config: ZhaopinConfig): RawJobDetail;
//# sourceMappingURL=detail.d.ts.map