import type { RawEnrichment } from '../../types.js';
/** 解析结果：record + 命中字段名（字段健康日志用 —— 页面改版时"命中率掉到 0"要能看见）。 */
export interface ExtractResult {
    record: RawEnrichment;
    hits: string[];
}
/**
 * 解析天眼查公司详情页 HTML。两级来源合并：NEXT_DATA 先取，DOM 补缺。
 * matchedName 只信 NEXT_DATA（文本回退会命中页头噪声，宁可 null —— 编排层用公司名兜底）。
 */
export declare function extractDetailHtml(html: string, sourceUrl: string): ExtractResult;
//# sourceMappingURL=extractor.d.ts.map