import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { createAiService } from '../../src/host/ai/client.js'
import {
  buildResumeGreetingTemplate,
  createResumeService,
  templateVarsOf,
  validateTemplateBody,
  type ResumeService,
} from '../../src/host/domain/resumes.js'
import { techTokensOf, type ResumeContent } from '../../src/shared/domain/resume-content.js'
import { MAX_RESUME_GREETING_TEMPLATES } from '../../src/shared/config/limits.js'
import { DomainError } from '../../src/host/util/errors.js'
import type { Store } from '../../src/host/store/store.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

/**
 * 简历赛道级话术模板（v12 多赛道）。
 *
 * 这批测试钉的是三条红线：
 *   * **不编造**：模型输出里出现简历没有的技术词，整条退回规则兜底并如实标注（R8）；
 *   * **不带联系方式**：手动保存与 AI 输出走同一条校验（发送侧的 `validateGreetingText`）；
 *   * **归属隔离**：模板按简历归档，编辑/删除都不许跨简历。
 */
const T = '2026-09-20T10:00:00.000Z'

function content(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    basics: { name: '张三', title: '后端开发', phone: '13800001111', email: 'z@example.com', city: '杭州', years: 5 },
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
        highlights: ['把订单接口 P99 从 800ms 压到 120ms'],
        stack: ['Java', 'MySQL'],
      },
    ],
    projects: [],
    education: [],
    extras: [],
    ...overrides,
  }
}

interface Harness {
  store: Store
  dir: string
  filesDir: string
  service: ResumeService
  resumeId: number
}

function openHarness(): Harness {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  const filesDir = join(dir, 'files')
  const service = createResumeService({ store, filesDir })
  const resume = service.create({ name: 'Java 后端', content: content() })
  return { store, dir, filesDir, service, resumeId: resume.id }
}

/** 返回一个"模型固定输出这段 JSON"的 AI 服务，并打开 greeting_template 用途。 */
function fakeAi(store: Store, output: { name: string; body: string }) {
  const ai = createAiService({
    store,
    llm: () => ({
      async complete() {
        return { text: JSON.stringify(output) }
      },
    }),
  })
  ai.setConfig({ purposes: { greeting_template: true } })
  return ai
}

const OK_BODY = '您好，看到{公司}在招{岗位}。我是后端开发，5 年经验，做过 Java 与 MySQL 的高并发订单系统，期待交流！'

test('规则兜底（没配模型）：只用简历事实拼装，含 {岗位}/{公司} 占位符', async () => {
  const h = openHarness()
  try {
    const template = await h.service.generateGreetingTemplate({ resumeId: h.resumeId })
    assert.equal(template.via, 'rule')
    assert.ok(template.body.includes('{岗位}') && template.body.includes('{公司}'))
    assert.ok(template.body.includes('后端开发'), '开场要自报方向（来自简历 basics.title）')
    assert.ok(template.body.includes('Java'), '要用简历里的技能自证')
    assert.ok(!template.body.includes('13800001111'), '绝不带联系方式')
    assert.deepEqual(templateVarsOf(template.body), ['公司', '岗位'])
    // 占位符是 vars 的唯一来源：正文的自由文本不会被误认成变量
    assert.deepEqual(template.vars, ['公司', '岗位'])
  } finally {
    cleanup(h.dir)
  }
})

test('模型输出合规 → via llm 落库；编造技术词 → 整条退回规则并如实标注', async () => {
  const h = openHarness()
  try {
    const ok = createResumeService({ store: h.store, filesDir: h.filesDir, ai: fakeAi(h.store, { name: 'AI 开场', body: OK_BODY }) })
    const good = await ok.generateGreetingTemplate({ resumeId: h.resumeId })
    assert.equal(good.via, 'llm')
    assert.equal(good.name, 'AI 开场')

    const fabricated = createResumeService({
      store: h.store,
      filesDir: h.filesDir,
      // 模型偷偷塞了简历里没有的 Kubernetes
      ai: fakeAi(h.store, { name: 'x', body: '您好，我做{岗位}，精通 Kubernetes。' }),
    })
    const resume2 = fabricated.create({ name: '另一版', content: content() })
    const fallback = await fabricated.generateGreetingTemplate({ resumeId: resume2.id })
    assert.equal(fallback.via, 'rule', '编造技术词的结果必须整条丢弃')
    assert.ok(fallback.body.includes('{岗位}'), '退回的是规则模板，不是模型残骸')
  } finally {
    cleanup(h.dir)
  }
})

test('模型输出带联系方式 → 退回规则（与发送侧同一条校验）', async () => {
  const h = openHarness()
  try {
    const leaky = createResumeService({
      store: h.store,
      filesDir: h.filesDir,
      ai: fakeAi(h.store, { name: 'x', body: '您好，看到{公司}在招{岗位}，可以加我微信细聊！' }),
    })
    const resume2 = leaky.create({ name: '另一版', content: content() })
    const template = await leaky.generateGreetingTemplate({ resumeId: resume2.id })
    assert.equal(template.via, 'rule')
    assert.ok(!template.body.includes('微信'))
  } finally {
    cleanup(h.dir)
  }
})

