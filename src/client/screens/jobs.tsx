import { useState, type FormEvent } from 'react'
import { JOB_FLAG_LABEL, JOB_FLAG_TYPES, JOB_STATES, type JobFlagType, type JobState } from '../../shared/enums.js'
import { fetchDedupGroup, fetchJobFacets, fetchJobs, markJob } from '../api.js'
import { JOB_STATE_LABEL, relativeTime } from '../labels.js'
import { useAsync } from '../use-async.js'
import { JobDetailPane } from './job-detail.js'

interface Filters {
  q: string
  /** 多城市：命中任意一个即可；空 = 不限。 */
  cities: string[]
  /** 经验 / 学历要求多选：取值来自 facet（平台原始串）。 */
  expReqs: string[]
  eduReqs: string[]
  state: string
  minSalary: string
  /** 屏蔽这些标注类型的岗位（命中任意一个就不显示）。 */
  excludeFlags: JobFlagType[]
  /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
  groupDuplicates: boolean
  /** 只看新增的时间窗（'' = 全部）。见 `NEW_JOB_WINDOWS`。 */
  newWindow: string
  orderBy: string
  descending: boolean
}

const EMPTY_FILTERS: Filters = {
  q: '',
  cities: [],
  expReqs: [],
  eduReqs: [],
  state: '',
  minSalary: '',
  excludeFlags: [],
  groupDuplicates: false,
  newWindow: '',
  orderBy: 'crawled_at',
  descending: true,
}

/** 多选 chips 的通用取反：选中就移除，未选中就追加。 */
function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

const ORDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'crawled_at', label: '按抓取时间' },
  { value: 'salary_min', label: '按月薪' },
  { value: 'last_seen_at', label: '按最近出现' },
  { value: 'first_seen_at', label: '按首次出现' },
  { value: 'title', label: '按标题' },
]

/**
 * 「只看新增」的时间窗。
 *
 * 24 小时这一档**必须与首屏「今日新增」同口径**（`domain/today.ts` 的
 * `NEW_JOB_WINDOW_MS` 就是 24 小时）—— 写成"今天零点"会让首屏说 12 条、列表筛出 3 条，
 * 而两者看的是同一列 `first_seen_at`，用户只会以为其中之一坏了。
 */
const NEW_JOB_WINDOWS: Array<{ value: string; label: string; hours: number }> = [
  { value: '1d', label: '近 24 小时', hours: 24 },
  { value: '3d', label: '近 3 天', hours: 72 },
  { value: '7d', label: '近 7 天', hours: 168 },
]

/** 时间窗 → ISO 起始时刻。空窗（'' = 全部）返回 `undefined`。 */
export function firstSeenSinceOf(window: string, now: number = Date.now()): string | undefined {
  const found = NEW_JOB_WINDOWS.find((item) => item.value === window)
  if (found === undefined) return undefined
  return new Date(now - found.hours * 60 * 60 * 1000).toISOString()
}

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
 * 跨平台对照（批次 4）。
 *
 * 展开那一行才拉这一条分组 —— **不预取**全部分组：大多数行用户根本不会展开，
 * 预取等于每次翻页都多传一份全库的分组。
 *
 * 表里给的是**同一个岗位在不同平台的原始样子**（标题、薪资、城市都可能不一样）——
 * 那正是用户要比的东西：A 平台写 20-30K、B 平台写"面议"，谁更靠谱一眼看得出。
 */
