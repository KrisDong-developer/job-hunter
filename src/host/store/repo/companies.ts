import type { DatabaseSync } from 'node:sqlite'
import { asBool, asId, asInt, asJson, asRealOrNull, asText, asTextOrNull, type Row } from '../row.js'

export interface CompanyRecord {
  id: number
  name: string
  nameNorm: string
  aliases: string[]
  industry: string | null
  size: string | null
  nature: string | null
  blacklisted: boolean
  note: string | null
  createdAt: string
}

export interface CompanyProfileRecord {
  companyId: number
  jobCount: number
  stackDiversity: number
  geoSpread: number
  /** 提到驻场/现场的岗位占比（外包识别的重要统计信号）。无岗位时为 null。 */
  onsiteRatio: number | null
  /** 公司名命中的识别关键词个数（D-16 的名称特征）。 */
  nameKeywordHits: number
  outsourcingScore: number | null
  fraudScore: number | null
  manualLabel: string | null
  updatedAt: string
}

export interface EnsureCompanyInput {
  /** 原始公司名，用于展示。 */
  name: string
  /** 归一化键（由领域层用 `normalizeCompanyName` 算好），用于实体身份。 */
  nameNorm: string
  industry?: string | null
  size?: string | null
  nature?: string | null
}

/** 工商补全快照（v13，`company_enrichment` 表）—— 一家公司一份，重查整体覆盖。 */
export interface CompanyEnrichmentRecord {
  companyId: number
  provider: string
  matchedName: string | null
  creditCode: string | null
  /** exact（归一化全等，自动写）/ manual（用户从候选点选）/ unmatched（查无此主体）。 */
  confidence: 'exact' | 'manual' | 'unmatched'
  regStatus: string | null
  estDate: string | null
  regCapital: string | null
  orgType: string | null
  legalPerson: string | null
  industry: string | null
  staffNum: string | null
  suitCount: number | null
  investCount: number | null
  licenseCount: number | null
  tags: string[]
  sourceUrl: string | null
  fetchedAt: string
  updatedAt: string
}

/** 画像重算时最多回看的岗位数 —— 避免画像计算退化成全表扫描（§4.1）。 */
const PROFILE_SAMPLE_LIMIT = 2000

export interface CompanyRepo {
  /** 幂等登记公司；命中别名表时复用已有实体（§4.10.1 第 2 级）。 */
  ensure(input: EnsureCompanyInput, now: string): { id: number; created: boolean }
  get(id: number): CompanyRecord | undefined
  findByNorm(nameNorm: string): CompanyRecord | undefined
  /** 精确命中手工维护的别名（`aliases_json`）。 */
  findByAlias(alias: string): CompanyRecord | undefined
  addAlias(companyId: number, alias: string): void
  getProfile(companyId: number): CompanyProfileRecord | undefined
  /**
   * 人工复核（§4.3 / D-16）—— 自动识别错了用户要能纠正。
   * `blacklisted` / `note` 在 `company` 表，`manualLabel` 在 `company_profile` 表。
   */
  updateReview(
    companyId: number,
    patch: { blacklisted?: boolean; note?: string | null; manualLabel?: string | null },
    now: string,
  ): { company: CompanyRecord | undefined; profile: CompanyProfileRecord | undefined }
  /** 公司列表浏览（外包/诈骗/黑名单集中曝光用）。 */
  list(filter: {
    blacklisted?: boolean
    manualLabel?: string | null
    /** 关键词：匹配公司名 / 归一化名 / 别名 / 备注（不区分大小写）。 */
    q?: string
    /** 只保留在手岗位数 ≥ 该值的公司（无画像按 0 算）。 */
    minJobCount?: number
    /** 排序键；缺省沿用 SQL 的岗位数降序。 */
    orderBy?: 'jobCount' | 'outsourcingScore' | 'fraudScore' | 'name'
    /** 仅在传了 `orderBy` 时有意义；缺省降序（与岗位库的默认一致）。 */
    descending?: boolean
    limit?: number
    offset?: number
  }): {
    items: Array<{ company: CompanyRecord; profile: CompanyProfileRecord | null }>
    total: number
  }
  /** 重算统计量（岗位数 / 技术栈广度 / 地域跨度 / 驻场比例）。 */
  recomputeProfile(companyId: number, now: string): CompanyProfileRecord
  /** 只更新识别分数（外包分 / 诈骗分 / 名称关键词命中），不动统计量。 */
  updateScores(
    companyId: number,
    scores: { nameKeywordHits: number; outsourcingScore: number; fraudScore: number },
    now: string,
  ): CompanyProfileRecord
  /** 工商快照：读（没有查过 = undefined）。 */
  getEnrichment(companyId: number): CompanyEnrichmentRecord | undefined
  /** 工商快照：整体覆盖写（unmatched 留痕也走它，其余字段给 null）。 */
  upsertEnrichment(record: Omit<CompanyEnrichmentRecord, 'updatedAt'>, now: string): CompanyEnrichmentRecord
  count(): number
}

