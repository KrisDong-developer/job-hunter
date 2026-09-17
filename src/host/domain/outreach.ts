/**
 * 打招呼话术（§4.5 / §22.2 `greeting_draft`）。
 *
 * 这个模块**只生成草稿，绝不发送** —— 发送是 `guard/actions/greeting.ts` 的事，
 * 而 guard 那条路必然要过审批（§4.5.2「不授予动作权」：LLM 输出永远不能直接触发高危动作）。
 *
 * 三件事在这里做，缺一不可：
 *   1. 组外发载荷（只挑标量字段，绝不把整个 job 对象丢出去）；
 *   2. 把 JD 全文当**不可信输入**（§4.5.2 结构性隔离），并扫描注入样本留日志；
 *   3. 输出再校验：任何引入联系方式/收件人的输出一律丢弃，退回模板。
 */
import type { AiService } from '../ai/client.js'
import { HARD_BLOCKED_PATTERNS } from '../ai/privacy.js'
import { extractJson } from '../ai/prompts.js'
import type { Store } from '../store/store.js'
import { JOB_FLAG_LABEL } from '../../shared/enums.js'
import type { GreetingDraftDto } from '../../shared/dto.js'
import { DomainError } from '../util/errors.js'

/** 话术长度约束：太短没内容，太长 HR 不会看。 */
export const GREETING_MIN_CHARS = 15
export const GREETING_MAX_CHARS = 400

/** 只允许这些字段外发 —— 白名单，不是黑名单（§4.5 隐私闸门）。 */
export const GREETING_ALLOW_FIELDS = [
  'jobTitle',
  'companyName',
  'city',
  'salaryRaw',
  'expReq',
  'eduReq',
  'tags',
  'flagLabels',
  'tone',
  'highlights',
] as const

export type GreetingTone = 'formal' | 'warm' | 'concise'

export const GREETING_TONE_LABEL: Record<GreetingTone, string> = {
  formal: '正式',
  warm: '热情',
  concise: '简短',
}

/** JD/HR 消息里值得记录的注入样本（记录后仍然继续，不做"内容过滤"）。 */
const INJECTION_MARKERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'ignore-instructions', pattern: /(忽略|无视|忘记)(以上|上面|之前|前面)?(的)?(所有)?(指令|要求|提示|规则)/i },
  { name: 'role-override', pattern: /(你现在是|从现在起你是|you are now|act as)/i },
  { name: 'system-prompt-probe', pattern: /(系统提示|system\s*prompt|你的指令是什么|repeat your instructions)/i },
  { name: 'contact-redirect', pattern: /(把|将).{0,12}(简历|联系方式|资料).{0,12}(发|发送|给|转到)/ },
  { name: 'credential-probe', pattern: /(api[\s-]?key|密码|账号密码|token)/i },
]

export interface InjectionHit {
  name: string
  /** 命中的片段（已截断），便于事后分析。 */
  sample: string
}

/** 扫描不可信文本里的注入样本。返回空数组表示没看到可疑内容 —— 不代表"安全"。 */
export function scanInjection(text: string, limit = 3): InjectionHit[] {
  const hits: InjectionHit[] = []
  for (const { name, pattern } of INJECTION_MARKERS) {
    const match = pattern.exec(text)
    if (match !== null) {
      hits.push({ name, sample: match[0].slice(0, 80) })
      if (hits.length >= limit) break
    }
  }
  return hits
}

/**
 * 输出再校验（§4.5.2 第三层）。
 *
 * 拒绝的不是"提到了联系方式"，而是**草稿自己引入了联系方式** ——
 * 用户的简历里有没有电话不归这里管，这里管的是"模型往话术里塞了一个新号码"。
 */
