import type { DatabaseSync } from 'node:sqlite'
import type { PlanDto, PlanPlatformOverrideDto, PlanPostProcess, PlanSchedule } from '../../../shared/contract/dto/plan.js'
import { detectTimezone } from '../../util/time.js'
import { asBool, asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 默认排程（D-19 / SR-1）：**工作日 09:00–11:00 之间随机选点**。
 *
 * 注意这里没有"09:30"这个单点 —— SR-32 明确不提供"精确到分钟的单点时刻"。
 * 旧的"固定时刻"配置在 `normalizeSchedule` 里被翻译成等价的 1 小时窗口，
 * 所以历史数据不会失效，只是语义升级了。
 */
export const DEFAULT_SCHEDULE: PlanSchedule = {
  enabled: true,
  windowStartHour: 9,
  windowStartMinute: 0,
  windowEndHour: 11,
  windowEndMinute: 0,
  weekdays: [1, 2, 3, 4, 5],
  jitterMs: 40 * 60 * 1000,
  missedGraceMs: 6 * 60 * 60 * 1000,
}

/** SR-44：抓取后处理默认**全开** —— 默认行为不变是升级的底线。 */
export const DEFAULT_POST_PROCESS: PlanPostProcess = { score: true, flag: true, dedup: true }

/**
 * 本机时区名（SR-5：存本地墙钟 + 时区快照）。
 *
 * 实现搬到了 `util/time.ts`（调度器也要用它），这里转出去让既有调用方不用改。
 */
export { detectTimezone }

/** 一天 24 小时的分钟表示，用来比较窗口边界。 */
function minuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute
}

/**
 * 把外部传进来的 schedule 收敛成合法值 —— 定时配置坏掉会静默不跑，必须拦住。
 *
 * ## 两件必须做的事
 *
 * 1. **旧字段翻译**：历史配置只有 `hour` / `minute`。直接丢掉的话，
 *    用户升级后方案会跑去默认的 09:00–11:00，而他配的是 07:00 —— 静默改了用户的行为。
 *    所以没有窗口字段时，用 `hour` 生成一个 1 小时窗口 `[hour:minute, hour+1:minute)`。
 * 2. **窗口校验**：跨零点合法（`22:00–02:00`），但起点终点完全相同不合法
 *    （那是一个零长度窗口，等于"永远不跑"，而用户不会以为自己配了个永不触发的东西）。
 */
/**
 * 历史配置形状：只有单点时刻。**只读入、不写出** ——
 * 类型上单独列出来是为了让"升级路径"这件事在签名里就看得见（SR-32 取消了这个形状）。
 */
export interface LegacyScheduleFields {
  hour?: number
  minute?: number
}