function toRecord(row: Row): CompanyRecord {
  return {
    id: asInt(row['id']),
    name: asText(row['name']),
    nameNorm: asText(row['name_norm']),
    aliases: asJson<string[]>(row['aliases_json'], []),
    industry: asTextOrNull(row['industry']),
    size: asTextOrNull(row['size']),
    nature: asTextOrNull(row['nature']),
    blacklisted: asBool(row['blacklisted']),
    note: asTextOrNull(row['note']),
    createdAt: asText(row['created_at']),
  }
}

export function createCompanyRepo(db: DatabaseSync): CompanyRepo {
  const selectByNorm = db.prepare('SELECT * FROM company WHERE name_norm = ?')
  const selectById = db.prepare('SELECT * FROM company WHERE id = ?')
  const selectAliasCandidates = db.prepare(
    "SELECT * FROM company WHERE aliases_json LIKE '%' || ? || '%'",
  )
  const insert = db.prepare(
    `INSERT INTO company (name, name_norm, aliases_json, industry, size, nature, created_at)
     VALUES (?, ?, '[]', ?, ?, ?, ?)`,
  )
  const updateMeta = db.prepare(
    `UPDATE company SET
       name = ?,
       industry = coalesce(?, industry),
       size = coalesce(?, size),
       nature = coalesce(?, nature)
     WHERE id = ?`,
  )
  const selectAliases = db.prepare('SELECT aliases_json FROM company WHERE id = ?')
  const updateAliases = db.prepare('UPDATE company SET aliases_json = ? WHERE id = ?')

  const selectProfile = db.prepare('SELECT * FROM company_profile WHERE company_id = ?')
  const upsertProfile = db.prepare(
    `INSERT INTO company_profile (company_id, job_count, stack_diversity, geo_spread, onsite_ratio, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET
       job_count = excluded.job_count,
       stack_diversity = excluded.stack_diversity,
       geo_spread = excluded.geo_spread,
       onsite_ratio = excluded.onsite_ratio,
       updated_at = excluded.updated_at`,
  )
  const upsertScores = db.prepare(
    `INSERT INTO company_profile (company_id, name_keyword_hits, outsourcing_score, fraud_score, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET
       name_keyword_hits = excluded.name_keyword_hits,
       outsourcing_score = excluded.outsourcing_score,
       fraud_score = excluded.fraud_score,
       updated_at = excluded.updated_at`,
  )
  const selectSample = db.prepare(
    'SELECT tags_json, city, jd_text FROM job WHERE company_id = ? ORDER BY id DESC LIMIT ?',
  )
  const countStmt = db.prepare('SELECT count(*) AS n FROM company')

  // ── 工商补全快照（v13）──────────────────────────────────────────
  const selectEnrichment = db.prepare('SELECT * FROM company_enrichment WHERE company_id = ?')
  const upsertEnrichmentStmt = db.prepare(
    `INSERT INTO company_enrichment (
       company_id, provider, matched_name, credit_code, confidence,
       reg_status, est_date, reg_capital, org_type, legal_person, industry, staff_num,
       suit_count, invest_count, license_count, tags_json, source_url, fetched_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET
       provider = excluded.provider,
       matched_name = excluded.matched_name,
       credit_code = excluded.credit_code,
       confidence = excluded.confidence,
       reg_status = excluded.reg_status,
       est_date = excluded.est_date,
       reg_capital = excluded.reg_capital,
       org_type = excluded.org_type,
       legal_person = excluded.legal_person,
       industry = excluded.industry,
       staff_num = excluded.staff_num,
       suit_count = excluded.suit_count,
       invest_count = excluded.invest_count,
       license_count = excluded.license_count,
       tags_json = excluded.tags_json,
       source_url = excluded.source_url,
       fetched_at = excluded.fetched_at,
       updated_at = excluded.updated_at`,
  )

  const asIntOrNull = (value: null | number | bigint | string | Uint8Array | undefined): number | null =>
    value === null || value === undefined ? null : asInt(value)

  const toEnrichment = (row: Row): CompanyEnrichmentRecord => ({
    companyId: asInt(row['company_id']),
    provider: asText(row['provider']),
    matchedName: asTextOrNull(row['matched_name']),
    creditCode: asTextOrNull(row['credit_code']),
    confidence: asText(row['confidence']) as CompanyEnrichmentRecord['confidence'],
    regStatus: asTextOrNull(row['reg_status']),
    estDate: asTextOrNull(row['est_date']),
    regCapital: asTextOrNull(row['reg_capital']),
    orgType: asTextOrNull(row['org_type']),
    legalPerson: asTextOrNull(row['legal_person']),
    industry: asTextOrNull(row['industry']),
    staffNum: asTextOrNull(row['staff_num']),
    suitCount: asIntOrNull(row['suit_count']),
    investCount: asIntOrNull(row['invest_count']),
    licenseCount: asIntOrNull(row['license_count']),
    tags: asJson<string[]>(row['tags_json'], []),
    sourceUrl: asTextOrNull(row['source_url']),
    fetchedAt: asText(row['fetched_at']),
    updatedAt: asText(row['updated_at']),
  })

  // ── 人工复核写路径（D-16）───────────────────────────────────────
  const updateReviewMeta = db.prepare('UPDATE company SET blacklisted = ?, note = ? WHERE id = ?')
  const upsertManualLabel = db.prepare(
    `INSERT INTO company_profile (company_id, manual_label, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET manual_label = excluded.manual_label, updated_at = excluded.updated_at`,
  )
  // ── 列表（公司维度）─────────────────────────────────────────────
  // SQL 只负责"把行取齐"（profile 全列一起查 —— 公司卡片要显示完整画像读数，
  // 此前只查 4 列、剩下的字段在 JS 里用 0/null 占位，属于无意契约）；
  // 过滤 / 排序 / 分页在 JS 里做 —— 公司量级是"去重后的公司数"（千级），
  // 全量取回再筛的成本可接受，换参数化 SQL 的收益要等量级上来再说。
  const listAllRows = db.prepare(
    `SELECT c.id, c.name, c.name_norm, c.aliases_json, c.industry, c.size, c.nature,
            c.blacklisted, c.note, c.created_at,
            p.job_count, p.stack_diversity, p.geo_spread, p.onsite_ratio,
            p.name_keyword_hits, p.outsourcing_score, p.fraud_score, p.manual_label, p.updated_at
     FROM company c LEFT JOIN company_profile p ON p.company_id = c.id
     ORDER BY coalesce(p.job_count, 0) DESC, c.id`,
  )

  const toListRow = (row: Row): { company: CompanyRecord; profile: CompanyProfileRecord | null } => ({
    company: {
      id: asInt(row['id']),
      name: asText(row['name']),
      nameNorm: asText(row['name_norm']),
      aliases: asJson<string[]>(row['aliases_json'], []),
      industry: asTextOrNull(row['industry']),
      size: asTextOrNull(row['size']),
      nature: asTextOrNull(row['nature']),
      blacklisted: asBool(row['blacklisted']),
      note: asTextOrNull(row['note']),
      createdAt: asText(row['created_at']),
    },
    // profile 行不存在时 LEFT JOIN 出来的列全是 null —— 用 job_count 与 updated_at
    // 双保险判存在（label-only 的 upsert 会让 job_count 落在默认值 0 而不是 null，
    // 但那种行 updated_at 一定非空，两个都为 null 才是真的没有画像）。
    profile:
      row['job_count'] === null && row['updated_at'] === null
        ? null
        : {
            companyId: asInt(row['id']),
            jobCount: asInt(row['job_count']),
            stackDiversity: asInt(row['stack_diversity']),
            geoSpread: asInt(row['geo_spread']),
            onsiteRatio: asRealOrNull(row['onsite_ratio']),
            nameKeywordHits: asInt(row['name_keyword_hits']),
            outsourcingScore: asRealOrNull(row['outsourcing_score']),
            fraudScore: asRealOrNull(row['fraud_score']),
            manualLabel: asTextOrNull(row['manual_label']),
            updatedAt: asText(row['updated_at']),
          },
  })

  /** 列表排序键 → 数值（name 单独走 localeCompare，见 list 里的分支）。 */
  const orderValueOf = (
    entry: { company: CompanyRecord; profile: CompanyProfileRecord | null },
    key: 'jobCount' | 'outsourcingScore' | 'fraudScore',
  ): number => (entry.profile?.[key] ?? 0) as number

  const toProfile = (row: Row): CompanyProfileRecord => ({
    companyId: asInt(row['company_id']),
    jobCount: asInt(row['job_count']),
    stackDiversity: asInt(row['stack_diversity']),
    geoSpread: asInt(row['geo_spread']),
    onsiteRatio: asRealOrNull(row['onsite_ratio']),
    nameKeywordHits: asInt(row['name_keyword_hits']),
    outsourcingScore: asRealOrNull(row['outsourcing_score']),
    fraudScore: asRealOrNull(row['fraud_score']),
    manualLabel: asTextOrNull(row['manual_label']),
    updatedAt: asText(row['updated_at']),
  })

  /** 别名精确命中。先用 LIKE 收窄，再在 JS 里精确比对，避免 LIKE 的模糊误配。 */
  const findByAlias = (alias: string): CompanyRecord | undefined => {
    if (alias === '') return undefined
    for (const row of selectAliasCandidates.all(alias) as Row[]) {
      const record = toRecord(row)
      if (record.aliases.includes(alias)) return record
    }
    return undefined
  }

  return {
    ensure(input, now): { id: number; created: boolean } {
      const existing = selectByNorm.get(input.nameNorm) as Row | undefined
      if (existing !== undefined) {
        const id = asInt(existing['id'])
        updateMeta.run(input.name, input.industry ?? null, input.size ?? null, input.nature ?? null, id)
        return { id, created: false }
      }

      // 别名表命中 → 复用已有实体（§4.10.1 第 2 级）
      const byAlias = findByAlias(input.nameNorm)
      if (byAlias !== undefined) {
        updateMeta.run(input.name, input.industry ?? null, input.size ?? null, input.nature ?? null, byAlias.id)
        return { id: byAlias.id, created: false }
      }

      const result = insert.run(
        input.name,
        input.nameNorm,
        input.industry ?? null,
        input.size ?? null,
        input.nature ?? null,
        now,
      )
      return { id: asId(result.lastInsertRowid), created: true }
    },

    get(id): CompanyRecord | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    findByNorm(nameNorm): CompanyRecord | undefined {
      const row = selectByNorm.get(nameNorm) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    findByAlias,

    addAlias(companyId, alias): void {
      const row = selectAliases.get(companyId) as Row | undefined
      if (row === undefined) return
      const current = asJson<string[]>(row['aliases_json'], [])
      if (current.includes(alias)) return
      updateAliases.run(JSON.stringify([...current, alias]), companyId)
    },

    updateReview(companyId, patch, now) {
      const self = this as CompanyRepo
      const base = self.get(companyId)
      if (base === undefined) {
        return { company: undefined, profile: undefined }
      }
      const blacklisted = patch.blacklisted ?? base.blacklisted
      const note = patch.note !== undefined ? patch.note : base.note
      updateReviewMeta.run(blacklisted ? 1 : 0, note, companyId)
      if (patch.manualLabel !== undefined) {
        upsertManualLabel.run(companyId, patch.manualLabel, now)
      }
      const profileRow = selectProfile.get(companyId) as Row | undefined
      return {
        company: self.get(companyId),
        profile: profileRow === undefined ? undefined : toProfile(profileRow),
      }
    },

    list(filter): { items: Array<{ company: CompanyRecord; profile: CompanyProfileRecord | null }>; total: number } {
      let rows = (listAllRows.all() as Row[]).map(toListRow)
      if (filter.blacklisted !== undefined) {
        rows = rows.filter((entry) => entry.company.blacklisted === filter.blacklisted)
      }
      if (filter.manualLabel !== undefined) {
        rows = rows.filter((entry) => entry.profile?.manualLabel === filter.manualLabel)
      }
      // 关键词：公司名 / 归一化名 / 别名 / 备注任一命中即可（不区分大小写）。
      // 归一化名也搜 —— 用户记得的常常是"华为"而不是"华为技术有限公司"。
      if (filter.q !== undefined && filter.q !== '') {
        const needle = filter.q.toLowerCase()
        rows = rows.filter(
          (entry) =>
            entry.company.name.toLowerCase().includes(needle) ||
            entry.company.nameNorm.toLowerCase().includes(needle) ||
            entry.company.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
            (entry.company.note ?? '').toLowerCase().includes(needle),
        )
      }
      if (filter.minJobCount !== undefined) {
        const min = filter.minJobCount
        rows = rows.filter((entry) => (entry.profile?.jobCount ?? 0) >= min)
      }
      // 排序：SQL 的 ORDER BY 只覆盖默认档（岗位数降序）；界面切换排序键时在这里重排。
      // 没有画像的公司按 0 算 —— 冷启动时"没有分"与"0 分"是同一个答案。
      if (filter.orderBy !== undefined) {
        const descending = filter.descending !== false
        if (filter.orderBy === 'name') {
          rows.sort((a, b) => {
            const cmp = a.company.name.localeCompare(b.company.name, 'zh')
            if (cmp !== 0) return descending ? -cmp : cmp
            return a.company.id - b.company.id
          })
        } else {
          const key = filter.orderBy
          rows.sort((a, b) => {
            const diff = orderValueOf(a, key) - orderValueOf(b, key)
            if (diff !== 0) return descending ? -diff : diff
            return a.company.id - b.company.id
          })
        }
      }
      const total = rows.length
      const offset = filter.offset ?? 0
      const limit = filter.limit ?? 100
      return { items: rows.slice(offset, offset + limit), total }
    },

    getProfile(companyId): CompanyProfileRecord | undefined {
      const row = selectProfile.get(companyId) as Row | undefined
      return row === undefined ? undefined : toProfile(row)
    },

    recomputeProfile(companyId, now): CompanyProfileRecord {
      const jobs = selectSample.all(companyId, PROFILE_SAMPLE_LIMIT) as Row[]
      const tags = new Set<string>()
      const cities = new Set<string>()
      let onsite = 0

      for (const job of jobs) {
        for (const tag of asJson<string[]>(job['tags_json'], [])) tags.add(tag)
        const city = asText(job['city'])
        if (city !== '') cities.add(city)
        // 驻场/现场通常写在 JD 正文或标签里，是外包形态最强的文本信号
        const text = `${asJson<string[]>(job['tags_json'], []).join(' ')} ${asText(job['jd_text'])}`
        if (/驻场|现场|甲方/.test(text)) onsite += 1
      }

      const onsiteRatio = jobs.length === 0 ? null : onsite / jobs.length
      upsertProfile.run(companyId, jobs.length, tags.size, cities.size, onsiteRatio, now)

      const row = selectProfile.get(companyId) as Row | undefined
      if (row === undefined) {
        throw new Error(`company_profile 写入后读不回：companyId=${String(companyId)}`)
      }
      return toProfile(row)
    },

    updateScores(companyId, scores, now): CompanyProfileRecord {
      upsertScores.run(companyId, scores.nameKeywordHits, scores.outsourcingScore, scores.fraudScore, now)
      const row = selectProfile.get(companyId) as Row | undefined
      if (row === undefined) {
        throw new Error(`company_profile 写入后读不回：companyId=${String(companyId)}`)
      }
      return toProfile(row)
    },

    getEnrichment(companyId): CompanyEnrichmentRecord | undefined {
      const row = selectEnrichment.get(companyId) as Row | undefined
      return row === undefined ? undefined : toEnrichment(row)
    },

    upsertEnrichment(record, now): CompanyEnrichmentRecord {
      upsertEnrichmentStmt.run(
        record.companyId,
        record.provider,
        record.matchedName,
        record.creditCode,
        record.confidence,
        record.regStatus,
        record.estDate,
        record.regCapital,
        record.orgType,
        record.legalPerson,
        record.industry,
        record.staffNum,
        record.suitCount,
        record.investCount,
        record.licenseCount,
        JSON.stringify(record.tags),
        record.sourceUrl,
        record.fetchedAt,
        now,
      )
      const row = selectEnrichment.get(record.companyId) as Row | undefined
      if (row === undefined) {
        throw new Error(`company_enrichment 写入后读不回：companyId=${String(record.companyId)}`)
      }
      return toEnrichment(row)
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
