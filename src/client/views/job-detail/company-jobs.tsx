import { useAsync } from '../../hooks/use-async.js'
import { fetchCompanyDetail } from '../../net/companies.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'

/**
 * 「这家公司的其它在招岗位」。
 *
 * 公司画像里原本只给一个数字（"在手岗位 37"），而那 37 条**是什么**才是判断依据 ——
 * 外包/广撒网的识别本来就建立在"岗位数 × 地域跨度 × 驻场比例"上，
 * 光看汇总数字没法验证这个结论。
 *
 * 数据一直在 `GET /companies/:id` 里（含该公司岗位列表），只是客户端从来没调过。
 */
export function CompanyJobs(props: {
  companyId: number
  jobCount: number
  currentJobId: number
  onSelect: ((id: number) => void) | undefined
}) {
  const { state } = useAsync(
    (signal) => fetchCompanyDetail(props.companyId, signal),
    [props.companyId],
  )

  if (state.status === 'loading') return <LoadingLine className="jh-note">正在读取该公司的其它岗位…</LoadingLine>
  if (state.status === 'error') return <ErrorLine className="jh-note">读取该公司岗位失败：{state.message}</ErrorLine>

  const others = state.data.jobs.filter((job) => job.id !== props.currentJobId)
  if (others.length === 0) {
    return <p className="jh-note">除当前这个岗位外，这家公司在你库里没有其它在招岗位。</p>
  }

  return (
    <>
      <ul className="jh-siblings">
        {others.map((job) => {
          const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
          const meta = [job.city, requirements, job.salaryRaw].filter((item) => item !== '').join('｜')
          return (
            <li key={job.id}>
              {props.onSelect === undefined ? (
                // 抽屉场景（流水线/消息/面试）没有"切换岗位"的上下文 ——
                // 那时渲染成纯文本，而不是一个点了没反应的按钮。
                <span className="jh-sibling jh-sibling-static">
                  <span>{job.title}</span>
                  <span className="jh-sibling-meta">{meta}</span>
                </span>
              ) : (
                <button type="button" className="jh-sibling" onClick={() => props.onSelect?.(job.id)}>
                  <span>{job.title}</span>
                  <span className="jh-sibling-meta">{meta}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {props.jobCount > state.data.jobs.length ? (
        <p className="jh-note">
          该公司共 {props.jobCount} 个岗位，这里只列出最近更新的 {state.data.jobs.length} 条。
        </p>
      ) : null}
    </>
  )
}


