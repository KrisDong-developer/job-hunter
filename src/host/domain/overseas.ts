/**
 * 海外 / 远程支线（§4.M / §12.8）。
 *
 * 三个 P0 需求，各有一个"错一次就完"的点：
 *   * **M4 工签/Sponsorship**：识别不出来就必须说识别不出来。
 *     把"没看到 no sponsorship"当成"提供担保"，会让用户投一堆注定无效的岗位 ——
 *     比不识别更糟，因为它给了虚假的希望。所以 `unknown` 是一等取值。
 *   * **M3 时区**：算错时区 = 直接错过面试。所以面试时间**双重显示**
 *     （对方时区 + 本地时区），而不是只换算一个数字让用户自己信。
 *   * **M1 英文简历不做机翻**：这是 §4.M 点名的致命错误。所以这里只做
 *     "检查与提示"（无照片/无年龄/无婚育、动词开头），真正的英文内容由用户或模型产出，
 *     **不提供中→英翻译**。
 *
 * 外加 M2 Cover Letter 与 M5 远程筛选。
 */
import type { CoverLetterLanguage, RemoteKind, VisaStance } from '../../shared/enums.js'
import { VISA_STANCES, REMOTE_KINDS } from '../../shared/enums.js'
import type { CoverLetterDto, TimezoneDisplayDto, VisaRequirementDto } from '../../shared/dto.js'
import type { AiService } from '../ai/client.js'
import { extractJson } from '../ai/prompts.js'
import type { Store } from '../store/store.js'
import { systemClock, type Clock } from '../util/time.js'
import { DomainError } from '../util/errors.js'

/**
 * 工签识别词表。
 *
 * 分成三组而不是一组：**"明确不提供"与"明确提供"必须区分开**，
 * 因为它们的行动含义相反（一个该放弃，一个该优先投）。
 * 都没命中才是 `unknown`。
 */
export const VISA_NO_SPONSORSHIP_PATTERNS = [
  'no sponsorship',
  'not able to sponsor',
  'unable to sponsor',
  'without sponsorship',
  'no visa sponsorship',
  'must be authorized to work',
  'must have work authorization',
  'must be eligible to work',
  'citizens only',
  'citizenship required',
  'security clearance',
  'permanent resident',
  'green card',
  '不提供签证',
  '不提供工签',
  '仅限本地',
  '限本地身份',
  '需本地身份',
]

export const VISA_PROVIDES_PATTERNS = [
  'visa sponsorship',
  'sponsorship available',
  'we sponsor',
  'will sponsor',
  'sponsor visas',
  'relocation support',
  'work permit support',
  '提供签证担保',
  '提供工签',
  '可协助办理签证',
]

export const REMOTE_PATTERNS: Array<{ kind: RemoteKind; patterns: string[] }> = [
  { kind: 'remote', patterns: ['fully remote', '100% remote', 'remote-first', 'work from anywhere', '全远程', '完全远程'] },
  { kind: 'hybrid', patterns: ['hybrid', 'partially remote', 'days on-site', '混合办公', '弹性办公'] },
  { kind: 'onsite', patterns: ['on-site', 'onsite only', 'in-office', 'must be onsite', '需坐班', '现场办公'] },
]

/** 校招批次识别（L7）。与工签同源思路：命中才标记，命不中留 NULL。 */
export const CAMPUS_PATTERNS: Array<{ batch: 'autumn' | 'spring'; patterns: string[] }> = [
  { batch: 'autumn', patterns: ['秋招', '2026届秋招', 'autumn recruitment', 'campus hiring 2026'] },
  { batch: 'spring', patterns: ['春招', '补招', 'spring recruitment'] },
]

export interface RecognitionResult {
  stance: VisaStance
  evidence: string[]
  uncertainty: string | null
}

/**
 * 从 JD / HR 消息里识别工签立场。
 *
 * **纯关键词，不做推断**。命中"不提供"优先于"提供"（同一段文本里两者都出现时，
 * 保守地按"不提供"处理 —— 投错的代价比不投大）。
 */
