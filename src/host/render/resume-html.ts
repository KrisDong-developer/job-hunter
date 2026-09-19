/**
 * 简历 → HTML（§17 R1）：**自包含**、可直接交给 Chromium `page.setContent()` 打印成 PDF。
 *
 * 为什么是"自包含 + 内联样式"：
 *   1. 打印链路里**没有网络**，也没有项目的 CSS 产物 —— 外链样式表会静默失效，
 *      用户拿到的是一张没有排版的裸纸；
 *   2. 预览（`fragment`）与打印走**同一份标记**：预览好看、打印走样是最难查的一类 bug，
 *      所以这里只切外壳，不切内容。
 *
 * 字体是这里唯一"看起来像细节、实际是硬需求"的东西（R1）：中文若不显式指定字体栈，
 * 落到 Chromium 默认的 serif 上就是宋体点阵观感，且 Windows / macOS 表现完全不同。
 *
 * 本文件是**纯函数**：没有 IO、没有活对象，可被任意进程直接引。
 */
import type { ResumeTemplate } from '../../shared/contract/enums/resume.js'
import type { ResumeBasics, ResumeContent, ResumeEducation, ResumeExperience, ResumeProject, ResumeSkill } from '../../shared/domain/resume-content.js'

export interface RenderOptions {
  template?: ResumeTemplate
  /** 页眉里是否显示照片/期望薪资等可选字段（R3：字段可开关）。 */
  showOptional?: boolean
  /** 只渲染正文片段（预览用），不带 `<html>/<head>` 外壳。 */
  fragment?: boolean
}

// ─────────────────────────────────────────────────────────────────────
// 文本安全
// ─────────────────────────────────────────────────────────────────────

/**
 * 转义 HTML 文本节点。
 *
 * 简历正文是**用户可控文本**（还可能是模型生成的），里面出现 `<` 的概率不低
 * ——比如「熟悉 C++ 模板 <T>」或者一份写坏的 JD 片段。不转义的话，
 * 轻则整页错乱，重则把用户自己的文本注入成标签（预览在一个真实浏览器里跑）。
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * `href` 只允许 http/https/mailto/tel。
 *
 * 这份 HTML 会在真实浏览器里预览，所以 `javascript:` 之类的 scheme 不能原样写进属性；
 * 白名单之外一律退化成纯文本，宁可少一个可点链接，也不要一个可执行的链接。
 */
function safeHref(url: string): string | undefined {
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(url.trim()) ? url.trim() : undefined
}

/** 非空判断统一走这里：模板里到处都是"有才渲染"，散落的 `!== ''` 迟早漏一处。 */
function has(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}

/** 时间区间：只给一端时补「至今」，两端都没有就整段省略（不打印一个孤零零的破折号）。 */
function dateRange(start?: string, end?: string): string {
  if (has(start) && has(end)) return `${escapeHtml(start)} – ${escapeHtml(end)}`
  if (has(start)) return `${escapeHtml(start)} – 至今`
  if (has(end)) return escapeHtml(end)
  return ''
}

// ─────────────────────────────────────────────────────────────────────
// 页眉
// ─────────────────────────────────────────────────────────────────────

/**
 * 联系方式前的微型图标：**内联 SVG**（自包含约束不允许外链）。
 * 用 `currentColor` 描边，所以它会跟着那一行的文字颜色走。
 */
const ICONS: Record<'phone' | 'mail' | 'pin', string> = {
  phone:
    '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 1.8h2.1l1 2.6-1.4.9a8.2 8.2 0 0 0 4.4 4.4l.9-1.4 2.6 1v2.1c0 .8-.7 1.5-1.5 1.5A10 10 0 0 1 2.1 3.3c0-.8.7-1.5 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  mail:
    '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.6" width="12" height="8.8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 4.8 8 8.5l5.2-3.7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  pin:
    '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s4.1-3.9 4.1-6.9A4.1 4.1 0 0 0 3.9 7.1C3.9 10.1 8 14 8 14z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="7" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
}

