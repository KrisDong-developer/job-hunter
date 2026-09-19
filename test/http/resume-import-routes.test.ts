/**
 * A3（简历导入）与 R9（自有附件上传）。
 *
 * ## 这个文件在钉两件事
 *
 * 1. **导入只吃文本**。本仓库没有 PDF/DOCX 解析库，所以"从 PDF 字节直接解析"这件事
 *    刻意不做（硬做只会把脏数据写进简历库）。但**粘贴文本 → 结构化**必须真的能用：
 *    在此之前简历只能一条条手填，那正是首次使用最大的流失点。
 * 2. **附件必须真的能进来**。在此之前 `addFile` 只在 `exportResume` 里被调用 ——
 *    也就是说"用户手上那份 PDF"永远进不了库，投递归因（R6）就缺一半数据。
 *
 * 模型路径用一个假的 `llm` 端口（与 `test/host/ai-wiring.test.ts` 同一手法）：
 * 这里要验的是**接线与降级是否如实**，不是某个真模型的输出质量。
 *
 * 本文件不发任何网络请求，也不开浏览器。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LlmSourceLike } from '../../src/host/ai/llm-port.js'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { ATTACHMENT_MAX_BYTES } from '../../src/shared/constants.js'
import { cleanup, tempDataDir } from '../support/store.js'

/** 一段"从 PDF 里复制出来"的简历文本。 */
const SOURCE_TEXT = [
  '张三',
  '前端开发工程师 ｜ 深圳 ｜ 5 年经验',
  '',
  '技能：JavaScript、TypeScript、React、Node.js',
  '',
  '工作经历',
  '某某科技有限公司 ｜ 高级前端工程师 ｜ 2021.03 - 至今',
  '- 主导后台系统重构，首屏加载从 3.2s 降到 1.1s',
  '',
  '教育',
  '某某大学 ｜ 计算机科学与技术 ｜ 本科 ｜ 2016.09 - 2020.06',
].join('\n')

/**
 * 假模型：返回一份**故意带两处"原文里没有"**的解析结果。
 *
 * 故意不干净是有原因的：导入路径的核对提示（`ungroundedNotes`）只有在这种情况下才会触发，
 * 而"模型解析错了一个技术词 / 一个数字"正是用户最需要被告知的事。
 */
function fakeLlm(): LlmSourceLike {
  const content = {
    basics: { name: '张三', title: '前端开发工程师', city: '深圳', years: 7 },
    summary: '5 年前端开发经验。',
    skills: [{ name: 'React' }, { name: 'Kubernetes' }],
    experiences: [
      {
        company: '某某科技有限公司',
        title: '高级前端工程师',
        start: '2021-03',
        highlights: ['主导后台系统重构，首屏加载从 3.2s 降到 1.1s'],
      },
    ],
    projects: [],
    education: [{ school: '某某大学', major: '计算机科学与技术', degree: '本科' }],
    extras: [],
  }
  return {
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify({ content }) }
      yield { type: 'finish' }
    },
  }
}

async function openRuntime(withLlm = false): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({
    dataDir: dir,
    ...(withLlm
      ? { llm: fakeLlm(), defaultModel: { currentSelection: () => ({ provider: 'test', model: 'fake-1' }) } }
      : {}),
  })
  await runtime.ready()
  if (withLlm) {
    // 用途默认是**关**的（整份简历文本要外发，属 I5 显式同意范围）
    runtime.ai().setConfig({ purposes: { resume_import: true } })
  }
  return { runtime, dir }
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { body?: unknown } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin: true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

