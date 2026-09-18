import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupDepsOf, sweepDedup } from '../../src/host/domain/dedupe-sweep.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 全库去重复核（批次 4）。
 *
 * 这一层的价值有两条，都要钉住：
 *   1. **补做**：库里的重复不靠"再抓一轮"才被合并（那轮可能一条新岗位都没有）；
 *   2. **同一份判断**：复核与抓取后处理共用 `applyDedup` + `dedupDepsOf` ——
 *      门槛一条都不放松（跨平台 / 同公司同城 / 薪资只在两边都锚定时才比 / 标题 ≥0.9）。
 */

const NOW = '2026-09-16T01:00:00.000Z'

interface JobSpec {
  platformId: string
  platformJobId: string
  title: string
  companyId: number | null
  city?: string
  salaryMin?: number | null
  salaryMax?: number | null
}

function seed(store: ReturnType<typeof openTestStore>, spec: JobSpec): number {
  return store.job.upsert(
    {
      platformId: spec.platformId,
      platformJobId: spec.platformJobId,
      title: spec.title,
      companyId: spec.companyId,
      salaryRaw: spec.salaryMin === null ? '面议' : '2-3万',
      salaryMin: spec.salaryMin ?? null,
      salaryMax: spec.salaryMax ?? null,
      salaryMonths: null,
      city: spec.city ?? '深圳',
      district: '',
      expReq: '',
      eduReq: '',
      tags: [],
      sourceUrl: `https://${spec.platformId}/${spec.platformJobId}`,
      publishedAt: null,
    },
    NOW,
  ).id
}