export function validateGreetingText(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed.length < GREETING_MIN_CHARS) return `话术过短（${trimmed.length} 字）`
  if (trimmed.length > GREETING_MAX_CHARS) return `话术过长（${trimmed.length} 字，上限 ${GREETING_MAX_CHARS}）`

  for (const { name, pattern } of HARD_BLOCKED_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(trimmed)) return `话术里出现了${describePattern(name)}`
  }

  if (/(微信|weixin|wechat|QQ|扣扣|电话|手机号|邮箱)/i.test(trimmed) &&
      /(加|联系|发到|发送至|私聊|直接打)/.test(trimmed)) {
    return '话术里出现了联系方式引导'
  }
  if (/https?:\/\//i.test(trimmed)) return '话术里出现了链接'

  return undefined
}

function describePattern(name: string): string {
  switch (name) {
    case 'phone':
      return '手机号'
    case 'idCard':
      return '身份证号'
    case 'email':
      return '邮箱地址'
    case 'bankCard':
      return '银行卡号'
    default:
      return name
  }
}

/** 打招呼草稿的生成结果；`via` 由上层原样透传给用户。 */
export type GreetingDraft = GreetingDraftDto

export interface GreetingDraftInput {
  jobId: number
  tone?: GreetingTone
  /** 用户自选要突出的经历要点（可选，最长 3 条）。 */
  highlights?: string[]
  /** 自定义补充说明，直接作为可信指令的一部分。 */
  extra?: string
}

export interface OutreachDeps {
  store: Store
  ai: AiService
  logger?: { info(message: string): void; warn(message: string): void }
  /** 注入样本落日志的钩子（默认走 logger + audit）。 */
  onInjection?: (info: { jobId: number; hits: InjectionHit[] }) => void
}

export interface OutreachService {
  draft(input: GreetingDraftInput): Promise<GreetingDraft>
  /** 不发模型，纯模板结果 —— 用于预览模板与离线场景。 */
  template(input: GreetingDraftInput): GreetingDraft
}

export function createOutreachService(deps: OutreachDeps): OutreachService {
  const { store, ai } = deps

  const template = (input: GreetingDraftInput): GreetingDraft => {
    const job = requireJob(store, input.jobId)
    const text = buildTemplateGreeting({
      title: job.title,
      companyName: job.companyName ?? '',
      city: job.city,
      tags: job.tags,
      expReq: job.expReq,
      tone: input.tone ?? 'formal',
      highlights: input.highlights ?? [],
    })
    return {
      jobId: job.id,
      text,
      via: 'template',
      notes: ['使用内置模板（未调用模型）'],
      outboundFields: [],
      callId: null,
    }
  }

  const draft = async (input: GreetingDraftInput): Promise<GreetingDraft> => {
    const job = requireJob(store, input.jobId)
    const jdText = store.job.jdText(job.id) ?? ''
    const tone = input.tone ?? 'formal'
    const highlights = (input.highlights ?? []).slice(0, 3)

    const flagLabels = job.flagTypes.map((flag) => JOB_FLAG_LABEL[flag])

    // 注入扫描：只记录，不改变流程 —— "过滤"是打不完的地鼠，结构隔离才是防线。
    const injectionHits = scanInjection([jdText, input.extra ?? ''].join('\n'))
    if (injectionHits.length > 0) {
      deps.logger?.warn(
        `[outreach] 岗位 ${String(job.id)} 的 JD 里发现疑似注入：${injectionHits.map((hit) => hit.name).join('、')}`,
      )
      deps.onInjection?.({ jobId: job.id, hits: injectionHits })
    }

    const fallbackText = buildTemplateGreeting({
      title: job.title,
      companyName: job.companyName ?? '',
      city: job.city,
      tags: job.tags,
      expReq: job.expReq,
      tone,
      highlights,
    })

    const result = await ai.call(
      {
        purpose: 'greeting_draft',
        instruction: [
          `为用户写一段投递「${job.title}」岗位时发给 HR 的打招呼消息。`,
          `语气：${GREETING_TONE_LABEL[tone]}。`,
          `长度 ${GREETING_MIN_CHARS}-${GREETING_MAX_CHARS} 字，一段话，不要分点，不要标题。`,
          '只能使用下面提供的字段和外部资料里确实存在的信息，**不要编造**用户的经历、学历或公司信息。',
          '不要写联系方式，不要写链接，不要承诺到岗时间。',
          input.extra === undefined || input.extra === '' ? '' : `用户补充要求：${input.extra}`,
        ]
          .filter((line) => line !== '')
          .join('\n'),
        payload: {
          jobTitle: job.title,
          companyName: job.companyName ?? '',
          city: job.city,
          salaryRaw: job.salaryRaw,
          expReq: job.expReq,
          eduReq: job.eduReq,
          tags: job.tags.join('、'),
          flagLabels: flagLabels.join('、'),
          tone: GREETING_TONE_LABEL[tone],
          highlights: highlights.join('、'),
        },
        allowFields: GREETING_ALLOW_FIELDS,
        untrusted: jdText === '' ? [] : [{ label: 'jd', text: jdText }],
        outputSpec: '只输出 JSON：{"text": "话术正文"}。不要输出其它内容。',
        maxTokens: 512,
        temperature: 0.7,
        ref: { kind: 'job', id: job.id },
      },
      {
        parse: (raw) => {
          const parsed = extractJson(raw)
          if (parsed === null || typeof parsed !== 'object') return undefined
          const text = (parsed as { text?: unknown }).text
          return typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined
        },
        validate: (text) => validateGreetingText(text),
        fallback: () => fallbackText,
      },
    )

    return {
      jobId: job.id,
      text: result.value,
      via: result.via === 'llm' ? 'llm' : 'template',
      notes: result.notes,
      outboundFields: result.outboundFields,
      callId: result.callId ?? null,
    }
  }

  return { draft, template }
}

