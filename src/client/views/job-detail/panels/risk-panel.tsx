import type { JobFlagDto } from '../../../../shared/contract/dto/job.js'
import { JOB_FLAG_LABEL } from '../../../../shared/contract/enums/job.js'
import { FieldHint } from '../../../ui/field-hint.js'
import { InlineMd } from '../../../ui/inline-md.js'

/** 风险标注的语气：真风险给红/黄，弱信号只给中性框 —— 全部刷成一片黄反而看不出轻重。 */
const FLAG_TONE: Record<string, 'error' | 'warn' | 'quiet'> = {
  fraud: 'error',
  outsourcing: 'warn',
  salary_inflation: 'warn',
  zombie: 'quiet',
  jargon_hit: 'quiet',
}

/**
 * ── P4：风险标注与依据 ──────────────────────────────────
 *
 * 小问号用共享 `FieldHint` 的 `inline` 变体（见 `MatchPanel`）。
 */
export function RiskPanel(props: { flags: JobFlagDto[] }) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">标注与依据</h3>
      {props.flags.length === 0 ? (
        // 刻意不刷成绿色：绿色等于宣布"这个岗位没问题"，而规则没命中只说明"没命中已知模式"。
        <div className="jh-alert jh-alert-quiet">
          <div className="jh-alert-head">
            <span className="jh-alert-title">没有命中任何已知风险特征</span>
          </div>
          <p className="jh-alert-body">
            <InlineMd text="这不等于「没问题」。识别依据分两层：**文本层**来自词表命中的原文片段，**统计层**来自公司维度（岗位数、地域跨度、驻场比例）；两者都没有命中时，这里是空的。" />
          </p>
        </div>
      ) : (
        <>
          {props.flags.map((flag) => {
            const tone = FLAG_TONE[flag.flagType] ?? 'quiet'
            return (
              <div key={flag.flagType} className={`jh-alert jh-alert-${tone}`}>
                <div className="jh-alert-head">
                  <span className={`jh-flag jh-flag-${flag.flagType}`}>
                    {JOB_FLAG_LABEL[flag.flagType]}
                  </span>
                  <span className="jh-alert-title">强度 {flag.score}</span>
                </div>
                <ul className="jh-evidence">
                  {flag.evidence.map((item, index) => (
                    <li key={`${flag.flagType}-${String(index)}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )
          })}
          <p className="jh-note">
            每条结论都附原文或统计依据。
            <FieldHint
              variant="inline"
              text={
                '识别依据分两层：文本层来自词表命中的原文片段，统计层来自公司维度' +
                '（岗位数、地域跨度、驻场比例）。强度是规则权重，不是概率。'
              }
            />
          </p>
        </>
      )}
    </section>
  )
}
