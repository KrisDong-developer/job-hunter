import {
  JOB_FLAG_LABEL,
  JOB_NEW_WINDOWS,
  JOB_STATE_LABEL,
  type JobFlagType,
  type JobState,
} from '../../../shared/contract/enums/job.js'
import type { ExpChip } from '../../../shared/domain/job-facets.js'
import type { JobFilterState } from '../../../shared/contract/dto/job.js'

/**
 * 岗位库的筛选条件（界面控件状态）。
 *
 * 形状本身定义在 `shared/contract/dto/job.ts` 的 `JobFilterState` ——
 * 因为"保存的筛选视图"要落库（`setting` 表）且**由服务端逐字段校验**，
 * 两端必须是同一份定义（这里别名过去，不另抄一份）。
 *
 * 几条界面侧的语义补充：
 *   * `cities`：底层一直是数组（查询层支持多城市），第五轮起界面上也**恢复了多选 chips**
 *     （2026-09-18 曾为了"少一种形状"改成单选下拉，实际用起来"深圳+杭州"这种组合太常用，
 *     每次只能看一个城市是纯损失）；
 *   * `expBuckets`：经验存的是**标准梯队的 chip id**，不是平台原始串 ——
 *     原始串在库里就有十几二十种写法（`1-3年` / `1年～3年` / `2年及以上`…），
 *     全铺出来用户没法选；选中一档，查询时再展开成它名下的原始取值（见 `facets.ts`）；
 *   * `minSalary` / `minScore`：存**字符串**而不是数字 —— 它们背后是两个输入框，
 *     空串代表"不限"，而 `0` 与"不限"是两个意思。查询前才转成数字。
 */
export type Filters = JobFilterState

