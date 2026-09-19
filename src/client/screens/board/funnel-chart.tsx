import type { FunnelStepDto } from '../../../shared/contract/dto/analytics.js'
import { formatRate } from './format.js'

/**
 * 漏斗图。
 *
 * 为什么不画成一排独立横条：每层各画各的，视觉上就是七根柱子 ——
 * "越来越窄"这件事完全读不出来（这也是它此前看起来像"文本 + 破折号"的原因）。
 * 这里让**每一层的下边缘等于下一层的上边缘**（同一组宽度统一算 clip-path），
 * 七层因此拼成一条连续的漏斗。
 *
 * 两个总体各算各的 100% 基线：跨总体算占比会把"已投递 3 / 打招呼 2"画成 150%。
 * 服务层对总体切换那一层连 `rate` 都留空了（`rate === null`），这里也不把它们并成一条。
 */
export function FunnelChart(props: { steps: FunnelStepDto[]; onDrillDown: (step: string) => void }) {
  const { steps } = props
  const baselineOf = (population: FunnelStepDto['population']): number =>
    steps.find((step) => step.population === population)?.count ?? 0
  const widthOf = (step: FunnelStepDto): number => stepWidth(step.count, baselineOf(step.population))

  return (
    <ol className="jh-funnel-chart">
      {steps.map((step, index) => {
        const previous = index === 0 ? undefined : steps[index - 1]
        const boundary = previous !== undefined && previous.population !== step.population
        const comparable = previous !== undefined && previous.population === step.population
        const drop = comparable && previous !== undefined ? previous.count - step.count : null
        const next = steps[index + 1]
        const continues = next !== undefined && next.population === step.population
        const top = widthOf(step)
        const bottom = continues && next !== undefined ? widthOf(next) : top
        const halfTop = (100 - top) / 2
        const halfBottom = (100 - bottom) / 2
        return (
          <li className="jh-funnel-block" key={step.key}>
            {index === 0 || boundary ? (
              <p className="jh-funnel-seg">
                {step.population === 'contact'
                  ? '接触阶段 · 打招呼链路'
                  : '投递阶段 · 投递 → 面试 → Offer'}
              </p>
            ) : null}
            <div className="jh-funnel-row">
              <span className="jh-funnel-label">{step.label}</span>
              <span className="jh-funnel-track">
                <span
                  className={`jh-funnel-fill${step.population === 'application' ? ' jh-funnel-fill-apply' : ''}`}
                  style={{
                    clipPath:
                      `polygon(${String(halfTop)}% 0, ${String(100 - halfTop)}% 0, ` +
                      `${String(100 - halfBottom)}% 100%, ${String(halfBottom)}% 100%)`,
                  }}
                />
              </span>
              <button
                type="button"
                className="jh-funnel-count"
                title="点开看这一段的明细"
                /* 可访问名必须带上层名：按钮里只有一个数字，读屏会连读七个"12 按钮"，
                   用户只能靠位置猜这是哪一层。名字里保留那个数字，2.5.3 也才对得上。 */
                aria-label={`${step.label} ${String(step.count)} 条，点开看这一段的明细`}
                onClick={() => props.onDrillDown(step.key)}
              >
                {step.count}
              </button>
              <span className="jh-funnel-rate">
                {step.rate === null ? (
                  /* 破折号本身没有含义，解释不能只挂在 title 上（键盘与触屏都读不到）——
                     与 SampleBadge 同一个做法：正文之外再给读屏一份。 */
                  <span className="jh-cell-empty">
                    —
                    <span className="jh-sr-only">跨总体（接触 → 投递）没有转化率</span>
                  </span>
                ) : (
                  formatRate(step.rate)
                )}
              </span>
              <span className="jh-funnel-drop" title={drop === null || drop <= 0 ? undefined : `比上一层少 ${String(drop)} 条`}>
                {drop === null || drop <= 0 ? '' : `↓ ${String(drop)}`}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}


/** 每层相对**本段基线**的宽度（%）。下限 8%：0 也要看得见，否则整个阶段在图上消失。 */
function stepWidth(count: number, baseline: number): number {
  if (baseline <= 0) return 100
  return Math.max(8, Math.round((count / baseline) * 100))
}




