/**
 * 渲染器测试（§17 R1/R2）。
 *
 * 这一组测试刻意**不碰网络、不碰磁盘**：`.docx` 是自己拼的字节，那就自己解回来验，
 * 而不是"导出成功就算过"。特别是 ZIP 的 CRC —— 写错了本地跑没事，
 * 到了别人的 Word 里就是"文件已损坏"，那种失败在用户侧是无声的。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateRawSync } from 'node:zlib'
import type { ResumeContent } from '../../src/shared/domain/resume-content.js'
import { emptyResumeContent } from '../../src/shared/domain/resume-content.js'
import { renderResumeDocx } from '../../src/host/render/docx.js'
import { renderResumeHtml } from '../../src/host/render/resume-html.js'

// ─────────────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────────────

const FULL_RESUME: ResumeContent = {
  basics: {
    name: '张三',
    title: 'Java 后端开发',
    phone: '13800001111',
    email: 'zhangsan@example.com',
    city: '杭州',
    years: 5,
    age: 28,
    links: [{ label: 'GitHub', url: 'https://github.com/zhangsan' }],
  },
  summary: '五年后端经验，做过订单与支付系统，习惯用数据说话。',
  skills: [
    { name: 'Java', level: '精通', years: 5, evidence: '订单中台' },
    { name: 'MySQL', level: '熟练', years: 5, evidence: '支付对账' },
  ],
  experiences: [
    {
      company: '杭州云启科技有限公司',
      title: '高级后端工程师',
      start: '2021-07',
      end: '2024-06',
      city: '杭州',
      highlights: ['把订单接口 P99 从 800ms 压到 120ms', '负责支付对账，日处理 200 万笔'],
      stack: ['Java', 'Spring Boot', 'MySQL'],
    },
    { company: '某创业公司', title: '后端工程师', start: '2019-07', highlights: ['从零搭建用户中心'] },
  ],
  projects: [
    {
      name: '订单中台',
      role: '核心开发',
      period: '2022-03 – 2023-01',
      highlights: ['拆分订单状态机，线上事故下降 60%'],
      stack: ['Java', 'Kafka'],
    },
  ],
  education: [{ school: '浙江大学', major: '软件工程', degree: '本科', start: '2015-09', end: '2019-06' }],
  extras: [{ label: '语言', text: '英语 CET-6' }],
}

const EMPTY_RESUME = emptyResumeContent('Java 后端')

/** 各段落标题：空段落必须连标题一起消失（空标题比没标题更误导人）。 */
const SECTION_TITLES = ['个人简介', '技能', '工作经历', '项目经历', '教育', '其他']

// ─────────────────────────────────────────────────────────────────────
// 自制 ZIP 读取器：不引依赖，也不相信被测代码自己的说法
// ─────────────────────────────────────────────────────────────────────

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

interface ReadEntry {
  name: string
  crc: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
  /** 解压后的原始字节。 */
  content: Buffer
}

