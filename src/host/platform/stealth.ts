/**
 * stealth 注入脚本（D-17a"环境一致性"的一部分）。
 *
 * ## 它解决什么问题（参考 get_jobs 的 `anti-detection.js` 实战验证）
 *
 * 风控脚本探测自动化的一个廉价手段是检查 **JS 环境有没有被改动过**：
 *   * `fn.toString()` 不再返回 `[native code]` → 说明有代码替换了原生函数；
 *   * 往 `console.log` 里传一个带 getter/Proxy 的探测对象 → 若对象被
 *     DevTools/CDP 展开（自动化环境里 console API 由 `Runtime.enable` 装载），
 *     会触发额外调用或暴露 `Runtime` 域的痕迹。
 *
 * 本脚本**不伪造任何身份信号**（不改 webdriver / plugins / UA / 指纹 —— 那是
 * D-17 明令禁止的"指纹伪造"），只做一件事：**把我们（或引擎）对环境的改动
 * 恢复成"原生环境"的样子**：
 *   1. 保存原生 `Function.prototype.toString`，用 WeakMap 给被包装的函数登记
 *      "伪原生源码"，劫持后的 `toString` 命中登记表就返回 `[native code]` 形态；
 *      劫持函数自身也登记，防"检测 toString 被换"；
 *   2. 包装 console 方法：对象/函数类型的参数替换为 `{}` 再传给原实现 ——
 *      页面自己的值不变，只是不再把可探测对象交给 CDP 展开。
 *
 * ## 使用方式
 *
 * 由 `browser.ts` 在 `launchPersistentContext` 之后经 `context.addInitScript`
 * 注入：每个**新文档**创建前执行，早于页面脚本。幂等（`__jobHunterStealth`
 * 标记），重复注入无副作用。
 *
 * ⚠️ 脚本必须是**完全自包含的字符串**：它在页面上下文里逐字执行，
 * 不能引用任何模块作用域。这里是字符串常量而不是函数，正是为了让
 * "它会被序列化"这件事在代码形状上一目了然。
 */

/** 注入脚本本体。ES5 形态：招聘站的 CSP/老浏览器都不挑。 */
export const STEALTH_INIT_SCRIPT = String.raw`(function () {
  'use strict'
  if (typeof window !== 'object' || window === null) return
  if (window.__jobHunterStealth === true) return
  window.__jobHunterStealth = true
  var nativeToString = Function.prototype.toString
  var nativeSource = new WeakMap()
  function register(fn, source) {
    try { nativeSource.set(fn, source) } catch (e) { /* 不可注册就算了 */ }
  }
  var patchedToString = function toString() {
    var source
    try { source = nativeSource.get(this) } catch (e) { source = undefined }
    if (source !== undefined) return source
    return nativeToString.call(this)
  }
  try {
    Object.defineProperty(Function.prototype, 'toString', {
      value: patchedToString,
      writable: true,
      configurable: true,
    })
    register(patchedToString, 'function toString() { [native code] }')
  } catch (e) { /* 改不动说明环境已经有更强的防护，交出控制权 */ }
  function stealthifyConsole(name) {
    var original = console[name]
    if (typeof original !== 'function') return
    var wrapped = function () {
      var args = []
      for (var i = 0; i < arguments.length; i++) {
        var value = arguments[i]
        // ❗对象/函数一律换成空对象：不把带 getter/Proxy 的探测对象交给
        // CDP/DevTools 展开（展开就是自动化环境的痕迹）。
        args.push(value !== null && (typeof value === 'object' || typeof value === 'function') ? {} : value)
      }
      return original.apply(console, args)
    }
    try {
      Object.defineProperty(console, name, {
        value: wrapped,
        writable: true,
        configurable: true,
      })
    } catch (e) { return }
    // 被包装的 console 方法对外仍要"看起来是原生的"。
    register(wrapped, nativeToString.call(original))
  }
  var names = ['log', 'debug', 'info', 'warn', 'error', 'dir', 'table']
  for (var i = 0; i < names.length; i++) stealthifyConsole(names[i])
})()`
