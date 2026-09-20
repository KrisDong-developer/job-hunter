/**
 * Indeed 的 URL 构造（宿主机侧）：搜索 URL 的拼装，**不碰 `document`**。
 *
 * 本函数原本就是"接收 config 的顶层函数"，搬运时签名与函数体一字未改。
 *
 * 完整实测记录（`start` 步进与 `pageSize` 的关系、地点是自由文本、中国站停运）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { IndeedConfig } from './config.js';
/**
 * 构造搜索 URL：`https://{host}/jobs?q=Java&l=北京&start=0`。
 * 关键词 / 地点都是**自由文本**，没有城市码映射 —— 地点为空就不带 `l=`。
 * `criteria.page` 是 1 起（项目约定）；`start` = (page-1) * pageSize（0 起）。
 */
export declare function buildIndeedSearchUrl(config: IndeedConfig, criteria: SearchCriteria): string;
//# sourceMappingURL=urls.d.ts.map