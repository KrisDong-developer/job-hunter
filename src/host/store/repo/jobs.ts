import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/constants.js'
import type { JobDto } from '../../../shared/dto.js'
import { JOB_STATES, type JobFlagType, type JobState } from '../../../shared/enums.js'
import { asId, asInt, asIntOrNull, asJson, asRealOrNull, asText, asTextOrNull, type Row } from '../row.js'

/** 岗位写入/筛选所需的标量字段（活对象已被适配器剥掉，§4.3 P7）。 */
export interface JobUpsertInput {
  platformId: string
  platformJobId: string
  title: string
  companyId: number | null
  salaryRaw: string
  salaryMin: number | null
  salaryMax: number | null
  salaryMonths: number | null
  city: string
  district: string
  expReq: string
  eduReq: string
  tags: string[]
  sourceUrl: string
  publishedAt: string | null
  jdText?: string | null
}

/**
 * 算分时"用的是哪一版简历"（§4.1）。
 *
 * 单独立一个类型是因为它必须**跟着分数一起写**：只写分数不写版本，
 * 就没法判断旧分数是否过期 —— 而"展示旧分数误导决策"正是 §4.1 点名的那个坑。
 */
export interface MatchStamp {
  resumeId: number | null
  rev: number
}

export interface JobQuery {  state?: JobState
  platformId?: string
  /** 多城市：命中任意一个即可（`IN` 查询）。 */
  cities?: string[]
  /** 兼容的单城市旧字段（有 `cities` 时以 `cities` 为准）。 */
  city?: string
  companyId?: number
  /** 标题模糊匹配（走 LIKE，仅作粗筛）。 */
  keyword?: string
  /**
   * 经验 / 学历要求：命中任意一个即可（`IN`）。
   *
   * 存的是**平台原始串**（"3-5年"、"本科"），不是枚举 —— 各平台写法不统一，
   * 归一化到一套枚举会丢掉原文里的信息。所以筛选只能按"库里已有的取值"多选，
   * 取值集由 `facets` 给出（界面上是 chips，不是输入框）。
   */
  expReqs?: string[]
  eduReqs?: string[]
  /** 只要月薪下限 ≥ 该值的岗位。 */
  minSalaryAtLeast?: number
  /**
   * 只要**首次见到**时间 ≥ 该时刻（ISO）的岗位 —— 即「只看新增」。
   *
   * 口径刻意与 U0 的「今日新增」（`countSince`：`first_seen_at >= ?`）**完全一致**：
   * 同一列、同一个比较符。两边若各写一套，首屏说"今日新增 12 条"而列表筛出 3 条，
   * 用户只会认为其中一个坏了 —— 而它们看的是同一份数据。
   *
   * ⚠️ 比的是 `first_seen_at` 而不是 `crawled_at` / `last_seen_at`：
   * 后两者每轮都刷新，用它筛出来的永远等于"本轮抓到的全部"，那叫"这次抓了多少"，
   * 不叫"新出现了多少岗位"。
   */
  firstSeenSince?: string
  orderBy?: 'crawled_at' | 'salary_min' | 'title' | 'last_seen_at' | 'first_seen_at'
  descending?: boolean
  /**
   * 屏蔽这些标注类型的岗位：命中任意一个标注的岗位一律不显示（`NOT EXISTS`）。
   * 「一键屏蔽疑似外包/高风险」落在这里 —— 风险标签是已算好的事实，屏蔽是查询层的事。
   */
  excludeFlagTypes?: JobFlagType[]
  /**
   * **按跨平台去重分组折叠**（批次 4）。
   *
   * 同一条岗位在 4 个平台各抓一条时，列表里只留一行（组内 id 最小的那个），
   * 而不是让用户在一屏里看到四条几乎一样的卡片。
   *
   * `total` 与分页也按**折叠后**的数量算（`countMatching` 走同一段 WHERE）——
   * 否则"共 40 条 / 只有 12 行"会变成一个新谜题。
   */
  groupDuplicates?: boolean
}

