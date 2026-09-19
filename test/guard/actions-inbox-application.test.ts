/**
 * 适配器动作的 guard 实现：`syncInbox`（收件箱同步）、`sendApplication`（真投递）、
 * `sendReply`（真回复）。
 *
 * 这几条是本仓库把适配器的 `readInbox` / `sendResume` / `reply` 接到安全闸门上的第一层，
 * 所以必须钉住四件事：
 *   1. **令牌机制化强制**：绕过 `guard.run()` 直接调用必然失败；
 *   2. **送达语义不撒谎**：适配器没说 `delivered` 就不算发出去了，也不落本地记录；
 *   3. **收件箱幂等**：同一个会话的同一条消息重复同步只写一次（`message` 表没有唯一索引，
 *      去重只能在这一层做 —— 漏了它每同步一次库就翻一倍）；
 *   4. **缺能力时如实报错**：`ADAPTER_BROKEN`，而不是静默 0 条 / 假成功。
 *
 * 用假适配器 + 假页面来源，**不启动浏览器、不发任何网络请求**。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  sendApplication,
  APPLICATION_SEND_ACTION,
} from '../../src/host/guard/actions/application.js'
import { syncInbox, INBOX_SYNC_ACTION } from '../../src/host/guard/actions/inbox.js'
import { sendReply, REPLY_SEND_ACTION } from '../../src/host/guard/actions/reply.js'
import { probeContactStage, STAGE_PROBE_ACTION } from '../../src/host/guard/actions/stage.js'
import { guardAuthority, type GuardToken } from '../../src/host/guard/token.js'
import { createMessageService } from '../../src/host/domain/messages.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import type { SessionService } from '../../src/host/platform/session.js'
import type { PageLike, PageSource, RawInboxMessage, SiteAdapter } from '../../src/host/platform/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import type { Store } from '../../src/host/store/store.js'
import { cleanup, fixedClock, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
const PLATFORM = 'fake'

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

function sessionOf(loggedIn: boolean): SessionService {
  return {
    status: (platformId: string) => ({
      platformId,
      loggedIn,
      hiddenFromCurrentEmployer: true,
      lastCheckAt: T,
      hint: null,
      updatedAt: T,
    }),
  } as unknown as SessionService
}

/** 假页面来源：给一个空对象当页面（适配器动作只把它转手传给假实现）。 */
const fakePageSource: PageSource = {
  acquire: async () => ({}) as PageLike,
  release: async () => undefined,
}

/** 造一个只实现指定 actions 的假适配器。 */
function fakeAdapter(actions: SiteAdapter['actions']): SiteAdapter {
  return {
    id: PLATFORM,
    displayName: '假平台',
    ...platformFacts(PLATFORM),
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: true,
      supportsReadReceipt: true,
      supportsInbox: true,
      supportsGreeting: true,
      fieldCompleteness: 'medium',
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
    ...(actions === undefined ? {} : { actions }),
  }
}

function registryWith(actions: SiteAdapter['actions']) {
  const registry = createAdapterRegistry()
  registry.register(fakeAdapter(actions))
  return registry
}

function seedJob(store: Store): number {
  return store.job.upsert(
    {
      platformId: PLATFORM,
      platformJobId: 'fake-1',
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
      tags: [],
      sourceUrl: 'https://example.com/fake-1',
      publishedAt: T,
      jdText: '',
    },
    T,
  ).id
}

const INBOX_FIXTURE: RawInboxMessage[] = [
  {
    conversationId: 'c1',
    hrName: '张女士',
    company: '某某科技',
    lastMessage: '你好，方便发一份简历吗？',
    direction: 'hr',
    unread: true,
    at: null,
  },
  {
    conversationId: 'c2',
    hrName: '李先生',
    company: '另一家公司',
    lastMessage: '好的，期待您的消息',
    direction: 'me',
    unread: false,
    at: null,
  },
]

// ── syncInbox ─────────────────────────────────────────────────────────

