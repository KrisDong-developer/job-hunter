/**
 * 数据保留策略与清理（§18）。
 *
 * ## 为什么这个模块必须存在
 *
 * §18.3 把「清理前预览」定为 **P0**，理由是：删除不可逆，而用户对"要删什么"没有概念时
 * 不敢点，于是要么不敢清（磁盘一直涨）、要么盲清（删掉还在用的东西）。所以这里的形状是
 * **预览与执行分开**，而且预览**必须无副作用**（能被反复调用，"预览"这个词才成立）。
 *
 * ## 三条来自文档、必须落到代码里的铁律
 *
 * 1. **删除不等于释放**（ARCHITECTURE §4.1 / R16）：SQLite 删行只把页标成空闲，
 *    文件不会缩小。所以执行完必须 `VACUUM`，而且预览里要**同时**给出
 *    "将释放（估算）"与"实际可用（VACUUM 之后的真实文件大小）"——
 *    否则用户看到"清了 2GB 而磁盘没变"就会失去信任。
 * 2. **用户资产不自动删**：投递 / 打招呼 / 消息 / 面试 / 简历与附件（§18.2「长期」「只由用户显式删除」）。
 *    它们连保留期配置都没有 —— 不是"默认值很大"，而是**根本没有那条路径**。
 * 3. **删父行会把记录变成孤儿**：`application` / `greeting` / `message` / `interview` /
 *    `tailoring` / `campus_application` 指向 `job` 的外键是 `ON DELETE SET NULL` ——
 *    删掉一个被碰过的岗位，那些记录会静默失去关联（看板变成"未知岗位"）。
 *    所以岗位清理带了整组 `NOT EXISTS` 条件（见 `JOBS_SAFE_FILTER`）。
 *
 * ## 占用口径（§18.3 P3）
 *
 * `tables` 用的是 `dbstat` 的**真实分页字节数**（node:sqlite 的 SQLite 3.49 带它，
 * 实测可用），不是估算；`types` 里的字节是按表均摊的**估算**（同一张表可能被多个类型共用，
 * 例如 `job` 同时承载"岗位行"与"JD 纯文本"），所以两者**不能相加** —— 这句话随接口下发。
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXPORTS_DIR_NAME,
  RETENTION_AUTO_CLEAN_DEFAULT,
  RETENTION_DEFAULTS,
  RETENTION_KEY,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
} from '../../shared/constants.js'
import type {
  CleanupPlanDto,
  CleanupPlanItemDto,
  CleanupResultDto,
  RetentionPolicy,
  StorageTypeDto,
  StorageUsageDto,
} from '../../shared/dto.js'
import { systemClock, type Clock } from '../util/time.js'
import { asInt, asText, type Row } from './row.js'
import type { Store } from './store.js'

// ─────────────────────────────────────────────────────────────────────
// 保留策略
// ─────────────────────────────────────────────────────────────────────

export type RetentionDaysKey = Exclude<keyof RetentionPolicy, 'autoCleanEnabled'>

const DAY_KEYS: readonly RetentionDaysKey[] = [
  'crawlRunsDays',
  'auditLogDays',
  'llmCallsDays',
  'pendingRepairDays',
  'jdTextDays',
  'jobsDays',
]

/**
 * 把任意输入收敛成合法策略。
 *
 * 坏值一律退回默认而不是抛错：这是配置，不是业务输入 ——
 * 界面传错一个字段不该让整块清理功能直接不可用。
 * `0` 是**合法值**（= 永久保留），所以不能把 0 当成"没填"。
 */
export function normalizeRetentionPolicy(input: unknown): RetentionPolicy {
  const fallback: RetentionPolicy = {
    ...RETENTION_DEFAULTS,
    autoCleanEnabled: RETENTION_AUTO_CLEAN_DEFAULT,
  }
  const raw = (input ?? null) as Record<string, unknown> | null
  if (raw === null || typeof raw !== 'object') return fallback

  const out: RetentionPolicy = { ...fallback }
  for (const key of DAY_KEYS) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.min(RETENTION_MAX_DAYS, Math.max(RETENTION_MIN_DAYS, Math.round(value)))
    }
  }
  if (typeof raw['autoCleanEnabled'] === 'boolean') out.autoCleanEnabled = raw['autoCleanEnabled']
  return out
}

