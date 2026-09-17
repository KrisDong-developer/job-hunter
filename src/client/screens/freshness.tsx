import type { FreshnessLevel } from '../../shared/dto.js'

/**
 * 新鲜度徽章（SR-8 / SR-27）。
 *
 * 三级颜色不同，但**永远带文字**——只给颜色等于没说：
 * 用户分不清"红色是坏了还是旧了"，而"陈旧 · 53 小时前"是自解释的。
 *
 * 放在独立文件里而不是 `collect.tsx`：今日屏（U0）与采集屏（U9）都要用，
 * 而今日屏不该 import 采集屏 —— 那会让两个屏之间出现单向依赖。
 */
export function FreshnessBadge(props: { level: FreshnessLevel; hours: number | null }) {
  const label = props.level === 'fresh' ? '新鲜' : props.level === 'stale' ? '偏旧' : '陈旧'
  const cls =
    props.level === 'fresh'
      ? 'jh-fresh-fresh'
      : props.level === 'stale'
        ? 'jh-fresh-stale'
        : 'jh-fresh-cold'
  return (
    <span
      className={`jh-fresh ${cls}`}
      title={
        props.hours === null
          ? '从来没成功采集过 —— 没有任何数据是"新鲜的"'
          : `上次成功采集在 ${String(props.hours)} 小时前`
      }
    >
      {label}
      {props.hours === null ? ' · 从未更新' : ` · ${String(props.hours)} 小时前`}
    </span>
  )
}
