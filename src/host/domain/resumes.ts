/**
 * 简历领域服务（§4.3 `resumes` / §11.3 / §17 / §3.2）。
 *
 * ## 三条产品判断决定了这里的形状
 *
 * 1. **简历是资产，要版本化，不是每岗一版**（§3.2）。所以有 `direction`（方向）与
 *    独立的版本记录；"定制"产出的是**建议**（`tailoring` 表）+ 显式采用，
 *    而不是直接覆盖用户手上的简历。
 * 2. **红线：不许编造经历**（§4.5 / R8）。定制结果一律过 `checkNoFabrication`，
 *    不合格就**退回规则结果并如实说明**，绝不"先用了再说"。
 * 3. **匹配分是简历版本的函数**（§4.1）。`scoreStamp()` 给出当前版本 id 与 rev，
 *    `intel.evaluateJob` 把它写进 `job.score_rev` / `job.score_resume_id`；
 *    简历一改 rev 就变，旧分数自动被判定为过期。
 *
 * ## 导出为什么在 domain 而不是 render
 *
 * `render/` 是**纯函数**（内容 → 字节），domain 负责"字节去哪、记了什么账、谁能读"。
 * 把文件落盘与 DB 记账放在一起，才能保证"有记录的文件一定在磁盘上"。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResumeFormat, ResumeLanguage, ResumeState, ResumeTemplate } from '../../shared/contract/enums/resume.js'
import { RESUME_FORMATS, RESUME_TEMPLATES } from '../../shared/contract/enums/resume.js'
import type { GreetingTemplateDto, ResumeDto, ResumeFileDto, ResumeSummaryDto, TailoringDto } from '../../shared/contract/dto/resume.js'
import type { ResumeContent, ResumeIssue } from '../../shared/domain/resume-content.js'
import { checkNoFabrication, emptyResumeContent, flattenResumeText, isResumeContentUsable, normalizeResumeContent, resumeFileName, sanitizeFileName, techTokensOf } from '../../shared/domain/resume-content.js'
import { GREETING_TONE_LABEL, type GreetingTone } from '../../shared/contract/enums/pipeline.js'
import { ATTACHMENT_MAX_BYTES, MAX_GREETING_TEMPLATE_NAME, MAX_RESUME_GREETING_TEMPLATES, RESUME_IMPORT_MAX_CHARS } from '../../shared/config/limits.js'
import type { AiService } from '../ai/client.js'
import { extractJson } from '../ai/prompts.js'
import { renderResumeDocx } from '../render/docx.js'
import { renderResumeHtml } from '../render/resume-html.js'
import type { Store } from '../store/store.js'
import { toResumeDto, toResumeFileDto, type ResumeRecord } from '../store/repo/resumes.js'
import type { GreetingTemplateRecord } from '../store/repo/pipeline.js'
import { GREETING_MAX_CHARS, validateGreetingText } from './outreach.js'
import { DomainError, messageOf } from '../util/errors.js'
import { isoNow, systemClock, type Clock } from '../util/time.js'

/** 渲染成 PDF 的端口。真实实现是 headless Chromium（`render/pdf.ts`），测试用假的。 */
export interface PdfPort {
  render(html: string): Promise<Uint8Array>
}

export interface ResumeServiceDeps {
  store: Store
  /** 生成文件放哪。默认 `$DSH_HOME/job-hunter/files`（由 runtime 注入）。 */
  filesDir: string
  clock?: Clock
  ai?: AiService | undefined
  pdf?: PdfPort | undefined
  logger?: { info(message: string): void; warn(message: string): void }
}

export interface ResumeService {
  list(options?: { includeArchived?: boolean }): ResumeSummaryDto[]
  get(id: number): ResumeDto
  create(input: ResumeWriteInput): ResumeDto
  update(id: number, patch: Partial<ResumeWriteInput>): ResumeDto
  duplicate(id: number, name?: string): ResumeDto
  setDefault(id: number): ResumeDto
  remove(id: number): boolean
  /** 体检（规则部分）。 */
  inspect(id: number): ResumeIssue[]
  /** 预览用的自包含 HTML（不落盘）。 */
  preview(id: number, template?: ResumeTemplate): string
  /** 生成附件并记账。 */
  exportResume(id: number, input?: { format?: ResumeFormat; template?: ResumeTemplate }): Promise<ResumeFileDto>
  /**
   * A3：把**粘贴进来的简历文本**解析成结构化内容，并（默认）存成一版新简历。
   *
   * ⚠️ 只接受**文本**，不接受 PDF/DOCX 字节：本仓库没有 PDF/DOCX 解析库，
   * 硬造一个只会把脏数据写进简历库。用户从 PDF 里选中复制再粘进来即可
   * （Word 与 PDF 都能复制）。想把手上的 PDF 原样存档，用下面的 `uploadFile`。
   */
  importResume(input: ResumeImportInput): Promise<ResumeImportResult>
  /**
   * 把**用户自己的** PDF / DOCX 存成这一版简历的附件（R9 / D7）。
   *
   * 与 `exportResume` 的分工：那个是"从结构化内容生成文件"，
   * 这个是"把你手上已有的文件原样收进来"——用途是投递归因（R6：这次投的是哪一份）
   * 以及平台要求的自有模板表。
   */
  uploadFile(
    resumeId: number,
    input: { fileName: string; contentBase64: string; format?: string },
  ): ResumeFileDto
  /** 读回已生成的文件（下载路由用）。 */
  readFile(fileId: number): { fileName: string; format: string; bytes: Uint8Array } | undefined
  removeFile(fileId: number): boolean

  tailor(input: { jobId: number; resumeId?: number; useLlm?: boolean }): Promise<TailoringDto>
  listTailorings(options: { resumeId?: number; jobId?: number; limit?: number }): TailoringDto[]
  adopt(tailoringId: number, adopted: boolean): TailoringDto

  /** ── 简历赛道级话术模板（简历中心「话术」子页，v12 多赛道）────────── */
  listGreetingTemplates(resumeId: number): GreetingTemplateDto[]
  /** 从这份简历的事实生成一条开场模板：AI 优先（过校验），规则兜底。 */
  generateGreetingTemplate(input: { resumeId: number; tone?: GreetingTone }): Promise<GreetingTemplateDto>
  /** 手动新建 / 编辑（`via` 记 `manual`；编辑不改归属）。 */
  saveGreetingTemplate(input: { resumeId: number; id?: number; name: string; body: string }): GreetingTemplateDto
  removeGreetingTemplate(id: number): boolean

