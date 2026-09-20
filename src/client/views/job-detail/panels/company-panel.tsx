import type { CompanyProfileDto } from '../../../../shared/contract/dto/job.js'
import { CompanyReview } from '../company-review.js'

/** 公司画像 + 人工复核（§4.3 / D-16）。公司为 `null`（没归一化出来）时由父组件整块跳过。 */
export function CompanyPanel(props: { company: CompanyProfileDto; onSaved: () => void }) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">公司画像</h3>
      {/* 拉黑状态必须显眼地说出来，并且**说清它现在到底做了什么** ——
          第五轮（批次 B）之后：岗位库里的「排除已拉黑公司的岗位」默认开着，
          也就是这家公司的岗位**默认不再出现**；隐藏了几条会写在列表头栏，点那里能显示回来。
          这段文案与实现必须一致：写"会隐藏"而实际不隐藏，或反过来，都是在骗人。 */}
      {props.company.blacklisted ? (
        <div className="jh-alert jh-alert-warn">
          <div className="jh-alert-head">
            <span className="jh-alert-title">这家公司被你标记为「拉黑」</span>
          </div>
          <p className="jh-alert-body">
            岗位库默认不再显示这家公司的岗位（筛选里的「排除已拉黑公司的岗位」默认开着）。
            被隐藏了几条会写在列表头栏，点那里就能显示回来。
            {props.company.note === null ? '' : `备注：${props.company.note}`}
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
