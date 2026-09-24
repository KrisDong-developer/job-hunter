import type { RawEnrichment } from '../../types.js';
/** 解析结果：record + 命中字段名（字段健康日志用 —— 页面改版时"命中率掉到 0"要能看见）。 */
export interface ExtractResult {
    record: RawEnrichment;
    hits: string[];
}
/**
 * 解析天眼查公司详情页 HTML。两级来源合并：NEXT_DATA 先取，DOM 补缺。
 * `matchedName` 两级都拿不到时回退用 URL 之外的文本首段 —— 拿不到就给空串
 * （入库前的 matcher/调用方会再校验，不在此编造）。
 */
export declare function extractDetailHtml(html: string, sourceUrl: string): ExtractResult;
//# sourceMappingURL=extractor.d.ts.map