export function normalizeSchedule(
  patch: (Partial<PlanSchedule> & LegacyScheduleFields) | undefined,
  base: PlanSchedule = DEFAULT_SCHEDULE,
): PlanSchedule {
  const merged: Record<string, unknown> = { ...base, ...(patch ?? {}) }

  const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.trunc(value)))
      : fallback

  const hasWindowField =
    patch !== undefined &&
    (patch.windowStartHour !== undefined ||
      patch.windowEndHour !== undefined ||
      patch.windowStartMinute !== undefined ||
      patch.windowEndMinute !== undefined)

  let startHour = clamp(merged['windowStartHour'], 0, 23, base.windowStartHour)
  let startMinute = clamp(merged['windowStartMinute'], 0, 59, base.windowStartMinute)
  let endHour = clamp(merged['windowEndHour'], 0, 23, base.windowEndHour)
  let endMinute = clamp(merged['windowEndMinute'], 0, 59, base.windowEndMinute)

  // 旧形状（或显式给了 hour/minute 而没给窗口）→ 等价的 1 小时窗口
  const legacy = merged['hour']
  if (!hasWindowField && typeof legacy === 'number' && Number.isFinite(legacy)) {
    startHour = clamp(legacy, 0, 23, base.windowStartHour)
    startMinute = clamp(merged['minute'], 0, 59, 0)
    const endTotal = minuteOfDay(startHour, startMinute) + 60
    endHour = Math.floor((endTotal % (24 * 60)) / 60)
    endMinute = endTotal % 60
  }

  // 零长度窗口 = 永不触发。用户不会以为自己配了个永不触发的东西，所以纠正成 1 小时。
  if (minuteOfDay(startHour, startMinute) === minuteOfDay(endHour, endMinute)) {
    endHour = (startHour + 1) % 24
    endMinute = startMinute
  }

  const weekdays = Array.isArray(merged['weekdays'])
    ? [
        ...new Set(
          (merged['weekdays'] as unknown[]).filter(
            (day): day is number => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6,
          ),
        ),
      ].sort((a, b) => a - b)
    : base.weekdays

  const jitterMs = clamp(merged['jitterMs'], 0, 60 * 60 * 1000, base.jitterMs)
  const missedGraceMs = clamp(merged['missedGraceMs'], 0, 7 * 24 * 60 * 60 * 1000, base.missedGraceMs)

  return {
    enabled: merged['enabled'] !== false,
    windowStartHour: startHour,
    windowStartMinute: startMinute,
    windowEndHour: endHour,
    windowEndMinute: endMinute,
    weekdays,
    jitterMs,
    missedGraceMs,
  }
}

/** 后处理开关收敛（SR-44）：默认全开，只有显式 `false` 才关。 */
export function normalizePostProcess(patch: Partial<PlanPostProcess> | undefined): PlanPostProcess {
  return {
    score: patch?.score !== false,
    flag: patch?.flag !== false,
    dedup: patch?.dedup !== false,
  }
}

/** 平台覆盖项的默认值（`enabled` + 用方案级页数）。 */
export const DEFAULT_PLATFORM_OVERRIDE: PlanPlatformOverrideDto = { enabled: true, maxPages: null }

/**
 * 收敛平台覆盖项（批次 3）。两条规则都是"防将来出事"的：
 *
 * 1. **只保留 `platforms` 里有的 id**。覆盖一个不在方案里的平台多半是笔误；
 *    留着它最坏的后果是"某天把那个平台重新加回方案，覆盖突然生效" ——
 *    而那时用户早已忘了自己配过它。这是最难查的一类 bug。
 * 2. **等于默认值的条目不落库**，于是"什么都没配"的方案在库里与升级前**形状一致**，
 *    升级与回滚都安全（也让"稀疏"这件事在数据上真的成立）。
 */
export function normalizePlatformOverrides(
  patch: Record<string, Partial<PlanPlatformOverrideDto>> | undefined,
  platforms: readonly string[],
): Record<string, PlanPlatformOverrideDto> {
  const known = new Set(platforms)
  const out: Record<string, PlanPlatformOverrideDto> = {}
  for (const [id, raw] of Object.entries(patch ?? {})) {
    if (!known.has(id)) continue
    const enabled = raw.enabled !== false
    const maxPages =
      typeof raw.maxPages === 'number' && Number.isInteger(raw.maxPages) && raw.maxPages > 0
        ? raw.maxPages
        : null
    if (enabled && maxPages === null) continue
    out[id] = { enabled, maxPages }
  }
  return out
}

/** 读某个平台的覆盖项（缺省即默认）。**所有读覆盖项的地方都该走它**，别自己 `?? {}`。 */
export function platformOverrideOf(
  plan: Pick<PlanDto, 'platformOverrides'>,
  platformId: string,
): PlanPlatformOverrideDto {
  return plan.platformOverrides[platformId] ?? DEFAULT_PLATFORM_OVERRIDE
}

/**
 * 这个方案**实际会抓**的平台（去掉被停用的）。
 *
 * 单独一个函数而不是各处 `filter`：调度器的判定 / 执行 / 状态、以及"全部平台都被暂停"
 * 的派生判断都要用它，四处各写一遍迟早有一处忘记过滤。
 */
