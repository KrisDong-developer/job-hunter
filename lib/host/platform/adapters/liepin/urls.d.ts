/**
 * 猎聘的 **宿主侧**（Node）URL 与搜索请求体构造 —— 这一层不碰 `document`。
 *
 * 页面内的 fetch 通道在 `./api.ts`。完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { LiepinConfig } from './config.js';
/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export declare function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null;
/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export declare function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown>;
//# sourceMappingURL=urls.d.ts.map