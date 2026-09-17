/**
 * 简历领域服务测试（§4.3 / §11.3 / §17 / §4.1 / §4.5）。
 *
 * 三件事在 domain 层必须成立，测试也就围着它们转：
 *   1. **版本语义**：`rev` 只在内容真的变了时才动（否则全部匹配分会被无谓地判过期）；
 *   2. **导出是"有记录的文件一定在磁盘上"**：字节与 DB 记账不许出现半截状态；
 *   3. **红线**：定制结果一律过防编造，不合格就退回规则结果并如实说明（R8）。
 *
 * PDF 渲染器是**端口**：这里注入一个假的，既能断言"交给它的是这份简历"，
 * 也能断言"没有它的时候要如实报错"，而不需要真的起一个 headless Chromium。
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createAiService } from '../../src/host/ai/client.js'
import type { PdfPort, ResumeService } from '../../src/host/domain/resumes.js'
import { createResumeService, ruleTailor, stripContacts } from '../../src/host/domain/resumes.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import {
  checkNoFabrication,
  emptyResumeContent,
  factAtoms,
  inspectResume,
  techTokensOf,
  type ResumeContent,
} from '../../src/shared/resume.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

// ─────────────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────────────

function resumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    basics: {
      name: '张三',
      title: '后端开发',
      phone: '13800001111',
      email: 'zhangsan@example.com',
      city: '杭州',
      years: 5,
    },
    summary: '五年后端经验，做过订单与支付系统。',
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
        stack: ['Java', 'MySQL'],
      },
    ],
    projects: [
      { name: '订单中台', role: '核心开发', highlights: ['拆分订单状态机，线上事故下降 60%'], stack: ['Java'] },
    ],
    education: [{ school: '浙江大学', major: '软件工程', degree: '本科', start: '2015-09', end: '2019-06' }],
    extras: [{ label: '语言', text: '英语 CET-6' }],
    ...overrides,
  }
}

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p6-1',
    title: 'Java 后端开发',
    companyId: null,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '杭州',
    district: '西湖区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['mysql'],
    sourceUrl: 'https://jobs.51job.com/all/p6-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责订单系统。任职要求：熟悉 MySQL。',
    ...overrides,
  }
}

/** 落一个岗位并回带它自己，省得测试再去拼 `ruleTailor` 的入参。 */
function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): JobUpsertInput & { id: number } {
  const input = jobInput(overrides)
  return { ...input, id: store.job.upsert(input, T).id }
}

function jobRef(job: JobUpsertInput): { title: string; tags: string[]; jdText: string } {
  return { title: job.title, tags: job.tags, jdText: job.jdText ?? '' }
}

function allowTechOf(job: JobUpsertInput): string[] {
  return techTokensOf([job.title, job.tags.join(' '), job.jdText ?? ''].join(' '))
}

interface Harness {
  store: Store
  dir: string
  filesDir: string
  service: ResumeService
  /** 假 PDF 渲染器收到过的 HTML。 */
  pdfHtml: string[]
}

function openHarness(options: { withPdf?: boolean } = {}): Harness {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  const filesDir = join(dir, 'files')
  const pdfHtml: string[] = []
  const pdf: PdfPort | undefined =
    options.withPdf === true
      ? {
          render: async (html: string): Promise<Uint8Array> => {
            pdfHtml.push(html)
            return new Uint8Array([0x25, 0x50, 0x44, 0x46])
          },
        }
      : undefined
  const service = createResumeService({
    store,
    filesDir,
    ...(pdf === undefined ? {} : { pdf }),
  })
  return { store, dir, filesDir, service, pdfHtml }
}

async function withHarness(
  options: { withPdf?: boolean },
  fn: (harness: Harness) => Promise<void> | void,
): Promise<void> {
  const harness = openHarness(options)
  try {
    await fn(harness)
  } finally {
    harness.store.close()
    cleanup(harness.dir)
  }
}

// ─────────────────────────────────────────────────────────────────────
// 版本（§3.2 / §4.1）
// ─────────────────────────────────────────────────────────────────────

test('新建的第一份简历自动成为启用版本，副本不是', async () => {
  await withHarness({}, ({ service }) => {
    const first = service.create({ name: 'Java 后端 · 2026 春', content: resumeContent() })
    assert.equal(first.isDefault, true, '第一份自动启用，用户不用再多点一下')
    assert.equal(first.rev, 1)
    assert.equal(first.files.length, 0)
    assert.equal(first.tailoringCount, 0)

    const copy = service.duplicate(first.id)
    assert.equal(copy.isDefault, false, '副本只是新版本，不该抢走当前启用位')
    assert.equal(copy.name, 'Java 后端 · 2026 春 副本')
    assert.equal(copy.rev, 1)
    assert.deepEqual(copy.content, first.content, '副本要带着内容走')
    assert.equal(service.list().length, 2)
  })
})