/**
 * 页眉。
 *
 * 2026-09-17 第二轮调整（反馈："姓名与求职意向太占行"）：
 * 姓名与求职意向**并到同一行**（姓名 20pt，意向 11pt 灰、基线对齐），
 * 联系方式一行排开并带微型图标。头部因此从三行收到两行，且信息更密。
 *
 * 关于"5 年经验 | 随时到岗"：年限确实在联系方式行里，但它归 `showOptional` 管
 * —— 默认不显示是**刻意的**（§17 R3：避免没想清楚就把年龄/年限自动投出去）。
 * "求职状态"这个字段目前**不存在**，要加是数据模型的事，不在渲染器里编。
 */
function renderBasics(basics: ResumeBasics, showOptional: boolean): string {
  const out: string[] = []
  const name = has(basics.name) ? `<h1 class="resume-name">${escapeHtml(basics.name)}</h1>` : ''
  const role = has(basics.title) ? `<span class="resume-job">${escapeHtml(basics.title)}</span>` : ''
  if (name !== '' || role !== '') out.push(`      <div class="resume-headline">${name}${role}</div>`)

  // 联系方式行的顺序固定：手机 → 邮箱 → 城市 →（开关打开时）年限 → 链接。
  // HR 找手机号时手是有肌肉记忆的。
  const contacts: string[] = []
  if (has(basics.phone)) contacts.push(`<span>${ICONS.phone}${escapeHtml(basics.phone)}</span>`)
  if (has(basics.email)) contacts.push(`<span>${ICONS.mail}${escapeHtml(basics.email)}</span>`)
  if (has(basics.city)) contacts.push(`<span>${ICONS.pin}${escapeHtml(basics.city)}</span>`)
  if (showOptional && typeof basics.years === 'number') {
    contacts.push(`<span>${String(basics.years)} 年经验</span>`)
  }
  for (const link of basics.links ?? []) {
    const label = has(link.label) ? link.label : link.url
    if (!has(label)) continue
    const href = safeHref(link.url)
    contacts.push(
      href === undefined
        ? `<span>${escapeHtml(label)}</span>`
        : `<span><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></span>`,
    )
  }
  if (contacts.length > 0) {
    out.push(`      <div class="resume-contact">${contacts.join('<span class="sep">·</span>')}</div>`)
  }

  // 年龄仍然只在开关打开时出现，且单独一行（它比年限更敏感）
  if (showOptional && typeof basics.age === 'number') {
    out.push(`      <div class="resume-meta">年龄：${String(basics.age)} 岁</div>`)
  }

  return out.join('\n')
}

// ─────────────────────────────────────────────────────────────────────
// 段落
// ─────────────────────────────────────────────────────────────────────

function renderSummary(summary: string): string {
  return `      <p class="resume-summary">${escapeHtml(summary)}</p>`
}

/**
 * 技能做成**标签块**（反馈："散列排列空隙大、等级差异不明显"）。
 *
 * 早先是"名字 …… 备注"两端拉开：空隙全靠布局撑，名字与等级同色同重，
 * 看不出"精通"和"了解"的差别。现在整项技能是一块浅底色块：
 * 名字加粗、等级半粗深灰、证据退成更浅的灰。
 */
function renderSkill(skill: ResumeSkill): string {
  const bits: string[] = [`<b class="skill-name">${escapeHtml(skill.name)}</b>`]
  if (has(skill.level)) bits.push(`<span class="skill-level">${escapeHtml(skill.level)}</span>`)
  if (typeof skill.years === 'number') bits.push(`<span class="skill-level">${String(skill.years)} 年</span>`)
  if (has(skill.evidence)) bits.push(`<span class="skill-note">${escapeHtml(skill.evidence)}</span>`)
  return `          <li class="skill-item">${bits.join('')}</li>`
}

