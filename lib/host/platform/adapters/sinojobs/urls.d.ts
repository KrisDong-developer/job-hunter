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
/**
 * 请求体字段名 —— **声明与构造共用这一份**（理由同 waiqi：声明里的 `wire.param`
 * 直接引用这里，于是"声明落到哪个参数"与"实际写哪个字段"不会各写一份字面量）。
 */
export declare const SINOJOBS_BODY_FIELDS: {
    readonly keyword: "keywords";
    readonly city: "address_id";
    readonly jobType: "job_type";
    readonly workNature: "work_nature";
    readonly salaryRange: "salary_range";
    readonly experience: "experience";
};
/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export declare function buildSinoJobsRequestBody(config: SinoJobsConfig, criteria: SearchCriteria, page: number): Record<string, string>;
//# sourceMappingURL=urls.d.ts.map