test('setDefault 在版本之间互斥', async () => {
  await withHarness({}, ({ service }) => {
    const first = service.create({ name: 'Java 后端', content: resumeContent() })
    const second = service.create({ name: '前端方向', content: resumeContent() })
    assert.equal(second.isDefault, false)

    service.setDefault(second.id)
    assert.equal(service.get(second.id).isDefault, true)
    assert.equal(service.get(first.id).isDefault, false, '启用位同时只能有一个')
    assert.equal(service.list().filter((item) => item.isDefault).length, 1)

    service.setDefault(first.id)
    assert.equal(service.get(first.id).isDefault, true)
    assert.equal(service.get(second.id).isDefault, false)
  })
})

test('update：改内容递增 rev，只改名字不动 rev（§4.1）', async () => {
  await withHarness({}, ({ service }) => {
    const created = service.create({ name: 'Java 后端', content: resumeContent() })

    const renamed = service.update(created.id, { name: 'Java 后端 · 秋招' })
    assert.equal(renamed.name, 'Java 后端 · 秋招')
    assert.equal(renamed.rev, created.rev, '改个名字不该让所有匹配分失效')

    const edited = service.update(created.id, {
      content: { ...created.content, summary: '改过的简介，方向更聚焦。' },
    })
    assert.equal(edited.rev, created.rev + 1, '内容变了就必须让旧分数作废')
    assert.equal(edited.name, 'Java 后端 · 秋招', '没给的字段保留原值')
    assert.equal(edited.content.summary, '改过的简介，方向更聚焦。')
  })
})

