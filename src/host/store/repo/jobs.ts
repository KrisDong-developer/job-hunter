import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/config/limits.js'
import type { JobDto } from '../../../shared/contract/dto/job.js'
import { JOB_STATES, type JobFlagType, type JobOrderValue, type JobState } from '../../../shared/contract/enums/job.js'
import { APPLICATION_STAGES, CONTACT_STAGES } from '../../../shared/contract/enums/pipeline.js'
import { asId, asInt, asIntOrNull, asJson, asRealOrNull, asText, asTextOrNull, type Row, type SqlValue } from '../row.js'

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
  /**
   * 只要这些岗位 id（第五轮，批次 D2 的"导出选中"用）。
   *
   * 走 `IN` 而不是让调用方逐个 `detail()`：一次查询、顺序由 SQL 决定，
   * 也不会因为 N 个 id 变成 N 次查询。
   */
  ids?: number[]
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
   * 只要匹配分 ≥ 该值的岗位（第五轮，批次 A）。
   *
   * 注意两点口径：
   *   * 比的是**库里存着的那个分**，它可能是**用旧版简历**算出来的
   *     （是否过期由领域层按 `score_rev` / `score_resume_id` 判定，SQL 层不参与）；
   *   * 未打分的岗位（`match_score IS NULL`）**不满足** `>= N`，因此会被排除 ——
   *     这是有意的：没有分就没法参与"按分挑岗位"，悄悄放进来等于让用户
   *     对着一批无法判断的条目做取舍。
   */
  minMatchScore?: number
  /**
   * 排除**已拉黑公司**的岗位（第五轮，批次 B）。
   *
   * 默认 **false**（不加条件）：拉黑是人工标记，"把人家的岗位藏起来"必须由调用方
   * 显式要求 —— 静默隐藏数据比不隐藏更危险。界面上的「排除已拉黑公司」默认开着，
   * 并在列表头栏写明因此隐藏了几条，用户看得见也关得掉。
   */
  excludeBlacklistedCompanies?: boolean
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
  /** 排序字段。取值域见 `JOB_ORDER_VALUES`（与路由校验、界面下拉同一份）。 */
  orderBy?: JobOrderValue
  descending?: boolean
  /**
   * 屏蔽这些标注类型的岗位：命中任意一个标注的岗位一律不显示（`NOT EXISTS`）。
   * 「一键屏蔽疑似外包/高风险」落在这里 —— 风险标签是已算好的事实，屏蔽是查询层的事。
   */
  excludeFlagTypes?: JobFlagType[]
  /**
   * **按跨平台去重分组折叠**（批次 4）。
   *
   * 同一条岗位在 4 个平台各抓一条时，列表里只留一行，而不是让用户在一屏里
   * 看到四条几乎一样的卡片。**留哪一条跟着排序键走**（第五轮，批次 A3）：
   * 组内代表 = 这一组在当前排序下会排最前的那条（例如"按匹配分"就留分最高的），
   * 详见 `buildWhere`。
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
  /**
   * 写 JD 正文（P2 详情补抓）。
   *
   * **只在非空时覆盖**：详情页锚点腐烂时解析结果为空，那次不该把已有的 JD 抹掉。
   * 空串/纯空白一律忽略并返回 false（调用方据此统计"这一轮真的补到了几条"）。
   */
  setJdText(id: number, text: string): boolean
  /**
   * 缺 JD 正文的岗位 id（详情补抓的目标池，`last_seen_at` 倒序）。
   *
   * 曾经配合 `DETAIL_FETCH_MAX_PER_ROUND` 用 `limit` 截前 N 条 —— 上限去掉后
   * （2026-09-23 用户定案：所有抓到的岗位都要有 JD）默认取**全部缺口**；
   * `limit` 保留为可选参数，诊断/测试想看局部时仍可截断。
   * 排序保证本轮新增最先（`last_seen` 刚刷新），存量缺口随后；
   * 已从搜索结果里消失的死岗位 last_seen 冻结、自然沉底。
   */
  missingJdIds(platformId: string, limit?: number): number[]
  /** 写匹配分与**逐条理由**（§4.5.1：分数必须可解释）。 */
  setMatch(id: number, score: number, reasons: unknown, stamp?: MatchStamp | undefined): void
  /** 读回匹配理由。 */
  matchReasons(id: number): Array<{ kind: string; text: string; weight: number }>
  count(): number
  /** 与 `query` 用同一套 WHERE 的计数（分页 total 用）。 */
  countMatching(filters?: JobQuery): number
  /**
   * 分数**已过期**的岗位 id（第五轮，批次 A2）。
   *
   * "过期" = 有分（`match_score IS NOT NULL`）但算分时记下的简历版本与**当前启用简历**
   * 不一致。判定条件与领域层 `decorate()` 里的 `scoreStale` **逐字对齐**
   * （`score_rev` 不等、或 `score_resume_id` 不等，`null` 与 `null` 视为相等）——
   * 两处若各写一套，界面说"本页 7 条已过期"而重算只算 3 条，用户只会认为其中之一坏了。
   */
  listStaleScoreIds(stamp: MatchStamp, limit: number): number[]
  /** 同上，只要条数（用于"还剩多少条要重算"）。 */
  countStaleScores(stamp: MatchStamp): number
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
   这与 `company_name` 的做法保持一致。

   接触态与投递阶段也是**相关子查询**取各自最近一条，而不是 LEFT JOIN：
   一个岗位可能打过多次招呼、投过多次简历，JOIN 会把列表行翻倍。
   两条走 `idx_greeting_job` / `idx_application_job`。 */
