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
import type { ResumeFormat, ResumeLanguage, ResumeState, ResumeTemplate } from '../../shared/enums.js'
import { RESUME_FORMATS, RESUME_TEMPLATES } from '../../shared/enums.js'
import type {
  ResumeContent,
  ResumeDto,
  ResumeFileDto,
  ResumeIssue,
  ResumeSummaryDto,
  TailoringDto,
} from '../../shared/resume.js'
import {
  checkNoFabrication,
  emptyResumeContent,
  isResumeContentUsable,
  normalizeResumeContent,
  resumeFileName,
  techTokensOf,
} from '../../shared/resume.js'
import type { AiService } from '../ai/client.js'
import { extractJson } from '../ai/prompts.js'
import { renderResumeDocx } from '../render/docx.js'
import { renderResumeHtml } from '../render/resume-html.js'
import type { Store } from '../store/store.js'
import { toResumeDto, type ResumeRecord } from '../store/repo/resumes.js'
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
  /** 读回已生成的文件（下载路由用）。 */
  readFile(fileId: number): { fileName: string; format: string; bytes: Uint8Array } | undefined
  removeFile(fileId: number): boolean

  tailor(input: { jobId: number; resumeId?: number; useLlm?: boolean }): Promise<TailoringDto>
  listTailorings(options: { resumeId?: number; jobId?: number; limit?: number }): TailoringDto[]
  adopt(tailoringId: number, adopted: boolean): TailoringDto
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

export function createResumeService(deps: ResumeServiceDeps): ResumeService {
  const { store } = deps
  const clock = deps.clock ?? systemClock
  const filesDir = deps.filesDir

  const toDto = (record: ResumeRecord): ResumeDto =>
    toResumeDto(
      record,
      store.resume.listFiles(record.id).map((file) => ({
        id: file.id,
        format: file.format,
        fileName: file.fileName,
        bytes: file.bytes,
        createdAt: file.createdAt,
      })),
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
      const fileName = resumeFileName(record.content, extension)
      // 文件名带时间戳，避免同一秒内两次导出互相覆盖
      const stored = `${clock().replace(/[:.]/g, '-')}-${fileName}`
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
      return {
        id: file.id,
        format: file.format,
        fileName: file.fileName,
        bytes: file.bytes,
        createdAt: file.createdAt,
      }
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

    scoreStamp(): { resumeId: number | null; rev: number } {
      return store.resume.revision()
    },
  }
}

/** 从共享层借规则体检；单独包一层是为了让领域层不直接依赖 shared 的实现细节。 */
function inspectOf(content: ResumeContent): ResumeIssue[] {
  return inspectResumeLocal(content)
}

// 就地引入，避免与 shared/resume.ts 形成循环（shared 不依赖 host）
import { inspectResume as inspectResumeLocal } from '../../shared/resume.js'

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

export { emptyResumeContent, isoNow }