export function activePlatformsOf(plan: Pick<PlanDto, 'platforms' | 'platformOverrides'>): string[] {
  return plan.platforms.filter((id) => platformOverrideOf(plan, id).enabled)
}

/**
 * 关键词列表的读取侧收敛（静默卫生，不报错）：trim、丢空、去重（保首个出现序）。
 * 条数上限在**校验层**显式报错（`PLAN_KEYWORDS_MAX`）—— 读取侧不截断，
 * 否则手工改过库的行会被悄悄砍掉而无人知晓。
 */
export function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const keyword = item.trim()
    if (keyword === '' || seen.has(keyword)) continue
    seen.add(keyword)
    out.push(keyword)
  }
  return out
}

/**
 * 这个方案**实际要跑**的关键词序列（调度展开的唯一入口）。
 *
 * 恒返回**至少一个**元素：多关键词方案 → 逐个；老方案（只有 criteria.keyword）
 * → 单元素；什么都没有 → `['']`（一趟"不带关键词"的抓取，按平台默认列表）。
 * 保证非空让调度侧可以无条件 `for…of` —— "方案至少跑一趟"的语义在这里成立。
 */
export function keywordsOfPlan(plan: Pick<PlanDto, 'keywords' | 'criteria'>): string[] {
  if (plan.keywords.length > 0) return plan.keywords
  const single = plan.criteria['keyword']
  return [single !== undefined && single !== '' ? single : '']
}

/**
 * 某个平台在该方案里**实际使用的条件**（方案级 + 该平台覆盖的页数）。
 *
 * 目前只有 `maxPages` 会被覆盖 —— 条件本身（关键词/城市/…）仍是全方案共享，
 * 见 README.dev.md 的 P13：跨平台条件覆盖**明确未做**。
 */
export function criteriaForPlatform(
  plan: Pick<PlanDto, 'criteria' | 'platformOverrides'>,
  platformId: string,
): Record<string, string> {
  const override = platformOverrideOf(plan, platformId)
  if (override.maxPages === null) return plan.criteria
  return { ...plan.criteria, maxPages: String(override.maxPages) }
}

export interface PlanUpsertInput {
  name: string
  platforms: string[]
  /** 多关键词（逐个采集）。缺省/空 = 用 criteria.keyword（老形态）。 */
  keywords?: string[]
  /** 每平台的覆盖项（稀疏：等于默认的条目不落库）。 */
  platformOverrides?: Record<string, Partial<PlanPlatformOverrideDto>>
  criteria?: Record<string, string>
  schedule?: Partial<PlanSchedule>
  enabled?: boolean
  postProcess?: Partial<PlanPostProcess>
}

/** SR-20/21/22：调度引擎写回的运行时状态。 */
export interface PlanEnginePatch {
  lastAttemptAt?: string
  lastSuccessAt?: string
  failStreak?: number
  /** `null` 表示**清掉**退避（成功之后必须能清）。 */
  backoffUntil?: string | null
  riskPaused?: boolean
  riskReason?: string | null
}

/** 引擎运行时状态。 */
export interface PlanEngineState {
  failStreak: number
  backoffUntil: string | null
  riskPaused: boolean
  riskReason: string | null
}

export interface PlanRepo {
  create(input: PlanUpsertInput, now: string): PlanDto
  update(id: number, patch: Partial<PlanUpsertInput>, now: string): PlanDto
  get(id: number): PlanDto | undefined
  list(): PlanDto[]
  remove(id: number): boolean
  /** 定时器算完下一轮之后回写。 */
  setRunTimes(id: number, times: { lastRunAt?: string | null; nextRunAt?: string | null }): void
  /** SR-7/20/21：引擎状态回写（尝试/成功时刻、退避、连续失败、风控暂停）。 */
  setEngine(id: number, patch: PlanEnginePatch): void
  /** 读运行时引擎状态（不在 `PlanDto` 里：它属于"引擎"而不是"配置"）。 */
  engineState(id: number): PlanEngineState
  count(): number
}