export function readRetentionPolicy(store: Store): RetentionPolicy {
  return normalizeRetentionPolicy(store.setting.get<unknown>(RETENTION_KEY, 'global', ''))
}

export function writeRetentionPolicy(
  store: Store,
  patch: Partial<RetentionPolicy>,
  now: string,
): RetentionPolicy {
  const current = readRetentionPolicy(store)
  const next = normalizeRetentionPolicy({ ...current, ...patch })
  store.setting.set(RETENTION_KEY, 'global', '', next, now)
  return next
}

// ─────────────────────────────────────────────────────────────────────
// 清理类型
// ─────────────────────────────────────────────────────────────────────

interface RetentionTypeSpec {
  id: string
  label: string
  daysKey: RetentionDaysKey
  /** 所在表（用于把 dbstat 的真实占用摊到行上）。 */
  table: string
  /**
   * `delete` = 删行；`clear-column` = 只清字段（不删行）。
   *
   * 后者是 `jd_text` 专用的：JD 原文是体积大头，但它挂在岗位行上，
   * 而岗位行是几乎所有其他表的父行 —— 清字段比删行安全得多，且效果一样好。
   */
  mode: 'delete' | 'clear-column'
  /** 清它会失去什么 —— 预览里逐条显示，用户据此决定勾不勾。 */
  describe: string
  /** 条件（`?` = 到期时刻）。**唯一来源**：计数、删除、更新都用它，避免两处漂移。 */
  where: string
}

/**
 * 岗位清理的**安全条件**（`NOT EXISTS` 组）。
 *
 * 为什么这么长：那些子表指向 `job` 的外键都是 `ON DELETE SET NULL`，
 * 删父行会把用户资产静默变成孤儿。所以只删"从来没被碰过"的岗位 ——
 * 收藏（`state='saved'`）、有投递/打招呼/消息/面试/定制/校招关联的一律留下。
 * 同时要求 `jd_text IS NULL`：先清 JD 字段、后删空壳行，两步不重叠。
 */
const JOBS_SAFE_FILTER = `
  last_seen_at < ?
  AND state <> 'saved'
  AND jd_text IS NULL
  AND NOT EXISTS (SELECT 1 FROM application a WHERE a.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM greeting g WHERE g.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM message m WHERE m.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM interview i WHERE i.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM tailoring t WHERE t.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM campus_application c WHERE c.job_id = job.id)
  AND NOT EXISTS (SELECT 1 FROM offer o WHERE o.job_id = job.id)
`

/** JD 字段清理的条件（与 `SPECS` 里 jdText 那一项共用）。 */
const JD_FIELDS_FILTER = '(jd_text IS NOT NULL OR jd_summary IS NOT NULL) AND last_seen_at < ?'

