import { CompanyJobs } from '../company-jobs.js'

/** 「这家公司的其它岗位」——`onSelect` 为 `undefined`（抽屉场景）时那一列渲染成纯文本。 */
export function CompanyJobsPanel(props: {
  companyId: number
  jobCount: number
  currentJobId: number
  onSelect: ((id: number) => void) | undefined
}) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">这家公司的其它岗位</h3>
      <CompanyJobs
        companyId={props.companyId}
        jobCount={props.jobCount}
        currentJobId={props.currentJobId}
        onSelect={props.onSelect}
      />
    </section>
  )
}
