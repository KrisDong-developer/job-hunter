/**
 * 简历的结构化形状与纯规则 —— host、client、渲染器（HTML / DOCX）与模型提示词**共用这一份**。
 *
 * 为什么必须结构化而不是"一段富文本"：
 *   1. **防编造**（§4.5 禁止编造、R8）：只有结构化之后，"模型有没有加一段不存在的经历"
 *      才是可判定的（见 `factAtoms` / `checkNoFabrication`）；
 *   2. **多目标渲染**：同一份数据要出 HTML 预览、PDF、DOCX，还要喂给模型做定制；
 *   3. **匹配分是简历版本的函数**（§4.1）：简历改了，之前算过的分就失效了。
 *
 * 这里**只有纯数据与纯函数**（没有 IO、没有活对象）。跨进程的投影见 contract/dto/resume.ts。
 */
/** 基础信息。`phone`/`email` 走隐私闸门时会被硬黑名单剥离（§4.5 / I5）。 */
export interface ResumeBasics {
  name: string
  /** 目标岗位 / 方向，如「Java 后端开发」。 */
  title: string
  phone?: string
  email?: string
  city?: string
  /** 工作年限。 */
  years?: number
  age?: number
  links?: Array<{ label: string; url: string }>
}

export const SKILL_LEVELS = ['了解', '熟悉', '熟练', '精通'] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]

export interface ResumeSkill {
  name: string
  level?: SkillLevel
  years?: number
  /** 证据：在哪个项目/经历里用过。**没有证据的技能更容易被面试问穿**。 */
  evidence?: string
}

export interface ResumeExperience {
  company: string
  title: string
  /** `YYYY-MM` 或 `YYYY-MM-DD`。允许只写一端（在职中）。 */
  start?: string
  end?: string
  city?: string
  /** 逐条成果/职责。定制时只允许重排、改写措辞，不允许新增事实。 */
  highlights: string[]
  stack?: string[]
}

export interface ResumeProject {
  name: string
  role?: string
  period?: string
  highlights: string[]
  stack?: string[]
}

export interface ResumeEducation {
  school: string
  major?: string
  degree?: string
  start?: string
  end?: string
}

export interface ResumeExtra {
  label: string
  text: string
}

export interface ResumeContent {
  basics: ResumeBasics
  /** 个人简介 / 自我评价。 */
  summary: string
  skills: ResumeSkill[]
  experiences: ResumeExperience[]
  projects: ResumeProject[]
  education: ResumeEducation[]
  extras: ResumeExtra[]
}

/** 一份空简历：新建版本时的起点，也是"结构合法"的基准。 */
export function emptyResumeContent(direction = ''): ResumeContent {
  return {
    basics: { name: '', title: direction },
    summary: '',
    skills: [],
    experiences: [],
    projects: [],
    education: [],
    extras: [],
  }
}

// ─────────────────────────────────────────────────────────────────────
// 规范化：把不可信输入（用户手改的 JSON、模型返回的 JSON）收敛成这个形状
// ─────────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function optionalText(value: unknown): string | undefined {
  const raw = text(value).trim()
  return raw === '' ? undefined : raw
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}

function stringListOrUndefined(value: unknown): string[] | undefined {
  const list = stringList(value)
  return list.length === 0 ? undefined : list
}

function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

