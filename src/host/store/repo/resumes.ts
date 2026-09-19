import type { DatabaseSync } from 'node:sqlite'
import type { ResumeLanguage, ResumeState } from '../../../shared/contract/enums/resume.js'
import type { ResumeDto, ResumeFileDto, ResumeSummaryDto } from '../../../shared/contract/dto/resume.js'
import type { ResumeContent } from '../../../shared/domain/resume-content.js'
import { inspectResume, normalizeResumeContent } from '../../../shared/domain/resume-content.js'
import { asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 简历仓储（§7 / §11.3）。
 *
 * 三条纪律：
 *   1. **`content_json` 一律过 `normalizeResumeContent`** —— 它是用户手改的 JSON，
 *      也可能是模型返回的 JSON，两者都不可信。规范化放在仓储边界上，
 *      上层就永远拿不到"缺字段的半截对象"；
 *   2. **`rev` 只增不减**：任何内容变更都 +1。`job.score_rev` 靠它判断分数是否过期（§4.1），
 *      不递增就等于把过期分数当新分数用；
 *   3. **删除只由用户显式发起**：`remove` 会连带删掉附件记录与磁盘文件（由领域层做），
 *      但没有任何自动清理路径会调它（§18：简历与附件绝不清）。
 */
export interface ResumeRecord {
  id: number
  name: string
  direction: string
  language: ResumeLanguage
  content: ResumeContent
  state: ResumeState
  isDefault: boolean
  rev: number
  createdAt: string
  updatedAt: string
}

export interface ResumeUpsertInput {
  name: string
  direction?: string
  language?: ResumeLanguage
  content: ResumeContent
  state?: ResumeState
  isDefault?: boolean
}

export interface ResumeFileRecord extends ResumeFileDto {
  resumeId: number
  template: string
  /** 相对 `files/` 根的路径。 */
  path: string
}

export interface ResumeRepo {
  list(options?: { state?: ResumeState; includeArchived?: boolean }): ResumeRecord[]
  get(id: number): ResumeRecord | undefined
  create(input: ResumeUpsertInput, now: string): ResumeRecord
  update(id: number, patch: Partial<ResumeUpsertInput>, now: string): ResumeRecord
  remove(id: number): boolean
  /** 把某一版设为"当前启用"。同方向内互斥。 */
  setDefault(id: number, now: string): ResumeRecord
  defaultResume(): ResumeRecord | undefined
  /** 列表用的轻量视图（不把整份简历正文塞进 DTO）；带上各版附件，投递时选简历要用。 */
  summaries(options?: { includeArchived?: boolean }): ResumeSummaryDto[]
  count(): number

  addFile(input: Omit<ResumeFileRecord, 'id' | 'createdAt'>, now: string): ResumeFileRecord
  listFiles(resumeId: number): ResumeFileRecord[]
  getFile(fileId: number): ResumeFileRecord | undefined
  removeFile(fileId: number): boolean

  /** 匹配分失效判断需要知道"当前版本是哪一份、rev 多少"（§4.1）。 */
  revision(): { resumeId: number | null; rev: number }
}

function toRecord(row: Row): ResumeRecord {
  return {
    id: asInt(row['id']),
    name: asText(row['name']),
    direction: asText(row['direction']),
    language: asText(row['language'], 'zh') as ResumeLanguage,
    content: normalizeResumeContent(asJson<unknown>(row['content_json'], {})),
    state: asText(row['state'], 'active') as ResumeState,
    isDefault: asInt(row['is_default'], 0) !== 0,
    rev: asInt(row['rev'], 1),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
  }
}

export function createResumeRepo(db: DatabaseSync): ResumeRepo {
  const selectAll = db.prepare('SELECT * FROM resume ORDER BY is_default DESC, updated_at DESC')
  const selectActive = db.prepare(
    "SELECT * FROM resume WHERE state = 'active' ORDER BY is_default DESC, updated_at DESC",
  )
  const selectOne = db.prepare('SELECT * FROM resume WHERE id = ?')
  const selectDefault = db.prepare('SELECT * FROM resume WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1')
  const insertResume = db.prepare(
    `INSERT INTO resume (name, direction, language, content_json, state, is_default, rev, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  const updateResume = db.prepare(
    `UPDATE resume SET name = ?, direction = ?, language = ?, content_json = ?, state = ?, is_default = ?, rev = ?, updated_at = ?
     WHERE id = ?`,
  )
  const clearDefault = db.prepare('UPDATE resume SET is_default = 0 WHERE is_default = 1')
  const setDefaultStmt = db.prepare('UPDATE resume SET is_default = 1, updated_at = ? WHERE id = ?')
  const delResume = db.prepare('DELETE FROM resume WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM resume')

  const insertFile = db.prepare(
    `INSERT INTO resume_file (resume_id, format, template, path, bytes, file_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectFiles = db.prepare('SELECT * FROM resume_file WHERE resume_id = ? ORDER BY id DESC')
  const selectFile = db.prepare('SELECT * FROM resume_file WHERE id = ?')
  const deleteFile = db.prepare('DELETE FROM resume_file WHERE id = ?')

  const toFile = (row: Row): ResumeFileRecord => ({
    id: asInt(row['id']),
    resumeId: asInt(row['resume_id']),
    format: asText(row['format']),
    template: asText(row['template'], 'concise'),
    path: asText(row['path']),
    bytes: asInt(row['bytes']),
    fileName: asText(row['file_name']),
    createdAt: asText(row['created_at']),
  })

  const readOrThrow = (id: number): ResumeRecord => {
    const row = selectOne.get(id) as Row | undefined
    if (row === undefined) throw new Error(`resume ${String(id)} 不存在`)
    return toRecord(row)
  }

  return {
    list(options = {}): ResumeRecord[] {
      const rows = (options.includeArchived === false || options.state === 'active'
        ? selectActive.all()
        : selectAll.all()) as Row[]
      return rows.map(toRecord)
    },

    get(id): ResumeRecord | undefined {
      const row = selectOne.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    create(input, now): ResumeRecord {
      const name = input.name.trim() === '' ? '新简历' : input.name.trim()
      const result = insertResume.run(
        name,
        input.direction ?? '',
        input.language ?? 'zh',
        JSON.stringify(input.content),
        input.state ?? 'active',
        input.isDefault === true ? 1 : 0,
        now,
        now,
      )
      const id = asId(result.lastInsertRowid)
      if (input.isDefault === true) {
        db.prepare('UPDATE resume SET is_default = 0 WHERE id != ?').run(id)
      }
      return readOrThrow(id)
    },

    update(id, patch, now): ResumeRecord {
      const current = readOrThrow(id)
      // 只有**内容真的变了**才递增 rev。
      // 实测踩过：早先只要请求里带了 content 就 +1，于是界面把没改过的内容原样 PATCH 回来
      // 也会让所有匹配分被判过期 —— 而"分数动不动就失效"会让用户干脆不看那个提示。
      const nextContent = patch.content ?? current.content
      const contentChanged =
        patch.content !== undefined && JSON.stringify(patch.content) !== JSON.stringify(current.content)
      updateResume.run(
        patch.name ?? current.name,
        patch.direction ?? current.direction,
        patch.language ?? current.language,
        JSON.stringify(nextContent),
        patch.state ?? current.state,
        patch.isDefault === undefined ? (current.isDefault ? 1 : 0) : patch.isDefault ? 1 : 0,
        contentChanged ? current.rev + 1 : current.rev,
        now,
        id,
      )
      if (patch.isDefault === true) {
        db.prepare('UPDATE resume SET is_default = 0 WHERE id != ?').run(id)
      }
      return readOrThrow(id)
    },

    remove(id): boolean {
      return delResume.run(id).changes > 0
    },

    setDefault(id, now): ResumeRecord {
      readOrThrow(id)
      clearDefault.run()
      setDefaultStmt.run(now, id)
      return readOrThrow(id)
    },

    defaultResume(): ResumeRecord | undefined {
      const row = selectDefault.get() as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    summaries(options = {}): ResumeSummaryDto[] {
      return this.list(options).map((record) => {
        // 附件一次读出来：`counts.files` 就是它的长度，不必再多查一次 count
        const files = this.listFiles(record.id).map(toResumeFileDto)
        return {
          id: record.id,
          name: record.name,
          direction: record.direction,
          language: record.language,
          state: record.state,
          isDefault: record.isDefault,
          rev: record.rev,
          updatedAt: record.updatedAt,
          files,
          counts: {
            skills: record.content.skills.length,
            experiences: record.content.experiences.length,
            projects: record.content.projects.length,
            education: record.content.education.length,
            files: files.length,
          },
          issues: inspectResume(record.content).length,
        }
      })
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },

    addFile(input, now): ResumeFileRecord {
      const result = insertFile.run(
        input.resumeId,
        input.format,
        input.template,
        input.path,
        input.bytes,
        input.fileName,
        now,
      )
      return toFile(selectFile.get(asId(result.lastInsertRowid)) as Row)
    },

    listFiles(resumeId): ResumeFileRecord[] {
      return (selectFiles.all(resumeId) as Row[]).map(toFile)
    },

    getFile(fileId): ResumeFileRecord | undefined {
      const row = selectFile.get(fileId) as Row | undefined
      return row === undefined ? undefined : toFile(row)
    },

    removeFile(fileId): boolean {
      return deleteFile.run(fileId).changes > 0
    },

    revision(): { resumeId: number | null; rev: number } {
      const current = this.defaultResume()
      return current === undefined
        ? { resumeId: null, rev: 0 }
        : { resumeId: current.id, rev: current.rev }
    },
  }
}

/**
 * `ResumeFileDto` 投影：**刻意不含 `path`**。
 *
 * 磁盘路径只活在仓储层（相对 `files/`），出不了 DTO 边界（§4.1）。
 * 放成导出的函数而不是各写一遍：投递选简历、简历详情、导出回执都要用它 ——
 * 三处各写一遍的话，哪天给 DTO 加一格就必然漏掉两处。
 */
export function toResumeFileDto(file: ResumeFileRecord): ResumeFileDto {
  return {
    id: file.id,
    format: file.format,
    fileName: file.fileName,
    bytes: file.bytes,
    createdAt: file.createdAt,
  }
}

/** 把仓储记录转成对外 DTO（补上附件列表与定制数）。 */
export function toResumeDto(
  record: ResumeRecord,
  files: ResumeFileDto[],
  tailoringCount: number,
): ResumeDto {
  return {
    id: record.id,
    name: record.name,
    direction: record.direction,
    language: record.language,
    state: record.state,
    isDefault: record.isDefault,
    content: record.content,
    rev: record.rev,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    files,
    tailoringCount,
  }
}

export { asTextOrNull }
