import type { EnrichmentCandidateDto } from '../../shared/contract/dto/job.js';
import type { CompanyEnrichmentRecord, CompanyRepo } from '../store/repo/companies.js';
import type { BrowserManager } from '../platform/browser.js';
import type { SettingRepo } from '../store/repo/settings.js';
/** 编排层的依赖（由 runtime 组装注入，测试可给离线假件）。 */
export interface EnrichmentDeps {
    browser: Pick<BrowserManager, 'ensure' | 'page' | 'release' | 'touch'>;
    companies: Pick<CompanyRepo, 'get' | 'upsertEnrichment'>;
    settings: Pick<SettingRepo, 'get' | 'set'>;
    /** 查询成功后的广播（宿主侧 bump revision 刷新两处界面）。 */
    onEnriched?: (companyId: number) => void;
}
/** 编排结果（路由层原样翻给界面）。 */
export type EnrichOutcome = {
    kind: 'done';
    enrichment: CompanyEnrichmentRecord;
} | {
    kind: 'pick-one';
    candidates: EnrichmentCandidateDto[];
} | {
    kind: 'unmatched';
};
/**
 * 查一家公司的工商快照。
 *
 * @param pick 用户从候选里点选的那条（`pickUrl` 来自上一次 `pick-one` 的返回）——
 *             传了就跳过搜索直接进详情，以 `manual` 置信级入库。
 */
export declare function enrichCompany(deps: EnrichmentDeps, companyId: number, pick?: {
    url: string;
    name?: string;
}): Promise<EnrichOutcome>;
//# sourceMappingURL=index.d.ts.map