export function normalizeResumeContent(input: unknown): ResumeContent {
  const raw = asRecord(input)
  const basicsRaw = asRecord(raw['basics'])
  const linksRaw = Array.isArray(basicsRaw['links']) ? basicsRaw['links'] : []

  const basics = withOptional(
    {
      name: text(basicsRaw['name']),
      title: text(basicsRaw['title']),
    },
    {
      phone: optionalText(basicsRaw['phone']),
      email: optionalText(basicsRaw['email']),
      city: optionalText(basicsRaw['city']),
      years: optionalNumber(basicsRaw['years']),
      age: optionalNumber(basicsRaw['age']),
      links: (() => {
        const links = linksRaw
          .map((item) => {
            const record = asRecord(item)
            const label = text(record['label']).trim()
            const url = text(record['url']).trim()
            return label === '' || url === '' ? undefined : { label, url }
          })
          .filter((item): item is { label: string; url: string } => item !== undefined)
        return links.length === 0 ? undefined : links
      })(),
    },
  )

  return {
    basics,
    summary: text(raw['summary']),
    skills: (Array.isArray(raw['skills']) ? raw['skills'] : []).map((item) => {
      const record = asRecord(item)
      const level = text(record['level'])
      return withOptional(
        { name: text(record['name']).trim() } as ResumeSkill,
        {
          level: (SKILL_LEVELS as readonly string[]).includes(level) ? (level as SkillLevel) : undefined,
          years: optionalNumber(record['years']),
          evidence: optionalText(record['evidence']),
        },
      )
    }).filter((skill) => skill.name !== ''),
    experiences: (Array.isArray(raw['experiences']) ? raw['experiences'] : []).map((item) => {
      const record = asRecord(item)
      return withOptional(
        {
          company: text(record['company']).trim(),
          title: text(record['title']).trim(),
          highlights: stringList(record['highlights']),
        } as ResumeExperience,
        {
          start: optionalText(record['start']),
          end: optionalText(record['end']),
          city: optionalText(record['city']),
          stack: stringListOrUndefined(record['stack']),
        },
      )
    }).filter((experience) => experience.company !== '' || experience.title !== ''),
    projects: (Array.isArray(raw['projects']) ? raw['projects'] : []).map((item) => {
      const record = asRecord(item)
      return withOptional(
        { name: text(record['name']).trim(), highlights: stringList(record['highlights']) } as ResumeProject,
        {
          role: optionalText(record['role']),
          period: optionalText(record['period']),
          stack: stringListOrUndefined(record['stack']),
        },
      )
    }).filter((project) => project.name !== ''),
    education: (Array.isArray(raw['education']) ? raw['education'] : []).map((item) => {
      const record = asRecord(item)
      return withOptional({ school: text(record['school']).trim() } as ResumeEducation, {
        major: optionalText(record['major']),
        degree: optionalText(record['degree']),
        start: optionalText(record['start']),
        end: optionalText(record['end']),
      })
    }).filter((education) => education.school !== ''),
    extras: (Array.isArray(raw['extras']) ? raw['extras'] : []).map((item) => {
      const record = asRecord(item)
      return { label: text(record['label']).trim(), text: text(record['text']).trim() }
    }).filter((extra) => extra.label !== '' && extra.text !== ''),
  }
}

/** 简历"有没有内容"的判定：渲染与导出都要求它非空，否则给的是白纸。 */
export function isResumeContentUsable(content: ResumeContent): boolean {
  return (
    content.basics.name.trim() !== '' &&
    (content.experiences.length > 0 || content.projects.length > 0 || content.skills.length > 0)
  )
}

/**
 * 完整性体检（§4.C / A5 的规则部分；LLM 那部分不在本阶段）。
 *
 * 只报**能确定**的问题（缺名字、经历没写成果、时间倒挂、技能没证据），
 * 不猜"这段经历够不够强" —— 那种判断要么靠模型、要么靠人。
 */
export interface ResumeIssue {
  level: 'error' | 'warn'
  /** 人话，直接显示给用户。 */
  message: string
  /** 定位：哪个段落、第几项。 */
  at: string
}

export function inspectResume(content: ResumeContent): ResumeIssue[] {
  const issues: ResumeIssue[] = []
  if (content.basics.name.trim() === '') {
    issues.push({ level: 'error', message: '没有填姓名 —— 附件文件名与页眉都靠它', at: 'basics.name' })
  }
  if (content.basics.title.trim() === '') {
    issues.push({ level: 'warn', message: '没有填目标岗位方向', at: 'basics.title' })
  }
  if (content.summary.trim() === '') {
    issues.push({ level: 'warn', message: '没有个人简介 —— HR 第一眼看的是这里', at: 'summary' })
  }
  if (content.experiences.length === 0 && content.projects.length === 0) {
    issues.push({ level: 'error', message: '既没有工作经历也没有项目经历，这份简历基本没有信息量', at: 'experiences' })
  }

  content.experiences.forEach((experience, index) => {
    const label = experience.company === '' ? `第 ${String(index + 1)} 段经历` : experience.company
    if (experience.highlights.length === 0) {
      issues.push({ level: 'warn', message: `${label}：没有写任何成果或职责`, at: `experiences[${String(index)}]` })
    }
    if (experience.start !== undefined && experience.end !== undefined && experience.start > experience.end) {
      issues.push({
        level: 'error',
        message: `${label}：开始时间（${experience.start}）晚于结束时间（${experience.end}）`,
        at: `experiences[${String(index)}]`,
      })
    }
  })

  const skillWithoutEvidence = content.skills.filter((skill) => (skill.evidence ?? '') === '')
  if (content.skills.length > 0 && skillWithoutEvidence.length === content.skills.length) {
    issues.push({
      level: 'warn',
      message: `${String(skillWithoutEvidence.length)} 项技能都没有写"在哪里用过" —— 面试容易被追问穿`,
      at: 'skills',
    })
  }

  return issues
}

