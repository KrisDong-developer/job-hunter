/**
 * 平台级风控暂停（SR-18/21/22）的落点测试。
 *
 * 这一层的存在理由只有一个：**多平台之后，"暂停"必须能只暂停一个平台**。
 * 挂在方案上时，猎聘弹了滑块会把同方案里健康的 51job / 智联一起停掉
 * （而且反过来，别的方案去碰猎聘又不会被拦住）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allPlatformsRiskPaused,
  clearPlatformRiskPause,
  readPlatformRiskPause,
  RISK_PAUSE_KEY,
  setPlatformRiskPause,
} from '../../src/host/platform/risk-pause.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const NOW = '2026-09-18T09:00:00.000Z'

test('平台级风控暂停：写 → 读 → 清，且**不牵连别的平台**', () => {
  const store = openTestStore()
  try {
    assert.equal(readPlatformRiskPause(store, '51job').paused, false, '默认没有暂停')

    setPlatformRiskPause(store, '51job', '命中风控/登录墙信号（BLOCKED）', NOW)
    const pause = readPlatformRiskPause(store, '51job')
    assert.equal(pause.paused, true)
    assert.ok((pause.reason ?? '').includes('BLOCKED'))
    assert.equal(pause.at, NOW)

    assert.equal(
      readPlatformRiskPause(store, 'liepin').paused,
      false,
      '平台级的关键性质：暂停一个平台不该牵连其它平台',
    )

    clearPlatformRiskPause(store, '51job')
    assert.equal(readPlatformRiskPause(store, '51job').paused, false)
  } finally {
    store.close()
    cleanup(store.dataDir)
  }
})

test('方案级 riskPaused 是**派生**的：全部平台都暂停才为真', () => {
  const store = openTestStore()
  try {
    assert.equal(allPlatformsRiskPaused(store, ['51job', 'liepin']), false)

    setPlatformRiskPause(store, '51job', 'captcha', NOW)
    assert.equal(
      allPlatformsRiskPaused(store, ['51job', 'liepin']),
      false,
      '只暂停一个平台 ≠ 方案级暂停',
    )

    setPlatformRiskPause(store, 'liepin', 'captcha', NOW)
    assert.equal(allPlatformsRiskPaused(store, ['51job', 'liepin']), true)

    assert.equal(
      allPlatformsRiskPaused(store, []),
      false,
      '0 个平台不算"全部暂停"—— 那是配置问题，归 plan_disabled / 校验管',
    )
  } finally {
    store.close()
    cleanup(store.dataDir)
  }
})

test('裸 true 也认（兼容手工写过这个键的库）', () => {
  const store = openTestStore()
  try {
    store.setting.set(RISK_PAUSE_KEY, 'platform', '51job', true, NOW)
    const pause = readPlatformRiskPause(store, '51job')
    assert.equal(pause.paused, true, '不认的话"看起来暂停了、其实没暂停"，比不兼容更糟')
    assert.equal(pause.reason, null, '裸值没有原因可读，如实给 null')
  } finally {
    store.close()
    cleanup(store.dataDir)
  }
})

test('端到端：平台被风控暂停 → 手动跑被拒（全被暂停时）→ 恢复后立刻可用', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    // **先**置暂停再建方案：万一建完方案就正好撞上触发点，门也能拦住它
    setPlatformRiskPause(store, '51job', '命中风控/登录墙信号（BLOCKED）', new Date().toISOString())

    const plan = runtime.plans().create({
      name: '风控暂停集成',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳' },
      schedule: {
        windowStartHour: 9,
        windowEndHour: 11,
        weekdays: [1, 2, 3, 4, 5, 6, 0],
        jitterMs: 0,
        missedGraceMs: 60 * 60 * 1000,
      },
    })

    const before = runtime
      .schedulerStatus()
      .planStatus.find((item) => item.planId === plan.id)
    assert.equal(before?.riskPaused, true, '唯一平台被暂停 → 方案级派生为真')

    await assert.rejects(
      () => runtime.runPlan(plan.id, 'manual'),
      (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
      'SR-21：全平台被暂停时手动也不许跑',
    )

    runtime.resumeRisk(plan.id)
    assert.equal(readPlatformRiskPause(store, '51job').paused, false, '恢复要按平台清')
    const after = runtime.schedulerStatus().planStatus.find((item) => item.planId === plan.id)
    assert.equal(after?.riskPaused, false, '恢复后方案级派生值跟着归假')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
