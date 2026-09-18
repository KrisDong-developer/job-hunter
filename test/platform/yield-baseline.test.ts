/**
 * 量级基线告警（批次 5）。
 *
 * 这一层要回答的问题，逐字段健康回答不了：
 * **字段都解析得出、`state='ok'`、`quarantined=0`，但条目数掉了一个数量级。**
 * 那种轮次在数据里和正常轮次长得一模一样，所以必须跟这个平台自己的历史比。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyYieldBaseline,
  assessYield,
  baselineFrom,
  medianOf,
  readYieldSnapshot,
  YIELD_MIN_BASELINE,
} from '../../src/host/platform/yield-baseline.js'
import type { CrawlState } from '../../src/shared/enums.js'
import { cleanup, openTestStore } from '../support/store.js'

type Store = ReturnType<typeof openTestStore>

test('中位数：空数组给 null（不假装是 0），偶数个取中间两个的平均，且不改动入参', () => {
  assert.equal(medianOf([]), null)
  assert.equal(medianOf([20]), 20)
  assert.equal(medianOf([2, 20, 20]), 20)
  assert.equal(medianOf([10, 20]), 15)
  const input = [20, 2, 21, 20]
  assert.equal(medianOf(input), 20)
  assert.deepEqual(input, [20, 2, 21, 20], '不能就地把调用方的数组排了')
})

test('基线：样本不足时给 null，而不是猜一个 0', () => {
  assert.equal(baselineFrom([]).baseline, null)
  assert.deepEqual(baselineFrom([20, 20, 20, 20]), { baseline: null, samples: 4 })
  assert.deepEqual(baselineFrom([20, 21, 19, 20, 20]), { baseline: 20, samples: 5 })
})

test('判定：样本不足 / 基线本身太小 → 不下结论', () => {
  assert.equal(assessYield({ baseline: null, samples: 3 }, 1).level, 'insufficient')
  assert.equal(
    assessYield({ baseline: YIELD_MIN_BASELINE - 1, samples: 10 }, 0).level,
    'insufficient',
    '基线本身就很小的时候，"2→0"与"20→2"在比例上没有区别 —— 都是噪音',
  )
})

test('判定：低于常态的三成才算骤降，边界（正好三成）不告警', () => {
  const base = { baseline: 20, samples: 10 }
  assert.equal(assessYield(base, 20).level, 'ok')
  assert.equal(assessYield(base, 7).level, 'ok')
  assert.equal(assessYield(base, 6).level, 'ok', '正好 30% 不算 —— 阈值是"低于"')
  assert.equal(assessYield(base, 5).level, 'dropped')
  assert.equal(assessYield(base, 0).level, 'dropped', '0 条也算掉量：它带着"平时 20 条"这个上下文')
  assert.ok(
    (assessYield(base, 2).reason ?? '').includes('20'),
    '原因要带上常态值，否则用户不知道自己偏低到什么程度',
  )
})

/** 造若干轮历史（`at` 按分钟递增，因此后面的更新）。 */
function seedRuns(store: Store, platformId: string, founds: number[], state: CrawlState = 'ok'): void {
  founds.forEach((found, index) => {
    const at = new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString()
    const id = store.crawlRun.start({ platformId }, at)
    store.crawlRun.finish(id, { state, found, inserted: state === 'ok' ? found : 0 }, at)
  })
}

function openTodosOf(store: Store): string[] {
  return store.todo.listOpen().map((todo) => todo.kind)
}

test('样本不足：不产生任何待办（样本少就别吓唬用户）', () => {
  const store = openTestStore()
  try {
    seedRuns(store, '51job', [20, 20, 20])
    const snapshot = applyYieldBaseline(store, '51job', 1, '2026-09-02T00:00:00.000Z')
    assert.equal(snapshot.level, 'insufficient')
    assert.deepEqual(openTodosOf(store), [], '样本不足时不该产生告警')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('量级骤降 → warn 待办；回到常态 → 待办自动关闭', () => {
  const store = openTestStore()
  try {
    seedRuns(store, '51job', [20, 20, 21, 20, 19])
    const dropped = applyYieldBaseline(store, '51job', 2, '2026-09-02T00:00:00.000Z')
    assert.equal(dropped.level, 'dropped')
    assert.equal(dropped.baseline, 20, '中位数：一轮 21、一轮 19 不该把它带偏')

    const todo = store.todo.listOpen().find((item) => item.kind === 'yield-drop')
    assert.ok(todo !== undefined, '骤降必须主动产生待办（否则用户只看到"今天没岗位"）')
    assert.equal(todo.level, 'warn')
    assert.ok(todo.title.includes('51job'), '标题要点名是哪个平台')

    // 恢复：回到常态就该关掉 —— 挂着不清的告警会被用户学会无视，比没有更糟
    const recovered = applyYieldBaseline(store, '51job', 20, '2026-09-02T00:10:00.000Z')
    assert.equal(recovered.level, 'ok')
    assert.deepEqual(openTodosOf(store).includes('yield-drop'), false, '恢复即关闭')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('基线只由 ok 的轮次构成（partial/failed 的条数不代表平台给多少）', () => {
  const store = openTestStore()
  try {
    seedRuns(store, '51job', [20, 20, 20, 20, 20])
    seedRuns(store, '51job', [0, 1, 0], 'partial')
    const snapshot = applyYieldBaseline(store, '51job', 20, '2026-09-02T00:00:00.000Z')
    assert.equal(snapshot.samples, 5, 'partial 不进样本')
    assert.equal(
      snapshot.baseline,
      20,
      '把 partial 混进来会把基线压低 —— 于是"越坏越不告警"，正好反过来',
    )
    assert.equal(snapshot.level, 'ok')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('本轮**自己**不算进基线（否则掉得越多、基线越低，就越不会告警）', () => {
  const store = openTestStore()
  try {
    seedRuns(store, '51job', [20, 20, 20, 20, 20])
    // 真实调用序：`crawl.ts` 先 finish（本轮落库）再判定
    const currentRunId = store.crawlRun.start({ platformId: '51job' }, '2026-09-02T00:00:00.000Z')
    store.crawlRun.finish(currentRunId, { state: 'ok', found: 2 }, '2026-09-02T00:00:01.000Z')

    const snapshot = applyYieldBaseline(
      store,
      '51job',
      2,
      '2026-09-02T00:00:02.000Z',
      currentRunId,
    )
    assert.equal(snapshot.samples, 5, '本轮不进样本 —— 基线只由它之前的历史决定')
    assert.equal(snapshot.baseline, 20)
    assert.equal(snapshot.level, 'dropped')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('readYieldSnapshot：给界面/诊断用的只读快照，不改状态、不发待办', () => {
  const store = openTestStore()
  try {
    seedRuns(store, '51job', [20, 20, 20, 20, 20])
    const snapshot = readYieldSnapshot(store, '51job')
    assert.equal(snapshot.baseline, 20)
    assert.equal(snapshot.samples, 5)
    assert.equal(snapshot.lastFound, 20)
    assert.equal(snapshot.level, 'ok')
    assert.deepEqual(openTodosOf(store), [], '只读快照不该产生待办')

    // 没有历史的平台：如实说"不知道"，而不是拿 0 当基线
    const empty = readYieldSnapshot(store, 'liepin')
    assert.equal(empty.baseline, null)
    assert.equal(empty.lastFound, null)
    assert.equal(empty.level, 'insufficient')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