/** 技术栈：微型浅底色块 + 前缀标签，和正文与项目符号明确分开。 */
function renderStack(stack: string[]): string {
  if (stack.length === 0) return ''
  const chips = stack.map((item) => `<span class="stack-tag">${escapeHtml(item)}</span>`).join('')
  return `          <p class="exp-stack"><span class="stack-label">技术栈</span>${chips}</p>`
}

function renderExperience(experience: ResumeExperience): string {
  // 公司与职位用「·」连成**一个短语**放左边，时间放右边 —— 两端对齐。
  // 早先公司、职位、时间各占一个位置（中间那个靠全角空格撑开），视线要来回跳三次。
  const heading = [
    `<span class="exp-company">${escapeHtml(experience.company)}</span>`,
    has(experience.title) ? `<span class="exp-title"> · ${escapeHtml(experience.title)}</span>` : '',
  ]
    .filter((part) => part !== '')
    .join('')
  const tail = [dateRange(experience.start, experience.end), has(experience.city) ? escapeHtml(experience.city) : '']
    .filter((part) => part !== '')
    .join(' | ')

  const lines: string[] = [`        <div class="exp-head">`]
  lines.push(`            ${heading}`)
  if (tail !== '') lines.push(`            <span class="exp-period">${tail}</span>`)
  lines.push(`          </div>`)
  if (experience.highlights.length > 0) {
    lines.push(`          <ul class="exp-points">`)
    for (const highlight of experience.highlights) {
      lines.push(`            <li>${escapeHtml(highlight)}</li>`)
    }
    lines.push(`          </ul>`)
  }
  const stack = renderStack(experience.stack ?? [])
  if (stack !== '') lines.push(stack)
  return `        <div class="exp-item">\n${lines.join('\n')}\n        </div>`
}

function renderProject(project: ResumeProject): string {
  const headingBits =
    `<span class="exp-company">${escapeHtml(project.name)}</span>` +
    (has(project.role) ? `<span class="exp-title"> · ${escapeHtml(project.role)}</span>` : '')
  const tail = has(project.period) ? escapeHtml(project.period) : ''

  const lines: string[] = [`        <div class="exp-head">`]
  lines.push(`            ${headingBits}`)
  if (tail !== '') lines.push(`            <span class="exp-period">${tail}</span>`)
  lines.push(`          </div>`)
  if (project.highlights.length > 0) {
    lines.push(`          <ul class="exp-points">`)
    for (const highlight of project.highlights) {
      lines.push(`            <li>${escapeHtml(highlight)}</li>`)
    }
    lines.push(`          </ul>`)
  }
  const stack = renderStack(project.stack ?? [])
  if (stack !== '') lines.push(stack)
  return `        <div class="exp-item">\n${lines.join('\n')}\n        </div>`
}

/**
 * 教育一行：**学校是锚点（加粗）**，专业与学历退成常规灰，时间靠右。
 *
 * 反馈说"信息全挤在左侧、右边空一大片"，建议做成三列。
 * 三列在 Word 里要引入中间制表位、在 HTML 里要把专业钉在固定列 ——
 * 而真正的问题其实是**三者字重完全一样**（整行 600），所以没有落点。
 * 这里按工作经历同一套层级解决：锚点粗、补充信息常规灰，不需要第三列。
 */
function renderEducation(education: ResumeEducation): string {
  const extra = [
    has(education.major) ? escapeHtml(education.major) : '',
    has(education.degree) ? escapeHtml(education.degree) : '',
  ]
    .filter((part) => part !== '')
    .join(' · ')
  const tail = dateRange(education.start, education.end)
  return `          <li class="edu-item"><span class="edu-main">${escapeHtml(education.school)}${
    extra === '' ? '' : `<span class="edu-extra"> · ${extra}</span>`
  }</span>${tail === '' ? '' : `<span class="exp-period">${tail}</span>`}</li>`
}

// ─────────────────────────────────────────────────────────────────────
// 组装
// ─────────────────────────────────────────────────────────────────────

