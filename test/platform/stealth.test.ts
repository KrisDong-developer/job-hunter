import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

/**
 * 每个用例一个全新的 jsdom realm：注入脚本改的是页面全局，不能复用。
 *
 * 为什么用 `runScripts:'outside-only'` + `vm.runInContext` 而不是 `window.eval`：
 * jsdom 的 `window.eval` 跑在一个隔离的 realm 里（`globalThis` 都不是 window 本身），
 * 脚本对全局的修改在外侧看不见；`runInContext` 才是"页面里执行"的忠实模拟 ——
 * `window` 已定义、`window === globalThis`、属性内外互通（已实测验证）。
 */
function freshWindow(): JSDOM {
  return new JSDOM('<html><body></body></html>', {
    url: 'https://we.51job.com/pc/search',
    runScripts: 'outside-only',
  })
}

/** 在"页面上下文"里执行一段脚本。 */
function evalInPage(dom: JSDOM, code: string): unknown {
  return runInContext(code, dom.getInternalVMContext())
}

test('stealth 注入：console 收到的对象参数被替换为空对象（防 CDP 展开探测）', () => {
  const dom = freshWindow()
  const seen: unknown[][] = []
  // 先放一个"原始实现"（记录参数），注入后它会被包装 —— 原始实现看到的参数
  // 就是包装层交给它的参数。
  dom.window.console.log = (...args: unknown[]) => {
    seen.push(args)
  }
  evalInPage(dom, STEALTH_INIT_SCRIPT)

  dom.window.console.log('hello', { probe: 1 }, 42, null, 'done')

  assert.equal(seen.length, 1)
  const [first, second, third, fourth, fifth] = seen[0] ?? []
  assert.equal(first, 'hello', '字符串标量原样透传')
  // 跨 realm 的对象不能用 deepStrictEqual（原型不同域），按"空且无键"判定
  assert.ok(
    typeof second === 'object' && second !== null && Object.keys(second).length === 0,
    '对象参数必须被替换为空对象',
  )
  assert.equal(third, 42, '数字标量原样透传')
  assert.equal(fourth, null, 'null 原样透传（不是对象）')
  assert.equal(fifth, 'done')
})

test('stealth 注入：劫持后的 Function.prototype.toString 自身看起来仍是原生的', () => {
  const dom = freshWindow()
  evalInPage(dom, STEALTH_INIT_SCRIPT)
  const printed = evalInPage(dom, 'Function.prototype.toString.call(Function.prototype.toString)')
  assert.ok(
    String(printed).includes('[native code]'),
    `toString 自身要伪装成原生，实际打印：${String(printed)}`,
  )
})

test('stealth 注入：被包装函数的 toString 打印的是"原函数"的源码（与包装前一致）', () => {
  const dom = freshWindow()
  const original = function myOriginal(): number {
    return 1
  }
  const expected = dom.window.Function.prototype.toString.call(original)
  dom.window.console.debug = original
  evalInPage(dom, STEALTH_INIT_SCRIPT)

  const wrapped = dom.window.console.debug
  assert.notEqual(wrapped, original, 'console.debug 确实被包装了')
  const printed = dom.window.Function.prototype.toString.call(wrapped)
  assert.equal(printed, expected, '包装后的 toString 输出必须与包装前逐字一致')
})

test('stealth 注入：普通函数的 toString 输出与注入前逐字一致', () => {
  const dom = freshWindow()
  const fn = function keepMe(): number {
    return 2
  }
  const before = dom.window.Function.prototype.toString.call(fn)
  evalInPage(dom, STEALTH_INIT_SCRIPT)
  const after = dom.window.Function.prototype.toString.call(fn)
  assert.equal(after, before, '不该因为注入而改变普通函数的源码打印')
  assert.ok(String(after).includes('keepMe'))
})

test('stealth 注入：幂等（重复注入不抛错、不重复包装）', () => {
  const dom = freshWindow()
  evalInPage(dom, STEALTH_INIT_SCRIPT)
  const first = dom.window.console.info
  evalInPage(dom, STEALTH_INIT_SCRIPT)
  assert.equal(dom.window.console.info, first, '第二次注入直接返回，不再包装')
  assert.equal(dom.window.__jobHunterStealth, true)
})
