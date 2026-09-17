import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMutex } from '../../src/host/platform/mutex.js'

const tick = (ms = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

test('run 串行执行，不会交叉', async () => {
  const mutex = createMutex()
  const order: string[] = []
  const task = (name: string) => async (): Promise<void> => {
    order.push(`${name}:start`)
    await tick(10)
    order.push(`${name}:end`)
  }
  await Promise.all([mutex.run(task('a')), mutex.run(task('b'))])
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end'])
})

test('tryRun 忙时立刻放弃（定时抓取用「跳过」而不是「排队」）', async () => {
  const mutex = createMutex()
  const first = mutex.run(async () => {
    await tick(20)
    return 'first'
  })
  const second = await mutex.tryRun(async () => 'second')
  assert.equal(second, null)
  assert.equal(await first, 'first')
  // 前一个结束后又能跑
  assert.equal(await mutex.tryRun(async () => 'third'), 'third')
})

test('前一个任务抛错不会卡死后续任务', async () => {
  const mutex = createMutex()
  await assert.rejects(async () => await mutex.run(async () => { throw new Error('boom') }))
  assert.equal(await mutex.tryRun(async () => 'ok'), 'ok')
  assert.equal(mutex.isBusy(), false)
})
