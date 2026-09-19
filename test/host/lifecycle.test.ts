/**
 * `close()` 之后**每一个**访问器都必须说"没数据"。
 *
 * ## 为什么单独有这么一个文件
 *
 * `close()` 的清槽清单曾经写在文件末尾的手写赋值里，于是漂移过一次：
 * `pipeline` / `messages` / `interviews` / `analytics` / `campus` / `overseas`
 * 六个槽没被清 —— 而症状是**静默的**：那几个访问器在关闭之后仍返回一个绑在
 * **已关闭 sqlite** 上的旧服务（不是"数据层未就绪"，而是拿旧对象去用）。
 *
 * 所以这里逐个访问器断言，而不是抽查一两个：**加一个槽忘了清，这个文件必须变红**。
 * 加了新的服务访问器就补进 `SERVICE_ACCESSORS`。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, tempDataDir } from '../support/store.js'

/** 数据层就绪之后才存在、且**未就绪时抛错**的那些访问器。 */
const SERVICE_ACCESSORS = [
  'plans',
  'intel',
  'guard',
  'ai',
  'outreach',
  'settings',
  'resumes',
  'pipeline',
  'messages',
  'interviews',
  'analytics',
  'offers',
  'campus',
  'overseas',
] as const

/** 调用一个无参访问器（联合类型不能直接调用，先收敛成无参函数）。 */
function read(runtime: HostRuntime, name: (typeof SERVICE_ACCESSORS)[number]): unknown {
  return (runtime[name] as () => unknown)()
}

function isDataUnavailable(error: unknown): boolean {
  assert.ok(error instanceof DomainError, `期望 DomainError，实际是 ${String(error)}`)
  assert.equal(error.code, 'DATA_UNAVAILABLE')
  return true
}

test('close() 之后：每个服务访问器都抛 DATA_UNAVAILABLE（全部，不是抽查）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    await runtime.ready()

    // 先证明"关之前是好的" —— 否则下面的断言可能因为别的原因通过（比如压根没就绪）
    assert.equal(runtime.isReady(), true)
    for (const name of SERVICE_ACCESSORS) {
      assert.doesNotThrow(() => read(runtime, name), `${name}() 在就绪之后应当可用`)
    }

    runtime.close()

    assert.equal(runtime.isReady(), false)
    for (const name of SERVICE_ACCESSORS) {
      assert.throws(() => read(runtime, name), isDataUnavailable, `${name}() 在 close() 之后必须拒答`)
    }

    // 三处「可能还没有」的访问器按契约返回 undefined（不是抛错）
    assert.equal(runtime.store(), undefined)
    assert.equal(runtime.jobs(), undefined)
    assert.equal(runtime.companies(), undefined)

    // 视图类：如实说"没数据"，而不是把旧数据端出来
    assert.equal(runtime.health().dataReady, false)
    assert.equal(runtime.health().jobCount, 0)
    assert.deepEqual(runtime.crawlStatus().recentRuns, [])
    assert.equal(runtime.schedulerStatus().readOnly, true)
    assert.equal(runtime.crawlStatus().busy, false)
    assert.equal(runtime.deadlines().length, 0)
    assert.equal(runtime.followUps().length, 0)
    assert.equal(runtime.unreadCount(), 0)
    // 平台矩阵此时不该给出任何"能跑/不能跑"的结论（门还没法判）
    for (const item of runtime.platforms()) assert.equal(item.governance.blocked, null)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('close() 之后：手动抓取与登录引导都被拒（租约已还、库已关）', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    await runtime.ready()
    runtime.close()

    await assert.rejects(
      () => runtime.crawl({ platformId: '51job', criteria: { keyword: 'Java' } }),
      isDataUnavailable,
    )
    // 登录引导走的是租约那一条：close() 已经还了锁，所以它必须以 CONFLICT 收场，
    // 而不是真的去开一个浏览器
    assert.throws(
      () => runtime.startLogin('51job'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'CONFLICT')
        return true
      },
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