export const EMPTY_FILTERS: Filters = {
  q: '',
  cities: [],
  expBuckets: [],
  eduReqs: [],
  state: '',
  minSalary: '',
  minScore: '',
  excludeFlags: [],
  // 「排除已拉黑公司」默认**开着**（第五轮，批次 B）：拉黑一家公司之后，
  // 它在岗位库里继续天天出现是显而易见的浪费。但这件事绝不静默 ——
  // 列表头栏会写明"已隐藏 N 条"，一键就能显示回来（见 `index.tsx`）。
  excludeBlacklisted: true,
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
 *
 * ⚠️ 新增筛选字段时必须同步加进这里，否则"条件已改动"提示与空态判断会失灵。
 */
export function sameFilters(left: Filters, right: Filters): boolean {
  const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((item) => b.includes(item))
  return (
    left.q === right.q &&
    left.state === right.state &&
    left.minSalary === right.minSalary &&
    left.minScore === right.minScore &&
    left.newWindow === right.newWindow &&
    left.groupDuplicates === right.groupDuplicates &&
    left.excludeBlacklisted === right.excludeBlacklisted &&
    left.orderBy === right.orderBy &&
    left.descending === right.descending &&
    sameList(left.cities, right.cities) &&
    sameList(left.expBuckets, right.expBuckets) &&
    sameList(left.eduReqs, right.eduReqs) &&
    sameList(left.excludeFlags, right.excludeFlags)
  )
}

/** 只有"数字型"输入框共用的收敛：只留数字（负数与小数点都不该出现）。 */
export function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/**
 * 最低分输入的收敛：0–100 的整数（第五轮）。
 *
 * 为什么界面要自己夹住：宿主对 `minScore` 是**显式 400**（"匹配分门槛必须是 0–100 的整数"），
 * 而输入框只过滤非数字 —— 用户敲 "150" 再点筛选，整屏会变成"查询失败"。
 * 界面先收敛，用户永远撞不到那个错误；服务端那条校验仍然留着（它还要保护非界面调用方）。
 */
export function clampScoreInput(value: string): string {
  const digits = digitsOf(value).slice(0, 3)
  if (digits === '') return ''
  return String(Math.min(100, Number(digits)))
}

/**
 * 最低月薪输入的收敛：只留数字，且 7 位封顶。
 *
 * 7 位这个上限不是随便定的：保存筛选视图时服务端按 `^\d{1,7}$` 校验
 * （见 `host/domain/job-views.ts`），界面不封顶的话"输入 8 位数 → 保存视图失败"
 * 会变成一个莫名其妙的服务端报错。
 */
export function salaryInput(value: string): string {
  return digitsOf(value).slice(0, 7)
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

/** 「筛选中」chips 的一枚：`text` 是给人读的摘要，`next` 是移除它之后的完整条件。 */
export type AppliedFilterChip = { id: string; text: string; next: Filters }

/**
 * 已生效条件 → 「筛选中」chips（2026-09-20 布局重排）。
 *
 * 高级筛选折叠之后，被折叠的条件在界面上没有任何痕迹；列表头栏那句统计也只说
 * "有多少条"，不说"筛了什么"。这组 chips 是它的可操作版：每一枚 = 一条已生效条件，
 * 点掉**立即生效**（`index.tsx` 里 draft 与 applied 一起换）—— 与表单"点筛选才提交"
 * 的语义不冲突：表单里改的是**草稿**，chip 是一次完整的单条撤销
 * （与列表头栏「显示被隐藏的 N 条」是同一类动作）。
 *
 * 只描述**偏离默认值**的条件：`excludeBlacklisted` 默认开着，开着不算"筛过"；
 * 关掉它反而是个必须被看见的状态（列表里混着拉黑过的公司），出一枚「含已拉黑公司」。
 * 排序不在此列 —— 它在列表头栏有自己的控件，一直看得见。
 */
export function describeAppliedFilters(applied: Filters, expChips: ExpChip[]): AppliedFilterChip[] {
  const chips: AppliedFilterChip[] = []
  const push = (id: string, text: string, patch: Partial<Filters>): void => {
    chips.push({ id, text, next: { ...applied, ...patch } })
  }
  if (applied.q !== '') push('q', `关键词「${applied.q}」`, { q: '' })
  for (const city of applied.cities) {
    push(`city:${city}`, `城市 ${city}`, { cities: applied.cities.filter((item) => item !== city) })
  }
  for (const id of applied.expBuckets) {
    // 梯队 id → 人话；对不上（例如套用了很久以前存的视图）就拿 id 本身当文案，不炸
    const label = expChips.find((chip) => chip.id === id)?.label ?? id
    push(`exp:${id}`, `经验 ${label}`, { expBuckets: applied.expBuckets.filter((item) => item !== id) })
  }
  for (const value of applied.eduReqs) {
    push(`edu:${value}`, `学历 ${value}`, { eduReqs: applied.eduReqs.filter((item) => item !== value) })
  }
  if (applied.state !== '') {
    push('state', `状态 ${JOB_STATE_LABEL[applied.state as JobState] ?? applied.state}`, { state: '' })
  }
  if (applied.minSalary !== '') push('minSalary', `最低月薪 ≥ ${applied.minSalary}`, { minSalary: '' })
  if (applied.minScore !== '') push('minScore', `匹配分 ≥ ${applied.minScore}`, { minScore: '' })
  if (applied.newWindow !== '') {
    const label = JOB_NEW_WINDOWS.find((item) => item.value === applied.newWindow)?.label ?? applied.newWindow
    push('newWindow', `新增：${label}`, { newWindow: '' })
  }
  for (const flag of applied.excludeFlags) {
    push(`flag:${flag}`, `屏蔽 ${JOB_FLAG_LABEL[flag as JobFlagType] ?? flag}`, {
      excludeFlags: applied.excludeFlags.filter((item) => item !== flag),
    })
  }
  if (!applied.excludeBlacklisted) push('blacklisted', '含已拉黑公司', { excludeBlacklisted: true })
  if (applied.groupDuplicates) push('dedup', '跨平台折叠', { groupDuplicates: false })
  return chips
}