function requireJob(store: Store, jobId: number) {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new DomainError('INVALID_INPUT', `岗位 id 不合法：${String(jobId)}`)
  }
  const job = store.job.detail(jobId)
  if (job === undefined) {
    throw new DomainError('NOT_FOUND', `没有找到岗位 ${String(jobId)}`, {
      hint: '它可能已被删除，或者你还没抓到这个岗位。',
      detail: { jobId },
    })
  }
  return job
}

export interface TemplateInput {
  title: string
  companyName: string
  city: string
  tags: string[]
  expReq: string
  tone: GreetingTone
  highlights: string[]
}

/**
 * 内置模板（降级路径）。
 *
 * 模板刻意写得**保守且可读**：它存在的意义是"模型关了也有东西可用"，
 * 不是"假装这就是 AI 写的"。所以它只用抓到的事实，不造句。
 */
export function buildTemplateGreeting(input: TemplateInput): string {
  const company = input.companyName === '' ? '贵公司' : input.companyName
  const skills = input.highlights.length > 0 ? input.highlights : input.tags.slice(0, 3)
  const skillText = skills.length > 0 ? skills.join('、') : ''

  const opener = input.tone === 'warm' ? '您好！' : input.tone === 'concise' ? '您好，' : '您好，'
  const parts: string[] = [`${opener}看到${company}在招「${input.title}」，我很感兴趣。`]

  if (skillText !== '') {
    parts.push(
      input.tone === 'concise'
        ? `我有${skillText}相关经验。`
        : `我做过${skillText}相关的工作，和这个岗位的要求比较对口。`,
    )
  }

  if (input.expReq !== '') parts.push(`岗位要求${input.expReq}，我的情况基本匹配。`)
  if (input.tone !== 'concise' && input.city !== '') parts.push(`我目前在${input.city}，可以随时沟通。`)
  parts.push('方便的话想和您聊聊岗位细节，谢谢！')

  const text = parts.join('')
  return text.length > GREETING_MAX_CHARS ? text.slice(0, GREETING_MAX_CHARS) : text
}
