import { useEffect, useState, type FormEvent } from 'react'
import { PAGE_SIZE_DEFAULT } from '../../../shared/config/limits.js'
import {
  JOB_NEW_WINDOWS,
  JOB_ORDER_OPTIONS,
  type JobFlagType,
  type JobOrderValue,
  type JobState,
} from '../../../shared/contract/enums/job.js'
import { buildExpChips, sortEduValues, type ExpChip } from '../../../shared/domain/job-facets.js'
import { useAsync } from '../../hooks/use-async.js'
import { fetchJobFacets, fetchJobs, markJob } from '../../net/jobs.js'
import { LoadingLine } from '../../ui/async-view.js'
import { JobDetailPane } from '../../views/job-detail/pane.js'
import { BatchDeliverModal } from './batch-deliver-modal.js'
import { BatchGreetingModal } from './batch-greeting-modal.js'
import { BatchToolbar } from './batch-toolbar.js'
import { FilterBar } from './filter-bar.js'
import {
  EMPTY_FILTERS,
  expandExpBuckets,
  firstSeenSinceOf,
  sameFilters,
  toggleValue,
  type Filters,
} from './filters.js'
import { JobRow } from './job-row.js'
import { Pager } from './pager.js'

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

  const { state, reload, refreshing } = useAsync(
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
          pageSize: PAGE_SIZE_DEFAULT,
        },
        signal,
      ),
    // `appliedExpReqs` 是 facet 的函数，而 facet 比首屏查询晚到 ——
    // 不把展开结果算进依赖，梯队就会"选了没反应"（第一次查询根本没带上它）。
    [props.revision, applied, page, appliedExpReqs.join(',')],
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
    const lastPage = Math.max(1, Math.ceil(state.data.total / PAGE_SIZE_DEFAULT))
    if (page > lastPage) setPage(lastPage)
  }, [state, page])

  /** 城市：下拉单选。底层仍传数组（见 `Filters.cities` 的注释）。 */
  const setCity = (city: string): void => {
    setDraft((current) => ({ ...current, cities: city === '' ? [] : [city] }))
  }

  const setKeyword = (q: string): void => {
    setDraft({ ...draft, q })
  }

  const setState = (state: string): void => {
    setDraft({ ...draft, state })
  }

  const setMinSalary = (minSalary: string): void => {
    setDraft({ ...draft, minSalary: minSalary.replace(/[^0-9]/g, '') })
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
  const changeOrder = (orderBy: JobOrderValue): void => {
    setDraft((current) => ({ ...current, orderBy }))
    setApplied((current) => ({ ...current, orderBy }))
    setPage(1)
  }

  /** 行内入口：把这一条预置进既有弹窗（与批量入口同一套，只有"目标是谁"不同）。 */
  const greetOne = (id: number): void => {
    setBatchNote(null)
    setGreetTargets([id])
  }

  const deliverOne = (id: number): void => {
    setBatchNote(null)
    setDeliverTargets([id])
  }

  const greetPicked = (): void => {
    setBatchNote(null)
    setGreetTargets(picked)
  }

  const deliverPicked = (): void => {
    setBatchNote(null)
    setDeliverTargets(picked)
  }

  const clearPicked = (): void => {
    setPicked([])
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
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE_DEFAULT))
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
  /**
   * 页码已经越界（第四轮，审核 P2-8）：0 条 + 非零 total。
   * 这一帧先别印"没有符合条件的岗位"（那是假话）—— 上面的 effect 正在把页码夹回去。
   */
  const beyondLastPage =
    state.status === 'ok' && state.data.items.length === 0 && total > 0 && page > pages
  /** 已生效的「只看新增」窗口名（用于列表头说明，避免用户困惑"怎么这么少"）。 */
  const appliedWindowLabel =
    JOB_NEW_WINDOWS.find((item) => item.value === applied.newWindow)?.label ?? null
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
      <FilterBar
        draft={draft}
        citiesAll={citiesAll}
        eduAll={eduAll}
        expChips={expChips}
        advancedOpen={advancedOpen}
        advancedCount={advancedCount}
        pending={pendingChanges}
        onSubmit={submit}
        onReset={reset}
        onToggleAdvanced={toggleAdvanced}
        onKeyword={setKeyword}
        onCity={setCity}
        onState={setState}
        onMinSalary={setMinSalary}
        onExpBucket={toggleExpBucket}
        onEdu={toggleEdu}
        onNewWindow={setNewWindow}
        onExcludeFlag={toggleExclude}
        onGroupDuplicates={setGroupDuplicates}
      />

      <div className="jh-jobs-cols">
        {/* aria-busy：重取期间列表还是上一次的结果（keepPrevious），读屏要知道"这是旧的" */}
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
              {/* 空态要给下一步（rules §4.3）：条件筛空了就地一键复原，不用自己回想改过哪些 */}
              {hasFilters ? (
                <button type="button" className="jh-btn" onClick={reset}>清除筛选条件</button>
              ) : null}
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
                {/* 重取期间的提示（第四轮，审核 P2-6）：列表不再消失，所以必须说明
                    "现在看到的是上一次的结果"。role=status 让读屏也知道在更新。 */}
                {refreshing ? (
                  <span className="jh-refreshing" role="status">更新中…</span>
                ) : null}
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
                    {/* select 的值只能从元素上拿到 string；取值域由 JOB_ORDER_OPTIONS 锁住，
                        这里按项目既有写法（如面试形式那个 select）在边界上收窄一次。 */}
                    <select
                      className="jh-select jh-sort-select"
                      value={applied.orderBy}
                      onChange={(event) => changeOrder(event.target.value as JobOrderValue)}
                    >
                      {JOB_ORDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Pager page={state.data.page} pages={pages} hasMore={state.data.hasMore} onGo={setPage} />
                </span>
              </div>

              {/* 批量结果提示（第四轮，审核 P2-5）。两件事：
                  ① role=status / alert —— 这是外面唯一的汇总反馈，之前是个无角色的 p，读屏全程静默；
                  ② 它渲染在列表栏里，而弹窗遮罩（z-index 40）盖着这一层 —— 所以弹窗自己也
                     显示同一句汇总（见两个弹窗的 footer），用户不必先关弹窗才看得到结果。 */}
              {batchNote === null ? null : (
                <p
                  className={batchNote.tone === 'ok' ? 'jh-ok' : 'jh-error'}
                  role={batchNote.tone === 'ok' ? 'status' : 'alert'}
                >
                  {batchNote.text}
                </p>
              )}

              {/* 批量工具条：只在有勾选时出现（没勾选时它占的那一行是纯粹的噪音） */}
              {picked.length === 0 ? null : (
                <BatchToolbar
                  count={picked.length}
                  onGreet={greetPicked}
                  onDeliver={deliverPicked}
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
            // 整轮发送结束后刷一次（第四轮，审核 P2-7）：弹窗只在分批循环跑完（或被中断）
            // 之后才调它。按批调的话，背后的列表会一次次重取重绘 —— 而它当时正被遮罩盖着。
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
            // 同上：投递记录 / 看板 / 岗位状态都可能变，但只在这一轮结束后刷一次
            reload()
            props.onChanged()
          }}
          notify={(tone, text) => setBatchNote({ tone, text })}
        />
      )}
    </div>
  )
}
