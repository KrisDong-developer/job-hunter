import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyDedup,
  dedupCandidateOf,
  shouldMerge,
  type DedupCandidate,
  type DedupDeps,
} from '../../src/host/domain/dedupe.js'
import type { JobDto } from '../../src/shared/contract/dto/job.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * SR-44 的 `dedup` 开关 + §4.10.1 的跨平台去重。
 *
 * 这一层的价值全在**保守**上：宁可保留两个岗位，也不要把两个真岗位合成一个 ——
 * 合并之后投递记录会串在一起，而且用户很难发现。
 */

function candidate(over: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    id: 1,
    platformId: '51job',
    // 候选是按公司取的，所以候选里带着 companyId；单测里只关心"有没有公司名"，
    // 公司实体 id 用 null（它只在**取候选**时用到，判断本身不看它）
    companyId: null,
    companyName: '字节跳动',
    title: 'Java 开发工程师',
    salaryMin: 20000,
    salaryMax: 30000,
    city: '深圳',
    ...over,
  }
}

test('同平台内不合并（幂等已由平台内唯一键保证）', () => {
  const verdict = shouldMerge(candidate({ id: 1 }), candidate({ id: 2 }))
  assert.equal(verdict.merge, false)
  assert.ok(verdict.basis.includes('同平台'))
})

test('跨平台 + 同公司同城同薪资档 + 标题相似 → 合并', () => {
  const verdict = shouldMerge(
    candidate({ id: 1, platformId: '51job', title: 'Java开发工程师' }),
    candidate({ id: 2, platformId: 'other', title: 'Java 开发工程师' }),
  )
  assert.equal(verdict.merge, true)
  assert.ok(verdict.basis.includes('同公司'))
})

test('城市或薪资档不同就不合并 —— 那是两个真岗位', () => {
  const cityDiff = shouldMerge(candidate({ id: 1 }), candidate({ id: 2, platformId: 'other', city: '北京' }))
  assert.equal(cityDiff.merge, false)
  assert.ok(cityDiff.basis.includes('城市'))

  const salaryDiff = shouldMerge(
    candidate({ id: 1, salaryMin: 20000, salaryMax: 30000 }),
    candidate({ id: 2, platformId: 'other', salaryMin: 60000, salaryMax: 80000 }),
  )
  assert.equal(salaryDiff.merge, false)
  assert.ok(salaryDiff.basis.includes('薪资档'))
})

test('标题差太多就不合并 —— 相似度只作**确认**，不作主要依据', () => {
  const verdict = shouldMerge(
    candidate({ id: 1, title: 'Java 开发工程师' }),
    candidate({ id: 2, platformId: 'other', title: '市场总监' }),
  )
  assert.equal(verdict.merge, false)
})

test('公司名归一化后一致即可（「北京字节跳动科技有限公司」≡「字节跳动」）', () => {
  const verdict = shouldMerge(
    candidate({ id: 1, companyName: '字节跳动', title: 'Java 开发' }),
    candidate({ id: 2, platformId: 'other', companyName: '北京字节跳动科技有限公司', title: 'Java 开发' }),
  )
  assert.equal(verdict.merge, true, '归一化 + 包含关系应当命中')
})

test('公司名为空的岗位不参与去重（判不出来就不判）', () => {
  const job = { id: 1, companyName: null, platformId: '51job', title: 'X', salaryMin: null, salaryMax: null, city: '深圳' } as JobDto
  assert.equal(dedupCandidateOf(job), undefined)
})

/** 去重组仓储的替身：默认"从不命中"，需要时用 overrides 断言它被怎么调用。 */
function stubGroup(overrides: Record<string, unknown> = {}): DedupDeps['dedupGroup'] {
  return {
    findByJob: () => undefined,
    create: () => 1,
    addMember: () => undefined,
    ...overrides,
  } as unknown as DedupDeps['dedupGroup']
}

// ── R25 的出口：拿不准的必须被看见（批次 4）────────────────────────────

test('applyDedup：没有可合并的、但有"疑似" → 不合并，但如实报出 candidate 与对象', () => {
  const doubtful = candidate({ id: 2, platformId: 'liepin', title: 'Java开发工程师岗位' })
  const outcome = applyDedup(
    {
      dedupGroup: stubGroup({
        create: () => {
          throw new Error('拿不准时不该建组')
        },
      }),
      candidatesFor: () => [doubtful],
    },
    candidate({ id: 1, platformId: '51job', title: 'Java开发工程师' }),
    '2026-09-16T01:00:00.000Z',
  )
  assert.equal(outcome.groupId, null, '拿不准就不合并（宁可漏、不可错）')
  assert.equal(outcome.candidate, true, '但"没合并"这件事本身必须能被看见')
  assert.equal(outcome.withJobId, 2, '要指出它**疑似**与谁重复，否则用户没法确认')
  assert.ok(outcome.basis.includes('人工确认'))
})