export interface JobRepo {
  /** 幂等写入：按 `(platform_id, platform_job_id)` upsert，重复跑不产生重复数据（§6.1）。 */
  upsert(input: JobUpsertInput, now: string): { id: number; outcome: 'inserted' | 'updated' }
  query(filters?: JobQuery, limit?: number, offset?: number): JobDto[]
  detail(id: number): JobDto | undefined
  mark(id: number, state: JobState): boolean
  /** 读 JD 正文（列表页拿不到，P2+ 的详情页才有）。 */
  jdText(id: number): string | null
  /** 写匹配分与**逐条理由**（§4.5.1：分数必须可解释）。 */
  setMatch(id: number, score: number, reasons: unknown, stamp?: MatchStamp | undefined): void
  /** 读回匹配理由。 */
  matchReasons(id: number): Array<{ kind: string; text: string; weight: number }>
  count(): number
  /** 与 `query` 用同一套 WHERE 的计数（分页 total 用）。 */
  countMatching(filters?: JobQuery): number
  /** 首次见到时间 ≥ 该时刻的岗位数（U0 的「今日新增」）。 */
  countSince(iso: string): number
  countByState(): Record<string, number>
  latest(limit?: number): JobDto[]
  /** 出去重后的城市列表（界面多选城市用；空城市不返回）。 */
  listCities(): string[]
  /** 去重后的经验要求取值（界面多选 chips 用；空值不返回）。 */
  listExpReqs(): string[]
  /** 去重后的学历要求取值（同上）。 */
  listEduReqs(): string[]
}

/* 平台名在服务端 JOIN 出来，而不是让界面自己拿 platformId 去查一遍：
   岗位详情的内嵌栏被岗位库 / 流水线 / 消息 / 面试四个屏共用，
   放在客户端就意味着每个屏都要各自拉一次平台列表，还会各自漂。
   这与 `company_name` 的做法保持一致。 */
const SELECT_BASE = `
SELECT j.*, c.name AS company_name, p.display_name AS platform_name
FROM job j
LEFT JOIN company c ON c.id = j.company_id
LEFT JOIN platform p ON p.id = j.platform_id`

/** 排序列白名单 —— 绝不把入参拼进 SQL。 */
const ORDER_COLUMNS: Record<NonNullable<JobQuery['orderBy']>, string> = {
  crawled_at: 'j.crawled_at',
  salary_min: 'j.salary_min',
  title: 'j.title',
  last_seen_at: 'j.last_seen_at',
  first_seen_at: 'j.first_seen_at',
}

function toDto(row: Row): JobDto {
  return {
    id: asInt(row['id']),
    platformId: asText(row['platform_id']),
    // 平台表里可能还没登记这一行（历史数据 / 平台被卸载）→ 留 null，界面退回显示 id
    platformName: asTextOrNull(row['platform_name']),
    platformJobId: asText(row['platform_job_id']),
    title: asText(row['title']),
    companyId: asIntOrNull(row['company_id']),
    companyName: asTextOrNull(row['company_name']),
    salaryRaw: asText(row['salary_raw']),
    salaryMin: asIntOrNull(row['salary_min']),
    salaryMax: asIntOrNull(row['salary_max']),
    salaryMonths: asIntOrNull(row['salary_months']),
    city: asText(row['city']),
    district: asText(row['district']),
    expReq: asText(row['exp_req']),
    eduReq: asText(row['edu_req']),
    tags: asJson<string[]>(row['tags_json'], []),
    sourceUrl: asText(row['source_url']),
    publishedAt: asTextOrNull(row['published_at']),
    firstSeenAt: asText(row['first_seen_at']),
    lastSeenAt: asText(row['last_seen_at']),
    state: asText(row['state'], 'new') as JobState,
    matchScore: asRealOrNull(row['match_score']),
    // §4.1：分数是**简历版本的函数**。记下算分时用的是哪一版、哪个 rev，
    // 这样简历一改就能判定"这个分过期了"，而不是继续拿旧分误导决策。
    scoreRev: asInt(row['score_rev'], 0),
    scoreResumeId: asIntOrNull(row['score_resume_id']),
    // 真正的过期判定需要"当前版本"，那是领域层的事（这里先给 false）
    scoreStale: false,
    // 标注类型由领域层批量补齐（一次 IN 查询，避免列表页 N+1）
    flagTypes: [],
    // 跨平台去重分组（批次 4）：列表据此**按组折叠**，同一条岗位在多个平台各抓一条时只占一行
    dedupGroupId: asIntOrNull(row['dedup_group_id']),
  }
}

