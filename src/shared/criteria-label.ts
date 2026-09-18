/**
 * 采集条件 → **中文语义标签**（host 与 client 共用）。
 *
 * 存在的理由是一条实测的界面缺陷：方案列表原来直接渲染
 * `JSON.stringify(plan.criteria)` —— 用户看到的是 `{"keyword":"Java","city":"深圳"}`。
 * 那是**源码**，不是给求职者看的东西。
 *
 * 这一层是纯函数，所以模型工具的返回文本与界面上的文字必然一致
 * （与 `JOB_STATE_LABEL` 同样的理由：对话里说的和面板上写的必须是同一句话）。
 */

/** 一个条件的"人话"呈现。 */
export interface CriteriaItem {
  key: string
  /** 维度中文名，如"关键词"。 */
  label: string
  /** 原始值（用于编辑）。 */
  value: string
  /** 值的展示名：声明了取值域时用域里的 label（`2` → `最新发布`），否则就是原值。 */
  display: string
  /** 该维度是否被当前平台的适配器声明过（未声明的会在界面上显式标出）。 */
  declared: boolean
}

/**
 * 声明来源。刻意只要求"含这些字段"的最小形状，
 * 这样 `CriteriaDimensionDto`（客户端）与 `CriteriaDimension`（宿主）都能直接喂进来。
 */
export interface CriteriaDimensionLike {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
}

/**
 * 兜底中文名。
 *
 * 为什么需要它：`criteriaDimensionsFor()` 只返回**当前选中平台**声明过的维度。
 * 如果一个方案引用了某个平台已经不支持的键（或方案正在编辑、平台刚被取消勾选），
 * 界面不该退回去印 `postedWithinDays`。已知的键在这里永远有中文名。
 */
const FALLBACK_LABEL: Record<string, string> = {
  keyword: '关键词',
  city: '城市',
  sort: '排序方式',
  postedWithinDays: '发布时间',
  maxPages: '抓取页数上限',
  scrollRounds: '加载轮数',
  // 平台特有维度：只有部分平台声明（如神仙外企），但方案可能引用了它们，
  // 而平台刚被取消勾选 —— 那时候界面不该退回去印 `workExp`。
  workExp: '工作经验',
  education: '学历',
  type: '职位范围',
}

/** 数值型维度（展示时补单位，避免"3"这种光秃秃的数字）。 */
const NUMERIC_SUFFIX: Record<string, string> = {
  postedWithinDays: ' 天内',
  maxPages: ' 页',
  scrollRounds: ' 轮',
}

/** 把一份条件摊成人话；键顺序按声明顺序，未声明的排在后面。 */
export function describeCriteria(
  criteria: Record<string, string>,
  dimensions: readonly CriteriaDimensionLike[] = [],
): CriteriaItem[] {
  const declared = new Map(dimensions.map((dimension) => [dimension.key, dimension]))
  const order = [
    ...dimensions.map((dimension) => dimension.key).filter((key) => key in criteria),
    ...Object.keys(criteria).filter((key) => !declared.has(key)),
  ]

  const seen = new Set<string>()
  const items: CriteriaItem[] = []
  for (const key of order) {
    if (seen.has(key)) continue
    seen.add(key)
    const value = criteria[key]
    if (value === undefined || value === '') continue
    const spec = declared.get(key)
    const suffix = NUMERIC_SUFFIX[key] ?? ''
    const inDomain = spec?.values.find((option) => option.value === value)
    items.push({
      key,
      label: spec?.label ?? FALLBACK_LABEL[key] ?? key,
      value,
      display: inDomain === undefined ? `${value}${suffix}` : inDomain.label,
      declared: spec !== undefined,
    })
  }
  return items
}

/** 一行文本，例如 `关键词：Java · 城市：深圳`。空条件返回 `null`（界面据此显示"不限"）。 */
export function formatCriteriaLine(
  criteria: Record<string, string>,
  dimensions: readonly CriteriaDimensionLike[] = [],
  separator = ' · ',
): string | null {
  const items = describeCriteria(criteria, dimensions)
  if (items.length === 0) return null
  return items.map((item) => `${item.label}：${item.display}`).join(separator)
}
