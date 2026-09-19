import { useAsync } from '../../hooks/use-async.js'
import { fetchDedupGroup } from '../../net/dedup.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'

/**
 * 跨平台对照（批次 4）。
 *
 * 展开那一行才拉这一条分组 —— **不预取**全部分组：大多数行用户根本不会展开，
 * 预取等于每次翻页都多传一份全库的分组。
 *
 * 表里给的是**同一个岗位在不同平台的原始样子**（标题、薪资、城市都可能不一样）——
 * 那正是用户要比的东西：A 平台写 20-30K、B 平台写"面议"，谁更靠谱一眼看得出。
 */
export function DedupComparePane(props: { groupId: number; onSelect: (id: number) => void }) {
  const { state } = useAsync((signal) => fetchDedupGroup(props.groupId, signal), [props.groupId])
  if (state.status === 'loading') {
    return (
      <LoadingLine busy live="polite">
        正在读取同岗位的其它来源…
      </LoadingLine>
    )
  }
  if (state.status === 'error') return <ErrorLine>{state.message}</ErrorLine>

  const group = state.data
  return (
    <div className="jh-dedup-pane">
      <div className="jh-muted">判定依据：{group.basis}</div>
      <div className="jh-table-scroll">
        <table className="jh-table jh-table-matrix">
          <thead>
            <tr>
              <th scope="col">来源</th>
              <th scope="col">标题</th>
              <th scope="col">薪资</th>
              <th scope="col" className="jh-col-hide-sm">城市</th>
              <th scope="col">原页面</th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((member) => (
              <tr key={member.id}>
                <td>
                  {member.platformName ?? member.platformId}
                  {member.isPrimary ? <span className="jh-muted">（主）</span> : null}
                </td>
                <td>
                  {/* 点标题 = 在右侧详情里看它（列表里那一行可能是同组的另一条） */}
                  <button type="button" className="jh-link" onClick={() => props.onSelect(member.id)}>
                    {member.title}
                  </button>
                </td>
                <td className="jh-num">{member.salaryRaw}</td>
                <td className="jh-col-hide-sm">{member.city}</td>
                <td>
                  <a className="jh-link" href={member.sourceUrl} target="_blank" rel="noreferrer">
                    打开
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
