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
import { ADAPTER_FAIL_THRESHOLD, WRITE_BATCH_SIZE } from '../../shared/constants.js'
import type { CrawlRunDto, CrawlSummaryDto } from '../../shared/dto.js'
import type { BlockKind, CoreField, CrawlState } from '../../shared/enums.js'
import { DomainError, messageOf } from '../util/errors.js'
import { parseSalary } from '../util/salary.js'
import { systemClock, type Clock } from '../util/time.js'
import type { Mutex } from '../platform/mutex.js'
import { BurstGuard, type BurstGuardLike } from '../platform/pacing.js'
import { applyFieldPresence, recordRunFailure, recordRunSuccess } from '../platform/health.js'
import { applyYieldBaseline } from '../platform/yield-baseline.js'
import type { AdapterRegistry } from '../platform/registry.js'
import type { PageSource, RawJob, SearchCriteria, SiteAdapter } from '../platform/types.js'
import { partitionByRequiredFields, type FieldPresence } from '../platform/validate.js'
import type { Store } from '../store/store.js'
import type { CompanyService } from './companies.js'
import { applyDedup, dedupCandidateOf } from './dedupe.js'
import type { JobService } from './jobs.js'

export interface CrawlDeps {
  store: Store
  registry: AdapterRegistry
  mutex: Mutex
  /** 页面来源：真路径是浏览器，离线路径是 jsdom 夹具。 */
  pageSource: PageSource
  jobs: JobService
  companies: CompanyService
  /**
   * 可选：突发惩罚守卫的工厂（P5/D-17a）。
   *
   * 适配器内部的高斯页间延时防的是"节奏规律"，这里防的是"连续快请求" ——
   * 15s 内 ≥3 页 / 45s 内 ≥6 页时加罚延迟。注入工厂是为了离线测试
   * 能用零惩罚桩替换，不必真等惩罚时长。
   */
  createBurstGuard?: () => BurstGuardLike
  /**
   * 可选：采集之后跑情报引擎（P4）。
   * 用窄接口而不是直接依赖 `IntelService`，避免 domain 层互相缠绕，也方便测试关掉它。
   */
  intel?:
    | {
        /** SR-44：抓取后处理开关直接传给评估器，避免在 domain 之间再传一层配置。 */
        evaluateJob(jobId: number, now: string, switches?: { score?: boolean; flag?: boolean }): unknown
        recomputeCompany(companyId: number, now: string): unknown
      }
    | undefined
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
}

export interface RunCrawlOptions {
  platformId: string
  planId?: number | null
  criteria: SearchCriteria
  /** 最多抓几页。优先取 `criteria.maxPages`（方案配置，SR-40），其次这里。 */
  maxPages?: number
  /** SR-28/29：触发原因，落进 `crawl_run.reason`。 */
  reason?: string | null
  /**
   * SR-44：抓取后处理开关。**默认全开**（不给就是全开）。
   *
   * 为什么由调用方注入而不是这里读方案：`crawl.ts` 不认识"方案"，
   * 它只认识"这次抓取"。让 domain 层去查方案会把两层的依赖搅在一起。
   */
  postProcess?: { score: boolean; flag: boolean; dedup: boolean }
}

/** 风控类型 → 领域错误码。 */
function blockToCode(kind: BlockKind): string {
  if (kind === 'login-required') return 'NOT_LOGGED_IN'
  if (kind === 'quota-exhausted') return 'PLATFORM_QUOTA'
  return 'BLOCKED'
}

/** 风控类型 → 人话（落进 crawl_run.error_msg，界面直接展示）。 */
function blockMessage(kind: BlockKind): string {
  if (kind === 'quota-exhausted') {
    return '平台侧今日额度已用完（quota-exhausted）—— 退避重试没有意义，今天对该平台停手'
  }
  return `命中风控/登录墙：${kind}`
}

function requireRun(run: CrawlRunDto | undefined, runId: number): CrawlRunDto {
  if (run === undefined) {
    throw new DomainError('INTERNAL', `crawl_run ${String(runId)} 写入后读不回`)
  }
  return run
}