  /** 当前启用版本的标识，写进 `job.score_rev`（§4.1）。 */
  scoreStamp(): { resumeId: number | null; rev: number }
}

export interface ResumeWriteInput {
  name: string
  direction?: string
  language?: ResumeLanguage
  content: ResumeContent
  state?: ResumeState
  isDefault?: boolean
}

export interface ResumeImportInput {
  /** 从 PDF / Word 里复制出来的简历正文（纯文本）。 */
  text: string
  name?: string
  direction?: string
  language?: ResumeLanguage
  /** 是否存成一版新简历；`false` = 只解析给用户看。默认 `true`。 */
  save?: boolean
  useLlm?: boolean
}

export interface ResumeImportResult {
  /** 落库后的简历；`save: false` 时为 null。 */
  resume: ResumeDto | null
  /** 解析（或兜底）得到的结构化内容 —— 即使没落库也返回，界面让用户先看再决定。 */
  content: ResumeContent
  /** `llm` = 模型解析；`rule` = 未解析（原始文本原样保留在 `extras` 里）。 */
  via: 'llm' | 'rule'
  /** 事实说明：降级原因、外发字段、以及需要人工核对的项。 */
  notes: string[]
  issues: ResumeIssue[]
}

export function createResumeService(deps: ResumeServiceDeps): ResumeService {
  const { store } = deps
  const clock = deps.clock ?? systemClock
  const filesDir = deps.filesDir

  const toDto = (record: ResumeRecord): ResumeDto =>
    toResumeDto(
      record,
      store.resume.listFiles(record.id).map(toResumeFileDto),
      store.tailoring.countFor(record.id),
    )

  const requireResume = (id: number): ResumeRecord => {
    const record = store.resume.get(id)
    if (record === undefined) {
      throw new DomainError('NOT_FOUND', `简历不存在：${String(id)}`, {
        hint: '它可能已被删除。用 resume_list 看当前有哪些版本。',
        detail: { resumeId: id },
      })
    }
    return record
  }

  const tailoringDto = (record: ReturnType<Store['tailoring']['create']>): TailoringDto => {
    const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
    return {
      id: record.id,
      resumeId: record.resumeId,
      jobId: record.jobId ?? 0,
      jobTitle: job?.title ?? null,
      companyName: job?.companyName ?? null,
      content: record.content,
      via: record.via,
      notes: record.notes,
      adopted: record.adopted,
      outcome: record.outcome,
      createdAt: record.createdAt,
    }
  }

  /** 附件落盘目录：每个简历一个子目录，便于用户自己进去找。 */
  const dirFor = (resumeId: number): string => join(filesDir, `resume-${String(resumeId)}`)

  return {
    list(options = {}): ResumeSummaryDto[] {
      return store.resume.summaries({ includeArchived: options.includeArchived !== false })
    },

    get(id): ResumeDto {
      return toDto(requireResume(id))
    },

    create(input): ResumeDto {
      const record = store.resume.create(
        {
          name: input.name,
          ...(input.direction === undefined ? {} : { direction: input.direction }),
          ...(input.language === undefined ? {} : { language: input.language }),
          content: normalizeResumeContent(input.content),
          ...(input.state === undefined ? {} : { state: input.state }),
          // 第一份简历自动成为启用版本，否则用户新建完还得再点一下
          isDefault: input.isDefault ?? store.resume.count() === 0,
        },
        clock(),
      )
      return toDto(record)
    },

    update(id, patch): ResumeDto {
      requireResume(id)
      const record = store.resume.update(
        id,
        {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.direction === undefined ? {} : { direction: patch.direction }),
          ...(patch.language === undefined ? {} : { language: patch.language }),
          ...(patch.content === undefined ? {} : { content: normalizeResumeContent(patch.content) }),
          ...(patch.state === undefined ? {} : { state: patch.state }),
          ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
        },
        clock(),
      )
      return toDto(record)
    },

    duplicate(id, name): ResumeDto {
      const source = requireResume(id)
      const record = store.resume.create(
        {
          name: name ?? `${source.name} 副本`,
          direction: source.direction,
          language: source.language,
          content: source.content,
          state: 'active',
          isDefault: false,
        },
        clock(),
      )
      return toDto(record)
    },

    setDefault(id): ResumeDto {
      return toDto(store.resume.setDefault(id, clock()))
    },

    remove(id): boolean {
      const record = store.resume.get(id)
      if (record === undefined) return false
      // 定制记录随简历一起走（外键 CASCADE 也会删，这里显式删是为了计数准确）
      store.tailoring.removeByResume(id)
      // 话术模板也连带清理（v12）：模板挂在简历上，简历没了就是孤儿数据 ——
      // 通用模板（resume_id 为 NULL）不在此列，不受影响
      store.pipeline.removeTemplatesByResume(id)
      const removed = store.resume.remove(id)
      if (removed) {
        // 磁盘文件：删不掉不算失败（可能被用户打开着），但要如实报告
        try {
          rmSync(dirFor(id), { recursive: true, force: true })
        } catch (error) {
          deps.logger?.warn(`[resume] 删除附件目录失败（记录已删）：${messageOf(error)}`)
        }
      }
      return removed
    },

    inspect(id): ResumeIssue[] {
      const record = requireResume(id)
      // 复用共享层的规则体检：宿主与界面看到的是同一批问题
      return inspectOf(record.content)
    },

    preview(id, template = 'concise'): string {
      const record = requireResume(id)
      return renderResumeHtml(record.content, { template })
    },

    async exportResume(id, input = {}): Promise<ResumeFileDto> {
      const record = requireResume(id)
      const format = input.format ?? 'pdf'
      const template = input.template ?? 'concise'
      if (!RESUME_FORMATS.includes(format)) {
        throw new DomainError('INVALID_INPUT', `不支持的导出格式：${format}`, {
          hint: `合法取值：${RESUME_FORMATS.join(' / ')}`,
        })
      }
      if (!RESUME_TEMPLATES.includes(template)) {
        throw new DomainError('INVALID_INPUT', `不支持的模板：${template}`, {
          hint: `合法取值：${RESUME_TEMPLATES.join(' / ')}`,
        })
      }
      // 空简历导出等于给用户一张白纸 —— 宁可在生成前就拦住
      if (!isResumeContentUsable(record.content)) {
        throw new DomainError('INVALID_INPUT', '这份简历还没有内容，导出的会是一张白纸', {
          hint: '至少填上姓名，并补一段工作经历或项目经历（或几项技能）。',
          detail: { resumeId: id, issueCount: inspectOf(record.content).length },
        })
      }

      const html = renderResumeHtml(record.content, { template })
      let bytes: Uint8Array
      let extension = format
      if (format === 'html') {
        bytes = new TextEncoder().encode(html)
      } else if (format === 'docx') {
        bytes = renderResumeDocx(record.content, { template })
      } else {
        const pdf = deps.pdf
        if (pdf === undefined) {
          throw new DomainError('ADAPTER_BROKEN', '当前环境没有可用的 PDF 渲染器', {
            hint:
              'PDF 需要一份 headless Chromium（抓取用的浏览器是 headful 的，page.pdf() 用不了）。' +
              '可以先用 docx 或 html 导出。',
            detail: { format },
          })
        }
        bytes = await pdf.render(html)
        extension = 'pdf'
      }

      const dir = dirFor(id)
      mkdirSync(dir, { recursive: true })
      // 显示名（可能含中文）与落盘名分开，见 `storedNameOf` 的说明
      const fileName = resumeFileName(record.content, extension)
      // 文件名带时间戳，避免同一秒内两次导出互相覆盖
      const stored = `${clock().replace(/[:.]/g, '-')}-${storedNameOf(fileName, extension)}`
      const absolute = join(dir, stored)
      writeFileSync(absolute, bytes)
      deps.logger?.info(`[resume] 已生成 ${format} 附件：${absolute}（${String(bytes.byteLength)} 字节）`)

      const file = store.resume.addFile(
        {
          resumeId: id,
          format,
          template,
          // 存相对路径：换数据目录只改一个根，不用批量改库
          path: join(`resume-${String(id)}`, stored),
          bytes: bytes.byteLength,
          fileName,
        },
        clock(),
      )
      return toResumeFileDto(file)
    },

    readFile(fileId) {
      const file = store.resume.getFile(fileId)
      if (file === undefined) return undefined
      const absolute = join(filesDir, file.path)
      if (!existsSync(absolute)) {
        // 记录在而文件没了：如实报"丢了"，不要让下载返回空文件
        deps.logger?.warn(`[resume] 附件记录 #${String(fileId)} 存在但文件缺失：${absolute}`)
        return undefined
      }
      return { fileName: file.fileName, format: file.format, bytes: readFileSync(absolute) }
    },

    async importResume(input): Promise<ResumeImportResult> {
      const text = input.text.trim()
      if (text === '') {
        throw new DomainError('INVALID_INPUT', '简历文本是空的', {
          hint: '从 PDF / Word 里**选中正文复制**再粘进来（本工具不解析 PDF 字节，见 importResume 的说明）。',
        })
      }
      if (text.length > RESUME_IMPORT_MAX_CHARS) {
        throw new DomainError(
          'INVALID_INPUT',
          `简历文本太长了（${String(text.length)} 字，上限 ${String(RESUME_IMPORT_MAX_CHARS)}）`,
          { hint: '把无关的页眉页脚、隐私声明删掉再试 —— 太长的文本既烧额度也解析不准。' },
        )
      }

      const direction = input.direction?.trim() ?? ''
      const ai = deps.ai
      /** 兜底：不解析，但**原文一字不丢**地保留下来（否则用户白粘一次）。 */
      const rawOnly = (): ResumeContent => ({
        ...emptyResumeContent(direction),
        extras: [{ label: '导入的原始文本（待整理）', text: text.slice(0, 6000) }],
      })

      let content = rawOnly()
      let via: 'llm' | 'rule' = 'rule'
      const notes: string[] = []

      if (ai === undefined || input.useLlm === false) {
        notes.push(
          '没有调用模型（用途「简历导入解析」默认关闭，或本次要求只用规则）—— ' +
            '原始文本已原样保留在「补充信息」里，请手工整理成结构化内容。',
        )
      } else {
        const result = await ai.call<{ content: ResumeContent }>(
          {
            purpose: 'resume_import',
            instruction: [
              '把下面这份简历文本**原样整理**成结构化 JSON。硬性约束：',
              '1. 只提取文本里**真实存在**的信息；文本没有的字段留空字符串或空数组；',
              '2. 不许补充、推断、美化任何经历、技能、学历或数字（年限、人数、百分比都不许改）；',
              '3. 时间是文本里的日期，统一写成 YYYY-MM；只有一端（在职中）就只写 start；',
              '4. 逐条成果保持原文措辞，只去掉多余空白与行号；',
              '5. 联系方式（手机号/邮箱）**不要输出**——它们在本地就够了。',
            ].join('\n'),
            trusted: [{ label: 'resume-text', text }],
            outputSpec:
              '只输出 JSON：{"content": {"basics":{"name","title","city","years"},' +
              '"summary","skills":[{"name","level","years","evidence"}],' +
              '"experiences":[{"company","title","start","end","city","highlights":[],"stack":[]}],' +
              '"projects":[{"name","role","period","highlights":[],"stack":[]}],' +
              '"education":[{"school","major","degree","start","end"}],"extras":[{"label","text"}]}}。' +
              '不要输出其它内容。',
            maxTokens: 4096,
            temperature: 0.2,
            ref: { kind: 'resume', action: 'import' },
          },
          {
            parse: (raw) => {
              const parsed = extractJson(raw)
              if (parsed === null || typeof parsed !== 'object') return undefined
              const rawContent = (parsed as { content?: unknown }).content
              if (rawContent === null || typeof rawContent !== 'object') return undefined
              return { content: normalizeResumeContent(rawContent) }
            },
            fallback: () => ({ content: rawOnly() }),
          },
        )
        content = result.via === 'llm' ? result.value.content : rawOnly()
        via = result.via === 'llm' ? 'llm' : 'rule'
        notes.push(...result.notes)
        if (via === 'rule') {
          notes.push('模型没能给出可用的解析结果 —— 原始文本已原样保留在「补充信息」里，请手工整理。')
        } else {
          notes.push(...ungroundedNotes(content, text))
        }
      }

      let resume: ResumeDto | null = null
      if (input.save !== false) {
        const explicitName = input.name?.trim() ?? ''
        const created = store.resume.create(
          {
            name: explicitName !== '' ? explicitName : (content.basics.title || '导入的简历'),
            ...(direction === '' ? {} : { direction }),
            ...(input.language === undefined ? {} : { language: input.language }),
            content,
            // 库里有默认版本时**不抢**默认位：换默认是用户的决定（§12.3）
            ...(store.resume.defaultResume() === undefined ? { isDefault: true } : {}),
          },
          clock(),
        )
        resume = toDto(created)
        deps.logger?.info(
          `[resume] 从粘贴文本导入简历 #${String(created.id)}（${via}，${String(text.length)} 字）`,
        )
      }

      return { resume, content, via, notes, issues: inspectOf(content) }
    },

    uploadFile(resumeId, input): ResumeFileDto {
      const record = requireResume(resumeId)
      const format = parseUploadFormat(input.fileName, input.format)
      const bytes = decodeBase64(input.contentBase64)
      if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
        throw new DomainError(
          'INVALID_INPUT',
          `附件太大（${formatBytes(bytes.byteLength)}，上限 ${formatBytes(ATTACHMENT_MAX_BYTES)}）`,
          { hint: '主流招聘站对简历附件普遍限 5–10MB；先压缩或另存为更小的 PDF。' },
        )
      }
      assertAttachmentKind(format, bytes)

      const dir = dirFor(record.id)
      mkdirSync(dir, { recursive: true })
      const base = sanitizeFileName(input.fileName.trim())
      // 显示名保留用户给的原名（HR 那一侧看到的就是它）；落盘名走 ASCII，见 `storedNameOf`
      const fileName = base.toLowerCase().endsWith(`.${format}`) ? base : `${base}.${format}`
      const stored = `${clock().replace(/[:.]/g, '-')}-${storedNameOf(fileName, format)}`
      writeFileSync(join(dir, stored), bytes)
      deps.logger?.info(
        `[resume] 收到上传附件：${join(dir, stored)}（${String(bytes.byteLength)} 字节，${format}）`,
      )

      const file = store.resume.addFile(
        {
          resumeId: record.id,
          format,
          // 上传件没有排版模板：写 `upload` 而不是默认的 `concise` ——
          // 后者会让"这份是我导出的"与"这份是我传进来的"在库里分不出来
          template: 'upload',
          path: join(`resume-${String(record.id)}`, stored),
          bytes: bytes.byteLength,
          fileName,
        },
        clock(),
      )
      return toResumeFileDto(file)
    },

    removeFile(fileId): boolean {
      const file = store.resume.getFile(fileId)
      if (file === undefined) return false
      try {
        rmSync(join(filesDir, file.path), { force: true })
      } catch (error) {
        deps.logger?.warn(`[resume] 删除附件文件失败：${messageOf(error)}`)
      }
      return store.resume.removeFile(fileId)
    },

    async tailor({ jobId, resumeId, useLlm }): Promise<TailoringDto> {
      const job = store.job.detail(jobId)
      if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(jobId)}`, { detail: { jobId } })
      }
      const record =
        resumeId === undefined
          ? store.resume.defaultResume() ?? store.resume.list({ state: 'active' })[0]
          : store.resume.get(resumeId)
      if (record === undefined) {
        throw new DomainError('NOT_FOUND', '还没有任何简历版本可以用来定制', {
          hint: '先在「简历中心」新建一版简历。',
          detail: { resumeId: resumeId ?? null },
        })
      }

      const jdText = store.job.jdText(job.id) ?? ''
      // 目标岗位的关键词：**允许出现在定制结果里**（那不是编造，是瞄准）。
      const targetKeywords = techTokensOf(
        [job.title, job.tags.join(' '), jdText].filter(Boolean).join(' '),
      )

      const original = record.content
      const rule = ruleTailor(original, { title: job.title, tags: job.tags, jdText })

      // 规则结果也要过一遍防编造：规则路径**理论上**不可能编造，
      // 但"理论上不可能"的东西正是最该被断言守住的（断言要写产品该有的行为）。
      const ruleCheck = checkNoFabrication(original, rule.content, { allowTech: targetKeywords })
      const fallback = ruleCheck.ok ? rule.content : original
      const baseNotes = ruleCheck.ok ? rule.notes : [...rule.notes, `规则定制结果未通过防编造检查（${ruleCheck.reasons.join('；')}），已退回原简历`]

      const ai = deps.ai
      if (ai === undefined || useLlm === false) {
        const created = store.tailoring.create(
          { resumeId: record.id, jobId: job.id, content: fallback, via: 'rule', notes: baseNotes },
          clock(),
        )
        return tailoringDto(created)
      }

      // 联系方式在交给模型之前先摘掉（隐私闸门之外的第二道；防御纵深）
      const sanitized = stripContacts(original)
      const result = await ai.call<{ content: ResumeContent; notes: string[] }>(
        {
          purpose: 'resume_tailor',
          instruction: [
            `把下面这份简历针对目标岗位「${job.title}」做**对齐改写**。`,
            '',
            '硬性约束（违反的整份结果会被丢弃）：',
            '1. **绝对不许编造**：不许新增任何一段工作经历、项目、学历；',
            '2. 不许新增原简历里没有的技术、工具、证书；',
            '3. 不许改动任何数字（年限、百分比、人数、金额）；',
            '4. 你只能做三件事：重排顺序、改写措辞、从原简历已有内容里挑出与该岗位最相关的部分；',
            '5. `basics.title` 可以改成目标岗位名。',
            '',
            `目标岗位：${job.title}`,
            job.tags.length === 0 ? '' : `岗位标签：${job.tags.join('、')}`,
          ]
            .filter((line) => line !== '')
            .join('\n'),
          payload: {
            jobTitle: job.title,
            companyName: job.companyName ?? '',
            tags: job.tags.join('、'),
            resumeName: record.name,
            resumeDirection: record.direction,
            /** 简历里的技能名先作为**白名单字段**发出去，方便模型判断哪些能用。 */
            knownSkills: original.skills.slice(0, 40).map((skill) => skill.name).join('、'),
          },
          allowFields: [
            'jobTitle',
            'companyName',
            'tags',
            'resumeName',
            'resumeDirection',
            'knownSkills',
          ],
          // 简历正文走 trusted：它是任务的一部分（可信），但会计入外发字段清单
          trusted: [{ label: 'resume', text: JSON.stringify(sanitized) }],
          untrusted: jdText === '' ? [] : [{ label: 'jd', text: jdText }],
          outputSpec:
            '只输出 JSON：{"content": <改写后的完整简历对象，结构与输入完全一致>, "notes": ["改了什么", ...]}。不要输出其它内容。',
          maxTokens: 4096,
          temperature: 0.3,
          ref: { kind: 'job', id: job.id },
        },
        {
          parse: (raw) => {
            const parsed = extractJson(raw)
            if (parsed === null || typeof parsed !== 'object') return undefined
            const content = (parsed as { content?: unknown }).content
            if (content === null || typeof content !== 'object') return undefined
            const notes = (parsed as { notes?: unknown }).notes
            return {
              content: normalizeResumeContent(content),
              notes: Array.isArray(notes)
                ? notes.filter((item): item is string => typeof item === 'string').slice(0, 10)
                : [],
            }
          },
          validate: (value) => {
            const check = checkNoFabrication(original, value.content, { allowTech: targetKeywords })
            return check.ok ? undefined : check.reasons.join('；')
          },
          fallback: () => ({ content: fallback, notes: baseNotes }),
        },
      )

      const via = result.via === 'llm' ? 'llm' : 'rule'
      /**
       * 说明文字有两个来源，**两个都要留**：
       *   * `result.value.notes` —— 模型自己写的"改了什么"（实测踩过：原来错取了 `result.notes`，
       *     那是**客户端层**的脱敏/降级说明，于是每条模型定制都被写成"模型没有说明改了什么"，
       *     等于对着用户说假话）；
       *   * `result.notes` —— 客户端层的事实（屏蔽了哪些字段、为什么降级）。
       * 退回规则兜底时，规则自己的 `baseNotes` 也必须留住，否则用户只看到"失败了"，
       * 不知道规则到底做了什么。
       */
      const modelNotes = result.via === 'llm' ? result.value.notes : []
      const notes = [
        ...(result.via === 'llm' ? modelNotes : baseNotes),
        ...result.notes,
      ]
      if (via === 'llm' && modelNotes.length === 0) notes.unshift('模型没有说明改了什么')
      const created = store.tailoring.create(
        {
          resumeId: record.id,
          jobId: job.id,
          content: result.value.content,
          via,
          notes: notes.slice(0, 12),
        },
        clock(),
      )
      deps.logger?.info(
        `[resume] 为岗位 #${String(job.id)} 生成了定制（${via}），采用与否待用户决定`,
      )
      return tailoringDto(created)
    },

    listTailorings(options): TailoringDto[] {
      return store.tailoring.list(options).map(tailoringDto)
    },

    adopt(tailoringId, adopted): TailoringDto {
      const updated = store.tailoring.adopt(tailoringId, adopted)
      if (updated === undefined) {
        throw new DomainError('NOT_FOUND', `定制记录不存在：${String(tailoringId)}`)
      }
      return tailoringDto(updated)
    },

    // ── 话术模板（v12 多赛道）：一份简历 = 一条赛道，开场套路跟着简历走 ──
    listGreetingTemplates(resumeId): GreetingTemplateDto[] {
      return store.pipeline.listTemplates({ resumeId }).map(toGreetingTemplateDto)
    },

    async generateGreetingTemplate({ resumeId, tone = 'formal' }): Promise<GreetingTemplateDto> {
      const record = requireResumeRecord(store, resumeId)
      assertTemplateQuota(store, record.id)

      const fallback = buildResumeGreetingTemplate(record.content, tone)
      const ai = deps.ai
      if (ai === undefined) {
        return upsertGreetingTemplate(store, record.id, fallback, 'rule', clock())
      }

      // 技术词白名单 = 这份简历里出现过的词（+ 极少数通用缩写）。
      // 模板提到简历之外的任何技术词都按编造处理 —— 与定制同一红线（R8）。
      const allowed = new Set([...techTokensOf(flattenResumeText(record.content)), 'hr', 'jd'])
      const result = await ai.call<{ name: string; body: string }>(
        {
          purpose: 'greeting_template',
          instruction: [
            '为这份简历写一条**打招呼开场模板**（发给 HR 的第一句话）。',
            `语气：${GREETING_TONE_LABEL[tone]}。`,
            '背景：平台（如 BOSS 直聘）点「立即沟通」时会先自动发一句默认招呼语，这段话术实际是**第二句** —— 要短、直给，不要完整自我介绍。',
            '硬性约束（违反整条结果作废）：',
            '1. 只许使用简历里的事实，不许新增任何经历、技能、年限、数字；',
            '2. 必须包含 {岗位} 与 {公司} 两个占位符（发送时替换成具体岗位），不要写具体公司名；',
            '3. 不许出现联系方式、链接、到岗时间承诺；',
            '4. 正文 30–200 字，一段话，不分点。',
          ].join('\n'),
          payload: {
            resumeName: record.name,
            resumeDirection: record.direction,
            tone: GREETING_TONE_LABEL[tone],
          },
          allowFields: ['resumeName', 'resumeDirection', 'tone'],
          // 简历正文走 trusted（任务的一部分），但先摘掉联系方式，且计入外发字段清单
          trusted: [{ label: 'resume', text: JSON.stringify(stripContacts(record.content)) }],
          outputSpec: '只输出 JSON：{"name":"模板名","body":"模板正文"}。不要输出其它内容。',
          maxTokens: 512,
          temperature: 0.6,
          ref: { kind: 'resume', id: record.id },
        },
        {
          parse: (raw) => {
            const parsed = extractJson(raw)
            if (parsed === null || typeof parsed !== 'object') return undefined
            const name = (parsed as { name?: unknown }).name
            const body = (parsed as { body?: unknown }).body
            if (typeof name !== 'string' || typeof body !== 'string') return undefined
            return { name: name.trim(), body: body.trim() }
          },
          validate: (value) => {
            if (value.name === '') return '模板名为空'
            return validateTemplateBody(allowed, value.body)
          },
          fallback: () => ({ name: fallback.name, body: fallback.body }),
        },
      )

      const via = result.via === 'llm' ? 'llm' : 'rule'
      if (via === 'rule') {
        deps.logger?.warn(`[resume] 简历 #${String(record.id)} 的话术模板退回规则兜底：${result.notes.join('；')}`)
      }
      return upsertGreetingTemplate(store, record.id, result.value, via, clock())
    },

    saveGreetingTemplate({ resumeId, id, name, body }): GreetingTemplateDto {
      const record = requireResumeRecord(store, resumeId)
      const trimmedName = name.trim().slice(0, MAX_GREETING_TEMPLATE_NAME)
      const trimmedBody = body.trim()
      if (trimmedName === '') {
        throw new DomainError('INVALID_INPUT', '模板名不能为空')
      }
      if (id === undefined) {
        assertTemplateQuota(store, record.id)
      } else {
        // 只能编辑属于这份简历的模板 —— 防止借这个接口改别家赛道的
        const existing = store.pipeline.listTemplates().find((item) => item.id === id)
        if (existing === undefined || existing.resumeId !== record.id) {
          throw new DomainError('NOT_FOUND', `模板不存在或不属于这版简历：${String(id)}`)
        }
      }
      const allowed = new Set([...techTokensOf(flattenResumeText(record.content)), 'hr', 'jd'])
      const issue = validateTemplateBody(allowed, trimmedBody)
      if (issue !== undefined) {
        throw new DomainError('INVALID_INPUT', `话术不合规：${issue}`, {
          hint: '开场话术不该带联系方式或链接；技术词只能来自这份简历 —— 这也是发送侧的同一条校验。',
        })
      }
      const saved = store.pipeline.upsertTemplate(
        {
          ...(id === undefined ? {} : { id }),
          name: trimmedName,
          body: trimmedBody,
          vars: templateVarsOf(trimmedBody),
          scene: 'resume-greeting',
          resumeId: record.id,
          via: 'manual',
        },
        clock(),
      )
      return toGreetingTemplateDto(saved)
    },

    removeGreetingTemplate(id): boolean {
      return store.pipeline.removeTemplate(id)
    },

    scoreStamp(): { resumeId: number | null; rev: number } {
      return store.resume.revision()
    },
  }
}