/**
 * CRC-32（表驱动）。
 *
 * 测试里**独立**再实现一遍是刻意的：如果复用被测代码的 CRC，等于让它自己给自己打分，
 * 表写反了也测不出来。
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function computeCrc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0)
  return (crc ^ 0xffffffff) >>> 0
}

/** 读 EOCD → 中央目录 → 每个 entry 的本地头与数据。任何一步不自洽都会断言失败。 */
function readZip(bytes: Uint8Array): ReadEntry[] {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)

  // EOCD 固定压在文件末尾（我们写出的容器没有注释，所以就是最后 22 字节）。
  // 刻意**不**从尾部全文搜索签名：压缩数据里完全可能凑巧出现 `PK\x05\x06`，
  // 那样会把游标指进数据区，读到一堆"看起来像偏移量"的垃圾（实测确实会）。
  assert.ok(buffer.length > 22, '字节数不足以容纳一个 ZIP 容器')
  const eocd = buffer.length - 22
  assert.equal(buffer.readUInt32LE(eocd), EOCD_SIGNATURE, '末尾不是 EOCD：这不是一个 ZIP 容器')
  assert.equal(buffer.readUInt16LE(eocd + 20), 0, '我们没有写归档注释，注释长度必须是 0')

  const total = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  assert.equal(centralOffset + centralSize, eocd, '中央目录结束位置应当正好接上 EOCD')
  assert.equal(total, EXPECTED_PARTS.length, '中央目录项数量与声明的部件数不符')

  const entries: ReadEntry[] = []
  let cursor = centralOffset

  for (let index = 0; index < total; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), CENTRAL_SIGNATURE, `第 ${String(index)} 个中央目录项签名不对`)
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const crc = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    // 中央目录头固定 46 字节：磁盘号(34) 内部属性(36) 外部属性(38,u32) 本地头偏移(42,u32)。
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')

    assert.equal((flags & 0x0800) !== 0, true, `${name} 未置 UTF-8 标志位（bit 11）`)
    assert.equal(method, 8, `${name} 的压缩方法不是 deflate`)

    assert.equal(buffer.readUInt32LE(localOffset), LOCAL_SIGNATURE, `${name} 的本地头签名不对`)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    entries.push({
      name,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
      content: inflateRawSync(raw),
    })

    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function entryNamed(entries: ReadEntry[], name: string): ReadEntry {
  const found = entries.find((entry) => entry.name === name)
  assert.ok(found !== undefined, `缺少部件：${name}`)
  return found
}

/**
 * 够用的良构检查：`<?xml` 开头 + 逐标签配对。
 *
 * 不引 XML 解析器（那要加依赖），但"标签是否配对"恰好是 OOXML 拼字符串最容易写错、
 * 也最致命的一处（Word 直接拒收）。
 *
 * 属性段用 `(?:"[^"]*"|'[^']*'|[^>])*` 整体吃掉，再单独取末尾的 `/` 判断自闭合 ——
 * 这样可以杜绝回溯把 `w:pStyle .../` 里的 `/` 当成属性内容，从而把自闭合标签误记为开标签。
 */
function assertTagsBalanced(xml: string, label: string): void {
  const stripped = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const stack: string[] = []
  for (const match of stripped.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g)) {
    const closing = match[1] === '/'
    const name = match[2] ?? ''
    const selfClosing = (match[3] ?? '').trimEnd().endsWith('/')
    if (selfClosing) continue
    if (closing) {
      assert.equal(stack.pop(), name, `${label}：</${name}> 与开标签不匹配`)
    } else {
      stack.push(name)
    }
  }
  assert.deepEqual(stack, [], `${label}：有未闭合的标签`)
}

const containsAll = (haystack: string, needles: string[], label: string): void => {
  for (const needle of needles) assert.ok(haystack.includes(needle), `${label} 里找不到「${needle}」`)
}

// ─────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────

