/**
 * 一次抓取（§6.1 关键时序）。
 *
 *   平台锁（同平台串行）→ 前置检查 → adapter.gotoSearch → detectBlock → readListPage
 *     → **字段级断言**（不合格的进 pending_repair，不写主表）
 *     → 归一化（薪资）→ 公司画像 → 幂等 upsert → crawl_run 汇总 → 健康计数/降级告警
 *
 * 两条不变量：
 *   * **降级即暂停写入**：平台处于 degraded/broken 时只解析、不落主表（§4.2.4）；
 *   * **命中风控不硬重试**：detectBlock 一旦命中就记录、告警、结束本轮（C12 / P5）。
 */
import { ADAPTER_FAIL_THRESHOLD, DETAIL_FETCH_MAX_PER_ROUND, REQUEST_DELAY_MAX_MS, REQUEST_DELAY_MIN_MS, WRITE_BATCH_SIZE } from '../../shared/constants.js';
import { DomainError, messageOf } from '../util/errors.js';
import { parseSalary } from '../util/salary.js';
import { systemClock } from '../util/time.js';
import { BurstGuard, humanDelayMs } from '../platform/pacing.js';
import { applyFieldPresence, recordRunFailure, recordRunSuccess } from '../platform/health.js';
import { applyYieldBaseline } from '../platform/yield-baseline.js';
import { partitionByRequiredFields } from '../platform/validate.js';
import { applyDedup, dedupCandidateOf } from './dedupe.js';
import { dedupDepsOf } from './dedupe-sweep.js';
/** 风控类型 → 领域错误码。 */
function blockToCode(kind) {
    if (kind === 'login-required')
        return 'NOT_LOGGED_IN';
    if (kind === 'quota-exhausted')
        return 'PLATFORM_QUOTA';
    return 'BLOCKED';
}
/** 风控类型 → 人话（落进 crawl_run.error_msg，界面直接展示）。 */
function blockMessage(kind) {
    if (kind === 'quota-exhausted') {
        return '平台侧今日额度已用完（quota-exhausted）—— 退避重试没有意义，今天对该平台停手';
    }
    return `命中风控/登录墙：${kind}`;
}
function requireRun(run, runId) {
    if (run === undefined) {
        throw new DomainError('INTERNAL', `crawl_run ${String(runId)} 写入后读不回`);
    }
    return run;
}
/**
 * SR-46：把 `deadlineAt` 解析成 ms。**读不出合法时刻就当"没有预算"**（`null`）。
 *
 * 不猜一个 0：把垃圾值当成"1970 年就到期了"会让每一轮都在第一页之前中止，
 * 那比不做预算糟得多。宁可退回旧行为（跑满 `maxPages`）。
 */
function toDeadlineMs(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const at = new Date(value).getTime();
    return Number.isNaN(at) ? null : at;
}
/**
 * 详情补抓（P2）：对本轮**新增**的岗位逐条进详情页取 JD。
 *
 * ## 为什么只抓新增
 *
 * 老岗位要么已有 JD，要么上一轮已经试过 —— 每轮把整页岗位再点一遍会把这个功能
 * 变成"每天都去深读 40 个页面"，那是风控灾难而不是功能。新增量在日常轮次里很小
 * （同一批岗位反复出现在搜索结果里是常态），所以这条约束让**日常开销接近零**，
 * 而首次开抓时一次性补齐。
 *
 * ## 边界（全部复用既有机制，不是新发明）
 *
 *   * **上限** `DETAIL_FETCH_MAX_PER_ROUND`：防"首轮 + 多关键词"一次点进上百个页面；
 *   * **拟人间隔**：沿用列表翻页那套高斯延时 + 突发惩罚（同一个站点节奏）；
 *   * **到点即停**（SR-46）：与列表侧同一个 `deadlineAt`，预算用完就停手；
 *   * **命中风控即停**（C12 / SR-22）：返回 block 类型，由调用方落成平台级暂停信号 ——
 *     **绝不硬闯**，也绝不当成"这一条解析失败"悄悄跳过；
 *   * **单条失败不毒整轮**：某条详情页打不开/解析空 → 记日志继续下一条
 *     （列表数据已经入库了，不该因为一条详情页把整轮判成失败）。
 *
 * ⚠️ 顺序上必须在**情报引擎之前**：打分/黑话标注读的就是 `jd_text`（`intel.ts`），
 * 补抓放后面等于这一轮的岗位还是按"无 JD"打分。
 */