function toDto(row: Row): PlanDto {
  const lastRunAt = asTextOrNull(row['last_run_at'])
  // SR-7：新库的 last_success_at 是权威；旧库（迁移前写入的行）回退到 last_run_at，
  // 这样"升级后第一次打开"不会显示成"从来没成功过"。
  const lastSuccessAt = asTextOrNull(row['last_success_at']) ?? lastRunAt
  const lastAttemptAt = asTextOrNull(row['last_attempt_at']) ?? lastRunAt
  const platforms = asJson<string[]>(row['platforms_json'], [])
  return {
    id: asInt(row['id']),
    name: asText(row['name']),
    platforms,
    // 多关键词：列从 v1 起就存在（此前一直写死 '[]'），读取时收敛一次。
    keywords: normalizeKeywords(asJson<string[]>(row['keywords_json'], [])),
    // 读的时候**再收敛一次**：手工改过库、或平台集合变过之后，
    // 库里仍可能残留"不在 platforms 里的覆盖项"。读取侧兜住比事后修数据可靠。
    platformOverrides: normalizePlatformOverrides(
      asJson<Record<string, Partial<PlanPlatformOverrideDto>>>(row['platform_overrides_json'], {}),
      platforms,
    ),
    criteria: asJson<Record<string, string>>(row['criteria_json'], {}),
    schedule: normalizeSchedule(asJson<Partial<PlanSchedule>>(row['schedule_json'], {})),
    enabled: asBool(row['enabled'], true),
    lastAttemptAt,
    lastSuccessAt,
    lastRunAt: lastSuccessAt,
    nextRunAt: asTextOrNull(row['next_run_at']),
    // 没有快照时**真的问一次本机时区**，而不是退回字符串 'UTC' ——
    // 那是假的：排程用的是本地墙钟，显示 UTC 会让用户以为时间算错了。
    timezone: asTextOrNull(row['timezone']) ?? detectTimezone(),
    postProcess: normalizePostProcess(asJson<Partial<PlanPostProcess>>(row['post_process_json'], {})),
    createdAt: asText(row['created_at']),
  }
}