const SPECS: readonly RetentionTypeSpec[] = [
  {
    id: 'crawlRuns',
    label: '抓取运行记录',
    daysKey: 'crawlRunsDays',
    table: 'crawl_run',
    mode: 'delete',
    describe: '每一轮抓取的执行记录（页数 / 新增 / 失败原因）。清掉只影响「运行历史」，不动任何岗位数据。',
    where: 'started_at < ?',
  },
  {
    id: 'auditLog',
    label: '操作审计',
    daysKey: 'auditLogDays',
    table: 'audit_log',
    mode: 'delete',
    describe: '每次过闸门动作的留痕（只存字段摘要与长度，不含正文）。清掉之后就查不到"什么时候对哪个平台做过什么"。',
    where: 'at < ?',
  },
  {
    id: 'llmCalls',
    label: '模型调用留痕',
    daysKey: 'llmCallsDays',
    table: 'llm_call',
    mode: 'delete',
    describe: '每次模型调用的**外发字段清单**（I5 知情同意要可查）。§18.2 定为长期，所以默认永不清理。',
    where: 'at < ?',
  },
  {
    id: 'pendingRepair',
    label: '已处理的待修复记录',
    daysKey: 'pendingRepairDays',
    table: 'pending_repair',
    mode: 'delete',
    describe: '**已丢弃 / 已重放**的隔离记录。仍然 pending 的一条都不清 —— 那还是待办（在「采集」页看）。',
    where: "replay_state <> 'pending' AND captured_at < ?",
  },
  {
    id: 'jdText',
    label: 'JD 原文与摘要',
    daysKey: 'jdTextDays',
    table: 'job',
    mode: 'clear-column',
    describe:
      '这是**体积大头**。只清 `jd_text` / `jd_summary` 两个字段，**不删岗位行** —— ' +
      '筛选、匹配分、投递记录、看板都不受影响；代价是面试前回看不了那段原文。',
    where: JD_FIELDS_FILTER,
  },
  {
    id: 'jobs',
    label: '从没被碰过的老岗位',
    daysKey: 'jobsDays',
    table: 'job',
    mode: 'delete',
    describe:
      '只删「你没收藏、也没投递 / 打招呼 / 聊过 / 约面 / 定制过」的岗位。' +
      '**碰过的永不自动删** —— 那些记录靠 SET NULL 指向岗位，删父行会把它们变成孤儿。',
    where: JOBS_SAFE_FILTER,
  },
]

/**
 * **长期保留**的类型（§18.2）：不参与自动清理，只在占用页展示。
 *
 * 为什么单独列出来而不是省略：用户问"会不会把我的投递记录删掉"时，
 * 界面上必须能**指着这一屏**说"这些不在清理范围内"，而不是靠口头保证。
 */
const LONG_TERM_TYPES: ReadonlyArray<{ id: string; label: string; table: string; note: string }> = [
  { id: 'greetings', label: '打招呼记录', table: 'greeting', note: '接触态与话术效果的载体' },
  { id: 'applications', label: '投递记录', table: 'application', note: '归因与复盘的核心资产' },
  { id: 'messages', label: '消息', table: 'message', note: '与 HR 的往来原文' },
  { id: 'interviews', label: '面试', table: 'interview', note: '日程与复盘' },
  { id: 'tailorings', label: '简历定制记录', table: 'tailoring', note: '哪一版投了哪个岗' },
  { id: 'resumes', label: '简历版本', table: 'resume', note: '用户资产，只由用户显式删除（含附件）' },
  { id: 'campus', label: '校招记录', table: 'campus_application', note: '笔试与三方是不可逆节点' },
  { id: 'questions', label: '面试错题本', table: 'question_note', note: '自己攒的题与答案，只由用户显式删除' },
  { id: 'offers', label: 'Offer', table: 'offer', note: '拿到手之后的报价与截止时间，是决策依据' },
]

// ─────────────────────────────────────────────────────────────────────
// 占用统计（§18.3 P3）
// ─────────────────────────────────────────────────────────────────────

/** 递归统计一个目录的文件数与字节数；目录不存在时全 0（而不是抛错）。 */
function dirUsage(dir: string): { fileCount: number; bytes: number } {
  let fileCount = 0
  let bytes = 0
  const walk = (current: string): void => {
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(current, name)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          walk(full)
          continue
        }
        if (!stat.isFile()) continue
        bytes += stat.size
        fileCount += 1
      } catch {
        /* 单个条目读不到（权限 / 被占用）不该让整屏统计失败 */
      }
    }
  }
  walk(dir)
  return { fileCount, bytes }
}

