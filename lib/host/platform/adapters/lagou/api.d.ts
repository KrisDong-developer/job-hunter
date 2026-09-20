/**
 * 拉勾的**页面内请求通道**（v2 双通道）：`fetchListInPage` 用页面自己的 fetch 发 POST，
 * 结果回给宿主；`parseSearchApiResponse` 在宿主侧把响应解析成 `RawJob`（失败回退 DOM）。
 *
 * ⚠️ `fetchListInPage` 是**页面上下文函数**：会被 `page.evaluate` 序列化后送进浏览器执行，
 * 必须完全自包含 —— **不得**在本文件新增任何模块级的值供它引用。离线 jsdom 测不出这个错
 * （Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob } from '../../types.js';
/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整 Cookie/指纹/TLS，
 * 与猎聘/神仙外企同一铁律：绝不回退宿主 Node 的 fetch）。返回解析后的 JSON；
 * 任何失败返回 null（调用方走 DOM 兜底）。
 */
export declare function fetchListInPage(arg: {
    apiPath: string;
    form: Record<string, string>;
}): Promise<unknown>;
/**
 * 解析搜索接口响应（Node 侧纯函数；结构经典：`content.positionResult.result[]`）。
 * 字段比 DOM 富：createTime（毫秒）/ companySize / financeStage / industryField / positionAdvantage。
 */
export declare function parseSearchApiResponse(payload: unknown): RawJob[];
//# sourceMappingURL=api.d.ts.map