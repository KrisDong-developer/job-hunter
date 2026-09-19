/**
 * 模型服务的**接线**：配了模型就必须真的用上它。
 *
 * ## 为什么单独有这么一个文件
 *
 * 这里曾经有一个静默的接线 bug：`resumes` 比 `ai` 先被创建，于是简历定制拿到的
 * `ai` 永远是 `undefined` —— 表现是"配了模型、也点了用模型定制，结果永远走规则路径"，
 * 而且**不报错、不留痕**（`via` 如实写 `'rule'`，所以也不算说谎，只是那个降级
 * 是装配顺序造成的、不是环境造成的）。
 *
 * 领域层那条路径本来就有测试（`test/domain/resumes.test.ts` 直接构造 `ai`），
 * 所以只有**经真实 runtime 走一遍**才能照出这类"接错了线"的问题。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LlmSourceLike } from '../../src/host/ai/llm-port.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { emptyResumeContent, type ResumeContent } from '../../src/shared/domain/resume-content.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T1 = '2026-09-19T01:00:00.000Z'

function jobInput(): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'w1',
    title: '前端工程师',
    companyId: null,
    salaryRaw: '2-3万',
    salaryMin: 20000,
    salaryMax: 30000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/w1.html',
    publishedAt: T1,
  }
}

function resumeContent(): ResumeContent {
  return {
    ...emptyResumeContent(),
    basics: { name: '张三', title: '前端开发', city: '深圳' },
    skills: [{ name: 'react' }, { name: 'typescript' }],
  }
}

/**
 * 假的宿主 `llm` 服务：只说一次话，然后把**原样**的简历还回去。
 *
 * 原样返回是有意的：`checkNoFabrication` 会拦下任何"新增经历/技术"的结果，
 * 那样测试就会变成在验防编造（那件事有它自己的测试），而不是在验接线。
 */
function fakeLlm(content: ResumeContent): { llm: LlmSourceLike; calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    llm: {
      async *stream() {
        calls += 1
        yield {
          type: 'text-delta',
          text: JSON.stringify({ content, notes: ['按目标岗位重排了技能顺序'] }),
        }
        yield { type: 'finish' }
      },
    },
  }
}

test('配了模型时：简历定制必须真的走模型（via = llm），不是悄悄退回规则', async () => {
  const dir = tempDataDir()
  const content = resumeContent()
  const fake = fakeLlm(content)
  const runtime = createHostRuntime({
    dataDir: dir,
    llm: fake.llm,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'fake-1' }) },
  })
  try {
    await runtime.ready()
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobId = store.job.upsert(jobInput(), T1).id
    runtime.resumes().create({ name: '前端投递版', content })

    // `resume_tailor` 默认是**关**的（用途开关在 purposes.ts 里），要点开才是"用户要求用模型"
    runtime.ai().setConfig({ purposes: { resume_tailor: true } })

    const result = await runtime.resumes().tailor({ jobId, useLlm: true })

    assert.equal(result.via, 'llm', '配了模型 + 点开用途 → 必须是模型结果；退回 rule 说明接线断了')
    assert.equal(fake.calls(), 1, '模型应当被调用一次')
    assert.ok(
      result.notes.includes('按目标岗位重排了技能顺序'),
      `模型自己的说明要留住，实际：${result.notes.join('／')}`,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('没配模型时：同一个入口如实退回规则（不是抛错、也不假装用了模型）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    await runtime.ready()
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobId = store.job.upsert(jobInput(), T1).id
    runtime.resumes().create({ name: '前端投递版', content: resumeContent() })

    const result = await runtime.resumes().tailor({ jobId, useLlm: true })

    assert.equal(result.via, 'rule', '没有模型时走规则路径 —— 这是**环境**造成的降级，如实标记')
    assert.ok(result.notes.length > 0, '降级要给得出理由')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
