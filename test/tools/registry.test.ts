import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Disposer, PluginContext, ToolDefinition, ToolsService } from '../../src/shared/dsh.js'
import { TOOL_BATCH_MAX, registerJobHunterTools, type ToolRegistrationReport } from '../../src/host/tools/index.js'
import { toolExec } from '../../src/host/tools/exec-context.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { writeGuardConfig } from '../../src/host/guard/rules.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

/** 捕获注册的工具，模拟宿主的 tools 注册表。 */
function fakeContext(): {
  ctx: PluginContext
  definitions: Map<string, ToolDefinition>
} {
  const definitions = new Map<string, ToolDefinition>()
  const tools: ToolsService = {
    schemas: () => [...definitions.keys()].map((name) => ({ name })),
    register(definition: ToolDefinition): Disposer {
      if (definitions.has(definition.name)) {
        throw new Error(`tool already registered: ${definition.name}`)
      }
      definitions.set(definition.name, definition)
      return () => definitions.delete(definition.name)
    },
  }
  const ctx: PluginContext = {
    get: (name: string) => (name === 'tools' ? tools : undefined),
    effect: () => () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  return { ctx, definitions }
}

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 't1',
    title: '高级前端工程师',
    companyId: null,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/t1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。任职要求：熟悉 react。',
    ...overrides,
  }
}

interface Harness {
  runtime: HostRuntime
  definitions: Map<string, ToolDefinition>
  report: ToolRegistrationReport
  dir: string
  /** 按工具名执行，走的是与真实调用同一条路径（含 toolExec 上下文）。 */
  run(name: string, args: unknown): Promise<unknown>
}

async function harness(approval?: unknown): Promise<Harness> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({
    dataDir: dir,
    ...(approval === undefined ? {} : { approval }),
  })
  await runtime.ready()
  // 发送窗口/休息日按本地时钟判定，会让用例随时段漂移 —— 统一关掉。
  const store = runtime.store()
  if (store !== undefined) writeGuardConfig(store, { sendWindow: '', dayOffProbability: 0 }, T)
  const { ctx, definitions } = fakeContext()
  const registration = registerJobHunterTools(ctx, runtime)
  return {
    runtime,
    definitions,
    report: registration.report,
    dir,
    async run(name, args) {
      const definition = definitions.get(name)
      if (definition === undefined) throw new Error(`没有注册工具 ${name}`)
      return await definition.execute(args, {
        callId: `call-${name}`,
        agent: { id: 'agent-1' },
        signal: new AbortController().signal,
      })
    },
  }
}

function close(h: Harness): void {
  h.runtime.close()
  cleanup(h.dir)
}

/** 渲染工具结果（模拟宿主把 value 变成模型看到的内容块）。 */
function render(definition: ToolDefinition, args: unknown, value: unknown): string {
  return definition.output
    .render(args, value)
    .map((block) => (block.type === 'text' ? String((block as { text?: unknown }).text ?? '') : ''))
    .join('\n')
}

/**
 * 本插件注册的全部工具名（§22.2 + P6）。
 *
 * 抽成模块级常量是为了让"数量"这类断言**不会在加工具时悄悄失效** ——
 * 之前把它写在单个测试里，加 P6 的五个工具时另一条断言就静默错了。
 *
 * 注意 `job_query`：文档写的是 `job_list`，但宿主自带一个同名的后台任务工具，
 * 重名会被 tools.register 拒绝 —— 所以实际名字是 job_query（见 tools/index.ts 文件头）。
 */
