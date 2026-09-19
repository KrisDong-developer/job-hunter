/**
 * 简历工具：列表 / 读取 / 新建修改 / 岗位定制 / 导出附件。
 *
 * 分工：查询是**低危**（只读）；保存/定制/导出是**中危** —— 模型发起时会走审批
 * （`needsApproval` 对 model+mid 返回 true）。
 * 更要紧的是 `resume_tailor`：它会把简历正文发给模型，所以那条路径上
 * 用途开关（默认关）+ 隐私闸门 + 防编造检查三样缺一不可。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js'
import { RESUME_FORMATS, RESUME_LANGUAGES, RESUME_TEMPLATES } from '../../shared/contract/enums/resume.js'
import { RESUME_LANGUAGE_LABEL } from '../../shared/contract/enums/resume.js'
import { normalizeResumeContent } from '../../shared/domain/resume-content.js'
import type { HostRuntime } from '../runtime.js'
import { DomainError } from '../util/errors.js'
import {
  asString,
  enumStr,
  int,
  positiveId,
  requireData,
  schema,
  str,
  textResult,
  toolDefiner,
} from './kit.js'

export function resumesTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_list',
      description: '列出简历版本（方向、语言、启用状态、填写完整度、体检问题数）。低危，只读。',
      parameters: schema({}),
      ...textResult,
      async run() {
        requireData(runtime)
        const items = runtime.resumes().list()
        if (items.length === 0) {
          return { text: '还没有任何简历版本。用 resume_save 建一版，或到「简历中心」里填。' }
        }
        const lines = [`共 ${String(items.length)} 版简历：`]
        for (const item of items) {
          lines.push(
            `#${String(item.id)} ${item.name}` +
              `${item.isDefault ? '（当前启用）' : ''}｜${item.direction || '未填方向'}｜` +
              `${RESUME_LANGUAGE_LABEL[item.language]}｜rev ${String(item.rev)}`,
          )
          lines.push(
            `  技能 ${String(item.counts.skills)} · 经历 ${String(item.counts.experiences)} · ` +
              `项目 ${String(item.counts.projects)} · 教育 ${String(item.counts.education)} · ` +
              `附件 ${String(item.counts.files)}` +
              `${item.issues === 0 ? '' : `｜体检 ${String(item.issues)} 项待改`}`,
          )
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<{ resumeId: number }, { text: string }>({
      name: 'resume_get',
      description: '读某一版简历的完整结构化内容 + 体检问题。低危，只读。',
      parameters: schema({ resumeId: int('简历 id（resume_list 里的 #数字）') }, ['resumeId']),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const id = positiveId(args.resumeId, 'resumeId')
        const service = runtime.resumes()
        const resume = service.get(id)
        const issues = service.inspect(id)
        const c = resume.content
        const lines = [
          `#${String(resume.id)} ${resume.name}（rev ${String(resume.rev)}，${RESUME_LANGUAGE_LABEL[resume.language]}）`,
          `姓名：${c.basics.name || '（未填）'}｜目标：${c.basics.title || '（未填）'}`,
          `城市：${c.basics.city ?? '（未填）'}｜年限：${c.basics.years === undefined ? '（未填）' : `${String(c.basics.years)} 年`}`,
          `简介：${c.summary === '' ? '（未填）' : c.summary.slice(0, 120)}`,
          `技能（${String(c.skills.length)}）：${c.skills.slice(0, 20).map((s) => s.name).join('、') || '（空）'}`,
        ]
        for (const experience of c.experiences.slice(0, 5)) {
          lines.push(
            `经历：${experience.company}｜${experience.title}｜${experience.start ?? '?'}–${experience.end ?? '至今'}` +
              `（${String(experience.highlights.length)} 条成果）`,
          )
        }
        for (const project of c.projects.slice(0, 5)) {
          lines.push(`项目：${project.name}（${String(project.highlights.length)} 条）`)
        }
        for (const education of c.education) {
          lines.push(`教育：${education.school}｜${education.major ?? ''}｜${education.degree ?? ''}`)
        }
        lines.push('', '体检：')
        if (issues.length === 0) {
          lines.push('· 规则体检没有发现问题')
        } else {
          for (const issue of issues.slice(0, 8)) {
            lines.push(`· [${issue.level === 'error' ? '必改' : '建议'}] ${issue.message}`)
          }
        }
        if (resume.files.length > 0) {
          lines.push(
            '',
            `已有附件：${resume.files.map((file) => `${file.format}（${String(file.bytes)} 字节）`).join('、')}`,
          )
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_save',
      description:
        '新建或修改一版简历。**中危**：模型发起时需要用户审批（简历是用户资产，不该被悄悄改）。' +
        '不传 resumeId 就是新建。',
      parameters: schema({
        resumeId: int('要修改的简历 id；不传则新建'),
        name: str('版本名，如「Java 后端 · 2026 春」'),
        direction: str('岗位方向'),
        language: enumStr(RESUME_LANGUAGES, '简历语言'),
        content: { type: 'object', description: '完整简历内容对象（结构与 resume_get 返回的一致）' },
        isDefault: { type: 'boolean', description: '是否设为当前启用版本' },
      }),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const resumeId = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const content = args['content']
        if (content === undefined || content === null || typeof content !== 'object') {
          throw new DomainError('INVALID_INPUT', 'content 必须是完整的简历对象', {
            hint: '先用 resume_get 读一份现有简历当模板，再整体改。不接受局部合并。',
          })
        }
        const patch = {
          content: normalizeResumeContent(content),
          ...(asString(args['name']) === undefined ? {} : { name: asString(args['name']) as string }),
          ...(asString(args['direction']) === undefined
            ? {}
            : { direction: asString(args['direction']) as string }),
          ...(typeof args['isDefault'] === 'boolean' ? { isDefault: args['isDefault'] } : {}),
        }

        return await runtime.guard().run(
          {
            action: 'resume.save',
            actor: 'model',
            danger: 'mid',
            payload: {
              resumeId: resumeId ?? null,
              name: patch.name ?? '(沿用原版本名)',
              mode: resumeId === undefined ? '新建' : '修改',
              // 审计里只留摘要：正文不进审计表（§4.1）
              contentBytes: JSON.stringify(patch.content).length,
              skills: patch.content.skills.length,
              experiences: patch.content.experiences.length,
            },
          },
          async () => {
            const service = runtime.resumes()
            const resume =
              resumeId === undefined
                ? service.create({
                    name: patch.name ?? patch.content.basics.title ?? '新简历',
                    ...(patch.direction === undefined ? {} : { direction: patch.direction }),
                    ...(typeof args['language'] === 'string' ? { language: args['language'] as never } : {}),
                    content: patch.content,
                    ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
                  })
                : service.update(resumeId, patch)
            runtime.events().publish('resume.updated', { id: resume.id, rev: resume.rev })
            return {
              text:
                `${resumeId === undefined ? '已新建' : '已更新'}简历 #${String(resume.id)}「${resume.name}」` +
                `（rev ${String(resume.rev)}）。\n` +
                '注意：简历改了之后，**之前算过的匹配分全部标记为过期** —— ' +
                '用 job_match_explain 重算才是新简历下的分数。',
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_tailor',
      description:
        '针对某个岗位生成简历定制建议（**只产出建议，不改你手上的简历**）。**中危**，模型发起时需要审批。' +
        '简历正文会发给模型，所以受「简历定制」用途开关与隐私闸门约束；结果一律过防编造检查。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('目标岗位 id'),
          resumeId: int('用哪一版简历；不传用当前启用版本'),
          useLlm: { type: 'boolean', description: '是否允许调用模型（false = 只用规则）' },
        },
        ['jobId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const jobId = positiveId(args.jobId, 'jobId')
        const resumeId = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const useLlm = typeof args['useLlm'] === 'boolean' ? args['useLlm'] : undefined

        return await runtime.guard().run(
          {
            action: 'resume.tailor',
            actor: 'model',
            danger: 'mid',
            target: { jobId },
            payload: {
              jobId,
              resumeId: resumeId ?? null,
              useLlm: useLlm ?? true,
              note: '会把简历正文发给模型做对齐改写（不含联系方式）。',
            },
          },
          async () => {
            const tailoring = await runtime.resumes().tailor({
              jobId,
              ...(resumeId === undefined ? {} : { resumeId }),
              ...(useLlm === undefined ? {} : { useLlm }),
            })
            const matched = tailoring.content.skills.slice(0, 8).map((skill) => skill.name).join('、')
            return {
              text: [
                `已为岗位 #${String(jobId)}「${tailoring.jobTitle ?? ''}」生成定制建议 #${String(tailoring.id)}` +
                  `（来源：${tailoring.via === 'llm' ? '模型' : '规则'}）`,
                tailoring.notes.length === 0 ? '' : `改动说明：${tailoring.notes.join('；')}`,
                matched === '' ? '' : `调整后的技能顺序：${matched}`,
                '',
                '**这只是建议，你的简历没有被改动。** 要采用的话到「岗位详情 → 简历定制」里逐条确认。',
              ]
                .filter((line) => line !== '')
                .join('\n'),
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_export',
      description:
        '把某一版简历导出成附件（pdf / docx / html）。**中危**，模型发起时需要审批。' +
        'PDF 走独立的无头 Chromium 渲染；docx 是真正的 OOXML 文件。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema({
        resumeId: int('简历 id；不传用当前启用版本'),
        format: enumStr(RESUME_FORMATS, '导出格式'),
        template: enumStr(RESUME_TEMPLATES, '排版模板'),
      }),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const format = asString(args['format']) ?? 'pdf'
        const template = asString(args['template']) ?? 'concise'
        const explicit = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const target =
          explicit ?? runtime.resumes().list().find((item) => item.isDefault)?.id ?? runtime.resumes().list()[0]?.id
        if (target === undefined) {
          throw new DomainError('NOT_FOUND', '还没有任何简历版本可以导出', {
            hint: '先用 resume_save 建一版。',
          })
        }

        return await runtime.guard().run(
          {
            action: 'resume.export',
            actor: 'model',
            danger: 'mid',
            payload: { resumeId: target, format, template },
          },
          async () => {
            const file = await runtime.resumes().exportResume(target, {
              format: format as never,
              template: template as never,
            })
            runtime.events().publish('resume.exported', {
              resumeId: target,
              fileId: file.id,
              format: file.format,
              bytes: file.bytes,
            })
            return {
              text:
                `已导出简历 #${String(target)} 的 ${file.format} 附件：${file.fileName}` +
                `（${String(file.bytes)} 字节，附件 #${String(file.id)}）。\n` +
                '在「简历中心」里可以预览或下载。',
            }
          },
        )
      },
    }),
    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_import',
      description:
        '把**粘贴进来的简历正文**解析成一版新简历（A3），或把用户**自己的** PDF/DOCX 存成某版简历的附件（R9）。' +
        '**中危**：模型发起时需要审批。' +
        '⚠️ 解析只吃文本 —— 本工具**不解析 PDF/DOCX 字节**（没有解析库，硬做只会把脏数据写进简历库）：' +
        'PDF 里的文字要用户自己复制出来。解析会把简历文本发给模型，受「简历导入解析」用途开关与隐私闸门约束（默认关）。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          action: enumStr(['parse', 'upload'], 'parse = 粘贴文本解析；upload = 上传自有附件'),
          text: str('parse 必填：从 PDF/Word 复制出来的简历正文'),
          name: str('新简历的版本名；不填取解析出来的目标岗位'),
          direction: str('岗位方向'),
          language: enumStr(RESUME_LANGUAGES, '简历语言'),
          save: { type: 'boolean', description: 'parse 时是否直接存成一版新简历（默认 true）；false = 只看解析结果' },
          useLlm: { type: 'boolean', description: 'parse 时是否允许调用模型（false = 只做兜底保留原文）' },
          resumeId: int('upload 必填：挂到哪一版简历下'),
          fileName: str('upload 必填：文件名（HR 那一侧看到的就是它）'),
          contentBase64: str('upload 必填：文件内容的纯 base64（不带 data: 前缀）'),
          format: str('upload 可选：pdf / docx（不传则按文件名后缀判断）'),
        },
        ['action'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action']) ?? 'parse'
        const service = runtime.resumes()

        if (action === 'upload') {
          const resumeId = positiveId(args['resumeId'], 'resumeId')
          const fileName = asString(args['fileName'])
          const contentBase64 = asString(args['contentBase64'])
          if (fileName === undefined || contentBase64 === undefined) {
            throw new DomainError('INVALID_INPUT', 'upload 需要 resumeId、fileName 与 contentBase64', {
              hint:
                'contentBase64 是**用户自己的**文件内容。模型手上没有文件时，' +
                '应当让用户自己在界面上传（这条入口是给"手上确实有字节"的场景用的）。',
            })
          }
          const format = asString(args['format'])
          return await runtime.guard().run(
            {
              action: 'resume.upload',
              actor: 'model',
              danger: 'mid',
              payload: { resumeId, fileName, base64Bytes: contentBase64.length },
            },
            async () => {
              const file = service.uploadFile(resumeId, {
                fileName,
                contentBase64,
                ...(format === undefined ? {} : { format }),
              })
              runtime.events().publish('resume.file.uploaded', {
                resumeId,
                fileId: file.id,
                format: file.format,
                bytes: file.bytes,
              })
              return {
                text:
                  `已把「${file.fileName}」存成简历 #${String(resumeId)} 的附件` +
                  `（${file.format}，${String(file.bytes)} 字节，附件 #${String(file.id)}）。\n` +
                  '注意：选它投递时，平台侧用的仍是平台内那份简历 —— 这个附件的用处是**记录这次投的是哪一版**（归因）。',
              }
            },
          )
        }

        const text = asString(args['text'])
        if (text === undefined) {
          throw new DomainError('INVALID_INPUT', 'parse 需要 text（把简历正文粘贴进来）', {
            hint: '从 PDF / Word 里选中正文复制。本工具不解析 PDF 字节。',
          })
        }
        const direction = asString(args['direction'])
        const language = asString(args['language'])
        const name = asString(args['name'])
        return await runtime.guard().run(
          {
            action: 'resume.import',
            actor: 'model',
            danger: 'mid',
            payload: { chars: text.length, save: args['save'] !== false, direction: direction ?? null },
          },
          async () => {
            const result = await service.importResume({
              text,
              ...(name === undefined ? {} : { name }),
              ...(direction === undefined ? {} : { direction }),
              ...(language === undefined ? {} : { language: language as never }),
              ...(typeof args['save'] === 'boolean' ? { save: args['save'] } : {}),
              ...(typeof args['useLlm'] === 'boolean' ? { useLlm: args['useLlm'] } : {}),
            })
            if (result.resume !== null) {
              runtime.events().publish('resume.imported', {
                id: result.resume.id,
                via: result.via,
                issues: result.issues.length,
              })
            }
            const counts = result.content
            const lines = [
              result.resume === null
                ? `已解析但**没有落库**（save=false）：姓名「${counts.basics.name || '未解析出'}」，` +
                  `技能 ${String(counts.skills.length)} 项、经历 ${String(counts.experiences.length)} 段、` +
                  `项目 ${String(counts.projects.length)} 个。`
                : `已导入简历 #${String(result.resume.id)}「${result.resume.name}」` +
                  `（${result.via === 'llm' ? '模型解析' : '未解析，原文已保留'}）：` +
                  `技能 ${String(counts.skills.length)} 项、经历 ${String(counts.experiences.length)} 段、` +
                  `项目 ${String(counts.projects.length)} 个。`,
              result.notes.length === 0 ? '' : `说明：${result.notes.join('；')}`,
              result.issues.length === 0
                ? '体检没有发现问题。'
                : `体检 ${String(result.issues.length)} 项待改：${result.issues
                    .slice(0, 5)
                    .map((issue) => issue.message)
                    .join('；')}`,
            ]
            return { text: lines.filter((line) => line !== '').join('\n') }
          },
        )
      },
    }),
  ]
}
