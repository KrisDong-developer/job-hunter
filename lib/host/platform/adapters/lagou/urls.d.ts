/**
 * 拉勾搜索 URL / 搜索接口地址 / 请求体的**宿主机侧**构造。
 *
 * 不碰 `document`、不发请求 —— 页面内请求见 `./api.ts`，页面解析见 `./page.ts`。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { LagouConfig } from './config.js';
/**
 * 构造搜索 URL（**第 1 页**）。关键词进路径，城市用中文名进 query，全国省略 city。
 * `criteria.page > 1` 时返回 null —— 拉勾翻页要读上一页「下一页」的真实 href
 * （`/hangzhou-zhaopin/Python/2/`），由 `gotoSearch` 走 `readNextPageUrl`，**不自己拼**。
 */
export declare function buildLagouSearchUrl(config: LagouConfig, criteria: SearchCriteria): string | null;
/**
 * 构造搜索接口地址（v2 双通道）：城市在 query（中文名），全国省参。
 * `POST /jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`
 */
export declare function buildLagouSearchApiUrl(config: LagouConfig, cityName: string): string;
/** 搜索接口请求体（`kd` 关键词、`pn` 页码 1 起、`first` 首翻页标记）。 */
export declare function buildLagouRequestBody(criteria: SearchCriteria, page: number): Record<string, string>;
//# sourceMappingURL=urls.d.ts.map