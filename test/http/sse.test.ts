import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEventBus, formatSseFrame, SSE_BUFFER_SIZE } from '../../src/host/http/sse.js'

test('发布 → 订阅者收到；退订后不再收到', () => {
  const bus = createEventBus()
  const seen: string[] = []
  const unsubscribe = bus.subscribe((event) => seen.push(event.type))

  bus.publish('crawl.started', { platformId: '51job' })
  bus.publish('crawl.finished', { state: 'ok' })
  unsubscribe()
  bus.publish('job.updated', { id: 1 })

  assert.deepEqual(seen, ['crawl.started', 'crawl.finished'])
})

test('一个订阅者抛错不影响其它订阅者，也不影响发布方', () => {
  const bus = createEventBus()
  const seen: string[] = []
  bus.subscribe(() => {
    throw new Error('boom')
  })
  bus.subscribe((event) => seen.push(event.type))
  assert.doesNotThrow(() => bus.publish('x', {}))
  assert.deepEqual(seen, ['x'])
})

test('新连接（无 Last-Event-ID）不补发、不 resync', () => {
  const bus = createEventBus()
  bus.publish('a', {})
  assert.deepEqual(bus.replay(null), { events: [], resync: false })
})

test('缓冲命中就补发缺的那几条', () => {
  const bus = createEventBus()
  const first = bus.publish('a', {})
  bus.publish('b', {})
  bus.publish('c', {})

  const replay = bus.replay(first.id)
  assert.equal(replay.resync, false)
  assert.deepEqual(replay.events.map((event) => event.type), ['b', 'c'])
})

test('已经追上进度时不补发', () => {
  const bus = createEventBus()
  const last = bus.publish('a', {})
  assert.deepEqual(bus.replay(last.id), { events: [], resync: false })
})

test('缓冲已经接不上 → resync（ADR-24：宁可整体重拉，也不错乱）', () => {
  const bus = createEventBus({ bufferSize: 3 })
  const first = bus.publish('a', {})
  for (let index = 0; index < 10; index += 1) bus.publish('x', { index })

  const replay = bus.replay(first.id)
  assert.equal(replay.resync, true)
  assert.deepEqual(replay.events, [])
  assert.ok(bus.size() <= 3, '缓冲必须有界')
})

test('id 单调递增，lastEventId 永远等于最新一条', () => {
  const bus = createEventBus()
  const a = bus.publish('a', {})
  const b = bus.publish('b', {})
  assert.equal(b.id, a.id + 1)
  assert.equal(bus.lastEventId(), b.id)
})

test('SSE 帧格式：id / event / data，且 data 是单行 JSON', () => {
  const bus = createEventBus()
  const event = bus.publish('crawl.finished', { state: 'ok', note: '多行\n内容' })
  const frame = formatSseFrame(event)

  assert.ok(frame.startsWith(`id: ${String(event.id)}\n`))
  assert.ok(frame.includes('event: message\n'))
  assert.ok(frame.endsWith('\n\n'))
  // 载荷里的换行必须被 JSON 转义掉，否则会被 SSE 解析成多个 data 行
  const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
  assert.ok(dataLine !== undefined)
  assert.equal(dataLine.includes('\n'), false)
  assert.deepEqual(JSON.parse(dataLine.slice('data: '.length)), {
    type: 'crawl.finished',
    data: { state: 'ok', note: '多行\n内容' },
    at: event.at,
  })
})

test('默认缓冲就是有界的', () => {
  const bus = createEventBus()
  for (let index = 0; index < SSE_BUFFER_SIZE + 50; index += 1) bus.publish('x', { index })
  assert.equal(bus.size(), SSE_BUFFER_SIZE)
})