test('页面带 CJK 字体栈、A4 打印规则与内联样式（自包含、无外链）', () => {
  const html = renderResumeHtml(FULL_RESUME)
  containsAll(
    html,
    ['Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'Noto Sans CJK SC', 'SimSun'],
    '样式表',
  )
  containsAll(html, ['@page { size: A4; margin: 14mm 14mm; }', '-webkit-print-color-adjust: exact', '10.5pt'], '样式表')
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('<style>'))
  // 自包含：既不能有外链，也不能有脚本（预览是真实浏览器环境）。
  assert.equal(/<link|<script|@import|https?:\/\/[^"']*\.(?:css|js)/.test(html), false, '不允许出现外链或脚本')
})

test('用户可控文本被转义：姓名与成果里的尖括号不会变成标签', () => {
  const html = renderResumeHtml({
    ...FULL_RESUME,
    basics: { ...FULL_RESUME.basics, name: '<script>alert(1)</script>' },
    experiences: [{ ...FULL_RESUME.experiences[0]!, highlights: ['熟悉 C++ 模板 <T> 与 a & b'] }],
  })
  assert.equal(html.includes('<script>alert(1)</script>'), false)
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('&lt;T&gt;'))
  assert.ok(html.includes('a &amp; b'))
})

test('跳过空段落：没有项目/其他就不该出现它们的标题', () => {
  const html = renderResumeHtml({ ...FULL_RESUME, projects: [], extras: [] })
  assert.ok(html.includes('工作经历'))
  assert.equal(html.includes('项目经历'), false)
  assert.equal(html.includes('其他'), false)
  assert.equal(html.includes('data-section="projects"'), false)
})

test('空简历不产生任何段落标题，只留下一个稳定的容器', () => {
  const html = renderResumeHtml(EMPTY_RESUME)
  for (const title of SECTION_TITLES) {
    assert.equal(html.includes(`>${title}<`), false, `空简历不该出现「${title}」标题`)
  }
  assert.ok(html.includes('class="resume template-concise"'))
})

test('fragment 只给正文标记：没有 <html>/<head>/<style>，但类名保持可复用', () => {
  const fragment = renderResumeHtml(FULL_RESUME, { fragment: true })
  assert.equal(fragment.includes('<html'), false)
  // 注意要查 `<head>` 而不是 `<head`：页眉元素叫 `<header>`，子串匹配会误伤。
  assert.equal(fragment.includes('<head>'), false)
  assert.equal(fragment.includes('<style'), false)
  assert.equal(fragment.includes('<!DOCTYPE'), false)
  assert.ok(fragment.startsWith('<div class="resume template-concise">'))
  containsAll(fragment, ['resume-header', 'resume-name', 'resume-section', 'exp-item', 'section-title'], '片段')

  const page = renderResumeHtml(FULL_RESUME)
  assert.ok(page.includes(fragment), '整页应当原样包含同一份正文标记（预览与打印不漂移）')
})

test('两个模板只差在配色与左框线，正文内容完全一致', () => {
  const concise = renderResumeHtml(FULL_RESUME, { template: 'concise' })
  const professional = renderResumeHtml(FULL_RESUME, { template: 'professional' })

  assert.ok(concise.includes('template-concise'))
  assert.ok(professional.includes('template-professional'))
  assert.ok(professional.includes('border-left: 2pt solid #1f4e79'))

  // 两种模板共用一个 <style>（换皮只换作用域），所以"简洁"页面里也会**存在**主题色规则；
  // 真正要守住的规矩是：每一条带主题色的规则都必须挂在 .template-professional 下，
  // 否则简洁模板的标题也会变蓝、黑白打印跟着花。
  for (const line of professional.split('\n')) {
    if (!line.includes('#1f4e79')) continue
    assert.ok(line.includes('.template-professional'), `主题色泄漏到了模板作用域之外：${line.trim()}`)
  }

  // 正文必须逐字一致：换模板只换皮，不允许影响内容与分页。
  // 两个模板的正文里各出现一次自己的作用域类名（容器 div 与 <style> 选择器），
  // 因此比对前先把 `template-<id>` 归一化掉；归一化后完全相等，
  // 就证明两种模板的差异**只**来自作用域类名（配色靠 CSS 作用域实现，不内联到标记里）。
  const normalize = (html: string): string => html.replaceAll(/template-(?:concise|professional)/g, 'template-X')
  assert.equal(normalize(concise), normalize(professional), '两个模板只应差在作用域类名与配色')
})

test('可选字段（年限/年龄）默认不出现，开关打开后才渲染', () => {
  const off = renderResumeHtml(FULL_RESUME)
  assert.equal(off.includes('年龄'), false)
  const on = renderResumeHtml(FULL_RESUME, { showOptional: true })
  containsAll(on, ['5 年经验', '年龄：28 岁'], '开启可选字段后')
})

test('时间区间：缺结束时间写「至今」，两端都没有就整行省略', () => {
  const html = renderResumeHtml(FULL_RESUME)
  assert.ok(html.includes('2021-07 – 2024-06'))
  assert.ok(html.includes('2019-07 – 至今'))

  const noDates = renderResumeHtml({
    ...EMPTY_RESUME,
    basics: { name: '李四', title: '测试' },
    experiences: [{ company: '某公司', title: '工程师', highlights: [] }],
  })
  assert.ok(noDates.includes('某公司'))
  assert.equal(noDates.includes('至今'), false)
  assert.equal(noDates.includes(' – '), false)
})

test('危险 scheme 不进 href，但文字仍然保留', () => {
  const html = renderResumeHtml({
    ...EMPTY_RESUME,
    basics: { name: '王五', title: '前端', links: [{ label: '主页', url: 'javascript:alert(1)' }] },
  })
  assert.equal(html.includes('javascript:alert(1)'), false)
  assert.ok(html.includes('主页'))
})

// ─────────────────────────────────────────────────────────────────────
// DOCX
// ─────────────────────────────────────────────────────────────────────

const EXPECTED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'docProps/app.xml',
  'docProps/core.xml',
  'word/_rels/document.xml.rels',
  'word/document.xml',
  'word/styles.xml',
]

