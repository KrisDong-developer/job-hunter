import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createIdleCloser } from '../../src/host/platform/idle-close.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'

/**
 * 空闲自关（NFR-7 / C12）。
 *
 * 用 `createManualTimer` 手动推进时间 —— 不真等 10 分钟，也不会 flaky。
 * 这里钉住的四条都是**看代码看不出来、只有跑起来才知道**的时序：
 *   ① 重排要先撤旧的（否则早的那个先到点，把新一轮关掉）；
 *   ② 到点被拦住要**重新计时**，不是放弃；
 *   ③ 时长设成 0 要撤销已排的那一次；
 *   ④ 关窗只发生一次，不会重复触发。
 */
function harness(options: { idleMs?: number; keepAlive?: () => boolean } = {}) {
  const timers = createManualTimer()
  const logs: string[] = []
  let closes = 0
  const closer = createIdleCloser({
    idleMs: options.idleMs ?? 10 * 60_000,
    timers,
    close: () => {
      closes += 1
    },
    ...(options.keepAlive === undefined ? {} : { shouldKeepAlive: options.keepAlive }),
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
  })
  return { closer, timers, logs, closes: () => closes }
}

test('空闲到点就关闭浏览器', () => {
  const h = harness({ idleMs: 60_000 })
  h.closer.arm()
  assert.equal(h.closes(), 0, '刚排上不该已经关')
  h.timers.advance(59_999)
  assert.equal(h.closes(), 0, '差 1ms 也不该关')
  h.timers.advance(1)
  assert.equal(h.closes(), 1, '到点要关')
  assert.equal(h.closer.scheduled(), false, '关完之后不该还排着')
})

test('重排会先撤销上一次 —— 否则早的那个定时器会把新一轮关掉', () => {
  const h = harness({ idleMs: 60_000 })
  h.closer.arm()
  h.timers.advance(30_000)
  h.closer.arm() // 又用了一次浏览器：重新计时
  assert.equal(h.timers.pending(), 1, '同一时刻只该有一个待触发的定时器')
  h.timers.advance(30_000) // 距第二次 arm 只过了 30s
  assert.equal(h.closes(), 0, '旧的 60s 定时器不该把新一轮关掉')
  h.timers.advance(30_000)
  assert.equal(h.closes(), 1, '距第二次 arm 满 60s 才关')
})

test('到点时有任务在用：不关，但**重新计时**（不是放弃）', () => {
  let busy = true
  const h = harness({ idleMs: 60_000, keepAlive: () => !busy })
  h.closer.arm()
  h.timers.advance(60_000)
  assert.equal(h.closes(), 0, '忙着就不该关')
  assert.equal(h.closer.scheduled(), true, '要重新排上，不能就此放弃自关')
  assert.ok(h.logs.some((m) => m.includes('改期再关')), '要留下可查的日志')
  // 忙完了，下一轮到点就该关
  busy = false
  h.timers.advance(60_000)
  assert.equal(h.closes(), 1)
})

test('守卫不传 / 返回 true：到点照常关闭（默认关门，不是默认留着）', () => {
  const none = harness({ idleMs: 1000 })
  none.closer.arm()
  none.timers.advance(1000)
  assert.equal(none.closes(), 1, '没有守卫时应该关')

  const yes = harness({ idleMs: 1000, keepAlive: () => true })
  yes.closer.arm()
  yes.timers.advance(1000)
  assert.equal(yes.closes(), 1, '守卫返回 true 时应该关')
})

test('时长设成 0：撤销已排的那一次，之后不再关', () => {
  const h = harness({ idleMs: 60_000 })
  h.closer.arm()
  assert.equal(h.closer.scheduled(), true)
  h.closer.setIdleMs(0)
  assert.equal(h.closer.scheduled(), false, '设成 0 要把已排的撤销')
  h.timers.advance(10 * 60_000)
  assert.equal(h.closes(), 0, '设成 0 之后不该再关')
  // 再 arm 也不该排上
  h.closer.arm()
  h.timers.advance(10 * 60_000)
  assert.equal(h.closes(), 0)
})

test('运行期改小时长：立刻按新值重排', () => {
  const h = harness({ idleMs: 10 * 60_000 })
  h.closer.arm()
  assert.equal(h.closer.idleMs(), 600_000)
  h.closer.setIdleMs(60_000) // 设置里改成 1 分钟
  assert.equal(h.closer.idleMs(), 60_000)
  h.timers.advance(60_000)
  assert.equal(h.closes(), 1, '应按新值到点，而不是等原来的 10 分钟')
})

test('取消之后不再触发（开始干活时用）', () => {
  const h = harness({ idleMs: 60_000 })
  h.closer.arm()
  h.closer.cancel()
  assert.equal(h.closer.scheduled(), false)
  h.timers.advance(60_000)
  assert.equal(h.closes(), 0)
  assert.equal(h.timers.pending(), 0, '取消要真的把定时器撤掉，不留幽灵定时器')
})
