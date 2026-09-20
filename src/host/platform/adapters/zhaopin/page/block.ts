/**
 * 智联**判墙**的页面上下文函数（`guard.detectBlock` 与动作链的断言共用一份实现）。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../../shared/contract/enums/crawl.js'
import type { BlockSignalSet } from '../../../block-signals.js'

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 验证。
 *
 * 关键取舍：智联**加了筛选参数**时会返回 0 条 + 「登录之后再搜索」而不是报错，
 * 这是典型的**静默失败** —— 会被误读成"没有岗位"。所以这里必须把它识别成
 * `login-required`，让调用方知道是被墙了。
 *
 * 反过来，`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙。
 */
export function detectBlockInPage(arg: {
  card: string
  loginPopup: string
  noJobTip: string
  /**
   * **通用词表**（由 `signalsOf(...)` 在宿主侧组装后传进来）。
   *
   * 智联走的是"**共享词表、自有结构**"这条路：验证码选择器 / 限流 / 配额 / blank 阈值
   * 用共享的那一份，但**判断流程仍是它自己的** —— 因为下面那段载荷探针
   * （`__INITIAL_STATE__.positionList` 配平）与 `noJobTip` 的组合判据是它独有的，
   * 硬塞进 `detectBlockWithSignals` 只会让那个共享函数长出一堆平台分支。
   */
  signals: BlockSignalSet
}): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')
  let cards = 0
  try {
    cards = document.querySelectorAll(arg.card).length
  } catch {
    cards = 0
  }

  // payload 里有没有真岗位。AB 分流会把这路由丢到老 `/jobs` 掩码页：其卡片是
  // `.job-card`（不在 `arg.card` 里），但 `__INITIAL_STATE__.positionList` 往往仍有真数据。
  // **有真数据就不算撞墙** —— 否则这一整轮会被误判成 login-required 直接跳过。
  const hasStateJobs = ((): boolean => {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const src = script.textContent ?? ''
      const marker = src.indexOf('__INITIAL_STATE__')
      if (marker < 0) continue
      const pKey = src.indexOf('"positionList"', marker)
      if (pKey < 0) continue
      const open = src.indexOf('[', pKey)
      if (open < 0) continue
      // 配平 positionList 数组到它的收尾 ']'，看中间有没有元素（元素必有 '{'）。
      let depth = 0
      let inString = false
      let escaped = false
      let sawItem = false
      for (let i = open; i < src.length; i += 1) {
        const ch = src.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '[') depth += 1
        else if (ch === ']') {
          depth -= 1
          if (depth === 0) break
        } else if (ch === '{' && depth === 1) sawItem = true
      }
      return sawItem
    }
    return false
  })()

  // 极验（geetest）与阿里云 nc 两套验证码都点名；智联登录环节用的是极验/易盾。
  // 选择器来自**共享词表**（`block-signals.ts`），智联只额外声明自己那几条。
  for (const selector of arg.signals.captchaSelectors) {
    try {
      if (document.querySelector(selector) !== null) return 'captcha'
    } catch {
      // 单个选择器非法不影响其它判据
    }
  }
  for (const word of arg.signals.rateText) {
    if (compact.includes(word)) return 'rate-limited'
  }
  // 平台侧"额度用完"（智联投递上限约 100，文案含"达到上限"）≠ 频控：今天就此打住。
  for (const word of arg.signals.quotaText) {
    if (compact.includes(word)) return 'quota-exhausted'
  }

  if (cards === 0) {
    // 载荷里有真数据 → 页面其实是好的（AB 分流落到老路由），不是被墙。
    if (hasStateJobs) return null
    // 加了筛选参数但没登录 → 站点返回 0 条 + 这句文案（**静默失败**，必须显式点出）
    if (/登录之后再搜索|登录查看更多相关职位/.test(compact)) return 'login-required'
    let noJobTip = false
    try {
      noJobTip = document.querySelector(arg.noJobTip) !== null
    } catch {
      noJobTip = false
    }
    // `noJobTip` 在"真没结果"和"被墙"两种情况下都会出现，所以它**不能单独**当登录依据。
    if (noJobTip && compact.length < 400 && /登录|注册/.test(compact)) return 'login-required'
    if (/很抱歉/.test(compact) && /登录/.test(compact)) return 'login-required'
    // 阈值来自共享词表：智联的 80 比通用的 120 更严（它的"搜到 0 条"结果页
    // 也有一两百字筛选器文案，120 会把那种页面误判成空白）
    if (compact.length < arg.signals.blankTextLength) return 'blank'
  }

  return null
}
