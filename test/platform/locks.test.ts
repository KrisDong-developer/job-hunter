import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlatformLocks } from '../../src/host/platform/locks.js'

/**
 * 按平台互斥（原全局 mutex 的收窄版）。
 *
 * 这三条性质是"跨平台并发 / 同平台串行"的全部地基，必须离线钉住：
 *   1. 同平台：第二次 tryRun 立刻 null（**不排队** —— 排队=连跑两遍=触发风控）；
 *   2. 跨平台：同时开工、真的重叠（这是这次改动的目的本身）；
 *   3. 失败也要释放锁，否则一次异常就让这个平台永久"忙"。
 */

/** 手动闸门：测试里精确控制任务何时算"完成"。 */
function gated(): { run: () => Promise<void>; open: () => void } {
  let release: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    release = resolve
  })
  return { run: () => done, open: release }
}

test('同平台：第一个在跑时，第二个立刻拿到 null（不排队）', async () => {
  const locks = createPlatformLocks()
  const gate = gated()
  const first = locks.tryRun('51job', gate.run)
  // 同一 tick 内的第二次（最难被微任务时序掩盖的那种）也要被拒
  const second = await locks.tryRun('51job', async () => 'second')
  assert.equal(second, null, '同平台忙时 tryRun 必须立刻返回 null')
  assert.equal(locks.running('51job'), true)
  assert.equal(locks.busy(), true)
  gate.open()
  assert.equal(await first, undefined)
  assert.equal(locks.running('51job'), false, '结束后锁必须释放')
  assert.equal(locks.busy(), false)
})

test('跨平台：不同平台真的同时跑（重叠可观测）', async () => {
  const locks = createPlatformLocks()
  let active = 0
  let maxActive = 0
  const task = async (): Promise<string> => {
    active += 1
    maxActive = Math.max(maxActive, active)
    // 让出一个微任务，让另一个平台有机会进来 —— 串行实现会看到 maxActive=1
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    return 'ok'
  }
  const results = await Promise.all([
    locks.tryRun('51job', () => task()),
    locks.tryRun('zhaopin', () => task()),
    locks.tryRun('liepin', () => task()),
  ])
  assert.deepEqual(results, ['ok', 'ok', 'ok'])
  assert.equal(maxActive, 3, `三个平台应当同时在场（实测峰值 ${String(maxActive)}）—— 这正是本次改动要的`)
})

test('任务失败也要释放锁（否则一次异常让平台永久"忙"）', async () => {
  const locks = createPlatformLocks()
  await assert.rejects(
    locks.tryRun('51job', async () => {
      throw new Error('boom')
    }),
  )
  assert.equal(locks.busy(), false)
  const again = await locks.tryRun('51job', async () => 'recovered')
  assert.equal(again, 'recovered', '失败之后同平台要能立刻再跑')
})

test('activeCount：并发中的平台数如实可读（诊断口径）', async () => {
  const locks = createPlatformLocks()
  const gate = gated()
  const first = locks.tryRun('51job', gate.run)
  const second = locks.tryRun('zhaopin', async () => 'z')
  assert.equal(locks.activeCount(), 2)
  gate.open()
  await first
  await second
  assert.equal(locks.activeCount(), 0)
})
