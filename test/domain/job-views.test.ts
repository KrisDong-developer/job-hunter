import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_SAVED_JOB_VIEWS } from '../../src/shared/config/limits.js'
import {
  assertJobViews,
  jobViewsOf,
  readJobViews,
  saveJobViews,
} from '../../src/host/domain/job-views.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 保存的筛选视图（第五轮，批次 B2）。
 *
 * 这个模块的纪律是**读到宽容、写到严格**：

 *   * 读：库里的旧数据可能带着"当年合法、今天不合法"的字段（枚举被删/改名），
 *     逐条规范化、坏条目丢弃，绝不能让一个过期的视图把整个岗位库打不开；
 *   * 写：来自我们自己的界面，出现非法值意味着界面有 bug 或被手搓了请求，
 *     必须显式报错并指名字段，不能静默修正。
 */

const NOW = '2026-09-20T02:00:00.000Z'

function view(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'view-1',
    name: '深圳 Java',
    filters: {
      q: 'Java',
      cities: ['深圳'],
      expBuckets: ['3-5年'],
      eduReqs: ['本科'],
      state: 'new',
      minSalary: '20000',
      minScore: '60',
      excludeFlags: ['outsourcing'],
      excludeBlacklisted: true,
      groupDuplicates: false,
      newWindow: '3d',
      orderBy: 'match_score',
      descending: true,
    },
    ...overrides,
  }
}

test('写入（严格）：合法的一份原样通过，且规范化掉多余空白与重复项', () => {
  const views = assertJobViews({
    views: [
      {
        id: 'v1',
        name: '  深圳 Java  ',
        filters: { ...view().filters as object, cities: ['深圳', '深圳', ' 杭州 '] },
      },
    ],
  })
  assert.equal(views.length, 1)
  assert.equal(views[0]?.name, '深圳 Java', '名字去掉首尾空白')
  assert.deepEqual(views[0]?.filters.cities, ['深圳', '杭州'], '多选项去重、去空白，且保持顺序')
  assert.equal(views[0]?.filters.orderBy, 'match_score')
})

test('写入（严格）：非法字段显式报错，并指出是第几个视图、哪个字段', () => {
  const cases: Array<{ payload: unknown; expect: string }> = [
    { payload: { views: [] }, expect: 'OK' },
    { payload: {}, expect: 'views 必须是数组' },
    { payload: { views: [view({ name: '' })] }, expect: '第 1 个视图不合法：名字不能为空' },
    { payload: { views: [view({ id: '带空格 的 id' })] }, expect: 'id 必须是' },
    {
      payload: { views: [view({ filters: { ...view().filters as object, orderBy: 'salary' } })] },
      expect: '不认识的排序字段：salary',
    },
    {
      payload: { views: [view({ filters: { ...view().filters as object, newWindow: '30d' } })] },
      expect: '不认识的时间窗：30d',
    },
    {
      payload: { views: [view({ filters: { ...view().filters as object, minScore: '101' } })] },
      expect: '最低分必须是 0–100 的整数',
    },
    {
      payload: { views: [view({ filters: { ...view().filters as object, state: 'starred' } })] },
      expect: '不认识的岗位状态：starred',
    },
    // id 重复会让"套用/删除"指错对象，必须在入口挡住
    { payload: { views: [view(), view({ name: '另一个' })] }, expect: 'id 与前面重复' },
    // 条数上限：整份覆盖写，一次误操作就能塞进几百 KB
    {
      payload: {
        views: Array.from({ length: MAX_SAVED_JOB_VIEWS + 1 }, (_, index) =>
          view({ id: `v${String(index)}` }),
        ),
      },
      expect: `最多保存 ${String(MAX_SAVED_JOB_VIEWS)} 个视图`,
    },
  ]

  for (const item of cases) {
    if (item.expect === 'OK') {
      assert.deepEqual(assertJobViews(item.payload), [])
      continue
    }
    assert.throws(
      () => assertJobViews(item.payload),
      (error: unknown) =>
        error instanceof DomainError && error.message.includes(item.expect),
      `应当报出「${item.expect}」`,
    )
  }
})

test('读取（宽容）：坏条目丢弃、不认识的标注类型静默丢掉、条数截断', () => {
  const raw = [
    view({ id: 'good-1' }),
    // 排序键是上一版的名字（枚举被改过）→ 整条不可用，丢掉
    view({ id: 'bad-enum', filters: { ...view().filters as object, orderBy: 'published_at' } }),
    // 名字超长 → 丢掉
    view({ id: 'bad-name', name: 'x'.repeat(41) }),
    // 非对象 → 丢掉
    42,
    // 标注类型里混了一个已经下线的：**只丢那一项**，视图本身还能用
    view({
      id: 'good-2',
      filters: { ...view().filters as object, excludeFlags: ['outsourcing', 'legacy_flag'] },
    }),
  ]
  const views = readJobViews(raw)
  assert.deepEqual(
    views.map((item) => item.id),
    ['good-1', 'good-2'],
    '坏条目被丢弃而不是让整屏打不开',
  )
  assert.deepEqual(views[1]?.filters.excludeFlags, ['outsourcing'], '不认识的标注类型静默丢弃')

  assert.deepEqual(readJobViews(null), [])
  assert.deepEqual(readJobViews({ views: [] }), [], '不是数组一律当没有')
  assert.equal(
    readJobViews(Array.from({ length: MAX_SAVED_JOB_VIEWS + 5 }, (_, i) => view({ id: `v${String(i)}` })))
      .length,
    MAX_SAVED_JOB_VIEWS,
    '超限截断（反正是整份覆盖写，多出来的不可能来自界面）',
  )
})

test('存取往返：saveJobViews 落到 setting 表，jobViewsOf 读回同一份', () => {
  const store = openTestStore()
  try {
    assert.deepEqual(jobViewsOf(store), { views: [], max: MAX_SAVED_JOB_VIEWS }, '一开始没有视图')

    const saved = saveJobViews(store, { views: [view()] }, NOW)
    assert.equal(saved.views.length, 1)
    assert.deepEqual(jobViewsOf(store).views, saved.views, '读回来必须是同一份（幂等覆盖写）')

    // 整体覆盖：第二次 PUT 换掉全部
    const replaced = saveJobViews(store, { views: [] }, NOW)
    assert.deepEqual(replaced.views, [])
    assert.deepEqual(jobViewsOf(store).views, [], '空数组 = 清空，不是"忽略这次请求"')

    // 库里被塞进坏数据（手工改库 / 老版本）时，读要宽容、不抛错
    store.setting.set('saved-job-views', 'global', '', [{ id: 'x' }], NOW)
    assert.deepEqual(jobViewsOf(store).views, [])
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
