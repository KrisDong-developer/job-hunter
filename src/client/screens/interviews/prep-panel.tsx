import { useAsync } from '../../hooks/use-async.js'
import { fetchInterviewPrep } from '../../net/inbox.js'

/** 准备包：技能差距 + 公司风险 + 错题 + 检查清单。 */
export function PrepPanel(props: { id: number }) {
  const prep = useAsync((signal) => fetchInterviewPrep(props.id, signal), [props.id])
  if (prep.state.status !== 'ok') return <p className="jh-muted">正在准备…</p>
  const data = prep.state.data
  return (
    <div className="jh-card jh-card-tight">
      <p className="jh-muted">{data.commute.advice}</p>
      {data.matchedSkills.length > 0 ? (
        <p className="jh-muted">你有的：{data.matchedSkills.join('、')}</p>
      ) : null}
      {data.missingSkills.length > 0 ? (
        <p className="jh-warn">
          会被追问但你简历里没有的：{data.missingSkills.slice(0, 10).join('、')} ——
          如实说"没用过，但我知道它解决什么问题"，不要硬扯。
        </p>
      ) : null}
      {data.companyFlags.length > 0 ? <p className="jh-warn">公司风险：{data.companyFlags.join('；')}</p> : null}
      {data.questionNotes.length > 0 ? (
        <div>
          <p className="jh-muted">错题本（按被问次数）：</p>
          <ul className="jh-tailor-notes">
            {data.questionNotes.slice(0, 5).map((note) => (
              <li key={note.id}>
                · {note.question}（{note.times} 次）
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="jh-tailor-notes">
        {data.checklist.map((item, index) => (
          <li key={String(index)}>· {item}</li>
        ))}
      </ul>
      {data.notes.map((note, index) => (
        <p className="jh-muted" key={String(index)}>
          注意：{note}
        </p>
      ))}
    </div>
  )
}




