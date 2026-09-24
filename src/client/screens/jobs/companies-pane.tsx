import { useState, type FormEvent } from 'react'
import { COMPANY_ORDER_OPTIONS, type CompanyOrderValue } from '../../../shared/contract/enums/job.js'
import type { CompanyPageDto, CompanyProfileDto } from '../../../shared/contract/dto/job.js'
import type { AsyncState } from '../../hooks/use-async.js'
import { LoadingLine } from '../../ui/async-view.js'
import { CompanyRow } from './company-row.js'
import { coDigitsOf } from './company-filters.js'
import { Pager } from './pager.js'

/** 页脚「每页条数」的档位：与岗位维度同一组。 */
const CO_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/**
 * 公司维度的左栏（列表头栏 + 公司列表 + 页脚分页）。
 *
 * 与岗位栏（index.tsx 里的 jobs pane）同一套三态结构（loading / error / ok），
 * 状态本身全部由 `JobsScreen` 持有 —— 这里只负责画（与 FilterBar 同一条纪律）。
 * 跳页草稿是纯局部交互，内聚在这里。
 */
export function CompaniesPane(props: {
  state: AsyncState<CompanyPageDto>
  refreshing: boolean
  page: number
  pageSize: number
  orderBy: CompanyOrderValue
  selectedId: number | null
  /** 拉黑切换进行中的公司 id（禁用那一行的动作，避免连点）。 */
  marking: number | null
  onGo: (page: number) => void
  onPageSize: (size: number) => void
  onOrder: (value: CompanyOrderValue) => void
  onSelect: (id: number) => void
  onViewJobs: (company: CompanyProfileDto) => void
  onBlacklist: (company: CompanyProfileDto, blacklisted: boolean) => void
  onRetry: () => void
}) {
  /** 页脚「跳至 N 页」的草稿（回车提交；非法输入原地不动）。 */
  const [jumpDraft, setJumpDraft] = useState('')

  if (props.state.status === 'loading') {
    return (
      <div className="jh-jobs-pane" data-job-hunter="company-list">
        <LoadingLine busy live="polite">正在查询公司…</LoadingLine>
      </div>
    )
  }
  if (props.state.status === 'error') {
    return (
      <div className="jh-jobs-pane" data-job-hunter="company-list">
        <div className="jh-card">
          <h2 className="jh-card-title">查询失败</h2>
          <p className="jh-error">{props.state.message}</p>
          {props.state.hint === undefined ? null : <p className="jh-muted">{props.state.hint}</p>}
          <button type="button" className="jh-btn" onClick={props.onRetry}>重试</button>
        </div>
      </div>
    )
  }

  const data = props.state.data
  const total = data.total
  const pages = Math.max(1, Math.ceil(total / props.pageSize))
  const hasMore = props.page * props.pageSize < total
  /**
   * 页码已经越界（0 条 + 非零 total）：这一帧先别印"没有符合条件的公司"（那是假话）
   * —— 父组件的 effect 正在把页码夹回去（岗位侧同款处理，见 index.tsx 的注释）。
   */
  const beyondLastPage = data.items.length === 0 && total > 0 && props.page > pages
  /** 当前页里已拉黑的公司数 —— 拉黑的公司默认还列在这里（公司库是全量视角），
   * 数出来只是让"列表里混着几家拉黑过的"有句交代，不用逐行扫徽章。 */
  const blacklistedCount = data.items.filter((company) => company.blacklisted).length

  const submitJump = (event: FormEvent): void => {
    event.preventDefault()
    if (jumpDraft === '') return
    const target = Math.trunc(Number(jumpDraft))
    if (Number.isFinite(target)) props.onGo(Math.max(1, Math.min(target, pages)))
    setJumpDraft('')
  }

  return (
    <div className="jh-jobs-pane" data-job-hunter="company-list" aria-busy={props.refreshing ? true : undefined}>
      {beyondLastPage ? (
        <LoadingLine busy live="polite">这一页已经没有公司了，正在回到最后一页…</LoadingLine>
      ) : data.items.length === 0 ? (
        <div className="jh-card">
          <h2 className="jh-card-title">没有符合条件的公司</h2>
          <p className="jh-muted">共 0 家。换个关键词，或放宽筛选条件（标签 / 岗位数）试试。</p>
        </div>
      ) : (
        <>
          {/* 列表头栏：计数说明 + 排序（右端，与岗位维度同一布局）。 */}
          <div className="jh-listbar">
            <span className="jh-listbar-note">
              共 {String(total)} 家公司{blacklistedCount === 0 ? '' : ` · 含已拉黑 ${String(blacklistedCount)} 家`}
            </span>
            {props.refreshing ? (
              <span className="jh-refreshing" role="status">更新中…</span>
            ) : null}
            <span className="jh-listbar-right">
              <select
                className="jh-select jh-sort-select"
                aria-label="排序"
                value={props.orderBy}
                onChange={(event) => props.onOrder(event.target.value as CompanyOrderValue)}
              >
                {COMPANY_ORDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <ul className="jh-jobs">
            {data.items.map((company) => (
              <CompanyRow
                key={company.id}
                company={company}
                active={company.id === props.selectedId}
                marking={props.marking === company.id}
                onSelect={props.onSelect}
                onViewJobs={props.onViewJobs}
                onBlacklist={props.onBlacklist}
              />
            ))}
          </ul>

          {/* 页脚三件套：每页条数 · 页码 · 跳页（与岗位维度同一套）。 */}
          <div className="jh-jobs-foot">
            <label className="jh-jobs-foot-size">
              每页
              <select
                className="jh-select"
                aria-label="每页条数"
                value={String(props.pageSize)}
                onChange={(event) => props.onPageSize(Number(event.target.value))}
              >
                {CO_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={String(size)}>
                    {String(size)} 家
                  </option>
                ))}
              </select>
            </label>
            <div className="jh-jobs-foot-right">
              <Pager page={props.page} pages={pages} hasMore={hasMore} onGo={props.onGo} />
              {pages < 5 ? null : (
                <form className="jh-jump" onSubmit={submitJump}>
                  <input
                    className="jh-input jh-jump-input"
                    inputMode="numeric"
                    value={jumpDraft}
                    maxLength={5}
                    aria-label="跳到第几页"
                    onChange={(event) => setJumpDraft(coDigitsOf(event.target.value))}
                  />
                  <span>页</span>
                  <button type="submit" className="jh-btn jh-btn-inline jh-btn-quiet">跳</button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
