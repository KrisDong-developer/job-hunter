import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_CONCURRENT_PLATFORMS } from '../../src/shared/config/crawl.js'
import { runInLanes } from '../../src/host/scheduler/lanes.js'

/**
 * 泳道发令器 —— "跨平台并发"的编排逻辑。
 *
 * 并发代码最容易悄悄退化的三件事在这里逐条钉住：
 *   * 上限真的被尊重（观测峰值，不是数 promise）；
 *   * 结果顺序 = 启动顺序（完成序是随机的，不能让它漏出去）；
 *   * 每个平台恰好一次、失败不连坐、预算裁剪裁尾部。
 */

function tracker() {
  let active = 0
  let peak = 0
  const started: string[] = []
  return {
    /** 造一个可控制时长的任务。 */
    task(platformId: string, ms: number, fail = false): Promise<string> {
      started.push(platformId)
      active += 1
      peak = Math.max(peak, active)
      return new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          active -= 1
          if (fail) reject(new Error(`${platformId}-boom`))
          else resolve(platformId)
        }, ms)
      })
    },
    peak: (): number => peak,
    started: (): string[] => started,
  }
}

test('并发峰值 ≤ 泳道数；每个平台恰好启动一次', async () => {
  const t = tracker()
  const platforms = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const { outcomes, cut } = await runInLanes({
    platforms,
    launch: (id) => t.task(id, 5),
    budgetExhausted: () => false,
  })
  assert.equal(cut.length, 0)
  assert.equal(outcomes.length, platforms.length)
  assert.deepEqual(t.started(), platforms, '启动序 = 传入序（freshness 序）')
  assert.ok(t.peak() <= MAX_CONCURRENT_PLATFORMS, `峰值 ${String(t.peak())} 不得超过上限`)
  assert.ok(t.peak() > 1, `确实并发了（实测峰值 ${String(t.peak())}）`)
})

test('结果顺序 = 启动顺序（即使完成顺序相反）', async () => {
  // 越靠后的平台越快完成 —— 完成序与启动序完全相反
  const platforms = ['slow', 'mid', 'fast']
  const durations: Record<string, number> = { slow: 30, mid: 15, fast: 1 }
  const { outcomes } = await runInLanes({
    platforms,
    launch: async (id) => {
      await new Promise((resolve) => setTimeout(resolve, durations[id]))
      return id
    },
    budgetExhausted: () => false,
  })
  assert.deepEqual(
    outcomes.map((outcome) => outcome.platformId),
    platforms,
    '对外暴露的顺序必须稳定为启动序 —— 完成序是随机的，不能漏出去',
  )
  assert.deepEqual(
    outcomes.map((outcome) => outcome.summary),
    platforms,
  )
})

test('一个平台失败不阻断其它平台（不连坐，SR-18）', async () => {
  const { outcomes } = await runInLanes({
    platforms: ['ok1', 'boom', 'ok2'],
    launch: async (id) => {
      if (id === 'boom') throw new Error('boom')
      return id
    },
    budgetExhausted: () => false,
  })
  assert.equal(outcomes.length, 3)
  const failed = outcomes.find((outcome) => outcome.platformId === 'boom')
  assert.ok(failed?.error instanceof Error)
  assert.equal(failed?.summary, null)
  assert.equal(outcomes.every((outcome) => outcome.platformId !== 'boom' || outcome.error !== null), true)
  assert.deepEqual(
    outcomes.filter((outcome) => outcome.error === null).map((outcome) => outcome.summary),
    ['ok1', 'ok2'],
    '其它平台照常完成',
  )
})

test('预算耗尽：没领取的不启动、如实进 cut；已在跑的跑到自己的终点', async () => {
  const platforms = ['a', 'b', 'c', 'd', 'e']
  // 预算判定在**领取时**做：前两次判定（a、b 领取）放行，之后全部"耗尽"
  let checks = 0
  const { outcomes, cut } = await runInLanes({
    platforms,
    lanes: 2,
    launch: async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return id
    },
    budgetExhausted: () => {
      checks += 1
      return checks > 2
    },
  })
  assert.deepEqual(outcomes.map((outcome) => outcome.platformId), ['a', 'b'], '只有领取过的两个真正跑了')
  assert.deepEqual(cut, ['c', 'd', 'e'], '没领取的如实报 cut（裁的是尾部）')
})

test('平台数少于泳道数：照常工作，不多开 worker', async () => {
  const t = tracker()
  const { outcomes } = await runInLanes({
    platforms: ['only'],
    launch: (id) => t.task(id, 1),
    budgetExhausted: () => false,
  })
  assert.deepEqual(outcomes.map((outcome) => outcome.summary), ['only'])
  assert.equal(t.peak(), 1)
})

test('onSettled：每个平台落地即回调（成功与失败都调）', async () => {
  const settled: string[] = []
  await runInLanes({
    platforms: ['x', 'y'],
    launch: async (id) => {
      if (id === 'y') throw new Error('y-boom')
      return id
    },
    budgetExhausted: () => false,
    onSettled: (outcome) => settled.push(`${outcome.platformId}:${outcome.error === null ? 'ok' : 'err'}`),
  })
  // 完成序在并发下不保证，排序后断言集合
  assert.deepEqual([...settled].sort(), ['x:ok', 'y:err'])
})
