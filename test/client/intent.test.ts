import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consumePanelIntent, requestPanelIntent, subscribePanelIntent } from '../../src/client/app/intent.js'

/**
 * 对话 → 面板的意图通道（§22.3）。
 *
 * 它没有 React、没有 DOM，却管着"点卡片之后跳到哪个岗位"。两条**时序**最容易写错，
 * 所以在这里钉住：
 *   * 面板可能比卡片**晚挂载** —— 意图必须先存下来，挂载时消费一次；
 *   * **取走即清空** —— 否则每次切回面板都会重复跳转一次。
 */

/** 清空待处理意图：模块级状态跨用例存在，每个用例自己收尾。 */
function drain(): void {
  while (consumePanelIntent() !== null) {
    /* 一直取到空 */
  }
}

test('取走即清空：同一个意图不会被消费两次', () => {
  drain()
  requestPanelIntent(12)
  const first = consumePanelIntent()
  assert.equal(first?.jobId, 12)
  assert.equal(first?.action, 'open', '不传 action 时默认 open')
  assert.equal(consumePanelIntent(), null)
})

test('显式 action 会被保留（draft = 打开详情并停在话术那一块）', () => {
  drain()
  requestPanelIntent(7, 'draft')
  assert.equal(consumePanelIntent()?.action, 'draft')
})

test('面板晚挂载也不丢意图：没有订阅者时先存下来，挂载后再取', () => {
  drain()
  requestPanelIntent(3) // 此刻面板还没挂载（没有任何订阅者）
  const seen: number[] = []
  const off = subscribePanelIntent((intent) => seen.push(intent.jobId))
  assert.deepEqual(seen, [], '订阅之前发生的事不该补发')
  assert.equal(consumePanelIntent()?.jobId, 3, '挂载时应当还取得到那次意图')
  off()
})

test('已在场的订阅者立刻收到通知；单个订阅者抛错不影响其余', () => {
  drain()
  const seen: number[] = []
  const off1 = subscribePanelIntent(() => {
    throw new Error('这个订阅者坏了')
  })
  const off2 = subscribePanelIntent((intent) => seen.push(intent.jobId))
  requestPanelIntent(9)
  assert.deepEqual(seen, [9])
  off1()
  off2()
  drain()
})

test('取消订阅之后不再收到通知', () => {
  drain()
  const seen: number[] = []
  const off = subscribePanelIntent((intent) => seen.push(intent.jobId))
  off()
  requestPanelIntent(5)
  assert.deepEqual(seen, [])
  drain()
})

test('意图带时间戳（at），供调用方判断新鲜度', () => {
  drain()
  const before = Date.now()
  requestPanelIntent(1)
  const intent = consumePanelIntent()
  assert.ok(intent !== null && intent.at >= before && intent.at <= Date.now())
})
