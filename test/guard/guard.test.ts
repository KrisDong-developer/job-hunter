import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApprovalPort, renderApproval, toDecision, type ApprovalRequest } from '../../src/host/guard/approval.js'
import {
  ConfirmRequiredError,
  createGuard,
  needsApproval,
  type Guard,
} from '../../src/host/guard/index.js'
import {
  FORBIDDEN_FOR_MODEL,
  DEFAULT_GUARD_CONFIG,
  isDayOff,
  parseSendWindow,
  inSendWindow,
  runRuleChain,
  writeGuardConfig,
} from '../../src/host/guard/rules.js'
import { guardAuthority, type GuardToken } from '../../src/host/guard/token.js'
import { sendGreeting, GREETING_SEND_ACTION } from '../../src/host/guard/actions/greeting.js'
import { writeGuardSettings, SETTINGS_WRITE_ACTION } from '../../src/host/guard/actions/settings.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import type { SessionService } from '../../src/host/platform/session.js'
import type { Store } from '../../src/host/store/store.js'
import type { GuardInput } from '../../src/host/guard/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, fixedClock, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

/** 一个"永远同意"的审批端口。 */
const yesPort = createApprovalPort({ ask: async () => true })
/** 一个"永远拒绝"的审批端口。 */
const noPort = createApprovalPort({ ask: async () => false })
/** 没有审批界面（headless）。 */
const noUiPort = createApprovalPort({})

/** 一个"登录了、也确认了隐身"的会话：让高危动作能过隐身这一关，测到后面的逻辑。 */
const okSession = {
  status: () => ({
    platformId: '51job',
    loggedIn: true,
    hiddenFromCurrentEmployer: true,
    lastCheckAt: T,
    hint: null,
    updatedAt: T,
  }),
} as unknown as SessionService

function makeGuard(store: Store, port = yesPort, session: SessionService = okSession): Guard {
  // 发送窗口/休息日按**本地时钟**判定，会让用例随时段漂移 —— 这里统一关掉，
  // 它们自己的行为在专门的用例里用受控窗口测。
  writeGuardConfig(store, { sendWindow: '', dayOffProbability: 0 }, T)
  return createGuard({
    store,
    approval: port,
    clock: fixedClock(T),
    session,
  })
}

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

const lowInput: GuardInput = { action: 'job.list', actor: 'model', danger: 'low' }

test('审批规则：高危一律问，模型发起的中危也要问，低危不打扰', () => {
  const config = DEFAULT_GUARD_CONFIG
  for (const actor of ['gui', 'model', 'schedule'] as const) {
    assert.equal(needsApproval({ action: 'a', actor, danger: 'high' }, config), true, `${actor} + high`)
    assert.equal(needsApproval({ action: 'a', actor, danger: 'low' }, config), false, `${actor} + low`)
  }
  assert.equal(needsApproval({ action: 'a', actor: 'model', danger: 'mid' }, config), true)
  assert.equal(needsApproval({ action: 'a', actor: 'gui', danger: 'mid' }, config), false)

  // 用户把审批整个关掉之后，连高危也不问了 —— 那是用户自己的选择，但配置项本身模型改不了
  assert.equal(
    needsApproval({ action: 'a', actor: 'model', danger: 'high' }, { ...config, requireApproval: false }),
    false,
  )
})

test('界面发起的高危动作：第一次抛 NEEDS_CONFIRM（不是拒绝，也不写 denied 审计）', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    const input: GuardInput = {
      action: 'greeting.send',
      actor: 'gui',
      danger: 'high',
      target: { platformId: '51job', jobId: 7 },
      payload: { text: '你好，我想应聘这个岗位。' },
    }

    await assert.rejects(
      () => guard.run(input, async () => '不该执行'),
      (error: unknown) => {
        assert.ok(error instanceof ConfirmRequiredError)
        assert.equal(error.code, 'NEEDS_CONFIRM')
        const text = error.text()
        // §4.4.2 要求确认文案含：发起者、平台、目标、内容全文、简历版本
        assert.ok(text.includes('界面上的你'))
        assert.ok(text.includes('51job'))
        assert.ok(text.includes('#7'))
        assert.ok(text.includes('你好，我想应聘这个岗位。'))
        assert.ok(text.includes('使用简历版本'))
        return true
      },
    )

    // 还没问过 → 不能留下"被拒绝"的假记录
    assert.equal(store.audit.count(), 0)
    assert.equal(guard.authority().liveCount(), 0)
  })
})