function fileSizeOrZero(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

interface TableBytes {
  /** 表名 → 字节数。 */
  bytes: Map<string, number>
  /** 索引、`sqlite_master` 等非业务表的分页字节数合计。 */
  other: number
  /**
   * `dbstat` 是否可用。
   *
   * 它是 SQLite 的统计虚表，**需要编译时开启**（`SQLITE_ENABLE_DBSTAT_VTAB`）。
   * node:sqlite 的 SQLite 3.49 实测带它；万一某个环境没有，这里如实标成不可用 ——
   * 不编一组看起来合理的数字出来。
   */
  available: boolean
}

function tableBytesOf(store: Store): TableBytes {
  const bytes = new Map<string, number>()
  let other = 0
  try {
    const rows = store.db.prepare('SELECT name, sum(pgsize) AS n FROM dbstat GROUP BY name').all() as Row[]
    const userTables = new Set(
      (store.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Row[]).map((row) => asText(row['name'])),
    )
    for (const row of rows) {
      const name = asText(row['name'])
      const size = asInt(row['n'])
      if (userTables.has(name)) bytes.set(name, size)
      else other += size
    }
    return { bytes, other, available: true }
  } catch {
    return { bytes, other, available: false }
  }
}

function countOf(store: Store, sql: string, ...params: unknown[]): number {
  const row = store.db.prepare(sql).get(...(params as never[])) as Row | undefined
  return asInt(row?.['n'])
}

/** 该表当前的真实占用 ÷ 行数（`delete` 类类型的字节估算基准）。 */
function bytesPerRow(store: Store, tableBytes: TableBytes, table: string): number {
  const rows = countOf(store, `SELECT count(*) AS n FROM ${table}`)
  if (rows === 0) return 0
  return (tableBytes.bytes.get(table) ?? 0) / rows
}

/**
 * 到期时刻（ISO）。`0` 天 = 永久保留 → 返回 `''`，调用方据此**不执行**。
 *
 * `now` 从外面传进来（而不是 `Date.now()`）：清理是"按时间删数据"的功能，
 * 它的判定必须能在测试里被钉死在某个时刻上。
 */
function cutoffIso(days: number, now: string): string {
  if (days <= 0) return ''
  const base = Date.parse(now)
  if (!Number.isFinite(base)) return ''
  return new Date(base - days * 86_400_000).toISOString()
}

/** 执行/计数用的一行 SQL（计数与删除/更新**共用同一个 where**）。 */
function countSqlOf(spec: RetentionTypeSpec): string {
  return `SELECT count(*) AS n FROM ${spec.table} WHERE ${spec.where}`
}

/** `clear-column` 类型要清哪几列（只此一处，执行与预览都读它）。 */
const CLEARED_COLUMNS = 'jd_text = NULL, jd_summary = NULL'

export function storageUsageOf(store: Store, dataDir: string, clock: Clock = systemClock): StorageUsageDto {
  const policy = readRetentionPolicy(store)
  const now = clock()
  const raw = tableBytesOf(store)
  const dbBytes = fileSizeOrZero(store.path)
  const walBytes = fileSizeOrZero(`${store.path}-wal`)
  const filesDir = join(dataDir, 'files')
  const exportsDir = join(dataDir, EXPORTS_DIR_NAME)

  const tables = [...raw.bytes.entries()]
    .map(([table, bytes]) => ({
      table,
      bytes,
      rows: countOf(store, `SELECT count(*) AS n FROM ${table}`),
    }))
    .sort((a, b) => b.bytes - a.bytes)
  // 索引与内部结构单列一行，否则"各表加起来 ≠ 文件大小"会看起来像算错了
  if (raw.other > 0) tables.push({ table: '（索引与内部结构）', bytes: raw.other, rows: 0 })

  const types: StorageTypeDto[] = [
    ...SPECS.map((spec): StorageTypeDto => {
      const cutoff = cutoffIso(policy[spec.daysKey], now)
      const rows = cutoff === '' ? 0 : countOf(store, countSqlOf(spec), cutoff)
      // `clear-column`：真正会消失的是文本本身的字节，直接量它比摊页更准
      const bytes =
        spec.mode === 'clear-column'
          ? countOf(
              store,
              'SELECT coalesce(sum(length(jd_text)), 0) + coalesce(sum(length(jd_summary)), 0) AS n FROM job WHERE (jd_text IS NOT NULL OR jd_summary IS NOT NULL) AND last_seen_at < ?',
              cutoff === '' ? '0000-01-01T00:00:00.000Z' : cutoff,
            )
          : Math.round(rows * bytesPerRow(store, raw, spec.table))
      return {
        id: spec.id,
        label: spec.label,
        rows,
        bytes,
        auto: true,
        retentionDays: policy[spec.daysKey],
        note: spec.describe,
      }
    }),
    ...LONG_TERM_TYPES.map((entry): StorageTypeDto => {
      const rows = countOf(store, `SELECT count(*) AS n FROM ${entry.table}`)
      return {
        id: entry.id,
        label: entry.label,
        rows,
        bytes: Math.round(rows * bytesPerRow(store, raw, entry.table)),
        auto: false,
        retentionDays: 0,
        note: `${entry.note} —— 长期保留，不在清理范围内。`,
      }
    }),
  ]

  return {
    generatedAt: now,
    dataDir,
    db: { path: store.path, bytes: dbBytes, walBytes },
    attachments: { dir: filesDir, ...dirUsage(filesDir) },
    exports: { dir: exportsDir, ...dirUsage(exportsDir) },
    tables,
    types,
    note: raw.available
      ? '"按表"的字节数来自 SQLite 的 dbstat（真实分页大小；索引与内部结构另列一行）；' +
        '"按类型"的字节是**估算**（同一张表可能被多个类型共用），两栏不能相加。'
      : '当前 SQLite 没有编译 dbstat，所以只给行数、不给按表字节数 —— 不编数字。',
  }
}

// ─────────────────────────────────────────────────────────────────────
// 预览（§18.3 P2，P0）
// ─────────────────────────────────────────────────────────────────────

/** 预览：**只读、无副作用**。同一时刻反复调用结果一致。 */
export function cleanupPlanOf(store: Store, clock: Clock = systemClock): CleanupPlanDto {
  const policy = readRetentionPolicy(store)
  const now = clock()
  const raw = tableBytesOf(store)

  const items: CleanupPlanItemDto[] = SPECS.map((spec) => {
    const days = policy[spec.daysKey]
    const cutoff = cutoffIso(days, now)
    // 保留期为 0 = 永久保留 —— 这一项**不执行**，但仍在预览里显示（并说明原因），
    // 否则用户会以为"没列出来 = 没管这类数据"
    const rows = cutoff === '' ? 0 : countOf(store, countSqlOf(spec), cutoff)
    const bytes =
      spec.mode === 'clear-column'
        ? rows === 0
          ? 0
          : countOf(
              store,
              'SELECT coalesce(sum(length(jd_text)), 0) + coalesce(sum(length(jd_summary)), 0) AS n FROM job WHERE (jd_text IS NOT NULL OR jd_summary IS NOT NULL) AND last_seen_at < ?',
              cutoff,
            )
        : Math.round(rows * bytesPerRow(store, raw, spec.table))
    return {
      id: spec.id,
      label: spec.label,
      rows,
      bytes,
      reason:
        cutoff === ''
          ? '保留期设为 0（永久保留）—— 这一项不会执行。'
          : `${rows} 条的最后活动时间早于 ${days} 天前（${cutoff.slice(0, 10)}）。`,
      describe: spec.describe,
      willRun: cutoff !== '' && rows > 0,
    }
  })

  const totalRows = items.reduce((sum, item) => sum + item.rows, 0)
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
  const dbBytesBefore = fileSizeOrZero(store.path)
  return {
    generatedAt: now,
    items,
    totalRows,
    totalBytes,
    dbBytesBefore,
    dbBytesAfterEstimate: Math.max(0, dbBytesBefore - totalBytes),
    note:
      '删除**不会立刻缩小文件** —— SQLite 只是把页标成空闲。执行清理时会跑一次 VACUUM，' +
      '那之后文件才会真的变小；所以"预计清理后"是估算，实际值以执行结果里的前后对比为准。',
  }
}

// ─────────────────────────────────────────────────────────────────────
// 执行
// ─────────────────────────────────────────────────────────────────────

export interface CleanupRunOptions {
  /**
   * 只清这几类（缺省 = 预览里 `willRun` 的全部）。
   *
   * 存在的理由：界面上每一项旁边都有勾选，用户可能只想清"JD 原文"而不动审计。
   */
  only?: readonly string[]
}

/**
 * 执行清理。
 *
 * ⚠️ **调用方必须先持有租约**（只读实例不许写库）—— 这条不在本函数里断言，
 * 因为它需要 lease 对象；路由层统一校验（与 `crawl` / `startLogin` 同一条纪律）。
 */
export function runCleanupOf(
  store: Store,
  options: CleanupRunOptions = {},
  clock: Clock = systemClock,
): CleanupResultDto {
  const policy = readRetentionPolicy(store)
  const now = clock()
  const plan = cleanupPlanOf(store, clock)
  const wanted = options.only === undefined ? null : new Set(options.only)

  const applied: Array<{ id: string; label: string; rows: number; bytes: number }> = []
  for (const spec of SPECS) {
    const item = plan.items.find((entry) => entry.id === spec.id)
    if (item === undefined || !item.willRun) continue
    if (wanted !== null && !wanted.has(spec.id)) continue
    const cutoff = cutoffIso(policy[spec.daysKey], now)
    if (cutoff === '') continue
    const changes =
      spec.mode === 'clear-column'
        ? store.db.prepare(`UPDATE ${spec.table} SET ${CLEARED_COLUMNS} WHERE ${spec.where}`).run(cutoff).changes
        : store.db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.where}`).run(cutoff).changes
    const rows = Number(changes)
    if (rows > 0) applied.push({ id: spec.id, label: spec.label, rows, bytes: item.bytes })
  }

  const before = fileSizeOrZero(store.path)
  const totalRows = applied.reduce((sum, item) => sum + item.rows, 0)

  // ── VACUUM：不跑这一步，用户会看到"清了 N 条，文件一点没变"（R16）──
  let vacuumed = false
  if (totalRows > 0) {
    try {
      store.db.exec('VACUUM')
      vacuumed = true
    } catch {
      /* VACUUM 失败（例如被并发写占用）不该把已经删掉的数据当成"没删" —— 如实标记未执行 */
    }
  }
  const after = fileSizeOrZero(store.path)

  return {
    executedAt: now,
    items: applied,
    totalRows,
    dbBytesBefore: before,
    dbBytesAfter: after,
    vacuumed,
    note: vacuumed
      ? '已执行 VACUUM，文件大小是真的缩小了（见前后对比）。'
      : totalRows === 0
        ? '没有需要清理的数据 —— 一个字节都没动。'
        : '数据已清理，但 VACUUM 没跑成（可能被并发写占用），文件暂时不会变小；下次清理或被关掉重开时会回收。',
  }
}

/**
 * 启动时的**定时清理**（§18.3 P1），默认关闭（见 `RETENTION_AUTO_CLEAN_DEFAULT`）。
 *
 * 为什么放在启动而不是心跳里：VACUUM 可能阻塞几百毫秒到几秒，
 * 而心跳是几十秒一次的轻活（同步硬截止待办）—— 往里塞一个可能几秒的写操作，
 * 迟早会把某次心跳拖出问题。启动时只跑一次，代价可预期。
 */
export function maybeAutoClean(store: Store, clock: Clock = systemClock): CleanupResultDto | null {
  const policy = readRetentionPolicy(store)
  if (!policy.autoCleanEnabled) return null
  const result = runCleanupOf(store, {}, clock)
  return result.totalRows > 0 ? result : null
}