export function detectVisa(text: string): RecognitionResult {
  const lower = text.toLowerCase()
  const noHits = VISA_NO_SPONSORSHIP_PATTERNS.filter((pattern) => lower.includes(pattern.toLowerCase()))
  const yesHits = VISA_PROVIDES_PATTERNS.filter((pattern) => lower.includes(pattern.toLowerCase()))

  if (noHits.length > 0 && yesHits.length > 0) {
    return {
      stance: 'no_sponsorship',
      evidence: [...noHits, ...yesHits].slice(0, 6),
      uncertainty: '这段文本里同时出现了"提供"与"不提供"的表述，按保守口径判定为不提供，请人工确认。',
    }
  }
  if (noHits.length > 0) {
    const localOnly = noHits.some((hit) => /local|resident|citizen|本地|身份/i.test(hit))
    return {
      stance: localOnly ? 'local_only' : 'no_sponsorship',
      evidence: noHits.slice(0, 6),
      uncertainty: null,
    }
  }
  if (yesHits.length > 0) {
    return { stance: 'provides', evidence: yesHits.slice(0, 6), uncertainty: null }
  }
  return {
    stance: 'unknown',
    evidence: [],
    uncertainty: '岗位描述里没有提到签证担保 —— **这不等于不提供**，只是没写。建议直接问 HR。',
  }
}

/** 从文本识别工作模式。识不出来是 `unknown`，不猜。 */
export function detectRemote(text: string): { kind: RemoteKind; evidence: string[] } {
  const lower = text.toLowerCase()
  for (const { kind, patterns } of REMOTE_PATTERNS) {
    const hits = patterns.filter((pattern) => lower.includes(pattern.toLowerCase()))
    if (hits.length > 0) return { kind, evidence: hits.slice(0, 4) }
  }
  return { kind: 'unknown', evidence: [] }
}

/** 校招批次识别。 */
export function detectCampusBatch(text: string): { batch: 'autumn' | 'spring' | null; evidence: string[] } {
  for (const { batch, patterns } of CAMPUS_PATTERNS) {
    const hits = patterns.filter((pattern) => text.includes(pattern))
    if (hits.length > 0) return { batch, evidence: hits.slice(0, 3) }
  }
  return { batch: null, evidence: [] }
}

/**
 * 英文简历的**检查**（M1）。
 *
 * 只检查、不翻译。机翻简历是 §4.M 点名的致命错误，所以这里连"翻译"的入口都不提供 ——
 * 提供入口就等于鼓励用它。
 */
export interface ToneIssue {
  level: 'error' | 'warn'
  message: string
}

export function inspectEnglishResume(content: {
  basics: { age?: number; name: string; title: string }
  summary: string
  experiences: Array<{ highlights: string[] }>
  extras: Array<{ label: string; text: string }>
}): ToneIssue[] {
  const issues: ToneIssue[] = []
  // 海外简历不该有年龄、婚育、照片 —— 这些在国内常见、在海外属于歧视风险
  if (typeof content.basics.age === 'number') {
    issues.push({ level: 'error', message: '英文简历不要写年龄（海外招聘的歧视风险，且通常不该出现）' })
  }
  const forbidden = ['已婚', '未婚', 'political', 'marital', 'date of birth', 'photo', '照片']
  for (const extra of content.extras) {
    const hit = forbidden.find((word) => extra.text.toLowerCase().includes(word.toLowerCase()) || extra.label.toLowerCase().includes(word.toLowerCase()))
    if (hit !== undefined) {
      issues.push({ level: 'error', message: `「${extra.label}」里出现了英文简历不该有的信息：${hit}` })
    }
  }
  if (content.summary.trim() === '') {
    issues.push({ level: 'warn', message: '英文简历没有 Summary —— 海外 HR 会先看这一段' })
  }
  // 动词开头：英文简历的成果条目应当是 "Led / Built / Reduced" 这类
  const weak = content.experiences
    .flatMap((experience) => experience.highlights)
    .filter((line) => /^(负责|参与|协助|帮助)/.test(line.trim()))
  if (weak.length > 0) {
    issues.push({
      level: 'warn',
      message: `${String(weak.length)} 条经历以「负责/参与/协助」开头 —— 英文简历要用动词开头（Led / Built / Reduced），而不是中文的职责式写法`,
    })
  }
  return issues
}