function DedupComparePane(props: { groupId: number; onSelect: (id: number) => void }) {
  const { state } = useAsync((signal) => fetchDedupGroup(props.groupId, signal), [props.groupId])
  if (state.status === 'loading') {
    return (
      <p className="jh-muted" aria-busy="true" aria-live="polite">
        正在读取同岗位的其它来源…
      </p>
    )
  }
  if (state.status === 'error') return <p className="jh-error">{state.message}</p>

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
  /** 展开着的那一行的去重组 id（同时只开一个：列表本来就密，多开就没法比了）。 */
  const [openGroup, setOpenGroup] = useState<number | null>(null)

  const { state, reload } = useAsync(
    (signal) =>
      fetchJobs(
        {
          q: applied.q,
          cities: applied.cities,
          expReqs: applied.expReqs,
          eduReqs: applied.eduReqs,
          state: applied.state,
          minSalary: applied.minSalary === '' ? null : Number(applied.minSalary),
          excludeFlags: applied.excludeFlags,
          groupDuplicates: applied.groupDuplicates,
          // 「只看新增」：把时间窗算成 ISO 再传（宿主只做比较，不猜"今天"从哪算起）
          firstSeenSince: firstSeenSinceOf(applied.newWindow),
          orderBy: applied.orderBy,
          descending: applied.descending,
          page,
          pageSize: PAGE_SIZE,
        },
        signal,
      ),
    [props.revision, applied, page],
  )

  // 多选 chips 需要"有哪些取值"这个选项集；一次性拉取，失败不阻塞筛选。
  const facets = useAsync((signal) => fetchJobFacets(signal), [])
  const facetData = facets.state.status === 'ok' ? facets.state.data : null
  const citiesAll: string[] = facetData?.cities ?? []
  const expAll: string[] = facetData?.expReqs ?? []
  const eduAll: string[] = facetData?.eduReqs ?? []

  const toggleCity = (city: string): void => {
    setDraft((current) => ({ ...current, cities: toggleValue(current.cities, city) }))
  }

  const toggleExp = (value: string): void => {
    setDraft((current) => ({ ...current, expReqs: toggleValue(current.expReqs, value) }))
  }

  const toggleEdu = (value: string): void => {
    setDraft((current) => ({ ...current, eduReqs: toggleValue(current.eduReqs, value) }))
  }

  const toggleExclude = (type: JobFlagType): void => {
    setDraft((current) => ({
      ...current,
      excludeFlags: current.excludeFlags.includes(type)
        ? current.excludeFlags.filter((item) => item !== type)
        : [...current.excludeFlags, type],
    }))
  }

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

  /** 正在被快捷标记的岗位 id（列表很密，单张卡片内闪烁即可，不必弹整条错误）。 */
  const [marking, setMarking] = useState<number | null>(null)
  const quickMark = async (id: number, state: JobState): Promise<void> => {
    setMarking(id)
    try {
      await markJob(id, state)
      props.onChanged()
    } catch {
      // 标记失败时列表状态不真实 —— 但整列不该为此闪出一条错误横幅。
      // 让 onChanged 触发的重载把真实状态画回去即可。
      props.onChanged()
    } finally {
      setMarking(null)
    }
  }

  const total = state.status === 'ok' ? state.data.total : 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  /** 已生效的「只看新增」窗口名（用于列表头说明，避免用户困惑"怎么这么少"）。 */
  const appliedWindowLabel =
    NEW_JOB_WINDOWS.find((item) => item.value === applied.newWindow)?.label ?? null

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

        {/* 城市多选（从已有岗位库去重而来）+ 屏蔽标注：都是点的补充条件，点完直接筛选 */}
        {citiesAll.length === 0 ? null : (
          <span className="jh-filter-row" role="group" aria-label="城市（可多选）">
            <span className="jh-filter-label">城市</span>
            {citiesAll.map((city) => (
              <button
                key={city}
                type="button"
                className={`jh-chip${draft.cities.includes(city) ? ' jh-chip-on' : ''}`}
                aria-pressed={draft.cities.includes(city)}
                onClick={() => toggleCity(city)}
              >
                {city}
              </button>
            ))}
          </span>
        )}
        {/* 经验 / 学历：与城市同一套多选 chips。取值来自库里的真实数据，
            所以不会出现"点了得到 0 条"的选项。 */}
        {expAll.length === 0 ? null : (
          <span className="jh-filter-row" role="group" aria-label="经验要求（可多选）">
            <span className="jh-filter-label">经验</span>
            {expAll.map((value) => (
              <button
                key={value}
                type="button"
                className={`jh-chip${draft.expReqs.includes(value) ? ' jh-chip-on' : ''}`}
                aria-pressed={draft.expReqs.includes(value)}
                onClick={() => toggleExp(value)}
              >
                {value}
              </button>
            ))}
          </span>
        )}
        {eduAll.length === 0 ? null : (
          <span className="jh-filter-row" role="group" aria-label="学历要求（可多选）">
            <span className="jh-filter-label">学历</span>
            {eduAll.map((value) => (
              <button
                key={value}
                type="button"
                className={`jh-chip${draft.eduReqs.includes(value) ? ' jh-chip-on' : ''}`}
                aria-pressed={draft.eduReqs.includes(value)}
                onClick={() => toggleEdu(value)}
              >
                {value}
              </button>
            ))}
          </span>
        )}
        <span className="jh-filter-row" role="group" aria-label="屏蔽标注">
          <span className="jh-filter-label">屏蔽</span>
          {JOB_FLAG_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`jh-chip${draft.excludeFlags.includes(type) ? ' jh-chip-on' : ''}`}
              aria-pressed={draft.excludeFlags.includes(type)}
              title={`不显示标注为「${JOB_FLAG_LABEL[type]}」的岗位`}
              onClick={() => toggleExclude(type)}
            >
              {JOB_FLAG_LABEL[type]}
            </button>
          ))}
        </span>

        {/* 「新增」时间窗：存量与增量的分界线。按**首次见到**时间（`first_seen_at`）算，
            与首屏「今日新增」同口径；再抓一次不会让老岗位混进来（那是 `last_seen_at`）。
            单选，点已选中的那个即回到「全部」。 */}
        <span className="jh-filter-row" role="group" aria-label="只看新增">
          <span className="jh-filter-label">新增</span>
          {NEW_JOB_WINDOWS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`jh-chip${draft.newWindow === option.value ? ' jh-chip-on' : ''}`}
              aria-pressed={draft.newWindow === option.value}
              title={`只看${option.label}第一次出现的岗位（按首次见到时间算，与首屏「今日新增」同口径）`}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  newWindow: current.newWindow === option.value ? '' : option.value,
                }))
              }
            >
              {option.label}
            </button>
          ))}
        </span>

        {/* 批次 4：跨平台折叠。同一条岗位在多个平台各抓一条时，列表里只留一行 ——
            点开那一行的「跨平台对照」能看到它在别的平台都是什么样的。
            默认关闭：折叠会少显示行，"默认少显示"是替用户做决定。 */}
        <span className="jh-filter-row" role="group" aria-label="跨平台折叠">
          <button
            type="button"
            className={`jh-chip${draft.groupDuplicates ? ' jh-chip-on' : ''}`}
            aria-pressed={draft.groupDuplicates}
            title="同一条岗位在多个平台各抓一条时只显示一行（展开可看各平台对照）。条数与分页也跟着按折叠后算。"
            onClick={() => setDraft((current) => ({ ...current, groupDuplicates: !current.groupDuplicates }))}
          >
            跨平台折叠
          </button>
        </span>
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
                  共 {state.data.total} 条
                  {applied.groupDuplicates ? '（已按跨平台折叠，同一条岗位只算一行）' : ''}
                  {appliedWindowLabel === null ? '' : `（只看${appliedWindowLabel}的新增）`} · 第{' '}
                  {state.data.page} / {pages} 页
                </span>
                <Pager page={state.data.page} pages={pages} hasMore={state.data.hasMore} onGo={setPage} />
              </div>

              <ul className="jh-jobs">
                {state.data.items.map((job) => {
                  const active = job.id === props.selected
                  const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
                  const seen = relativeTime(job.lastSeenAt)
                  return (
                    <li key={job.id}>
                      <div className="jh-job-row">
                        <button
                          type="button"
                          className={`jh-job${active ? ' jh-job-active' : ''}`}
                          data-job-id={job.id}
                          aria-current={active ? 'true' : undefined}
                          /* 卡片里塞着标题/薪资/城市/公司/标签/分数/状态，读屏会把这一长串
                             当成按钮名念完（实测约 60 字）。给一个**短而完整**的名称，
                             卡内文本对读屏隐藏 —— 视觉完全不变。 */
                          aria-label={`岗位：${job.title}，${job.salaryRaw}，${job.city}${job.district === '' ? '' : `·${job.district}`}，${JOB_STATE_LABEL[job.state]}`}
                          onClick={() => props.onSelect(job.id)}
                        >
                          <span className="jh-job-main" aria-hidden="true">
                            <span className="jh-job-title">{job.title}</span>
                            <span className="jh-job-meta">
                              <b className="jh-salary">{job.salaryRaw}</b>
                              <span>{job.city}{job.district === '' ? '' : `·${job.district}`}</span>
                              {/* 经验与学历合成一格："3-5年·本科"。两个都缺就整格不占位 ——
                                  宁可少一格，也不要出现"—·—"这种占位垃圾。 */}
                              {requirements === '' ? null : <span>{requirements}</span>}
                              <span className="jh-job-company">{job.companyName ?? '—'}</span>
                            </span>
                            {/* 来源与新鲜度：一条岗位从哪来、最近一次见到是什么时候。
                                后者比「首次见到」更能回答"这岗还在招吗"——它一直用于排序，
                                却从来没在界面上露过面。 */}
                            <span className="jh-job-origin">
                              <span>{job.platformName ?? job.platformId}</span>
                              {seen === null ? null : <span>最近见到 {seen}</span>}
                              {/* 批次 4：这条岗位在别的平台也在招（同一组）。
                                  徽章只是**读数**，"展开对照"在右侧那个按钮上。 */}
                              {job.dedupGroupId === null ? null : (
                                <span className="jh-dedup-badge" title="与其它平台的同一岗位合并成了一组">
                                  跨平台
                                </span>
                              )}
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
                          <span className={`jh-state jh-state-${job.state}`} aria-hidden="true">{JOB_STATE_LABEL[job.state]}</span>
                        </button>
                        {/* 卡片右侧的快捷标记：处理单个岗位不用每次先进详情。
                            划掉 = ignored，收藏 = saved；再点一次回到中性的 seen。
                            与详情里的动作条看同一份状态，改完整列重载。 */}
                        <span className="jh-job-quick" role="group" aria-label="快捷标记">
                          {/* 批次 4：跨平台对照。放在主按钮**外面** ——
                              按钮嵌按钮是无效 HTML，读屏与键盘都会乱。 */}
                          {job.dedupGroupId === null ? null : (
                            <button
                              type="button"
                              className={`jh-job-qk jh-job-qk-wide${openGroup === job.dedupGroupId ? ' jh-job-qk-on' : ''}`}
                              aria-expanded={openGroup === job.dedupGroupId}
                              title="这条岗位在别的平台也在招 —— 点开看各平台的对照"
                              onClick={() =>
                                setOpenGroup(openGroup === job.dedupGroupId ? null : job.dedupGroupId)
                              }
                            >
                              对照
                            </button>
                          )}
                          <button
                            type="button"
                            className={`jh-job-qk${job.state === 'saved' ? ' jh-job-qk-on' : ''}`}
                            aria-label={job.state === 'saved' ? '取消收藏' : '收藏'}
                            aria-pressed={job.state === 'saved'}
                            title={job.state === 'saved' ? '取消收藏（回到已读）' : '收藏'}
                            disabled={marking === job.id}
                            onClick={() => void quickMark(job.id, job.state === 'saved' ? 'seen' : 'saved')}
                          >★</button>
                          <button
                            type="button"
                            className={`jh-job-qk${job.state === 'ignored' ? ' jh-job-qk-ign' : ''}`}
                            aria-label={job.state === 'ignored' ? '恢复' : '划掉'}
                            aria-pressed={job.state === 'ignored'}
                            title={job.state === 'ignored' ? '取消划掉（回到已读）' : '划掉（忽略）'}
                            disabled={marking === job.id}
                            onClick={() => void quickMark(job.id, job.state === 'ignored' ? 'seen' : 'ignored')}
                          >✕</button>
                        </span>
                      </div>
                      {/* 跨平台对照：展开在那一行**下面**，不遮住列表其它行 */}
                      {job.dedupGroupId === null || openGroup !== job.dedupGroupId ? null : (
                        <DedupComparePane groupId={job.dedupGroupId} onSelect={props.onSelect} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <JobDetailPane
          id={props.selected}
          revision={props.revision}
          onChanged={props.onChanged}
          onSelect={props.onSelect}
        />
      </div>
    </div>
  )
}