/** 从共享层借规则体检；单独包一层是为了让领域层不直接依赖 shared 的实现细节。 */
function inspectOf(content: ResumeContent): ResumeIssue[] {
  return inspectResumeLocal(content)
}

// 就地引入，避免与 shared/domain/resume-content.ts 形成循环（shared 不依赖 host）
import { inspectResume as inspectResumeLocal } from '../../shared/domain/resume-content.js'

/**
 * 规则定制（无模型路径，也是模型结果不合规时的兜底）。
 *
 * **它的正确性来自"什么都不加"**：只做重排、挑选、以及用原简历里已有的词写一句简介。
 * 这样它在结构上就不可能编造 —— 而一个"可能编造但更快"的兜底是没有意义的。
 */
export function ruleTailor(
  content: ResumeContent,
  job: { title: string; tags: string[]; jdText: string },
): { content: ResumeContent; notes: string[] } {
  const haystack = [job.title, job.tags.join(' '), job.jdText].join(' ').toLowerCase()
  const notes: string[] = []

  const score = (text: string): number => {
    let hits = 0
    for (const token of techTokensOf(text)) {
      if (haystack.includes(token)) hits += 1
    }
    return hits
  }

  // ① 技能：相关的排前面（稳定排序，保持原有相对顺序）
  const skills = [...content.skills]
    .map((skill, index) => ({ skill, index, weight: score(`${skill.name} ${skill.evidence ?? ''}`) }))
    .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
    .map((entry) => entry.skill)
  const movedSkills = skills.filter((skill, index) => skill.name !== content.skills[index]?.name).length
  if (movedSkills > 0) notes.push(`把与「${job.title}」相关的技能排到了前面（顺序变了，内容没变）`)

  // ② 经历：段内成果按相关度重排；**经历本身不增不减**
  let reorderedHighlights = 0
  const experiences = content.experiences.map((experience) => {
    const highlights = experience.highlights
      .map((text, index) => ({ text, index, weight: score(text) }))
      .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
      .map((entry) => entry.text)
    if (highlights.some((text, index) => text !== experience.highlights[index])) reorderedHighlights += 1
    return { ...experience, highlights }
  })
  if (reorderedHighlights > 0) notes.push(`重排了 ${String(reorderedHighlights)} 段经历里的成果顺序，突出与岗位相关的部分`)

  // ③ 项目：同样只重排
  const projects = content.projects.map((project) => ({
    ...project,
    highlights: [...project.highlights]
      .map((text, index) => ({ text, index, weight: score(text) }))
      .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
      .map((entry) => entry.text),
  }))

  // ④ 简介：只用**原简历里已有的**技能名与目标岗位名造句，不引入任何新事实
  const topSkills = skills.slice(0, 5).map((skill) => skill.name)
  const summary =
    content.summary.trim() === ''
      ? topSkills.length === 0
        ? `求职方向：${job.title}。`
        : `求职方向：${job.title}。熟悉 ${topSkills.join('、')}。`
      : content.summary

  if (content.summary.trim() === '') notes.push('原简历没有个人简介，按已有技能自动补了一句（没有新增事实）')

  return {
    content: {
      ...content,
      // 瞄准目标岗位：这是定制唯一允许改的"基础信息"
      basics: { ...content.basics, title: job.title === '' ? content.basics.title : job.title },
      summary,
      skills,
      experiences,
      projects,
    },
    notes,
  }
}