/**
 * 只产出**正文标记**（不含 `<html>` 外壳与 `<style>`）。
 *
 * 片段与整页共用它，是为了保证"预览看到的"和"打印出来的"是同一棵树 ——
 * 两套标记迟早会漂移。类名（`resume-section` / `exp-item` / …）是对外契约，
 * 应用侧的预览样式表按它们选择，所以不要随手改名。
 */
function renderBody(content: ResumeContent, options: RenderOptions): string {
  const showOptional = options.showOptional === true
  const blocks: string[] = []

  const header = renderBasics(content.basics, showOptional)
  if (header !== '') blocks.push(`    <header class="resume-header">\n${header}\n    </header>`)

  // 顺序即 §17 的段落顺序：简介 → 技能 → 工作 → 项目 → 教育 → 其他。
  // 每一段都先判空：**空段落的标题比没有标题更糟**，它会让 HR 以为你漏填了。
  if (has(content.summary)) {
    blocks.push(
      `    <section class="resume-section" data-section="summary">\n` +
        `      <h2 class="section-title">个人简介</h2>\n` +
        `${renderSummary(content.summary)}\n` +
        `    </section>`,
    )
  }

  if (content.skills.length > 0) {
    blocks.push(
      `    <section class="resume-section" data-section="skills">\n` +
        `      <h2 class="section-title">技能</h2>\n` +
        `      <ul class="skill-list">\n${content.skills.map(renderSkill).join('\n')}\n      </ul>\n` +
        `    </section>`,
    )
  }

  if (content.experiences.length > 0) {
    blocks.push(
      `    <section class="resume-section" data-section="experiences">\n` +
        `      <h2 class="section-title">工作经历</h2>\n` +
        `${content.experiences.map(renderExperience).join('\n')}\n` +
        `    </section>`,
    )
  }

  if (content.projects.length > 0) {
    blocks.push(
      `    <section class="resume-section" data-section="projects">\n` +
        `      <h2 class="section-title">项目经历</h2>\n` +
        `${content.projects.map(renderProject).join('\n')}\n` +
        `    </section>`,
    )
  }

  if (content.education.length > 0) {
    blocks.push(
      `    <section class="resume-section" data-section="education">\n` +
        `      <h2 class="section-title">教育</h2>\n` +
        `      <ul class="edu-list">\n${content.education.map(renderEducation).join('\n')}\n      </ul>\n` +
        `    </section>`,
    )
  }

  const extras = content.extras.filter((extra) => has(extra.label) && has(extra.text))
  if (extras.length > 0) {
    const rows = extras
      .map(
        (extra) =>
          `        <li class="extra-item"><span class="extra-label">${escapeHtml(extra.label)}</span>` +
          `<span class="extra-text">${escapeHtml(extra.text)}</span></li>`,
      )
      .join('\n')
    blocks.push(
      `    <section class="resume-section" data-section="extras">\n` +
        `      <h2 class="section-title">其他</h2>\n` +
        `      <ul class="extra-list">\n${rows}\n      </ul>\n` +
        `    </section>`,
    )
  }

  return `<div class="resume template-${options.template ?? 'concise'}">\n${blocks.join('\n')}\n  </div>`
}

const CJK_FONT_STACK =
  '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans CJK SC", SimSun, sans-serif'