const ALL_TOOL_NAMES = [
  'job_search',
  'job_query',
  'job_detail',
  'job_mark',
  'job_plan_manage',
  'crawl_run',
  'crawl_status',
  'job_match_explain',
  'greeting_draft',
  'greeting_send',
  'job_settings',
  // P6：简历的五个。查询低危；保存/定制/导出中危 → 模型发起时走审批。
  'resume_list',
  'resume_get',
  'resume_save',
  'resume_tailor',
  'resume_export',
  // P7：跟进与看板七个。投递/回复**高危**；状态流转与面试管理中危；其余只读。
  'application_send',
  'application_update',
  'inbox_list',
  'message_reply',
  'interview_manage',
  'interview_prep',
  'job_report',
  // P8：校招与海外支线。写操作中危；查询与体检只读。
  'campus_manage',
  'campus_deadlines',
  'overseas_check',
  'cover_letter_draft',
] as const

test('注册的工具与 §22.2 清单一致，每个都有 schema / render', async () => {
  const h = await harness()
  try {
    assert.deepEqual([...h.definitions.keys()].sort(), [...ALL_TOOL_NAMES].sort())
    assert.equal(h.report.registered.length, ALL_TOOL_NAMES.length)
    assert.deepEqual(h.report.failed, [])
    for (const [name, definition] of h.definitions) {
      assert.equal(definition.name, name)
      assert.ok(definition.description.length > 10, `${name} 要有能读懂用途的描述`)
      assert.equal((definition.parameters as { type?: string }).type, 'object')
      assert.equal((definition.parameters as { additionalProperties?: boolean }).additionalProperties, false)
      assert.ok(definition.output.schema !== undefined)
    }
  } finally {
    close(h)
  }
})

