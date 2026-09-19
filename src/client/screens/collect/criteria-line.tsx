// CriteriaLine：把一条采集条件翻成一行中文呈现（不是源码 JSON）。
// 多关键词方案把关键词排在最前 —— 它们是一轮里要逐个跑的任务清单；
// 其余条件照旧翻人话，两者都没有才写"不限"。纯展示组件。
import type { ReactNode } from 'react'
import { describeCriteria, type CriteriaDimensionLike } from '../../../shared/criteria-label.js'
import type { PlanDto } from '../../../shared/dto.js'

/**
 * 条件的一行中文呈现（不是源码 JSON）。
 * 多关键词方案把关键词排在最前（它们是一轮里要逐个跑的任务清单），
 * 其余条件照旧翻人话；两者都没有才写"不限"。
 */
export function CriteriaLine(props: { plan: PlanDto; dimensions: readonly CriteriaDimensionLike[] }) {
  const scoped = props.dimensions.filter(
    (dimension) => dimension.key !== 'keyword' && props.plan.criteria[dimension.key] !== undefined,
  )
  const items = describeCriteria(props.plan.criteria, scoped)
  const keywords =
    props.plan.keywords.length > 0
      ? props.plan.keywords
      : props.plan.criteria['keyword'] !== undefined && props.plan.criteria['keyword'] !== ''
        ? [props.plan.criteria['keyword'] ?? '']
        : []
  if (items.length === 0 && keywords.length === 0) return <span className="jh-muted">条件：不限</span>
  return (
    <span>
      {keywords.length === 0 ? null : (
        <span>
          关键词：<b>{keywords.join('、')}</b>
          {items.length > 0 ? ' · ' : ''}
        </span>
      )}
      {items
        .map((item) => (
          <span key={item.key}>
            {item.label}：<b>{item.display}</b>
          </span>
        ))
        .reduce<ReactNode[]>((acc, node) => (acc.length === 0 ? [node] : [...acc, ' · ', node]), [])}
    </span>
  )
}