const SELECT_BASE = `
SELECT j.*, c.name AS company_name, p.display_name AS platform_name,
  (SELECT g.stage FROM greeting g WHERE g.job_id = j.id ORDER BY g.sent_at DESC LIMIT 1) AS contact_stage,
  (SELECT a.stage FROM application a WHERE a.job_id = j.id ORDER BY a.sent_at DESC LIMIT 1) AS application_stage
FROM job j
LEFT JOIN company c ON c.id = j.company_id
LEFT JOIN platform p ON p.id = j.platform_id`

/**
 * 排序列白名单 —— 绝不把入参拼进 SQL。
 *
 * 存的是**裸列名**（不带表别名）：同一份映射要服务两个地方 ——
 * 外层 `ORDER BY j.<col>` 与折叠时"组内选代表"的子查询 `g.<col>`（见 `buildWhere`）。
 * 写成 `j.crawled_at` 这种带别名的表达式时，子查询里就得手工替换别名 ——
 * 那种字符串拼来拼去正是"某天改了排序键、折叠代表没跟着改"的温床。
 */
const ORDER_COLUMN_NAMES: Record<JobOrderValue, string> = {
  crawled_at: 'crawled_at',
  match_score: 'match_score',
  salary_min: 'salary_min',
  title: 'title',
  last_seen_at: 'last_seen_at',
  first_seen_at: 'first_seen_at',
}

/**
 * 状态列的读回：库里是 TEXT，出现未知取值（手工改库、老版本写入）时**当作没有记录**，
 * 而不是把它当成一个合法状态往外传 —— 界面拿它去查文案表会得到 `undefined`。
 */
