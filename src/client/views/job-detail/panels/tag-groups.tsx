/** 标签按"技能要求 / 公司福利"分组：一锅端地平铺，读者分不清哪些是硬要求、哪些是待遇 */
export function TagGroups(props: { grouped: { skills: string[]; benefits: string[] } }) {
  return (
    <div className="jh-card jh-card-tight">
      {/* 卡片标题（2026-09-23 卡片化收口）：与其它卡同一档，组名降为卡内小节 */}
      <h3 className="jh-card-title">标签</h3>
      {props.grouped.skills.length === 0 ? null : (
        <div className="jh-tag-group">
          <span className="jh-tag-group-name">技能要求</span>
          <div className="jh-tags">
            {props.grouped.skills.map((tag) => <span key={tag} className="jh-tag">{tag}</span>)}
          </div>
        </div>
      )}
      {props.grouped.benefits.length === 0 ? null : (
        <div className="jh-tag-group">
          <span className="jh-tag-group-name">公司福利</span>
          <div className="jh-tags">
            {props.grouped.benefits.map((tag) => <span key={tag} className="jh-tag">{tag}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