test('界面二次确认后才执行，且审计里记下了确认来源', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    const value = await guard.run(
      {
        action: 'greeting.send',
        actor: 'gui',
        danger: 'high',
        target: { platformId: '51job', jobId: 7 },
        payload: { text: '你好' },
        guiConfirmed: true,
      },
      async (token) => {
        guardAuthority.assert(token, 'greeting.send')
        return 'sent'
      },
    )
    assert.equal(value, 'sent')
    const records = store.audit.list(10)
    assert.equal(records.length, 1)
    assert.equal(records[0]?.result, 'ok')
    const approval = records[0]?.approval as { approved: boolean; by: string } | null
    assert.equal(approval?.approved, true)
    assert.equal(approval?.by, 'gui-confirm')
  })
})

test('**模型不能自我确认**：带 guiConfirmed 的模型调用被拒绝并审计', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    await assert.rejects(
      () =>
        guard.run(
          { action: 'greeting.send', actor: 'model', danger: 'high', guiConfirmed: true },
          async () => '不该执行',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'GUARD_DENIED')
        assert.ok(error.message.includes('不得自带'))
        return true
      },
    )
    const records = store.audit.list(10)
    assert.equal(records[0]?.result, 'denied')
    assert.ok((records[0]?.reason ?? '').includes('已确认'))
  })
})

test('没有审批界面时 fail-closed：高危动作被拒，并留下"待确认动作"待办', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store, noUiPort)
    await assert.rejects(
      () =>
        guard.run(
          {
            action: 'greeting.send',
            actor: 'model',
            danger: 'high',
            target: { platformId: '51job' },
          },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.hint?.includes('没有审批界面'), error.hint)
        return true
      },
    )
    assert.equal(store.todo.countOpen(), 1, '无界面被拒时要留一条待办，而不是静默丢弃')
  })
})

test('用户拒绝后不自动重试，也不写待办', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store, noPort)
    await assert.rejects(
      () =>
        guard.run(
          {
            action: 'greeting.send',
            actor: 'model',
            danger: 'high',
            target: { platformId: '51job' },
          },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.hint?.includes('拒绝了'), error.hint)
        return true
      },
    )
    assert.equal(store.todo.countOpen(), 0)
    assert.equal(store.audit.list(10)[0]?.result, 'denied')
  })
})

test('禁止项硬编码：模型改审批开关会被拒，用户改则放行', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    for (const key of FORBIDDEN_FOR_MODEL) {
      await assert.rejects(
        () =>
          guard.run(
            { action: SETTINGS_WRITE_ACTION, actor: 'model', danger: 'mid', payload: { patch: { [key]: 1 } } },
            async () => 'x',
          ),
        (error: unknown) => {
          assert.ok(error instanceof DomainError)
          assert.ok(error.message.includes(key), `${key} 应当被点名拒绝`)
          return true
        },
      )
    }
    // 界面上改同一个键是允许的（那是用户自己的风险开关）
    const next = await guard.run(
      { action: SETTINGS_WRITE_ACTION, actor: 'gui', danger: 'mid', payload: { patch: { auditEnabled: false } } },
      async (token) => writeGuardSettings({ store }, token, { auditEnabled: false }),
    )
    assert.equal(next.auditEnabled, false)
  })
})

test('发送分层开关：关掉 L4 投递后 application.send 直接被拒', async () => {
  await withStore(async (store) => {
    writeGuardConfig(store, { levels: { ...DEFAULT_GUARD_CONFIG.levels, l4Application: false } }, T)
    const guard = makeGuard(store)
    await assert.rejects(
      () =>
        guard.run(
          { action: 'application.send', actor: 'gui', danger: 'high', target: { platformId: '51job' } },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'GUARD_DENIED')
        assert.ok(error.message.includes('l4Application'))
        return true
      },
    )
  })
})

test('隐身检查：高危动作缺少平台 / 未确认隐身都拒绝', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    await assert.rejects(
      () => guard.run({ action: 'greeting.send', actor: 'gui', danger: 'high' }, async () => 'x'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少平台'))
        return true
      },
    )

    const session = {
      status: () => ({
        platformId: '51job',
        loggedIn: true,
        hiddenFromCurrentEmployer: false,
        lastCheckAt: null,
        hint: null,
        updatedAt: null,
      }),
    } as unknown as SessionService
    const withSession = makeGuard(store, yesPort, session)
    await assert.rejects(
      () =>
        withSession.run(
          {
            action: 'greeting.send',
            actor: 'gui',
            danger: 'high',
            target: { platformId: '51job' },
            guiConfirmed: true,
          },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('未确认对当前雇主隐藏'))
        return true
      },
    )
  })
})