/**
 * 打印样式表。
 *
 * 两个模板**共用一套结构**，只在颜色与左框线上分叉（见 `.template-*`），
 * 这样"换个模板"永远只是换皮，不会改变分页与断行行为。
 * 所有颜色都被刻意选成**黑白打印下依然可读**：黑白打印机把 #1f4e79 打成深灰，
 * 不会像浅色那样直接消失。
 *
 * 2026-09-17 重排（用户反馈"预览出来不好看"）。病根不是配色，是**版式的层级与节奏**：
 *   1. 每个段落标题下面都横贯一条灰线 → 整页像表格，这是"老式模板"观感的来源。
 *      改成**只在标题文字下面划一条短线**（`inline-block` + `currentColor`），
 *      于是"简洁"是黑短线、"专业"自动是主题色短线，不需要为两套模板各写一遍。
 *   2. 技能用 `space-between` 把备注推到最右，看起来像被吹散的浮字。
 *      改成"名字 + 备注"成对流动的云状排布，十几项技能只占两三行。
 *   3. 元信息（时间 / 技术栈）比正文还深，抢了公司名的注意力。统一降到 #6b7280。
 *   4. 标题与正文的字号差太小（12pt vs 10.5pt），层级立不起来：标题 11pt + 字距 0.1em，
 *      靠"字重 + 字距 + 短线"区分，而不是靠"更大更黑"。
 */