// ─────────────────────────────────────────────────────────────────────
// 防编造（§4.5「禁止编造」/ R8）
// ─────────────────────────────────────────────────────────────────────

/**
 * 事实原子：一份简历里**可以被凭空编出来**的东西。
 *
 * 抽取规则刻意保守 —— 宁可漏报也不要误报，因为误报会让合法的措辞改写被拒。
 * 覆盖的是最常见的编造形态：**编一个没用过的技术**、**编一段没做过的经历**、
 * **把数字/年限/百分比写大**、**编一个学历或公司**。
 */
export interface FactAtoms {
  /** 技术词（拉丁字母 token，如 React / Kubernetes / MySQL）。 */
  tech: Set<string>
  /** 数字与单位（`30%`、`5年`、`2000万`、`2021`）。 */
  numbers: Set<string>
  /** 组织名（公司 / 学校 / 项目名）。 */
  orgs: Set<string>
}

const TECH_TOKEN = /[A-Za-z][A-Za-z0-9+#._-]{1,}/g
const NUMBER_TOKEN = /\d+(?:\.\d+)?\s*(?:%|年|个月|万|亿|人|台|次|QPS|TPS|ms|s|天|周|月)?/gi

function collectTech(text: string, into: Set<string>): void {
  for (const match of text.matchAll(TECH_TOKEN)) {
    const token = match[0].replace(/[._-]+$/, '')
    if (token.length >= 2) into.add(token.toLowerCase())
  }
}

function collectNumbers(text: string, into: Set<string>): void {
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = match[0].replace(/\s+/g, '')
    if (token !== '') into.add(token.toLowerCase())
  }
}

/** 把一份简历里的所有自由文本摊平（用于抽取事实原子）。 */
export function flattenResumeText(content: ResumeContent): string {
  const parts: string[] = [content.basics.name, content.basics.title, content.summary]
  for (const skill of content.skills) parts.push(skill.name, skill.evidence ?? '')
  for (const experience of content.experiences) {
    parts.push(experience.company, experience.title, ...experience.highlights, ...(experience.stack ?? []))
  }
  for (const project of content.projects) {
    parts.push(project.name, project.role ?? '', ...project.highlights, ...(project.stack ?? []))
  }
  for (const education of content.education) parts.push(education.school, education.major ?? '', education.degree ?? '')
  for (const extra of content.extras) parts.push(extra.label, extra.text)
  return parts.join('\n')
}

/**
 * 走遍所有会产生"事实原子"的字段。
 *
 * **原简历与定制结果必须用同一个函数**。这不是洁癖 —— 实测踩到过：
 * 原简历一侧只走 skills/experiences/summary，候选一侧却走了
 * `basics.title`、公司名、教育专业等更多字段，于是**一份简历跟自己比**
 * 都会被判成"多出了技术词 java"。后果是英文简历与带数字技能名的简历
 * 永远无法通过定制检查，`tailor` 静默丢掉模型结果退回规则 ——
 * 而这类误报最终一定会导致"把检查关掉"，等于没有检查。
 */
function walkTextAtoms(content: ResumeContent, tech: Set<string>, numbers: Set<string>): void {
  collectTech(content.basics.name, tech)
  collectTech(content.basics.title, tech)
  if (typeof content.basics.years === 'number') collectNumbers(String(content.basics.years), numbers)

  collectTech(content.summary, tech)
  collectNumbers(content.summary, numbers)

  for (const skill of content.skills) {
    collectTech(skill.name, tech)
    collectNumbers(skill.name, numbers)
    collectTech(skill.evidence ?? '', tech)
    collectNumbers(skill.evidence ?? '', numbers)
  }
  for (const experience of content.experiences) {
    collectTech(experience.company, tech)
    collectTech(experience.title, tech)
    for (const stack of experience.stack ?? []) collectTech(stack, tech)
    for (const highlight of experience.highlights) {
      collectTech(highlight, tech)
      collectNumbers(highlight, numbers)
    }
  }
  for (const project of content.projects) {
    collectTech(project.name, tech)
    collectTech(project.role ?? '', tech)
    for (const stack of project.stack ?? []) collectTech(stack, tech)
    for (const highlight of project.highlights) {
      collectTech(highlight, tech)
      collectNumbers(highlight, numbers)
    }
  }
  for (const education of content.education) {
    collectTech(education.school, tech)
    collectTech(education.major ?? '', tech)
    collectTech(education.degree ?? '', tech)
  }
  for (const extra of content.extras) {
    collectTech(extra.label, tech)
    collectTech(extra.text, tech)
    collectNumbers(extra.text, numbers)
  }
}

