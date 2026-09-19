import { useState, type FormEvent } from 'react'
import {
  APPLICATION_STAGE_LABEL,
  CONTACT_STAGE_LABEL,
  JOB_FLAG_LABEL,
  JOB_FLAG_TYPES,
  JOB_STATES,
  type JobFlagType,
  type JobState,
} from '../../shared/enums.js'
import { buildExpChips, sortEduValues, type ExpChip } from '../../shared/facets.js'
import { fetchDedupGroup, fetchJobFacets, fetchJobs, markJob } from '../api.js'
import { FieldHint } from '../field-hint.js'
import { JOB_STATE_LABEL, relativeTime } from '../labels.js'
import { useAsync } from '../use-async.js'
import { JobDetailPane } from './job-detail.js'
import { BatchDeliverModal } from './jobs/batch-deliver-modal.js'
import { BatchGreetingModal } from './jobs/batch-greeting-modal.js'

interface Filters {
  q: string
  /**
   * 城市：命中任意一个即可；空 = 不限。
   *
   * 界面上是**单选下拉**（2026-09-18：从一排 chips 改成下拉，与关键词 / 月薪 同排），
   * 但底层仍按数组传 —— 查询层的多城市是一条已经验证过的路径，不为了一个下拉把它拆掉，
   * 以后要恢复多选也只是换个控件的事。
   */
  cities: string[]
  /**
   * 经验：存的是**标准梯队的 chip id**，不是平台原始串。
   *
   * 原始串在库里就有十几二十种写法（`1-3年` / `1年～3年` / `2-3年` / `2年及以上`…），
   * 全铺出来用户没法选。选中一个梯队，查询时再展开成它名下的原始取值（见 `facets.ts`）。
   */
  expBuckets: string[]
  /** 学历要求多选：取值来自 facet（平台原始串，界面按学历梯度排过序）。 */
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
  expBuckets: [],
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

/**
 * 已选梯队 → 传给查询的原始取值。
 *
 * 这一步是"标准梯队"能成立的关键：界面按梯队选，查询按库里的原始串查，
 * 所以归并既没有丢岗位，也没有把用户锁在某个平台的写法里。
 */
export function expandExpBuckets(ids: string[], chips: ExpChip[]): string[] {
  const wanted = new Set(ids)
  return chips.filter((chip) => wanted.has(chip.id)).flatMap((chip) => chip.values)
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
 * 行内「打招呼 / 投递简历」的两枚小图标 —— 与 ✕ 排在同一列、同一个 34px 方块里。
 *
 * 手画 SVG 而不是图标字体：✕ / ★ 这类字形在部分中文字体里会退回豆腐块
 * （`.jh-chip-neg` 那段注释已经吃过一次亏），而 SVG + `stroke="currentColor"`
 * 跟着按钮颜色走、两套主题都在，缩放与强制色彩模式下也不会丢。
 * 14px 是为了与 15px 的 ✕ 字形对齐视觉重量（字形本身的墨迹比它的字号小）。
 */
function IconChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M2 3.6A1.6 1.6 0 0 1 3.6 2h8.8A1.6 1.6 0 0 1 14 3.6v5.8a1.6 1.6 0 0 1-1.6 1.6H6.8L4 13.6V11A1.6 1.6 0 0 1 2 9.4z" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M14.5 1.5 9.6 14.5 6.7 9.3 1.5 6.4z" />
      <path d="M14.5 1.5 6.7 9.3" />
    </svg>
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
  /**
   * 高级筛选默认收起。
   *
   * 全铺开时筛选条比列表本身还高，而经验 / 学历 / 屏蔽这些是**偶尔**才动的；
   * 常规那几个（关键词 / 城市 / 月薪 / 状态）才是每次筛选都要看的。
   */
  const [advancedOpen, setAdvancedOpen] = useState(false)
  /**
   * 勾选的岗位（批量打招呼用，D3 / U1）。
   *
   * 保的是 **id 数组**而不是"当前页哪些行"：用户翻页再选也不会丢
   * （批量本来就是"先把要发的挑齐、再一次性看预览"的动作）。
   */
  const [picked, setPicked] = useState<number[]>([])
  /**
   * 两个弹窗的**目标岗位**（`null` = 关着）。
   *
   * 存的是 id 数组而不是一个布尔开关：批量入口传勾选集合，行内入口传 `[job.id]`。
   * 一个弹窗一份目标，就不会出现"单条点击悄悄混进批量列表"这种事。
   */
  const [greetTargets, setGreetTargets] = useState<number[] | null>(null)
  const [deliverTargets, setDeliverTargets] = useState<number[] | null>(null)
  /** 批量发送的结果提示（这一屏没有全局 toast，就地显示最直接）。 */
  const [batchNote, setBatchNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // 筛选器的选项集：一次性拉取，失败不阻塞筛选。
  // **必须排在 jobs 查询之前** —— 经验筛选存的是梯队 id，要先用它把 id 展开成原始取值，
  // 查询才知道该带哪些值下去。
  const facets = useAsync((signal) => fetchJobFacets(signal), [])
  const facetData = facets.state.status === 'ok' ? facets.state.data : null
  const citiesAll: string[] = facetData?.cities ?? []
  /** 学历 chips：按学历梯度正向排列（原来跟着 SQL 的字母序走，顺序是乱的）。 */
  const eduAll: string[] = sortEduValues(facetData?.eduReqs ?? [])
  /** 经验 chips：十几个重叠的原始写法归并成最多 6 个标准梯队。 */
  const expChips: ExpChip[] = buildExpChips(facetData?.expReqs ?? [])

  /** 已选梯队展开成的原始取值 —— 它才是传给查询的东西。 */
  const appliedExpReqs = expandExpBuckets(applied.expBuckets, expChips)

  const { state, reload } = useAsync(
    (signal) =>
      fetchJobs(
        {
          q: applied.q,
          cities: applied.cities,
          expReqs: appliedExpReqs,
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
    // `appliedExpReqs` 是 facet 的函数，而 facet 比首屏查询晚到 ——
    // 不把展开结果算进依赖，梯队就会"选了没反应"（第一次查询根本没带上它）。
    [props.revision, applied, page, appliedExpReqs.join(',')],
  )

  /** 城市：下拉单选。底层仍传数组（见 `Filters.cities` 的注释）。 */
  const setCity = (city: string): void => {
    setDraft((current) => ({ ...current, cities: city === '' ? [] : [city] }))
  }

  const toggleExpBucket = (id: string): void => {
    setDraft((current) => ({ ...current, expBuckets: toggleValue(current.expBuckets, id) }))
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

  /**
   * 排序：**立即生效**，不等「筛选」。
   *
   * 它本来长在筛选条里，但排序改的是"结果怎么排"，不是"结果有哪些" ——
   * 改完之后还要再点一次「筛选」才生效，是把这个控件放在了错误的语义位置上。
   * 现在它在列表头栏（用户正看着的那个列表），点完当场重排。
   */
  const changeOrder = (orderBy: string): void => {
    setDraft((current) => ({ ...current, orderBy }))
    setApplied((current) => ({ ...current, orderBy }))
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
  /**
   * 高级筛选里选中的条件条数。
   *
   * 收起之后，被折叠的那些 chips 在界面上就没有任何痕迹了 —— 用户会以为"我什么都没选"
   * 而列表却是筛过的。所以把条数写在折叠开关上：条件没白设，一眼看得见。
   * 只统计折叠面板里的（经验 / 学历 / 新增时间 / 屏蔽 / 跨平台折叠）：
   * 常驻的那几个控件一直看得见，不用它替自己说话。
   *
   * 经验按**梯队个数**算（不是展开后的原始取值个数）：用户选的是 1 个 chip，
   * 就该显示"已选 1 项"，而不是它背后压着 3 个平台写法。
   */
  const advancedCount =
    draft.expBuckets.length +
    draft.eduReqs.length +
    draft.excludeFlags.length +
    (draft.newWindow === '' ? 0 : 1) +
    (draft.groupDuplicates ? 1 : 0)

  return (
    <div className="jh-jobs-split">
      {/* 筛选区：**一条朴素的常规工具条 + 一个「高级筛选」折叠**（2026-09-18 重做）。
          上一版拆成两个带标题、竖条、分隔线的"块"，还上了对齐网格 —— 在一屏本来就不宽的
          界面里堆了整套表单装饰，按钮被 margin-left:auto 推到屏幕另一头，离它要提交的控件老远。
          这一版做减法：常规条件就是一条工具条，按钮紧跟在最后一个控件后面；
          高级条件收进折叠面板，面板里只用"标签 + 控件"两列排布，没有边框、没有底色、没有标题。
          另外：一屏里同时出现胶囊 / 分段控件 / 拨杆三种形状本身就是噪音，
          所以新增时间回到原生单选下拉（原生 select 天然不可多选），
          跨平台折叠用项目里既有的复选框（.jh-check），形状只在**颜色**上做区分。 */}
      <form className="jh-jobs-filters" onSubmit={submit}>
        <div className="jh-jobs-filter-line">
          <input
            className="jh-input jh-input-grow"
            placeholder="关键词（岗位名）"
            aria-label="关键词"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
          <select
            className="jh-select jh-input-md"
            aria-label="城市"
            value={draft.cities[0] ?? ''}
            onChange={(event) => setCity(event.target.value)}
          >
            <option value="">全部城市</option>
            {citiesAll.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <select
            className="jh-select jh-input-md"
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
          {/* 主次分明：筛选是主操作（实心），重置是三级动作（无边框）。
              贴在最后一个控件后面 —— 筛选条是一句话，按钮是这句话的句号，
              不该飘到屏幕另一头（那是上一版最刺眼的毛病）。 */}
          <button type="submit" className="jh-btn jh-btn-inline jh-btn-primary">筛选</button>
          <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={reset}>重置</button>
        </div>

        {/* 折叠开关：一整行只有一行小字，不抢视线 */}
        <button
          type="button"
          className="jh-jobs-filter-toggle"
          aria-expanded={advancedOpen}
          aria-controls="jh-jobs-advanced"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span className="jh-jobs-filter-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
          <span className="jh-jobs-filter-toggle-text">高级筛选</span>
          <span className={`jh-filter-note${advancedCount > 0 ? ' jh-filter-note-on' : ''}`}>
            {advancedCount > 0 ? `已选 ${String(advancedCount)} 项` : '经验 / 学历 / 新增时间 / 屏蔽 / 跨平台折叠'}
          </span>
        </button>
        {/* 收起用 hidden 而不是不渲染：DOM 留着，aria-controls 才有指向，展开时也不重建控件。
            ⚠️ 必须配 `.jh-jobs-filter-panel[hidden]{display:none}` —— 类选择器的 display 会盖掉
            UA 样式表里的 [hidden]，不写这条就收不起来。
            类名一律带 `jh-jobs-` 前缀：同一个仓库里有别的会话在并行改界面，
            `jh-filter-panel` 这种通用名已经撞过一次（流水线屏在用），所以按屏前缀区分。 */}
        <div className="jh-jobs-filter-panel" id="jh-jobs-advanced" hidden={!advancedOpen}>
          {expChips.length === 0 ? null : (
            <div className="jh-jobs-filter-row">
              <span className="jh-jobs-filter-label">
                经验
                <FieldHint text="各平台的经验写法不统一（1-3年 / 1年～3年 / 2-3年 / 2年及以上…），这里归成 6 个标准梯队。选中一档，会把库里属于它的写法一起查出来，所以不会被梯队的名字漏掉。" />
              </span>
              <span className="jh-jobs-filter-body" role="group" aria-label="经验要求（可多选）">
                {expChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`jh-chip${draft.expBuckets.includes(chip.id) ? ' jh-chip-on' : ''}`}
                    aria-pressed={draft.expBuckets.includes(chip.id)}
                    title={`库里属于这一档的写法：${chip.values.join(' / ')}`}
                    onClick={() => toggleExpBucket(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </span>
            </div>
          )}

          {eduAll.length === 0 ? null : (
            <div className="jh-jobs-filter-row">
              <span className="jh-jobs-filter-label">学历</span>
              <span className="jh-jobs-filter-body" role="group" aria-label="学历要求（可多选）">
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
            </div>
          )}

          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">
              新增时间
              <FieldHint text="按「首次见到」时间算，与首屏「今日新增」同口径 —— 再抓一次不会让老岗位混进来（那是「最近见到」）。单选，不选 = 不限。" />
            </span>
            <span className="jh-jobs-filter-body">
              {/* 原生单选下拉：它天然不可多选，"能同时选近24小时和近7天吗"这个疑问不存在。
                  也比分段控件少一种形状 —— 与上面的城市 / 状态下拉是同一套控件。 */}
              <select
                className="jh-select jh-input-md"
                aria-label="只看新增"
                value={draft.newWindow}
                onChange={(event) => setDraft({ ...draft, newWindow: event.target.value })}
              >
                <option value="">不限</option>
                {NEW_JOB_WINDOWS.map((option) => (
                  <option key={option.value} value={option.value} title={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">
              屏蔽
              <FieldHint text="命中标注的岗位一律不显示。标注是本地规则算出来的（外包/高风险/僵尸岗/黑话等），不需要你逐条判断；每一项都可以单独关掉。" />
            </span>
            {/* 负向过滤只靠**颜色**与正向 chips 区分（浅红底 + 红字 + ✕），形状保持同一种胶囊：
                多造一种形状换来的辨识度，抵不过一屏四种控件的杂乱。 */}
            <span className="jh-jobs-filter-body" role="group" aria-label="屏蔽标注">
              {JOB_FLAG_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`jh-chip jh-chip-neg${draft.excludeFlags.includes(type) ? ' jh-chip-neg-on' : ''}`}
                  aria-pressed={draft.excludeFlags.includes(type)}
                  title={`不显示标注为「${JOB_FLAG_LABEL[type]}」的岗位`}
                  onClick={() => toggleExclude(type)}
                >
                  {JOB_FLAG_LABEL[type]}
                </button>
              ))}
            </span>
          </div>

          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">
              折叠
              <FieldHint text="同一条岗位在多个平台各抓一条时只显示一行（展开可看各平台对照）。条数与分页也跟着按折叠后算。默认关闭：折叠会少显示行，「默认少显示」是替你做决定。" />
            </span>
            {/* 复选框而不是拨杆：它和旁边的条件一样**点「筛选」才生效**。
                拨杆的形态承诺"现在就开着了"，放在要提交的表单里反而会误导
                （这也是上一版看起来别扭的原因之一）。 */}
            <span className="jh-jobs-filter-body">
              <label className="jh-check">
                <input
                  type="checkbox"
                  checked={draft.groupDuplicates}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, groupDuplicates: event.target.checked }))
                  }
                />
                跨平台折叠（同一条岗位只显示一行）
              </label>
            </span>
          </div>
        </div>
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
                {/* 排序在列表头栏（2026-09-18）：它决定"结果**怎么排**"，不是"结果有哪些"。
                    留在筛选条里，用户改完还得再点一次「筛选」才生效 —— 那是把它放在了错误的语义位置上。
                    这里改完当场重排（跨平台折叠不在这儿：它改的是"结果有哪些"，属于筛选条件，
                    已经放回上面的折叠面板）。 */}
                <span className="jh-listbar-right">
                  {/* 全选只覆盖**本页**：跨页"全选"在分页列表里是歧义动作
                      （用户以为选了 20 条，实际选了 200 条）——所以文案里写明"本页" */}
                  {state.data.items.length === 0 ? null : (
                    <label className="jh-check">
                      <input
                        type="checkbox"
                        checked={
                          state.data.items.every((job) => picked.includes(job.id)) &&
                          state.data.items.length > 0
                        }
                        onChange={(event) =>
                          setPicked((current) => {
                            const ids = state.data.items.map((job) => job.id)
                            if (!event.target.checked) return current.filter((id) => !ids.includes(id))
                            return [...current, ...ids.filter((id) => !current.includes(id))]
                          })
                        }
                      />
                      <span>选中本页</span>
                    </label>
                  )}
                  <label className="jh-sort">
                    <span className="jh-sort-label">排序</span>
                    <select
                      className="jh-select jh-sort-select"
                      value={applied.orderBy}
                      onChange={(event) => changeOrder(event.target.value)}
                    >
                      {ORDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Pager page={state.data.page} pages={pages} hasMore={state.data.hasMore} onGo={setPage} />
                </span>
              </div>

              {batchNote === null ? null : (
                <p className={batchNote.tone === 'ok' ? 'jh-ok' : 'jh-error'}>{batchNote.text}</p>
              )}

              {/* 批量工具条：只在有勾选时出现（没勾选时它占的那一行是纯粹的噪音） */}
              {picked.length === 0 ? null : (
                <div className="jh-picked">
                  <span>已选 {picked.length} 条</span>
                  <span className="jh-spacer" />
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    onClick={() => {
                      setBatchNote(null)
                      setGreetTargets(picked)
                    }}
                  >
                    批量打招呼（{picked.length}）
                  </button>
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    onClick={() => {
                      setBatchNote(null)
                      setDeliverTargets(picked)
                    }}
                  >
                    批量投递（{picked.length}）
                  </button>
                  <button type="button" className="jh-btn jh-btn-inline" onClick={() => setPicked([])}>
                    清除选择
                  </button>
                  <FieldHint text="批量打招呼会先做一次**只读预览**：逐条列出能不能发、为什么不能，正文可以逐条改或跳过。真正的发送要你在预览里确认一次，之后按每批最多 5 条依次发出（条与条之间会等 3–9 秒 —— 连点是最明显的机器信号，慢是有意的）。" />
                  <FieldHint text="批量投递（L4）走的是**平台上已有的那份**简历，投出去**不可逆**。它会先做一次只读预览：逐条列出能不能投、为什么不能（只有接了投递动作的平台能投）。默认关闭 —— 需要在「设置 → 系统控制中心 → 发送分层」里先打开 L4 投递。" />
                </div>
              )}

              <ul className="jh-jobs">
                {state.data.items.map((job) => {
                  const active = job.id === props.selected
                  const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
                  // 两个时间回答的是两个不同的问题，都要露在卡片上：
                  //   抓取 = 这份记录是什么时候拿到手的（数据来路，也是列表默认排序用的那一列）
                  //   最近见到 = 最近一次在平台上又看到它（新鲜度，"这岗还在招吗"）
                  // 解析不出来就印原始串（与详情页一致），不硬凑一个"未知时间"。
                  const crawled = relativeTime(job.crawledAt) ?? job.crawledAt
                  const seen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt
                  return (
                    <li key={job.id}>
                      <div className="jh-job-row">
                        {/* 勾选框：单独一列，不嵌在"点开详情"的按钮里
                            （按钮嵌控件是无效 HTML，读屏与键盘都会乱）。
                            它的存在只为一件事：批量打招呼（D3 / U1）。 */}
                        <span className="jh-job-pick">
                          <input
                            type="checkbox"
                            checked={picked.includes(job.id)}
                            aria-label={`选中「${job.title}」（用于批量打招呼）`}
                            onChange={(event) =>
                              setPicked((current) =>
                                event.target.checked
                                  ? [...current, job.id]
                                  : current.filter((id) => id !== job.id),
                              )
                            }
                          />
                        </span>
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
                            {/* 来源平台 + 两个时间：一条岗位从哪来、这份记录什么时候拿到的、
                                最近一次见到它是什么时候。抓取时间正是列表默认排序用的那一列
                                （`crawled_at`），可它在界面上从来没露过面 —— 用户按"抓取时间"
                                排完了，却指不出哪一列是它。两个都写 `title` 给出精确时刻：
                                相对时间好读，绝对时间才是事实。 */}
                            <span className="jh-job-origin">
                              <span>{job.platformName ?? job.platformId}</span>
                              <span title={job.crawledAt}>抓取 {crawled}</span>
                              <span title={job.lastSeenAt}>最近见到 {seen}</span>
                              {/* 批次 4：这条岗位在别的平台也在招（同一组）。
                                  徽章只是**读数**；"展开对照"是卡片下面那枚开关。 */}
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
                        {/* 卡片右侧的行内动作，自上而下：打招呼 → 投递简历 → 划掉。
                            这一列只放"对这一条做什么"，「收藏」因此去掉了：★ 与 ✕ 本来是
                            一对互斥的处置态开关，而现在这一列要放两个对外动作 —— 三个按钮
                            各 34px 已经够高，收藏在详情里照样能改，不必两条路径并列。
                            跨平台「对照」也移出了这一列（见下面那枚独立的开关）。 */}
                        <span className="jh-job-quick" role="group" aria-label="行内动作">
                          {/* 打招呼 / 投递简历：与 ✕ **同一种形态**（34px 方块 + 一个图标），
                              三个按钮排成一列，宽度一致、不随文案长短抖动。
                              动作含义靠 tooltip 与 aria-label 说，不占卡片宽度。
                              点下去不直接发送：把这一条预置进既有弹窗，预览、话术、限额、
                              回执与批量入口完全同一套，不另长一条发送链路。
                              已经接触过 / 投过的置灰（`:disabled`），tooltip 里写明是哪个阶段。 */}
                          <button
                            type="button"
                            className="jh-job-qk"
                            aria-label={job.contactStage === 'none' ? '打招呼' : CONTACT_STAGE_LABEL[job.contactStage]}
                            title={
                              job.contactStage === 'none'
                                ? '打招呼（先只读预览，确认后才发）'
                                : `${CONTACT_STAGE_LABEL[job.contactStage]} —— 不重复发`
                            }
                            disabled={job.contactStage !== 'none'}
                            onClick={() => {
                              setBatchNote(null)
                              setGreetTargets([job.id])
                            }}
                          >
                            <IconChat />
                          </button>
                          <button
                            type="button"
                            className="jh-job-qk"
                            aria-label={job.applicationStage === null ? '投递简历' : APPLICATION_STAGE_LABEL[job.applicationStage]}
                            title={
                              job.applicationStage === null
                                ? '投递简历（不可逆，预览里确认后才发）'
                                : `${APPLICATION_STAGE_LABEL[job.applicationStage]} —— 不重复投`
                            }
                            disabled={job.applicationStage !== null}
                            onClick={() => {
                              setBatchNote(null)
                              setDeliverTargets([job.id])
                            }}
                          >
                            <IconSend />
                          </button>
                          {/* 划掉 = ignored，再点一次回到中性的 seen。
                              与详情里的动作条看同一份状态，改完整列重载。 */}
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
                      {/* 跨平台对照的开关。放在卡片**下面**而不是卡片里面：卡片本身就是一个
                          按钮（点它 = 看详情），按钮里再嵌按钮是无效 HTML，读屏与键盘都会乱 ——
                          它原来挤在快捷列里也是这个原因。展开的内容仍落在这一行下面，
                          不遮住列表其它行。 */}
                      {job.dedupGroupId === null ? null : (
                        <button
                          type="button"
                          className={`jh-dedup-toggle${openGroup === job.dedupGroupId ? ' jh-dedup-toggle-on' : ''}`}
                          aria-expanded={openGroup === job.dedupGroupId}
                          title="这条岗位在别的平台也在招 —— 点开看各平台的对照"
                          onClick={() => setOpenGroup(openGroup === job.dedupGroupId ? null : job.dedupGroupId)}
                        >
                          {openGroup === job.dedupGroupId ? '收起跨平台对照' : '跨平台对照'}
                        </button>
                      )}
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

      {/* 打招呼（D3 / U1）：勾选走批量，行内点单条走同一套 —— 预览（逐条正文可改/可跳过）
          → 一次确认 → 分批发送 → 逐条回执，两个入口只有"目标是谁"这一点不同 */}
      {greetTargets === null ? null : (
        <BatchGreetingModal
          jobIds={greetTargets}
          onClose={() => setGreetTargets(null)}
          onBatchDone={() => {
            // 每批发完刷一次：接触态与列表里的状态可能都变了
            reload()
            props.onChanged()
          }}
          notify={(tone, text) => setBatchNote({ tone, text })}
        />
      )}

      {/* 投递（L4）：**不可逆** —— 预览里只有"投哪些/跳过哪些"，没有可编辑内容 */}
      {deliverTargets === null ? null : (
        <BatchDeliverModal
          jobIds={deliverTargets}
          onClose={() => setDeliverTargets(null)}
          onBatchDone={() => {
            // 每批发完刷一次：投递记录、看板与岗位状态都可能变了
            reload()
            props.onChanged()
          }}
          notify={(tone, text) => setBatchNote({ tone, text })}
        />
      )}
    </div>
  )
}
