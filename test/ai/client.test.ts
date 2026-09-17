import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAiService, type LlmPort } from '../../src/host/ai/client.js'
import { AI_CONFIG_KEY, DEFAULT_AI_CONFIG } from '../../src/host/ai/purposes.js'
import type { Store } from '../../src/host/store/store.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

/** 记录每次调用、按脚本返回文本的假模型。 */
function fakeLlm(script: string[]): { port: LlmPort; calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = []
  let index = 0
  return {
    calls,
    port: {
      async complete(request) {
        calls.push({ system: request.system, user: request.user })
        const text = script[Math.min(index, script.length - 1)] ?? ''
        index += 1
        return { text, provider: 'fake', model: 'fake-1', promptTokens: 10, completionTokens: 20 }
      },
    },
  }
}

/** 在临时 store 上跑一段异步用例，结束后一定关库并清理目录。 */
async function withStore(fn: (store: Store) => Promise<void>): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    await fn(store)
  } finally {
    store.close()
    cleanup(dir)
  }
}

const jsonParse = (raw: string): { text: string } | undefined => {
  try {
    return JSON.parse(raw) as { text: string }
  } catch {
    return undefined
  }
}

test('模型可用时正常返回，并写一条 llm_call 留痕', async () => {
  await withStore(async (store) => {
    const llm = fakeLlm(['{"text":"你好"}'])
    const ai = createAiService({ store, llm: () => llm.port })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术', payload: { jobTitle: 'Java', phone: '13800138000' } },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'llm')
    assert.equal(outcome.value.text, '你好')
    // 外发字段清单里没有 phone（硬黑名单），并且它被报告给了调用方
    assert.deepEqual(outcome.outboundFields, ['jobTitle'])
    assert.ok(outcome.notes.some((note) => note.includes('phone')))

    const calls = store.llmCall.list(10)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.purpose, 'greeting_draft')
    assert.deepEqual(calls[0]?.fields, ['jobTitle'])
    assert.equal(calls[0]?.ok, true)
    assert.equal(calls[0]?.promptTokens, 10)
    assert.equal(calls[0]?.model, 'fake-1')
    // 关键：留痕里**没有正文**，只有字段清单
    assert.equal(JSON.stringify(calls[0]).includes('13800138000'), false)
  })
})

test('用途被关掉时直接降级，且一次模型都不调', async () => {
  await withStore(async (store) => {
    store.setting.set(
      AI_CONFIG_KEY,
      'global',
      '',
      { enabled: true, purposes: { greeting_draft: false } },
      '2026-09-16T00:00:00.000Z',
    )
    const llm = fakeLlm(['不该被调用'])
    const ai = createAiService({ store, llm: () => llm.port })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.equal(outcome.value.text, '模板')
    assert.equal(llm.calls.length, 0, '关掉的用途绝不能调用模型')
    assert.equal(store.llmCall.count(), 0, '没调用模型就不该有留痕')
    assert.ok(outcome.notes[0]?.includes('未开启'))
  })
})

test('没有模型端口 → 降级但不崩，并如实说明原因', async () => {
  await withStore(async (store) => {
    const noPort = createAiService({ store, llm: () => undefined })
    assert.equal(noPort.available(), false)
    assert.equal(noPort.enabled('greeting_draft'), false)
    const outcome = await noPort.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: () => ({ ok: true }), fallback: () => ({ ok: false }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.equal(outcome.value.ok, false)
    assert.ok(outcome.notes[0]?.includes('未配置模型'))
  })
})

test('总开关关掉之后，所有用途一起降级', async () => {
  await withStore(async (store) => {
    const llm = fakeLlm(['x'])
    const ai = createAiService({ store, llm: () => llm.port })
    ai.setConfig({ enabled: false })
    assert.equal(ai.config().enabled, false)
    assert.equal(ai.enabled('greeting_draft'), false)
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.equal(llm.calls.length, 0)
    assert.ok(outcome.notes[0]?.includes('已关闭'))
  })
})

test('输出不合规会重试一次；两次都不合规就降级并留痕为失败', async () => {
  await withStore(async (store) => {
    const llm = fakeLlm(['不是 JSON', '还不是 JSON'])
    const ai = createAiService({ store, llm: () => llm.port })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.equal(llm.calls.length, 2, '失败只重试一次')
    assert.ok(outcome.notes.some((note) => note.includes('不合规')))
    const calls = store.llmCall.list(10)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.ok, false)
  })
})

