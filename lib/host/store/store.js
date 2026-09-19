import { DomainError, messageOf } from '../util/errors.js';
import { closeDatabase, openDatabase, resolveDataDir, resolveDbPath } from './db.js';
import { currentVersion, migrate } from './migrate.js';
import { createAccountRepo } from './repo/accounts.js';
import { createAuditRepo } from './repo/audit.js';
import { createBranchRepo } from './repo/campus.js';
import { createCompanyRepo } from './repo/companies.js';
import { createCrawlRunRepo } from './repo/crawl-runs.js';
import { createDedupGroupRepo } from './repo/dedup-groups.js';
import { createDictionaryRepo } from './repo/dictionary.js';
import { createFieldHealthRepo } from './repo/field-health.js';
import { createFlagRepo } from './repo/flags.js';
import { createJobRepo } from './repo/jobs.js';
import { createLlmCallRepo } from './repo/llm-calls.js';
import { createOfferRepo } from './repo/offers.js';
import { createPlanRepo } from './repo/plans.js';
import { createPipelineRepo } from './repo/pipeline.js';
import { createPlatformRepo } from './repo/platforms.js';
import { createRepairRepo } from './repo/repairs.js';
import { createResumeRepo } from './repo/resumes.js';
import { createSettingRepo } from './repo/settings.js';
import { createSignalRepo } from './repo/signals.js';
import { createTailoringRepo } from './repo/tailorings.js';
import { createTodoRepo } from './repo/todos.js';
/**
 * 打开并迁移主库。
 *
 * @throws DomainError('DATA_UNAVAILABLE') application_id 不符，或迁移失败（已回滚）
 */
export function openStore(options = {}) {
    const dataDir = resolveDataDir(options.dataDir);
    const path = resolveDbPath(dataDir);
    const logger = options.logger;
    let db;
    try {
        db = openDatabase(path);
    }
    catch (error) {
        if (error instanceof DomainError)
            throw error;
        throw new DomainError('DATA_UNAVAILABLE', `打不开数据库 ${path}：${messageOf(error)}`, {
            hint: '检查磁盘空间与目录权限；也可以用 DSH_JOB_HUNTER_DATA_DIR 换一个数据目录。',
            detail: { path },
            cause: error,
        });
    }
    let migration;
    try {
        migration = migrate(db, {
            dbPath: path,
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(logger === undefined ? {} : { logger }),
        });
    }
    catch (error) {
        try {
            db.close();
        }
        catch {
            /* 原始错误更重要 */
        }
        throw error;
    }
    logger?.info(`[store] ${path} · schema v${String(currentVersion(db))}` +
        (migration.applied.length === 0 ? '（无待应用迁移）' : `（已应用 ${migration.applied.length} 个迁移）`));
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
        close() {
            closeDatabase(db);
        },
    };
}
//# sourceMappingURL=store.js.map