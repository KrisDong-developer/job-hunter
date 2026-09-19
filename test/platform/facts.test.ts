/**
 * 适配器契约的三轴测试（capabilities / implementation / maturity + authRequirement）。
 *
 * 这一层的教训来自一次"需求被误判为已达成"：`51job` 的 `capabilities` 声明
 * `supportsGreeting: true`，而 `actions` 压根是 `undefined` ——
 * 两个字段互相矛盾，调用方只能靠 `actions === undefined` 绕开它。
 * 现在拆成三轴，并由**派生**保证 `implementation` 不会手写漂移。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLATFORM_FACTS, platformFacts } from '../../src/host/platform/platform-facts.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import { adapterImplementationOf, type SiteAdapter } from '../../src/host/platform/types.js'
import { MATURITY_LEVELS } from '../../src/shared/contract/enums/platform.js'
import { cleanup, tempDataDir } from '../support/store.js'

async function withRuntime(fn: (runtime: ReturnType<typeof createHostRuntime>) => void | Promise<void>) {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    await fn(runtime)
  } finally {
    runtime.close()
    cleanup(dir)
  }
}

test('每个注册的平台都登记了"事实行"（不允许靠默认兜底混过去）', async () => {
  await withRuntime((runtime) => {
    const items = runtime.platforms()
    assert.ok(items.length >= 10, `注册平台数异常：${String(items.length)}`)
    for (const item of items) {
      assert.ok(
        PLATFORM_FACTS[item.id] !== undefined,
        `平台「${item.id}」没有登记 PLATFORM_FACTS —— 新增适配器必须同时登记成熟度与登录需求`,
      )
      assert.ok(
        (MATURITY_LEVELS as readonly string[]).includes(item.maturity.level),
        `平台「${item.id}」的成熟度取值非法：${String(item.maturity.level)}`,
      )
      assert.ok(
        item.implementation !== undefined && item.authRequirement !== undefined,
        `平台「${item.id}」的 /platforms 概览缺 implementation 或 authRequirement`,
      )
    }
  })
})

test('成熟度是"可核查的"：日期格式合法，未验证的如实标出来', async () => {
  await withRuntime((runtime) => {
    for (const item of runtime.platforms()) {
      const { level, verifiedAt, notes } = item.maturity
      assert.ok(level !== 'stable' || verifiedAt !== null, `「${item.id}」标了 stable 却没有验证日期`)
      if (verifiedAt !== null) {
        assert.match(
          verifiedAt,
          /^\d{4}-\d{2}-\d{2}$/,
          `平台「${item.id}」的 verifiedAt 不是 YYYY-MM-DD：${verifiedAt}`,
        )
      }
      // 标成实验性/停用就必须写清原因 —— 否则用户只看到"这个平台有问题"，不知道怎么办
      if (level === 'experimental' || level === 'disabled') {
        assert.ok(
          (notes ?? '').length > 10,
          `平台「${item.id}」是 ${level}，必须在 notes 里写清缺口（现在写的是：${String(notes)}）`,
        )
      }
    }
  })
})

test('implementation 由实现派生，不手写', () => {
  const base = {
    id: 'synthetic',
    displayName: 'Synthetic',
    ...platformFacts('synthetic'),
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      fieldCompleteness: 'low',
      antiBot: 'low',
    },
    requiredFields: ['title'],
    criteriaDimensions: [],
    maxPages: 1,
    defaultMaxPages: 1,
    criteria: { buildSearchUrl: () => null },
    crawl: {
      gotoSearch: async () => undefined,
      readListPage: async () => [],
      hasNextPage: async () => false,
    },
    guard: { detectBlock: async () => null },
  } satisfies Omit<SiteAdapter, 'actions' | 'detail' | 'auth'>

  // 什么都没实现
  const bare: SiteAdapter = { ...base }
  const bareImpl = adapterImplementationOf(bare)
  assert.equal(bareImpl.detail, false)
  assert.equal(bareImpl.loginCheck, false)
  assert.deepEqual(bareImpl.actions, {
    sayHello: false,
    sendResume: false,
    reply: false,
    readInbox: false,
    detectStage: false,
  })

  // 实现了一部分 → 只那部分为真
  const partial: SiteAdapter = {
    ...base,
    detail: { extract: async () => ({ platformJobId: '', title: '', salaryRaw: '', company: '', sourceUrl: '' }) },
    auth: { loginUrl: 'https://example.com/login', isLoggedIn: async () => true },
    actions: { sayHello: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }) },
  }
  const partialImpl = adapterImplementationOf(partial)
  assert.equal(partialImpl.detail, true)
  assert.equal(partialImpl.loginCheck, true)
  assert.equal(partialImpl.actions.sayHello, true)
  assert.equal(partialImpl.actions.sendResume, false, '实现与声明必须一致，不能一并当成"都实现了"')
})

test('平台支持 ≠ 我们实现了：capabilities 与 implementation 都暴露，且允许不一致', async () => {
  await withRuntime((runtime) => {
    const items = runtime.platforms()
    const withGreetingCapability = items.filter(
      (item) => (item.capabilities as { supportsGreeting?: boolean }).supportsGreeting === true,
    )
    assert.ok(
      withGreetingCapability.length > 0,
      '应当存在"平台支持打招呼"的平台（如 51job）—— 否则这条断言失去意义',
    )
    // 这正是拆三轴的理由：平台**能**打招呼，我们**可以还没实现**。
    // 两个字段各答各的问题，界面才不会用 capabilities 去渲染一个点了会失败的按钮。
    // 但反方向必须自洽：**实现了就说明平台支持**，不能实现一个平台不支持的动作用于。
    for (const item of items) {
      if (item.implementation.actions.sayHello) {
        assert.equal(
          (item.capabilities as { supportsGreeting?: boolean }).supportsGreeting,
          true,
          `「${item.id}」实现了 sayHello，却把 supportsGreeting 标成 false —— 两处不自洽`,
        )
      }
    }
    // zhipin 是第一个真正实现打招呼的适配器（2026-09-18）：这条断言保证
    // "有实现"这件事本身可见 —— 全部未实现时它会红，提醒别再当成"都不能发"。
    assert.ok(
      items.some((item) => item.implementation.actions.sayHello),
      '至少应有一个平台实现了 sayHello（zhipin）—— 若全部未实现，请检查是否被回退',
    )
    // 同一条理由用在 reply 上（zhipin 2026-09-18 实现的"在已有会话里真回消息"）：
    // 全部未实现时这条会红 —— 那正是"回复"退回成"只在本地写一条记录"的样子。
    assert.ok(
      items.some((item) => item.implementation.actions.reply),
      '至少应有一个平台实现了 reply（zhipin）—— 若全部未实现，回复就又变成只写本地记录',
    )
    // 收件箱：**实现了 readInbox 就必须承认平台有收件箱**（反向不自洽会让界面用
    // capabilities 去渲染一个"平台没有"的功能）。2026-09-18 起 zhipin / zhaopin 都实现了。
    for (const item of items) {
      if (item.implementation.actions.readInbox) {
        assert.equal(
          item.capabilities.supportsInbox,
          true,
          `「${item.id}」实现了 readInbox，却把 supportsInbox 标成 false —— 两处不自洽`,
        )
      }
    }
    assert.ok(
      items.some((item) => item.implementation.actions.detectStage),
      '至少应有一个平台实现了 detectStage（zhipin / zhaopin）—— 若全部未实现，阶段探测就是空架子',
    )
  })
})

test('登录需求：unknown 是合法且诚实的取值', async () => {
  await withRuntime((runtime) => {
    const items = runtime.platforms()
    const unknown = items.filter((item) =>
      [item.authRequirement.crawl, item.authRequirement.detail, item.authRequirement.actions].includes(
        'unknown',
      ),
    )
    assert.ok(
      unknown.length > 0,
      '当前确有平台还没验证过登录需求 —— 若全部都已验证，请把这条断言改成"全部已知"',
    )
    // 自洽性：既然实现了登录检测，就说明我们知道这个平台要登录 ——
    // 不该把全部环节都标成 unknown（那说明两处至少有一处是错的）
    for (const item of items) {
      if (!item.implementation.loginCheck) continue
      const allUnknown = Object.values(item.authRequirement).every((value) => value === 'unknown')
      assert.equal(
        allUnknown,
        false,
        `「${item.id}」实现了登录检测，却把全部环节的登录需求标成 unknown —— 两处不自洽`,
      )
    }
  })
})
