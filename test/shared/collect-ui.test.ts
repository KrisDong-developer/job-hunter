import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeCriteria, formatCriteriaLine, type CriteriaDimensionLike } from '../../src/shared/text/criteria-label.js'
import { FAILURE_KIND_LABEL, failureKindOf, humanizeFailure, looksLikeStackTrace } from '../../src/shared/text/error-text.js'
import { CRAWL_STATE_LABEL, CRAWL_STATE_TONE, HEALTH_STATE_LABEL } from '../../src/shared/contract/enums/crawl.js'
import { runReasonLabel } from '../../src/shared/contract/enums/plan.js'

/**
 * 采集页可用性修复的**纯逻辑**测试。
 *
 * 这一批修的是"界面把内部东西漏出来了"：
 *   * 源码 JSON 裸露（`{"keyword":"Java"}`）→ 中文语义标签；
 *   * 堆栈直出（`page.evaluate: ReferenceError`）→ 一句人话 + 可展开的原文；
 *   * 状态枚举直出（`ok` / `degraded`）→ 中文徽章。
 *
 * 三件都是**纯函数**，所以能在离线断言 —— 也正是把它们抽成纯函数的原因。
 */

const DIMENSIONS: CriteriaDimensionLike[] = [
  { key: 'keyword', label: '关键词', values: [] },
  { key: 'city', label: '城市', values: [{ value: '深圳', label: '深圳' }] },
  { key: 'sort', label: '排序方式', values: [{ value: '2', label: '最新发布' }] },
  { key: 'postedWithinDays', label: '发布时间', values: [{ value: '3', label: '3 天内' }] },
]

test('条件：源码 JSON 变成中文语义标签', () => {
  const line = formatCriteriaLine({ keyword: 'Java', city: '深圳' }, DIMENSIONS)
  assert.equal(line, '关键词：Java · 城市：深圳')
  // 关键：**不能**出现源码 JSON 的痕迹
  assert.equal(line?.includes('{'), false)
  assert.equal(line?.includes('"'), false)
})

test('条件：声明了取值域的维度翻成人话（2 → 最新发布）', () => {
  const items = describeCriteria({ sort: '2', postedWithinDays: '3' }, DIMENSIONS)
  assert.deepEqual(
    items.map((item) => `${item.label}=${item.display}`),
    ['排序方式=最新发布', '发布时间=3 天内'],
  )
})

test('条件：域外的值原样显示并带上单位，不假装认识它', () => {
  const items = describeCriteria({ postedWithinDays: '15' }, DIMENSIONS)
  assert.equal(items[0]?.display, '15 天内', '数值维度补单位，避免光秃秃的"15"')
  assert.equal(items[0]?.value, '15', '原始值保留，编辑时用它')
})

test('条件：没有声明时仍然有中文名（不退回印键名）', () => {
  const items = describeCriteria({ keyword: 'Go', maxPages: '2' }, [])
  assert.deepEqual(
    items.map((item) => item.label),
    ['关键词', '抓取页数上限'],
  )
  assert.equal(items[1]?.display, '2 页')
  assert.equal(items.every((item) => item.declared === false), true, '未声明的要能被界面标出来')
})

test('条件：完全未知的键原样显示，而不是消失', () => {
  const items = describeCriteria({ somethingNew: 'x' }, DIMENSIONS)
  assert.equal(items.length, 1)
  assert.equal(items[0]?.label, 'somethingNew', '认不出来就如实显示键名 —— 静默丢掉更难查')
})

test('条件：空值与空对象给出 null（界面据此显示"不限"）', () => {
  assert.equal(formatCriteriaLine({}, DIMENSIONS), null)
  assert.equal(formatCriteriaLine({ keyword: '' }, DIMENSIONS), null)
})

// ── 错误信息：堆栈 → 人话 ────────────────────────────────────────────

test('错误：代码堆栈被识别出来，并给一句"代码语法异常"', () => {
  const raw =
    'page.evaluate: ReferenceError: maxCards is not defined\n' +
    '    at extractJobsInPage (eval at evaluate (:302:30), <anonymous>:42:11)\n' +
    '    at Page.evaluate (node_modules/playwright-core/lib/client/page.js:1:1)'
  assert.equal(looksLikeStackTrace(raw), true)

  const text = humanizeFailure('PARSE_FAILED', raw)
  assert.ok(text !== null)
  assert.equal(text.kind, 'script')
  assert.equal(text.short, '代码语法异常')
  assert.equal(text.looksTechnical, true)
  assert.ok(text.advice.includes('解析脚本'), '要告诉用户下一步该看什么')
  // **原始信息必须完整保留**：简化显示不等于把线索藏起来
  assert.equal(text.detail, raw)
})