test('批量上限：模型一次带 6 个岗位被拒，5 个以内放行', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    const mk = (n: number): GuardInput => ({
      action: 'job.match',
      actor: 'model',
      danger: 'low',
      payload: { jobIds: Array.from({ length: n }, (_value, index) => index + 1) },
    })
    await assert.rejects(
      () => guard.run(mk(6), async () => 'x'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('超过上限'))
        return true
      },
    )
    assert.equal(await guard.run(mk(5), async () => 'ok'), 'ok')
  })
})

test('每日额度：额度的计数来源就是审计表', async () => {
  await withStore(async (store) => {
    writeGuardConfig(store, { dailyLimits: { greeting: 2, application: 10, reply: 30 } }, T)
    const guard = makeGuard(store)
    const input: GuardInput = {
      action: 'greeting.send',
      actor: 'gui',
      danger: 'low', // 用低危绕过审批，单独验证额度这一项
      target: { platformId: '51job' },
      guiConfirmed: true,
    }
    await guard.run(input, async () => 'ok')
    await guard.run(input, async () => 'ok')
    await assert.rejects(
      () => guard.run(input, async () => 'x'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('已达上限'))
        return true
      },
    )
  })
})

test('冷却期：同一公司在冷却期内不能重复投递', async () => {
  await withStore(async (store) => {
    writeGuardConfig(store, { cooldownMinutes: 60 }, T)
    const guard = makeGuard(store)
    const input: GuardInput = {
      action: 'greeting.send',
      actor: 'gui',
      danger: 'low',
      target: { platformId: '51job', companyId: 3 },
    }
    await guard.run(input, async () => 'ok')
    await assert.rejects(
      () => guard.run(input, async () => 'x'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('冷却期'))
        return true
      },
    )
    // 换一家公司不受影响
    assert.equal(
      await guard.run({ ...input, target: { platformId: '51job', companyId: 4 } }, async () => 'ok'),
      'ok',
    )
  })
})

test('审计只存摘要与长度：话术全文不进审计表', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    const secret = '这是一段很长的话术正文，里面有我的真实联系方式 13800138000 和一堆细节。'
    await guard.run(
      { action: 'greeting.send', actor: 'gui', danger: 'low', payload: { text: secret } },
      async () => 'ok',
    )
    const record = store.audit.list(1)[0]
    const serialized = JSON.stringify(record)
    assert.equal(serialized.includes('13800138000'), false, '正文里的手机号不得进审计')
    const detail = record?.detail as { text?: { length?: number; redacted?: boolean } }
    assert.equal(detail.text?.length, secret.length, '只留长度')
    assert.equal(detail.text?.redacted, true)
  })
})

test('preview 不执行、不写审计，但会告诉你要不要审批', async () => {
  await withStore(async (store) => {
    const guard = makeGuard(store)
    const preview = guard.preview({ action: 'greeting.send', actor: 'gui', danger: 'high', target: { platformId: '51job' } })
    assert.equal(preview.needsApproval, true)
    assert.ok((preview.confirmText ?? '').includes('greeting.send'))
    assert.equal(store.audit.count(), 0)
  })
})

test('guard 令牌：直接调用危险实现必然失败（P10 机制化强制）', async () => {
  await withStore(async (store) => {
    const registry = createAdapterRegistry()
    const deps = {
      store,
      registry,
      session: { status: () => undefined } as unknown as SessionService,
      pageSource: {
        acquire: async () => ({}) as never,
        release: async () => undefined,
      },
    }

    // ① 完全不给令牌
    await assert.rejects(
      () => sendGreeting(deps, undefined as unknown as GuardToken, { jobId: 1, text: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('缺少 guard 令牌'))
        return true
      },
    )

    // ② 伪造一个令牌，但不在 guard 上下文里
    const forged = guardAuthority.issue({ action: GREETING_SEND_ACTION, actor: 'gui', danger: 'high' })
    await assert.rejects(
      () => sendGreeting(deps, forged, { jobId: 1, text: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('不在当前上下文中'))
        return true
      },
    )

    // ③ 动作名不匹配
    await assert.rejects(
      () =>
        guardAuthority.run(guardAuthority.issue({ action: 'other.action', actor: 'gui', danger: 'high' }), () =>
          sendGreeting(deps, guardAuthority.current() as GuardToken, { jobId: 1, text: 'x' }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('与动作不匹配'))
        return true
      },
    )
  })
})