async function fetchNewJobDetails(deps, adapter, jobIds, clock, options) {
    const detail = adapter.detail;
    if (detail === undefined)
        return { fetched: 0, blocked: null, stopped: false };
    const store = deps.store;
    const deadlineMs = toDeadlineMs(options.deadlineAt);
    const targets = jobIds.slice(0, DETAIL_FETCH_MAX_PER_ROUND);
    if (jobIds.length > targets.length) {
        deps.logger?.info(`[crawl] ${adapter.id} 本轮新增 ${String(jobIds.length)} 条，` +
            `详情只补前 ${String(targets.length)} 条（上限 ${String(DETAIL_FETCH_MAX_PER_ROUND)}）—— 其余下一轮已是老岗位`);
    }
    const page = await deps.pageSource.acquire();
    let fetched = 0;
    let blocked = null;
    let stopped = false;
    try {
        for (const jobId of targets) {
            // 到点就停手（与列表侧同一个终点）
            if (deadlineMs !== null && new Date(clock()).getTime() >= deadlineMs) {
                stopped = true;
                break;
            }
            const job = store.job.detail(jobId);
            if (job === undefined || job.sourceUrl === '')
                continue;
            // 突发惩罚：最近动作太密就先等一会儿（与列表翻页同一把守卫）
            const penaltyMs = options.burst.penaltyMs();
            if (penaltyMs > 0)
                await page.waitForTimeout(penaltyMs);
            try {
                await page.goto(job.sourceUrl);
            }
            catch (error) {
                deps.logger?.warn(`[crawl] 详情页打不开（job ${String(jobId)}）：${messageOf(error)}`);
                continue;
            }
            options.burst.mark();
            // 判墙：命中即整轮停手 —— 这是"平台认出你了"的信号，不是这一条的问题
            const kind = await adapter.guard.detectBlock(page).catch(() => null);
            if (kind !== null) {
                blocked = kind;
                break;
            }
            try {
                const parsed = await detail.extract(page);
                const jdText = parsed.jdText ?? '';
                if (store.job.setJdText(jobId, jdText))
                    fetched += 1;
                else if (jdText.trim() === '') {
                    deps.logger?.warn(`[crawl] 详情页没解析出 JD（job ${String(jobId)}，${adapter.id}）`);
                }
            }
            catch (error) {
                deps.logger?.warn(`[crawl] 详情解析失败（job ${String(jobId)}）：${messageOf(error)}`);
            }
            // 清单条之间的拟人停顿：用**全局统一的请求节奏常量**
            // （`REQUEST_DELAY_*_MS`，运行时把它交给每个适配器 = 各平台自己的页间延时），
            // 不新开一套参数 —— 同一站点两种节奏本身就是可识别特征。
            await page.waitForTimeout(humanDelayMs([REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS]));
        }
    }
    finally {
        await deps.pageSource.release(page).catch(() => undefined);
    }
    return { fetched, blocked, stopped };
}
/**
 * 跑一次抓取。**同一个平台**已有抓取在进行时立刻失败（不排队）——
 * 排队会让调用方以为"点一下就好"，而实际上会连跑两遍触发风控。
 * 不同平台不受影响（跨平台并发，见 platform/locks.ts）。
 */
