import type { FollowUpDto } from '../../../shared/contract/dto/pipeline.js'

export function FollowUpRow(props: { item: FollowUpDto; onOpen: (id: number) => void }) {
  const { item } = props
  return (
    <li className={`jh-followup jh-followup-${item.kind}`}>
      <button type="button" className="jh-link" onClick={() => props.onOpen(item.jobId)}>
        {item.companyName ?? ''} {item.jobTitle ?? `岗位 #${String(item.jobId)}`}
      </button>
      <p className="jh-muted">{item.message}</p>
      <p className={item.kind === 'unread-timeout' ? 'jh-muted' : 'jh-warn'}>{item.advice}</p>
    </li>
  )
}