test('syncInbox：没有 guard 令牌 → 直接拒绝（机制化强制）', async () => {
  await withStore(async (store) => {
    const deps = {
      registry: registryWith({ readInbox: async () => INBOX_FIXTURE }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }
    await assert.rejects(
      () => syncInbox(deps, undefined as unknown as GuardToken, { platformId: PLATFORM }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少 guard 令牌'), error.message)
        return true
      },
    )
    assert.equal(store.pipeline.listMessages().length, 0)
  })
})

test('syncInbox：正常路径写库；再同步一次全部判重（同一条消息只写一次）', async () => {
  await withStore(async (store) => {
    const messages = createMessageService({ store, clock: fixedClock(T) })
    const deps = {
      registry: registryWith({ readInbox: async () => INBOX_FIXTURE }),
      session: sessionOf(true),
      pageSource: fakePageSource,
      record: (input: {
        platformId: string
        direction: 'hr' | 'me'
        content: string
        conversationId: string
        at: string | null
      }) =>
        messages.recordOnce({
          platformId: input.platformId,
          direction: input.direction,
          content: input.content,
          conversationId: input.conversationId,
          ...(input.at === null ? {} : { at: input.at }),
        }),
    }

    const first = await guardAuthority.run(
      guardAuthority.issue({ action: INBOX_SYNC_ACTION, actor: 'gui', danger: 'low' }),
      () => syncInbox(deps, guardAuthority.current() as GuardToken, { platformId: PLATFORM }),
    )
    assert.equal(first.fetched, 2)
    assert.equal(first.recorded, 2)
    assert.equal(first.duplicates, 0)
    assert.equal(first.unread, 1)
    assert.equal(store.pipeline.listMessages().length, 2)

    // 第二次同步同样的内容：一条都不该新增
    const second = await guardAuthority.run(
      guardAuthority.issue({ action: INBOX_SYNC_ACTION, actor: 'gui', danger: 'low' }),
      () => syncInbox(deps, guardAuthority.current() as GuardToken, { platformId: PLATFORM }),
    )
    assert.equal(second.recorded, 0)
    assert.equal(second.duplicates, 2)
    assert.equal(store.pipeline.listMessages().length, 2, '重复同步不能让消息翻倍')
  })
})

test('syncInbox：未登录 / 适配器没实现 → 如实失败（绝不返回 0 条）', async () => {
  await withStore(async (store) => {
    const readInboxImpl = { readInbox: async () => [] as RawInboxMessage[] }
    const token = (): GuardToken => {
      return guardAuthority.issue({ action: INBOX_SYNC_ACTION, actor: 'gui', danger: 'low' })
    }

    // 未登录
    await assert.rejects(
      () =>
        guardAuthority.run(token(), () =>
          syncInbox(
            { registry: registryWith(readInboxImpl), session: sessionOf(false), pageSource: fakePageSource },
            guardAuthority.current() as GuardToken,
            { platformId: PLATFORM },
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'NOT_LOGGED_IN')
        return true
      },
    )

    // 适配器没实现 readInbox
    await assert.rejects(
      () =>
        guardAuthority.run(token(), () =>
          syncInbox(
            { registry: registryWith({ sayHello: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }) }), session: sessionOf(true), pageSource: fakePageSource },
            guardAuthority.current() as GuardToken,
            { platformId: PLATFORM },
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'ADAPTER_BROKEN')
        assert.ok(error.message.includes('收件箱'), error.message)
        return true
      },
    )
  })
})

// ── sendApplication ───────────────────────────────────────────────────

test('sendApplication：没有 guard 令牌 → 直接拒绝；没投出去就不落投递记录', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const deps = {
      store,
      registry: registryWith({
        sendResume: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }
    await assert.rejects(
      () => sendApplication(deps, undefined as unknown as GuardToken, { jobId, filePath: null }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少 guard 令牌'), error.message)
        return true
      },
    )
    assert.equal(store.pipeline.listApplications().length, 0)
  })
})

test('sendApplication：适配器报 delivered → 返回送达状态并回调记账', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const recorded: Array<{ jobId: number; delivery: string }> = []
    const deps = {
      store,
      registry: registryWith({
        sendResume: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom', message: '平台简历投出' }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
      record: (input: { jobId: number; delivery: string }) =>
        void recorded.push({ jobId: input.jobId, delivery: input.delivery }),
    }

    const result = await guardAuthority.run(
      guardAuthority.issue({ action: APPLICATION_SEND_ACTION, actor: 'gui', danger: 'high' }),
      () => sendApplication(deps, guardAuthority.current() as GuardToken, { jobId, filePath: null }),
    )

    assert.equal(result.delivery, 'delivered')
    assert.equal(result.jobId, jobId)
    assert.equal(result.platformId, PLATFORM)
    assert.equal(recorded.length, 1, '成功之后必须回调记账')
    assert.equal(recorded[0]?.delivery, 'delivered')
  })
})

