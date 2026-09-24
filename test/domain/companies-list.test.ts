import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store } from '../../src/host/store/store.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

/**
 * 公司列表（岗位库「公司维度」的取数底座）。
 *
 * 过滤 / 排序 / 分页都在 repo 的 JS 里做（全量取回再筛，量级依据见
 * repo 文件的注释），所以这里直接测 repo —— 路由层只做参数解析与压平。
 */

const NOW = '2026-09-24T02:00:00.000Z'

/** 给一家公司塞 N 条岗位（岗位数来自画像重算，造完必须刷一次）。 */
function seedJobs(store: Store, companyId: number, jobs: number, options: { cities?: string[]; tags?: string[][]; jd?: string[] } = {}): void {
  for (let index = 0; index < jobs; index += 1) {
    store.job.upsert(
      {
        platformId: 'zhipin',
        platformJobId: `j-${String(companyId)}-${String(index)}`,
        title: `岗位 ${String(index)}`,
        companyId,
        salaryRaw: '20-30K',
        salaryMin: 20,
        salaryMax: 30,
        salaryMonths: null,
        city: options.cities?.[index] ?? '深圳',
        district: '',
        expReq: '',
        eduReq: '',
        tags: options.tags?.[index] ?? [],
        sourceUrl: 'https://example.com',
        publishedAt: null,
        jdText: options.jd?.[index] ?? null,
      },
      NOW,
    )
  }
  store.company.recomputeProfile(companyId, NOW)
}

test('关键词：公司名 / 归一化名 / 别名 / 备注任一命中，且不区分大小写', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const a = store.company.ensure({ name: '华为技术有限公司', nameNorm: '华为' }, NOW)
    store.company.addAlias(a.id, 'HW')
    const b = store.company.ensure({ name: '中软国际', nameNorm: '中软国际' }, NOW)
    store.company.updateReview(b.id, { note: '驻场占比高' }, NOW)
    const c = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW)

    assert.deepEqual(store.company.list({ q: '华为技术' }).items.map((e) => e.company.id), [a.id], '全名命中')
    assert.deepEqual(store.company.list({ q: '华为' }).items.map((e) => e.company.id), [a.id], '归一化名命中')
    assert.deepEqual(store.company.list({ q: 'hw' }).items.map((e) => e.company.id), [a.id], '别名命中且大小写不敏感')
    assert.deepEqual(store.company.list({ q: '驻场' }).items.map((e) => e.company.id), [b.id], '备注命中')
    assert.equal(store.company.list({ q: '不存在' }).total, 0)
    assert.equal(store.company.list({}).total, 3)
    assert.ok(store.company.list({}).items.some((e) => e.company.id === c.id), '没被筛掉的一个不丢')
  } finally {
    cleanup(dir)
  }
})

test('拉黑 / 人工标签过滤，可以叠加', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const a = store.company.ensure({ name: '甲公司', nameNorm: '甲' }, NOW)
    const b = store.company.ensure({ name: '乙公司', nameNorm: '乙' }, NOW)
    const c = store.company.ensure({ name: '丙公司', nameNorm: '丙' }, NOW)
    store.company.updateReview(a.id, { blacklisted: true }, NOW)
    store.company.updateReview(b.id, { blacklisted: true, manualLabel: '外包' }, NOW)
    store.company.updateReview(c.id, { manualLabel: '外包' }, NOW)

    assert.deepEqual(
      store.company.list({ blacklisted: true }).items.map((e) => e.company.name).sort(),
      ['乙公司', '甲公司'],
    )
    assert.deepEqual(store.company.list({ blacklisted: false }).items.map((e) => e.company.name), ['丙公司'])
    assert.deepEqual(
      store.company.list({ manualLabel: '外包' }).items.map((e) => e.company.name).sort(),
      ['丙公司', '乙公司'],
    )
    assert.deepEqual(
      store.company.list({ blacklisted: true, manualLabel: '外包' }).items.map((e) => e.company.name),
      ['乙公司'],
      '两个条件叠加取交集',
    )
  } finally {
    cleanup(dir)
  }
})

