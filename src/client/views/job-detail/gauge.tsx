/** L1 粗筛分的环形仪表：分数是决策第一眼要看的东西，不该只是一行灰字。 */
export function Gauge(props: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(props.score)))
  const band = clamped >= 70 ? 'high' : clamped >= 45 ? 'mid' : 'low'
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const filled = (clamped / 100) * circumference
  return (
    <div className={`jh-gauge jh-gauge-${band}`}>
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle className="jh-gauge-track" cx="36" cy="36" r={radius} fill="none" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${String(filled)} ${String(circumference - filled)}`}
        />
      </svg>
      <div className="jh-gauge-num">
        {clamped}
        <span className="jh-gauge-unit">粗筛分</span>
      </div>
    </div>
  )
}


