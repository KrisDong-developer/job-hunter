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
import type { ResumeTemplate } from '../../shared/enums.js'
import type {
  ResumeBasics,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkill,
} from '../../shared/resume.js'

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

/** 技能行右端的小字：等级 / 年限 / 证据。 */
function skillNote(skill: ResumeSkill): string {
  const parts: string[] = []
  if (has(skill.level)) parts.push(escapeHtml(skill.level))
  if (typeof skill.years === 'number') parts.push(`${String(skill.years)} 年`)
  if (has(skill.evidence)) parts.push(escapeHtml(skill.evidence))
  return parts.join(' · ')
}

// ─────────────────────────────────────────────────────────────────────
// 页眉
// ─────────────────────────────────────────────────────────────────────

function renderBasics(basics: ResumeBasics, showOptional: boolean): string {
  const out: string[] = []
  if (has(basics.name)) out.push(`      <h1 class="resume-name">${escapeHtml(basics.name)}</h1>`)
  if (has(basics.title)) out.push(`      <p class="resume-job">${escapeHtml(basics.title)}</p>`)

  // 联系方式行的顺序固定：手机 → 邮箱 → 城市 → 链接。HR 找手机号时手是有肌肉记忆的。
  const contacts: string[] = []
  if (has(basics.phone)) contacts.push(`<span>${escapeHtml(basics.phone)}</span>`)
  if (has(basics.email)) contacts.push(`<span>${escapeHtml(basics.email)}</span>`)
  if (has(basics.city)) contacts.push(`<span>${escapeHtml(basics.city)}</span>`)
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

  // 可选字段（R3 开关）：默认不出现，避免"35 岁"这类信息在没想清楚的时候被自动投出去。
  if (showOptional) {
    const meta: string[] = []
    if (typeof basics.years === 'number') meta.push(`工作经验：${String(basics.years)} 年`)
    if (typeof basics.age === 'number') meta.push(`年龄：${String(basics.age)} 岁`)
    if (meta.length > 0) {
      out.push(`      <div class="resume-meta">${escapeHtml(meta.join(' · '))}</div>`)
    }
  }

  return out.join('\n')
}

// ─────────────────────────────────────────────────────────────────────
// 段落
// ─────────────────────────────────────────────────────────────────────

function renderSummary(summary: string): string {
  return `      <p class="resume-summary">${escapeHtml(summary)}</p>`
}

/** 技能做成 `名字 …… 备注` 的两端对齐行：一眼能扫出"熟练度分布"，比一段散文好读。 */
function renderSkill(skill: ResumeSkill): string {
  const note = skillNote(skill)
  const tail = note === '' ? '' : `\n            <span class="skill-note">${note}</span>`
  return `        <li class="skill-item">\n            <span class="skill-name">${escapeHtml(skill.name)}</span>${tail}\n          </li>`
}

function renderExperience(experience: ResumeExperience): string {
  const heading = [escapeHtml(experience.company), has(experience.title) ? escapeHtml(experience.title) : '']
    .filter((part) => part !== '')
    .join(' · ')
  const tail = [dateRange(experience.start, experience.end), has(experience.city) ? escapeHtml(experience.city) : '']
    .filter((part) => part !== '')
    .join(' | ')

  const lines: string[] = [`        <div class="exp-head">`]
  lines.push(`            <span class="exp-company">${heading}</span>`)
  if (tail !== '') lines.push(`            <span class="exp-period">${tail}</span>`)
  lines.push(`          </div>`)
  if (experience.highlights.length > 0) {
    lines.push(`          <ul class="exp-points">`)
    for (const highlight of experience.highlights) {
      lines.push(`            <li>${escapeHtml(highlight)}</li>`)
    }
    lines.push(`          </ul>`)
  }
  if ((experience.stack ?? []).length > 0) {
    const stack = (experience.stack ?? []).map(escapeHtml).join(' / ')
    lines.push(`          <p class="exp-stack">技术栈：${stack}</p>`)
  }
  return `        <div class="exp-item">\n${lines.join('\n')}\n        </div>`
}

