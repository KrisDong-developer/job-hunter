/**
 * 数据可携带性（J8：JSON/CSV 导出、从 Excel 导入）。
 *
 * ## 这个模块解决的问题
 *
 * §4.J8 的原话是"**工具会坏，数据不能死**"。所以导出必须是**无损**的：
 *   * `json` —— 全部业务表的原始行（真备份，换机器/换版本都还能读）；
 *   * `csv`  —— 分表 CSV，**带 UTF-8 BOM**（不带的话中文 Excel 打开就是乱码，
 *     而"导出了但打不开"等于没导出）；
 *   * `archive` —— zip：`data.json` + `csv/*.csv` + `files/*`（简历附件原文件）。
 *
 * ## 导入的边界（刻意画小）
 *
 * 只做**岗位导入**，不做整库覆盖恢复。理由不是没写完：覆盖式恢复会拿备份里的旧数据
 * 盖掉当前数据（包括你刚投的那几个岗），风险极高；真要整库搬走，直接换 `data.db`
 * 文件更直接（数据目录就在本机，README 里写着路径）。而"从 Excel 导入"的真实场景
 * 就是一堆岗位 —— 那个是这里做的。
 *
 * ## 一处**明确不做**：.xlsx 二进制
 *
 * Excel 的 `.xlsx` 是一个 zip + 一堆 XML，解析它需要额外的解包器与共享字符串表处理，
 * 而且**做错了会把脏数据写进岗位库**（比报错糟得多）。所以这里检测到 zip 魔数就
 * 明确报错并给出可执行的下一步（另存为 CSV UTF-8），**不假装支持**。
 * CSV 才是 Excel 的通用交换格式，也是这里唯一支持的导入入口。
 *
 * ## 另一处边界：编码
 *
 * 导入按 **UTF-8** 读。文本里出现替换字符（U+FFFD）时**拒绝导入**并说明原因 ——
 * 中文 Excel 默认另存 GBK，硬按 UTF-8 读会得到一库乱码岗位，
 * 那比"导入失败"严重得多。客户端会在选文件时先尝试 GBK 解码（浏览器有该能力），
 * 宿主这一层只做最后的诚实校验。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { EXPORT_ARCHIVE_MAX_BYTES, IMPORT_MAX_ROWS } from '../../shared/constants.js'
import type { DataExportEntryDto, DataExportFormat, DataImportResultDto } from '../../shared/dto.js'
import { buildZip, type ZipEntry } from '../render/zip.js'
import type { Store } from '../store/store.js'
import { asRealOrNull, asText, type Row } from '../store/row.js'
import { parseSalary } from '../util/salary.js'
import { systemClock, type Clock } from '../util/time.js'

/** 导入进来的岗位挂在这个虚拟平台下（不参与抓取，只在界面上标出"手动导入"）。 */
export const IMPORT_PLATFORM_ID = 'import'
export const IMPORT_PLATFORM_NAME = '手动导入'

// ─────────────────────────────────────────────────────────────────────
// CSV 编解码
// ─────────────────────────────────────────────────────────────────────

/**
 * UTF-8 BOM。
 *
 * **必须带**：Excel 打开不带 BOM 的 UTF-8 CSV 时按系统 ANSI 码页解码，
 * 中文全部变乱码 —— 用户会得出"这个导出是坏的"的结论，而数据其实是好的。
 */
const BOM = '\ufeff'

/** 一个单元格的 CSV 写法（含引号转义）。 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  // 逗号 / 引号 / 换行 / 前后空白都要引起来；引号本身翻倍
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 行 → CSV 文本。用 CRLF：Excel 与记事本都认。 */
export function csvEncode(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

/**
 * CSV → 二维数组（RFC 4180 的子集，够用）。
 *
 * 手写而不是引依赖：要处理的就是引号、转义引号、字段内换行这三件事，
 * 而这三个恰好是"自己写容易错"的地方，所以下面有测试直接钉它们。
 */
export function csvParse(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    // 完全空的行（Excel 末尾常见）丢掉，否则会报一堆"缺少岗位标题"
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }

  while (index < input.length) {
    const char = input[index] ?? ''
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      pushField()
      index += 1
      continue
    }
    if (char === '\r') {
      // CRLF 与单独的 CR 都当换行
      if (input[index + 1] === '\n') index += 1
      pushRow()
      index += 1
      continue
    }
    if (char === '\n') {
      pushRow()
      index += 1
      continue
    }
    field += char
    index += 1
  }
  // 最后一行没有换行符收尾时也要落进来
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

