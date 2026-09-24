import { useEffect, useState, type FormEvent } from 'react'
import { PAGE_SIZE_DEFAULT } from '../../../shared/config/limits.js'
import {
  JOB_ORDER_OPTIONS,
  JOB_STATE_LABEL,
  type JobFlagType,
  type JobOrderValue,
  type JobState,
} from '../../../shared/contract/enums/job.js'
import type { CompanyProfileDto, SavedJobViewDto } from '../../../shared/contract/dto/job.js'
import { buildExpChips, sortEduValues, type ExpChip } from '../../../shared/domain/job-facets.js'
import { jobsToMarkdown } from '../../format/job.js'
import { useAsync } from '../../hooks/use-async.js'
import { ApiError } from '../../net/client.js'
import {
  fetchJobFacets,
  fetchJobViews,
  fetchJobs,
  jobsExportUrl,
  markJob,
  markJobs,
  recomputeStaleScores,
  saveJobViews,
} from '../../net/jobs.js'
import { LoadingLine } from '../../ui/async-view.js'
import { copyText } from '../../ui/clipboard.js'
import { CompanyDetailPane } from '../../views/company-detail/pane.js'
import { JobDetailPane } from '../../views/job-detail/pane.js'
import { BatchDeliverModal } from './batch-deliver-modal.js'
import { BatchGreetingModal } from './batch-greeting-modal.js'
import { BatchToolbar } from './batch-toolbar.js'
import { CompanyBar } from './company-bar.js'
import { CompaniesPane } from './companies-pane.js'
import { FilterBar } from './filter-bar.js'
import { useCompanies } from './use-companies.js'
import {
  EMPTY_FILTERS,
  clampScoreInput,
  describeAppliedFilters,
  digitsOf,
  expandExpBuckets,
  firstSeenSinceOf,
  salaryInput,
  sameFilters,
  toggleValue,
  type Filters,
} from './filters.js'
import { JobRow } from './job-row.js'
import { Pager } from './pager.js'

/** 接口错误的可读文案（与两个批量弹窗里的 `reasonOf` 同一套口径）。 */
function reasonOf(error: unknown): string {
  return error instanceof ApiError ? error.display : error instanceof Error ? error.message : String(error)
}