/**
 * 时区双重显示（M3）。
 *
 * 关键是**两边都显示**而不是只换算一边：只给一个数字，用户无从判断对不对；
 * 两边一起给，错的时区会自己露出来（"对方 9:00，我这边 22:00" 一眼就知道不对）。
 */
export function timezoneDisplay(atIso: string, counterpartTz: string, localTz: string): TimezoneDisplayDto {
  const instant = Date.parse(atIso)
  if (!Number.isFinite(instant)) {
    throw new DomainError('INVALID_INPUT', `面试时间无法解析：${String(atIso)}`)
  }
  const date = new Date(instant)
  const format = (tz: string): { text: string; offsetHours: number } => {
    try {
      const text = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date)
      return { text, offsetHours: offsetHoursOf(date, tz) }
    } catch {
      // 时区名不认识时不要抛 —— 面试时间本身还在，别因为展示层把信息弄丢
      return { text: date.toISOString(), offsetHours: 0 }
    }
  }
  const counterpart = format(counterpartTz)
  const local = format(localTz)
  return {
    at: atIso,
    counterpartTz,
    localTz,
    counterpart: { tz: counterpartTz, text: counterpart.text },
    local: { tz: localTz, text: local.text },
    diffHours: Number((counterpart.offsetHours - local.offsetHours).toFixed(2)),
    warning:
      Math.abs(counterpart.offsetHours - local.offsetHours) >= 6
        ? '两边差 6 小时以上 —— 这种跨时区的面试最容易记错，确认时请把两边的时间都念一遍。'
        : null,
  }
}

