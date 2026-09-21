/**
 * LinkedIn 的**详情页页面上下文函数**：解析 `/jobs/view/{id}`（游客 SSR 直出，无需登录）。
 *
 * ⚠️ **自包含警告**：本文件的函数在真机上**脱离模块作用域**执行，不得引用模块级的常量
 * 或工具函数；只做**读**（Trusted Types 红线，见 `./list.ts` 文件头）。
 * 完整调研记录与锚点真机快照说明见 `../index.ts` 文件头与 `../config.ts` 的
 * `LinkedInDetailSelectors` 注释。
 */
import type { RawJobDetail } from '../../../types.js';
import type { LinkedInDetailSelectors } from '../config.js';
/**
 * **在页面上下文里**解析详情页（已导航到 `/jobs/view/{id}` 的活 DOM）。
 *
 * 字段映射：criteria 里「职位级别」→ expReq；「职能类别 / 行业」→ tags；
 * JD 全文（`.show-more-less-html__markup` 的 textContent —— clamp 折叠是 CSS 层
 * 的事，textContent 一定是全文）→ jdText。
 */
export declare function extractDetailInPage(arg: {
    selectors: LinkedInDetailSelectors;
}): RawJobDetail;
//# sourceMappingURL=detail.d.ts.map