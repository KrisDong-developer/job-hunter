/**
 * 一次抓取（§6.1 关键时序）。
 *
 *   mutex → 前置检查 → adapter.gotoSearch → detectBlock → readListPage
 *     → **字段级断言**（不合格的进 pending_repair，不写主表）
 *     → 归一化（薪资）→ 公司画像 → 幂等 upsert → crawl_run 汇总 → 健康计数/降级告警
 *
 * 两条不变量：
 *   * **降级即暂停写入**：平台处于 degraded/broken 时只解析、不落主表（§4.2.4）；
 *   * **命中风控不硬重试**：detectBlock 一旦命中就记录、告警、结束本轮（C12 / P5）。
 */
import { ADAPTER_FAIL_THRESHOLD, WRITE_BATCH_SIZE } from '../../shared/constants.js';
import { DomainError, messageOf } from '../util/errors.js';
import { parseSalary } from '../util/salary.js';
import { systemClock } from '../util/time.js';
import { applyFieldPresence, recordRunFailure, recordRunSuccess } from '../platform/health.js';
import { partitionByRequiredFields } from '../platform/validate.js';
/** 风控类型 → 领域错误码。 */
function blockToCode(kind) {
    return kind === 'login-required' ? 'NOT_LOGGED_IN' : 'BLOCKED';
}
function requireRun(run, runId) {
    if (run === undefined) {
        throw new DomainError('INTERNAL', `crawl_run ${String(runId)} 写入后读不回`);
    }
    return run;
}
/**
 * 跑一次抓取。已有抓取在进行时**立刻失败**（不排队）——
 * 排队会让调用方以为“点一下就好”，而实际上会连跑两遍触发风控。
 */
