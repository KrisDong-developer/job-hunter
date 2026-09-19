/**
 * Store 门面：打开库 → 迁移 → 组装各表仓储。
 *
 * 领域层只依赖这个门面，不直接碰 `DatabaseSync` —— 这样“sqlite 是 experimental、
 * API 可能变”的风险被隔离在 `store/` 之内（R2、ADR-2）。
 */
import type { DatabaseSync } from 'node:sqlite';
import { type MigrationReport } from './migrate.js';
import { type AccountRepo } from './repo/accounts.js';
import { type AuditRepo } from './repo/audit.js';
import { type BranchRepo } from './repo/campus.js';
import { type CompanyRepo } from './repo/companies.js';
import { type CrawlRunRepo } from './repo/crawl-runs.js';
import { type DedupGroupRepo } from './repo/dedup-groups.js';
import { type DictionaryRepo } from './repo/dictionary.js';
import { type FieldHealthRepo } from './repo/field-health.js';
import { type FlagRepo } from './repo/flags.js';
import { type JobRepo } from './repo/jobs.js';
import { type LlmCallRepo } from './repo/llm-calls.js';
import { type OfferRepo } from './repo/offers.js';
import { type PlanRepo } from './repo/plans.js';
import { type PipelineRepo } from './repo/pipeline.js';
import { type PlatformRepo } from './repo/platforms.js';
import { type RepairRepo } from './repo/repairs.js';
import { type ResumeRepo } from './repo/resumes.js';
import { type SettingRepo } from './repo/settings.js';
import { type SignalRepo } from './repo/signals.js';
import { type TailoringRepo } from './repo/tailorings.js';
import { type TodoRepo } from './repo/todos.js';
export interface Store {
    readonly db: DatabaseSync;
    readonly path: string;
    readonly dataDir: string;
    readonly migration: MigrationReport;
    readonly platform: PlatformRepo;
    readonly account: AccountRepo;
    readonly plan: PlanRepo;
    readonly company: CompanyRepo;
    readonly job: JobRepo;
    readonly crawlRun: CrawlRunRepo;
    readonly repair: RepairRepo;
    readonly fieldHealth: FieldHealthRepo;
    readonly todo: TodoRepo;
    readonly setting: SettingRepo;
    readonly dictionary: DictionaryRepo;
    readonly flag: FlagRepo;
    readonly signal: SignalRepo;
    readonly dedupGroup: DedupGroupRepo;
    readonly audit: AuditRepo;
    readonly llmCall: LlmCallRepo;
    readonly resume: ResumeRepo;
    readonly tailoring: TailoringRepo;
    readonly pipeline: PipelineRepo;
    /** Offer（§4.H H1/H3）：拿到手之后的逐项对比与截止倒计时。 */
    readonly offer: OfferRepo;
    /** 校招与海外支线（P8）：两条支线的表放在一起，因为它们共享"不可逆节点"这个约束。 */
    readonly branch: BranchRepo;
    close(): void;
}
export interface OpenStoreOptions {
    /** 覆盖数据目录；不传则按 `DSH_JOB_HUNTER_DATA_DIR` → `$DSH_HOME/job-hunter` 解析。 */
    dataDir?: string;
    now?: () => Date;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/**
 * 打开并迁移主库。
 *
 * @throws DomainError('DATA_UNAVAILABLE') application_id 不符，或迁移失败（已回滚）
 */
export declare function openStore(options?: OpenStoreOptions): Store;
//# sourceMappingURL=store.d.ts.map