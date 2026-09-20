import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import { createGuopinAdapter } from '../../src/host/platform/adapters/guopin/index.js'
import { createHiredChinaAdapter } from '../../src/host/platform/adapters/hiredchina/index.js'
import { createIndeedAdapter } from '../../src/host/platform/adapters/indeed/index.js'
import { createLagouAdapter } from '../../src/host/platform/adapters/lagou/index.js'
import { createLiepinAdapter } from '../../src/host/platform/adapters/liepin/index.js'
import { createWaiqiAdapter } from '../../src/host/platform/adapters/waiqi-job/index.js'
import { createZhaopinAdapter } from '../../src/host/platform/adapters/zhaopin/index.js'
import { createZhipinAdapter } from '../../src/host/platform/adapters/zhipin/index.js'
import {
  CITY_DIRECTORY,
  canonicalCityOf,
  citySupportOf,
  orderCities,
} from '../../src/host/platform/cities.js'
import type { SiteAdapter } from '../../src/host/platform/types.js'

/**
 * 跨平台城市目录（批次 3）。
 *
 * 三条要守住的东西：
 *   1. **规范名与归一化只此一份** —— 与去重共用 `normalizeCityForDedupe`；
 *   2. **闭不闭必须显式声明** —— 从 `values` 空不空推理会在两个方向上都错
 *      （空表 + 拒绝 = guopin/hiredchina；非空表 + 自由文本 = lagou）；
 *   3. **目录不许与平台码表脱节** —— 城市级码表里的城市必须都在目录里。
 */

test('城市目录：没有重复项（重复会让 orderCities 的顺序变得不可预期）', () => {
  assert.equal(new Set(CITY_DIRECTORY).size, CITY_DIRECTORY.length)
  assert.ok(CITY_DIRECTORY.length >= 40, `目录太小了（${String(CITY_DIRECTORY.length)}），城市级码表放不下`)
})

test('城市目录：归一化与去重共用同一套规则（「深圳市·福田」都指向深圳）', () => {
  // 与 `normalizeCityForDedupe` 一致：去「市」、按分隔符取第一段
  assert.equal(canonicalCityOf('深圳'), '深圳')
  assert.equal(canonicalCityOf('深圳市'), '深圳')
  assert.equal(canonicalCityOf('深圳·福田'), '深圳')
  assert.equal(canonicalCityOf('深圳-南山'), '深圳')
  assert.equal(canonicalCityOf('  杭州  '), '杭州')
  // **不猜**：目录外的城市如实返回 null，不硬套一个"最近的城市"
  // （2026-09-19 目录扩容后，「拉萨」已经进目录了 —— 所以这里改用**县级市**当例子：
  //  目录收的是平台码表里的地级市，义乌/昆山这类县级市不在其中。）
  assert.equal(canonicalCityOf('义乌'), null)
  assert.equal(canonicalCityOf(''), null)
  assert.equal(canonicalCityOf('   '), null)
})

test('城市目录：排序按目录顺序，目录外的排在最后且保持传入顺序', () => {
  assert.deepEqual(orderCities(['杭州', '北京', '深圳']), ['北京', '深圳', '杭州'])
  assert.deepEqual(
    orderCities(['义乌', '深圳', '昆山']),
    ['深圳', '义乌', '昆山'],
    '目录外的值只排在最后，顺序不被重排（否则每次渲染都在跳）',
  )
  assert.deepEqual(orderCities(['深圳', '深圳']), ['深圳'], '去重')
})

test('城市支持度：闭不闭是**声明**出来的，不是从 values 空不空推出来的', () => {
  const fiftyone = createFiftyOneAdapter()
  const guopin = createGuopinAdapter()
  const hiredchina = createHiredChinaAdapter()
  const lagou = createLagouAdapter()
  const indeed = createIndeedAdapter()

  // 有码表：表里就是能用、表外一定不能
  assert.equal(citySupportOf(fiftyone, '深圳'), 'supported')
  assert.equal(citySupportOf(fiftyone, '拉萨'), 'unsupported')

  // **空表 + 拒绝**：这两个平台带城市会直接失败。以前被当成"自由文本"跳过，
  // 于是用户在保存前看到的是零提示。
  assert.equal(citySupportOf(guopin, '深圳'), 'unsupported', 'guopin 城市表为空 = 一律拒绝')
  assert.equal(citySupportOf(hiredchina, '深圳'), 'unsupported', 'hiredchina 同上')

  // **非空表 + 自由文本**：表里的 20 个只是建议，填别的城市照样能跑
  assert.equal(citySupportOf(lagou, '深圳'), 'free-text')
  assert.equal(
    citySupportOf(lagou, '珠海'),
    'free-text',
    '不在建议列表里也不该被当成"它不认识" —— 拉勾原样收中文城市名',
  )
  assert.equal(citySupportOf(indeed, '珠海'), 'free-text')
})

test('城市目录：城市级码表里的城市必须都在目录里（脱节了要在这里失败）', () => {
  // 只挑**城市级**码表：sinojobs 是省级码、lagou/indeed 是自由文本，
  // 它们都不该被当成"城市集合"。伪城市（全国 = 不带城市参数）单独排除。
  // ⚠️ `liepin` 2026-09-19 起**进这一组**了 —— 它过去只有「全国」，所以被排除在外；
  //    现在它的 cityCodes 是逐省实测出来的 370 个市，这条检查正是它的守卫。
  const pseudo = new Set(['全国'])
  const cityLevel: Array<[string, SiteAdapter]> = [
    ['51job', createFiftyOneAdapter()],
    ['zhipin', createZhipinAdapter()],
    ['zhaopin', createZhaopinAdapter()],
    ['waiqi', createWaiqiAdapter()],
    ['liepin', createLiepinAdapter()],
  ]
  const known = new Set(CITY_DIRECTORY)
  for (const [platformId, adapter] of cityLevel) {
    const values =
      adapter.criteriaDimensions.find((item) => item.key === 'city')?.values.map((item) => item.value) ??
      []
    assert.ok(values.length > 0, `${platformId} 应当声明城市取值域`)
    for (const city of values) {
      if (pseudo.has(city)) continue
      assert.ok(
        known.has(city),
        `${platformId} 的码表里有「${city}」，但城市目录里没有 —— 把它加进 CITY_DIRECTORY`,
      )
    }
  }
})