test('重试成功则正常返回（第一次坏、第二次好）', async () => {
  await withStore(async (store) => {
    const llm = fakeLlm(['噪声', '{"text":"第二次好了"}'])
    const ai = createAiService({ store, llm: () => llm.port })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'llm')
    assert.equal(outcome.value.text, '第二次好了')
    assert.equal(llm.calls.length, 2)
  })
})

test('validate 拒绝结果 = 丢弃模型输出并降级（注入防御第三层）', async () => {
  await withStore(async (store) => {
    const llm = fakeLlm(['{"text":"加我微信 13800138000"}'])
    const ai = createAiService({ store, llm: () => llm.port })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      {
        parse: jsonParse,
        validate: (value) => (value.text.includes('微信') ? '话术里出现了联系方式引导' : undefined),
        fallback: () => ({ text: '模板' }),
      },
    )
    assert.equal(outcome.via, 'fallback')
    assert.ok(outcome.notes.some((note) => note.includes('未通过校验')))
    const calls = store.llmCall.list(10)
    assert.equal(calls[0]?.ok, false)
  })
})

test('模型抛错 → 降级 + 失败留痕 + onDegrade 回调', async () => {
  await withStore(async (store) => {
    const degraded: string[] = []
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          throw new Error('连接超时')
        },
      }),
      onDegrade: (info) => degraded.push(`${info.purpose}:${info.reason}`),
    })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: () => ({ text: 'x' }), fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.equal(outcome.value.text, '模板')
    assert.equal(degraded.length, 1)
    assert.ok(degraded[0]?.includes('greeting_draft'))
    const calls = store.llmCall.list(10)
    assert.equal(calls[0]?.ok, false)
    assert.ok((calls[0]?.errorCode ?? '').includes('连接超时'))
  })
})

test('模型超时也会降级，而不是把对话挂在那里', async () => {
  await withStore(async (store) => {
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          await new Promise((resolve) => setTimeout(resolve, 5_000))
          return { text: '{"text":"太晚了"}' }
        },
      }),
      timeoutMs: 30,
    })
    const outcome = await ai.call(
      { purpose: 'greeting_draft', instruction: '写话术' },
      { parse: jsonParse, fallback: () => ({ text: '模板' }) },
    )
    assert.equal(outcome.via, 'fallback')
    assert.ok(outcome.notes.some((note) => note.includes('超时')))
  })
})

test('配置读写会补齐缺项，新增用途不会让老配置失效', async () => {
  await withStore(async (store) => {
    const ai = createAiService({ store, llm: () => undefined })
    assert.equal(ai.config().enabled, DEFAULT_AI_CONFIG.enabled)
    store.setting.set(
      AI_CONFIG_KEY,
      'global',
      '',
      { enabled: true, purposes: { explain: false } },
      '2026-09-16T00:00:00.000Z',
    )
    const config = ai.config()
    assert.equal(config.purposes.explain, false)
    // 没写过的用途回落到默认值，而不是变成 undefined
    assert.equal(config.purposes.greeting_draft, DEFAULT_AI_CONFIG.purposes.greeting_draft)
    const next = ai.setConfig({ purposes: { greeting_draft: false } })
    assert.equal(next.purposes.greeting_draft, false)
    assert.equal(next.purposes.explain, false, '局部写入不应清掉已有设置')
  })
})
