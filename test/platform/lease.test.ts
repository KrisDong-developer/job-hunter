import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLease, type LeaseOptions } from '../../src/host/platform/lease.js'

/** 内存文件系统，让租约测试不碰真实磁盘。 */
function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  return {
    files,
    api: {
      exists: (path: string) => files.has(path),
      read: (path: string) => {
        const value = files.get(path)
        if (value === undefined) throw new Error(`no such file: ${path}`)
        return value
      },
      write: (path: string, content: string) => {
        files.set(path, content)
      },
      rename: (from: string, to: string) => {
        const value = files.get(from)
        if (value === undefined) throw new Error(`no such file: ${from}`)
        files.delete(from)
        files.set(to, value)
      },
      remove: (path: string) => {
        files.delete(path)
      },
      mkdir: () => undefined,
    },
  }
}

const PATH = 'D:\\data\\lease.json'

function makeLease(overrides: Partial<LeaseOptions> & { fs: LeaseOptions['fs'] }, now: () => string, pid = 100) {
  return createLease({
    path: PATH,
    pid,
    label: 'dsh-job-hunter',
    staleMs: 90_000,
    clock: now,
    ...overrides,
  })
}

test('第一个实例拿到租约并落盘', () => {
  const fs = memoryFs()
  const lease = makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z')
  const verdict = lease.acquire()

  assert.equal(verdict.held, true)
  assert.equal(lease.held(), true)
  assert.equal(lease.status().held, true)
  assert.ok(fs.files.has(PATH))
  const record = JSON.parse(fs.files.get(PATH) ?? '{}') as { pid: number }
  assert.equal(record.pid, 100)
})

test('第二个实例拿不到租约，并知道对方是谁', () => {
  const fs = memoryFs()
  makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z', 100).acquire()

  const second = makeLease({ fs: fs.api }, () => '2026-09-16T01:00:30.000Z', 200)
  const verdict = second.acquire()

  assert.equal(verdict.held, false)
  assert.equal(verdict.stale, false)
  assert.equal(verdict.other?.pid, 100)
  assert.equal(second.held(), false)
})

test('心跳过期的租约会直接被接管（宿主被强杀的幽灵锁）', () => {
  const fs = memoryFs()
  makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z', 100).acquire()

  // 5 分钟后才有第二个实例启动 —— 早就超过 90 秒
  const second = makeLease({ fs: fs.api }, () => '2026-09-16T01:05:00.000Z', 200)
  const verdict = second.acquire()

  assert.equal(verdict.held, true)
  assert.equal(verdict.stale, true)
  assert.equal(verdict.other?.pid, 100)
  assert.equal(JSON.parse(fs.files.get(PATH) ?? '{}').pid, 200)
})

test('心跳会刷新时间戳，刷新之后别人抢不走', () => {
  const fs = memoryFs()
  let now = '2026-09-16T01:00:00.000Z'
  const lease = makeLease({ fs: fs.api }, () => now)
  lease.acquire()

  now = '2026-09-16T01:01:00.000Z'
  lease.heartbeat()

  const other = makeLease({ fs: fs.api }, () => '2026-09-16T01:01:30.000Z', 200)
  assert.equal(other.acquire().held, false, '对方心跳只差 30 秒，仍然有效')

  assert.equal(JSON.parse(fs.files.get(PATH) ?? '{}').heartbeatAt, '2026-09-16T01:01:00.000Z')
})

test('释放只删自己的租约，不会把接管者的删掉', () => {
  const fs = memoryFs()
  const first = makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z', 100)
  first.acquire()

  // 接管者出现
  const second = makeLease({ fs: fs.api }, () => '2026-09-16T01:05:00.000Z', 200)
  second.acquire()

  // 老实例这时才收尾
  first.release()
  assert.ok(fs.files.has(PATH), '不能删掉接管者的租约')
  assert.equal(JSON.parse(fs.files.get(PATH) ?? '{}').pid, 200)
})

test('半截 JSON（写的时候被强杀）当作没有租约，可接管', () => {
  const fs = memoryFs({ [PATH]: '{"pid": 100, "started' })
  const lease = makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z', 200)
  assert.equal(lease.acquire().held, true)
})

test('同一个 pid 重复 acquire 视为自己人（热重载场景）', () => {
  const fs = memoryFs()
  makeLease({ fs: fs.api }, () => '2026-09-16T01:00:00.000Z', 100).acquire()
  const again = makeLease({ fs: fs.api }, () => '2026-09-16T01:00:10.000Z', 100)
  assert.equal(again.acquire().held, true)
})
