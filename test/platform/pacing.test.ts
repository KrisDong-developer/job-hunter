import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BURST_RULES,
  BurstGuard,
  gaussBounded,
  humanDelayMs,
  type Random,
} from '../../src/host/platform/pacing.js'

test('gaussBounded：任何随机源下都裁剪在区间内', () => {
  const constant: Random = () => 0.5
  for (let i = 0; i < 200; i += 1) {
    const value = gaussBounded(2200, 500, 1200, 3200, Math.random)
    assert.ok(value >= 1200 && value <= 3200, `越界：${String(value)}`)
  }
  const stable = gaussBounded(2200, 500, 1200, 3200, constant)
  assert.ok(stable >= 1200 && stable <= 3200)
  // 区间退化（min === max）直接返回 min
  assert.equal(gaussBounded(5, 1, 5, 5, constant), 5)
})

test('humanDelayMs：默认无犹豫时不超过区间上限', () => {
  for (let i = 0; i < 500; i += 1) {
    const delay = humanDelayMs([1200, 3200], { hesitateProbability: 0 })
    assert.ok(delay >= 1200 && delay <= 3200, `越界：${String(delay)}`)
  }
})

test('humanDelayMs：犹豫概率 100% 时至少加 hesitateMin', () => {
  const constant: Random = () => 0.5
  const delay = humanDelayMs([1200, 3200], {
    random: constant,
    hesitateProbability: 1,
    hesitateMinMs: 2000,
    hesitateMaxMs: 5000,
  })
  // 高斯部分被裁剪在 [1200,3200]，再加 2000 + 0.5*3000 = 3500
  assert.ok(delay >= 1200 + 2000, `犹豫量没加上：${String(delay)}`)
  assert.ok(delay <= 3200 + 5000)
})

test('humanDelayMs：区间非法（max<=min）按 min 兜底', () => {
  assert.equal(humanDelayMs([0, 0]), 0)
  assert.equal(humanDelayMs([3200, 1200]), 3200)
})

test('BurstGuard：没有 mark 就没有惩罚；15s 内 3 次触发轻罚', () => {
  let t = 1_000_000
  const now = (): number => t
  const zero: Random = () => 0
  const guard = new BurstGuard({ now, random: zero })

  assert.equal(guard.penaltyMs(), 0, '还没动作不该有惩罚')

  guard.mark()
  guard.mark()
  assert.equal(guard.penaltyMs(), 0, '2 次在阈值下')
  guard.mark()
  assert.equal(guard.penaltyMs(), BURST_RULES[0]?.penaltyMinMs, '3 次 → 轻罚下限（random=0）')

  // 挪出 15s 窗口（仍在 45s 内，但 45s 规则要 6 次）
  t += 16_000
  assert.equal(guard.penaltyMs(), 0, '出了 15s 窗口且不足 6 次')
})

test('BurstGuard：45s 内 6 次触发重罚；出了窗口自动清零', () => {
  let t = 2_000_000
  const now = (): number => t
  const zero: Random = () => 0
  const guard = new BurstGuard({ now, random: zero })

  for (let i = 0; i < 5; i += 1) guard.mark()
  t += 10_000
  guard.mark() // 第 6 次：与第 1 次间隔 10s，都在 15s 窗口内吗？第 1 次距今 10s < 15s → 都在
  assert.equal(guard.penaltyMs(), BURST_RULES[1]?.penaltyMinMs, '6 次在 45s 内 → 重罚下限（取两条规则的最大值）')

  t += 46_000
  assert.equal(guard.penaltyMs(), 0, '出了 45s 窗口，所有记录都被裁掉')
})

test('BurstGuard：惩罚取两条命中规则的最大值', () => {
  const t = 3_000_000
  const now = (): number => t
  const max: Random = () => 1 // 惩罚取上限
  const guard = new BurstGuard({ now, random: max })
  for (let i = 0; i < 6; i += 1) guard.mark()
  assert.equal(guard.penaltyMs(), BURST_RULES[1]?.penaltyMaxMs, '重罚上限 > 轻罚上限')
})
