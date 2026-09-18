import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BROWSER_IDLE_DEFAULT_MIN,
  BROWSER_IDLE_MAX_MIN,
  BROWSER_IDLE_KEY,
} from '../../src/shared/constants.js'
import {
  BROWSER_IDLE_FALLBACK,
  normalizeBrowserConfig,
  readBrowserConfig,
  writeBrowserConfig,
} from '../../src/host/browser-config.js'
import { cleanup, fixedClock, openTestStore, tempDataDir } from '../support/store.js'

/**
 * 浏览器空闲关闭设置。
 *
 * 这个值决定"浏览器多久后自己关掉"，所以**三种坏输入都必须被吸收**：
 * 否则要么永远关不掉（用户以为设了），要么关得比谁都快（正在登录就被关）。
 */
test('默认值就是常量里那个（设置表里没写过时）', () => {
  assert.equal(BROWSER_IDLE_FALLBACK.idleCloseMinutes, BROWSER_IDLE_DEFAULT_MIN)
  assert.equal(normalizeBrowserConfig(undefined).idleCloseMinutes, BROWSER_IDLE_DEFAULT_MIN)
  assert.equal(normalizeBrowserConfig(null).idleCloseMinutes, BROWSER_IDLE_DEFAULT_MIN)
  assert.equal(normalizeBrowserConfig({}).idleCloseMinutes, BROWSER_IDLE_DEFAULT_MIN)
})

test('非数字 / NaN / Infinity 退回默认值，而不是让浏览器关不掉', () => {
  for (const bad of ['10', {}, [], true, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    assert.equal(
      normalizeBrowserConfig({ idleCloseMinutes: bad }).idleCloseMinutes,
      BROWSER_IDLE_DEFAULT_MIN,
      `${String(bad)} 应该退回默认值`,
    )
  }
})

test('负数按 0 处理（"我不要它关"比"关得比谁都快"更接近意图）', () => {
  assert.equal(normalizeBrowserConfig({ idleCloseMinutes: -5 }).idleCloseMinutes, 0)
})

test('超过上限收到上限；小数四舍五入', () => {
  assert.equal(normalizeBrowserConfig({ idleCloseMinutes: 99_999 }).idleCloseMinutes, BROWSER_IDLE_MAX_MIN)
  assert.equal(normalizeBrowserConfig({ idleCloseMinutes: 10.4 }).idleCloseMinutes, 10)
  assert.equal(normalizeBrowserConfig({ idleCloseMinutes: 10.6 }).idleCloseMinutes, 11)
  assert.equal(normalizeBrowserConfig({ idleCloseMinutes: 0 }).idleCloseMinutes, 0, '0 是合法值（不自动关）')
})

test('落库后能读回来（每个键写在 scope=global）', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    assert.equal(readBrowserConfig(store).idleCloseMinutes, BROWSER_IDLE_DEFAULT_MIN, '没写过时读默认')

    const written = writeBrowserConfig(store, { idleCloseMinutes: 25 }, fixedClock()())
    assert.equal(written.idleCloseMinutes, 25)
    assert.equal(readBrowserConfig(store).idleCloseMinutes, 25, '写进去要能读回来')
    const stored = store.setting.get<{ idleCloseMinutes?: number }>(BROWSER_IDLE_KEY, 'global', '')
    assert.equal(stored?.idleCloseMinutes, 25, '键名与 scope 要与 shared 常量一致，别写歪')

    // 再改一次：以旧值为基础合并，而不是重置其它字段
    writeBrowserConfig(store, { idleCloseMinutes: 0 }, fixedClock()())
    assert.equal(readBrowserConfig(store).idleCloseMinutes, 0, '0 要能存住（否则"不关"这个选项等于没实现）')

    // 非法值经写入路径也被收敛
    writeBrowserConfig(store, { idleCloseMinutes: -1 }, fixedClock()())
    assert.equal(readBrowserConfig(store).idleCloseMinutes, 0)
  } finally {
    store.close()
    cleanup(dir)
  }
})

// ── D-17a：引擎偏好与 stealth 注入开关 ───────────────────────────────

test('默认：engine=auto、stealthInit=true（D-17a 环境一致性默认全开）', () => {
  const fallback = normalizeBrowserConfig(undefined)
  assert.equal(fallback.engine, 'auto')
  assert.equal(fallback.stealthInit, true)
  // 旧格式（纯数字）与空对象也要拿到新字段的默认值
  assert.equal(normalizeBrowserConfig(10).engine, 'auto')
  assert.equal(normalizeBrowserConfig({}).stealthInit, true)
})

test('engine 只认三个枚举值，其余退回 auto', () => {
  assert.equal(normalizeBrowserConfig({ engine: 'patchright' }).engine, 'patchright')
  assert.equal(normalizeBrowserConfig({ engine: 'playwright-core' }).engine, 'playwright-core')
  assert.equal(normalizeBrowserConfig({ engine: 'puppeteer' }).engine, 'auto')
  assert.equal(normalizeBrowserConfig({ engine: 42 }).engine, 'auto')
})

test('stealthInit 只认布尔，其余退回 true（环境一致性默认开）', () => {
  assert.equal(normalizeBrowserConfig({ stealthInit: false }).stealthInit, false)
  assert.equal(normalizeBrowserConfig({ stealthInit: 'no' }).stealthInit, true)
  assert.equal(normalizeBrowserConfig({ stealthInit: 0 }).stealthInit, true)
})

test('引擎/stealth 设置能落库读回，且改一个不重置另一个', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    writeBrowserConfig(store, { engine: 'playwright-core' }, fixedClock()())
    assert.deepEqual(readBrowserConfig(store), {
      idleCloseMinutes: BROWSER_IDLE_DEFAULT_MIN,
      engine: 'playwright-core',
      stealthInit: true,
    })
    writeBrowserConfig(store, { stealthInit: false }, fixedClock()())
    const next = readBrowserConfig(store)
    assert.equal(next.engine, 'playwright-core', '改 stealth 不重置 engine')
    assert.equal(next.stealthInit, false)
  } finally {
    store.close()
    cleanup(dir)
  }
})