/** 组织名只从**结构性位置**取：公司、项目名、学校。这是"多了一段经历"的判定依据。 */
function walkOrgs(content: ResumeContent, orgs: Set<string>): void {
  for (const experience of content.experiences) orgs.add(experience.company.trim())
  for (const project of content.projects) orgs.add(project.name.trim())
  for (const education of content.education) orgs.add(education.school.trim())
  orgs.delete('')
}

export function factAtoms(content: ResumeContent): FactAtoms {
  const tech = new Set<string>()
  const numbers = new Set<string>()
  const orgs = new Set<string>()
  walkTextAtoms(content, tech, numbers)
  walkOrgs(content, orgs)
  return { tech, numbers, orgs }
}

export interface FabricationReport {
  ok: boolean
  /** 人话理由，可直接显示给用户。 */
  reasons: string[]
  /** 具体多出来的东西，便于用户核对。 */
  addedTech: string[]
  addedNumbers: string[]
  addedOrgs: string[]
  /** 多出来的技能名（**中文技能也能查出来**，见下面的结构性检查）。 */
  addedSkills: string[]
}

/**
 * 结构性新增：技能 / 经历 / 项目 / 学历只允许是原集的**子集**。
 *
 * 为什么必须有这一层（而不是只靠技术词匹配）：
 * 技术词抽取基于**拉丁 token**，所以"精通分布式事务"这种中文技能词**一个都抽不出来** ——
 * 模型往技能表里加一条中文技能，纯词表匹配完全看不见。而"凭空多一项技能"恰恰是最常见的编造。
 * 结构性检查与语言无关、也不会误报合法的重排与删减（子集允许"少"，不允许"多"）。
 */
function structuralAdditions(
  original: ResumeContent,
  candidate: ResumeContent,
): { skills: string[]; orgs: string[] } {
  const key = (value: string): string => value.trim().toLowerCase()
  const beforeSkills = new Set(original.skills.map((skill) => key(skill.name)).filter((name) => name !== ''))
  const beforeOrgs = new Set<string>()
  /**
   * 经历按 **(公司, 职位) 成对**匹配，而不是只看公司。
   *
   * 只看公司会漏掉最常见的一种夸大：在同一家公司凭空多出一段"架构师"经历
   * （实测就是这条断言逼出来的）。反过来，把职位从"后端工程师"改成"高级后端工程师"
   * 也会被判为新增 —— 这是**对的**：改职位头衔本身就是简历失真。
   */
  const beforePairs = new Set<string>()
  for (const experience of original.experiences) {
    const company = experience.company.trim()
    const title = experience.title.trim()
    if (company !== '') beforeOrgs.add(key(company))
    if (company !== '' || title !== '') beforePairs.add(key(`${company}@${title}`))
  }
  for (const project of original.projects) if (project.name.trim() !== '') beforeOrgs.add(key(project.name))
  for (const education of original.education) if (education.school.trim() !== '') beforeOrgs.add(key(education.school))

  const skills = candidate.skills
    .map((skill) => skill.name.trim())
    .filter((name) => name !== '' && !beforeSkills.has(key(name)))
  const orgs: string[] = []
  for (const experience of candidate.experiences) {
    const pair = key(`${experience.company.trim()}@${experience.title.trim()}`)
    if (!beforePairs.has(pair)) orgs.push(`${experience.company.trim()}｜${experience.title.trim()}`)
  }
  for (const project of candidate.projects) {
    if (project.name.trim() !== '' && !beforeOrgs.has(key(project.name))) orgs.push(project.name.trim())
  }
  for (const education of candidate.education) {
    if (education.school.trim() !== '' && !beforeOrgs.has(key(education.school))) orgs.push(education.school.trim())
  }
  return { skills, orgs }
}