export function createPlanRepo(db: DatabaseSync): PlanRepo {
  const insert = db.prepare(
    `INSERT INTO plan (
       name, platforms_json, platform_overrides_json, criteria_json, keywords_json, exclude_json,
       schedule_json, enabled, timezone, post_process_json, created_at
     ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
  )
  const selectById = db.prepare('SELECT * FROM plan WHERE id = ?')
  const selectAll = db.prepare('SELECT * FROM plan ORDER BY id')
  const updateStmt = db.prepare(
    `UPDATE plan SET name = ?, platforms_json = ?, platform_overrides_json = ?, criteria_json = ?,
       keywords_json = ?, schedule_json = ?, enabled = ?, timezone = ?, post_process_json = ? WHERE id = ?`,
  )
  const deleteStmt = db.prepare('DELETE FROM plan WHERE id = ?')
  // last_run_at 与 last_success_at **一起**推进：last_run_at 只是兼容字段，
  // 权威在 last_attempt_at / last_success_at（SR-7）。
  const setTimes = db.prepare(
    `UPDATE plan SET
       last_run_at = coalesce(?, last_run_at),
       last_attempt_at = coalesce(?, last_attempt_at),
       last_success_at = coalesce(?, last_success_at),
       next_run_at = ?
     WHERE id = ?`,
  )
  const setAttempt = db.prepare(
    `UPDATE plan SET
       last_attempt_at = coalesce(?, last_attempt_at),
       last_success_at = coalesce(?, last_success_at),
       last_run_at = coalesce(?, last_run_at)
     WHERE id = ?`,
  )
  const setBackoff = db.prepare(
    'UPDATE plan SET fail_streak = coalesce(?, fail_streak), backoff_until = ? WHERE id = ?',
  )
  const setRisk = db.prepare('UPDATE plan SET risk_paused = ?, risk_reason = ? WHERE id = ?')
  const selectEngine = db.prepare(
    'SELECT fail_streak, backoff_until, risk_paused, risk_reason FROM plan WHERE id = ?',
  )
  const countStmt = db.prepare('SELECT count(*) AS n FROM plan')

  const require = (id: number): PlanDto => {
    const row = selectById.get(id) as Row | undefined
    if (row === undefined) throw new Error(`plan ${String(id)} 不存在`)
    return toDto(row)
  }

  return {
    create(input, now): PlanDto {
      const schedule = normalizeSchedule(input.schedule)
      const postProcess = normalizePostProcess(input.postProcess)
      const result = insert.run(
        input.name,
        JSON.stringify(input.platforms),
        JSON.stringify(normalizePlatformOverrides(input.platformOverrides, input.platforms)),
        JSON.stringify(input.criteria ?? {}),
        JSON.stringify(normalizeKeywords(input.keywords)),
        JSON.stringify(schedule),
        input.enabled === false ? 0 : 1,
        detectTimezone(),
        JSON.stringify(postProcess),
        now,
      )
      return require(asId(result.lastInsertRowid))
    },

    update(id, patch, _now): PlanDto {
      const current = require(id)
      const schedule = normalizeSchedule(patch.schedule, current.schedule)
      const postProcess = normalizePostProcess({ ...current.postProcess, ...(patch.postProcess ?? {}) })
      // 平台集合变了就把覆盖项**重新收敛**一次：被移出方案的平台，其覆盖项必须一起丢掉，
      // 否则它会在"某天重新加回这个平台"时静默生效（见 normalizePlatformOverrides 的注释）。
      const platforms = patch.platforms ?? current.platforms
      const overrides = normalizePlatformOverrides(
        patch.platformOverrides ?? current.platformOverrides,
        platforms,
      )
      updateStmt.run(
        patch.name ?? current.name,
        JSON.stringify(platforms),
        JSON.stringify(overrides),
        JSON.stringify(patch.criteria ?? current.criteria),
        JSON.stringify(normalizeKeywords(patch.keywords ?? current.keywords)),
        JSON.stringify(schedule),
        (patch.enabled ?? current.enabled) ? 1 : 0,
        current.timezone,
        JSON.stringify(postProcess),
        id,
      )
      return require(id)
    },

    get(id): PlanDto | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toDto(row)
    },

    list(): PlanDto[] {
      return (selectAll.all() as Row[]).map(toDto)
    },

    remove(id): boolean {
      return asInt(deleteStmt.run(id).changes) > 0
    },

    setRunTimes(id, times): void {
      const lastRunAt = times.lastRunAt ?? null
      setTimes.run(lastRunAt, lastRunAt, lastRunAt, times.nextRunAt ?? null, id)
    },

    setEngine(id, patch): void {
      if (patch.lastAttemptAt !== undefined || patch.lastSuccessAt !== undefined) {
        setAttempt.run(
          patch.lastAttemptAt ?? null,
          patch.lastSuccessAt ?? null,
          patch.lastSuccessAt ?? null,
          id,
        )
      }
      if (patch.failStreak !== undefined || patch.backoffUntil !== undefined) {
        setBackoff.run(
          patch.failStreak ?? null,
          patch.backoffUntil === undefined ? null : patch.backoffUntil,
          id,
        )
      }
      if (patch.riskPaused !== undefined || patch.riskReason !== undefined) {
        setRisk.run(patch.riskPaused === true ? 1 : 0, patch.riskReason ?? null, id)
      }
    },

    engineState(id): PlanEngineState {
      const row = selectEngine.get(id) as Row | undefined
      return {
        failStreak: asInt(row?.['fail_streak']),
        backoffUntil: asTextOrNull(row?.['backoff_until']),
        riskPaused: asBool(row?.['risk_paused'], false),
        riskReason: asTextOrNull(row?.['risk_reason']),
      }
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}

export type { PlanDto, PlanPostProcess, PlanSchedule }
