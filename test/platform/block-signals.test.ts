/**
 * 判墙信号表（批次 6）。
 *
 * 这一层的价值在于**消掉 10 份重复的判据**，而它最容易在日后被破坏的地方
 * 不是"文案写错"，而是**函数不再自包含** —— 有人为了少写两行，在
 * `detectBlockWithSignals` 里调一个模块里的工具函数，本地全绿、
 * 到真机上 `page.evaluate` 一序列化就 `X is not defined`。
 * 所以下面第 3 条把它钉死。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BLANK_TEXT_LENGTH,
  COMMON_SIGNALS,
  detectBlockWithSignals,
  LOGIN_WALL_TEXT_LENGTH,
  signalsOf,
} from '../../src/host/platform/block-signals.js'

test('signalsOf 是**并集**：平台特有信号加在通用词表之上，不会把通用那半丢掉', () => {
  const plain = signalsOf()
  assert.deepEqual(plain.captchaSelectors, [...COMMON_SIGNALS.captchaSelectors])
  assert.deepEqual(plain.rateText, [...COMMON_SIGNALS.rateText])
  assert.equal(plain.blankTextLength, BLANK_TEXT_LENGTH)
  assert.equal(plain.loginTextLength, LOGIN_WALL_TEXT_LENGTH)

  const withExtra = signalsOf({
    urlPatterns: ['example\\.com/safe/verify'],
    rateText: ['本平台特有文案'],
    captchaSelectors: ['.my-captcha'],
  })
  assert.equal(withExtra.urlPatterns.length, 1)
  assert.ok(withExtra.rateText.includes('本平台特有文案'), '平台特有要进来')
  assert.ok(
    withExtra.rateText.includes(COMMON_SIGNALS.rateText[0]),
    '通用词表**不能**被平台特有覆盖掉 —— 覆盖式很容易在某次改动里把通用那半悄悄丢掉',
  )
  assert.ok(withExtra.captchaSelectors.includes('.my-captcha'))
  assert.equal(
    withExtra.captchaSelectors.length,
    COMMON_SIGNALS.captchaSelectors.length + 1,
    '是相加，不是替换',
  )
})

test('信号集必须是**纯数据**：能 JSON 往返（它要进 page.evaluate 的 arg）', () => {
  const signals = signalsOf({ urlPatterns: ['a'], rateText: ['b'], blankTextLength: 42 })
  const roundTripped = JSON.parse(JSON.stringify(signals)) as typeof signals
  assert.deepEqual(roundTripped, signals, '有函数/undefined/Map 之类的东西就过不了这一关')
})

test('判墙函数**只引用自己的参数** —— 序列化到页面里才跑得起来', () => {
  const source = detectBlockWithSignals.toString()
  // ⚠️ 这里断的是**源码级性质**（不是行为）：`page.evaluate` 会序列化函数源码，
  // 页面里既没有这个模块，也没有模块里的任何常量与工具函数。
  // 所以"函数体里出现了本模块的标识符"就是 bug，而不是风格问题。
  for (const name of [
    'COMMON_SIGNALS',
    'BLANK_TEXT_LENGTH',
    'LOGIN_WALL_TEXT_LENGTH',
    'signalsOf',
  ]) {
    assert.equal(
      source.includes(name),
      false,
      `detectBlockWithSignals 引用了模块里的 ${name} —— 序列化到页面后会变成 undefined。` +
        '需要的值请放进 arg.signals（平台上特有与通用词表都在里面）。',
    )
  }
  // 连"同模块的小工具函数"也不行 —— 这个仓库踩过这个坑
  assert.equal(
    /\bmatchesAny\s*\(/.test(source),
    false,
    '不要为了少写两行去调模块里的工具函数：它同样不会出现在页面里',
  )
})

test('判断顺序：越确定的越先判，blank 最弱放最后', () => {
  const source = detectBlockWithSignals.toString()
  // 用**精确的取值串**而不是 'blank' 这种子串：`flags?.blankOnAboutProtocol` 里也有
  // "blank"，用子串会把"销毁页判定"误当成"空白页判定"（这条断言最初就是这么错的）。
  const order = [
    'flags?.blankOnAboutProtocol',
    'signals.urlPatterns',
    'signals.captchaSelectors',
    // 验证码文案必须排在限流之前：Indeed 的「安全验证」两边都能对上，
    // 但它是验证码而不是限流 —— 顺序错了界面会给错下一步动作
    'signals.captchaText',
    'signals.rateText',
    'signals.quotaText',
    'signals.loginText',
    'signals.blankTextLength',
  ]
  let cursor = -1
  for (const name of order) {
    const at = source.indexOf(name)
    assert.ok(at > cursor, `${name} 应当排在上一类判据之后（顺序：${order.join(' → ')}）`)
    cursor = at
  }
})
