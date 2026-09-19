import type { JobDetailDto } from '../../../../shared/dto.js'
import { FieldHint } from '../../../ui/field-hint.js'
import { InlineMd } from '../../../ui/inline-md.js'
import { Gauge } from '../gauge.js'

/**
 * ── P4：匹配分与逐条理由 ───────────────────────────────
 *
 * `score` 为 `null` = 还没算过；`reasons` 是逐条加减分（§4.5.1：分数必须可解释）。
 *
 * 那个 `jh-hint` 小问号直接用共享 `FieldHint` 的 `inline` 变体 —— 不必再由
 * 父组件以 prop 传进来（当初那样做是为了避开循环 import）。
 */
export function MatchPanel(props: {
  score: number | null
  reasons: JobDetailDto['matchReasons']
}) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">L1 粗筛分</h3>
      {props.score === null ? (
        <p className="jh-note">还没有算过 —— 采集后会随标注一起算出来。</p>
      ) : (
        <div className="jh-gauge-row">
          <Gauge score={props.score} />
          <div className="jh-gauge-side">
            <span className="jh-gauge-band">
              {props.score >= 70 ? '本轮规则里靠前' : props.score >= 45 ? '中等' : '偏低'}
            </span>
            <p className="jh-note">
              <InlineMd text="按规则算出来的**粗筛分**，下面是逐条加减分。" />
              <FieldHint
                variant="inline"
                text={
                  '纯规则打分（城市 / 薪资 / 关键词命中率），全量适用、零成本。' +
                  '语义级的精评要等 L2，所以这里标的是「粗筛分」而不是「匹配度」。'
                }
              />
            </p>
          </div>
        </div>
      )}
      {props.reasons.length === 0 ? null : (
        <ul className="jh-reasons">
          {props.reasons.map((reason, index) => (
            <li
              key={`${reason.kind}-${String(index)}`}
              className={`jh-reason jh-reason-${reason.kind}${
                reason.kind === 'hit' ? ' jh-reason-ok' : ' jh-reason-bad'
              }`}
            >
              <span className="jh-reason-mark">{reason.kind === 'hit' ? '✓' : '✕'}</span>
              <span className="jh-reason-weight">
                {reason.weight > 0 ? `+${String(reason.weight)}` : reason.weight < 0 ? String(reason.weight) : '·'}
              </span>
              {reason.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
