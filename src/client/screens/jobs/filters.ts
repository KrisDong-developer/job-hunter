import type { JobFlagType, JobOrderValue } from '../../../shared/contract/enums/job.js'
import { JOB_NEW_WINDOWS } from '../../../shared/contract/enums/job.js'
import type { ExpChip } from '../../../shared/domain/job-facets.js'

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
  /** 只看新增的时间窗（'' = 全部）。见 `JOB_NEW_WINDOWS`。 */
  newWindow: string
  /** 排序字段。取值受 `JOB_ORDER_VALUES` 约束（与宿主校验同一个集合）。 */
  orderBy: JobOrderValue
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
 * 两组筛选条件是否**语义相同**（第四轮修复，审核 P2-12）。
 *
 * 两个用处：① 判断"草稿改了但还没点筛选"；② 判断空结果时到底有没有生效条件
 * （没有的话就别提"清除筛选"）。
 *
 * 不能用 JSON.stringify 比：多选的顺序由用户点击顺序决定，[A,B] 与 [B,A]
 * 是同一组条件，串化后却不同 —— 那会让"未应用"提示在条件其实没变时也亮着。
 */
export function sameFilters(left: Filters, right: Filters): boolean {
  const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((item) => b.includes(item))
  return (
    left.q === right.q &&
    left.state === right.state &&
    left.minSalary === right.minSalary &&
    left.newWindow === right.newWindow &&
    left.groupDuplicates === right.groupDuplicates &&
    left.orderBy === right.orderBy &&
    left.descending === right.descending &&
    sameList(left.cities, right.cities) &&
    sameList(left.expBuckets, right.expBuckets) &&
    sameList(left.eduReqs, right.eduReqs) &&
    sameList(left.excludeFlags, right.excludeFlags)
  )
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

/**
 * 「只看新增」的时间窗（`JOB_NEW_WINDOWS`）与排序选项（`JOB_ORDER_OPTIONS`）
 * 都住在 `shared/contract/enums/job.ts` —— 它们是与宿主共用的取值域，
 * 不是界面细节（24 小时那一档必须与首屏「今日新增」同口径）。
 */

/** 时间窗 → ISO 起始时刻。空窗（'' = 全部）返回 `undefined`。 */
export function firstSeenSinceOf(window: string, now: number = Date.now()): string | undefined {
  const found = JOB_NEW_WINDOWS.find((item) => item.value === window)
  if (found === undefined) return undefined
  return new Date(now - found.hours * 60 * 60 * 1000).toISOString()
}

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
