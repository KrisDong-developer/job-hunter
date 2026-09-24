import type { CompanyOrderValue } from '../../../shared/contract/enums/job.js'

/**
 * 公司维度的筛选条件（界面控件状态）。
 *
 * 与岗位侧的 `Filters` 同一套纪律：**草稿 / 已生效双态**，点「筛选」才提交；
 * 数字字段存字符串（空串 = 不限），查询前才转数字。
 *
 * 不进 shared —— 岗位侧的 `JobFilterState` 进 shared 是因为"保存的筛选视图"
 * 要落库、服务端要逐字段校验；公司维度 P1 没有保存视图，这份状态只活在界面里。
 */
export interface CompanyFilters {
  q: string
  /** `''` = 全部；`'yes'` = 已拉黑；`'no'` = 未拉黑。 */
  blacklisted: '' | 'yes' | 'no'
  /** 人工标签精确匹配；`''` = 全部。 */
  manualLabel: string
  /** 最少在手岗位数（字符串，空 = 不限）。 */
  minJobCount: string
  orderBy: CompanyOrderValue
  descending: boolean
}

export const EMPTY_CO_FILTERS: CompanyFilters = {
  q: '',
  blacklisted: '',
  manualLabel: '',
  minJobCount: '',
  // 岗位数多的公司在前面 —— 公司列表的第一问是"谁在大量招人"
  orderBy: 'jobCount',
  descending: true,
}

/**
 * 两组公司筛选条件是否语义相同。
 *
 * 用途与岗位侧的 `sameFilters` 一致：①「条件已改动，点筛选生效」的提示；
 * ② 空结果时决定要不要给「清除筛选」。公司侧没有多选数组，逐字段比就够。
 */
export function sameCoFilters(left: CompanyFilters, right: CompanyFilters): boolean {
  return (
    left.q === right.q &&
    left.blacklisted === right.blacklisted &&
    left.manualLabel === right.manualLabel &&
    left.minJobCount === right.minJobCount &&
    left.orderBy === right.orderBy &&
    left.descending === right.descending
  )
}

/** 只留数字（与岗位侧 `digitsOf` 同款收敛）。 */
export function coDigitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** 岗位数输入收敛：数字、5 位封顶（岗位数是"这家公司在库里的条目数"，六位数不现实）。 */
export function coJobCountInput(value: string): string {
  return coDigitsOf(value).slice(0, 5)
}

/** 「筛选中」chips 的一枚（与岗位侧 `AppliedFilterChip` 同构）。 */
export type CoAppliedChip = { id: string; text: string; next: CompanyFilters }

/** 人工标签下拉的快捷选项 —— 复核时最常见的三类（自由输入的标签先不进下拉）。 */
export const CO_LABEL_OPTIONS = ['外包', '已投过', '避雷'] as const

/**
 * 已生效的公司条件 → 「筛选中」chips。
 *
 * 只描述**偏离默认值**的条件；排序不进 chips（列表头栏的下拉一直看得见它）。
 */
export function describeAppliedCoFilters(applied: CompanyFilters): CoAppliedChip[] {
  const chips: CoAppliedChip[] = []
  const push = (id: string, text: string, patch: Partial<CompanyFilters>): void => {
    chips.push({ id, text, next: { ...applied, ...patch } })
  }
  if (applied.q !== '') push('q', `关键词「${applied.q}」`, { q: '' })
  if (applied.blacklisted === 'yes') push('blacklisted', '只看已拉黑', { blacklisted: '' })
  if (applied.blacklisted === 'no') push('blacklisted', '只看未拉黑', { blacklisted: '' })
  if (applied.manualLabel !== '') push('manualLabel', `标签 ${applied.manualLabel}`, { manualLabel: '' })
  if (applied.minJobCount !== '') push('minJobCount', `岗位数 ≥ ${applied.minJobCount}`, { minJobCount: '' })
  return chips
}