// ─────────────────────────────────────────────────────────────────────
// 导入：列名识别
// ─────────────────────────────────────────────────────────────────────

/** 可导入的字段 → 可能的中英文列名（全部小写比较，去空白）。 */
const HEADER_ALIASES: Record<string, readonly string[]> = {
  title: ['岗位标题', '标题', '职位', '岗位', '职位名称', '岗位名称', 'title', 'job', 'position'],
  company: ['公司', '公司名', '公司名称', '企业', 'company'],
  salaryRaw: ['薪资', '薪水', '工资', '薪资范围', 'salary'],
  city: ['城市', '地点', '工作城市', 'city'],
  district: ['区县', '区域', '区', 'district'],
  expReq: ['经验要求', '经验', '工作年限', 'experience'],
  eduReq: ['学历要求', '学历', 'education'],
  sourceUrl: ['来源链接', '链接', '网址', 'url', 'link'],
  tags: ['标签', '技能', 'tags'],
  publishedAt: ['发布时间', '发布日期', 'published'],
}

type ImportField = keyof typeof HEADER_ALIASES

const IMPORT_FIELDS = Object.keys(HEADER_ALIASES) as ImportField[]

function headerIndex(header: readonly string[]): Partial<Record<ImportField, number>> {
  const normalized = header.map((cell) => cell.trim().toLowerCase())
  const out: Partial<Record<ImportField, number>> = {}
  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field] ?? []
    const index = normalized.findIndex((cell) => aliases.includes(cell))
    if (index >= 0) out[field] = index
  }
  return out
}

/** 导出 CSV 的表头（与 `HEADER_ALIASES` 对齐，所以"导出 → 改 → 导入"能闭环）。 */
const JOB_HEADER = [
  '岗位标题',
  '公司',
  '薪资',
  '城市',
  '区县',
  '经验要求',
  '学历要求',
  '标签',
  '来源平台',
  '来源链接',
  '发布时间',
  '首次见到',
  '最近见到',
  '处置态',
  '匹配分',
] as const

const APPLICATION_HEADER = ['岗位标题', '公司', '渠道', '阶段', '投递时间', '阶段更新', '简历版本', '备注'] as const
const GREETING_HEADER = ['岗位标题', '公司', '平台', '模板', '接触态', '阶段时间', '发送时间', '发送方式', '内容'] as const
const MESSAGE_HEADER = ['岗位标题', '公司', '平台', '方向', '时间', '是否已读', '内容'] as const
const INTERVIEW_HEADER = ['岗位标题', '公司', '轮次', '时间', '时区', '形式', '地点', '链接', '联系人', '状态'] as const
const COMPANY_HEADER = ['公司', '归一化名', '行业', '规模', '性质', '在库岗位数', '外包信号分', '诈骗信号分', '已拉黑', '备注'] as const

// ─────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────

export interface ExportResult {
  fileName: string
  bytes: Uint8Array
  /** 归档里有什么（工具与界面用它说清"这次导出拿到了什么"）。 */
  entries: DataExportEntryDto[]
  note: string
}

function stamp(now: string): string {
  return now.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
}

function tableNames(store: Store): string[] {
  return (store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Row[]).map((row) => asText(row['name']))
}

/** 全量结构化备份（各表的原始行）。 */
function jsonPayload(store: Store, now: string): { json: string; counts: Record<string, number> } {
  const tables: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const table of tableNames(store)) {
    const rows = store.db.prepare(`SELECT * FROM ${table}`).all() as Row[]
    tables[table] = rows
    counts[table] = rows.length
  }
  return {
    json: JSON.stringify(
      {
        meta: {
          app: 'dsh-job-hunter',
          schemaVersion: store.migration.to,
          exportedAt: now,
          note: '这是全量结构化备份（不含简历附件原文件）。要连附件一起搬，请用 archive 格式。',
        },
        counts,
        tables,
      },
      null,
      2,
    ),
    counts,
  }
}