test('全库复核：把库里**早就存在**的跨平台重复合并成一组', () => {
  const store = openTestStore()
  try {
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    const a = seed(store, {
      platformId: '51job',
      platformJobId: 'a',
      title: 'Java 开发工程师',
      companyId,
      salaryMin: 20000,
      salaryMax: 30000,
    })
    const b = seed(store, {
      platformId: 'zhipin',
      platformJobId: 'b',
      title: 'Java开发工程师',
      companyId,
      salaryMin: 20000,
      salaryMax: 30000,
    })

    // 复核之前：两条各自独立（这就是"抓取时还没开去重开关"留下的状态）
    assert.equal(store.job.detail(a)?.dedupGroupId, null)
    assert.equal(store.job.detail(b)?.dedupGroupId, null)

    const result = sweepDedup(store, NOW)
    // `merged` 数的是"这一轮进了分组的岗位数"：新建组的两条**都算**（它们确实都被合并了）
    assert.equal(result.merged, 2, `两条应当被合并成一组：${JSON.stringify(result)}`)
    assert.equal(result.newGroups, 1)
    assert.equal(result.groups, 1)
    assert.equal(result.candidates, 0)

    // 两条都挂上同一组 —— 只写 dedup_group 表而没更新 job.dedup_group_id 的话，
    // 列表的"按组折叠"（读的正是 job.dedup_group_id）就不会生效
    const groupId = store.job.detail(a)?.dedupGroupId
    assert.ok(groupId !== null && groupId !== undefined, 'job.dedup_group_id 必须被写上')
    assert.equal(store.job.detail(b)?.dedupGroupId, groupId)
    assert.deepEqual(store.dedupGroup.get(groupId)?.memberIds, [a, b].sort((x, y) => x - y))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('全库复核：已经在分组里的岗位不再重复处理（重复跑是幂等的）', () => {
  const store = openTestStore()
  try {
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    seed(store, { platformId: '51job', platformJobId: 'a', title: 'Java 开发工程师', companyId, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: 'zhipin', platformJobId: 'b', title: 'Java开发工程师', companyId, salaryMin: 20000, salaryMax: 30000 })

    const first = sweepDedup(store, NOW)
    assert.equal(first.merged, 2)

    const second = sweepDedup(store, NOW)
    assert.equal(second.merged, 0, '第二次不该再合并一次')
    assert.equal(second.newGroups, 0)
    assert.equal(second.skippedGrouped, 2, '两条都已在组里 → 都被跳过')
    assert.equal(second.groups, 1, '组数不变')
    assert.equal(store.dedupGroup.get(1)?.memberIds.length, 2, '成员没被重复加进去')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('全库复核：**保守**一条都不放松 —— 公司不同 / 城市不同 / 薪资档冲突都不合并', () => {
  const store = openTestStore()
  try {
    const byteDance = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    const tencent = store.company.ensure({ name: '腾讯', nameNorm: '腾讯' }, NOW).id
    seed(store, { platformId: '51job', platformJobId: 'a', title: 'Java 开发工程师', companyId: byteDance, salaryMin: 20000, salaryMax: 30000 })
    // 同城同薪资档、标题几乎一样，但**公司不同**
    seed(store, { platformId: 'zhipin', platformJobId: 'b', title: 'Java开发工程师', companyId: tencent, salaryMin: 20000, salaryMax: 30000 })
    // 同公司同标题、但**城市不同**
    seed(store, { platformId: 'liepin', platformJobId: 'c', title: 'Java开发工程师', companyId: byteDance, city: '北京', salaryMin: 20000, salaryMax: 30000 })

    const result = sweepDedup(store, NOW)
    assert.equal(result.merged, 0, '这三条一条都不该合并 —— 宁可漏，不可错')
    assert.equal(result.groups, 0)
    assert.equal(result.candidates, 0, '连"疑似"都算不上（硬键就没过）')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('全库复核：标题差一点的算**疑似**，不合并但计入 candidates', () => {
  const store = openTestStore()
  try {
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    seed(store, { platformId: '51job', platformJobId: 'a', title: 'Java 开发工程师', companyId, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: 'zhipin', platformJobId: 'b', title: 'Java开发工程师岗位', companyId, salaryMin: 20000, salaryMax: 30000 })

    const result = sweepDedup(store, NOW)
    assert.equal(result.merged, 0, '拿不准就不合并')
    // 两个方向各算一次（A 看 B、B 看 A）—— 计数是"**发现了几次**疑似"，
    // 不是"有几对"：一轮里同一对会被两个岗位各看到一次
    assert.equal(result.candidates, 2, '但"没合并"必须被看见 —— 否则用户不知道少了几个合并')
    assert.equal(result.groups, 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('全库复核：没有公司名的岗位不参与（无法判断 ≠ 不同）', () => {
  const store = openTestStore()
  try {
    seed(store, { platformId: '51job', platformJobId: 'a', title: 'Java 开发工程师', companyId: null, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: 'zhipin', platformJobId: 'b', title: 'Java 开发工程师', companyId: null, salaryMin: 20000, salaryMax: 30000 })

    const result = sweepDedup(store, NOW)
    assert.equal(result.scanned, 0, '没有公司名就没有可比的东西，不该空跑判定')
    assert.equal(result.merged, 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('全库复核：分页取岗位时不漏（pageSize 小于总条数）', () => {
  const store = openTestStore()
  try {
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    // 三组重复，每组两条：pageSize=2 时要跨页才能看全
    for (const [index, title] of ['Java 开发工程师', 'Go 后端工程师', '前端工程师'].entries()) {
      seed(store, { platformId: '51job', platformJobId: `a${String(index)}`, title, companyId, salaryMin: 20000, salaryMax: 30000 })
      seed(store, { platformId: 'zhipin', platformJobId: `b${String(index)}`, title: title.replace(' ', ''), companyId, salaryMin: 20000, salaryMax: 30000 })
    }

    const result = sweepDedup(store, NOW, { pageSize: 2 })
    assert.equal(result.groups, 3, `三组都该被合上 —— 分页漏一条就会少一组：${JSON.stringify(result)}`)
    assert.equal(result.merged, 6)
    assert.equal(store.dedupGroup.count(), 3)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('dedupDepsOf：候选是**同一家公司**的其它岗位，且只取跨平台的', () => {
  const store = openTestStore()
  try {
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, NOW).id
    const other = store.company.ensure({ name: '腾讯', nameNorm: '腾讯' }, NOW).id
    seed(store, { platformId: '51job', platformJobId: 'a', title: 'Java 开发工程师', companyId, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: 'zhipin', platformJobId: 'b', title: 'Java 开发工程师', companyId, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: '51job', platformJobId: 'c', title: 'Java 开发工程师', companyId: other, salaryMin: 20000, salaryMax: 30000 })
    seed(store, { platformId: '51job', platformJobId: 'd', title: 'Go 后端工程师', companyId, salaryMin: 20000, salaryMax: 30000 })

    const deps = dedupDepsOf(store)
    const self = deps.candidatesFor({ id: 1, platformId: '51job', companyId, companyName: '字节跳动', title: 'Java 开发工程师', salaryMin: 20000, salaryMax: 30000, city: '深圳' })
    assert.deepEqual(
      self.map((item) => item.platformId),
      ['zhipin'],
      '同公司的岗位里：同平台的（幂等已保证）、别家公司的都不进来',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