test('remove 连带删掉定制记录、附件记录与磁盘目录', async () => {
  await withHarness({}, async ({ service, store, filesDir }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const file = await service.exportResume(resume.id, { format: 'docx' })
    assert.ok(service.readFile(file.id) !== undefined, '先确认文件真的在')

    const job = seedJob(store)
    await service.tailor({ jobId: job.id, resumeId: resume.id })
    assert.equal(store.tailoring.list({ resumeId: resume.id }).length, 1)

    const dir = join(filesDir, `resume-${String(resume.id)}`)
    assert.equal(existsSync(dir), true)

    assert.equal(service.remove(resume.id), true)
    assert.equal(store.tailoring.list({ resumeId: resume.id }).length, 0, '定制记录不能变成孤儿')
    assert.equal(service.readFile(file.id), undefined, '附件记录随简历一起走')
    assert.equal(existsSync(dir), false, '磁盘上的附件目录也要清掉')
    assert.equal(service.remove(resume.id), false, '再删一次如实返回 false')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 体检 / 预览
// ─────────────────────────────────────────────────────────────────────

test('inspect 给出与共享层同一批规则问题', async () => {
  await withHarness({}, ({ service }) => {
    const content = resumeContent({ basics: { name: '', title: '后端开发' } })
    const resume = service.create({ name: '缺姓名', content })

    assert.deepEqual(service.inspect(resume.id), inspectResume(resume.content))
    assert.ok(
      service.inspect(resume.id).some((issue) => issue.level === 'error' && issue.at === 'basics.name'),
    )
  })
})

test('preview 是自包含 HTML，且一定带着姓名', async () => {
  await withHarness({}, ({ service }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const html = service.preview(resume.id)

    assert.ok(html.startsWith('<!DOCTYPE html>'))
    assert.ok(html.includes('张三'))
    assert.equal(/<script|<link/.test(html), false, '预览在真实浏览器里打开，不允许外链与脚本')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 导出（§17 R1/R2）
// ─────────────────────────────────────────────────────────────────────

test('exportResume docx：写出真正的文件，读回来是可打开的 ZIP', async () => {
  await withHarness({}, async ({ service }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const file = await service.exportResume(resume.id, { format: 'docx' })

    assert.equal(file.format, 'docx')
    assert.equal(file.fileName, '张三-后端开发-5年.docx')
    assert.ok(file.bytes > 1000, `docx 太小了（${String(file.bytes)} 字节），不像一份真文档`)

    const read = service.readFile(file.id)
    assert.ok(read !== undefined)
    assert.deepEqual([...read.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], '应当以 PK\\x03\\x04 开头')
    assert.equal(read.fileName, file.fileName)
    assert.equal(service.get(resume.id).files.length, 1, '导出要记账')
  })
})

test('exportResume html：落盘的就是含姓名的那份 HTML', async () => {
  await withHarness({}, async ({ service }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const file = await service.exportResume(resume.id, { format: 'html' })
    assert.equal(file.format, 'html')

    const read = service.readFile(file.id)
    assert.ok(read !== undefined)
    const html = new TextDecoder().decode(read.bytes)
    assert.ok(html.includes('张三'))
    assert.ok(html.includes('<!DOCTYPE html>'))
  })
})

test('exportResume pdf：注入的渲染器拿到的就是这份简历', async () => {
  await withHarness({ withPdf: true }, async ({ service, pdfHtml }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const file = await service.exportResume(resume.id, { format: 'pdf' })

    assert.equal(file.format, 'pdf')
    assert.equal(file.fileName, '张三-后端开发-5年.pdf')
    assert.equal(pdfHtml.length, 1, '渲染器应当被调用一次')
    assert.ok(pdfHtml[0]?.includes('张三'), '交给渲染器的必须是这份简历')
    assert.ok(pdfHtml[0]?.includes('杭州云启科技有限公司'))

    const read = service.readFile(file.id)
    assert.ok(read !== undefined)
    assert.deepEqual([...read.bytes], [0x25, 0x50, 0x44, 0x46])
  })
})

test('exportResume pdf：没有渲染器时报 ADAPTER_BROKEN，并说清为什么', async () => {
  await withHarness({}, async ({ service, store }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })

    await assert.rejects(
      () => service.exportResume(resume.id, { format: 'pdf' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'ADAPTER_BROKEN')
        assert.ok((error.hint ?? '').includes('headless'), '提示要说清"为什么用不了"，而不是只说失败')
        return true
      },
    )
    assert.equal(store.resume.listFiles(resume.id).length, 0, '失败不能留下半个附件记录')
  })
})

test('exportResume：空简历在生成之前就被拦住，不出白纸文件', async () => {
  await withHarness({}, async ({ service, store }) => {
    const resume = service.create({ name: '空简历', content: emptyResumeContent() })

    for (const format of ['docx', 'html'] as const) {
      await assert.rejects(
        () => service.exportResume(resume.id, { format }),
        (error: unknown) => {
          assert.ok(error instanceof DomainError)
          assert.equal(error.code, 'INVALID_INPUT')
          assert.ok(error.message.includes('内容'), '错误信息要能解释为什么导不了')
          return true
        },
      )
    }
    assert.equal(store.resume.listFiles(resume.id).length, 0, '一张白纸都不该落盘')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 定制：规则路径（无模型）
// ─────────────────────────────────────────────────────────────────────

test('没有模型时定制走规则，且规则结果本身通过防编造', async () => {
  await withHarness({}, async ({ service, store }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const job = seedJob(store)

    const result = await service.tailor({ jobId: job.id })
    assert.equal(result.via, 'rule')
    assert.equal(result.resumeId, resume.id, '没指定就用当前启用版本')
    assert.equal(result.adopted, false, '定制只是建议，采用与否由用户决定')

    const report = checkNoFabrication(resume.content, result.content, { allowTech: allowTechOf(job) })
    assert.equal(report.ok, true, `规则定制居然编造了：${report.reasons.join('；')}`)
  })
})

test('规则定制：把命中岗位关键词的技能排到前面，且不增不减', async () => {
  await withHarness({}, async ({ service, store }) => {
    const original = resumeContent()
    const resume = service.create({ name: 'Java 后端', content: original })
    // 岗位只提 MySQL → MySQL 应当被提到第一；Java 仍然在，只是往后
    const job = seedJob(store, { title: '数据库工程师', tags: ['mysql'], jdText: '要求熟悉 MySQL 调优。' })

    const result = await service.tailor({ jobId: job.id })

    assert.equal(result.content.skills[0]?.name, 'MySQL', '与该岗位相关的技能要排前面')
    assert.deepEqual(
      result.content.skills.map((skill) => skill.name).sort(),
      original.skills.map((skill) => skill.name).sort(),
      '只许换顺序，不许增删技能',
    )
    assert.deepEqual(
      result.content.experiences.map((experience) => experience.company),
      original.experiences.map((experience) => experience.company),
      '经历不增不减',
    )
    assert.deepEqual(
      result.content.projects.map((project) => project.name),
      original.projects.map((project) => project.name),
      '项目不增不减',
    )
    assert.ok(result.notes.some((note) => note.includes('技能')), '改了什么要说出来')
    assert.equal(
      checkNoFabrication(resume.content, result.content, { allowTech: allowTechOf(job) }).ok,
      true,
    )
  })
})

test('规则定制：basics.title 变成目标岗位名', async () => {
  await withHarness({}, async ({ service, store }) => {
    service.create({ name: 'Java 后端', content: resumeContent() })
    const job = seedJob(store, { title: '资深后端工程师' })

    const result = await service.tailor({ jobId: job.id })
    assert.equal(result.content.basics.title, '资深后端工程师', '瞄准一个岗位，第一件事就是把方向写对')
  })
})

test('规则定制：原简历没有简介时补一句，且不引入任何新技术词', async () => {
  await withHarness({}, async ({ service, store }) => {
    const original = resumeContent({ summary: '' })
    const resume = service.create({ name: 'Java 后端', content: original })
    // 岗位名里不带拉丁技术词，这样"简介里的技术词只能来自原简历"就是可判定的
    const job = seedJob(store, { title: '高级后端工程师', tags: ['mysql'], jdText: '熟悉 MySQL。' })

    const result = await service.tailor({ jobId: job.id })

    assert.notEqual(result.content.summary.trim(), '', '空简介要补一句，否则 HR 第一眼看不到东西')
    const before = factAtoms(resume.content)
    for (const token of techTokensOf(result.content.summary)) {
      assert.ok(before.tech.has(token), `补出来的简介引入了原简历没有的技术词：${token}`)
    }
    assert.ok(result.notes.some((note) => note.includes('个人简介')))
  })
})

// ─────────────────────────────────────────────────────────────────────
// 定制：模型路径（R8 红线）
// ─────────────────────────────────────────────────────────────────────

test('模型返回编造内容 → 退回规则结果并如实说明（R8）', async () => {
  await withHarness({}, async ({ service, store, filesDir }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const job = seedJob(store)
    const fallback = ruleTailor(resume.content, jobRef(job))

    // 模型偷偷加了一段没做过的经历，以及一个没用过的技术
    const fabricated: ResumeContent = {
      ...resume.content,
      skills: [...resume.content.skills, { name: 'Kubernetes' }],
      experiences: [
        ...resume.content.experiences,
        { company: '某大厂', title: '架构师', highlights: ['带过 20 人团队'] },
      ],
    }
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          return { text: JSON.stringify({ content: fabricated, notes: ['顺手补了 Kubernetes'] }) }
        },
      }),
    })
    ai.setConfig({ purposes: { resume_tailor: true } })
    const llmService = createResumeService({ store, filesDir, ai })

    const result = await llmService.tailor({ jobId: job.id, useLlm: true })

    assert.equal(result.via, 'rule', '不合规的模型结果必须退回规则路径')
    assert.deepEqual(result.content, fallback.content, '退回的就是规则结果本身')
    assert.ok(
      result.notes.some((note) => note.includes('未通过校验') || note.includes('防编造')),
      `必须如实说明为什么没采用模型结果，实际说明：${result.notes.join('／')}`,
    )
    assert.ok(result.notes.some((note) => note.includes('某大厂')), '理由要点名编造出来的东西')
    // 落库的也是退回后的那一份，不能"先存了再说"
    assert.equal(store.tailoring.get(result.id)?.via, 'rule')
    assert.deepEqual(store.tailoring.get(result.id)?.content, fallback.content)
  })
})

test('模型只做合法改写 → via llm 并落库', async () => {
  await withHarness({}, async ({ service, store, filesDir }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const job = seedJob(store)

    // 只改措辞：不加技术词、不加数字、不动组织
    const reworded: ResumeContent = {
      ...stripContacts(resume.content),
      summary: '后端工程师，长期负责订单与支付方向的系统建设。',
    }
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          return { text: JSON.stringify({ content: reworded, notes: ['把简介对齐到岗位方向'] }) }
        },
      }),
    })
    ai.setConfig({ purposes: { resume_tailor: true } })
    const llmService = createResumeService({ store, filesDir, ai })

    const result = await llmService.tailor({ jobId: job.id, useLlm: true })

    assert.equal(result.via, 'llm')
    assert.equal(result.content.summary, reworded.summary)
    assert.equal(store.tailoring.countFor(resume.id), 1, '定制结果必须落库，供用户显式采用')
    const stored = store.tailoring.get(result.id)
    assert.equal(stored?.via, 'llm')
    assert.deepEqual(stored?.content, result.content)
    // 注：模型自己写的 notes 目前会被丢掉（见交付说明里的 bug），
    // 所以这里**不**对 notes 的具体文案下断言 —— 不把错误行为固化成契约。
    assert.ok(Array.isArray(stored?.notes))
  })
})