export async function runCrawl(deps, options) {
    const adapter = deps.registry.get(options.platformId);
    if (adapter === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${options.platformId}`, {
            hint: '检查 platform/adapters 下是否注册了该平台。',
        });
    }
    const result = await deps.mutex.tryRun(async () => executeCrawl(deps, adapter, options, deps.clock ?? systemClock));
    if (result === null) {
        throw new DomainError('CONFLICT', '已有抓取任务在进行中', {
            hint: '等这一轮结束再试；同一时刻只允许一个抓取（全局互斥，§4.2.1）。',
        });
    }
    return result;
}
async function executeCrawl(deps, adapter, options, clock) {
    const store = deps.store;
    const now = () => clock();
    // SR-44：默认全开 —— 不给就是老行为，升级不该悄悄改变结果。
    const postProcess = options.postProcess ?? { score: true, flag: true, dedup: true };
    store.platform.ensure({ id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities }, now());
    const runId = store.crawlRun.start({ platformId: adapter.id, planId: options.planId ?? null, reason: options.reason ?? 'manual' }, now());
    const collected = [];
    let pages = 0;
    let failure = null;
    const page = await deps.pageSource.acquire();
    try {
        // SR-40：抓取深度由方案配置（`criteria.maxPages`）决定，并受适配器声明上限约束。
        // 上限外的值在这里**截断**而不是报错：入口层的校验（SR-45）已经拦过一次，
        // 这里再抛一次错只会让一次已经批准的抓取白跑。
        const requested = options.criteria.maxPages ?? options.maxPages ?? 1;
        const maxPages = Math.max(1, Math.min(Math.trunc(requested), adapter.maxPages));
        for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
            try {
                await adapter.crawl.gotoSearch(page, { ...options.criteria, page: pageNo });
            }
            catch (error) {
                failure = { code: 'NAVIGATION_FAILED', message: messageOf(error) };
                break;
            }
            const block = await adapter.guard.detectBlock(page).catch(() => null);
            if (block !== null) {
                failure = { code: blockToCode(block), message: `命中风控/登录墙：${block}` };
                break;
            }
            let raw;
            try {
                raw = await adapter.crawl.readListPage(page);
            }
            catch (error) {
                failure = { code: 'PARSE_FAILED', message: messageOf(error) };
                break;
            }
            collected.push(...raw);
            pages += 1;
            if (raw.length === 0)
                break;
            if (pageNo >= maxPages)
                break;
            const more = await adapter.crawl.hasNextPage(page).catch(() => false);
            if (!more)
                break;
        }
    }
    finally {
        await deps.pageSource.release(page).catch(() => undefined);
    }
    // ── 运行级失败：记失败、按阈值置 broken、结束本轮 ──────────────────
    if (failure !== null) {
        const { failStreak, broken } = recordRunFailure(store, adapter.id, failure.code, failure.message, {
            threshold: ADAPTER_FAIL_THRESHOLD,
            now: now(),
        });
        store.crawlRun.finish(runId, {
            state: 'failed',
            pages,
            found: collected.length,
            errorCode: failure.code,
            errorMsg: failure.message,
            reason: options.reason ?? 'manual',
        }, now());
        deps.logger?.warn(`[crawl] ${adapter.id} 失败（连续 ${String(failStreak)} 次${broken ? '，已置为失效' : ''}）：${failure.message}`);
        return {
            run: requireRun(store.crawlRun.get(runId), runId),
            quarantined: 0,
            fieldPresence: [],
            degraded: broken ? { platformId: adapter.id, reasons: [failure.message] } : null,
        };
    }
    recordRunSuccess(store, adapter.id, now());
    // ── 字段级断言 + 脏数据隔离（§4.2.4）──────────────────────────────
    const partition = partitionByRequiredFields(collected, adapter.requiredFields);
    const healthOutcome = applyFieldPresence(store, adapter.id, partition.presence, { now: now() });
    for (const rejected of partition.rejected) {
        store.repair.enqueue({
            platformId: adapter.id,
            crawlRunId: runId,
            missingFields: rejected.missing,
            raw: rejected.raw,
            sourceUrl: rejected.raw.sourceUrl === '' ? null : rejected.raw.sourceUrl,
            note: `字段断言未通过：缺 ${rejected.missing.join(', ')}`,
        }, now());
    }
    const healthState = store.platform.get(adapter.id)?.health ?? 'healthy';
    const paused = healthState !== 'healthy';
    let inserted = 0;
    let updated = 0;
    let writes = 0;
    const touchedCompanies = new Set();
    const writtenJobIds = [];
    if (!paused) {
        for (const raw of partition.accepted) {
            const salary = parseSalary(raw.salaryRaw);
            let companyId = null;
            if (raw.company.trim() !== '') {
                try {
                    companyId = deps.companies.ensureByName({
                        name: raw.company,
                        industry: raw.industry ?? null,
                        size: raw.companySize ?? null,
                        nature: raw.companyNature ?? null,
                    }, now());
                    touchedCompanies.add(companyId);
                }
                catch (error) {
                    deps.logger?.warn(`[crawl] 公司登记失败（${raw.company}）：${messageOf(error)}`);
                }
            }
            const written = deps.jobs.upsert({
                platformId: adapter.id,
                platformJobId: raw.platformJobId,
                title: raw.title,
                companyId,
                salaryRaw: salary.raw,
                salaryMin: salary.min,
                salaryMax: salary.max,
                salaryMonths: salary.months,
                city: raw.city ?? '',
                district: raw.district ?? '',
                expReq: raw.expReq ?? '',
                eduReq: raw.eduReq ?? '',
                tags: raw.tags ?? [],
                sourceUrl: raw.sourceUrl,
                publishedAt: raw.publishedAt ?? null,
            }, now());
            if (written.outcome === 'inserted')
                inserted += 1;
            else
                updated += 1;
            writtenJobIds.push(written.id);
            writes += 1;
            // DatabaseSync 是同步 API：分批让出事件循环，别把宿主卡住（§4.1 / R3）
            if (writes % WRITE_BATCH_SIZE === 0) {
                await new Promise((resolve) => {
                    setImmediate(resolve);
                });
            }
        }
    }
    // 公司画像重算（§6.1：受影响公司）。顺序有讲究：
    // 先算公司统计量（含驻场比例），再算岗位标注与匹配 —— 后者要读公司画像。
    //
    // SR-44：`flag` 关掉时公司统计量仍然重算（它是**事实**：这家公司有多少岗位在招），
    // 但跳过风险/黑话标注那一半。公司统计量不是"标注"，不该被这个开关关掉。
    for (const companyId of touchedCompanies) {
        try {
            if (deps.intel !== undefined && postProcess.flag)
                deps.intel.recomputeCompany(companyId, now());
            else
                deps.companies.recompute(companyId, now());
        }
        catch (error) {
            deps.logger?.warn(`[crawl] 公司画像重算失败（${String(companyId)}）：${messageOf(error)}`);
        }
    }
    // 情报引擎：标注 + 匹配分（P4）。纯规则、零外部调用，跑全量也不心疼。
    // SR-44：关掉打分后**不写 match_score**（这正是该开关的验收标准）。
    if (deps.intel !== undefined && (postProcess.score || postProcess.flag)) {
        for (const jobId of writtenJobIds) {
            try {
                deps.intel.evaluateJob(jobId, now(), postProcess);
            }
            catch (error) {
                deps.logger?.warn(`[crawl] 情报标注失败（job ${String(jobId)}）：${messageOf(error)}`);
            }
        }
    }
    const quarantined = partition.rejected.length;
    const suspicious = collected.length === 0 && pages > 0;
    const state = suspicious || quarantined > 0 || paused ? 'partial' : 'ok';
    // SR-37：跑完之后若启用简历的 rev 变了，旧分数必须被标过期（`scoreStale`）。
    // 这件事由 `jobs` 服务在读取时按 stamp 判定，这里不需要额外动作 ——
    // 但**必须**在关闭打分时不做任何标注，否则"关掉打分"就是句空话。
    void postProcess;
    store.crawlRun.finish(runId, {
        state,
        pages,
        found: collected.length,
        inserted,
        updated,
        skipped: paused ? partition.accepted.length : 0,
        quarantined,
        reason: options.reason ?? 'manual',
        errorCode: suspicious ? 'NO_RECORDS' : paused ? 'PLATFORM_PAUSED' : null,
        errorMsg: suspicious
            ? '页面打开正常但一条记录都没解析出来 —— 很可能是选择器失效'
            : paused
                ? `平台处于 ${healthState}，本轮只解析未写库`
                : null,
    }, now());
    const run = requireRun(store.crawlRun.get(runId), runId);
    deps.logger?.info(`[crawl] ${adapter.id} 第 ${String(runId)} 轮：${state} · 页面 ${String(pages)} · ` +
        `命中 ${String(collected.length)} · 新增 ${String(inserted)} · 更新 ${String(updated)} · 隔离 ${String(quarantined)}`);
    return {
        run,
        quarantined,
        fieldPresence: partition.presence.map((entry) => ({
            field: entry.field,
            records: entry.records,
            present: entry.present,
        })),
        degraded: healthOutcome.degraded
            ? { platformId: adapter.id, reasons: healthOutcome.reasons }
            : null,
    };
}
//# sourceMappingURL=crawl.js.map