import type { SalaryBoxDto } from '../../../shared/dto.js'
import { useState } from 'react'

/**
 * 箱线图（F1）。
 *
 * 用**横向**画：薪资是"多少"而不是"什么时候"，横向比纵向好读，也和上面的漏斗一致。
 *
 * 高亮的是 **P25–P75 箱体**（`withinBox` 条样本在里面），
 * 两端的须是最小/最大值 —— 明确不做离群点剔除：
 * 剔了会把真实的高薪岗从图上删掉，而用户会以为"这城市没有高薪岗"。
 *
 * 第七轮改了两处：
 *   * 刻度从"两端对齐的一行字"改成**按真实数值定位**的轴 ——
 *     原来 `justify-content:space-between` 把 P25/中位/P75 均匀铺开，
 *     读起来像"它们是等距的"，那是假坐标；
 *   * 悬浮给一张卡片，直接给分位数之差（箱体跨度、极值范围），
 *     而不是让用户在图下方读一段算法说明。
 */
export function SalaryBoxChart(props: { box: SalaryBoxDto }) {
  const [hot, setHot] = useState<BoxMark | null>(null)
  const { min, p25, median, p75, max, count, withinBox, basisLabel } = props.box
  if (min === null || p25 === null || median === null || p75 === null || max === null) return null
  const span = max - min
  // 全部样本同值时 span=0：这时给一个满宽的箱体，而不是除零画出 NaN
  const at = (value: number): number => (span <= 0 ? 50 : ((value - min) / span) * 100)
  const flatten = span <= 0

  const marks: Array<{ key: BoxMark; label: string; value: number; pos: number }> = flatten
    ? [{ key: 'median', label: '全部同值', value: median, pos: 50 }]
    : [
        { key: 'p25', label: 'P25', value: p25, pos: at(p25) },
        { key: 'median', label: '中位', value: median, pos: at(median) },
        { key: 'p75', label: 'P75', value: p75, pos: at(p75) },
      ]
  // 位置太近的刻度会叠字：按"中位 > P25 > P75"的优先级保留，重叠的直接不画标签
  // （位置仍然由标记点表达，只是不重复标数字）
  const kept: typeof marks = []
  for (const mark of [...marks].sort((a, b) => (a.key === 'median' ? -1 : b.key === 'median' ? 1 : 0))) {
    if (kept.every((other) => Math.abs(other.pos - mark.pos) >= 9)) kept.push(mark)
  }
  const axis = kept.sort((a, b) => a.pos - b.pos)

  return (
    <div className="jh-box">
      <div
        className="jh-box-plot"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0) return
          const ratio = ((event.clientX - rect.left) / rect.width) * 100
          let nearest: BoxMark = 'median'
          let gap = Number.POSITIVE_INFINITY
          for (const mark of marks) {
            const distance = Math.abs(mark.pos - ratio)
            if (distance < gap) {
              gap = distance
              nearest = mark.key
            }
          }
          setHot(nearest)
        }}
        onMouseLeave={() => setHot(null)}
      >
        <div className="jh-box-track">
          {/* 全样本同值时 min/max 是同一个点，须没有长度，画出来只是一条细线 */}
          {flatten ? null : (
            <div className="jh-box-whisker" style={{ left: `${String(at(min))}%`, width: `${String(at(max) - at(min))}%` }} />
          )}
          <div className="jh-box-body" style={{ left: `${String(at(p25))}%`, width: `${String(Math.max(0.5, at(p75) - at(p25)))}%` }} />
          <div className="jh-box-median" style={{ left: `${String(at(median))}%` }} data-hot={hot === 'median' ? '1' : '0'} />
        </div>
        {hot === null ? null : (
          <div className="jh-box-tip" role="tooltip">
            <p className="jh-box-tip-row" data-hot={hot === 'median' ? '1' : '0'}>
              <span>中位数</span>
              <b>{median}</b>
            </p>
            <p className="jh-box-tip-row" data-hot={hot === 'p25' ? '1' : '0'}>
              <span>P25</span>
              <b>{p25}</b>
            </p>
            <p className="jh-box-tip-row" data-hot={hot === 'p75' ? '1' : '0'}>
              <span>P75</span>
              <b>{p75}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>箱体跨度（P75−P25）</span>
              <b>{p75 - p25}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>须（极值）</span>
              <b>{min} – {max}</b>
            </p>
            <p className="jh-box-tip-row">
              <span>样本</span>
              <b>{count} 条（箱体内 {withinBox} 条）</b>
            </p>
            <p className="jh-box-tip-note">{basisLabel}；不做离群点剔除，两端就是最小 / 最大值。</p>
          </div>
        )}
      </div>
      <div className="jh-box-axis">
        {axis.map((mark) => (
          <span key={mark.key}>
            <span className="jh-box-tickmark" style={{ left: `${String(mark.pos)}%` }} />
            <span
              className={`jh-box-ticklabel${mark.key === 'median' ? ' jh-box-ticklabel-key' : ''}`}
              data-hot={hot === mark.key ? '1' : '0'}
              data-anchor={mark.pos <= 0 ? 'start' : mark.pos >= 100 ? 'end' : 'center'}
              style={{ left: `${String(mark.pos)}%` }}
            >
              <i>{mark.label}</i>
              <b>{mark.value}</b>
            </span>
          </span>
        ))}
      </div>
      <p className="jh-note">
        蓝色箱体 = P25–P75（一半样本在这里面）；须的两端是最小 / 最大值。悬停看分位数之差。
      </p>
    </div>
  )
}


type BoxMark = 'p25' | 'median' | 'p75'