test('粘贴文本 → 结构化：模型解析出来的内容要落库，并标出可疑处', async () => {
  const { runtime, dir } = await openRuntime(true)
  try {
    const result = await call(runtime, 'POST', '/resumes/import', { body: { text: SOURCE_TEXT } })
    assert.equal(result.status, 201)
    const body = result.body as {
      via: string
      notes: string[]
      resume: { id: number; name: string } | null
      content: { basics: { name: string; years?: number }; skills: Array<{ name: string }>; experiences: unknown[] }
    }
    assert.equal(body.via, 'llm')
    assert.ok(body.resume !== null, 'save 默认 true')
    assert.equal(body.content.basics.name, '张三')
    assert.equal(body.content.experiences.length, 1)
    assert.equal(body.resume?.name, '前端开发工程师', '版本名默认取解析出来的目标岗位')

    // 核对提示：Kubernetes 与 7 年都不在原文里 —— 用户需要在保存前看到这两条
    // （技术词统一小写输出，所以这里按小写比）
    const notes = body.notes.join('\n').toLowerCase()
    assert.ok(notes.includes('kubernetes'), `技术词核对提示缺失：${notes}`)
    assert.ok(notes.includes('7'), `数字核对提示缺失：${notes}`)
    // 反过来：原文里确实有的东西**不该**被报成可疑（否则提示会被无视）
    assert.equal(notes.includes('react'), false, `React 在原文里，不该被标成可疑：${notes}`)

    // 真的落库了：列表里能查到，且体检报告跟着回来
    const list = await call(runtime, 'GET', '/resumes')
    assert.equal((list.body as { items: unknown[] }).items.length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('没开模型（或没有模型）：**不做解析**，但原文一字不丢，且如实说明', async () => {
  const { runtime, dir } = await openRuntime(false)
  try {
    const result = await call(runtime, 'POST', '/resumes/import', { body: { text: SOURCE_TEXT } })
    assert.equal(result.status, 201)
    const body = result.body as {
      via: string
      notes: string[]
      content: { extras: Array<{ label: string; text: string }>; experiences: unknown[] }
    }
    assert.equal(body.via, 'rule', '没调模型就要说没调')
    assert.equal(body.content.experiences.length, 0)
    assert.ok(body.content.extras[0]?.text.includes('某某科技有限公司'), '原文必须原样保留 —— 否则用户白粘一次')
    assert.ok(body.content.extras[0]?.label.includes('原始文本'))
    assert.ok(body.notes.join('').includes('没有调用模型') || body.notes.join('').includes('模型'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('save=false 只解析不落库；空文本与超长文本被拒', async () => {
  const { runtime, dir } = await openRuntime(false)
  try {
    const preview = await call(runtime, 'POST', '/resumes/import', { body: { text: SOURCE_TEXT, save: false } })
    assert.equal(preview.status, 200, '不落库就不是"已创建"')
    assert.equal((preview.body as { resume: unknown }).resume, null)
    const list = await call(runtime, 'GET', '/resumes')
    assert.deepEqual((list.body as { items: unknown[] }).items, [])

    assert.equal((await call(runtime, 'POST', '/resumes/import', { body: { text: '   ' } })).status, 400)
    assert.equal(
      (await call(runtime, 'POST', '/resumes/import', { body: { text: 'x'.repeat(20_001) } })).status,
      400,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('上传自有 PDF：真的存下来、能读回、能删', async () => {
  const { runtime, dir } = await openRuntime(false)
  try {
    const created = await call(runtime, 'POST', '/resumes', { body: { name: '我的简历' } })
    const resumeId = (created.body as { resume: { id: number } }).resume.id

    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'utf8')
    const uploaded = await call(runtime, 'POST', `/resumes/${String(resumeId)}/files`, {
      body: { fileName: '张三-前端-5年.pdf', contentBase64: pdf.toString('base64') },
    })
    assert.equal(uploaded.status, 201)
    const file = (uploaded.body as { file: { id: number; format: string; fileName: string; bytes: number } }).file
    assert.equal(file.format, 'pdf')
    assert.equal(file.fileName, '张三-前端-5年.pdf')
    assert.equal(file.bytes, pdf.byteLength)

    /**
     * 落盘名必须是 ASCII，而显示名保留中文。
     *
     * 这条断言挡的是一个**真实发生过的进程级故障**：Windows + Node 24 下
     * `rmSync` 一个含中文的文件名会把宿主进程直接打崩（native crash，0xC0000409，
     * JS 侧 `try/catch` 根本进不去）。所以"删除附件"曾经 = 宿主进程消失。
     */
    const stored = runtime.store()?.resume.getFile(file.id)
    assert.ok(stored !== undefined)
    assert.match(stored.path, /^[\x20-\x7e]+$/, `落盘路径必须无中文：${stored.path}`)
    assert.equal(stored.fileName, '张三-前端-5年.pdf', '显示名仍要保留中文（HR 看到的就是它）')

    // 列表里看得到（投递时选"用哪份简历"就靠它）
    const list = await call(runtime, 'GET', '/resumes')
    const summaries = (list.body as { items: Array<{ files: Array<{ id: number }> }> }).items
    assert.equal(summaries[0]?.files.length, 1)

    // 读回：下载路由要能吐回一模一样的字节
    const downloaded = await routeRequest(runtime, {
      method: 'GET',
      path: `/files/${String(file.id)}`,
      query: new URLSearchParams(''),
      headers: {},
      sameOrigin: true,
      readJson: async () => undefined,
    })
    assert.equal(downloaded.kind, 'bytes')
    if (downloaded.kind === 'bytes') {
      assert.equal(Buffer.from(downloaded.bytes).equals(pdf), true, '字节必须原样')
      assert.equal(downloaded.contentType, 'application/pdf')
    }

    assert.equal((await call(runtime, 'DELETE', `/files/${String(file.id)}`)).status, 200)
    assert.equal((await call(runtime, 'DELETE', `/files/${String(file.id)}`)).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('上传校验：坏 base64 / 改过扩展名 / 超体积 / 老 doc，都必须拦下', async () => {
  const { runtime, dir } = await openRuntime(false)
  try {
    const created = await call(runtime, 'POST', '/resumes', { body: { name: '我的简历' } })
    const resumeId = (created.body as { resume: { id: number } }).resume.id
    const path = `/resumes/${String(resumeId)}/files`
    const goodPdf = Buffer.from('%PDF-1.7\n%%EOF\n', 'utf8').toString('base64')

    // data: 前缀是最常见的误用 —— 严格 base64 会拦住它，而不是静默解析成空文件
    const withPrefix = await call(runtime, 'POST', path, {
      body: { fileName: 'a.pdf', contentBase64: `data:application/pdf;base64,${goodPdf}` },
    })
    assert.equal(withPrefix.status, 400)

    // 扩展名说是 PDF，字节其实是 zip（改过扩展名的典型）
    const wrongMagic = await call(runtime, 'POST', path, {
      body: { fileName: 'a.pdf', contentBase64: Buffer.from('PK\u0003\u0004zzz').toString('base64') },
    })
    assert.equal(wrongMagic.status, 400)
    assert.ok(JSON.stringify(wrongMagic.body).includes('%PDF'))

    // 老版 .doc：与 docx 是完全不同的字节结构，明确拒绝并给出下一步
    const legacyDoc = await call(runtime, 'POST', path, {
      body: { fileName: 'a.doc', contentBase64: goodPdf },
    })
    assert.equal(legacyDoc.status, 400)

    // 超过 5MB
    const tooBig = await call(runtime, 'POST', path, {
      body: { fileName: 'big.pdf', contentBase64: Buffer.alloc(ATTACHMENT_MAX_BYTES + 1).toString('base64') },
    })
    assert.equal(tooBig.status, 400)

    // 简历不存在
    const missingResume = await call(runtime, 'POST', '/resumes/9999/files', {
      body: { fileName: 'a.pdf', contentBase64: goodPdf },
    })
    assert.equal(missingResume.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