test('docx 是一个真 ZIP：入口集合恰好是声明的那些部件', () => {
  const bytes = renderResumeDocx(FULL_RESUME)
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], `应以 ${String.raw`PK\x03\x04`} 开头`)

  const entries = readZip(bytes)
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [...EXPECTED_PARTS].sort(),
    'ZIP 里出现了没在 [Content_Types].xml 声明的部件',
  )
})

test('每个部件的 CRC-32 与解压后字节一致（自己算一遍，不信导出器）', () => {
  const entries = readZip(renderResumeDocx(FULL_RESUME))
  for (const entry of entries) {
    assert.equal(computeCrc32(entry.content), entry.crc, `${entry.name} 的 CRC-32 不对`)
    assert.equal(entry.content.length, entry.uncompressedSize, `${entry.name} 的长度与目录声明不符`)
    assert.equal(entry.compressedSize > 0, true, `${entry.name} 的压缩数据是空的`)
  }
})

test('每个部件都是良构 XML，且 [Content_Types].xml 声明了所有部件', () => {
  const entries = readZip(renderResumeDocx(FULL_RESUME))
  const contentTypes = entryNamed(entries, '[Content_Types].xml').content.toString('utf8')

  for (const part of EXPECTED_PARTS) {
    const entry = entryNamed(entries, part)
    const xml = entry.content.toString('utf8')
    if (part.endsWith('.xml') || part.endsWith('.rels')) {
      assert.ok(xml.startsWith('<?xml'), `${part} 缺少 XML 声明`)
      assertTagsBalanced(xml, part)
    }
  }

  // 声明的部件必须真的存在；存在的部件也必须被声明（两个方向都要查）。
  for (const part of EXPECTED_PARTS.slice(1)) {
    assert.ok(contentTypes.includes(`PartName="/${part}"`) || contentTypes.includes(`Extension="${part.split('.').pop() ?? ''}"`), `[Content_Types].xml 没有声明 ${part}`)
  }
  for (const match of contentTypes.matchAll(/PartName="\/([^"]+)"/g)) {
    assert.ok(EXPECTED_PARTS.includes(match[1] ?? ''), `[Content_Types].xml 声明了不存在的部件 ${match[1] ?? ''}`)
  }
})

test('document.xml 是可被 Word 读懂的正文：结构合法且带全简历文本', () => {
  const entries = readZip(renderResumeDocx(FULL_RESUME))
  const xml = entryNamed(entries, 'word/document.xml').content.toString('utf8')

  assert.ok(xml.startsWith('<?xml'))
  assertTagsBalanced(xml, 'word/document.xml')
  containsAll(xml, ['<w:body>', '<w:sectPr>', '<w:p>', '<w:r>', '<w:t xml:space="preserve">'], 'document.xml')

  // 假设渲染器直接吐纯文本、或把文本塞进属性里，这些断言就会挂。
  containsAll(
    xml,
    [
      '张三',
      'Java 后端开发',
      '13800001111',
      'zhangsan@example.com',
      '杭州云启科技有限公司',
      '把订单接口 P99 从 800ms 压到 120ms',
      '工作经历',
      '项目经历',
      '浙江大学',
      '订单中台',
      'MySQL',
      '英语 CET-6',
    ],
    'document.xml',
  )
})

