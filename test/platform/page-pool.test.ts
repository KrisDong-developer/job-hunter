import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPagePool, type PoolPage } from '../../src/host/platform/browser.js'

/**
 * 页面池 —— 跨平台并发的地基。
 *
 * 旧实现（"复用第一个没关的页" / "多于一页就关掉多余的那页"）在并发下是两个 bug：
 * 并发 acquire 拿到同一页、并发 release 关掉别人的页。这里把池的行为逐条钉住。
 */

let seq = 0

function fakePage(options: { closed?: boolean } = {}): PoolPage & { closedFlag: boolean; closeCount: number } {
  const page = {
    id: (seq += 1),
    closedFlag: options.closed === true,
    closeCount: 0,
    isClosed(): boolean {
      return page.closedFlag
    },
    async close(): Promise<void> {
      page.closedFlag = true
      page.closeCount += 1
    },
  }
  return page
}

function poolWith(newPages: PoolPage[]) {
  let next = 0
  let created = 0
  const p = createPagePool({
    newPage: async () => {
      const page = newPages[next]
      next += 1
      created += 1
      if (page === undefined) throw new Error('测试没准备足够的新页')
      return page
    },
  })
  return { pool: p, createdCount: () => created }
}

test('并发 acquire 各拿各的页（不再共用同一页）', async () => {
  const { pool } = poolWith([fakePage(), fakePage()])
  const [a, b] = await Promise.all([pool.acquire(), pool.acquire()])
  assert.notEqual(a, b, '两个并发调用必须拿到不同的页 —— 旧实现在这里返回同一个')
  assert.equal(pool.inFlight(), 2)
})

test('release 只归还自己的页：别人借出的页绝不会被关', async () => {
  const pageA = fakePage()
  const pageB = fakePage()
  const { pool } = poolWith([pageA, pageB])
  const a = await pool.acquire()
  const b = await pool.acquire()
  assert.equal(a, pageA)
  assert.equal(b, pageB)
  // a 先还：空闲表空 → 保留（与旧实现"只剩一页时留着"一致）
  assert.equal(await pool.release(a), 'kept')
  // b 再还：空闲表已满 → 就地关闭（而不是关掉 a —— 那正是旧实现的并发 bug）
  assert.equal(await pool.release(b), 'closed')
  assert.equal(pageB.closeCount, 1)
  assert.equal(pageA.closeCount, 0, 'a 在空闲表里躺着，不能被 b 的 release 关掉')
  assert.equal(pool.inFlight(), 0)
})

test('空闲页被复用：串行场景仍然一页反复用，不多开 tab', async () => {
  const { pool, createdCount } = poolWith([fakePage(), fakePage()])
  const first = await pool.acquire()
  await pool.release(first)
  const second = await pool.acquire()
  assert.equal(second, first, '串行的取还应该复用同一页')
  assert.equal(createdCount(), 1, '只开过第一页，之后的取用全部复用')
})

test('seed 的首页（about:blank）算空闲页：第一次 acquire 不开新 tab', async () => {
  const home = fakePage()
  let created = 0
  const pool = createPagePool({
    newPage: async () => {
      created += 1
      return fakePage()
    },
    seed: [home],
  })
  const page = await pool.acquire()
  assert.equal(page, home)
  assert.equal(created, 0)
})

test('空闲表里的死页（用户手关）被跳过，不炸也不复用', async () => {
  const dead = fakePage({ closed: true })
  const fresh = fakePage()
  const { pool } = poolWith([fresh])
  const pool2 = createPagePool({
    newPage: async () => {
      throw new Error('不该走到开新页 —— fresh 还在 seed 里')
    },
    seed: [dead, fresh],
  })
  void pool
  const page = await pool2.acquire()
  assert.equal(page, fresh, '死页被丢弃，拿到下一个活页')
})

test('还回一个已经死了的页：如实报 closed，不重复 close', async () => {
  const page = fakePage()
  const { pool } = poolWith([page])
  const taken = await pool.acquire()
  assert.equal(taken, page)
  page.closedFlag = true // 用着用着被用户手关了
  assert.equal(await pool.release(taken), 'closed')
  assert.equal(page.closeCount, 0, '已死的页不必再调 close')
})

test('foreign：不是本池借出的页，release 不动它', async () => {
  const stranger = fakePage()
  const { pool } = poolWith([fakePage()])
  assert.equal(await pool.release(stranger), 'foreign')
  assert.equal(stranger.closeCount, 0)
  assert.equal(pool.inFlight(), 0)
})
