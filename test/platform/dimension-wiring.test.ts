/**
 * **声明 ↔ 真实请求的对账**（"选了但没生效"这一类 bug 的机制化守卫）。
 *
 * 背景：适配器在 `criteriaDimensions` 里声明"我支持哪些筛选维度"，界面据它渲染、
 * 校验据它放行；而真正把值送出去的是 `urls.ts` / 请求体构造。这两件事以前是
 * **两份手写的东西**，中间还隔着宿主的命名空间转换 —— 漂移了没有任何东西会响：
 *
 *   * 神仙外企声明了「行业 / 职能」，构造端写的是 `businessCategoryIdList` / `posIds`，
 *     而键名没登记进宿主那张白名单 → 值落进 `extra`，适配器读 `platform` 读到空，
 *     最后还被当参数名透传出去。适配器自己的单测看不出来，因为它**手工构造**
 *     `{ platform: { posInfo: … } }`，绕过了生产路径上那次转换。
 *
 * 现在每个维度声明必须写出 `wire`（落到哪个请求的哪个参数上，或"不进请求"），
 * 而这份测试拿**真实请求**逐条对账。它是这一层唯一不会说谎的东西。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADAPTER_SPECS } from '../../src/host/runtime/adapters.js'
import { criteriaToSearchCriteria } from '../../src/host/domain/plan-config.js'
import { previewOf } from '../../src/host/platform/preview.js'
import type { CriteriaRequestPreview, SiteAdapter } from '../../src/host/platform/types.js'

/** 走注册表真实的构造路径（配置取代码默认，不碰 DB）。 */
function allAdapters(): SiteAdapter[] {
  return ADAPTER_SPECS.map((spec) => spec.build(undefined, [0, 0]))
}

/** 请求指纹：URL + 方法 + 参数 + body —— 任何一处变了就算"这个维度生效了"。 */
function fingerprintOf(preview: CriteriaRequestPreview | null): string {
  return preview === null
    ? '（构造不出请求）'
    : `${preview.method} ${preview.url} ${JSON.stringify(preview.params)} ${preview.body ?? ''}`
}

/** 探针值：优先用声明里的第一个取值（保证合法），自由文本用 '1'。 */
function probesOf(dimension: { values: Array<{ value: string }> }): string[] {
  return dimension.values.length > 0 ? dimension.values.map((item) => item.value) : ['1']
}

test('声明了 wire 的维度必须真的改变请求 —— 否则"声明在说谎"', () => {
  for (const adapter of allAdapters()) {
    const baselinePreview = previewOf(adapter, criteriaToSearchCriteria({}))
    const baseline = fingerprintOf(baselinePreview)
    const baselineParams = baselinePreview?.params ?? {}
    for (const dimension of adapter.criteriaDimensions) {
      const wire = dimension.wire
      if (wire === undefined) continue

      /**
       * 「缺省即选中」的单取值维度：适配器把缺省排序之类直接写进基线
       * （zhaopin 2026-09-23 起默认 `order=4`），探针值与基线相同是**设计使然** ——
       * 选它本来就该是"无变化"。它是否真的到达请求仍由下面的参数名断言守着
       * （参数在基线里就是它在请求里的证据）。
       */
      const isDefaultedSingleValue =
        dimension.values.length === 1 &&
        wire.param !== null &&
        baselineParams[wire.param] === dimension.values[0]?.value

      let changed = false
      const violations: string[] = []
      for (const probe of probesOf(dimension)) {
        const preview = previewOf(adapter, criteriaToSearchCriteria({ [dimension.key]: probe }))
        assert.ok(
          preview !== null,
          `${adapter.id} 的「${dimension.key}」声明了 wire，但带上它之后连请求都构造不出来`,
        )
        const differs = fingerprintOf(preview) !== baseline
        if (differs) changed = true
        /**
         * 声明过参数名的，**改变了请求的那些取值**必须落在那个参数上（名字写错在这里红）。
         *
         * 为什么要加"改变了请求"这个前提：有些取值本身就是**平台默认 / 不限**，
         * 它们的正确编码是"干脆不带这个参数"——猎聘的「全国」就是这样（实测：
         * `city=全国` 对应空码，构造端直接不写 `city`/`dq`）。这种取值没有参数可对，
         * 硬要求它出现在参数表里只会得到一条假失败。
         */
        if (wire.param !== null && differs && preview.params[wire.param] === undefined) {
          violations.push(`${probe} → ${JSON.stringify(preview.params)}`)
        }
      }

      assert.deepEqual(
        violations,
        [],
        `${adapter.id} 的「${dimension.label}」声明落在参数「${String(wire.param)}」，` +
          `但真实请求里没有这个参数名。实际参数：${violations[0] ?? ''}`,
      )
      assert.ok(
        changed || isDefaultedSingleValue,
        `${adapter.id} 的「${dimension.label}」声明了 wire（→ ${String(wire.param)}），` +
          '但**所有合法取值**都不会改变请求 —— 用户选了它，平台上什么都不会发生。' +
          '要么这个维度该删掉声明，要么构造端漏了它。',
      )
    }
  }
})

test('没有 wire 的维度只能是采集深度旋钮或"平台侧没打通" —— 不能是"忘了写"', () => {
  for (const adapter of allAdapters()) {
    for (const dimension of adapter.criteriaDimensions) {
      if (dimension.wire !== undefined) continue
      // 白名单：这两个键是**采集深度**（页数 / 滚动轮数），本来就不进请求。
      if (dimension.key === 'maxPages' || dimension.key === 'scrollRounds') continue
      // 声明为"封闭 + 空值域"= 平台上这个筛选没打通（51job/智联的发布时间、
      // guopin/hiredchina 的城市）：界面不给输入框、校验显式拒绝，没有 wire 是对的。
      const closed = dimension.closed ?? dimension.values.length > 0
      assert.ok(
        closed && dimension.values.length === 0,
        `${adapter.id} 的「${dimension.key}」既没有 wire，也不是采集深度旋钮、` +
          '又不是"封闭且空值域" —— 它多半只是忘了写 wire（那就是"选了没生效"）。',
      )
    }
  }
})

test('采集深度旋钮会被如实列进 crawlOnly（界面要能把"深度"与"筛选"分开说）', () => {
  for (const adapter of allAdapters()) {
    const preview = previewOf(adapter, criteriaToSearchCriteria({}))
    assert.ok(preview !== null, `${adapter.id} 连空条件的请求都构造不出来`)
    for (const key of ['maxPages', 'scrollRounds']) {
      const declared = adapter.criteriaDimensions.some((item) => item.key === key)
      if (!declared) continue
      assert.ok(
        preview.crawlOnly.includes(key),
        `${adapter.id} 声明了 ${key}（采集深度），但它没进 crawlOnly：${preview.crawlOnly.join('、')}`,
      )
    }
  }
})