export function createJobRepo(db: DatabaseSync): JobRepo {
  const cache = new Map<string, StatementSync>()
  const prepare = (sql: string): StatementSync => {
    const hit = cache.get(sql)
    if (hit !== undefined) return hit
    const statement = db.prepare(sql)
    cache.set(sql, statement)
    return statement
  }

  const selectIdByKey = db.prepare(
    'SELECT id FROM job WHERE platform_id = ? AND platform_job_id = ?',
  )
  const insert = db.prepare(
    `INSERT INTO job (
       platform_id, platform_job_id, title, company_id, salary_raw, salary_min, salary_max, salary_months,
       city, district, exp_req, edu_req, tags_json, jd_text, published_at,
       first_seen_at, last_seen_at, crawled_at, source_url, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
  )
  // 注意：**不覆盖** state / first_seen_at —— 前者是用户的处置态，后者是“首次见到”的事实。
  const update = db.prepare(
    `UPDATE job SET
       title = ?, company_id = ?, salary_raw = ?, salary_min = ?, salary_max = ?, salary_months = ?,
       city = ?, district = ?, exp_req = ?, edu_req = ?, tags_json = ?,
       jd_text = coalesce(?, jd_text), published_at = coalesce(?, published_at),
       last_seen_at = ?, crawled_at = ?, source_url = ?
     WHERE id = ?`,
  )
  const selectById = db.prepare(`${SELECT_BASE} WHERE j.id = ?`)
  const markStmt = db.prepare('UPDATE job SET state = ? WHERE id = ?')
  const jdTextStmt = db.prepare('SELECT jd_text FROM job WHERE id = ?')
  const setMatchStmt = db.prepare(
    'UPDATE job SET match_score = ?, match_reasons_json = ?, score_rev = ?, score_resume_id = ? WHERE id = ?',
  )
  const reasonsStmt = db.prepare('SELECT match_reasons_json FROM job WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM job')
  const countSinceStmt = db.prepare('SELECT count(*) AS n FROM job WHERE first_seen_at >= ?')
  const countByStateStmt = db.prepare('SELECT state, count(*) AS n FROM job GROUP BY state')

  const buildWhere = (filters: JobQuery): { clause: string; params: Array<string | number> } => {
    const where: string[] = []
    const params: Array<string | number> = []

    if (filters.state !== undefined) {
      where.push('j.state = ?')
      params.push(filters.state)
    }
    if (filters.platformId !== undefined) {
      where.push('j.platform_id = ?')
      params.push(filters.platformId)
    }
    if (filters.city !== undefined && filters.city !== '') {
      where.push('j.city = ?')
      params.push(filters.city)
    }
    if (filters.cities !== undefined && filters.cities.length > 0) {
      where.push(`j.city IN (${filters.cities.map(() => '?').join(',')})`)
      params.push(...filters.cities)
    }
    if (filters.excludeFlagTypes !== undefined && filters.excludeFlagTypes.length > 0) {
      // 标注存在独立表：屏蔽 = 该岗位**不存在**命中所选标注类型的记录。
      // NOT EXISTS 比 LEFT JOIN + NULL 判断更直白，也不会因重复标注把行翻倍。
      where.push(
        `NOT EXISTS (SELECT 1 FROM job_flag f WHERE f.job_id = j.id AND f.flag_type IN (${filters.excludeFlagTypes.map(() => '?').join(',')}))`,
      )
      params.push(...filters.excludeFlagTypes)
    }
    if (filters.companyId !== undefined) {
      where.push('j.company_id = ?')
      params.push(filters.companyId)
    }
    if (filters.expReqs !== undefined && filters.expReqs.length > 0) {
      where.push(`j.exp_req IN (${filters.expReqs.map(() => '?').join(',')})`)
      params.push(...filters.expReqs)
    }
    if (filters.eduReqs !== undefined && filters.eduReqs.length > 0) {
      where.push(`j.edu_req IN (${filters.eduReqs.map(() => '?').join(',')})`)
      params.push(...filters.eduReqs)
    }
    if (filters.keyword !== undefined && filters.keyword !== '') {
      where.push('j.title LIKE ?')
      params.push(`%${filters.keyword}%`)
    }
    if (filters.minSalaryAtLeast !== undefined) {
      where.push('j.salary_min >= ?')
      params.push(filters.minSalaryAtLeast)
    }
    if (filters.firstSeenSince !== undefined && filters.firstSeenSince !== '') {
      where.push('j.first_seen_at >= ?')
      params.push(filters.firstSeenSince)
    }
    if (filters.groupDuplicates === true) {
      // 每组只留**最小 id**（`primary_job_id` 未必是最小的，而"最小的那个"是稳定且
      // 与插入顺序一致的；用 primary 会让同一组在不同查询里换代表）。
      // 没有分组的岗位（`dedup_group_id IS NULL`）各自独立，直接放行。
      //
      // 用相关子查询而不是 `GROUP BY`：`GROUP BY` 之后 `SELECT j.*` 拿到的行是
      // SQLite 的"组内任一行"，非确定 —— 折叠出来的代表会随索引变化而变。
      where.push(
        `(j.dedup_group_id IS NULL OR j.id = (
           SELECT MIN(g.id) FROM job g WHERE g.dedup_group_id = j.dedup_group_id
         ))`,
      )
    }

    return { clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params }
  }

  const query = (
    filters: JobQuery = {},
    limit: number = PAGE_SIZE_DEFAULT,
    offset = 0,
  ): JobDto[] => {
    const { clause, params } = buildWhere(filters)
    const orderColumn = ORDER_COLUMNS[filters.orderBy ?? 'crawled_at']
    const direction = filters.descending === false ? 'ASC' : 'DESC'
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX))
    const safeOffset = Math.max(0, Math.trunc(offset))

    // 强制 LIMIT：禁止无界查询进热路径（§4.1）。NULL 排在最后，避免“面议”占据榜首。
    const sql = `${SELECT_BASE}
      ${clause}
      ORDER BY ${orderColumn} IS NULL, ${orderColumn} ${direction}, j.id DESC
      LIMIT ? OFFSET ?`

    return (prepare(sql).all(...params, safeLimit, safeOffset) as Row[]).map(toDto)
  }

  const countMatching = (filters: JobQuery = {}): number => {
    const { clause, params } = buildWhere(filters)
    const row = prepare(`SELECT count(*) AS n FROM job j ${clause}`).get(...params) as Row | undefined
    return asInt(row?.['n'])
  }

  return {
    upsert(input, now): { id: number; outcome: 'inserted' | 'updated' } {
      const tagsJson = JSON.stringify(input.tags)
      const existing = selectIdByKey.get(input.platformId, input.platformJobId) as Row | undefined

      if (existing !== undefined) {
        const id = asInt(existing['id'])
        update.run(
          input.title,
          input.companyId,
          input.salaryRaw,
          input.salaryMin,
          input.salaryMax,
          input.salaryMonths,
          input.city,
          input.district,
          input.expReq,
          input.eduReq,
          tagsJson,
          input.jdText ?? null,
          input.publishedAt,
          now,
          now,
          input.sourceUrl,
          id,
        )
        return { id, outcome: 'updated' }
      }

      const result = insert.run(
        input.platformId,
        input.platformJobId,
        input.title,
        input.companyId,
        input.salaryRaw,
        input.salaryMin,
        input.salaryMax,
        input.salaryMonths,
        input.city,
        input.district,
        input.expReq,
        input.eduReq,
        tagsJson,
        input.jdText ?? null,
        input.publishedAt,
        now,
        now,
        now,
        input.sourceUrl,
      )
      return { id: asId(result.lastInsertRowid), outcome: 'inserted' }
    },

    query,

    detail(id): JobDto | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toDto(row)
    },

    mark(id, state): boolean {
      if (!JOB_STATES.includes(state)) return false
      const result = markStmt.run(state, id)
      return asInt(result.changes) > 0
    },

    jdText(id): string | null {
      const row = jdTextStmt.get(id) as Row | undefined
      return row === undefined ? null : asTextOrNull(row['jd_text'])
    },

    setMatch(id, score, reasons, stamp): void {
      setMatchStmt.run(
        score,
        JSON.stringify(reasons ?? []),
        stamp?.rev ?? 0,
        stamp?.resumeId ?? null,
        id,
      )
    },

    matchReasons(id): Array<{ kind: string; text: string; weight: number }> {
      const row = reasonsStmt.get(id) as Row | undefined
      if (row === undefined) return []
      const parsed = asJson<unknown[]>(row['match_reasons_json'], [])
      return parsed.flatMap((item) => {
        if (item === null || typeof item !== 'object') return []
        const record = item as Record<string, unknown>
        return [
          {
            kind: typeof record['kind'] === 'string' ? record['kind'] : 'unknown',
            text: typeof record['text'] === 'string' ? record['text'] : '',
            weight: typeof record['weight'] === 'number' ? record['weight'] : 0,
          },
        ]
      })
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },

    countSince(iso): number {
      const row = countSinceStmt.get(iso) as Row | undefined
      return asInt(row?.['n'])
    },

    countMatching(filters = {}): number {
      return countMatching(filters)
    },

    countByState(): Record<string, number> {
      const out: Record<string, number> = {}
      for (const row of countByStateStmt.all() as Row[]) {
        out[asText(row['state'])] = asInt(row['n'])
      }
      return out
    },

    latest(limit = PAGE_SIZE_DEFAULT): JobDto[] {
      return query({}, limit, 0)
    },

    listCities(): string[] {
      // COLLATE NOCASE 去重大小写（深圳/深圳 之类），并按常用城市字面排序看起来才像列表
      const rows = db
        .prepare(`SELECT DISTINCT city FROM job WHERE city <> '' ORDER BY city COLLATE NOCASE`)
        .all() as Row[]
      return rows.map((row) => asText(row['city']))
    },

    /* 经验/学历与城市同一套做法：取值来自库里的真实数据，不预置一套平台无关的枚举。
       预置枚举会在筛选器里列出**库里根本没有的选项**（点了得到 0 条），
       而各平台的原始写法（"3-5年" / "经验不限"）本来就不统一。 */
    listExpReqs(): string[] {
      const rows = db
        .prepare(`SELECT DISTINCT exp_req FROM job WHERE exp_req <> '' ORDER BY exp_req COLLATE NOCASE`)
        .all() as Row[]
      return rows.map((row) => asText(row['exp_req']))
    },

    listEduReqs(): string[] {
      const rows = db
        .prepare(`SELECT DISTINCT edu_req FROM job WHERE edu_req <> '' ORDER BY edu_req COLLATE NOCASE`)
        .all() as Row[]
      return rows.map((row) => asText(row['edu_req']))
    },
  }
}
