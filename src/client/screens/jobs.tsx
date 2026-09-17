import { useState, type FormEvent } from 'react'
import { JOB_FLAG_LABEL, JOB_STATES } from '../../shared/enums.js'
import { fetchJobs } from '../api.js'
import { JOB_STATE_LABEL } from '../labels.js'
import { useAsync } from '../use-async.js'
import { JobDetailPane } from './job-detail.js'

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

/**
 * 页码列表：页数少就全列；多了只留首尾与当前附近，中间用 … 收。
 * 只给"上一页/下一页"的话，用户不知道一共有多少页（也就不知道还要不要继续筛）。
 */
export function pageNumbers(page: number, pages: number): Array<number | '…'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const wanted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  let previous = 0
  for (const value of wanted) {
    if (previous !== 0 && value - previous > 1) out.push('…')
    out.push(value)
    previous = value
  }
  return out
}

function Pager(props: {
  page: number
  pages: number
  hasMore: boolean
  onGo: (page: number) => void
}) {
  return (
    <nav className="jh-pager" aria-label="分页">
      <button
        type="button"
        className="jh-pg"
        aria-label="上一页"
        disabled={props.page <= 1}
        onClick={() => props.onGo(props.page - 1)}
      >
        ‹
      </button>
      {pageNumbers(props.page, props.pages).map((item, index) =>
        item === '…' ? (
          <span key={`gap-${String(index)}`} className="jh-pg-gap">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={`jh-pg${item === props.page ? ' jh-pg-active' : ''}`}
            aria-current={item === props.page ? 'page' : undefined}
            onClick={() => props.onGo(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="jh-pg"
        aria-label="下一页"
        disabled={!props.hasMore}
        onClick={() => props.onGo(props.page + 1)}
      >
        ›
      </button>
    </nav>
  )
}

/**
 * U1 岗位库 —— 核心工作界面（§5.4）。
 *
 * **左边列表、右边详情，都在同一屏**：这个屏的主任务是"浏览 → 比较 → 决定"，
 * 用弹层的话每看下一个都要先关掉再点，来回两步；分栏之后列表不动、详情常驻。
 * （流水线 / 消息 / 面试仍用抽屉 —— 那三个屏是"处理一件事"，临时看一眼更合适。）
 *
 * 两栏各自滚动：筛选条固定在顶部，列表滚到哪儿都不影响右边在读的详情。
 */
export function JobsScreen(props: {
  revision: number
  selected: number | null
  onSelect: (id: number) => void
  onChanged: () => void
}) {
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

  const total = state.status === 'ok' ? state.data.total : 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="jh-jobs-split">
      <form className="jh-filters" onSubmit={submit}>
        <input
          className="jh-input jh-input-grow"
          placeholder="关键词（岗位名）"
          aria-label="关键词"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
        <input
          className="jh-input jh-input-sm"
          placeholder="城市"
          aria-label="城市"
          value={draft.city}
          onChange={(event) => setDraft({ ...draft, city: event.target.value })}
        />
        <select
          className="jh-select jh-input-sm"
          aria-label="状态"
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
          className="jh-input jh-input-sm"
          placeholder="最低月薪"
          aria-label="最低月薪"
          inputMode="numeric"
          value={draft.minSalary}
          onChange={(event) => setDraft({ ...draft, minSalary: event.target.value.replace(/[^0-9]/g, '') })}
        />
        <select
          className="jh-select jh-input-sm"
          aria-label="排序"
          value={draft.orderBy}
          onChange={(event) => setDraft({ ...draft, orderBy: event.target.value })}
        >
          {ORDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* 主次分明：筛选是主操作（实心），重置是三级动作（无边框） */}
        <button type="submit" className="jh-btn jh-btn-inline jh-btn-primary">筛选</button>
        <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={reset}>重置</button>
      </form>

      <div className="jh-jobs-cols">
        <div className="jh-jobs-pane" data-job-hunter="job-list">
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
                  共 {state.data.total} 条 · 第 {state.data.page} / {pages} 页
                </span>
                <Pager page={state.data.page} pages={pages} hasMore={state.data.hasMore} onGo={setPage} />
              </div>

              <ul className="jh-jobs">
                {state.data.items.map((job) => {
                  const active = job.id === props.selected
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        className={`jh-job${active ? ' jh-job-active' : ''}`}
                        data-job-id={job.id}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => props.onSelect(job.id)}
                      >
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
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <JobDetailPane id={props.selected} revision={props.revision} onChanged={props.onChanged} />
      </div>
    </div>
  )
}