test('手写保存：合规通过（via manual）；带联系方式被拒；跨简历编辑被拒', async () => {
  const h = openHarness()
  try {
    const saved = h.service.saveGreetingTemplate({ resumeId: h.resumeId, name: '我的开场', body: OK_BODY })
    assert.equal(saved.via, 'manual')
    assert.equal(saved.resumeId, h.resumeId)

    assert.throws(
      () => h.service.saveGreetingTemplate({ resumeId: h.resumeId, name: '坏的', body: '您好，{公司}{岗位}，加我微信聊' }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
      '联系方式引导必须被拒 —— 手写与 AI 同一条红线',
    )

    // 跨简历：拿 A 的模板 id 去挂 B 的简历下编辑 → 拒绝
    const other = h.service.create({ name: '销售版', content: content({ basics: { ...content().basics, title: '销售' } }) })
    assert.throws(
      () => h.service.saveGreetingTemplate({ resumeId: other.id, id: saved.id, name: '偷改', body: OK_BODY }),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
    // 列表隔离：A 的列表看不到 B 的，反之亦然
    assert.equal(h.service.listGreetingTemplates(h.resumeId).some((item) => item.resumeId !== h.resumeId), false)
    assert.equal(h.service.listGreetingTemplates(other.id).length, 0)
  } finally {
    cleanup(h.dir)
  }
})

test('每份简历的模板有上限，超了要明说', async () => {
  const h = openHarness()
  try {
    for (let i = 0; i < MAX_RESUME_GREETING_TEMPLATES; i += 1) {
      await h.service.generateGreetingTemplate({ resumeId: h.resumeId })
    }
    assert.equal(h.service.listGreetingTemplates(h.resumeId).length, MAX_RESUME_GREETING_TEMPLATES)
    await assert.rejects(
      h.service.generateGreetingTemplate({ resumeId: h.resumeId }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
      '第 7 条生成必须被拒',
    )
  } finally {
    cleanup(h.dir)
  }
})

test('validateTemplateBody：缺 {岗位} 拒；简历里有的技术词放行；年限数字不误伤', () => {
  const allowed = new Set([...techTokensOf('Java MySQL 订单中台'), 'hr', 'jd'])
  assert.equal(validateTemplateBody(allowed, OK_BODY), undefined, '占位符齐全、词全来自简历 → 通过')
  assert.ok(String(validateTemplateBody(allowed, '您好，看到这个岗位很感兴趣。')).includes('{岗位}'), '缺占位符要点名')
  assert.ok(
    // techTokensOf 会把 token 小写化，点名时引用的就是小写形态
    String(validateTemplateBody(allowed, '您好{公司}{岗位}，我精通 Kubernetes')).includes('kubernetes'),
    '白名单外的技术词要点名是哪个词',
  )
  assert.equal(
    validateTemplateBody(allowed, '您好{公司}{岗位}，5 年经验，Java 方向。'),
    undefined,
    '「5 年」是数字不是技术词，不能误伤',
  )
})

test('删除简历时话术模板连带清理，通用模板不受影响', async () => {
  const h = openHarness()
  try {
    await h.service.generateGreetingTemplate({ resumeId: h.resumeId })
    // 一条通用模板（resume_id 为 NULL，走 outreach 的老接口形态）作对照
    h.store.pipeline.upsertTemplate({ name: '通用', body: OK_BODY }, T)
    assert.equal(h.service.listGreetingTemplates(h.resumeId).length, 1)
    assert.equal(h.store.pipeline.listTemplates().length, 2, '全局视角两条：一条简历的 + 一条通用的')

    assert.equal(h.service.remove(h.resumeId), true)
    assert.equal(h.store.pipeline.listTemplates({ resumeId: h.resumeId }).length, 0, '简历删了，它的模板不能留成孤儿')
    assert.equal(h.store.pipeline.listTemplates({ resumeId: null }).length, 1, '通用模板不随任何简历删除')
  } finally {
    cleanup(h.dir)
  }
})

test('buildResumeGreetingTemplate：语气只影响措辞，事实三件套不变', () => {
  const c = content()
  for (const tone of ['formal', 'warm', 'concise'] as const) {
    const seed = buildResumeGreetingTemplate(c, tone)
    assert.ok(seed.body.includes('{岗位}') && seed.body.includes('{公司}'))
    assert.ok(seed.body.includes('后端开发'))
  }
  const concise = buildResumeGreetingTemplate(c, 'concise')
  assert.ok(!concise.body.includes('800ms'), '简洁语气不带成果细节')
})
