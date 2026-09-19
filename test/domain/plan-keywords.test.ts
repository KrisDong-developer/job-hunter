import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createFiftyOneAdapter, DEFAULT_FIFTYONE_CONFIG } from '../../src/host/platform/adapters/fiftyone-job.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { keywordsOfPlan } from '../../src/host/store/repo/plans.js'
import { DomainError } from '../../src/host/util/errors.js'
import { PLAN_KEYWORDS_MAX } from '../../src/shared/config/crawl.js'
import type { PlanDto } from '../../src/shared/contract/dto/plan.js'
import { cleanup, fixedClock, openTestStore } from '../support/store.js'

/**
 * 多关键词（逐个采集）的数据与校验链。
 *
 * 设计要点见 PlanDto.keywords 的注释：方案级字段、调度层展开、适配器零改动。
 * 这里钉住四件事：收敛（trim/去重）、单一事实源（剔除 criteria.keyword）、
 * 上限显式报错、查重口径按**生效关键词**比较（新老形态等价）。
 */

function service() {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter({ config: DEFAULT_FIFTYONE_CONFIG }))
  const clock = fixedClock()
  const plans = createPlanService(store, clock, registry)
  return {
    plans,
    close: (): void => {
      const dir = store.dataDir
      store.close()
      cleanup(dir)
    },
  }
}

test('keywords：落库读回，读取侧收敛（trim / 丢空 / 去重保序）', () => {
  const h = service()
  try {
    const plan = h.plans.create({
      name: '多关键词',
      platforms: ['51job'],
      keywords: ['  Java ', '', 'Java', 'Go', 'Go'],
    })
    assert.deepEqual(plan.keywords, ['Java', 'Go'])
    assert.deepEqual(h.plans.get(plan.id).keywords, ['Java', 'Go'], '读回也要过一遍收敛')
  } finally {
    h.close()
  }
})

test('keywords 非空 → criteria.keyword 被剔除（单一事实源）', () => {
  const h = service()
  try {
    const plan = h.plans.create({
      name: '两处都写',
      platforms: ['51job'],
      keywords: ['Java'],
      // 客户端不会这么发，但模型工具/HTTP 可能 —— 校验层必须替它收拾
      criteria: { keyword: 'Go', city: '深圳' },
    })
    assert.equal(plan.criteria['keyword'], undefined, 'keywords 在场时 criteria.keyword 不允许存在')
    assert.equal(plan.criteria['city'], '深圳', '其它条件不受影响')
    assert.deepEqual(plan.keywords, ['Java'])
  } finally {
    h.close()
  }
})

test('keywords 为空 → criteria.keyword 原样保留（老形态不受影响）', () => {
  const h = service()
  try {
    const plan = h.plans.create({
      name: '老形态',
      platforms: ['51job'],
      keywords: [],
      criteria: { keyword: 'Java' },
    })
    assert.deepEqual(plan.keywords, [])
    assert.equal(plan.criteria['keyword'], 'Java')
    // 展开等价：老形态也是单元素
    assert.deepEqual(keywordsOfPlan(plan), ['Java'])
  } finally {
    h.close()
  }
})

test(`超过 ${String(PLAN_KEYWORDS_MAX)} 个 → 显式报错（不静默截断）`, () => {
  const h = service()
  try {
    const tooMany = Array.from({ length: PLAN_KEYWORDS_MAX + 1 }, (_, i) => `k${String(i)}`)
    assert.throws(
      () =>
        h.plans.create({
          name: '超限',
          platforms: ['51job'],
          keywords: tooMany,
        }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
  } finally {
    h.close()
  }
})

test('查重：老形态 keyword=Java 与新形态 keywords=[Java] 判定为重复（执行等价）', () => {
  const h = service()
  try {
    h.plans.create({ name: '老', platforms: ['51job'], criteria: { keyword: 'Java', city: '深圳' } })
    // 不写库，只校验：与已有方案"同样的平台 + 同样的生效关键词 + 同样的其它条件"
    const verdict = h.plans.validate({
      name: '新',
      platforms: ['51job'],
      keywords: ['Java'],
      criteria: { city: '深圳' },
    })
    assert.equal(verdict.duplicates.length, 1, '新老形态执行等价，应当提示重复')
    // 反例：关键词不同 → 不是重复
    const different = h.plans.validate({
      name: '新2',
      platforms: ['51job'],
      keywords: ['Go'],
      criteria: { city: '深圳' },
    })
    assert.equal(different.duplicates.length, 0)
  } finally {
    h.close()
  }
})

test('keywordsOfPlan：什么都没有 → 一趟不带关键词（恒非空）', () => {
  const plan = { keywords: [], criteria: {} } as unknown as Pick<PlanDto, 'keywords' | 'criteria'>
  assert.deepEqual(keywordsOfPlan(plan), [''], "空方案也要跑一趟 —— 用 '' 表达'不带关键词'")
})