export interface FabricationOptions {
  /**
   * 允许出现的技术词（通常是**目标岗位**的标题与标签里的词）。
   *
   * 为什么需要这个口子：定制后的简历会合法地提到目标岗位（`basics.title` 改成
   * "Java 后端开发"、"简介"里写"希望从事微服务方向"）。这些词来自**岗位**而不是简历，
   * 如果不放行，每一次定制都会被自己的防编造检查拒掉 —— 那种检查最后一定会被关掉，
   * 等于没有检查。
   *
   * **注意放行的范围**：只有技术词能放行。组织名与数字一律严格 ——
   * "多出一段经历"和"把 3 年写成 5 年"才是真正致命的编造。
   */
  allowTech?: readonly string[]
}

/**
 * 检查"定制后"的简历有没有引入原简历里不存在的事实。
 *
 * 三条硬规则（对应 §4.5「新内容不得引入简历中不存在的事实」）：
 *   1. 组织（公司/学校/项目）只允许**是原集的子集** —— 不许加一段经历；
 *   2. 技术词不许**新增**（`allowTech` 里的除外）—— 这是最常见的编造
 *      （"顺手写个 Kubernetes"，面试第一轮就穿）；
 *   3. 数字/年限/百分比不许**新增** —— 把 3 年写成 5 年属于致命失真。
 */
export function checkNoFabrication(
  original: ResumeContent,
  candidate: ResumeContent,
  options: FabricationOptions = {},
): FabricationReport {
  const before = factAtoms(original)
  // **候选一侧必须用同一个投影**（`factAtoms`，不是 `flattenResumeText`），
  // 否则"自己跟自己比"都会报出多余的词（见 `walkTextAtoms` 的说明）
  const after = factAtoms(candidate)
  const structure = structuralAdditions(original, candidate)
  const allowed = new Set((options.allowTech ?? []).map((token) => token.toLowerCase()))
  const reasons: string[] = []

  const addedOrgs = [...new Set([...after.orgs, ...structure.orgs].map((name) => name.trim()))].filter(
    (name) => name !== '' && !before.orgs.has(name),
  )
  const addedSkills = structure.skills
  const addedTech = [...after.tech].filter((token) => !before.tech.has(token) && !allowed.has(token))
  const addedNumbers = [...after.numbers].filter((token) => !before.numbers.has(token))

  if (addedSkills.length > 0) {
    reasons.push(`多出了原简历里没有的技能：${addedSkills.slice(0, 8).join('、')}`)
  }
  if (addedOrgs.length > 0) {
    reasons.push(`多出了原简历里没有的经历/学历：${addedOrgs.slice(0, 5).join('、')}`)
  }
  if (addedTech.length > 0) {
    reasons.push(`多出了原简历里没有的技术词：${addedTech.slice(0, 8).join('、')}`)
  }
  if (addedNumbers.length > 0) {
    reasons.push(`多出了原简历里没有的数字：${addedNumbers.slice(0, 8).join('、')}`)
  }

  return {
    ok: reasons.length === 0,
    reasons,
    addedTech,
    addedNumbers,
    addedOrgs,
    addedSkills,
  }
}

/** 从一段文本里抽出技术词（供 `allowTech` 使用：岗位标题 + 标签）。 */
export function techTokensOf(text: string): string[] {
  const set = new Set<string>()
  collectTech(text, set)
  return [...set]
}

// ─────────────────────────────────────────────────────────────────────
// 文件命名（R4：HR 在附件列表里只看得到文件名）
// ─────────────────────────────────────────────────────────────────────

/** 去掉文件名里不能用的字符（Windows 比 POSIX 更严，按 Windows 来）。 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? 'resume' : cleaned.slice(0, 80)
}

/** 默认文件名：`姓名-岗位方向-年限.pdf`（R4）。 */
export function resumeFileName(content: ResumeContent, format: string): string {
  const parts = [content.basics.name, content.basics.title]
  if (typeof content.basics.years === 'number') parts.push(`${String(content.basics.years)}年`)
  const base = sanitizeFileName(parts.filter((part) => part.trim() !== '').join('-'))
  return `${base}.${format}`
}

// ─────────────────────────────────────────────────────────────────────
// DTO（给界面与工具）
// ─────────────────────────────────────────────────────────────────────