test('名字被占用时：这个工具不注册，但**必须**被记录成可见的失败', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    // 假装宿主已经有一个叫 job_query 的工具（真实情况是 job_list）
    const definitions = new Map<string, ToolDefinition>()
    const taken = ['job_query']
    const tools: ToolsService = {
      schemas: () => [...taken, ...definitions.keys()].map((name) => ({ name })),
      register(definition: ToolDefinition): Disposer {
        if (taken.includes(definition.name) || definitions.has(definition.name)) {
          throw new Error(`tool already registered: ${definition.name}`)
        }
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    }
    const ctx: PluginContext = {
      get: (name: string) => (name === 'tools' ? tools : undefined),
      effect: () => () => {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    }

    const registration = registerJobHunterTools(ctx, runtime)
    assert.ok(registration.report.conflicts.includes('job_query'), '冲突名字要被列出来')
    assert.ok(registration.report.failed.some((item) => item.name === 'job_query'), '失败原因要被记下来')
    assert.equal(registration.report.registered.includes('job_query'), false)
    // 其余工具照常注册 —— 一个重名不该让整包工具消失
    assert.equal(registration.report.registered.length, ALL_TOOL_NAMES.length - 1)
    registration.dispose()
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('tools 服务缺失时安静退场，不抛错（插件仍要挂上去）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    const ctx: PluginContext = { get: () => undefined, effect: () => () => {} }
    const registration = registerJobHunterTools(ctx, runtime)
    assert.equal(typeof registration.dispose, 'function')
    assert.deepEqual(registration.report.registered, [], '没有 tools 服务就一个都注册不上')
    assert.deepEqual(registration.report.failed, [], '也不该报成"失败"—— 那会误导排错方向')
    registration.dispose()
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('job_query / job_detail 的结果能被共享解析器读出来（卡片依赖这一点）', async () => {
  const h = await harness()
  try {
    const store = h.runtime.store()
    assert.ok(store !== undefined)
    const company = store.company.ensure({ name: '腾讯科技', nameNorm: '腾讯科技' }, T)
    store.job.upsert({ ...jobInput(), companyId: company.id }, T)
    store.job.upsert({ ...jobInput({ platformJobId: 't2', title: 'Node 后端工程师' }) }, T)

    const listValue = (await h.run('job_query', { pageSize: 5 })) as { total: number; jobs: unknown[] }
    assert.equal(listValue.total, 2)
    const listText = render(h.definitions.get('job_query') as ToolDefinition, { pageSize: 5 }, listValue)
    const { parseJobListLine } = await import('../../src/shared/tool-format.js')
    const parsed = listText.split('\n').map((line) => parseJobListLine(line)).filter((item) => item !== undefined)
    assert.equal(parsed.length, 2, '列表里的每个岗位都要能被解析出来')

    const detailValue = (await h.run('job_detail', { jobId: 1 })) as { text: string }
    const detailText = render(h.definitions.get('job_detail') as ToolDefinition, { jobId: 1 }, detailValue)
    const { parseDetailLines, DETAIL_KEYS } = await import('../../src/shared/tool-format.js')
    const keys = parseDetailLines(detailText).map((row) => row?.key)
    assert.ok(keys.includes(DETAIL_KEYS.company))
    assert.ok(keys.includes(DETAIL_KEYS.salary))
    assert.ok(keys.includes(DETAIL_KEYS.url))
    // §22.5：不得把整段 JD 塞进上下文（摘要会带截断标记或本来就短）
    assert.ok(detailText.length < 1200, '详情文本要克制，不能把整页 JD 倒进上下文')
  } finally {
    close(h)
  }
})

test('job_mark 真的改状态，并且发一条事件给界面', async () => {
  const h = await harness()
  try {
    const store = h.runtime.store()
    assert.ok(store !== undefined)
    const id = store.job.upsert(jobInput(), T).id

    const events: Array<{ type: string }> = []
    h.runtime.events().subscribe((event) => events.push({ type: event.type }))

    const value = (await h.run('job_mark', { jobId: id, state: 'saved' })) as {
      job: { state: string }
    }
    assert.equal(value.job.state, 'saved')
    assert.equal(store.job.detail(id)?.state, 'saved')
    assert.ok(events.some((event) => event.type === 'job.updated'), '界面靠事件做重拉提示')
  } finally {
    close(h)
  }
})

test('job_mark 拒绝非法状态，报错可读', async () => {
  const h = await harness()
  try {
    await assert.rejects(() => h.run('job_mark', { jobId: 1, state: '收藏' }), /不合法/)
  } finally {
    close(h)
  }
})

test('批量上限在工具层也是硬的：一次最多 5 个岗位', async () => {
  const h = await harness()
  try {
    await assert.rejects(
      () => h.run('job_match_explain', { jobIds: [1, 2, 3, 4, 5, 6] }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes(String(TOOL_BATCH_MAX)))
        return true
      },
    )
  } finally {
    close(h)
  }
})

test('greeting_draft 工具不发模型也能给模板，并在文本里标注来源', async () => {
  const h = await harness()
  try {
    const store = h.runtime.store()
    assert.ok(store !== undefined)
    const id = store.job.upsert(jobInput(), T).id
    const value = (await h.run('greeting_draft', { jobId: id })) as { text: string }
    const definition = h.definitions.get('greeting_draft') as ToolDefinition
    const text = render(definition, { jobId: id }, value)
    assert.ok(text.includes('来源：内置模板'))
    assert.ok(text.includes('还没有发送'), '必须明确告诉模型这段没有发出去')
  } finally {
    close(h)
  }
})

test('greeting_send 走审批；批准后如实报告适配器还没实现（不假装成功）', async () => {
  const asked: Array<{ toolName: string; reason: string }> = []
  const h = await harness({
    request: async (req: { toolName: string; reason?: string }) => {
      asked.push({ toolName: req.toolName, reason: req.reason ?? '' })
      return 'allowed-once'
    },
  })
  try {
    const store = h.runtime.store()
    assert.ok(store !== undefined)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const id = store.job.upsert(jobInput(), T).id

    await assert.rejects(
      () => h.run('greeting_send', { jobId: id, text: '您好，我想应聘这个岗位，方便聊聊吗？' }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('还没实现打招呼动作'), error.message)
        return true
      },
    )
    assert.equal(asked.length, 1, '高危工具必须先问用户')
    // 审批通道拿到的是**发起这次调用的工具名**（toolExec 上下文在此被验证）
    assert.equal(asked[0]?.toolName, 'greeting_send')
    // §4.4.2：审批文案要含目标与正文全文
    assert.ok(asked[0]?.reason.includes('51job'))
    assert.ok(asked[0]?.reason.includes('方便聊聊吗'))
  } finally {
    close(h)
  }
})

test('greeting_send 被用户拒绝时失败，且动作根本没被执行', async () => {
  const h = await harness({ request: async () => 'rejected' })
  try {
    const store = h.runtime.store()
    assert.ok(store !== undefined)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const id = store.job.upsert(jobInput(), T).id
    await assert.rejects(() => h.run('greeting_send', { jobId: id, text: '您好，我想应聘这个岗位，方便聊聊吗？' }), /未获批准/)
    // 审计里留下的是 denied，不是 ok
    const records = store.audit.list(10)
    assert.equal(records[0]?.action, 'greeting.send')
    assert.equal(records[0]?.result, 'denied')
  } finally {
    close(h)
  }
})

test('job_settings：读不需要审批；模型改禁止项即使批准了也失败', async () => {
  const h = await harness({ request: async () => 'allowed-once' })
  try {
    const read = (await h.run('job_settings', { action: 'get' })) as { text: string }
    const definition = h.definitions.get('job_settings') as ToolDefinition
    const text = render(definition, { action: 'get' }, read)
    assert.ok(text.includes('模型用途'))
    assert.ok(text.includes('模型禁止改'))

    await assert.rejects(
      () => h.run('job_settings', { action: 'set', guard: { requireApproval: false } }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('不得修改'), error.message)
        return true
      },
    )

    // 允许的那部分（发送分层）批准后可以改
    const next = (await h.run('job_settings', { action: 'set', guard: { levels: { l4Reply: true } } })) as {
      text: string
    }
    assert.ok(next.text.includes('L4 回复：开'))
  } finally {
    close(h)
  }
})

test('job_settings 在模型身份下必须过审批（中危 + 模型）', async () => {
  let asked = 0
  const h = await harness({
    request: async () => {
      asked += 1
      return 'rejected'
    },
  })
  try {
    await assert.rejects(() =>
      h.run('job_settings', { action: 'set', guard: { levels: { l3Greeting: false } } }),
    )
    assert.equal(asked, 1)
  } finally {
    close(h)
  }
})

test('crawl_status 在任何数据状态下都能给出可读回答', async () => {
  const h = await harness()
  try {
    const value = (await h.run('crawl_status', {})) as { text: string }
    assert.ok(value.text.includes('抓取：'))
    assert.ok(value.text.includes('平台：'))
    assert.ok(value.text.includes('租约：'))
  } finally {
    close(h)
  }
})

test('数据层没就绪时工具给出可读错误，而不是空对象', async () => {
  const dir = tempDataDir()
  // 用一个打不开的目录（占位成文件）逼出数据层失败
  const runtime = createHostRuntime({ dataDir: dir })
  const { ctx, definitions } = fakeContext()
  const registration = registerJobHunterTools(ctx, runtime)
  try {
    // 故意不 await ready()：此刻 store 还是 undefined
    const definition = definitions.get('job_query') as ToolDefinition
    await assert.rejects(
      () => definition.execute({}, { callId: 'c', agent: {}, signal: new AbortController().signal }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('尚未就绪') || error.message.includes('数据层'))
        return true
      },
    )
  } finally {
    registration.dispose()
    runtime.close()
    cleanup(dir)
  }
})

test('toolExec 上下文只在工具执行期间存在（不在工具里就没有审批通道）', async () => {
  const h = await harness()
  try {
    assert.equal(toolExec.active(), false)
    await h.run('crawl_status', {})
    assert.equal(toolExec.active(), false, '执行结束上下文必须清掉，否则会串到下一次调用')
  } finally {
    close(h)
  }
})
