/**
 * 海外/远程工具：工签立场识别、按立场/模式筛选、面试时间双时区显示、英文简历体检、Cover Letter。
 *
 * 两条边界写在工具描述里、也写在返回文案里：
 *   · 英文体检**只检查，不翻译** —— 机翻简历是海外求职最致命的错误；
 *   · filter 的结果**只包含识别过的岗位**，"没识别"不等于"不符合"。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js'
import { COVER_LETTER_LANGUAGES, REMOTE_KINDS, REMOTE_KIND_LABEL, VISA_STANCES, VISA_STANCE_LABEL, type CoverLetterLanguage, type RemoteKind, type VisaStance } from '../../shared/contract/enums/overseas.js'
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
  toInt,
  toolDefiner,
} from './kit.js'

export function overseasTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'overseas_check',
      description:
        '海外/远程支线：识别岗位的**工签/Sponsorship 立场**与工作模式，做**时区双重换算**，' +
        '并给英文简历做体检（**只检查，不翻译**）。低危，只读（识别结果会落库）。',
      parameters: schema(
        {
          action: enumStr(['analyze', 'visa', 'filter', 'timezone', 'english-check'], '要做的操作'),
          jobId: int('岗位 id'),
          resumeId: int('简历 id（english-check 用）'),
          at: str('面试时间（ISO，timezone 用）'),
          tz: str('对方时区（如 America/New_York，timezone 用）'),
          stance: enumStr(VISA_STANCES, '按工签立场筛选'),
          remote: enumStr(REMOTE_KINDS, '按工作模式筛选'),
        },
        ['action'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const service = runtime.overseas()
        const action = asString(args['action'])

        if (action === 'analyze') {
          const jobId = positiveId(args.jobId, 'jobId')
          const result = service.analyzeJob(jobId)
          return {
            text: [
              `岗位 #${String(jobId)} 的海外属性：`,
              `· 工签立场：${VISA_STANCE_LABEL[result.stance]}` +
                `${result.evidence.length === 0 ? '' : `（依据：${result.evidence.join('、')}）`}`,
              `· 工作模式：${REMOTE_KIND_LABEL[result.remoteKind]}`,
              `· 校招批次：${result.campusBatch === null ? '未识别' : result.campusBatch}`,
              result.uncertainty === null ? '' : `\n注意：${result.uncertainty}`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          }
        }

        if (action === 'visa') {
          const jobId = positiveId(args.jobId, 'jobId')
          const visa = service.getVisa(jobId)
          return {
            text:
              `岗位 #${String(jobId)}：${VISA_STANCE_LABEL[visa.stance]}` +
              `${visa.identityLimit === null ? '' : `（身份限制：${visa.identityLimit}）`}` +
              `${visa.evidence.length === 0 ? '' : `\n依据：${visa.evidence.join('、')}`}` +
              `${visa.uncertainty === null ? '' : `\n注意：${visa.uncertainty}`}`,
          }
        }

        if (action === 'filter') {
          const stance = asString(args['stance'])
          const remote = asString(args['remote'])
          if (stance !== undefined && !(VISA_STANCES as readonly string[]).includes(stance)) {
            throw new DomainError('INVALID_INPUT', `不支持的工签立场：${stance}`, {
              hint: `合法取值：${VISA_STANCES.join(' / ')}`,
            })
          }
          const items = service.filterJobs({
            ...(stance === undefined ? {} : { stance: stance as VisaStance }),
            ...(remote === undefined ? {} : { remoteKind: remote as RemoteKind }),
          })
          if (items.length === 0) {
            return {
              text:
                '没有匹配的岗位。注意：**没有识别过的岗位不会出现在这里** —— ' +
                '先用 action=analyze 识别一下，别把"没识别"当成"不符合"。',
            }
          }
          return {
            text: [
              `匹配 ${String(items.length)} 个岗位：`,
              ...items.slice(0, 20).map(
                (item) =>
                  `#${String(item.jobId)} ${item.title}｜${item.companyName ?? ''}｜` +
                  `工签 ${item.stance === null ? '未识别' : VISA_STANCE_LABEL[item.stance]}｜` +
                  `${item.remoteKind === null ? '模式未识别' : REMOTE_KIND_LABEL[item.remoteKind]}`,
              ),
            ].join('\n'),
          }
        }

        if (action === 'timezone') {
          const at = asString(args['at'])
          const tz = asString(args['tz'])
          if (at === undefined || tz === undefined) {
            throw new DomainError('INVALID_INPUT', 'timezone 需要 at 与 tz')
          }
          const display = service.displayInterviewTime(at, tz)
          return {
            text: [
              `面试时间（同一时刻，两个时区都显示）：`,
              `· 对方（${display.counterpart.tz}）：${display.counterpart.text}`,
              `· 本地（${display.local.tz}）：${display.local.text}`,
              `· 时差：${String(display.diffHours)} 小时`,
              display.warning === null ? '' : `\n⚠ ${display.warning}`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          }
        }

        // english-check
        const resumeId = toInt(args.resumeId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (resumeId === 0) throw new DomainError('INVALID_INPUT', 'english-check 需要 resumeId')
        const issues = service.inspectEnglish(resumeId)
        return {
          text: [
            issues.length === 0 ? '英文简历体检没有发现问题。' : `英文简历体检发现 ${String(issues.length)} 项：`,
            ...issues.map((issue) => `· [${issue.level === 'error' ? '必改' : '建议'}] ${issue.message}`),
            '',
            '（这里只做检查，不提供中→英翻译 —— 机翻简历是海外求职最致命的错误。）',
          ].join('\n'),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'cover_letter_draft',
      description:
        '为某个岗位写 Cover Letter。**中危**：模型发起时需要审批（会调用模型并读取简历）。' +
        'Cover Letter **不是简历的复述**，要说明"为什么是这个岗位、为什么是我"。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          language: enumStr(COVER_LETTER_LANGUAGES, '语言，默认英文'),
          resumeId: int('用哪一版简历；不传用当前启用版本'),
          useLlm: { type: 'boolean', description: '是否允许调用模型（false = 只用模板）' },
        },
        ['jobId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const jobId = positiveId(args.jobId, 'jobId')
        const language = asString(args['language']) ?? 'en'

        return await runtime.guard().run(
          {
            action: 'cover-letter.draft',
            actor: 'model',
            danger: 'mid',
            target: { jobId },
            payload: { jobId, language, note: '会调用模型并读取简历（不含联系方式）。' },
          },
          async () => {
            const letter = await runtime.overseas().draftCoverLetter({
              jobId,
              language: language as CoverLetterLanguage,
              ...(typeof args['resumeId'] === 'number' ? { resumeId: args['resumeId'] } : {}),
              ...(typeof args['useLlm'] === 'boolean' ? { useLlm: args['useLlm'] } : {}),
            })
            return {
              text: [
                `Cover Letter #${String(letter.id)}（来源：${letter.via === 'llm' ? '模型' : '模板'}，${letter.language}）`,
                '',
                letter.content,
                letter.notes.length === 0 ? '' : `\n改动说明：${letter.notes.join('；')}`,
              ]
                .filter((line) => line !== '')
                .join('\n'),
            }
          },
        )
      },
    }),
  ]
}