test('令牌是一次性的：同一个令牌用两次会被拒', async () => {
  await withStore(async (store) => {
    const token = guardAuthority.issue({ action: SETTINGS_WRITE_ACTION, actor: 'gui', danger: 'mid' })
    await guardAuthority.run(token, async () => {
      writeGuardSettings({ store }, token, { batchLimit: 9 })
    })
    await assert.rejects(
      () =>
        guardAuthority.run(token, async () => {
          writeGuardSettings({ store }, token, { batchLimit: 8 })
        }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.message.includes('已被使用过'))
        return true
      },
    )
  })
})

test('「没问到」和「用户拒绝」必须区分开 —— 真实模型跑 headless 时读不出来的正是这一点', async () => {
  await withStore(async (store) => {
    // 宿主挂着 approval 服务，但里面没有应答者 → 通道报 'unavailable'
    const noAnswerer = createApprovalPort({ ask: async () => 'unavailable' })
    const guard = makeGuard(store, noAnswerer)
    await assert.rejects(
      () =>
        guard.run(
          { action: 'greeting.send', actor: 'model', danger: 'high', target: { platformId: '51job' } },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        // 失败原因要指向"没有审批界面"，而不是含糊的"用户未批准"
        assert.ok(error.hint?.includes('没有审批界面'), error.hint)
        // 结构化 detail 里也要能读到区分（模型与界面都能据此判断下一步该做什么）
        assert.equal((error.detail as { via?: string })?.via, 'unavailable')
        return true
      },
    )
    // 而且这种情形**要留待办**：一次没问到的危险动作不该静默消失
    assert.equal(store.todo.countOpen(), 1)

    // 对照：用户明确驳回 → 不留待办（他刚刚才做过决定）
    const rejected = createApprovalPort({ ask: async () => false })
    const guard2 = makeGuard(store, rejected)
    await assert.rejects(
      () =>
        guard2.run(
          { action: 'greeting.send', actor: 'model', danger: 'high', target: { platformId: '51job' } },
          async () => 'x',
        ),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.ok(error.hint?.includes('拒绝了'), error.hint)
        return true
      },
    )
    assert.equal(store.todo.countOpen(), 1, '驳回不该再加待办')
  })
})

test('toDecision：只有 true 是放行，其余取值各有各的说法', () => {
  assert.deepEqual(toDecision(true), { approved: true, via: 'user', by: 'user' })
  assert.equal(toDecision(false).via, 'user')
  assert.ok((toDecision(false).reason ?? '').includes('拒绝'))
  assert.equal(toDecision('unavailable').via, 'unavailable')
  assert.ok((toDecision('unavailable').reason ?? '').includes('没有审批界面'))
  assert.equal(toDecision('cancelled').via, 'error')
  assert.equal(toDecision('timeout', 1000).via, 'timeout')
  // 宿主将来新增未知取值 → 按"没问到"处理（fail-closed，不会误报成用户放行）
  assert.equal(toDecision('something-new' as never).approved, false)
  assert.equal(toDecision('something-new' as never).via, 'unavailable')
})

test('审批文案渲染：正文全文附在最后，字段齐全', () => {
  const request: ApprovalRequest = {
    action: 'greeting.send',
    actor: 'model',
    danger: 'high',
    title: 'greeting.send',
    lines: ['发起者：模型（对话里发起）', '平台：51job'],
    content: '你好，我想应聘。',
  }
  const text = renderApproval(request)
  assert.ok(text.startsWith('【需要你确认】'))
  assert.ok(text.includes('· 发起者：模型（对话里发起）'))
  assert.ok(text.endsWith('你好，我想应聘。'))
})

// ── P2/D-17a：发送窗口与随机休息日 ────────────────────────────────────

test('parseSendWindow / inSendWindow：解析与判定（含跨午夜）', () => {
  assert.deepEqual(parseSendWindow('09:00-16:00'), { startMin: 540, endMin: 960 })
  assert.deepEqual(parseSendWindow('22:00-06:00'), { startMin: 1320, endMin: 360 })
  assert.deepEqual(parseSendWindow('9:00-16:00'), { startMin: 540, endMin: 960 }, '1–2 位小时都认')
  for (const bad of ['24:00-25:00', '09:60-10:00', '0900-1000', '09:00~16:00', '', '  ']) {
    assert.equal(parseSendWindow(bad), null, `${bad} 应判非法`)
  }

  const day = parseSendWindow('09:00-16:00')!
  assert.equal(inSendWindow(day, 539), false)
  assert.equal(inSendWindow(day, 540), true)
  assert.equal(inSendWindow(day, 959), true)
  assert.equal(inSendWindow(day, 960), false, '终点不含（与"到 16:00"直觉一致）')

  const night = parseSendWindow('22:00-06:00')!
  assert.equal(inSendWindow(night, 1320), true)
  assert.equal(inSendWindow(night, 1439), true)
  assert.equal(inSendWindow(night, 0), true)
  assert.equal(inSendWindow(night, 359), true)
  assert.equal(inSendWindow(night, 360), false)
  assert.equal(inSendWindow(night, 720), false)
})