function asEnumOrNull<T extends string>(value: SqlValue | undefined, allowed: readonly T[]): T | null {
  const text = asTextOrNull(value)
  if (text === null) return null
  return (allowed as readonly string[]).includes(text) ? (text as T) : null
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
    // 抓取入库时间（列表默认排序用的就是它，界面要把它显示出来）
    crawledAt: asText(row['crawled_at']),
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
    // 行内「打招呼 / 投递」的只读态：发过的不能再点（投递不可逆，重复发撤不回来）
    contactStage: asEnumOrNull(row['contact_stage'], CONTACT_STAGES) ?? 'none',
    applicationStage: asEnumOrNull(row['application_stage'], APPLICATION_STAGES),
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
  /**
   * ⚠️ **不覆盖** state / first_seen_at —— 前者是用户的处置态，后者是"首次见到"的事实。
   *
   * 2026-09-21 修：**空值也不许覆盖已有的好值**。
   *
   * 成因：这是覆盖式更新，`crawl.ts` 把这一轮解析出的字段直接写进来（`?? ''` 兜底）。
   * 于是某轮平台把城市/经验/学历掩码成空、或者薪资变成"面议"（`salary_min = null`），
   * 上一轮拿到的好值就被**静默写掉了** —— 列表看着还在那儿，字段却空了，
   * 而且没有任何一条日志会说这件事。
   *
   * 语义定成"**新值为空 = 这一轮没解析出来，保留旧值**"：
   *   * 文本字段用 `coalesce(nullif(?, ''), 旧值)`；
   *   * 可空数字用 `coalesce(?, 旧值)`（null 表示"这一轮没锚定"）；
   *   * `tags_json` 的"空"是 `[]`（不是空串），所以要 `CASE`；
   *   * `title` / `source_url` 仍然直接覆盖 —— 它们是必填字段（空值早被字段断言拦下），
   *     而且标题本来就会更新。
   *
   * 代价说清楚：平台**真的**把薪资从"2万"改成"面议"时，我们会留着旧数字。
   * 这与项目一贯的取舍一致 —— 宁可留一个旧值（用户看得见、能改），
   * 也不要静默清空（用户看不见，还以为这条岗位没写薪资）。
   */
  const update = db.prepare(
    `UPDATE job SET
       title = ?,
       company_id = coalesce(?, company_id),
       salary_raw = coalesce(nullif(?, ''), salary_raw),
       salary_min = coalesce(?, salary_min),
       salary_max = coalesce(?, salary_max),
       salary_months = coalesce(?, salary_months),
       city = coalesce(nullif(?, ''), city),
       district = coalesce(nullif(?, ''), district),
       exp_req = coalesce(nullif(?, ''), exp_req),
       edu_req = coalesce(nullif(?, ''), edu_req),
       tags_json = CASE WHEN ? = '[]' THEN tags_json ELSE ? END,
       jd_text = coalesce(?, jd_text), published_at = coalesce(?, published_at),
       last_seen_at = ?, crawled_at = ?, source_url = ?
     WHERE id = ?`,
  )
  const selectById = db.prepare(`${SELECT_BASE} WHERE j.id = ?`)
  const markStmt = db.prepare('UPDATE job SET state = ? WHERE id = ?')
  const jdTextStmt = db.prepare('SELECT jd_text FROM job WHERE id = ?')
  const setJdTextStmt = db.prepare('UPDATE job SET jd_text = ? WHERE id = ?')
  /* 缺 JD 的岗位（详情补抓的目标池）。按 last_seen_at 倒序：
     本轮新增天然在最前（它们 last_seen 刚刷新），存量缺口随后逐轮补齐；
     已从搜索结果里消失的死岗位 last_seen 冻结、自然沉底，不会一直占名额。
     LIMIT 传 -1 = 不设限（SQLite 语义），对齐"全量补齐"的新口径。 */
  const missingJdIdsStmt = db.prepare(
    `SELECT id FROM job WHERE platform_id = ? AND (jd_text IS NULL OR jd_text = '')
     ORDER BY last_seen_at DESC LIMIT ?`,
  )
  const setMatchStmt = db.prepare(
    'UPDATE job SET match_score = ?, match_reasons_json = ?, score_rev = ?, score_resume_id = ? WHERE id = ?',
  )
  const reasonsStmt = db.prepare('SELECT match_reasons_json FROM job WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM job')
  const countSinceStmt = db.prepare('SELECT count(*) AS n FROM job WHERE first_seen_at >= ?')
  const countByStateStmt = db.prepare('SELECT state, count(*) AS n FROM job GROUP BY state')

  /* 分数过期的岗位（第五轮，批次 A2）。两条语句共用同一段 WHERE ——
     与领域层的 `scoreStale` 判定逐字对齐（`score_resume_id` 用 `IS NOT`：
     它是可空的，"两个都是 NULL"必须算相等，`<>` 在这种情况下会漏判成过期）。
     取 id 时按 `id DESC`：与列表默认排序（抓取时间倒序）同向，
     于是"点一次重算"先修的是用户正在看的那一批，而不是库尾的历史数据。 */
  const STALE_SCORE_WHERE = `match_score IS NOT NULL AND (score_rev <> ? OR score_resume_id IS NOT ?)`
  const staleScoreIdsStmt = db.prepare(
    `SELECT id FROM job WHERE ${STALE_SCORE_WHERE} ORDER BY id DESC LIMIT ?`,
  )
  const countStaleScoresStmt = db.prepare(`SELECT count(*) AS n FROM job WHERE ${STALE_SCORE_WHERE}`)

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
    if (filters.ids !== undefined && filters.ids.length > 0) {
      where.push(`j.id IN (${filters.ids.map(() => '?').join(',')})`)
      params.push(...filters.ids)
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
    if (filters.minMatchScore !== undefined) {
      // `>=` 天然排除 NULL（未打分）—— 这是有意的，见 `JobQuery.minMatchScore` 的注释。
      where.push('j.match_score >= ?')
      params.push(filters.minMatchScore)
    }
    if (filters.excludeBlacklistedCompanies === true) {
      // 只有被显式要求时才排除已拉黑公司。
      //
      // 写成 NOT EXISTS 子查询而不是 `c.blacklisted = 0`（`c` 是 SELECT_BASE 里的 JOIN 别名），
      // 有两个具体原因：
      //   ① `countMatching` 的 FROM 只有 `job j`，**没有**那个 JOIN —— 引用 `c` 会直接报
      //      "no such column"，而列表与计数必须是同一套条件（这是本项目反复强调的纪律）；
      //   ② `company_id` 为 NULL 的岗位（平台没给公司名）走 LEFT JOIN 得到 NULL，
      //      而 `NULL = 0` 是 NULL（假），那些岗位会被一起误杀 —— 它们根本没有公司可拉黑。
      // NOT EXISTS 同时解决这两点：没有关联公司时子查询为空 → 条件成立 → 放行。
      where.push(
        `NOT EXISTS (SELECT 1 FROM company x WHERE x.id = j.company_id AND x.blacklisted = 1)`,
      )
    }
    if (filters.firstSeenSince !== undefined && filters.firstSeenSince !== '') {
      where.push('j.first_seen_at >= ?')
      params.push(filters.firstSeenSince)
    }
    if (filters.groupDuplicates === true) {
      // 每组只留**一个代表**，而"谁当代表"必须跟着**当前的排序键**走
      // （第五轮，批次 A3 改的就是这一点）。
      //
      // 上一版固定留"组内最小 id"，理由是稳定；但它的代价是：用户把排序切成
      // "按匹配分"，组里分最高的那条却仍然不显示 —— 排序看起来没生效。
      // 现在子查询用**与外层 ORDER BY 逐字相同**的排序（同一个 IS NULL 前置、
      // 同一个方向、同一个 id 兜底），于是"代表"恰好就是这一组在列表里会排最前的那条。
      //
      // 用相关子查询而不是 `GROUP BY`：`GROUP BY` 之后 `SELECT j.*` 拿到的是
      // SQLite 的"组内任一行"，非确定 —— 折叠出来的代表会随索引变化而变。
      // 没有分组的岗位（`dedup_group_id IS NULL`）各自独立，直接放行。
      const column = `g.${ORDER_COLUMN_NAMES[filters.orderBy ?? 'crawled_at']}`
      const direction = filters.descending === false ? 'ASC' : 'DESC'
      where.push(
        `(j.dedup_group_id IS NULL OR j.id = (
           SELECT g.id FROM job g WHERE g.dedup_group_id = j.dedup_group_id
           ORDER BY ${column} IS NULL, ${column} ${direction}, g.id DESC
           LIMIT 1
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
    const orderColumn = `j.${ORDER_COLUMN_NAMES[filters.orderBy ?? 'crawled_at']}`
    const direction = filters.descending === false ? 'ASC' : 'DESC'
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX))
    const safeOffset = Math.max(0, Math.trunc(offset))

    // 强制 LIMIT：禁止无界查询进热路径（§4.1）。NULL 排在最后，避免“面议”占据榜首
    // （未打分的岗位同理：不该因为"没有分数"而排在有分数的前面）。
    // 这条 ORDER BY 与 `buildWhere` 里选折叠代表的那条是**同一套排序**，改一处必改另一处。
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
          // `tags_json` 的 CASE 要两个占位（一个判空、一个写值），值相同
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

    setJdText(id, text): boolean {
      const trimmed = text.trim()
      if (trimmed === '') return false
      const result = setJdTextStmt.run(trimmed, id)
      return asInt(result.changes) > 0
    },

    missingJdIds(platformId, limit): number[] {
      const rows = missingJdIdsStmt.all(platformId, limit ?? -1) as Row[]
      return rows.map((row) => asInt(row['id']))
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

    listStaleScoreIds(stamp, limit): number[] {
      const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX))
      return (staleScoreIdsStmt.all(stamp.rev, stamp.resumeId, safeLimit) as Row[]).map((row) => asInt(row['id']))
    },

    countStaleScores(stamp): number {
      const row = countStaleScoresStmt.get(stamp.rev, stamp.resumeId) as Row | undefined
      return asInt(row?.['n'])
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
