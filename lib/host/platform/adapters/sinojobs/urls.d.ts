/**
 * SinoJobs 的 URL 与请求体构造 —— **宿主机侧**（不碰 `document`）。
 *
 * 筛选条件不在 URL 里：URL 只承载页面自己的 `keywords`，真正的筛选全部走 POST body。
 * 完整实测记录（接口参数表、取值依据）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { SinoJobsConfig } from './config.js';
/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 与神仙外企同理：筛选条件**不在 URL 里**（全部走 POST body），URL 只承载
 * 页面自己的 `keywords`（仅供人核对）。城市仍然在这里校验 ——
 * 表里没有的城市直接返回 `null`（**不猜**，否则"城市没配"会变成一次静默的全国搜索）。
 */
export declare function buildSinoJobsSearchUrl(config: SinoJobsConfig, criteria: SearchCriteria): string | null;
/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export declare function buildSinoJobsRequestBody(config: SinoJobsConfig, criteria: SearchCriteria, page: number): Record<string, string>;
//# sourceMappingURL=urls.d.ts.map