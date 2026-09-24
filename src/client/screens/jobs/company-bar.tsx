import type { FormEvent } from 'react'
import { CO_LABEL_OPTIONS, type CoAppliedChip, type CompanyFilters } from './company-filters.js'
import { DimensionSwitch } from './dimension-switch.js'

/**
 * 公司维度的筛选区（两行）：
 *
 *   行 1 · 视图行 —— 与岗位维度**同一行、同一个位置**，末尾是维度切换按钮
 *          （`⇄ 岗位`）。P1 公司维度没有"保存视图"，这行只放「全部」——
 *          结构先对齐，保存能力（要动 setting 存储）留给后续批次。
 *   行 2 · 工具条 —— 关键词 / 拉黑 / 人工标签 / 岗位数，筛选/重置紧跟最后一个控件
 *          （与岗位维度同一句式：筛选条是一句话，按钮是句号）。
 *
 * 草稿（`CompanyFilters`）留在 `JobsScreen` —— 与 `FilterBar` 同一条纪律：
 * 这里只负责画，条件怎么算不归它管。
 */
export function CompanyBar(props: {
  draft: CompanyFilters
  pending: boolean
  appliedChips: CoAppliedChip[]
  onSubmit: (event: FormEvent) => void
  onReset: () => void
  onKeyword: (value: string) => void
  onBlacklist: (value: '' | 'yes' | 'no') => void
  onLabel: (value: string) => void
  onMinJobs: (value: string) => void
  /** 切回岗位维度（岗位侧的筛选与列表保持不动）。 */
  onSwitchDimension: () => void
  /** 移除一枚已生效条件（draft 与 applied 在 JobsScreen 一起换）。 */
  onRemoveChip: (id: string) => void
}) {
  const draft = props.draft
  return (
    <form className="jh-jobs-filters" onSubmit={props.onSubmit}>
      {/* 行 1 · 视图行：结构对齐岗位维度（「视图」标签 + chips + 行尾切换按钮）。 */}
      <div className="jh-jobs-viewrow" role="group" aria-label="筛选视图">
        <span className="jh-jobs-viewrow-label">视图</span>
        <span className="jh-chip jh-chip-on" aria-pressed="true" title="公司维度暂不支持保存视图">
          全部
        </span>
        {/* 维度切换（视图行末尾的小按钮）：与岗位维度（FilterBar 里）同一颗、
            同一个位置 —— 只写"要去的地方"。 */}
        <DimensionSwitch to="jobs" onSwitch={props.onSwitchDimension} />
      </div>

      {/* 行 2 · 工具条：一条线，按钮紧跟最后一个字段（与岗位维度同构）。 */}
      <div className="jh-jobs-filter-line">
        <label className="jh-jobs-filter-text">
          <span>关键词</span>
          <input
            className="jh-input"
            value={draft.q}
            aria-label="关键词（公司名 / 归一化名 / 别名 / 备注）"
            onChange={(event) => props.onKeyword(event.target.value)}
          />
        </label>
        <select
          className="jh-select jh-input-md"
          aria-label="拉黑状态"
          value={draft.blacklisted}
          onChange={(event) => props.onBlacklist(event.target.value as '' | 'yes' | 'no')}
        >
          <option value="">全部公司</option>
          <option value="no">未拉黑</option>
          <option value="yes">已拉黑</option>
        </select>
        {/* 人工标签：快捷下拉（常见三类）。自由输入的标签仍能在详情里打，
            只是不进这个下拉 —— 它没有 facets 接口，硬做"全部标签"会是撒谎的下拉。 */}
        <select
          className="jh-select jh-input-md"
          aria-label="人工标签"
          value={draft.manualLabel}
          onChange={(event) => props.onLabel(event.target.value)}
        >
          <option value="">全部标签</option>
          {CO_LABEL_OPTIONS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <label className="jh-jobs-filter-text jh-jobs-filter-text-narrow">
          <span>最少岗位</span>
          <input
            className="jh-input"
            inputMode="numeric"
            value={draft.minJobCount}
            aria-label="最少岗位数"
            onChange={(event) => props.onMinJobs(event.target.value)}
          />
        </label>
        <button type="submit" className="jh-btn jh-btn-inline jh-btn-primary">筛选</button>
        <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={props.onReset}>重置</button>
        {props.pending ? (
          <span className="jh-jobs-filter-pending">条件已改动，点「筛选」生效</span>
        ) : null}
      </div>

      {/* 已生效条件 chips：与岗位维度同一层语义 —— 每枚 = 一条生效条件，点掉立即生效。 */}
      {props.appliedChips.length === 0 ? null : (
        <div className="jh-jobs-applied">
          <span className="jh-jobs-applied-label">筛选中</span>
          {props.appliedChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="jh-chip jh-chip-on"
              title="移除这一条条件（立即生效）"
              onClick={() => props.onRemoveChip(chip.id)}
            >
              {chip.text}
              <span className="jh-jobs-chip-x" aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className="jh-link" onClick={props.onReset}>清空全部</button>
        </div>
      )}
    </form>
  )
}