test('发送窗口：窗口外的发送被拒，窗口内放行（时钟受控）', async () => {
  await withStore(async (store) => {
    // 与实现同款换算：把固定时钟换成本地分钟，窗口按它构造 → 任何时区的机器上结论一致
    const localMinute = new Date(T).getHours() * 60 + new Date(T).getMinutes()
    const fmt = (min: number): string =>
      `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    const inside = `${fmt(localMinute)}-${fmt(localMinute + 1)}`
    const outside = `${fmt(localMinute + 1)}-${fmt(localMinute + 2)}`

    const send: GuardInput = {
      action: 'greeting.send',
      actor: 'gui',
      danger: 'high',
      target: { platformId: '51job' },
    }

    makeGuard(store) // 先建立"窗口关闭"的基线配置
    writeGuardConfig(store, { sendWindow: outside, dayOffProbability: 0 }, T)
    const denied = runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send)
    assert.equal(denied.ok, false)
    assert.equal(denied.reason, 'window')
    assert.ok(denied.message?.includes('不在发送窗口内'))

    writeGuardConfig(store, { sendWindow: inside }, T)
    const allowed = runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send)
    assert.equal(allowed.ok, true, '窗口内且其余条件满足 → 过')

    // 空串 = 不限：任何时刻放行
    writeGuardConfig(store, { sendWindow: '' }, T)
    assert.equal(runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send).ok, true)

    // 配置坏了要 fail-closed，不能悄悄放行
    writeGuardConfig(store, { sendWindow: '不是窗口' }, T)
    const broken = runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send)
    assert.equal(broken.ok, false)
    assert.equal(broken.reason, 'window')
    assert.ok(broken.message?.includes('无法解析'))

    // 非发送动作不受窗口约束
    writeGuardConfig(store, { sendWindow: outside }, T)
    assert.equal(
      runRuleChain({ store, session: okSession, clock: fixedClock(T) }, { action: 'job.list', actor: 'gui', danger: 'low' }).ok,
      true,
    )
  })
})

test('随机休息日：确定性命中（同一天结论恒定）、概率 0/1 边界、发送动作被拦', async () => {
  await withStore(async (store) => {
    // 纯函数：同一天问多少次都一样；概率边界
    const p = 0.05
    for (const dateKey of ['2026-09-16', '2026-10-01', '2027-01-15']) {
      assert.equal(isDayOff(dateKey, p), isDayOff(dateKey, p), `${dateKey} 同日结论恒定`)
    }
    assert.equal(isDayOff('2026-09-16', 0), false)
    assert.equal(isDayOff('2026-09-16', 1), true)
    // 长期频率落在合理区间（FNV-1a 应当接近均匀）：用真实日期序列做键
    let hits = 0
    const base = new Date('2026-01-01T00:00:00Z').getTime()
    for (let offset = 0; offset < 2000; offset += 1) {
      const day = new Date(base + offset * 86_400_000)
      const dateKey = `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      if (isDayOff(dateKey, p)) hits += 1
    }
    assert.ok(hits > 2000 * 0.005 && hits < 2000 * 0.15, `频率异常：${String(hits)}/2000`)

    const send: GuardInput = {
      action: 'greeting.send',
      actor: 'gui',
      danger: 'high',
      target: { platformId: '51job' },
    }
    makeGuard(store)
    // 概率 1：必命中 → 拒
    writeGuardConfig(store, { dayOffProbability: 1 }, T)
    const denied = runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send)
    assert.equal(denied.ok, false)
    assert.equal(denied.reason, 'day-off')
    assert.ok(denied.message?.includes('休息日'))
    // 概率 0：不休息 → 过
    writeGuardConfig(store, { dayOffProbability: 0 }, T)
    assert.equal(runRuleChain({ store, session: okSession, clock: fixedClock(T) }, send).ok, true)
    // 非发送动作不受休息日约束
    writeGuardConfig(store, { dayOffProbability: 1 }, T)
    assert.equal(
      runRuleChain({ store, session: okSession, clock: fixedClock(T) }, { action: 'job.list', actor: 'gui', danger: 'low' }).ok,
      true,
    )
  })
})