// ── 话术模板（v12）：纯函数与共用校验 ────────────────────────────────

function toGreetingTemplateDto(record: GreetingTemplateRecord): GreetingTemplateDto {
  return {
    id: record.id,
    resumeId: record.resumeId,
    name: record.name,
    body: record.body,
    vars: record.vars,
    via: record.via,
    uses: record.uses,
    replies: record.replies,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function requireResumeRecord(store: Store, resumeId: number): ResumeRecord {
  if (!Number.isInteger(resumeId) || resumeId <= 0) {
    throw new DomainError('INVALID_INPUT', `简历 id 不合法：${String(resumeId)}`)
  }
  const record = store.resume.get(resumeId)
  if (record === undefined) {
    throw new DomainError('NOT_FOUND', `简历不存在：${String(resumeId)}`, { hint: '它可能已被删除。' })
  }
  return record
}

function assertTemplateQuota(store: Store, resumeId: number): void {
  const count = store.pipeline.listTemplates({ resumeId }).length
  if (count >= MAX_RESUME_GREETING_TEMPLATES) {
    throw new DomainError(
      'INVALID_INPUT',
      `这版简历的话术模板已有 ${String(count)} 条（上限 ${String(MAX_RESUME_GREETING_TEMPLATES)} 条）`,
      { hint: '每个方向留几条不同语气的开场就够 —— 先删掉不用的，或编辑现有的。' },
    )
  }
}

function upsertGreetingTemplate(
  store: Store,
  resumeId: number,
  seed: { name: string; body: string },
  via: 'llm' | 'rule',
  now: string,
): GreetingTemplateDto {
  const body = seed.body.trim().slice(0, GREETING_MAX_CHARS)
  const created = store.pipeline.upsertTemplate(
    {
      name: seed.name.trim().slice(0, MAX_GREETING_TEMPLATE_NAME) || '未命名开场',
      body,
      vars: templateVarsOf(body),
      scene: 'resume-greeting',
      resumeId,
      via,
    },
    now,
  )
  return toGreetingTemplateDto(created)
}

/** 从正文里提取 `{占位符}` 名列表（去重保序）。 */
export function templateVarsOf(body: string): string[] {
  return [...new Set([...body.matchAll(/\{([^{}\s]{1,12})\}/g)].map((match) => match[1] as string))]
}

/**
 * 模板正文校验：占位符、联系方式/长度（复用发送侧同一条 `validateGreetingText`）、
 * 技术词白名单（简历没有的技术词 = 编造，R8 红线）。
 */
export function validateTemplateBody(allowed: Set<string>, body: string): string | undefined {
  if (!body.includes('{岗位}')) {
    return '模板里必须有 {岗位} 占位符（发送时替换成具体岗位名）'
  }
  // 占位符替换掉再校验 —— {岗位}/{公司} 本身不该被当成待判断的正文
  const issue = validateGreetingText(body.replace(/\{[^{}]+\}/g, '岗位'))
  if (issue !== undefined) return issue
  for (const token of techTokensOf(body)) {
    if (!allowed.has(token)) return `模板里出现了简历里没有的技术词「${token}」`
  }
  return undefined
}

export interface ResumeGreetingSeed {
  name: string
  body: string
}

/**
 * 规则兜底模板：只用简历里**已抓到的事实**造句（方向 / 年限 / 前三技能 /
 * 第一条成果），含 {岗位} {公司} 占位符 —— 它的正确性与 `ruleTailor` 同源：
 * "什么都不加"在结构上就不可能编造。
 */
export function buildResumeGreetingTemplate(content: ResumeContent, tone: GreetingTone): ResumeGreetingSeed {
  const title = content.basics.title === '' ? '这个方向' : content.basics.title
  const years =
    typeof content.basics.years === 'number' && content.basics.years > 0 ? `（${String(content.basics.years)} 年经验）` : ''
  const skills = content.skills.slice(0, 3).map((skill) => skill.name.trim()).filter((name) => name !== '')
  const proof = (content.experiences[0]?.highlights[0] ?? content.projects[0]?.highlights[0] ?? '').trim()
  const skillText = skills.length > 0 ? `，主要做 ${skills.join('、')}` : ''
  const proofText = proof === '' || tone === 'concise' ? '' : `（${proof}）`
  const opener = tone === 'warm' ? '您好！' : '您好，'
  const intent = tone === 'concise' ? '期待和您交流，谢谢。' : '方便的话想和您聊聊这个岗位的细节，谢谢！'

  const body = `${opener}看到{公司}在招{岗位}，很感兴趣。我是${title}${years}${skillText}${proofText}。${intent}`
  return {
    name: `${GREETING_TONE_LABEL[tone]}开场 · ${title}`.slice(0, MAX_GREETING_TEMPLATE_NAME),
    body: body.length > GREETING_MAX_CHARS ? body.slice(0, GREETING_MAX_CHARS) : body,
  }
}

/**
 * 摘掉联系方式。
 *
 * 模型不需要知道用户的手机号与邮箱就能做对齐改写 —— 而这两样一旦发出去就收不回来。
 * 隐私闸门（`ai/privacy.ts`）也会兜一层，但那是"万一漏了"的第二道，不是第一道。
 */
export function stripContacts(content: ResumeContent): ResumeContent {
  const { phone: _phone, email: _email, ...rest } = content.basics
  return { ...content, basics: rest }
}

// ─────────────────────────────────────────────────────────────────────
// 导入解析的核对（A3）与附件上传的校验（R9）
// ─────────────────────────────────────────────────────────────────────

/**
 * 解析结果的**核对提示**：模型写出来的技术词与数字，原文里找不到的列出来。
 *
 * ## 为什么是"提示"而不是"拒绝"
 *
 * `resume_tailor` 那边（模型**改**用户的简历）对不上就是编造，必须整份退回。
 * 这里不同：原文就是用户自己的内容，"原文里没有"只可能是**解析错**
 * （把"2023.06"写成"2023-06-01"、把"React.js"写成"React"这类也算），
 * 而整份拒绝的代价是用户白粘一次、什么都拿不到 —— 那比让他核对一下更糟。
 *
 * 所以这里只做一件事：**把可疑处指出来**，让用户在保存前看一眼。
 * 绝不因为这条提示改动解析结果本身。
 *
 * ## 为什么不能用 `JSON.stringify(content)` 当候选文本
 *
 * 技术词抽取认的是**任何拉丁词**（`collectTech` 的实现如此，因为技术词没有封闭词表）。
 * 拿 JSON 字符串去抽，会把 `basics` / `name` / `title` / `skills` 这些**键名**
 * 一起当成"原文里没找到的技术词" —— 于是每一条导入都拖着六七个假警报，
 * 用户很快就会学会无视这个提示，那时它等于不存在。
 * 所以这里只摊平**叶子值**（不含键名），并且把数字字段也带上
 * （`flattenResumeText` 不含 `basics.years` 这类纯数值字段，而"年限被改大"正是最该被核对的一种）。
 */
function ungroundedNotes(content: ResumeContent, source: string): string[] {
  const haystack = source.toLowerCase()
  const candidate = leafValues(content).join('\n')
  const unknown: string[] = []
  for (const token of techTokensOf(candidate)) {
    if (!haystack.includes(token.toLowerCase())) unknown.push(token)
  }
  const numbers = new Set(candidate.match(/\d+(?:\.\d+)?/g) ?? [])
  const unknownNumbers = [...numbers].filter((value) => !source.includes(value))
  const notes: string[] = []
  if (unknown.length > 0) {
    notes.push(`这些技术词在原文里没找到，请核对是不是解析错了：${unknown.slice(0, 8).join('、')}`)
  }
  if (unknownNumbers.length > 0) {
    notes.push(`这些数字在原文里没找到，请核对：${unknownNumbers.slice(0, 8).join('、')}`)
  }
  return notes
}

/** 递归摊平一个结构里的**叶子值**（字符串与数字），刻意丢掉键名。 */
function leafValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => leafValues(item))
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => leafValues(item))
  }
  return []
}