function stylesheet(): string {
  return `    :root { color-scheme: light only; }
    @page { size: A4; margin: 14mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    /* @page 只在**打印**时生效，屏幕上会被忽略 —— 于是预览里文字会直接贴到纸边，
       看起来又挤又"不像一份文档"。所以屏幕上用内边距把同一个版心补出来，
       打印时再归零，免得页边距翻倍。两边的版心因此完全一致（预览即所得）。 */
    body { padding: 14mm; }
    @media print { body { padding: 0; } }
    body {
      /* 中文落在默认 serif 上会变成点阵观感，字体栈必须写死（R1）。 */
      font-family: ${CJK_FONT_STACK};
      /* 用 pt 而不是 px：打印链路按物理单位排版，px 在不同 DPI 下会漂。 */
      font-size: 10.5pt;
      line-height: 1.62;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    a { color: inherit; text-decoration: none; }
    ul { list-style: none; margin: 0; padding: 0; }

    /* ── 页眉 ────────────────────────────────────────────────────────────
       姓名与求职意向**同一行**（基线对齐），头部从三行收到两行。
       整页的贯穿线仍只有页眉这一条（1pt 近黑）。 */
    .resume-header { border-bottom: 1pt solid #111827; padding-bottom: 7pt; margin-bottom: 12pt; }
    .resume-headline { display: flex; align-items: baseline; gap: 9pt; flex-wrap: wrap; }
    .resume-name { margin: 0; font-size: 20pt; font-weight: 700; letter-spacing: 0.02em; line-height: 1.15; }
    .resume-job { margin: 0; font-size: 11pt; font-weight: 500; color: #4b5563; }
    .resume-contact { margin-top: 6pt; font-size: 9.5pt; color: #374151; }
    .resume-contact span { white-space: nowrap; }
    .resume-contact .sep { margin: 0 6pt; color: #cbd5e1; }
    /* 联系方式前的微型图标：内联 SVG，跟着文字颜色走 */
    .ico { width: 9.5pt; height: 9.5pt; vertical-align: -1pt; margin-right: 2.5pt; color: #9ca3af; }
    .resume-meta { margin-top: 2pt; font-size: 9.5pt; color: #374151; }

    /* ── 段落 ──────────────────────────────────────────────────────────
       标题：12pt 加粗 + 字距，下面一条 **1px 浅灰**贯穿线。
       注意这条线是 #e5e7eb —— 早先那版用 #bbbbbb/#d0d0d0 的中灰横线，
       每个标题一条、字号又大，整页就读成了表格；浅到"只提供分界、不抢视线"才对。
       段前留 15pt 余量，滚动时模块边界一眼可见。 */
    .resume-section { margin-top: 15pt; }
    .section-title {
      margin: 0 0 7pt;
      padding-bottom: 3pt;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      border-bottom: 1px solid #e5e7eb;
    }
    .resume-summary { margin: 0; text-align: justify; }

    /* 经历/项目块整体不可拆分：跨页断在成果列表中间，读起来像少了半段。 */
    .exp-item { margin: 0 0 10pt; break-inside: avoid; page-break-inside: avoid; }
    .exp-item:last-child { margin-bottom: 0; }
    /* 两端对齐：左边「公司 · 职位」是一个短语，右边时间；不再三处分散 */
    .exp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
    .exp-company { font-weight: 600; }
    .exp-title { font-weight: 400; color: #4b5563; }
    .exp-period { font-size: 9.5pt; color: #6b7280; white-space: nowrap; }
    .exp-points { margin: 3pt 0 0; padding-left: 11pt; list-style: disc; }
    /* 条与条之间给 3pt（≈4px）余量；行高仍用正文的 1.62 ——
       反馈建议压到 1.4~1.5，但那是**更挤**，与"提升阅读舒适度"的意图相反。 */
    .exp-points li { margin: 0 0 3pt; }
    .exp-points li:last-child { margin-bottom: 0; }
    /* 技术栈：微型浅底色块 + 前缀，与正文和项目符号明确分开（原先是一行浅灰小字） */
    .exp-stack { display: flex; flex-wrap: wrap; align-items: center; gap: 4pt; margin: 4pt 0 0; }
    .stack-label { font-size: 9pt; font-weight: 600; color: #6b7280; }
    .stack-tag { font-size: 9pt; line-height: 15pt; padding: 0 5pt; border-radius: 3pt;
      background: #f1f3f5; color: #374151; }

    /* 技能：整项一块浅底色块。名字加粗、等级半粗、证据更浅 ——
       三者不同色重，"精通"与"了解"才看得出来。 */
    .skill-list { display: flex; flex-wrap: wrap; gap: 4pt; }
    .skill-item { display: flex; align-items: baseline; gap: 4pt; break-inside: avoid;
      padding: 1.5pt 7pt; border-radius: 3pt; background: #f1f3f5; }
    .skill-name { font-weight: 600; }
    .skill-level { font-size: 9pt; font-weight: 600; color: #4b5563; }
    .skill-note { font-size: 9pt; color: #6b7280; }

    /* ── 教育 / 附加条目 ─────────────────────────────────────────────── */
    .edu-list { margin: 0; }
    .edu-item { display: flex; justify-content: space-between; gap: 8pt; margin-bottom: 2.5pt; break-inside: avoid; }
    /* 学校是锚点；专业与学历退成常规灰（原先整行一个粗体，三者没有落点） */
    .edu-main { font-weight: 600; }
    .edu-extra { font-weight: 400; color: #4b5563; }

    .extra-item { display: flex; gap: 8pt; margin-bottom: 2.5pt; break-inside: avoid; }
    .extra-label { font-weight: 600; white-space: nowrap; }
    .extra-text { color: #374151; }

    /* ── 模板分叉：简洁 = 纯灰阶；专业 = 主题色 + 经历块左侧框线 ────── */
    .template-professional .resume-name { color: #1f4e79; }
    .template-professional .resume-job { color: #1f4e79; }
    .template-professional .resume-header { border-bottom: 1.5pt solid #1f4e79; }
    .template-professional .section-title { color: #1f4e79; }
    .template-professional .exp-item { border-left: 2pt solid #1f4e79; padding-left: 7pt; }
    .template-professional .extra-label { color: #1f4e79; }`
}

/** 把结构化简历渲染成**自包含** HTML（无外链、无脚本、样式内联在 `<style>` 里）。 */
export function renderResumeHtml(content: ResumeContent, options: RenderOptions = {}): string {
  const template: ResumeTemplate = options.template ?? 'concise'
  const body = renderBody(content, { ...options, template })

  // 预览只换外壳：正文标记一字不改，避免"预览好看、打印走样"。
  // 去掉开头缩进，让片段本身也能被直接拼进调用方的 DOM。
  if (options.fragment === true) return body.trim()

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(content.basics.name)} - 简历</title>`,
    '    <style>',
    stylesheet(),
    '    </style>',
    '  </head>',
    '  <body>',
    `  ${body}`,
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}
