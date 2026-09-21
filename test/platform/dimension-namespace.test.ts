/**
 * **适配器声明 → 方案条件 → 适配器读值** 这条链的一致性守卫。
 *
 * 为什么值得一个专门的测试文件：这三段各自都能过自己的单测，而链上任何一处错位
 * 都是**静默失败** —— 界面上选好了筛选项、保存成功、抓回来的却是"没筛过"的结果，
 * 用户从数据里查不出来（"筛了没结果"与"没筛"长得一样）。已经踩过的两个真例子：
 *
 *   1. **神仙外企的行业 / 职能**（`businessCategory` / `posInfo`）：适配器声明了它们、
 *      界面渲染了它们、校验放行了它们，但这两个键**没登记**在 plan-config 的
 *      `PLATFORM_KEYS` 里 —— 于是它们落进 `criteria.extra`，而适配器读的是
 *      `platformCriterion()`（`platform` 命名空间）→ 永远读到空串；
 *      最后还被 `extra` 的兜底循环以平台根本不认的参数名塞进请求体。
 *      适配器自己的单测之所以没发现：它**手工构造** `{ platform: { posInfo: … } }`，
 *      绕过了生产路径上的那次转换。
 *   2. **参数名说谎**：`extra` 兜底会把键名原样当参数名（`posInfo` / `businessCategory`），
 *      而接口要的是 `posIds` / `businessCategoryIdList`。
 *
 * 所以这个文件**从方案里的 `criteria` 出发**（不是从适配器入参出发），逐个平台、
 * 逐个声明维度地走一遍真实转换。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADAPTER_SPECS } from '../../src/host/runtime/adapters.js'
import { criteriaToSearchCriteria } from '../../src/host/domain/plan-config.js'
import { DEFAULT_WAIQI_CONFIG } from '../../src/host/platform/adapters/waiqi-job/config.js'
import { buildWaiqiRequestBody } from '../../src/host/platform/adapters/waiqi-job/urls.js'
import { formatCriteriaLine } from '../../src/shared/text/criteria-label.js'
import type { SiteAdapter } from '../../src/host/platform/types.js'

/** 走**注册表真实的构造路径**（配置取代码默认，不碰 DB）建出全部适配器。 */
function allAdapters(): SiteAdapter[] {
  return ADAPTER_SPECS.map((spec) => spec.build(undefined, [0, 0]))
}

/** 有资格作为顶层槽位被适配器读到的键（其余平台特有维度必须进 `platform` 命名空间）。 */
const TOP_LEVEL_SLOTS = ['keyword', 'city', 'sort', 'maxPages', 'postedWithinDays'] as const

test('声明过的筛选键一个都不能落进 extra —— 落进去 = 适配器读不到 = 静默不筛', () => {
  for (const adapter of allAdapters()) {
    for (const dimension of adapter.criteriaDimensions) {
      // 探针值：优先用声明里的第一个取值（保证是合法值），自由文本用 '1'
      const probe = dimension.values[0]?.value ?? '1'
      const criteria = criteriaToSearchCriteria({ [dimension.key]: probe })
      assert.equal(
        criteria.extra?.[dimension.key],
        undefined,
        `${adapter.id} 的「${dimension.key}」落进了 extra —— 它在 PLATFORM_KEYS / 顶层槽位里没有登记，` +
          '适配器（platformCriterion / criteria.xxx）读不到它，用户看到的是"选了但没生效"',
      )
    }
  }
})

test('每一个声明过的维度都真的能被取出来（顶层槽位或 platform 命名空间）', () => {
  for (const adapter of allAdapters()) {
    for (const dimension of adapter.criteriaDimensions) {
      const probe = dimension.values[0]?.value ?? '1'
      const criteria = criteriaToSearchCriteria({ [dimension.key]: probe })
      const top = TOP_LEVEL_SLOTS.some(
        (slot) => (criteria as Record<string, unknown>)[slot] !== undefined,
      )
      const scoped = criteria.platform?.[dimension.key] !== undefined
      assert.ok(
        top || scoped,
        `${adapter.id} 的「${dimension.key}」没有被任何已知槽位接住：${JSON.stringify(criteria)}`,
      )
    }
  }
})

test('每一个声明过的键都有中文名 —— 否则方案卡上的条件行会印出源码键名', () => {
  const keys = new Set(
    allAdapters().flatMap((adapter) => adapter.criteriaDimensions.map((item) => item.key)),
  )
  for (const key of keys) {
    // 第二个参数给空数组 = "当前平台一个维度都没声明"，逼它走 FALLBACK_LABEL 那条路
    const line = formatCriteriaLine({ [key]: '1' }, [])
    assert.ok(line !== null, `${key} 应当能渲染出一行条件`)
    assert.ok(
      !line.includes(key),
      `「${key}」没有中文名（渲染成了 ${line}）—— 到 shared/text/criteria-label.ts 的 FALLBACK_LABEL 里补一条`,
    )
  }
})

test('神仙外企的行业 / 职能：从方案条件一路走到平台的真实参数名', () => {
  // 起点是**方案里的 criteria**（用户填的那一份），不是适配器入参。
  const criteria = criteriaToSearchCriteria({
    keyword: 'Java',
    city: '深圳',
    businessCategory: '33',
    posInfo: '323',
  })
  const body = buildWaiqiRequestBody(criteria, DEFAULT_WAIQI_CONFIG.cityCodes, 1)
  assert.equal(body['businessCategoryIdList'], '33', '行业要落在 platform 命名空间，再由适配器翻成 businessCategoryIdList')
  assert.equal(body['posIds'], '323', '职能同理 → posIds')
  // 平台**不认**这两个键名：它们出现在请求体里，就说明又走了 extra 的兜底透传
  assert.equal(body['businessCategory'], undefined, 'businessCategory 不是平台参数名，不该出现在请求体里')
  assert.equal(body['posInfo'], undefined, 'posInfo 不是平台参数名，不该出现在请求体里')
})