test('错误：选择器失效（NO_RECORDS）指向"页面结构变了"', () => {
  const text = humanizeFailure('NO_RECORDS', '页面打开正常但一条记录都没解析出来')
  assert.equal(text?.kind, 'selector')
  assert.ok(text?.short.includes('选择器'))
  assert.ok(text?.advice.includes('排查'))
  assert.equal(text?.looksTechnical, false)
})

test('错误：登录 / 风控 / 导航 / 离线 各自独立成一类，并给对症的建议', () => {
  const kinds = {
    NOT_LOGGED_IN: 'login',
    BLOCKED: 'risk',
    RATE_LIMITED: 'risk',
    NAVIGATION_FAILED: 'navigation',
    PLATFORM_PAUSED: 'platform-paused',
    OFFLINE: 'offline',
  } as const
  for (const [code, kind] of Object.entries(kinds)) {
    const text = humanizeFailure(code, 'x')
    assert.equal(text?.kind, kind, `${code} 应归类为 ${kind}`)
    assert.ok((text?.advice.length ?? 0) > 10, `${code} 的建议不能是空话`)
  }
})

test('错误：导航失败保留原始线索（压成"打不开"会丢掉 ERR_NAME_NOT_RESOLVED）', () => {
  const text = humanizeFailure('NAVIGATION_FAILED', 'net::ERR_NAME_NOT_RESOLVED')
  assert.ok(text?.short.includes('ERR_NAME_NOT_RESOLVED'), '唯一有用的线索不能被压掉')
})

test('错误：没有错误码也没有信息时返回 null（界面显示"—"而不是编一句话）', () => {
  assert.equal(humanizeFailure(null, null), null)
  assert.equal(humanizeFailure(null, '   '), null)
})

test('错误：新出现的未知错误码走"未知"，不假装知道', () => {
  const text = humanizeFailure('SOME_FUTURE_CODE', '不知道怎么回事')
  assert.equal(text?.kind, 'unknown')
  assert.ok((text?.advice.length ?? 0) > 0, '未知也要给"怎么办"（去展开原始信息）')
  assert.equal(failureKindOf('SOME_FUTURE_CODE', ''), 'unknown')
})

test('错误：每一个故障类别都有中文短标签（"排查方案"的标题要用）', () => {
  for (const [kind, label] of Object.entries(FAILURE_KIND_LABEL)) {
    assert.ok(label.length > 0, `${kind} 缺中文标签`)
    assert.equal(/^[a-z-]+$/.test(label), false, `${kind} 的标签不能是英文枚举`)
  }
})

// ── 状态：英文枚举 → 中文徽章 ────────────────────────────────────────

test('状态：六种运行态都有中文标签与色调，且不留英文', () => {
  for (const [state, label] of Object.entries(CRAWL_STATE_LABEL)) {
    assert.equal(/^[a-z]+$/.test(label), false, `${state} 仍然是英文：${label}`)
    assert.ok(CRAWL_STATE_TONE[state as keyof typeof CRAWL_STATE_TONE] !== undefined)
  }
  assert.equal(CRAWL_STATE_LABEL.ok, '成功')
  assert.equal(CRAWL_STATE_LABEL.partial, '部分成功')
  assert.equal(CRAWL_STATE_LABEL.failed, '失败')
})

test('状态：健康态也是中文（不把 degraded 印给用户）', () => {
  assert.equal(HEALTH_STATE_LABEL.healthy, '正常')
  assert.equal(HEALTH_STATE_LABEL.degraded, '降级')
  assert.equal(HEALTH_STATE_LABEL.broken, '失效')
})

test('触发原因：中文化；不认识的值原样返回而不是变成"—"', () => {
  assert.equal(runReasonLabel('schedule'), '定时')
  assert.equal(runReasonLabel('manual'), '手动')
  assert.equal(runReasonLabel('catch-up'), '补跑')
  assert.equal(runReasonLabel('something-else'), 'something-else')
  assert.equal(runReasonLabel(null), null)
})