/** 上传允许的格式。刻意没有 `doc`（见 `parseUploadFormat` 的说明）。 */
const UPLOAD_FORMATS = ['pdf', 'docx'] as const
type UploadFormat = (typeof UPLOAD_FORMATS)[number]

/**
 * 落盘用的文件名：**只保留 ASCII**。显示名不受影响。
 *
 * ## 为什么必须这样（实测，不是洁癖）
 *
 * Windows + Node 24 下 `rmSync` 一个**含中文**的文件名会直接把进程打崩
 * （`0xC0000409`，native crash —— JS 侧的 `try/catch` 根本进不去）。
 * 而附件目录里的文件天然是"张三-前端-5年.pdf"这种名字，于是两条路径都会中招：
 *   * `removeFile`（用户删附件）→ 宿主进程当场消失；
 *   * 任何对数据目录的递归删除（含清理/临时目录）→ 同样中招。
 *
 * 中文名一个字都不会丢：**显示名存在 `resume_file.file_name`（数据库）里**，
 * 下载与投递归因用的都是它（见 `readFile` 与 `ResumeFileDto`）。
 * 磁盘上的名字只是内部寻址，没有任何人读它的语义。
 *
 * 太短的 ASCII 残片（"张三-前端-5年" → "5"）比没有还难认，所以短于 3 个字符时退回 `resume`；
 * 目录里有 `resume-<id>`、名字里有时间戳，唯一性不靠它。
 */