function jobRows(store: Store): unknown[][] {
  return (store.db
    .prepare(
      `SELECT j.title, c.name AS company_name, j.salary_raw, j.city, j.district, j.exp_req, j.edu_req,
              j.tags_json, p.display_name, j.source_url, j.published_at, j.first_seen_at, j.last_seen_at,
              j.state, j.match_score
       FROM job j
       LEFT JOIN company c ON c.id = j.company_id
       LEFT JOIN platform p ON p.id = j.platform_id
       ORDER BY j.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['title']),
    asText(row['company_name']),
    asText(row['salary_raw']),
    asText(row['city']),
    asText(row['district']),
    asText(row['exp_req']),
    asText(row['edu_req']),
    asText(row['tags_json']),
    asText(row['display_name']),
    asText(row['source_url']),
    asText(row['published_at']),
    asText(row['first_seen_at']),
    asText(row['last_seen_at']),
    asText(row['state']),
    asRealOrNull(row['match_score']) === null ? '' : String(asRealOrNull(row['match_score'])),
  ])
}

function csvBundle(store: Store): Array<{ name: string; text: string; rows: number }> {
  const jobs = jobRows(store)
  const applications = (store.db
    .prepare(
      `SELECT j.title, c.name AS company_name, a.channel, a.stage, a.sent_at, a.stage_at, a.resume_id, a.note
       FROM application a LEFT JOIN job j ON j.id = a.job_id LEFT JOIN company c ON c.id = j.company_id
       ORDER BY a.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['title']), asText(row['company_name']), asText(row['channel']), asText(row['stage']),
    asText(row['sent_at']), asText(row['stage_at']), asText(row['resume_id']), asText(row['note']),
  ])
  const greetings = (store.db
    .prepare(
      `SELECT j.title, c.name AS company_name, g.platform_id, t.name AS template_name, g.stage,
              g.stage_at, g.sent_at, g.actor, g.content
       FROM greeting g LEFT JOIN job j ON j.id = g.job_id LEFT JOIN company c ON c.id = j.company_id
       LEFT JOIN greeting_template t ON t.id = g.template_id
       ORDER BY g.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['title']), asText(row['company_name']), asText(row['platform_id']), asText(row['template_name']),
    asText(row['stage']), asText(row['stage_at']), asText(row['sent_at']), asText(row['actor']), asText(row['content']),
  ])
  const messages = (store.db
    .prepare(
      `SELECT j.title, c.name AS company_name, m.platform_id, m.direction, m.at, m.read_at, m.content
       FROM message m LEFT JOIN job j ON j.id = m.job_id LEFT JOIN company c ON c.id = j.company_id
       ORDER BY m.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['title']), asText(row['company_name']), asText(row['platform_id']), asText(row['direction']),
    asText(row['at']), asText(row['read_at']) === '' ? '未读' : '已读', asText(row['content']),
  ])
  const interviews = (store.db
    .prepare(
      `SELECT j.title, c.name AS company_name, i.round, i.at, i.tz, i.kind, i.place, i.link, i.contact, i.state
       FROM interview i LEFT JOIN job j ON j.id = i.job_id LEFT JOIN company c ON c.id = j.company_id
       ORDER BY i.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['title']), asText(row['company_name']), asText(row['round']), asText(row['at']), asText(row['tz']),
    asText(row['kind']), asText(row['place']), asText(row['link']), asText(row['contact']), asText(row['state']),
  ])
  const companies = (store.db
    .prepare(
      `SELECT c.name, c.name_norm, c.industry, c.size, c.nature, p.job_count, p.outsourcing_score,
              p.fraud_score, c.blacklisted, c.note
       FROM company c LEFT JOIN company_profile p ON p.company_id = c.id ORDER BY c.id`,
    )
    .all() as Row[]).map((row) => [
    asText(row['name']), asText(row['name_norm']), asText(row['industry']), asText(row['size']),
    asText(row['nature']), asText(row['job_count']), asText(row['outsourcing_score']),
    asText(row['fraud_score']), asText(row['blacklisted']) === '0' ? '' : '是', asText(row['note']),
  ])

  return [
    { name: 'jobs.csv', text: csvEncode(JOB_HEADER, jobs), rows: jobs.length },
    { name: 'companies.csv', text: csvEncode(COMPANY_HEADER, companies), rows: companies.length },
    { name: 'applications.csv', text: csvEncode(APPLICATION_HEADER, applications), rows: applications.length },
    { name: 'greetings.csv', text: csvEncode(GREETING_HEADER, greetings), rows: greetings.length },
    { name: 'messages.csv', text: csvEncode(MESSAGE_HEADER, messages), rows: messages.length },
    { name: 'interviews.csv', text: csvEncode(INTERVIEW_HEADER, interviews), rows: interviews.length },
  ]
}

const README = `dsh-job-hunter 数据导出
========================

这个压缩包里有三类东西：

1. data.json     —— **全量结构化备份**。要搬机器 / 留底，认准它。
                    不含简历附件的原文件（见第 3 项）。
2. csv/*.csv     —— 分表 CSV，给 Excel / 人看的。都带 UTF-8 BOM，
                    用 Excel 直接双击打开不会乱码。
3. files/*       —— 简历附件的原文件（PDF / Word），按简历 id 分目录。

关于导入：
  · 只支持**岗位**导入，入口在「设置 → 数据」或模型工具 data_transfer。
  · 支持 CSV（UTF-8）与 JSON。CSV 的表头可以用本包里 csv/jobs.csv 的表头，
    也可以写「岗位标题 / 标题 / 职位」这类常见叫法。
  · Excel 的 .xlsx 二进制**不支持** —— 请「另存为 → CSV UTF-8」。
    中文 Excel 默认另存为 GBK，那样导入会乱码，也会被拒绝。

关于清理：保留策略与磁盘占用在「设置 → 数据」里，清理前一定有预览。
`

/**
 * 导出。返回内存里的字节（调用方决定是回给浏览器还是写到 `exports/`）。
 */
export function exportData(
  deps: { store: Store; filesDir: string; format: DataExportFormat },
  clock: Clock = systemClock,
): ExportResult {
  const now = clock()
  const fileStamp = stamp(now)

  if (deps.format === 'json') {
    const { json, counts } = jsonPayload(deps.store, now)
    const bytes = Buffer.from(json, 'utf8')
    return {
      fileName: `job-hunter-export-${fileStamp}.json`,
      bytes,
      entries: [{ name: 'data.json', bytes: bytes.length, rows: Object.values(counts).reduce((a, b) => a + b, 0) }],
      note: '全量结构化备份（不含简历附件原文件）。要连附件一起搬请用 archive 格式。',
    }
  }

  const bundle = csvBundle(deps.store)
  const entries: ZipEntry[] = []
  const listed: DataExportEntryDto[] = []
  for (const file of bundle) {
    const data = Buffer.from(file.text, 'utf8')
    entries.push({ name: `csv/${file.name}`, data })
    listed.push({ name: `csv/${file.name}`, bytes: data.length, rows: file.rows })
  }

  if (deps.format === 'csv') {
    const readme = Buffer.from(README, 'utf8')
    entries.push({ name: 'README.txt', data: readme })
    listed.push({ name: 'README.txt', bytes: readme.length, rows: null })
    const bytes = buildZip(entries)
    return {
      fileName: `job-hunter-csv-${fileStamp}.zip`,
      bytes,
      entries: listed,
      note: '分表 CSV（UTF-8 带 BOM，Excel 直接打开不乱码）。要完整备份请用 json 或 archive。',
    }
  }

  // archive：结构化数据 + 附件原文件
  const { json, counts } = jsonPayload(deps.store, now)
  const jsonBytes = Buffer.from(json, 'utf8')
  entries.unshift({ name: 'data.json', data: jsonBytes })
  listed.unshift({ name: 'data.json', bytes: jsonBytes.length, rows: Object.values(counts).reduce((a, b) => a + b, 0) })
  const readmeBytes = Buffer.from(README, 'utf8')
  entries.push({ name: 'README.txt', data: readmeBytes })
  listed.push({ name: 'README.txt', bytes: readmeBytes.length, rows: null })

  let skippedAttachments = 0
  let attachmentBytes = 0
  let used = entries.reduce((sum, entry) => sum + entry.data.length, 0)
  if (existsSync(deps.filesDir)) {
    for (const entry of readdirSync(deps.filesDir, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isDirectory()) continue
      const full = join(deps.filesDir, entry.name)
      if (entry.isDirectory()) {
        for (const inner of readdirSync(full, { withFileTypes: true })) {
          if (!inner.isFile()) continue
          const innerFull = join(full, inner.name)
          const size = statSync(innerFull).size
          // 超上限就**只导出结构化数据**并如实说明少了什么 —— 不半途返回一个坏 zip
          if (used + size > EXPORT_ARCHIVE_MAX_BYTES) {
            skippedAttachments += 1
            continue
          }
          const relative = `${entry.name}/${inner.name}`
          entries.push({ name: `files/${relative}`, data: readFileSync(innerFull) })
          listed.push({ name: `files/${relative}`, bytes: size, rows: null })
          used += size
          attachmentBytes += size
        }
        continue
      }
      const size = statSync(full).size
      if (used + size > EXPORT_ARCHIVE_MAX_BYTES) {
        skippedAttachments += 1
        continue
      }
      entries.push({ name: `files/${basename(full)}`, data: readFileSync(full) })
      listed.push({ name: `files/${basename(full)}`, bytes: size, rows: null })
      used += size
      attachmentBytes += size
    }
  }

  return {
    fileName: `job-hunter-archive-${fileStamp}.zip`,
    bytes: buildZip(entries),
    entries: listed,
    note:
      `归档：结构化数据 + ${String(listed.filter((item) => item.name.startsWith('files/')).length)} 个附件（${String(attachmentBytes)} 字节）。` +
      (skippedAttachments === 0
        ? ''
        : `⚠️ 有 ${String(skippedAttachments)} 个附件超出大小上限，未包含在本次归档里 —— 它们仍在本机 files/ 目录中。`),
  }
}

// ─────────────────────────────────────────────────────────────────────
// 导入
// ─────────────────────────────────────────────────────────────────────

/** 判断导入内容是不是 Excel 二进制（zip 魔数）：是就明确拒绝，不假装支持。 */
function looksLikeBinary(text: string): boolean {
  return text.startsWith('PK\u0003\u0004') || text.startsWith('\u0000\u0000') || text.includes('\u0000')
}

const ELLIPSIS_ERRORS = 20

export interface ImportDeps {
  store: Store
  /** 登记公司用（与抓取路径同一个实现，避免两套归一化）。 */
  ensureCompany: (input: { name: string; industry?: string | null; size?: string | null; nature?: string | null }) => number
  /** 可选：导入后立刻算一遍匹配分与标注，让新导入的岗位与抓取来的长得一样。 */
  evaluate?: (jobId: number) => void
}

function decodeJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch (error) {
    throw new Error(`不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 从 JSON 里取出"岗位数组"：接受导出的 `{tables:{job:[...]}}` 或直接一个数组。 */
function jobArrayOf(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>
  if (parsed !== null && typeof parsed === 'object') {
    const tables = (parsed as { tables?: unknown }).tables
    if (tables !== null && typeof tables === 'object') {
      const job = (tables as { job?: unknown }).job
      if (Array.isArray(job)) return job as Array<Record<string, unknown>>
    }
  }
  return []
}

/** JSON 行 → 统一形状（导出的是 snake_case 原始列，这里映射成导入字段）。 */
function rowFromJson(raw: Record<string, unknown>): Partial<Record<ImportField, string>> {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = raw[key]
      if (typeof value === 'string' && value.trim() !== '') return value
      if (typeof value === 'number') return String(value)
    }
    return ''
  }
  return {
    title: pick('title'),
    company: pick('company', 'company_name'),
    salaryRaw: pick('salary_raw', 'salaryRaw'),
    city: pick('city'),
    district: pick('district'),
    expReq: pick('exp_req', 'expReq'),
    eduReq: pick('edu_req', 'eduReq'),
    sourceUrl: pick('source_url', 'sourceUrl'),
    tags: pick('tags_json', 'tags'),
    publishedAt: pick('published_at', 'publishedAt'),
  }
}

/** 一行 → 岗位写入输入；缺 title 返回 null（调用方记一条逐行错误）。 */
function jobInputOf(
  row: Partial<Record<ImportField, string>>,
  companyId: number | null,
): { platformJobId: string; input: Parameters<Store['job']['upsert']>[0] } {
  const title = (row.title ?? '').trim()
  const sourceUrl = (row.sourceUrl ?? '').trim()
  const company = (row.company ?? '').trim()
  const city = (row.city ?? '').trim()
  // 幂等键：优先用链接（同一岗位重复导入只更新）；没有链接就退到"标题|公司|城市"，
  // 同一份表导两次也只会更新 —— 这是"重复导入"最常见的用法
  const platformJobId = sourceUrl !== '' ? sourceUrl : `${title}|${company}|${city}`
  const salary = parseSalary((row.salaryRaw ?? '').trim())
  const tagsRaw = (row.tags ?? '').trim()
  const tags = tagsRaw === ''
    ? []
    : tagsRaw.startsWith('[')
      ? (JSON.parse(tagsRaw) as string[]).filter((item) => typeof item === 'string')
      : tagsRaw.split(/[、,，/|]/).map((item) => item.trim()).filter((item) => item !== '')

  return {
    platformJobId,
    input: {
      platformId: IMPORT_PLATFORM_ID,
      platformJobId,
      title,
      companyId,
      salaryRaw: salary.raw,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryMonths: salary.months,
      city,
      district: (row.district ?? '').trim(),
      expReq: (row.expReq ?? '').trim(),
      eduReq: (row.eduReq ?? '').trim(),
      tags,
      sourceUrl,
      publishedAt: (row.publishedAt ?? '').trim() === '' ? null : (row.publishedAt ?? '').trim(),
    },
  }
}

/**
 * 导入岗位（CSV 或 JSON）。
 *
 * 幂等：同一个岗位重复导入只会更新，不会重复建行（键见 `jobInputOf`）。
 */
export function importJobs(
  deps: ImportDeps,
  payload: { format: 'csv' | 'json'; content: string },
  clock: Clock = systemClock,
): DataImportResultDto {
  const store = deps.store
  const content = payload.content
  if (looksLikeBinary(content)) {
    return {
      format: payload.format,
      received: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, message: '这看起来是 Excel 的 .xlsx 二进制（或其它二进制文件），不是文本。' }],
      moreErrors: 0,
      note:
        '不支持 .xlsx 二进制：直接解析它需要解包 + 解析 XML，做错了会把脏数据写进岗位库。' +
        '请在 Excel 里「另存为 → CSV UTF-8」后再导入。',
    }
  }
  // 中文 Excel 默认另存 GBK，硬按 UTF-8 读会得到一库乱码 —— 宁可拒收
  if (content.includes('\ufffd')) {
    return {
      format: payload.format,
      received: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, message: '文件不是 UTF-8 编码（出现了无法解码的字符）。' }],
      moreErrors: 0,
      note:
        '中文 Excel 默认另存为 GBK。请用「另存为 → CSV UTF-8（逗号分隔）」重新导出，' +
        '或在记事本里「另存为 → 编码选 UTF-8」。不接受乱码导入 —— 那会污染岗位库。',
    }
  }

  // 拿到"行"（统一成 ImportField → 字符串）
  let rows: Array<Partial<Record<ImportField, string>>> = []
  let rowNumbers: number[] = []
  let parseError: string | null = null
  if (payload.format === 'csv') {
    const table = csvParse(content)
    if (table.length === 0) parseError = 'CSV 里没有任何内容。'
    else {
      const map = headerIndex(table[0] ?? [])
      if (map.title === undefined) {
        parseError =
          '没找到"岗位标题"列。表头需要包含「岗位标题」（也认「标题/职位/岗位/title」）。'
      } else {
        for (let index = 1; index < table.length; index += 1) {
          const cells = table[index] ?? []
          const row: Partial<Record<ImportField, string>> = {}
          for (const field of IMPORT_FIELDS) {
            const column = map[field]
            if (column !== undefined) row[field] = cells[column] ?? ''
          }
          rows.push(row)
          // +1 是给人看的行号（第 1 行是表头）
          rowNumbers.push(index + 1)
        }
      }
    }
  } else {
    let parsed: unknown
    try {
      parsed = decodeJson(content)
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }
    if (parseError === null) {
      const array = jobArrayOf(parsed)
      if (array.length === 0) parseError = 'JSON 里没有找到岗位数组（既不是数组，也没有 tables.job）。'
      else rows = array.map((raw) => rowFromJson(raw))
      rowNumbers = rows.map((_, index) => index + 1)
    }
  }

  if (parseError !== null) {
    return {
      format: payload.format,
      received: 0, inserted: 0, updated: 0, skipped: 0,
      errors: [{ row: 0, message: parseError }],
      moreErrors: 0,
      note: '一行都没导入 —— 先把格式修对再试。',
    }
  }

  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      format: payload.format,
      received: rows.length, inserted: 0, updated: 0, skipped: rows.length,
      errors: [{ row: 0, message: `一次最多导入 ${String(IMPORT_MAX_ROWS)} 行，这次是 ${String(rows.length)} 行。` }],
      moreErrors: 0,
      note: '请拆成几个文件分批导入（导入是幂等的，分几次不会重复建岗位）。',
    }
  }

  // 虚拟平台行：让导入的岗位在界面上显示为「手动导入」而不是一个裸 id
  store.platform.ensure(
    {
      id: IMPORT_PLATFORM_ID,
      displayName: IMPORT_PLATFORM_NAME,
      capabilities: {
        searchWithoutLogin: false,
        supportsAttachment: false,
        supportsReadReceipt: false,
        supportsInbox: false,
        supportsGreeting: false,
        fieldCompleteness: 'medium',
        antiBot: 'low',
      },
    },
    clock(),
  )

  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: Array<{ row: number; message: string }> = []
  let moreErrors = 0
  const now = clock()

  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index] ?? {}
    const rowNo = rowNumbers[index] ?? index + 1
    const title = (raw.title ?? '').trim()
    if (title === '') {
      skipped += 1
      if (errors.length < ELLIPSIS_ERRORS) errors.push({ row: rowNo, message: '缺少岗位标题，跳过。' })
      else moreErrors += 1
      continue
    }
    try {
      const companyName = (raw.company ?? '').trim()
      // 公司登记失败不该让整行失败（与抓取同一条纪律）：岗位照常入库，只是没有公司关联
      let companyId: number | null = null
      if (companyName !== '') {
        try {
          companyId = deps.ensureCompany({ name: companyName })
        } catch {
          companyId = null
        }
      }
      const { input } = jobInputOf(raw, companyId)
      const written = store.job.upsert(input, now)
      if (written.outcome === 'inserted') inserted += 1
      else updated += 1
      deps.evaluate?.(written.id)
    } catch (error) {
      skipped += 1
      const message = error instanceof Error ? error.message : String(error)
      if (errors.length < ELLIPSIS_ERRORS) errors.push({ row: rowNo, message })
      else moreErrors += 1
    }
  }

  return {
    format: payload.format,
    received: rows.length,
    inserted,
    updated,
    skipped,
    errors,
    moreErrors,
    note:
      `导入完成：新增 ${String(inserted)} 条，更新 ${String(updated)} 条，跳过 ${String(skipped)} 条。` +
      '重复导入同一份表只会更新、不会重复建岗位（幂等键是来源链接，没有链接时用「标题|公司|城市」）。' +
      '导入的岗位挂在「手动导入」这个平台下，不会参与抓取。',
  }
}