/** 取某个时区在某时刻的 UTC 偏移小时数（用 Intl 反推，不引依赖）。 */
function offsetHoursOf(date: Date, tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string): number => Number(formatted.find((part) => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return (asUtc - date.getTime()) / 3_600_000
}

export interface OverseasService {
  /** 识别并落库一个岗位的工签/远程/批次（L7 / M4 / M5）。 */
  analyzeJob(jobId: number): VisaRequirementDto & { remoteKind: RemoteKind; campusBatch: string | null }
  getVisa(jobId: number): VisaRequirementDto
  setVisa(jobId: number, stance: VisaStance, options?: { identityLimit?: string | null; evidence?: string[] }): VisaRequirementDto
  /** 按工签/远程筛选岗位（M4 / M5）。 */
  filterJobs(input: { stance?: VisaStance; remoteKind?: RemoteKind; limit?: number }): Array<{ jobId: number; title: string; companyName: string | null; stance: VisaStance | null; remoteKind: RemoteKind | null }>
  /** 面试时间的双重显示（M3）。 */
  displayInterviewTime(atIso: string, counterpartTz: string): TimezoneDisplayDto
  /** 英文简历体检（M1：**只检查，不翻译**）。 */
  inspectEnglish(resumeId: number): ToneIssue[]
  /** Cover Letter（M2）。 */
  draftCoverLetter(input: { jobId: number; language?: CoverLetterLanguage; resumeId?: number; useLlm?: boolean }): Promise<CoverLetterDto>
  listCoverLetters(jobId?: number): CoverLetterDto[]
}

export interface OverseasDeps {
  store: Store
  ai?: AiService | undefined
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
}

export function createOverseasService(deps: OverseasDeps): OverseasService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  /**
   * 没有识别过时的兜底。
   *
   * `jobId` 必须回传调用方问的那个 id，而不是 `0` ——
   * 回 0 会让调用方无从知道这条结论属于哪个岗位（实测被测试抓到的）。
   */
  const unknownVisa = (jobId: number): VisaRequirementDto => ({
    jobId,
    stance: 'unknown',
    identityLimit: null,
    evidence: [],
    source: 'rule',
    uncertainty: '还没有识别过。用 overseas_check 的 analyze 动作跑一次，或者手动确认。',
    createdAt: '',
  })

  const requireJob = (jobId: number) => {
    const job = store.job.detail(jobId)
    if (job === undefined) {
      throw new DomainError('NOT_FOUND', `岗位不存在：${String(jobId)}`, { detail: { jobId } })
    }
    return job
  }

  const jobText = (jobId: number): string => {
    const job = store.job.detail(jobId)
    if (job === undefined) return ''
    return [job.title, job.tags.join(' '), store.job.jdText(jobId) ?? ''].join('\n')
  }

  return {
    analyzeJob(jobId) {
      const job = requireJob(jobId)
      const text = jobText(jobId)
      const visa = detectVisa(text)
      const remote = detectRemote(text)
      const campus = detectCampusBatch(text)

      const record = store.branch.upsertVisaRequirement(
        {
          jobId: job.id,
          stance: visa.stance,
          identityLimit: visa.evidence.find((hit) => /local|resident|citizen|本地|身份/i.test(hit)) ?? null,
          evidence: visa.evidence,
          source: 'rule',
          uncertainty: visa.uncertainty,
        },
        clock(),
      )
      // job 上的识别列用于筛选；识别不出来就不写（留 NULL 而不是猜）
      store.branch.setJobBranches(job.id, {
        campusBatch: campus.batch,
        remoteKind: remote.kind,
        visaStance: visa.stance,
      })
      deps.logger?.info(
        `[overseas] 岗位 #${String(job.id)}：工签=${visa.stance}，模式=${remote.kind}` +
          `${campus.batch === null ? '' : `，批次=${campus.batch}`}`,
      )
      return {
        ...record,
        remoteKind: remote.kind,
        campusBatch: campus.batch,
      }
    },

    getVisa(jobId) {
      const record = store.branch.getVisaRequirement(jobId)
      return record === undefined ? unknownVisa(jobId) : { ...record }
    },

    setVisa(jobId, stance, options = {}) {
      requireJob(jobId)
      if (!VISA_STANCES.includes(stance)) {
        throw new DomainError('INVALID_INPUT', `不支持的工签立场：${String(stance)}`, {
          hint: `合法取值：${VISA_STANCES.join(' / ')}`,
        })
      }
      const record = store.branch.upsertVisaRequirement(
        {
          jobId,
          stance,
          identityLimit: options.identityLimit ?? null,
          evidence: options.evidence ?? ['人工确认'],
          source: 'manual',
          uncertainty: null,
        },
        clock(),
      )
      store.branch.setJobBranches(jobId, { visaStance: stance })
      return { ...record }
    },

    filterJobs(input) {
      const rows = store.job.query({}, input.limit ?? 200, 0)
      const out: Array<{ jobId: number; title: string; companyName: string | null; stance: VisaStance | null; remoteKind: RemoteKind | null }> = []
      for (const job of rows) {
        const visa = store.branch.getVisaRequirement(job.id)
        const stance = visa?.stance ?? null
        const remote = readJobRemote(store, job.id)
        if (input.stance !== undefined && stance !== input.stance) continue
        if (input.remoteKind !== undefined && remote !== input.remoteKind) continue
        out.push({
          jobId: job.id,
          title: job.title,
          companyName: job.companyName,
          stance,
          remoteKind: remote,
        })
      }
      return out
    },

    displayInterviewTime(atIso, counterpartTz) {
      return timezoneDisplay(atIso, counterpartTz, 'Asia/Shanghai')
    },

    inspectEnglish(resumeId) {
      const resume = store.resume.get(resumeId)
      if (resume === undefined) {
        throw new DomainError('NOT_FOUND', `简历不存在：${String(resumeId)}`)
      }
      return inspectEnglishResume(resume.content)
    },

    async draftCoverLetter(input): Promise<CoverLetterDto> {
      const job = requireJob(input.jobId)
      const language = input.language ?? 'en'
      const resume =
        input.resumeId === undefined
          ? store.resume.defaultResume()
          : store.resume.get(input.resumeId)
      const jdText = store.job.jdText(job.id) ?? ''
      const name = resume?.content.basics.name ?? ''
      const skills = (resume?.content.skills ?? []).slice(0, 8).map((skill) => skill.name)

      /** 规则兜底：只用简历里已有的技能名 + 岗位名造句，**不编造任何经历**。 */
      const fallback = (): string =>
        language === 'en'
          ? [
              `Dear Hiring Manager,`,
              ``,
              `I am writing to apply for the ${job.title} position at ${job.companyName ?? 'your company'}.`,
              skills.length === 0
                ? `My background aligns with the requirements described in the posting.`
                : `My experience includes ${skills.join(', ')}, which I believe matches what you are looking for.`,
              ``,
              `I would welcome the opportunity to discuss how I can contribute.`,
              ``,
              `Sincerely,`,
              name,
            ]
              .filter((line) => line !== undefined)
              .join('\n')
          : [
              `尊敬的招聘负责人：`,
              ``,
              `您好，我想应聘${job.companyName ?? '贵公司'}的「${job.title}」岗位。`,
              skills.length === 0
                ? '我的背景与岗位描述中的要求比较对口。'
                : `我做过${skills.join('、')}相关的工作，和岗位要求比较匹配。`,
              ``,
              `期待有机会进一步沟通。`,
              ``,
              `此致`,
              name,
            ].join('\n')

      const ai = deps.ai
      if (ai === undefined || input.useLlm === false) {
        const record = store.branch.createCoverLetter(
          { jobId: job.id, resumeId: resume?.id ?? null, language, content: fallback(), via: 'rule', notes: ['使用模板生成（未调用模型）'] },
          clock(),
        )
        return { ...record }
      }

      const result = await ai.call<{ content: string; notes: string[] }>(
        {
          purpose: 'cover_letter',
          instruction: [
            `为下面的岗位写一封 ${language === 'en' ? '英文' : '中文'} Cover Letter。`,
            '',
            '硬性约束：',
            '1. **不许编造**经历、技能、学历、数字；只能用下面提供的资料里确实有的东西；',
            '2. 不要复述简历（§21：Cover Letter 不是简历的复述），要说明"为什么是这个岗位、为什么是我"；',
            language === 'en'
              ? '3. 用英文书写习惯：直接、具体、动词开头，不要中式英语的客套话。'
              : '3. 中文书写，简洁，不要空话。',
            `4. 长度控制在 ${language === 'en' ? '200-300 words' : '300-500 字'}。`,
          ].join('\n'),
          payload: {
            jobTitle: job.title,
            companyName: job.companyName ?? '',
            tags: job.tags.join('、'),
            candidateName: name,
            knownSkills: skills.join('、'),
          },
          allowFields: ['jobTitle', 'companyName', 'tags', 'candidateName', 'knownSkills'],
          untrusted: jdText === '' ? [] : [{ label: 'jd', text: jdText }],
          outputSpec: '只输出 JSON：{"content":"信件全文","notes":["你突出了什么"]}。不要输出其它内容。',
          maxTokens: 1200,
          temperature: 0.6,
          ref: { kind: 'job', id: job.id },
        },
        {
          parse: (raw) => {
            const parsed = extractJson(raw)
            if (parsed === null || typeof parsed !== 'object') return undefined
            const content = (parsed as { content?: unknown }).content
            if (typeof content !== 'string' || content.trim().length < 40) return undefined
            const notes = (parsed as { notes?: unknown }).notes
            return {
              content: content.trim(),
              notes: Array.isArray(notes) ? notes.filter((item): item is string => typeof item === 'string').slice(0, 6) : [],
            }
          },
          fallback: () => ({ content: fallback(), notes: ['模型不可用，使用模板'] }),
        },
      )

      const record = store.branch.createCoverLetter(
        {
          jobId: job.id,
          resumeId: resume?.id ?? null,
          language,
          content: result.value.content,
          via: result.via === 'llm' ? 'llm' : 'rule',
          notes: [...result.value.notes, ...result.notes],
        },
        clock(),
      )
      return { ...record }
    },

    listCoverLetters(jobId) {
      return store.branch.listCoverLetters(jobId === undefined ? {} : { jobId }).map((record) => ({ ...record }))
    },
  }
}

/** 从 job 的识别列读远程模式（没有就是 null，不猜）。 */
function readJobRemote(store: Store, jobId: number): RemoteKind | null {
  const row = store.db.prepare('SELECT remote_kind FROM job WHERE id = ?').get(jobId) as { remote_kind?: unknown } | undefined
  const value = row?.remote_kind
  return typeof value === 'string' && (REMOTE_KINDS as readonly string[]).includes(value) ? (value as RemoteKind) : null
}