test('applyDedup：既能合并又有疑似时 → **合并优先**（疑似只是兜底出口）', () => {
  const doubtful = candidate({ id: 3, platformId: 'zhipin', title: 'Java开发工程师岗位' })
  const mergeable = candidate({ id: 2, platformId: 'liepin', title: 'Java 开发工程师' })
  const created: { memberIds: number[] }[] = []
  const outcome = applyDedup(
    {
      dedupGroup: stubGroup({
        create: (input: { memberIds: number[] }) => {
          created.push(input)
          return 7
        },
      }),
      candidatesFor: () => [doubtful, mergeable],
    },
    candidate({ id: 1, platformId: '51job', title: 'Java开发工程师' }),
    '2026-09-16T01:00:00.000Z',
  )
  assert.equal(outcome.candidate, false, '能合上就不是"疑似"')
  assert.equal(outcome.groupId, 7)
  assert.deepEqual(created[0]?.memberIds, [2, 1])
})

test('applyDedup：命中就建组，并把两个岗位都挂上组', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const companyId = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, now).id
    const a = store.job.upsert(
      {
        platformId: '51job',
        platformJobId: 'a',
        title: 'Java 开发工程师',
        companyId,
        salaryRaw: '2-3万',
        salaryMin: 20000,
        salaryMax: 30000,
        salaryMonths: null,
        city: '深圳',
        district: '',
        expReq: '',
        eduReq: '',
        tags: [],
        sourceUrl: 'https://a',
        publishedAt: null,
      },
      now,
    )
    const b = store.job.upsert(
      {
        platformId: 'other',
        platformJobId: 'b',
        title: 'Java开发工程师',
        companyId,
        salaryRaw: '2-3万',
        salaryMin: 20000,
        salaryMax: 30000,
        salaryMonths: null,
        city: '深圳',
        district: '',
        expReq: '',
        eduReq: '',
        tags: [],
        sourceUrl: 'https://b',
        publishedAt: null,
      },
      now,
    )

    const self = dedupCandidateOf(store.job.detail(b.id) as JobDto)
    assert.ok(self !== undefined)
    const others = [dedupCandidateOf(store.job.detail(a.id) as JobDto)].filter(
      (item): item is DedupCandidate => item !== undefined,
    )

    const outcome = applyDedup(
      { dedupGroup: store.dedupGroup, candidatesFor: () => others },
      self,
      now,
    )
    assert.ok(outcome.groupId !== null, '应当建组')
    assert.equal(outcome.withJobId, a.id)

    const group = store.dedupGroup.get(outcome.groupId)
    assert.deepEqual(group?.memberIds, [a.id, b.id].sort((x, y) => x - y))
    assert.ok((group?.basis ?? '').includes('同公司'), '依据要落库，不能只留一个分数')
    assert.ok(store.dedupGroup.findByJob(b.id) !== undefined, '成员要能反查到组')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('applyDedup：已有组就加入，不重复建组（可逆：成员是显式 id 列表）', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    // dedup_group.primary_job_id 有指向 job 的外键 —— 分组必须挂在**真实的**岗位上，
    // 所以这里先造三条岗（这也顺带证明"不确定不合并"不会被随意触发）
    const ids = ['x', 'y', 'z'].map(
      (key) =>
        store.job.upsert(
          {
            platformId: key === 'y' ? 'other' : '51job',
            platformJobId: key,
            title: 'Java 开发工程师',
            companyId: null,
            salaryRaw: '2-3万',
            salaryMin: 20000,
            salaryMax: 30000,
            salaryMonths: null,
            city: '深圳',
            district: '',
            expReq: '',
            eduReq: '',
            tags: [],
            sourceUrl: `https://${key}`,
            publishedAt: null,
          },
          now,
        ).id,
    )
    const [x, y, z] = ids as [number, number, number]

    const first = store.dedupGroup.create({ primaryJobId: x, memberIds: [x, y], basis: '测试', score: 1 }, now)
    const outcome = applyDedup(
      {
        dedupGroup: store.dedupGroup,
        candidatesFor: () => [candidate({ id: y, platformId: 'other' })],
      },
      candidate({ id: z }),
      now,
    )
    assert.equal(outcome.groupId, first)
    assert.equal(store.dedupGroup.count(), 1, '不该多出一个组')
    assert.deepEqual(store.dedupGroup.get(first)?.memberIds, [x, y, z])
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('applyDedup：找不到候选时如实返回"没找到"，而不是假装成功', () => {
  const store = openTestStore()
  try {
    const outcome = applyDedup(
      { dedupGroup: store.dedupGroup, candidatesFor: () => [] },
      candidate({ id: 9 }),
      '2026-09-16T01:00:00.000Z',
    )
    assert.equal(outcome.groupId, null)
    assert.equal(outcome.withJobId, null)
    assert.ok(outcome.basis.includes('没有找到'))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
