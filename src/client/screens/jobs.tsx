import { useState, type FormEvent } from 'react'
import type { JobDto } from '../../shared/dto.js'
import { JOB_FLAG_LABEL, JOB_STATES } from '../../shared/enums.js'
import { fetchJobs } from '../api.js'
import { JOB_STATE_LABEL } from '../labels.js'
import { useAsync } from '../use-async.js'

interface Filters {
  q: string
  city: string
  state: string
  minSalary: string
  orderBy: string
  descending: boolean
}

const EMPTY_FILTERS: Filters = {
  q: '',
  city: '',
  state: '',
  minSalary: '',
  orderBy: 'crawled_at',
  descending: true,
}

const ORDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'crawled_at', label: '按抓取时间' },
  { value: 'salary_min', label: '按月薪' },
  { value: 'last_seen_at', label: '按最近出现' },
  { value: 'title', label: '按标题' },
]

const PAGE_SIZE = 20

/** U1 岗位库 —— 核心工作界面（§5.4）。 */
export function JobsScreen(props: { revision: number; onSelect: (id: number) => void }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const { state, reload } = useAsync(
    (signal) =>
      fetchJobs(
        {
          q: applied.q,
          city: applied.city,
          state: applied.state,
          minSalary: applied.minSalary === '' ? null : Number(applied.minSalary),
          orderBy: applied.orderBy,
          descending: applied.descending,
          page,
          pageSize: PAGE_SIZE,
        },
        signal,
      ),
    [props.revision, applied, page],
  )

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setApplied(draft)
    setPage(1)
  }

  const reset = (): void => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  return (
    <div className="jh-screen">
      <form className="jh-filters" onSubmit={submit}>
        <input
          className="jh-input"
          placeholder="关键词（岗位名）"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
        <input
          className="jh-input jh-input-narrow"
          placeholder="城市"
          value={draft.city}
          onChange={(event) => setDraft({ ...draft, city: event.target.value })}
        />
        <select
          className="jh-input jh-input-narrow"
          value={draft.state}
          onChange={(event) => setDraft({ ...draft, state: event.target.value })}
        >
          <option value="">全部状态</option>
          {JOB_STATES.map((value) => (
            <option key={value} value={value}>
              {JOB_STATE_LABEL[value]}
            </option>
          ))}
        </select>
        <input
          className="jh-input jh-input-narrow"
          placeholder="最低月薪"
          inputMode="numeric"
          value={draft.minSalary}
          onChange={(event) => setDraft({ ...draft, minSalary: event.target.value.replace(/[^0-9]/g, '') })}
        />
        <select
          className="jh-input jh-input-narrow"
          value={draft.orderBy}
          onChange={(event) => setDraft({ ...draft, orderBy: event.target.value })}
        >
          {ORDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="jh-btn jh-btn-inline">筛选</button>
        <button type="button" className="jh-btn jh-btn-inline" onClick={reset}>重置</button>
      </form>

      {state.status === 'loading' && <p className="jh-muted">正在查询岗位…</p>}

      {state.status === 'error' && (
        <div className="jh-card">
          <h2 className="jh-card-title">查询失败</h2>
          <p className="jh-error">{state.message}</p>
          {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
          <button type="button" className="jh-btn" onClick={reload}>重试</button>
        </div>
      )}

      {state.status === 'ok' && state.data.items.length === 0 && (
        <div className="jh-card">
          <h2 className="jh-card-title">没有符合条件的岗位</h2>
          <p className="jh-muted">
            共 {state.data.total} 条。换个关键词或放宽筛选条件试试；也可以回到「今日」手动抓取一次。
          </p>
        </div>
      )}

      {state.status === 'ok' && state.data.items.length > 0 && (
        <>
          <div className="jh-listbar">
            <span className="jh-muted">
              共 {state.data.total} 条 · 第 {state.data.page} 页
            </span>
            <span className="jh-spacer" />
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline"
              disabled={!state.data.hasMore}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>

          <ul className="jh-jobs">
            {state.data.items.map((job) => (
              <li key={job.id}>
                <button type="button" className="jh-job" onClick={() => props.onSelect(job.id)}>
                  <span className="jh-job-main">
                    <span className="jh-job-title">{job.title}</span>
                    <span className="jh-job-meta">
                      <b className="jh-salary">{job.salaryRaw}</b>
                      <span>{job.city}{job.district === '' ? '' : `·${job.district}`}</span>
                      <span className="jh-job-company">{job.companyName ?? '—'}</span>
                    </span>
                    {job.tags.length === 0 ? null : (
                      <span className="jh-tags">
                        {job.tags.slice(0, 8).map((tag) => (
                          <span key={tag} className="jh-tag">{tag}</span>
                        ))}
                      </span>
                    )}
                    {(job.flagTypes.length > 0 || job.matchScore !== null) && (
                      <span className="jh-job-signals">
                        {job.matchScore === null ? null : (
                          // 明确写「粗筛」：L1 规则分不是完整评估（§4.5.1）
                          <span className="jh-score">粗筛 {job.matchScore}</span>
                        )}
                        {job.flagTypes.map((type) => (
                          <span key={type} className={`jh-flag jh-flag-${type}`}>
                            {JOB_FLAG_LABEL[type]}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className={`jh-state jh-state-${job.state}`}>{JOB_STATE_LABEL[job.state]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** 薪资展示：原文优先，归一化结果只作补充（§4.10.2：解析结果不覆盖原文）。 */
export function salaryDetail(job: JobDto): string | null {
  if (job.salaryMin === null) return null
  const range =
    job.salaryMax === null || job.salaryMax === job.salaryMin
      ? String(job.salaryMin)
      : `${String(job.salaryMin)}-${String(job.salaryMax)}`
  return `${range} 元/月${job.salaryMonths === null ? '' : ` · ${String(job.salaryMonths)} 薪`}`
}