/** 页脚「每页条数」的档位（2026-09-20 布局重排）：上限对齐宿主的 `PAGE_SIZE_MAX`（100）。 */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

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
  /**
   * 列表维度：岗位（逐条岗位）↔ 公司（按公司汇总）。
   *
   * 切换是**视图行为**，不是数据变更 —— 两侧的筛选草稿 / 已生效条件 / 页码 / 勾选
   * 全部保留：切到公司看一眼画像，切回来还是刚才那屏岗位。
   * 选中态分开持有：岗位选中沿用 `props.selected`（app 层，岗位 id 语义），
   * 公司选中留在本屏内部 —— 对 app 层零侵入。
   */
  const [dimension, setDimension] = useState<'jobs' | 'companies'>('jobs')
  /** 公司维度：正在看哪家公司的详情。 */
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  /**
   * 岗位维度的"只看某家公司"范围（公司卡「查看岗位」设置的跳转上下文）。
   *
   * 刻意**不**放进 `Filters`：它会跟着"保存的筛选视图"一起落库（setting 表），
   * 而服务端校验 `JobFilterState` 的字段清单里没有它 —— 混进去就是给视图系统埋雷。
   * 头栏给一枚可移除的 chip，让"列表正被限定着"永远看得见。
   */
  const [jobCompanyScope, setJobCompanyScope] = useState<{ id: number; name: string } | null>(null)
  /**
   * 公司维度的列表状态机（查询 + 筛选双态 + 分页 + 行内拉黑）拆在
   * `use-companies.ts` —— 岗位侧的状态清单本来就长，两种维度混在一个组件里
   * 就要先分清"哪个是哪个维度的"。留在**这里**的只有跨维度协调：
   * `dimension`（两个维度之间的路由）、`selectedCompanyId`（右栏详情的选中态）、
   * `jobCompanyScope`（跳回岗位侧时要带着的限定）。
   */
  const companies = useCompanies({ revision: props.revision, onChanged: props.onChanged })
  /**
   * 每页条数（2026-09-20 页脚分页）：宿主早就接受 `pageSize` 参数（1–100，见 routes/jobs.ts），
   * 界面此前一直写死 20 —— 数据攒多了只能一页页翻。改档时**夹住当前页**而不是跳回第 1 页：
   * 用户在第 5 页把每页调大，想看的还是原来那批岗位附近，不是从头再来。
   */
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  /** 页脚「跳至 N 页」的草稿（回车提交；非法输入原地不动，不值得为此弹错）。 */
  const [jumpDraft, setJumpDraft] = useState('')
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
  /**
   * 就地提示（这一屏没有全局 toast）。
   *
   * 第五轮起它不只装"批量发送的结果"：批量处置、视图保存、重算、复制都往这里写。
   * 渲染在列表栏里，并且带 `role=status / alert` —— 加这个角色是因为它此前是个
   * 无角色的 `<p>`，读屏全程静默（审核 P2-5）；
   * 另外两个弹窗**自己也会显示同一句**（列表栏那时被遮罩盖着）。
   */
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  /**
   * 保存的筛选视图（第五轮，批次 B2）。
   *
   * 存在宿主 `setting` 表里（跨标签一致、会跟着全量导出一起备份），
   * 校验在服务端做（`domain/job-views.ts`：读到宽容、写到严格）。
   */
  const [views, setViews] = useState<SavedJobViewDto[]>([])
  /** 当前套用的是哪个视图（`''` = 没套用）。只用来显示与"删除视图"。 */
  const [appliedViewId, setAppliedViewId] = useState('')
  /** 批量处置进行中（禁用工具条按钮，避免连点）。 */
  const [markingBatch, setMarkingBatch] = useState(false)
  /**
   * 上一次批量处置的撤销入口。
   *
   * 只记 id 与"标回哪个状态"——撤销回到的是中性的**已读**，不是各自的原始状态：
   * 勾选可以跨页，原状态没跟着 id 一起带过来，声称"已恢复原状"就是撒谎。
   */
  const [undoMark, setUndoMark] = useState<{ ids: number[]; count: number } | null>(null)
  /** 重算过期分数进行中。 */
  const [recomputing, setRecomputing] = useState(false)

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

  /**
   * 保存的筛选视图（批次 B2）：一次性拉取，失败只是没有视图可用，不阻塞筛选。
   *
   * 用 effect 同步进本地 state 而不是每次渲染都读 `viewsQuery.state`：
   * 保存/删除后要就地更新列表（并回写服务端），本地 state 是它的可写副本。
   */
  const viewsQuery = useAsync((signal) => fetchJobViews(signal), [])
  useEffect(() => {
    if (viewsQuery.state.status === 'ok') setViews(viewsQuery.state.data.views)
  }, [viewsQuery.state])

  const { state, reload, refreshing } = useAsync(
    (signal) =>
      fetchJobs(
        {
          q: applied.q,
          cities: applied.cities,
          // 公司维度的「查看岗位」设置的限定（头栏有 chip 可移除）
          companyId: jobCompanyScope === null ? undefined : jobCompanyScope.id,
          expReqs: appliedExpReqs,
          eduReqs: applied.eduReqs,
          state: applied.state,
          minSalary: applied.minSalary === '' ? null : Number(applied.minSalary),
          // 匹配分门槛（批次 A）：空串 = 不限。未打分的岗位不会被返回（见 JobListParams）
          minScore: applied.minScore === '' ? null : Number(applied.minScore),
          excludeFlags: applied.excludeFlags,
          // 排除已拉黑公司（批次 B）：默认开着，隐藏了几条由服务端算好一起回传
          excludeBlacklisted: applied.excludeBlacklisted,
          groupDuplicates: applied.groupDuplicates,
          // 「只看新增」：把时间窗算成 ISO 再传（宿主只做比较，不猜"今天"从哪算起）
          firstSeenSince: firstSeenSinceOf(applied.newWindow),
          orderBy: applied.orderBy,
          descending: applied.descending,
          page,
          pageSize,
        },
        signal,
      ),
    // `appliedExpReqs` 是 facet 的函数，而 facet 比首屏查询晚到 ——
    // 不把展开结果算进依赖，梯队就会"选了没反应"（第一次查询根本没带上它）。
    // `jobCompanyScope?.id`：公司卡「查看岗位」改的就是它，不进依赖切过去列表不动。
    [props.revision, applied, page, pageSize, appliedExpReqs.join(','), jobCompanyScope?.id],
    // keepPrevious（第四轮，审核 P2-6）：翻页 / 改筛选 / 外部刷新时列表不再整块消失 ——
    // 这一屏是"左列表 + 右详情"的对照阅读，整列闪一下正好打断它。
    // 重取期间沿用上一次结果，界面另用 refreshing 说明"这是旧数据，正在更新"。
    { keepPrevious: true },
  )

  /**
   * 页码越界时自动回到最后一页（第四轮，审核 P2-8）。
   *
   * 结果集会在两次重取之间缩小（例如当前筛着「只看新增」，在第 5 页把某条行内"划掉"，
   * 它随即离开结果集），而宿主**不夹页码**（routes/jobs.ts 直接按 (page-1)*pageSize 取）。
   * 不处理的话左栏会印出"没有符合条件的岗位／共 12 条"这种自相矛盾的一屏，
   * 分页器上也找不到当前页。夹回去之后 page 变化会触发一次正常重取。
   */
  useEffect(() => {
    if (state.status !== 'ok') return
    if (state.data.total === 0 || state.data.items.length > 0) return
    const lastPage = Math.max(1, Math.ceil(state.data.total / pageSize))
    if (page > lastPage) setPage(lastPage)
  }, [state, page, pageSize])

  /** 城市：工具条下拉（单选）。底层仍传数组（见 `Filters.cities` 的注释）。 */
  const setCity = (city: string): void => {
    setDraft((current) => ({ ...current, cities: city === '' ? [] : [city] }))
  }

  /**
   * 城市：面板里的 chips（多选）。
   *
   * 与上面的下拉写的是同一份 `cities` —— 单选是"我只看这一个城市"，
   * 多选是"这两个城市一起看"，两者不是两套条件，所以共用一个数组。
   */
  const toggleCity = (city: string): void => {
    setDraft((current) => ({ ...current, cities: toggleValue(current.cities, city) }))
  }

  const setKeyword = (q: string): void => {
    setDraft({ ...draft, q })
  }

  const setState = (state: string): void => {
    setDraft({ ...draft, state })
  }

  const setMinSalary = (minSalary: string): void => {
    setDraft({ ...draft, minSalary: salaryInput(minSalary) })
  }

  /** 最低分（批次 A）：与"最低月薪"同款 —— 空串 = 不限；上限由界面收敛（0–100）。 */
  const setMinScore = (minScore: string): void => {
    setDraft({ ...draft, minScore: clampScoreInput(minScore) })
  }

  const setExcludeBlacklisted = (excludeBlacklisted: boolean): void => {
    setDraft((current) => ({ ...current, excludeBlacklisted }))
  }

  /**
   * 把「排除已拉黑公司」关掉并重查（列表头栏与空态卡里那两个"显示"都走它）。
   *
   * 单独抽出来是因为它出现两次，而它做的事有个细节：**draft 与 applied 一起改**。
   * 只改 draft 的话条件不会立即生效（那是个要提交的筛选），用户点了"显示"却什么都没发生。
   */
  const showBlacklistedJobs = (): void => {
    setDraft((current) => ({ ...current, excludeBlacklisted: false }))
    setApplied((current) => ({ ...current, excludeBlacklisted: false }))
    setPage(1)
  }

  const setNewWindow = (newWindow: string): void => {
    setDraft({ ...draft, newWindow })
  }

  const setGroupDuplicates = (groupDuplicates: boolean): void => {
    setDraft((current) => ({ ...current, groupDuplicates }))
  }

  const toggleAdvanced = (): void => {
    setAdvancedOpen((open) => !open)
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
    // 套用某个视图之后又手改了条件再提交 —— 那已经不是那个视图了，
    // 下拉不能继续显示它的名字（控件与事实不一致就是撒谎，本项目在这上面栽过）。
    // 紧跟着 `applyView` 的那种"原样提交"不受影响：两边条件相同 → 不清。
    const using = views.find((item) => item.id === appliedViewId)
    if (using !== undefined && !sameFilters(draft, using.filters)) setAppliedViewId('')
  }

  const reset = (): void => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
    // 重置之后条件不再来自任何视图，下拉也要跟着回到"不套用"
    setAppliedViewId('')
  }

  /**
   * 排序：**立即生效**，不等「筛选」。
   *
   * 它本来长在筛选条里，但排序改的是"结果怎么排"，不是"结果有哪些" ——
   * 改完之后还要再点一次「筛选」才生效，是把这个控件放在了错误的语义位置上。
   * 现在它在列表头栏（用户正看着的那个列表），点完当场重排。
   */
  const changeOrder = (orderBy: JobOrderValue): void => {
    setDraft((current) => ({ ...current, orderBy }))
    setApplied((current) => ({ ...current, orderBy }))
    setPage(1)
  }

  /** 每页条数：夹住当前页（见 state 注释）—— total 还没到手（出错/加载中）就先回第 1 页。 */
  const changePageSize = (size: number): void => {
    setPageSize(size)
    setPage((current) => {
      if (state.status !== 'ok' || state.data.total === 0) return 1
      return Math.max(1, Math.min(current, Math.ceil(state.data.total / size)))
    })
  }

  /** 跳页：夹进 1..pages；空输入与非数字原地不动。 */
  const submitJump = (event: FormEvent): void => {
    event.preventDefault()
    if (jumpDraft === '') return
    const target = Math.trunc(Number(jumpDraft))
    if (Number.isFinite(target)) setPage(Math.max(1, Math.min(target, pages)))
    setJumpDraft('')
  }

  // ── 维度协调（「⇄ 公司」）─────────────────────────────────────────
  // 公司侧的查询 / 筛选 / 分页 / 拉黑都在 `useCompanies` 里；这里只留
  // 两个维度**之间**的跳转 —— 它们要同时动两边的状态，放编排层才看得见全局。

  /** 切维度：什么都不重置 —— 两侧状态各自保活，切回来还是刚才那屏。 */
  const switchDimension = (): void => {
    setDimension((current) => (current === 'jobs' ? 'companies' : 'jobs'))
  }

  /**
   * 公司卡的「查看岗位」：切到岗位维度，并限定只看这家公司。
   *
   * 走 `companyId` 精确匹配（查询层本来就支持），不拿公司名当关键词 ——
   * 关键词只匹配岗位标题，公司名搜出来的多半是空列表。
   * 限定是**跳转上下文**而不是筛选条件：头栏给一枚可移除的 chip，
   * 不写进 `Filters`（它会跟着"保存的视图"落库，见 state 注释）。
   */
  const viewCompanyJobs = (company: CompanyProfileDto): void => {
    setJobCompanyScope({ id: company.id, name: company.name })
    setPage(1)
    setDimension('jobs')
  }

  /** 公司详情里点某条岗位：清掉限定（用户点了具体一条，限定已完成使命）并选中它。 */
  const viewJobFromCompany = (jobId: number): void => {
    setJobCompanyScope(null)
    setDimension('jobs')
    props.onSelect(jobId)
  }

  /** 行内入口：把这一条预置进既有弹窗（与批量入口同一套，只有"目标是谁"不同）。 */
  const greetOne = (id: number): void => {
    setNotice(null)
    setGreetTargets([id])
  }

  const deliverOne = (id: number): void => {
    setNotice(null)
    setDeliverTargets([id])
  }

  const greetPicked = (): void => {
    setNotice(null)
    setGreetTargets(picked)
  }

  const deliverPicked = (): void => {
    setNotice(null)
    setDeliverTargets(picked)
  }

  const clearPicked = (): void => {
    setPicked([])
  }

  /**
   * 批量处置（批次 D1）：收藏 / 忽略 / 归档。
   *
   * 端点早就有了（`POST /jobs/batch/mark`），缺的一直是这排按钮 ——
   * 于是"扫完一页扔掉一半"只能一条条点 ✕。
   *
   * 三件事都要如实说：
   *   * 成功了几条；
   *   * `missing` 有几条（那几条可能已被清理，不能假装全成功）；
   *   * 留一个撤销入口 —— 但撤销回的是**已读**，不是"原状态"（见 `undoMark` 的注释）。
   */
  const markPicked = async (next: JobState): Promise<void> => {
    if (picked.length === 0) return
    const ids = picked
    setMarkingBatch(true)
    setNotice(null)
    try {
      const result = await markJobs(ids, next)
      const label = JOB_STATE_LABEL[next]
      setNotice({
        tone: result.missing.length === 0 ? 'ok' : 'error',
        text:
          `已把 ${String(result.total)} 条标为「${label}」` +
          (result.missing.length === 0
            ? ''
            : `；有 ${String(result.missing.length)} 条已不存在（${result.missing.join('、')}）`),
      })
      setUndoMark({ ids: result.missing.length === 0 ? ids : ids.filter((id) => !result.missing.includes(id)), count: result.total })
      setPicked([])
      reload()
      props.onChanged()
    } catch (error) {
      setNotice({ tone: 'error', text: `批量标记失败：${reasonOf(error)}` })
    } finally {
      setMarkingBatch(false)
    }
  }

  /** 撤销上一次批量处置：把这批标回**已读**（中性状态，不是各自的原始状态）。 */
  const undoLastMark = async (): Promise<void> => {
    if (undoMark === null || undoMark.ids.length === 0) return
    setMarkingBatch(true)
    try {
      const result = await markJobs(undoMark.ids, 'seen')
      setNotice({ tone: 'ok', text: `已把 ${String(result.total)} 条标回「已读」` })
      setUndoMark(null)
      reload()
      props.onChanged()
    } catch (error) {
      setNotice({ tone: 'error', text: `撤销失败：${reasonOf(error)}` })
    } finally {
      setMarkingBatch(false)
    }
  }

  /**
   * 把勾选的岗位复制成 Markdown 表（批次 D2）。
   *
   * 只拿**当前页里**能对上 id 的那些行：勾选可以跨页，而手上只有当前页的完整数据
   * （`JobDto` 要拿公司名/平台名/时间才拼得出表）。所以文案里要写明是"本页 N 条"，
   * 不能说"已复制全部勾选" —— 那会少给还不说。
   */
  const copyPicked = async (): Promise<void> => {
    const rows = state.status === 'ok' ? state.data.items.filter((job) => picked.includes(job.id)) : []
    if (rows.length === 0) {
      setNotice({ tone: 'error', text: '本页没有勾选中的岗位（勾选可以跨页，但复制只带本页那几条）' })
      return
    }
    const ok = await copyText(jobsToMarkdown(rows))
    setNotice(
      ok
        ? { tone: 'ok', text: `已复制本页 ${String(rows.length)} 条为 Markdown 表格（跨页勾选的其余几条要翻到那一页再复制）` }
        : { tone: 'error', text: '复制失败：这个环境里剪贴板不可用，可以改用「导出 CSV」' },
    )
  }

  /**
   * 出错的分数一键重算（批次 A2）。
   *
   * 单次上限由宿主定（当前 100 条），所以回执里必须带上**还剩多少条** ——
   * "重算了 100 条"和"修好了"是两件事，界面不能把前者说成后者。
   */
  const recomputeScores = async (): Promise<void> => {
    setRecomputing(true)
    try {
      const result = await recomputeStaleScores()
      setNotice({ tone: 'ok', text: result.note })
      reload()
    } catch (error) {
      setNotice({ tone: 'error', text: `重算失败：${reasonOf(error)}` })
    } finally {
      setRecomputing(false)
    }
  }

  // ── 保存的筛选视图（批次 B2）──────────────────────────────────────

  /** 套用一个视图：草稿与已生效条件一起换掉，页码回第一页（否则可能落在越界页）。 */
  const applyView = (id: string): void => {
    setAppliedViewId(id)
    if (id === '') return
    const view = views.find((item) => item.id === id)
    if (view === undefined) return
    setDraft(view.filters)
    setApplied(view.filters)
    setPage(1)
  }

  const persistViews = async (next: SavedJobViewDto[]): Promise<void> => {
    try {
      const saved = await saveJobViews(next)
      setViews(saved.views)
    } catch (error) {
      // 写失败就**回滚下拉的选择**：`saveCurrentView` 是乐观地先设了 appliedViewId，
      // 若服务端没存下，那个 id 在 `views` 里根本不存在 —— 下拉会落不到任何 option、
      // 而"删除视图"会变成点了没反应的死按钮。
      setAppliedViewId('')
      setNotice({ tone: 'error', text: `保存视图失败：${reasonOf(error)}` })
    }
  }

  /** 保存当前**已生效**的条件（不是草稿 —— 存下来的必须是列表现在真正在用的那一套）。 */
  const saveCurrentView = (name: string): void => {
    const id = `view-${String(Date.now())}`
    const next = [...views, { id, name, filters: applied }]
    setAppliedViewId(id)
    void persistViews(next)
    setNotice({ tone: 'ok', text: `已保存视图「${name}」` })
  }

  const deleteView = (id: string): void => {
    const view = views.find((item) => item.id === id)
    if (view === undefined) return
    setAppliedViewId('')
    void persistViews(views.filter((item) => item.id !== id))
    // 只删视图，**不动列表条件** —— 删掉一个刚套用过的视图不该顺手改掉眼前的筛选
    setNotice({ tone: 'ok', text: `已删除视图「${view.name}」（列表条件保持不动）` })
  }

  const togglePick = (id: number, checked: boolean): void => {
    setPicked((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    )
  }

  const toggleGroup = (groupId: number): void => {
    setOpenGroup(openGroup === groupId ? null : groupId)
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
  const pages = Math.max(1, Math.ceil(total / pageSize))
  /**
   * 草稿与已生效条件不一致（第四轮，审核 P2-12）。
   *
   * 折叠开关上的「已选 N 项」算的是**草稿**，列表头栏那句算的是**已生效**的条件，
   * 两者可以同时成立却互相矛盾（"已选 2 项" + 列表根本没筛过）。
   * 判断交给 `sameFilters`（按语义比，不看多选顺序）。
   */
  const pendingChanges = !sameFilters(draft, applied)
  /** 已生效的条件里有没有"筛过"的东西 —— 空结果时用它决定要不要给「清除筛选」。 */
  const hasFilters = !sameFilters(applied, EMPTY_FILTERS)
  /** 已生效条件 → 「筛选中」chips（见 filters.ts 的 describeAppliedFilters）。 */
  const appliedChips = describeAppliedFilters(applied, expChips)
  /**
   * 移除一枚已生效条件（2026-09-20 布局重排）：draft 与 applied 一起换、页码回第一页。
   * 它是**单条明确动作**（与「显示被隐藏的 N 条」同类），不经"点筛选"这一步；
   * 移除后条件不再等于所套用的视图 → 视图高亮复位（与 submit 同一条判据）。
   */
  const removeChip = (id: string): void => {
    const chip = appliedChips.find((item) => item.id === id)
    if (chip === undefined) return
    setDraft(chip.next)
    setApplied(chip.next)
    setPage(1)
    const using = views.find((item) => item.id === appliedViewId)
    if (using !== undefined && !sameFilters(chip.next, using.filters)) setAppliedViewId('')
  }
  /**
   * 页码已经越界（第四轮，审核 P2-8）：0 条 + 非零 total。
   * 这一帧先别印"没有符合条件的岗位"（那是假话）—— 上面的 effect 正在把页码夹回去。
   */
  const beyondLastPage =
    state.status === 'ok' && state.data.items.length === 0 && total > 0 && page > pages
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
    (draft.groupDuplicates ? 1 : 0) +
    (draft.excludeBlacklisted ? 0 : 1)
  // 注意**不数** `cities`：它虽然在面板里有 chips，但工具条那个下拉一直显示着它
  // （多选时显示"已选 N 个城市"）—— 把看得见的东西算进"被折叠起来看不见的条件数"
  // 会让这个数字与它存在的理由（"条件没白设，一眼看得见"）自相矛盾。
  /**
   * 本页里分数已过期的条数（批次 A2）。
   *
   * 只在**本页**统计而不是全库：全库那个数字要再跑一次 count，而用户真正要修的就是
   * 眼前这几条（重算端点也是按"最近优先"分批的）。文案里写明"本页"。
   */
  const staleScoreCount =
    state.status === 'ok' ? state.data.items.filter((job) => job.scoreStale).length : 0
  /** 因为「排除已拉黑公司」被隐藏的条数（批次 B）：服务端算好一起回传。 */
  const hiddenByBlacklist = state.status === 'ok' ? (state.data.hiddenByBlacklist ?? 0) : 0

  return (
    <div className="jh-jobs-split">
      {/* 筛选区跟着维度走：岗位侧是既有的四层 FilterBar，公司侧是同构的轻量 CompanyBar
          （视图行的位置、切换按钮的位置完全一致 —— 用户学会一次就两边都认得）。 */}
      {dimension === 'jobs' ? (
        <FilterBar
          draft={draft}
          citiesAll={citiesAll}
          eduAll={eduAll}
          expChips={expChips}
          advancedOpen={advancedOpen}
          advancedCount={advancedCount}
          pending={pendingChanges}
          views={views}
          appliedViewId={appliedViewId}
          onSubmit={submit}
          onReset={reset}
          onToggleAdvanced={toggleAdvanced}
          onKeyword={setKeyword}
          onCity={setCity}
          onCityToggle={toggleCity}
          onState={setState}
          onMinSalary={setMinSalary}
          onMinScore={setMinScore}
          onExpBucket={toggleExpBucket}
          onEdu={toggleEdu}
          onNewWindow={setNewWindow}
          onExcludeFlag={toggleExclude}
          onExcludeBlacklisted={setExcludeBlacklisted}
          onGroupDuplicates={setGroupDuplicates}
          onApplyView={applyView}
          onSaveView={saveCurrentView}
          onDeleteView={deleteView}
          appliedChips={appliedChips}
          onRemoveChip={removeChip}
          onSwitchDimension={switchDimension}
        />
      ) : (
        <CompanyBar
          draft={companies.coDraft}
          pending={companies.coPendingChanges}
          appliedChips={companies.coAppliedChips}
          onSubmit={companies.coSubmit}
          onReset={companies.coReset}
          onKeyword={companies.setCoKeyword}
          onBlacklist={companies.setCoBlacklist}
          onLabel={companies.setCoLabel}
          onMinJobs={companies.setCoMinJobs}
          onSwitchDimension={switchDimension}
          onRemoveChip={companies.coRemoveChip}
        />
      )}

      <div className="jh-jobs-cols">
        {/* aria-busy：重取期间列表还是上一次的结果（keepPrevious），读屏要知道"这是旧的" */}
        {dimension === 'jobs' ? (
        <div className="jh-jobs-pane" data-job-hunter="job-list" aria-busy={refreshing ? true : undefined}>
          {/* 只在**首次**加载时出现：后续重取由 useAsync 的 keepPrevious 保留旧列表，
              这里改成列表头栏那行「更新中…」。加载态给 live + busy，否则读屏全程静默。 */}
          {state.status === 'loading' && (
            <LoadingLine busy live="polite">正在查询岗位…</LoadingLine>
          )}

          {state.status === 'error' && (
            <div className="jh-card">
              <h2 className="jh-card-title">查询失败</h2>
              <p className="jh-error">{state.message}</p>
              {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
              <button type="button" className="jh-btn" onClick={reload}>重试</button>
            </div>
          )}

          {beyondLastPage && (
            <LoadingLine busy live="polite">这一页已经没有条目了，正在回到最后一页…</LoadingLine>
          )}

          {state.status === 'ok' && state.data.items.length === 0 && !beyondLastPage && (
            <div className="jh-card">
              <h2 className="jh-card-title">没有符合条件的岗位</h2>
              <p className="jh-muted">
                共 {state.data.total} 条。换个关键词或放宽筛选条件试试；也可以回到「今日」手动抓取一次。
              </p>
              {/* 空态也要把"被隐藏的"说出来。
                  这是「排除已拉黑公司」最容易骗到人的地方：默认开着，而默认条件下
                  `hasFilters` 是 false —— 用户只会看到"共 0 条"，完全不知道有 N 条
                  岗位正被自己的黑名单挡着，连"清除筛选条件"按钮都不会出现。 */}
              {hiddenByBlacklist > 0 ? (
                <p className="jh-muted">
                  另有 {hiddenByBlacklist} 条来自你拉黑过的公司（被你设置的「排除已拉黑公司」挡住了）·
                  <button type="button" className="jh-link" onClick={showBlacklistedJobs}>
                    显示这 {hiddenByBlacklist} 条
                  </button>
                </p>
              ) : null}
              {/* 空态要给下一步（rules §4.3）：条件筛空了就地一键复原，不用自己回想改过哪些 */}
              {hasFilters ? (
                <button type="button" className="jh-btn" onClick={reset}>清除筛选条件</button>
              ) : null}
            </div>
          )}

          {state.status === 'ok' && state.data.items.length > 0 && (
            <>
              <div className="jh-listbar">
                {/* 全选放在这一行**最左**（2026-09-20）：它作用于整个列表，是这一行的
                    第一个主人；隐藏条数 / 更新中 / 过期分数这些"说出来"的话跟在它后面，
                    排序被 margin-left:auto 推到行尾。全选只覆盖**本页**：跨页"全选"
                    在分页列表里是歧义动作（用户以为选了 20 条，实际选了 200 条）——
                    所以文案里写明"本页"。 */}
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
                {/* 「只看某家公司」的限定（公司维度「查看岗位」设置的跳转上下文）。
                    形态与「筛选中」chips 一致：点掉立即恢复全部公司。
                    刻意不进 Filters / 不进「筛选中」那排 —— 它不是用户筛的，是跳转带来的，
                    放头栏才不会让用户以为自己的筛选条件被改了。 */}
                {jobCompanyScope === null ? null : (
                  <button
                    type="button"
                    className="jh-chip jh-chip-on"
                    title="这是从公司维度跳过来的限定，点掉恢复全部公司的岗位"
                    onClick={() => {
                      setJobCompanyScope(null)
                      setPage(1)
                    }}
                  >
                    只看 {jobCompanyScope.name}
                    <span className="jh-jobs-chip-x" aria-hidden="true">✕</span>
                  </button>
                )}
                {/* 「共 N 条」与折叠/时间窗说明已移除（2026-09-20 精简）：折叠与时间窗
                    由「筛选中」chips 承载（跨平台折叠 / 新增：近 7 天），不再另说一遍；
                    这一行只留"必须说出来"的事 —— 被隐藏的条数、更新中、过期分数。 */}
                {/* 「排除已拉黑公司」隐藏了几条（批次 B）：**必须说出来**。
                    这条筛选默认开着，不说的话用户会以为某些岗位凭空消失了 ——
                    "可以隐藏，但绝不静默隐藏"。点它当场把这一条关掉并重查。 */}
                {hiddenByBlacklist === 0 ? null : (
                  <button
                    type="button"
                    className="jh-link"
                    title="这些岗位来自你拉黑过的公司。点一下显示回来（会关掉「排除已拉黑公司的岗位」这个筛选）"
                    onClick={showBlacklistedJobs}
                  >
                    已隐藏 {hiddenByBlacklist} 条（已拉黑公司）· 显示
                  </button>
                )}
                {/* 重取期间的提示（第四轮，审核 P2-6）：列表不再消失，所以必须说明
                    "现在看到的是上一次的结果"。role=status 让读屏也知道在更新。 */}
                {refreshing ? (
                  <span className="jh-refreshing" role="status">更新中…</span>
                ) : null}
                {/* 本页有分数过期（批次 A2）：把"这个分不作数"说在列表上，并给一键重算。
                    重算按"最近优先"分批，单次上限由宿主定，回执里会说还剩多少条。 */}
                {staleScoreCount === 0 ? null : (
                  <span className="jh-refreshing">
                    本页 {staleScoreCount} 条分数已过期（按旧简历算的）·
                    <button
                      type="button"
                      className="jh-link"
                      disabled={recomputing}
                      onClick={() => void recomputeScores()}
                    >
                      {recomputing ? '重算中…' : '重算过期分数'}
                    </button>
                  </span>
                )}
                {/* 列表头栏右侧（2026-09-20 布局重排）：只剩排序，margin-left:auto 推到行尾。
                    它决定"结果**怎么排**"，是列表自己的事，改完当场重排
                    （跨平台折叠不在这儿：它改的是"结果有哪些"，属于筛选条件，
                    已经放回上面的折叠面板）。 */}
                <span className="jh-listbar-right">
                  {/* 排序（2026-09-20 精简：去掉「排序」二字 —— 选项文案自带
                      「按抓取时间 / 按匹配分」语义，重复标签是噪音；aria-label 留给读屏）。
                      select 的值只能从元素上拿到 string；取值域由 JOB_ORDER_OPTIONS 锁住，
                      这里按项目既有写法（如面试形式那个 select）在边界上收窄一次。 */}
                  <select
                    className="jh-select jh-sort-select"
                    aria-label="排序"
                    value={applied.orderBy}
                    onChange={(event) => changeOrder(event.target.value as JobOrderValue)}
                  >
                    {JOB_ORDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              {/* 就地提示（第四轮，审核 P2-5；第五轮扩到批量处置 / 视图 / 重算 / 复制）。
                  两件事：
                  ① role=status / alert —— 这是外面唯一的汇总反馈，之前是个无角色的 p，读屏全程静默；
                  ② 它渲染在列表栏里，而弹窗遮罩（z-index 40）盖着这一层 —— 所以弹窗自己也
                     显示同一句汇总（见两个弹窗的 footer），用户不必先关弹窗才看得到结果。 */}
              {notice === null ? null : (
                <p
                  className={notice.tone === 'ok' ? 'jh-ok' : 'jh-error'}
                  role={notice.tone === 'ok' ? 'status' : 'alert'}
                >
                  {notice.text}
                </p>
              )}
              {/* 撤销上一批处置。
                  ⚠️ 它挂在**结果**这里而不是批量工具条上：处置成功后勾选会被清空，
                  而工具条只在有勾选时渲染 —— 挂在那边的话，撤销会跟着一起消失。
                  撤销回的是中性的「已读」，不是各自的原始状态（跨页拿不回原状态）。 */}
              {undoMark === null ? null : (
                <p className="jh-muted">
                  刚处置的那批还可以撤销：
                  <button
                    type="button"
                    className="jh-link"
                    disabled={markingBatch}
                    onClick={() => void undoLastMark()}
                  >
                    撤销 {undoMark.count} 条（标回「已读」）
                  </button>
                </p>
              )}

              {/* 批量工具条：只在有勾选时出现（没勾选时它占的那一行是纯粹的噪音） */}
              {picked.length === 0 ? null : (
                <BatchToolbar
                  count={picked.length}
                  busy={markingBatch}
                  exportHref={jobsExportUrl(picked)}
                  onGreet={greetPicked}
                  onDeliver={deliverPicked}
                  onMark={(next) => void markPicked(next)}
                  onCopy={() => void copyPicked()}
                  onClear={clearPicked}
                />
              )}

              <ul className="jh-jobs">
                {state.data.items.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    active={job.id === props.selected}
                    picked={picked.includes(job.id)}
                    marking={marking === job.id}
                    openGroup={openGroup}
                    onSelect={props.onSelect}
                    onTogglePick={togglePick}
                    onGreet={greetOne}
                    onDeliver={deliverOne}
                    onQuickMark={quickMark}
                    onToggleGroup={toggleGroup}
                  />
                ))}
              </ul>

              {/* 列表页脚（2026-09-20 布局重排）：分页从列表头栏搬到这里 ——
                  翻页是"读完这一屏之后"的动作，入口应该长在列表末尾。三件套对标
                  企业级列表页（Ant Design / SAP Fiori 的 list report）：每页条数 · 页码 · 跳页。 */}
              <div className="jh-jobs-foot">
                <label className="jh-jobs-foot-size">
                  每页
                  <select
                    className="jh-select"
                    aria-label="每页条数"
                    value={String(pageSize)}
                    onChange={(event) => changePageSize(Number(event.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={String(size)}>
                        {String(size)} 条
                      </option>
                    ))}
                  </select>
                </label>
                <div className="jh-jobs-foot-right">
                  <Pager page={state.data.page} pages={pages} hasMore={state.data.hasMore} onGo={setPage} />
                  {/* 跳页只在页数多到翻不动时出现（≤4 页时它是纯噪音） */}
                  {pages < 5 ? null : (
                    <form className="jh-jump" onSubmit={submitJump}>
                      <input
                        className="jh-input jh-jump-input"
                        inputMode="numeric"
                        value={jumpDraft}
                        maxLength={5}
                        aria-label="跳到第几页"
                        onChange={(event) => setJumpDraft(digitsOf(event.target.value))}
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
        ) : (
          <CompaniesPane
            state={companies.coQuery.state}
            refreshing={companies.coQuery.refreshing}
            page={companies.coPage}
            pageSize={companies.coPageSize}
            orderBy={companies.coApplied.orderBy}
            selectedId={selectedCompanyId}
            marking={companies.coMarking}
            onGo={companies.setCoPage}
            onPageSize={companies.coChangePageSize}
            onOrder={companies.coChangeOrder}
            onSelect={setSelectedCompanyId}
            onViewJobs={viewCompanyJobs}
            onBlacklist={(company, blacklisted) => void companies.toggleCoBlacklist(company, blacklisted)}
            onRetry={companies.coQuery.reload}
          />
        )}

        {dimension === 'jobs' ? (
          <JobDetailPane
            id={props.selected}
            revision={props.revision}
            onChanged={props.onChanged}
            onSelect={props.onSelect}
          />
        ) : (
          <CompanyDetailPane
            id={selectedCompanyId}
            revision={props.revision}
            onChanged={props.onChanged}
            onViewJob={viewJobFromCompany}
          />
        )}
      </div>

      {/* 打招呼（D3 / U1）：勾选走批量，行内点单条走同一套 —— 预览（逐条正文可改/可跳过）
          → 一次确认 → 分批发送 → 逐条回执，两个入口只有"目标是谁"这一点不同 */}
      {greetTargets === null ? null : (
        <BatchGreetingModal
          jobIds={greetTargets}
          onClose={() => setGreetTargets(null)}
          onBatchDone={() => {
            // 整轮发送结束后刷一次（第四轮，审核 P2-7）：弹窗只在分批循环跑完（或被中断）
            // 之后才调它。按批调的话，背后的列表会一次次重取重绘 —— 而它当时正被遮罩盖着。
            reload()
            props.onChanged()
          }}
          notify={(tone, text) => setNotice({ tone, text })}
        />
      )}

      {/* 投递（L4）：**不可逆** —— 预览里只有"投哪些/跳过哪些"，没有可编辑内容 */}
      {deliverTargets === null ? null : (
        <BatchDeliverModal
          jobIds={deliverTargets}
          onClose={() => setDeliverTargets(null)}
          onBatchDone={() => {
            // 同上：投递记录 / 看板 / 岗位状态都可能变，但只在这一轮结束后刷一次
            reload()
            props.onChanged()
          }}
          notify={(tone, text) => setNotice({ tone, text })}
        />
      )}
    </div>
  )
}
