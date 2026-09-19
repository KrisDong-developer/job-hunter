import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  candidateExecutables,
  debugPortFromArgs,
  discoverExecutable,
  normalizeWaitForSelector,
  staleLockFiles,
} from '../../src/host/platform/browser.js'
import type { BrowserPage } from '../../src/host/platform/browser.js'

const existsIn = (allowed: readonly string[]) => (path: string): boolean => allowed.includes(path)

test('浏览器发现顺序：配置指定优先', () => {
  const explicit = 'D:\\custom\\chrome.exe'
  const system = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  const candidates = candidateExecutables({ executablePath: explicit }, {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local',
  } as NodeJS.ProcessEnv)

  assert.equal(candidates[0], explicit)
  assert.ok(candidates.includes(system))
  assert.equal(discoverExecutable(candidates, existsIn([explicit, system])), explicit)
  // 配置的路径不存在时，退到系统 Chrome
  assert.equal(discoverExecutable(candidates, existsIn([system])), system)
})

// ── waitForSelector 归一化（2026-09-19：一次真实故障的直接修复）──────────────
//
// 背景：适配器声明的是 `waitForSelector(selector, timeoutMs: number)`，而 Playwright 的
// 第二个参数是**配置对象** ⇒ 传数字等于什么都没传，于是 `state` 与 `timeout` 双双失效
// （实际用了 `visible` + 默认 30s）。猎聘那次定时采集就因此报「连搜索页都没打开成功」，
// 而日志里 locator **已经解析到 42 个元素** —— 页面早加载好了，跟网络无关。
function fakePage(
  impl?: (selector: string, options: unknown) => Promise<unknown>,
): { page: BrowserPage; calls: unknown[] } {
  const calls: unknown[] = []
  const page = {
    ...(impl === undefined
      ? {}
      : {
          waitForSelector: async (selector: string, options: unknown): Promise<unknown> => {
            calls.push(options)
            return await impl(selector, options)
          },
        }),
  } as unknown as BrowserPage
  return { page, calls }
}

test('waitForSelector 归一化：数字参数被翻译成 {state: attached, timeout}（原 bug 就是它被忽略）', async () => {
  const { page, calls } = fakePage(async () => ({}))
  normalizeWaitForSelector(page)
  assert.equal(await page.waitForSelector?.('#card', 1_234), true)
  assert.deepEqual(
    calls[0],
    { state: 'attached', timeout: 1_234 },
    '必须是配置对象：传数字时 Playwright 取不到 state/timeout，就会用 visible + 30s',
  )
})

test('waitForSelector 归一化：超时返回 false 而不是抛错（与离线夹具同形）', async () => {
  const { page } = fakePage(async () => {
    throw new Error("Timeout 1234ms exceeded.\nwaiting for locator('#card') to be visible")
  })
  normalizeWaitForSelector(page)
  assert.equal(await page.waitForSelector?.('#card', 1_234), false)
})

test('waitForSelector 归一化：页面本来没这个方法就原样返回（可选能力，不硬造）', () => {
  const { page } = fakePage()
  assert.equal(normalizeWaitForSelector(page), page)
  assert.equal(page.waitForSelector, undefined)
})

test('系统 Chrome / Edge 都找不到 → undefined（交给 playwright 自己解析）', () => {
  const candidates = candidateExecutables({}, {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local',
  } as NodeJS.ProcessEnv)
  assert.equal(discoverExecutable(candidates, () => false), undefined)
})

test('残留锁检测只报真实存在的文件', () => {
  const profileDir = 'D:\\profile'
  const lock = join(profileDir, 'SingletonLock')
  const cookie = join(profileDir, 'SingletonCookie')
  assert.deepEqual(staleLockFiles(profileDir, existsIn([lock, cookie])), [lock, cookie])
  assert.deepEqual(staleLockFiles(profileDir, () => false), [])
})

test('调试端口解析：只有 --remote-debugging-port=<port> 形态才认', () => {
  const base = ['--disable-blink-features=AutomationControlled', '--start-maximized']
  assert.equal(debugPortFromArgs(base), undefined, '普通参数没有端口')
  assert.equal(debugPortFromArgs([...base, '--remote-debugging-port=9222']), 9222)
  assert.equal(debugPortFromArgs([...base, '--remote-debugging-port=7866']), 7866)
  // 非法值：0 / 超范围 / 非数字 / 空格形态都不认
  assert.equal(debugPortFromArgs(['--remote-debugging-port=0']), undefined, '0 表示随机端口，无法守卫')
  assert.equal(debugPortFromArgs(['--remote-debugging-port=99999']), undefined)
  assert.equal(debugPortFromArgs(['--remote-debugging-port=abc']), undefined)
  assert.equal(debugPortFromArgs(['--remote-debugging-port', '9222']), undefined, '两段式形态不支持')
})
