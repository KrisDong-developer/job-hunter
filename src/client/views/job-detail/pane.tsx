import { InlineMd } from '../../ui/inline-md.js'
import type { JobDto } from '../../../shared/contract/dto/job.js'
import { JobDetailBody } from './body.js'

/**
 * U2 岗位详情 —— **右侧内嵌栏**（岗位库在用）。
 *
 * 早先是抽屉，但岗位库是"浏览 → 比较 → 决定"的主界面：弹层会盖住列表，
 * 想对比下一个就得先关掉再点，来回两步。改成左右分栏后列表不动、详情常驻。
 *
 * 空态不是"什么都不显示"：留一句该怎么用 + 一句"标注只是初筛"的提醒。
 */
export function JobDetailPane(props: {
  id: number | null
  revision: number
  onChanged: () => void
  /** 列表就在左边，所以"这家公司的其它岗位"可以直接点着切过去。 */
  onSelect?: ((id: number) => void) | undefined
  /** 列表里那条已有数据 —— 换岗位时先把头部画出来，别让整栏塌一下（见 `body.tsx`）。 */
  fallback?: JobDto | null
}) {
  if (props.id === null) {
    return (
      <section className="jh-detail-pane jh-detail-pane-empty" data-job-hunter="job-detail" aria-label="岗位详情">
        <p className="jh-detail-empty-title">从左侧选一个岗位</p>
        <p className="jh-note">详情会显示在这里，列表保持不动，方便一个个往下比。</p>
        <p className="jh-note">
          <InlineMd text="列表上的「粗筛分」与风险标注只是初筛；点进来能看到每一条结论的**原文依据**。" />
        </p>
      </section>
    )
  }
  return (
    <section className="jh-detail-pane" data-job-hunter="job-detail" aria-label="岗位详情">
      <JobDetailBody
        id={props.id}
        revision={props.revision}
        onChanged={props.onChanged}
        onSelect={props.onSelect}
        fallback={props.fallback ?? null}
      />
    </section>
  )
}