test('sendApplication：适配器说没投出去 → 抛错并原样带上 delivery/evidence，且不记账', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    let recordedCount = 0
    const deps = {
      store,
      registry: registryWith({
        sendResume: async () => ({
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '平台没有本地文件上传入口',
        }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
      record: () => {
        recordedCount += 1
      },
    }

    await assert.rejects(
      () =>
        guardAuthority.run(
          guardAuthority.issue({ action: APPLICATION_SEND_ACTION, actor: 'gui', danger: 'high' }),
          () => sendApplication(deps, guardAuthority.current() as GuardToken, { jobId, filePath: null }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INTERNAL')
        assert.ok(error.message.includes('本地文件上传入口'), error.message)
        assert.equal((error.detail as { delivery?: string })?.delivery, 'missing')
        assert.equal((error.detail as { evidence?: string })?.evidence, 'none')
        return true
      },
    )
    assert.equal(recordedCount, 0, '没投出去就不能记一笔')
  })
})

test('sendApplication：适配器没实现投递 → ADAPTER_BROKEN（不假装成功）', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    await assert.rejects(
      () =>
        guardAuthority.run(
          guardAuthority.issue({ action: APPLICATION_SEND_ACTION, actor: 'gui', danger: 'high' }),
          () =>
            sendApplication(
              {
                store,
                registry: registryWith({ readInbox: async () => [] }),
                session: sessionOf(true),
                pageSource: fakePageSource,
              },
              guardAuthority.current() as GuardToken,
              { jobId, filePath: null },
            ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'ADAPTER_BROKEN')
        assert.ok(error.message.includes('投递动作'), error.message)
        return true
      },
    )
  })
})

// ── probeContactStage ─────────────────────────────────────────────────

test('probeContactStage：没有 guard 令牌 → 直接拒绝；探测不改动任何本地状态', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const deps = {
      store,
      registry: registryWith({ detectStage: async () => 'replied' }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }
    await assert.rejects(
      () => probeContactStage(deps, undefined as unknown as GuardToken, { jobId }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少 guard 令牌'), error.message)
        return true
      },
    )
    assert.equal(store.pipeline.listGreetings().length, 0)
  })
})

test('probeContactStage：适配器报 replied → 只回事实，并明说"没有改动任何本地状态"', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const deps = {
      store,
      registry: registryWith({ detectStage: async () => 'replied' }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }

    const result = await guardAuthority.run(
      guardAuthority.issue({ action: STAGE_PROBE_ACTION, actor: 'gui', danger: 'low' }),
      () => probeContactStage(deps, guardAuthority.current() as GuardToken, { jobId }),
    )

    assert.equal(result.stage, 'replied')
    assert.equal(result.jobId, jobId)
    assert.equal(result.platformId, PLATFORM)
    assert.ok(result.note.includes('没有改动任何本地状态'), result.note)
    // 探测 ≠ 改状态：接触态那条记录一条都不该冒出来
    assert.equal(store.pipeline.listGreetings().length, 0, '探测不该写出任何接触记录')
  })
})

test('probeContactStage：判不出来 → null（不是 none），并解释为什么', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const deps = {
      store,
      registry: registryWith({ detectStage: async () => null }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }

    const result = await guardAuthority.run(
      guardAuthority.issue({ action: STAGE_PROBE_ACTION, actor: 'gui', danger: 'low' }),
      () => probeContactStage(deps, guardAuthority.current() as GuardToken, { jobId }),
    )

    // 拿 `none` 顶上会让"从没打过招呼"与"会话被移出保留窗口"混成一件
    assert.equal(result.stage, null)
    assert.ok(result.note.includes('判不出'), result.note)
  })
})

test('probeContactStage：未登录 / 适配器没实现 → 如实失败（不返回一个像 none 的东西）', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const token = (): GuardToken =>
      guardAuthority.issue({ action: STAGE_PROBE_ACTION, actor: 'gui', danger: 'low' })

    await assert.rejects(
      () =>
        guardAuthority.run(token(), () =>
          probeContactStage(
            {
              store,
              registry: registryWith({ detectStage: async () => 'replied' }),
              session: sessionOf(false),
              pageSource: fakePageSource,
            },
            guardAuthority.current() as GuardToken,
            { jobId },
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'NOT_LOGGED_IN')
        return true
      },
    )

    await assert.rejects(
      () =>
        guardAuthority.run(token(), () =>
          probeContactStage(
            {
              store,
              registry: registryWith({ readInbox: async () => [] }),
              session: sessionOf(true),
              pageSource: fakePageSource,
            },
            guardAuthority.current() as GuardToken,
            { jobId },
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'ADAPTER_BROKEN')
        assert.ok(error.message.includes('探测接触阶段'), error.message)
        return true
      },
    )

    await assert.rejects(
      () =>
        guardAuthority.run(token(), () =>
          probeContactStage(
            { store, registry: registryWith({}), session: sessionOf(true), pageSource: fakePageSource },
            guardAuthority.current() as GuardToken,
            { jobId: 9999 },
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'NOT_FOUND')
        return true
      },
    )
  })
})

// ── sendReply ─────────────────────────────────────────────────────────

/** 造一条 HR 发来的消息（可带/不带岗位）。 */
function seedIncomingMessage(store: Store, jobId: number | null): number {
  return store.pipeline.createMessage(
    {
      platformId: PLATFORM,
      direction: 'hr',
      content: '方便聊聊吗？',
      ...(jobId === null ? {} : { jobId }),
      conversationId: 'c1',
    },
    T,
  ).id
}