test('docx 与 HTML 遵守同一套段落顺序与判空规则', () => {
  const partial: ResumeContent = {
    basics: { name: '赵六', title: '数据工程师' },
    summary: '',
    skills: [{ name: 'Spark' }],
    experiences: [],
    projects: [],
    education: [],
    extras: [],
  }

  const entries = readZip(renderResumeDocx(partial))
  const xml = entryNamed(entries, 'word/document.xml').content.toString('utf8')
  assert.ok(xml.includes('技能'))
  assert.ok(xml.includes('Spark'))
  for (const title of ['工作经历', '项目经历', '教育', '其他']) {
    assert.equal(xml.includes(`>${title}<`), false, `docx 不该出现空的「${title}」标题`)
  }

  const html = renderResumeHtml(partial)
  for (const title of ['工作经历', '项目经历', '教育', '其他']) {
    assert.equal(html.includes(`>${title}<`), false, `HTML 不该出现空的「${title}」标题`)
  }
})

test('空简历也产出可打开的最小文档，不出现任何段落标题', () => {
  const entries = readZip(renderResumeDocx(EMPTY_RESUME))
  const xml = entryNamed(entries, 'word/document.xml').content.toString('utf8')
  assertTagsBalanced(xml, 'word/document.xml')
  for (const title of SECTION_TITLES) {
    assert.equal(xml.includes(`>${title}<`), false, `空简历不该出现「${title}」标题`)
  }
})

test('XML 特殊字符被转义，不会破坏 w:t 结构', () => {
  const risky: ResumeContent = {
    ...EMPTY_RESUME,
    basics: { name: 'A & B <T>', title: '研发"高级"' },
    skills: [{ name: 'C++ & Rust' }],
  }
  const xml = entryNamed(readZip(renderResumeDocx(risky)), 'word/document.xml').content.toString('utf8')
  assertTagsBalanced(xml, 'word/document.xml')
  containsAll(xml, ['A &amp; B &lt;T&gt;', 'C++ &amp; Rust'], 'document.xml')
})

test('两个模板都产出自洽的文档，且内容一致（只差样式）', () => {
  for (const template of ['concise', 'professional'] as const) {
    const entries = readZip(renderResumeDocx(FULL_RESUME, { template }))
    const xml = entryNamed(entries, 'word/document.xml').content.toString('utf8')
    assertTagsBalanced(xml, `word/document.xml (${template})`)
    assert.ok(xml.includes('杭州云启科技有限公司'))
  }

  const textOf = (template: 'concise' | 'professional'): string =>
    entryNamed(readZip(renderResumeDocx(FULL_RESUME, { template })), 'word/document.xml')
      .content.toString('utf8')
      // 颜色有**两种**写法：run 级的 `<w:color w:val/>`，以及段落边框里作为属性的
      // `w:color="..."`（页眉那条贯穿线就是后者，且它随模板变色）。
      // 两种都要剥掉，否则"只差样式"这条会被样式本身误判成内容差异。
      .replace(/<w:color[^/]*\/>/g, '')
      .replace(/\sw:color="[0-9A-Fa-f]{6}"/g, '')
  assert.equal(textOf('concise'), textOf('professional'), '两个模板的正文文本应当完全一致')
})

test('docx 渲染是确定性的：同一份输入两次调用字节完全相同', () => {
  const first = renderResumeDocx(FULL_RESUME, { template: 'professional' })
  const second = renderResumeDocx(FULL_RESUME, { template: 'professional' })
  assert.deepEqual(Buffer.from(first), Buffer.from(second))
  // 时间戳写死的意义就在这里：不写死的话两次导出永远不可能相等。
  assert.equal(Buffer.from(first).equals(Buffer.from(second)), true)
})