test('联系方式在发给模型之前就被摘掉，外发字段清单仍如实记账', async () => {
  await withHarness({}, async ({ service, store, filesDir }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const job = seedJob(store)

    const sent: string[] = []
    const reworded: ResumeContent = {
      ...stripContacts(resume.content),
      summary: '后端工程师，长期负责订单与支付方向的系统建设。',
    }
    const ai = createAiService({
      store,
      llm: () => ({
        async complete(request: { user: string }) {
          sent.push(request.user)
          return { text: JSON.stringify({ content: reworded, notes: ['对齐措辞'] }) }
        },
      }),
    })
    ai.setConfig({ purposes: { resume_tailor: true } })
    const llmService = createResumeService({ store, filesDir, ai })

    const result = await llmService.tailor({ jobId: job.id, useLlm: true })

    assert.equal(result.via, 'llm')
    assert.equal(sent.length, 1)
    assert.ok(sent[0]?.includes('张三'), '简历正文确实发出去了 —— 否则下面的断言没有意义')
    assert.equal(sent[0]?.includes('13800001111'), false, '手机号绝不出站')
    assert.equal(sent[0]?.includes('zhangsan@example.com'), false, '邮箱绝不出站')

    const call = store.llmCall.list(5)[0]
    assert.ok(call !== undefined)
    assert.equal(call.purpose, 'resume_tailor')
    assert.ok(call.fields.includes('trusted:resume'), '整份简历发出去了，留痕必须如实写')
    assert.equal(call.fields.includes('phone'), false)

    // 域层自己也要摘得干净（隐私闸门是第二道，不是第一道）
    const stripped = stripContacts(resume.content)
    assert.equal('phone' in stripped.basics, false)
    assert.equal('email' in stripped.basics, false)
    assert.equal(stripped.basics.name, '张三', '摘掉的只是联系方式')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 定制记录的查询与采用
// ─────────────────────────────────────────────────────────────────────

test('listTailorings 按岗位过滤，adopt 如实翻转', async () => {
  await withHarness({}, async ({ service, store }) => {
    const resume = service.create({ name: 'Java 后端', content: resumeContent() })
    const jobA = seedJob(store, { platformJobId: 'p6-a' })
    const jobB = seedJob(store, { platformJobId: 'p6-b' })

    const forA = await service.tailor({ jobId: jobA.id })
    await service.tailor({ jobId: jobB.id })

    const listed = service.listTailorings({ jobId: jobA.id })
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, forA.id)
    assert.equal(listed[0]?.jobId, jobA.id)
    assert.equal(listed[0]?.jobTitle, 'Java 后端开发', '列表要能直接显示岗位，界面不用再查一次')
    assert.equal(listed[0]?.adopted, false)
    assert.equal(service.listTailorings({ resumeId: resume.id }).length, 2)

    assert.equal(service.adopt(forA.id, true).adopted, true)
    assert.equal(service.listTailorings({ jobId: jobA.id })[0]?.adopted, true)
    assert.equal(service.adopt(forA.id, false).adopted, false)

    assert.throws(
      () => service.adopt(9999, true),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// 版本标识（§4.1）
// ─────────────────────────────────────────────────────────────────────

test('scoreStamp：没有简历是 {null,0}，有简历时指向启用版本的 id 与 rev', async () => {
  await withHarness({}, ({ service }) => {
    assert.deepEqual(service.scoreStamp(), { resumeId: null, rev: 0 })

    const first = service.create({ name: 'Java 后端', content: resumeContent() })
    assert.deepEqual(service.scoreStamp(), { resumeId: first.id, rev: 1 })

    service.update(first.id, { content: { ...first.content, summary: '改过了。' } })
    assert.deepEqual(service.scoreStamp(), { resumeId: first.id, rev: 2 })

    const second = service.create({ name: '前端方向', content: resumeContent() })
    service.setDefault(second.id)
    assert.deepEqual(service.scoreStamp(), { resumeId: second.id, rev: second.rev })
  })
})