export async function runCrawl(deps, options) {
    const adapter = deps.registry.get(options.platformId);
    if (adapter === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${options.platformId}`, {
            hint: '检查 platform/adapters 下是否注册了该平台。',
        });
    }
    const result = await deps.locks.tryRun(options.platformId, async () => executeCrawl(deps, adapter, options, deps.clock ?? systemClock));
    if (result === null) {
        throw new DomainError('CONFLICT', `平台 ${adapter.displayName} 已有抓取在进行中`, {
            hint: '同一平台的抓取是串行的（防连跑两遍触发风控）；等这一轮结束再试。其它平台不受影响。',
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
    /** SR-46：本轮的到点时刻（ms）。`null` = 没预算，跑满 `maxPages` 为止。 */
    const deadlineMs = toDeadlineMs(options.deadlineAt);
    /**
     * 到点中止过吗。
     *
     * 它**不是**失败：平台正常响应了、字段都解析出来了，只是我们把剩下的页留到下一轮。
     * 所以它既不进 `failed`（那会让连续失败计数 +1、把健康的平台推去冷却），
     * 也不进量级基线（半截的条数不代表这个平台给多少）。
     */
    let stoppedAtDeadline = false;
    // 按平台取守卫（生产侧是共享的滑动窗口；没注入时退回本次运行私有的一份 ——
    // 离线测试与旧调用方的行为不变）。
    const burst = deps.createBurstGuard?.(adapter.id) ?? new BurstGuard();
    const page = await deps.pageSource.acquire();
    try {
        // SR-40：抓取深度由方案配置（`criteria.maxPages`）决定，并受适配器声明上限约束。
        // 没配时用**平台自己的默认**（defaultMaxPages，风控强度是平台事实），
        // 再兜 1 —— 以前这里永远是 1 页，把 hint 里"默认 N 页"变成了三年假话。
        // 上限外的值在这里**截断**而不是报错：入口层的校验（SR-45）已经拦过一次，
        // 这里再抛一次错只会让一次已经批准的抓取白跑。
        const requested = options.criteria.maxPages ?? options.maxPages ?? adapter.defaultMaxPages ?? 1;
        const maxPages = Math.max(1, Math.min(Math.trunc(requested), adapter.maxPages));
        for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
            // SR-46：到点就在**开新页之前**停手。放在最前面（连第一页也拦）是有意的：
            // 本轮预算早已用完时，连一次导航都不该再发出去。
            if (deadlineMs !== null && new Date(clock()).getTime() >= deadlineMs) {
                stoppedAtDeadline = true;
                break;
            }
            // 突发惩罚（P5/D-17a）：最近翻页太密就先罚一会儿再动。
            // 第一页没有任何 mark，天然罚 0；离线夹具的 waitForTimeout 不真等。
            const penaltyMs = burst.penaltyMs();
            if (penaltyMs > 0)
                await page.waitForTimeout(penaltyMs);
            try {
                await adapter.crawl.gotoSearch(page, { ...options.criteria, page: pageNo });
            }
            catch (error) {
                failure = { code: 'NAVIGATION_FAILED', message: messageOf(error) };
                break;
            }
            const block = await adapter.guard.detectBlock(page).catch(() => null);
            if (block !== null) {
                failure = { code: blockToCode(block), message: blockMessage(block) };
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
            burst.mark();
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
    /** 本轮**新增**的岗位（详情补抓只针对它们 —— 见下面的说明）。 */
    const insertedJobIds = [];
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
            if (written.outcome === 'inserted') {
                inserted += 1;
                insertedJobIds.push(written.id);
            }
            else {
                updated += 1;
            }
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
    // ── P2 详情补抓：只对本轮新增的岗位取 JD ────────────────────────────
    //
    // **必须在情报引擎之前**：打分/黑话标注读的就是 `jd_text`（见 intel.ts）。
    // 也必须在 upsert 之后（要知道哪些是新增的）。
    //
    // 猎聘这类平台**列表完全不含 JD**，不补抓的话它们在这几项上只能按"无 JD"降级 ——
    // 所以这不是可选装饰，而是"这个平台的岗位能不能参与打分"的前提。
    let detailFetched = 0;
    let detailBlocked = null;
    let detailStopped = false;
    if (!paused && insertedJobIds.length > 0 && adapter.detail !== undefined) {
        const detailOutcome = await fetchNewJobDetails(deps, adapter, insertedJobIds, clock, {
            ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
            burst,
        });
        detailFetched = detailOutcome.fetched;
        detailBlocked = detailOutcome.blocked;
        detailStopped = detailOutcome.stopped;
        deps.logger?.info(`[crawl] ${adapter.id} 详情补抓：新增 ${String(insertedJobIds.length)} 条 → 取到 JD ${String(detailFetched)} 条` +
            (detailStopped ? '（到点停手，其余下一轮已是老岗位）' : '') +
            (detailBlocked === null ? '' : ` · **命中风控 ${detailBlocked}，已停手**`));
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
    // ── SR-44：跨平台去重（可关）───────────────────────────────────────
    //
    // 只在**不同平台**之间做。候选按 `companyId` 取（跨方案、跨时间都在候选里），
    // 所以两个方案各自抓到的同一家公司的岗位会被比到。
    // 门槛见 `util/dedupe.ts`：公司归一化名 + 城市（**归一到市级**）硬相等，
    // 薪资**只在两边都锚定时**才比（"未知"不等于"不同"，R25），
    // 标题相似度 ≥0.9 才合并；0.75–0.9 之间算"疑似"，**不合并但要说出来**。
    let dedupGroups = 0;
    /**
     * 疑似重复但**未自动合并**的数量（批 4）。
     *
     * 不合并是对的（宁可漏、不可错），但"没合并"本身也得能被看见 ——
     * 否则用户永远不知道自己少了几个合并，也无从纠正。
     */
    let dedupCandidates = 0;
    if (postProcess.dedup) {
        // 候选构造器与全库复核**共用一份**（`dedupDepsOf`）：这里只看这一轮写进去的岗位，
        // 复核看全库 —— 差别只在输入集合，判断规则一条都不能有第二份实现。
        const dedupDeps = dedupDepsOf(store);
        for (const jobId of writtenJobIds) {
            try {
                const job = store.job.detail(jobId);
                if (job === undefined)
                    continue;
                const candidate = dedupCandidateOf(job);
                if (candidate === undefined)
                    continue;
                const outcome = applyDedup(dedupDeps, candidate, now());
                if (outcome.groupId !== null) {
                    dedupGroups += 1;
                }
                else if (outcome.candidate) {
                    dedupCandidates += 1;
                    deps.logger?.info(`[crawl] 疑似跨平台重复（未自动合并）：${outcome.basis}`);
                }
            }
            catch (error) {
                // 去重失败不能让整轮抓取显示成失败：岗位已经在库里了
                deps.logger?.warn(`[crawl] 去重判定失败（job ${String(jobId)}）：${messageOf(error)}`);
            }
        }
    }
    const quarantined = partition.rejected.length;
    const suspicious = collected.length === 0 && pages > 0;
    // SR-46：到点中止是**第四种**结局，不是 `partial`。
    // `partial` 说的是"抓了但数据不全（隔离/暂停）"，而这里数据是完好的，
    // 只是我们自己收手了 —— 合并会让运行历史分不清"平台有问题"与"我们到点了"。
    //
    // 详情补抓阶段命中风控 → `failed`：列表数据**已经入库**（不丢），但这一轮确实
    // 没跑完，而且这是"平台认出你了"的信号 —— 必须是 `failed` 才能让调度器走到
    // 风控暂停那一条（SR-22）。用 `partial` 会把信号静默丢掉，那正是最坏的一种处理。
    const state = detailBlocked !== null
        ? 'failed'
        : stoppedAtDeadline || detailStopped
            ? 'aborted'
            : suspicious || quarantined > 0 || paused
                ? 'partial'
                : 'ok';
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
        errorCode: detailBlocked !== null
            ? blockToCode(detailBlocked)
            : stoppedAtDeadline || detailStopped
                ? 'DEADLINE_REACHED'
                : suspicious
                    ? 'NO_RECORDS'
                    : paused
                        ? 'PLATFORM_PAUSED'
                        : null,
        errorMsg: detailBlocked !== null
            ? `详情补抓时${blockMessage(detailBlocked)} —— 列表已抓到的 ${String(collected.length)} 条（新增 ${String(inserted)}）已正常入库；` +
                `详情只取到 ${String(detailFetched)} 条，已停手不重试`
            : stoppedAtDeadline
                ? `本轮到点中止（单轮预算用完）—— 前面 ${String(pages)} 页抓到的 ${String(collected.length)} 条已照常入库，剩余页留到下一轮`
                : detailStopped
                    ? `详情补抓到点停手（单轮预算用完）—— 列表 ${String(collected.length)} 条已照常入库，` +
                        `JD 只补到 ${String(detailFetched)} 条`
                    : suspicious
                        ? '页面打开正常但一条记录都没解析出来 —— 很可能是选择器失效'
                        : paused
                            ? `平台处于 ${healthState}，本轮只解析未写库`
                            : null,
    }, now());
    // ── 量级基线告警（批次 5）────────────────────────────────────────────
    //
    // 逐字段健康只能发现"某个字段整页缺失"，`suspicious` 只覆盖"整轮 0 条"。
    // 两者都盖不住**更隐蔽的一种坏法**：选择器仍然匹配、每个字段都解析得出、
    // `quarantined=0`、`state='ok'` —— 但条目数掉了一个数量级。
    // 那种轮次在数据里**和正常轮次长得一模一样**，只是 found 从 20 变成 2。
    // 必须跟这个平台自己的历史比才有意义，所以要放在 `finish()` 之后（本轮已落库，
    // 而 `applyYieldBaseline` 会把它从基线里排除掉）。
    // SR-46 × 批次 5：到点中止的条数是**半截**的 —— 是我们自己停早了，不是平台给少了。
    // 拿它去比基线必然误报（"只抓到 3 条"），于是这一轮既不进基线、也不触发/关闭告警：
    // 它对"这个平台通常给多少"这个问题**没有发言权**。
    const yieldSnapshot = stoppedAtDeadline
        ? null
        : applyYieldBaseline(store, adapter.id, collected.length, now(), runId);
    if (yieldSnapshot !== null && yieldSnapshot.level === 'dropped') {
        deps.logger?.warn(`[crawl] ${adapter.id} 量级骤降：本轮 ${String(collected.length)} 条，` +
            `常态约 ${String(yieldSnapshot.baseline)} 条（${String(yieldSnapshot.samples)} 轮样本）`);
    }
    const run = requireRun(store.crawlRun.get(runId), runId);
    deps.logger?.info(`[crawl] ${adapter.id} 第 ${String(runId)} 轮：${state} · 页面 ${String(pages)} · ` +
        `命中 ${String(collected.length)} · 新增 ${String(inserted)} · 更新 ${String(updated)} · ` +
        `隔离 ${String(quarantined)}` +
        (stoppedAtDeadline ? ' · **到点中止**（剩余页留到下一轮）' : '') +
        (insertedJobIds.length === 0 ? '' : ` · 详情补抓 ${String(detailFetched)}/${String(Math.min(insertedJobIds.length, DETAIL_FETCH_MAX_PER_ROUND))}`) +
        (dedupGroups > 0 ? ` · 跨平台合并 ${String(dedupGroups)} 组` : '') +
        (dedupCandidates > 0 ? ` · 疑似重复待确认 ${String(dedupCandidates)} 条` : ''));
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