function renderProject(project: ResumeProject): string {
  const headingBits = [escapeHtml(project.name)]
  if (has(project.role)) headingBits.push(escapeHtml(project.role))
  const tail = has(project.period) ? escapeHtml(project.period) : ''

  const lines: string[] = [`        <div class="exp-head">`]
  lines.push(`            <span class="exp-company">${headingBits.join(' · ')}</span>`)
  if (tail !== '') lines.push(`            <span class="exp-period">${tail}</span>`)
  lines.push(`          </div>`)
  if (project.highlights.length > 0) {
    lines.push(`          <ul class="exp-points">`)
    for (const highlight of project.highlights) {
      lines.push(`            <li>${escapeHtml(highlight)}</li>`)
    }
    lines.push(`          </ul>`)
  }
  if ((project.stack ?? []).length > 0) {
    const stack = (project.stack ?? []).map(escapeHtml).join(' / ')
    lines.push(`          <p class="exp-stack">技术栈：${stack}</p>`)
  }
  return `        <div class="exp-item">\n${lines.join('\n')}\n        </div>`
}

/** 教育压缩成一行（学校 · 专业 · 学历 + 时间）：它在多数简历里只配占一行。 */
function renderEducation(education: ResumeEducation): string {
  const parts = [escapeHtml(education.school)]
  if (has(education.major)) parts.push(escapeHtml(education.major))
  if (has(education.degree)) parts.push(escapeHtml(education.degree))
  const tail = dateRange(education.start, education.end)
  return `          <li class="edu-item"><span class="edu-main">${parts.join(' · ')}</span>${
    tail === '' ? '' : `<span class="exp-period">${tail}</span>`
  }</li>`
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
 */
function stylesheet(): string {
  return `    :root { color-scheme: light only; }
    @page { size: A4; margin: 14mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
      /* 中文落在默认 serif 上会变成点阵观感，字体栈必须写死（R1）。 */
      font-family: ${CJK_FONT_STACK};
      /* 用 pt 而不是 px：打印链路按物理单位排版，px 在不同 DPI 下会漂。 */
      font-size: 10.5pt;
      line-height: 1.6;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    a { color: inherit; text-decoration: none; }
    ul { list-style: none; margin: 0; padding: 0; }

    .resume-header { border-bottom: 1px solid #d0d0d0; padding-bottom: 6pt; margin-bottom: 10pt; }
    .resume-name { margin: 0; font-size: 19pt; font-weight: 700; letter-spacing: 0.03em; }
    .resume-job { margin: 2pt 0 0; font-size: 11pt; }
    .resume-contact { margin-top: 4pt; font-size: 9.5pt; color: #3a3a3a; }
    .resume-contact .sep { margin: 0 6pt; color: #9a9a9a; }
    .resume-meta { margin-top: 2pt; font-size: 9.5pt; color: #3a3a3a; }

    .resume-section { margin-top: 10pt; }
    .section-title {
      margin: 0 0 4pt;
      font-size: 12pt;
      font-weight: 700;
      padding-bottom: 1pt;
      border-bottom: 1px solid #d0d0d0;
    }
    .resume-summary { margin: 0; text-align: justify; }

    /* 经历/项目块整体不可拆分：跨页断在成果列表中间，读起来像少了半段。 */
    .exp-item { margin: 0 0 8pt; break-inside: avoid; page-break-inside: avoid; }
    .exp-item:last-child { margin-bottom: 0; }
    .exp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
    .exp-company { font-weight: 700; }
    .exp-period { font-size: 9.5pt; color: #4a4a4a; white-space: nowrap; }
    .exp-points { margin: 2pt 0 0; padding-left: 12pt; list-style: disc; }
    .exp-points li { margin: 0 0 1pt; text-align: justify; }
    .exp-stack { margin: 2pt 0 0; font-size: 9.5pt; color: #4a4a4a; }

    .skill-item { display: flex; justify-content: space-between; gap: 8pt; margin-bottom: 1pt; break-inside: avoid; }
    .skill-name { font-weight: 600; }
    .skill-note { font-size: 9.5pt; color: #4a4a4a; text-align: right; }

    .edu-item { display: flex; justify-content: space-between; gap: 8pt; margin-bottom: 1pt; break-inside: avoid; }
    .edu-main { font-weight: 600; }

    .extra-item { margin-bottom: 2pt; break-inside: avoid; }
    .extra-label { font-weight: 600; margin-right: 6pt; }
    .extra-text { color: #2a2a2a; }

    /* 简洁：只有一条细分隔线，没有任何彩色。 */
    .template-concise .section-title { border-bottom: 1px solid #bbbbbb; }

    /* 专业：标题带主题色，经历块左侧一条框线做视觉分组。 */
    .template-professional .resume-name { color: #1f4e79; }
    .template-professional .resume-job { color: #1f4e79; }
    .template-professional .resume-header { border-bottom: 1.5pt solid #1f4e79; }
    .template-professional .section-title { color: #1f4e79; border-bottom: 1px solid #1f4e79; }
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
