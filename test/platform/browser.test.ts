import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  candidateExecutables,
  debugPortFromArgs,
  discoverExecutable,
  staleLockFiles,
} from '../../src/host/platform/browser.js'

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