/**
 * 跑一次抓取。已有抓取在进行时**立刻失败**（不排队）——
 * 排队会让调用方以为“点一下就好”，而实际上会连跑两遍触发风控。
 */
export async function runCrawl(deps: CrawlDeps, options: RunCrawlOptions): Promise<CrawlSummaryDto> {
  const adapter = deps.registry.get(options.platformId)
  if (adapter === undefined) {
    throw new DomainError('NOT_FOUND', `未注册的平台：${options.platformId}`, {
      hint: '检查 platform/adapters 下是否注册了该平台。',
    })
  }

  const result = await deps.mutex.tryRun(async () =>
    executeCrawl(deps, adapter, options, deps.clock ?? systemClock),
  )
  if (result === null) {
    throw new DomainError('CONFLICT', '已有抓取任务在进行中', {
      hint: '等这一轮结束再试；同一时刻只允许一个抓取（全局互斥，§4.2.1）。',
    })
  }
  return result
}

async function executeCrawl(
  deps: CrawlDeps,
  adapter: SiteAdapter,
  options: RunCrawlOptions,
  clock: Clock,
): Promise<CrawlSummaryDto> {
  const store = deps.store
  const now = (): string => clock()
  // SR-44：默认全开 —— 不给就是老行为，升级不该悄悄改变结果。
  const postProcess = options.postProcess ?? { score: true, flag: true, dedup: true }

  store.platform.ensure(
    { id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities },
    now(),
  )
  const runId = store.crawlRun.start(
    { platformId: adapter.id, planId: options.planId ?? null, reason: options.reason ?? 'manual' },
    now(),
  )

  const collected: RawJob[] = []
  let pages = 0
  let failure: { code: string; message: string } | null = null
  const burst: BurstGuardLike = deps.createBurstGuard?.() ?? new BurstGuard()

  const page = await deps.pageSource.acquire()
  try {
    // SR-40：抓取深度由方案配置（`criteria.maxPages`）决定，并受适配器声明上限约束。
    // 上限外的值在这里**截断**而不是报错：入口层的校验（SR-45）已经拦过一次，
    // 这里再抛一次错只会让一次已经批准的抓取白跑。
    const requested = options.criteria.maxPages ?? options.maxPages ?? 1
    const maxPages = Math.max(1, Math.min(Math.trunc(requested), adapter.maxPages))
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      // 突发惩罚（P5/D-17a）：最近翻页太密就先罚一会儿再动。
      // 第一页没有任何 mark，天然罚 0；离线夹具的 waitForTimeout 不真等。
      const penaltyMs = burst.penaltyMs()
      if (penaltyMs > 0) await page.waitForTimeout(penaltyMs)

      try {
        await adapter.crawl.gotoSearch(page, { ...options.criteria, page: pageNo })
      } catch (error) {
        failure = { code: 'NAVIGATION_FAILED', message: messageOf(error) }
        break
      }

      const block = await adapter.guard.detectBlock(page).catch(() => null)
      if (block !== null) {
        failure = { code: blockToCode(block), message: blockMessage(block) }
        break
      }

      let raw: RawJob[]
      try {
        raw = await adapter.crawl.readListPage(page)
      } catch (error) {
        failure = { code: 'PARSE_FAILED', message: messageOf(error) }
        break
      }

      burst.mark()
      collected.push(...raw)
      pages += 1
      if (raw.length === 0) break
      if (pageNo >= maxPages) break
      const more = await adapter.crawl.hasNextPage(page).catch(() => false)
      if (!more) break
    }
  } finally {
    await deps.pageSource.release(page).catch(() => undefined)
  }

  // ── 运行级失败：记失败、按阈值置 broken、结束本轮 ──────────────────
  if (failure !== null) {
    const { failStreak, broken } = recordRunFailure(store, adapter.id, failure.code, failure.message, {
      threshold: ADAPTER_FAIL_THRESHOLD,
      now: now(),
    })
    store.crawlRun.finish(
      runId,
      {
        state: 'failed',
        pages,
        found: collected.length,
        errorCode: failure.code,
        errorMsg: failure.message,
        reason: options.reason ?? 'manual',
      },
      now(),
    )
    deps.logger?.warn(
      `[crawl] ${adapter.id} 失败（连续 ${String(failStreak)} 次${broken ? '，已置为失效' : ''}）：${failure.message}`,
    )
    return {
      run: requireRun(store.crawlRun.get(runId), runId),
      quarantined: 0,
      fieldPresence: [],
      degraded: broken ? { platformId: adapter.id, reasons: [failure.message] } : null,
    }
  }

  recordRunSuccess(store, adapter.id, now())

  // ── 字段级断言 + 脏数据隔离（§4.2.4）──────────────────────────────
  const partition = partitionByRequiredFields(collected, adapter.requiredFields)
  const healthOutcome = applyFieldPresence(store, adapter.id, partition.presence, { now: now() })

  for (const rejected of partition.rejected) {
    store.repair.enqueue(
      {
        platformId: adapter.id,
        crawlRunId: runId,
        missingFields: rejected.missing,
        raw: rejected.raw,
        sourceUrl: rejected.raw.sourceUrl === '' ? null : rejected.raw.sourceUrl,
        note: `字段断言未通过：缺 ${rejected.missing.join(', ')}`,
      },
      now(),
    )
  }

  const healthState = store.platform.get(adapter.id)?.health ?? 'healthy'
  const paused = healthState !== 'healthy'

  let inserted = 0
  let updated = 0
  let writes = 0
  const touchedCompanies = new Set<number>()
  const writtenJobIds: number[] = []

  if (!paused) {
    for (const raw of partition.accepted) {
      const salary = parseSalary(raw.salaryRaw)

      let companyId: number | null = null
      if (raw.company.trim() !== '') {
        try {
          companyId = deps.companies.ensureByName(
            {
              name: raw.company,
              industry: raw.industry ?? null,
              size: raw.companySize ?? null,
              nature: raw.companyNature ?? null,
            },
            now(),
          )
          touchedCompanies.add(companyId)
        } catch (error) {
          deps.logger?.warn(`[crawl] 公司登记失败（${raw.company}）：${messageOf(error)}`)
        }
      }

      const written = deps.jobs.upsert(
        {
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
        },
        now(),
      )
      if (written.outcome === 'inserted') inserted += 1
      else updated += 1
      writtenJobIds.push(written.id)

      writes += 1
      // DatabaseSync 是同步 API：分批让出事件循环，别把宿主卡住（§4.1 / R3）
      if (writes % WRITE_BATCH_SIZE === 0) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
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
      if (deps.intel !== undefined && postProcess.flag) deps.intel.recomputeCompany(companyId, now())
      else deps.companies.recompute(companyId, now())
    } catch (error) {
      deps.logger?.warn(`[crawl] 公司画像重算失败（${String(companyId)}）：${messageOf(error)}`)
    }
  }

  // 情报引擎：标注 + 匹配分（P4）。纯规则、零外部调用，跑全量也不心疼。
  // SR-44：关掉打分后**不写 match_score**（这正是该开关的验收标准）。
  if (deps.intel !== undefined && (postProcess.score || postProcess.flag)) {
    for (const jobId of writtenJobIds) {
      try {
        deps.intel.evaluateJob(jobId, now(), postProcess)
      } catch (error) {
        deps.logger?.warn(`[crawl] 情报标注失败（job ${String(jobId)}）：${messageOf(error)}`)
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
  let dedupGroups = 0
  /**
   * 疑似重复但**未自动合并**的数量（批 4）。
   *
   * 不合并是对的（宁可漏、不可错），但"没合并"本身也得能被看见 ——
   * 否则用户永远不知道自己少了几个合并，也无从纠正。
   */
  let dedupCandidates = 0
  if (postProcess.dedup) {
    for (const jobId of writtenJobIds) {
      try {
        const job = store.job.detail(jobId)
        if (job === undefined) continue
        const candidate = dedupCandidateOf(job)
        if (candidate === undefined) continue
        const outcome = applyDedup(
          {
            dedupGroup: store.dedupGroup,
            candidatesFor: (self) =>
              (job.companyId === null
                ? []
                : store.job
                    .query({ companyId: job.companyId })
                    .map(dedupCandidateOf)
                    .filter((item): item is NonNullable<typeof item> => item !== undefined)
              ).filter((item) => item.id !== self.id && item.platformId !== self.platformId),
          },
          candidate,
          now(),
        )
        if (outcome.groupId !== null) {
          dedupGroups += 1
        } else if (outcome.candidate) {
          dedupCandidates += 1
          deps.logger?.info(`[crawl] 疑似跨平台重复（未自动合并）：${outcome.basis}`)
        }
      } catch (error) {
        // 去重失败不能让整轮抓取显示成失败：岗位已经在库里了
        deps.logger?.warn(`[crawl] 去重判定失败（job ${String(jobId)}）：${messageOf(error)}`)
      }
    }
  }

  const quarantined = partition.rejected.length
  const suspicious = collected.length === 0 && pages > 0
  const state: CrawlState = suspicious || quarantined > 0 || paused ? 'partial' : 'ok'

  // SR-37：跑完之后若启用简历的 rev 变了，旧分数必须被标过期（`scoreStale`）。
  // 这件事由 `jobs` 服务在读取时按 stamp 判定，这里不需要额外动作 ——
  // 但**必须**在关闭打分时不做任何标注，否则"关掉打分"就是句空话。
  void postProcess

  store.crawlRun.finish(
    runId,
    {
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
    },
    now(),
  )

  // ── 量级基线告警（批次 5）────────────────────────────────────────────
  //
  // 逐字段健康只能发现"某个字段整页缺失"，`suspicious` 只覆盖"整轮 0 条"。
  // 两者都盖不住**更隐蔽的一种坏法**：选择器仍然匹配、每个字段都解析得出、
  // `quarantined=0`、`state='ok'` —— 但条目数掉了一个数量级。
  // 那种轮次在数据里**和正常轮次长得一模一样**，只是 found 从 20 变成 2。
  // 必须跟这个平台自己的历史比才有意义，所以要放在 `finish()` 之后（本轮已落库，
  // 而 `applyYieldBaseline` 会把它从基线里排除掉）。
  const yieldSnapshot = applyYieldBaseline(store, adapter.id, collected.length, now(), runId)
  if (yieldSnapshot.level === 'dropped') {
    deps.logger?.warn(
      `[crawl] ${adapter.id} 量级骤降：本轮 ${String(collected.length)} 条，` +
        `常态约 ${String(yieldSnapshot.baseline)} 条（${String(yieldSnapshot.samples)} 轮样本）`,
    )
  }

  const run = requireRun(store.crawlRun.get(runId), runId)
  deps.logger?.info(
    `[crawl] ${adapter.id} 第 ${String(runId)} 轮：${state} · 页面 ${String(pages)} · ` +
      `命中 ${String(collected.length)} · 新增 ${String(inserted)} · 更新 ${String(updated)} · ` +
      `隔离 ${String(quarantined)}` +
      (dedupGroups > 0 ? ` · 跨平台合并 ${String(dedupGroups)} 组` : '') +
      (dedupCandidates > 0 ? ` · 疑似重复待确认 ${String(dedupCandidates)} 条` : ''),
  )

  return {
    run,
    quarantined,
    fieldPresence: partition.presence.map((entry: FieldPresence) => ({
      field: entry.field as CoreField,
      records: entry.records,
      present: entry.present,
    })),
    degraded: healthOutcome.degraded
      ? { platformId: adapter.id, reasons: healthOutcome.reasons }
      : null,
  }
}
