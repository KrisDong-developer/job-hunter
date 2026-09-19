import type { CompanyProfileDto } from '../../../../shared/dto.js'
import { CompanyReview } from '../company-review.js'

/** 公司画像 + 人工复核（§4.3 / D-16）。公司为 `null`（没归一化出来）时由父组件整块跳过。 */
export function CompanyPanel(props: { company: CompanyProfileDto; onSaved: () => void }) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">公司画像</h3>
      {/* 拉黑状态必须显眼地说出来，并且**说清它不做什么** ——
          否则用户会以为拉黑之后岗位就不再出现了。 */}
      {props.company.blacklisted ? (
        <div className="jh-alert jh-alert-warn">
          <div className="jh-alert-head">
            <span className="jh-alert-title">这家公司被你标记为「拉黑」</span>
          </div>
          <p className="jh-alert-body">
            这是你的人工标记。它不会自动隐藏该公司的岗位，只是在这里提示你。
          </p>
        </div>
      ) : null}
      <ul className="jh-kv">
        <li><span>归一化名</span><code>{props.company.nameNorm}</code></li>
        <li><span>行业</span><span>{props.company.industry ?? '—'}</span></li>
        <li><span>性质</span><span>{props.company.nature ?? '—'}</span></li>
        <li><span>规模</span><span>{props.company.size ?? '—'}</span></li>
        <li><span>在手岗位</span><span>{props.company.jobCount}</span></li>
        <li><span>技术栈广度</span><span>{props.company.stackDiversity}</span></li>
        <li><span>地域跨度</span><span>{props.company.geoSpread}</span></li>
        <li>
          <span>驻场比例</span>
          <span>
            {props.company.onsiteRatio === null
              ? '—'
              : `${String(Math.round(props.company.onsiteRatio * 100))}%`}
          </span>
        </li>
        <li><span>名称关键词</span><span>{props.company.nameKeywordHits}</span></li>
        <li>
          <span>外包分 / 诈骗分</span>
          <span>{String(props.company.outsourcingScore ?? 0)} / {String(props.company.fraudScore ?? 0)}</span>
        </li>
        <li>
          <span>拉黑</span>
          <span>{props.company.blacklisted ? '已拉黑' : '否'}</span>
        </li>
      </ul>
      <p className="jh-note">
        冷启动时统计信号弱（D-16）：岗位越多判断越准，依据不足时这些数字会偏低。
      </p>
      {/* key 绑公司：切到另一家时必须重挂，否则输入框里会留着上一家的标签 */}
      <CompanyReview key={props.company.id} company={props.company} onSaved={props.onSaved} />
    </section>
  )
}
