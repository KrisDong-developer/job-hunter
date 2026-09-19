import type { JobFlagType } from '../../../shared/enums.js'
import type { ExpChip } from '../../../shared/facets.js'

export interface Filters {
  q: string
  /**
   * 城市：命中任意一个即可；空 = 不限。
   *
   * 界面上是**单选下拉**（2026-09-18：从一排 chips 改成下拉，与关键词 / 月薪 同排），
   * 但底层仍按数组传 —— 查询层的多城市是一条已经验证过的路径，不为了一个下拉把它拆掉，
   * 以后要恢复多选也只是换个控件的事。
   */
  cities: string[]
  /**
   * 经验：存的是**标准梯队的 chip id**，不是平台原始串。
   *
   * 原始串在库里就有十几二十种写法（`1-3年` / `1年～3年` / `2-3年` / `2年及以上`…），
   * 全铺出来用户没法选。选中一个梯队，查询时再展开成它名下的原始取值（见 `facets.ts`）。
   */
  expBuckets: string[]
  /** 学历要求多选：取值来自 facet（平台原始串，界面按学历梯度排过序）。 */
  eduReqs: string[]
  state: string
  minSalary: string
  /** 屏蔽这些标注类型的岗位（命中任意一个就不显示）。 */
  excludeFlags: JobFlagType[]
  /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
  groupDuplicates: boolean
  /** 只看新增的时间窗（'' = 全部）。见 `NEW_JOB_WINDOWS`。 */
  newWindow: string
  orderBy: string
  descending: boolean
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  cities: [],
  expBuckets: [],
  eduReqs: [],
  state: '',
  minSalary: '',
  excludeFlags: [],
  groupDuplicates: false,
  newWindow: '',
  orderBy: 'crawled_at',
  descending: true,
}

/** 多选 chips 的通用取反：选中就移除，未选中就追加。 */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * 已选梯队 → 传给查询的原始取值。
 *
 * 这一步是"标准梯队"能成立的关键：界面按梯队选，查询按库里的原始串查，
 * 所以归并既没有丢岗位，也没有把用户锁在某个平台的写法里。
 */
export function expandExpBuckets(ids: string[], chips: ExpChip[]): string[] {
  const wanted = new Set(ids)
  return chips.filter((chip) => wanted.has(chip.id)).flatMap((chip) => chip.values)
}

export const ORDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'crawled_at', label: '按抓取时间' },
  { value: 'salary_min', label: '按月薪' },
  { value: 'last_seen_at', label: '按最近出现' },
  { value: 'first_seen_at', label: '按首次出现' },
  { value: 'title', label: '按标题' },
]

/**
 * 「只看新增」的时间窗。
 *
 * 24 小时这一档**必须与首屏「今日新增」同口径**（`domain/today.ts` 的
 * `NEW_JOB_WINDOW_MS` 就是 24 小时）—— 写成"今天零点"会让首屏说 12 条、列表筛出 3 条，
 * 而两者看的是同一列 `first_seen_at`，用户只会以为其中之一坏了。
 */
export const NEW_JOB_WINDOWS: Array<{ value: string; label: string; hours: number }> = [
  { value: '1d', label: '近 24 小时', hours: 24 },
  { value: '3d', label: '近 3 天', hours: 72 },
  { value: '7d', label: '近 7 天', hours: 168 },
]

/** 时间窗 → ISO 起始时刻。空窗（'' = 全部）返回 `undefined`。 */
export function firstSeenSinceOf(window: string, now: number = Date.now()): string | undefined {
  const found = NEW_JOB_WINDOWS.find((item) => item.value === window)
  if (found === undefined) return undefined
  return new Date(now - found.hours * 60 * 60 * 1000).toISOString()
}

export const PAGE_SIZE = 20

/**
 * 页码列表：页数少就全列；多了只留首尾与当前附近，中间用 … 收。
 * 只给"上一页/下一页"的话，用户不知道一共有多少页（也就不知道还要不要继续筛）。
 */
export function pageNumbers(page: number, pages: number): Array<number | '…'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const wanted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  let previous = 0
  for (const value of wanted) {
    if (previous !== 0 && value - previous > 1) out.push('…')
    out.push(value)
    previous = value
  }
  return out
}