test('minJobCount：无画像按 0 算；有画像按重算后的岗位数', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    store.company.ensure({ name: '无岗位公司', nameNorm: '无岗位' }, NOW)
    const { id: many } = store.company.ensure({ name: '多岗位公司', nameNorm: '多岗位' }, NOW)
    seedJobs(store, many, 3)

    assert.equal(store.company.list({ minJobCount: 1 }).total, 1, '无画像的公司被 ≥1 排除')
    assert.equal(store.company.list({ minJobCount: 0 }).total, 2, '≥0 等于不限')
    const got = store.company.list({ minJobCount: 3, orderBy: 'jobCount' })
    assert.deepEqual(got.items.map((e) => e.company.id), [many])
    assert.equal(got.items[0]?.profile?.jobCount, 3, '岗位数来自画像重算')
  } finally {
    cleanup(dir)
  }
})

test('排序：外包分 / 风险分 / 名称（升降序）；缺省仍是岗位数降序', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const a = store.company.ensure({ name: '甲外包', nameNorm: '甲' }, NOW)
    const b = store.company.ensure({ name: '乙风险', nameNorm: '乙' }, NOW)
    store.company.ensure({ name: '丙普通', nameNorm: '丙' }, NOW)
    store.company.updateScores(a.id, { nameKeywordHits: 3, outsourcingScore: 78, fraudScore: 10 }, NOW)
    store.company.updateScores(b.id, { nameKeywordHits: 1, outsourcingScore: 20, fraudScore: 72 }, NOW)

    assert.deepEqual(
      store.company.list({ orderBy: 'outsourcingScore' }).items.map((e) => e.company.name),
      ['甲外包', '乙风险', '丙普通'],
      '外包分降序；无分数按 0 排在后面',
    )
    assert.deepEqual(
      store.company.list({ orderBy: 'fraudScore' }).items.map((e) => e.company.name),
      ['乙风险', '甲外包', '丙普通'],
    )
    assert.deepEqual(
      store.company.list({ orderBy: 'name', descending: false }).items.map((e) => e.company.name),
      ['丙普通', '甲外包', '乙风险'],
      '名称升序（zh 拼音序：bǐng 丙 < jiǎ 甲 < yǐ 乙）',
    )
    assert.deepEqual(
      store.company.list({ orderBy: 'name', descending: false }).items.reverse().map((e) => e.company.name),
      store.company.list({ orderBy: 'name' }).items.map((e) => e.company.name),
      '名称降序 = 升序的倒序',
    )
  } finally {
    cleanup(dir)
  }
})

test('分页：offset/limit 切页，total 是过滤后的总数；缺省排序 = 岗位数降序', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    for (let index = 0; index < 5; index += 1) {
      const { id } = store.company.ensure({ name: `公司${String(index)}`, nameNorm: `c${String(index)}` }, NOW)
      seedJobs(store, id, index)
    }
    const page1 = store.company.list({ limit: 2, offset: 0 })
    assert.equal(page1.total, 5)
    assert.equal(page1.items.length, 2)
    assert.deepEqual(
      page1.items.map((e) => e.profile?.jobCount),
      [4, 3],
      '缺省排序 = 岗位数降序',
    )
    assert.deepEqual(
      store.company.list({ limit: 2, offset: 2 }).items.map((e) => e.profile?.jobCount),
      [2, 1],
    )
    assert.equal(store.company.list({ limit: 2, offset: 4 }).items.length, 1, '末页不满页')
  } finally {
    cleanup(dir)
  }
})

test('列表 profile 是完整的（stackDiversity / geoSpread / onsiteRatio 不再是占位值）', () => {
  const dir = tempDataDir()
  try {
    const store = openTestStore(dir)
    const { id } = store.company.ensure({ name: '画像公司', nameNorm: '画像' }, NOW)
    seedJobs(store, id, 3, {
      cities: ['深圳', '深圳', '杭州'],
      tags: [['java'], ['go'], ['go']],
      jd: ['本岗位需驻场开发', '常规开发', '常规开发'],
    })
    const entry = store.company.list({}).items.find((e) => e.company.id === id)
    assert.ok(entry?.profile !== null && entry?.profile !== undefined, '列表查询带出了完整画像')
    assert.equal(entry.profile.jobCount, 3)
    assert.equal(entry.profile.stackDiversity, 2, 'java + go 两个方向')
    assert.equal(entry.profile.geoSpread, 2, '深圳 + 杭州')
    assert.equal(entry.profile.onsiteRatio, 1 / 3, '3 条里 1 条提到驻场')
  } finally {
    cleanup(dir)
  }
})
