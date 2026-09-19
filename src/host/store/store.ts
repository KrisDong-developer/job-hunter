/**
 * Store 门面：打开库 → 迁移 → 组装各表仓储。
 *
 * 领域层只依赖这个门面，不直接碰 `DatabaseSync` —— 这样“sqlite 是 experimental、
 * API 可能变”的风险被隔离在 `store/` 之内（R2、ADR-2）。
 */
import type { DatabaseSync } from 'node:sqlite'
import { DomainError, messageOf } from '../util/errors.js'
import { closeDatabase, openDatabase, resolveDataDir, resolveDbPath } from './db.js'
import { currentVersion, migrate, type MigrationReport } from './migrate.js'
import { createAccountRepo, type AccountRepo } from './repo/accounts.js'
import { createAuditRepo, type AuditRepo } from './repo/audit.js'
import { createBranchRepo, type BranchRepo } from './repo/campus.js'
import { createCompanyRepo, type CompanyRepo } from './repo/companies.js'
import { createCrawlRunRepo, type CrawlRunRepo } from './repo/crawl-runs.js'
import { createDedupGroupRepo, type DedupGroupRepo } from './repo/dedup-groups.js'
import { createDictionaryRepo, type DictionaryRepo } from './repo/dictionary.js'
import { createFieldHealthRepo, type FieldHealthRepo } from './repo/field-health.js'
import { createFlagRepo, type FlagRepo } from './repo/flags.js'
import { createJobRepo, type JobRepo } from './repo/jobs.js'
import { createLlmCallRepo, type LlmCallRepo } from './repo/llm-calls.js'
import { createOfferRepo, type OfferRepo } from './repo/offers.js'
import { createPlanRepo, type PlanRepo } from './repo/plans.js'
import { createPipelineRepo, type PipelineRepo } from './repo/pipeline.js'
import { createPlatformRepo, type PlatformRepo } from './repo/platforms.js'
import { createRepairRepo, type RepairRepo } from './repo/repairs.js'
import { createResumeRepo, type ResumeRepo } from './repo/resumes.js'
import { createSettingRepo, type SettingRepo } from './repo/settings.js'
import { createSignalRepo, type SignalRepo } from './repo/signals.js'
import { createTailoringRepo, type TailoringRepo } from './repo/tailorings.js'
import { createTodoRepo, type TodoRepo } from './repo/todos.js'

export interface Store {
  readonly db: DatabaseSync
  readonly path: string
  readonly dataDir: string
  readonly migration: MigrationReport
  readonly platform: PlatformRepo
  readonly account: AccountRepo
  readonly plan: PlanRepo
  readonly company: CompanyRepo
  readonly job: JobRepo
  readonly crawlRun: CrawlRunRepo
  readonly repair: RepairRepo
  readonly fieldHealth: FieldHealthRepo
  readonly todo: TodoRepo
  readonly setting: SettingRepo
  readonly dictionary: DictionaryRepo
  readonly flag: FlagRepo
  readonly signal: SignalRepo
  readonly dedupGroup: DedupGroupRepo
  readonly audit: AuditRepo
  readonly llmCall: LlmCallRepo
  readonly resume: ResumeRepo
  readonly tailoring: TailoringRepo
  readonly pipeline: PipelineRepo
  /** Offer（§4.H H1/H3）：拿到手之后的逐项对比与截止倒计时。 */
  readonly offer: OfferRepo
  /** 校招与海外支线（P8）：两条支线的表放在一起，因为它们共享"不可逆节点"这个约束。 */
  readonly branch: BranchRepo
  close(): void
}

export interface OpenStoreOptions {
  /** 覆盖数据目录；不传则按 `DSH_JOB_HUNTER_DATA_DIR` → `$DSH_HOME/job-hunter` 解析。 */
  dataDir?: string
  now?: () => Date
  logger?: { info(message: string): void; warn(message: string): void }
}

/**
 * 打开并迁移主库。
 *
 * @throws DomainError('DATA_UNAVAILABLE') application_id 不符，或迁移失败（已回滚）
 */
export function openStore(options: OpenStoreOptions = {}): Store {
  const dataDir = resolveDataDir(options.dataDir)
  const path = resolveDbPath(dataDir)
  const logger = options.logger

  let db: DatabaseSync
  try {
    db = openDatabase(path)
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('DATA_UNAVAILABLE', `打不开数据库 ${path}：${messageOf(error)}`, {
      hint: '检查磁盘空间与目录权限；也可以用 DSH_JOB_HUNTER_DATA_DIR 换一个数据目录。',
      detail: { path },
      cause: error,
    })
  }

  let migration: MigrationReport
  try {
    migration = migrate(db, {
      dbPath: path,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(logger === undefined ? {} : { logger }),
    })
  } catch (error) {
    try {
      db.close()
    } catch {
      /* 原始错误更重要 */
    }
    throw error
  }

  logger?.info(
    `[store] ${path} · schema v${String(currentVersion(db))}` +
      (migration.applied.length === 0 ? '（无待应用迁移）' : `（已应用 ${migration.applied.length} 个迁移）`),
  )

  return {
    db,
    path,
    dataDir,
    migration,
    platform: createPlatformRepo(db),
    account: createAccountRepo(db),
    plan: createPlanRepo(db),
    company: createCompanyRepo(db),
    job: createJobRepo(db),
    crawlRun: createCrawlRunRepo(db),
    repair: createRepairRepo(db),
    fieldHealth: createFieldHealthRepo(db),
    todo: createTodoRepo(db),
    setting: createSettingRepo(db),
    dictionary: createDictionaryRepo(db),
    flag: createFlagRepo(db),
    signal: createSignalRepo(db),
    dedupGroup: createDedupGroupRepo(db),
    audit: createAuditRepo(db),
    llmCall: createLlmCallRepo(db),
    resume: createResumeRepo(db),
    tailoring: createTailoringRepo(db),
    pipeline: createPipelineRepo(db),
    offer: createOfferRepo(db),
    branch: createBranchRepo(db),
    close(): void {
      closeDatabase(db)
    },
  }
}