function storedNameOf(displayName: string, format: string): string {
  const withoutExt = sanitizeFileName(displayName).replace(/\.[A-Za-z0-9]+$/, '')
  const ascii = withoutExt
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return `${ascii.length >= 3 ? ascii : 'resume'}.${format}`
}

function parseUploadFormat(fileName: string, declared?: string): UploadFormat {
  const fromName = fileName.trim().toLowerCase().split('.').pop() ?? ''
  const explicit = (declared ?? '').trim().toLowerCase()
  const candidate = explicit !== '' ? explicit : fromName
  if ((UPLOAD_FORMATS as readonly string[]).includes(candidate)) return candidate as UploadFormat
  // `.doc` 是 OLE 复合文档（与 docx 的 zip 完全不同的字节结构），要单独解析；
  // 而招聘站都收 docx —— 与其猜，不如给出可执行的下一步
  throw new DomainError('INVALID_INPUT', `不支持的附件格式：${candidate || '（没有扩展名）'}`, {
    hint:
      '只收 PDF 与 DOCX。老版 .doc 请先用 Word 另存为 .docx；' +
      '扫描件（图片型 PDF）也请先转成可复制的文本 PDF —— 图片在这里读不出内容。',
  })
}

/** 严格解 base64：`Buffer.from(x,'base64')` 会**静默跳过**非法字符，那会让坏数据变成空文件。 */
function decodeBase64(raw: string): Uint8Array {
  const cleaned = raw.replace(/\s+/g, '')
  if (cleaned === '') {
    throw new DomainError('INVALID_INPUT', 'contentBase64 是空的', {
      hint: '把文件读成 base64 放在这个字段里（不需要 data: 前缀）。',
    })
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new DomainError('INVALID_INPUT', 'contentBase64 不是合法的 base64', {
      hint: '常见原因：带上了 data:...;base64, 前缀，或用了 URL-safe 的 - _ 字符。请传纯 base64。',
    })
  }
  const bytes = Buffer.from(cleaned, 'base64')
  if (bytes.byteLength === 0) {
    throw new DomainError('INVALID_INPUT', 'contentBase64 解出来是空文件')
  }
  return new Uint8Array(bytes)
}

/**
 * 文件头校验：内容必须**真的是**它声明的那种文件。
 *
 * 为什么值得做：附件最终要发给 HR，而"改个扩展名"是最常见的误操作。
 * 只靠扩展名会把这个错误一路带到投递那一刻才炸 —— 那时已经发出去了。
 */
function assertAttachmentKind(format: UploadFormat, bytes: Uint8Array): void {
  const startsWith = (signature: readonly number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte)
  const ok = format === 'pdf' ? startsWith([0x25, 0x50, 0x44, 0x46]) : startsWith([0x50, 0x4b, 0x03, 0x04])
  if (!ok) {
    throw new DomainError('INVALID_INPUT', `文件内容不像 ${format.toUpperCase()}（文件头不对）`, {
      hint:
        format === 'pdf'
          ? 'PDF 的文件头是 %PDF。这个文件可能是别的格式，或者上传时被改过扩展名。'
          : 'DOCX 是 zip 容器（PK 开头）。老版 .doc 不是，请先另存为 .docx。',
    })
  }
}

/** 字节数的人话（错误提示里比 "5242880" 好读）。 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${String(bytes)} 字节`
}

export { emptyResumeContent, isoNow }