test('sendReply：没有 guard 令牌 → 直接拒绝，且不落本地记录', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const messageId = seedIncomingMessage(store, jobId)
    const deps = {
      store,
      registry: registryWith({
        reply: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }
    await assert.rejects(
      () => sendReply(deps, undefined as unknown as GuardToken, { messageId, text: '在的' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少 guard 令牌'), error.message)
        return true
      },
    )
    assert.equal(store.pipeline.listMessages().filter((item) => item.direction === 'me').length, 0)
  })
})

test('sendReply：适配器报 delivered → 返回结果并回调记账', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const messageId = seedIncomingMessage(store, jobId)
    const recorded: Array<{ jobId: number; actor: string; content: string }> = []
    const deps = {
      store,
      registry: registryWith({
        reply: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
      record: (input: { jobId: number; actor: string; content: string }) => void recorded.push(input),
    }

    const result = await guardAuthority.run(
      guardAuthority.issue({ action: REPLY_SEND_ACTION, actor: 'gui', danger: 'high' }),
      () => sendReply(deps, guardAuthority.current() as GuardToken, { messageId, text: '可以，明天下午两点。' }),
    )

    assert.equal(result.messageId, messageId)
    assert.equal(result.jobId, jobId)
    assert.equal(result.platformId, PLATFORM)
    assert.equal(result.textLength, '可以，明天下午两点。'.length)
    // 返回值与审计都**不带正文**（§4.1），只留长度
    assert.equal(recorded.length, 1, '发送成功之后才记账')
    assert.equal(recorded[0]?.content, '可以，明天下午两点。')
  })
})

test('sendReply：适配器说没发出去 → 抛错带上 delivery/evidence，且不记账', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const messageId = seedIncomingMessage(store, jobId)
    let recordedCount = 0
    const deps = {
      store,
      registry: registryWith({
        reply: async () => ({
          ok: false,
          delivery: 'pending',
          evidence: 'dom',
          message: '回复已出现在会话里但仍在「发送中」，未能确认送达。',
        }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
      record: () => {
        recordedCount += 1
      },
    }

    await assert.rejects(
      () =>
        guardAuthority.run(
          guardAuthority.issue({ action: REPLY_SEND_ACTION, actor: 'gui', danger: 'high' }),
          () => sendReply(deps, guardAuthority.current() as GuardToken, { messageId, text: '在的' }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal((error.detail as { delivery?: string })?.delivery, 'pending')
        assert.equal((error.detail as { evidence?: string })?.evidence, 'dom')
        // pending 的处置建议是"去核对，别急着重试"（重试会重复发送）
        assert.ok(error.hint?.includes('不要立刻重试') === true, error.hint)
        return true
      },
    )
    assert.equal(recordedCount, 0, '没确认送达就不能记成"我已回复"')
  })
})

test('sendReply：适配器没实现 reply → ADAPTER_BROKEN（不假装成功、不写本地）', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const messageId = seedIncomingMessage(store, jobId)
    await assert.rejects(
      () =>
        guardAuthority.run(
          guardAuthority.issue({ action: REPLY_SEND_ACTION, actor: 'gui', danger: 'high' }),
          () =>
            sendReply(
              {
                store,
                registry: registryWith({ readInbox: async () => [] }),
                session: sessionOf(true),
                pageSource: fakePageSource,
              },
              guardAuthority.current() as GuardToken,
              { messageId, text: '在的' },
            ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'ADAPTER_BROKEN')
        assert.ok(error.message.includes('回复消息'), error.message)
        return true
      },
    )
    assert.equal(store.pipeline.listMessages().filter((item) => item.direction === 'me').length, 0)
  })
})

test('sendReply：消息不存在 / 没关联岗位 → 如实拒绝（不猜一个会话发出去）', async () => {
  await withStore(async (store) => {
    const orphanId = seedIncomingMessage(store, null)
    const deps = {
      store,
      registry: registryWith({
        reply: async () => ({ ok: true, delivery: 'delivered', evidence: 'dom' }),
      }),
      session: sessionOf(true),
      pageSource: fakePageSource,
    }
    const token = (): GuardToken => guardAuthority.issue({ action: REPLY_SEND_ACTION, actor: 'gui', danger: 'high' })

    await assert.rejects(
      () => guardAuthority.run(token(), () => sendReply(deps, guardAuthority.current() as GuardToken, { messageId: 9999, text: '在的' })),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'NOT_FOUND')
        return true
      },
    )

    await assert.rejects(
      () => guardAuthority.run(token(), () => sendReply(deps, guardAuthority.current() as GuardToken, { messageId: orphanId, text: '在的' })),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.equal((error.detail as { platformId?: string })?.platformId, PLATFORM)
        return true
      },
    )
  })
})
