import { useAsync } from '../../hooks/use-async.js'
import { fetchEnglishCheck } from '../../net/overseas.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'

/** 简历的英文体检（M1：**只检查，不翻译**）。 */
export function EnglishCheckPanel(props: { resumeId: number }) {
  const check = useAsync((signal) => fetchEnglishCheck(props.resumeId, signal), [props.resumeId])
  if (check.state.status === 'loading') return <LoadingLine>正在体检…</LoadingLine>
  if (check.state.status === 'error') return <ErrorLine>体检失败：{check.state.message}</ErrorLine>
  return (
    <div>
      {check.state.data.items.length === 0 ? (
        <p className="jh-ok">英文简历体检没有发现问题。</p>
      ) : (
        <ul className="jh-issues">
          {check.state.data.items.map((issue, index) => (
            <li key={String(index)} className={issue.level === 'error' ? 'jh-error' : 'jh-warn'}>
              <b>{issue.level === 'error' ? '必改' : '建议'}</b> {issue.message}
            </li>
          ))}
        </ul>
      )}
      <p className="jh-muted">{check.state.data.note}</p>
    </div>
  )
}




