import type { EnrichmentCandidateDto } from '../../shared/contract/dto/job.js';
/**
 * 搜索候选 × 本库公司名 → 匹配裁决（纯函数，离线可测）。
 *
 * 三种结果，没有"自动写个大概"：
 *   * `exact` —— **唯一**候选的注册名与本库 `name_norm` 在**严格键**上全等
 *     （保留行业词的归一化，见 util/company-name.ts：宽松键会把"华为技术"和
 *     "华为云计算"归成同一个"华为"，自动写入就张冠李戴了）→ 自动入库；
 *   * `pick-one` —— 多个 exact（全国同名公司）或没有 exact → **必须人工点选**；
 *   * `unmatched` —— 零结果（含全部候选都明显不相干时不裁这一档：宁可让人看一眼）。
 */
export type MatchVerdict = {
    kind: 'exact';
    pick: EnrichmentCandidateDto;
} | {
    kind: 'pick-one';
    candidates: EnrichmentCandidateDto[];
} | {
    kind: 'unmatched';
};
export declare function matchCandidates(companyName: string, candidates: EnrichmentCandidateDto[]): MatchVerdict;
//# sourceMappingURL=matcher.d.ts.map