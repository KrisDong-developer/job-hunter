import { useEffect, useState, type FormEvent } from 'react'
import { PAGE_SIZE_DEFAULT } from '../../../shared/config/limits.js'
import type { CompanyProfileDto } from '../../../shared/contract/dto/job.js'
import type { CompanyOrderValue } from '../../../shared/contract/enums/job.js'
import { useAsync } from '../../hooks/use-async.js'
import { fetchCompanies, updateCompanyReview } from '../../net/companies.js'
import {
  EMPTY_CO_FILTERS,
  coJobCountInput,
  describeAppliedCoFilters,
  sameCoFilters,
  type CompanyFilters,
} from './company-filters.js'

/**
 * 公司维度的列表状态机（查询 + 筛选双态 + 分页 + 行内拉黑）。
 *
 * 从 `JobsScreen` 拆出来：岗位侧的状态清单本来就长，两种维度的 state/handler
 * 混在一个组件里，读代码要先分清"哪个是哪个维度的"。这个 hook 是一个自洽闭环
 * （筛选草稿→提交→查询→翻页→处置），边界干净。
 *
 * **不进这个 hook 的**（留在 JobsScreen 的编排层）：
 *   * `dimension` —— 它是"两个维度之间的路由"，不属于任何一侧；
 *   * `selectedCompanyId` / `jobCompanyScope` —— 详情选中与跨维度跳转上下文，
 *     都要和岗位侧状态（`props.selected` / `setPage`）配合，放编排层才看得见全局。
 *
 * 外部依赖只有两个，都以参数注入：
 *   * `revision` —— 进查询 deps，宿主 bump 时两个维度一起刷新；
 *   * `onChanged` —— 拉黑成功后通知宿主（只在事件回调里用，不进 deps）。
 */
export function useCompanies(props: { revision: number; onChanged: () => void }) {
  const [coDraft, setCoDraft] = useState<CompanyFilters>(EMPTY_CO_FILTERS)
  const [coApplied, setCoApplied] = useState<CompanyFilters>(EMPTY_CO_FILTERS)
  const [coPage, setCoPage] = useState(1)
  const [coPageSize, setCoPageSize] = useState(PAGE_SIZE_DEFAULT)
  /** 正在被拉黑/恢复的公司 id（列表很密，单张卡片内禁用动作即可）。 */
  const [coMarking, setCoMarking] = useState<number | null>(null)

  /**
   * 公司维度的列表查询 —— **独立于岗位查询**，不共用 loader 做分支：
   * keepPrevious 的"旧数据"会串维度（切过去的一瞬还显示着岗位数字），
   * deps 也各归各（公司侧的筛选 / 页码不该触发岗位重取）。
   */
  const coQuery = useAsync(
    (signal) =>
      fetchCompanies(
        {
          q: coApplied.q,
          blacklisted: coApplied.blacklisted === '' ? undefined : coApplied.blacklisted === 'yes',
          manualLabel: coApplied.manualLabel === '' ? undefined : coApplied.manualLabel,
          minJobCount: coApplied.minJobCount === '' ? undefined : Number(coApplied.minJobCount),
          orderBy: coApplied.orderBy,
          descending: coApplied.descending,
          limit: coPageSize,
          offset: (coPage - 1) * coPageSize,
        },
        signal,
      ),
    [props.revision, coApplied, coPage, coPageSize],
    { keepPrevious: true },
  )

  /** 页码越界自愈（条件与岗位侧那条 effect 相同：结果集会在两次重取之间缩小）。 */
  useEffect(() => {
    if (coQuery.state.status !== 'ok') return
    if (coQuery.state.data.total === 0 || coQuery.state.data.items.length > 0) return
    const lastPage = Math.max(1, Math.ceil(coQuery.state.data.total / coPageSize))
    if (coPage > lastPage) setCoPage(lastPage)
  }, [coQuery.state, coPage, coPageSize])

  /** 草稿与已生效是否不一致（工具条尾部的「点筛选生效」提示）。 */
  const coPendingChanges = !sameCoFilters(coDraft, coApplied)
  /** 已生效的公司条件 → 「筛选中」chips。 */
  const coAppliedChips = describeAppliedCoFilters(coApplied)

  const coSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setCoApplied(coDraft)
    setCoPage(1)
  }

  const coReset = (): void => {
    setCoDraft(EMPTY_CO_FILTERS)
    setCoApplied(EMPTY_CO_FILTERS)
    setCoPage(1)
  }

  /** 排序：立即生效（与岗位侧同一语义 —— 改的是"怎么排"，不是"有哪些"）。 */
  const coChangeOrder = (orderBy: CompanyOrderValue): void => {
    setCoDraft((current) => ({ ...current, orderBy }))
    setCoApplied((current) => ({ ...current, orderBy }))
    setCoPage(1)
  }

  /** 每页条数：夹住当前页（照岗位侧）。 */
  const coChangePageSize = (size: number): void => {
    setCoPageSize(size)
    setCoPage((current) => {
      if (coQuery.state.status !== 'ok' || coQuery.state.data.total === 0) return 1
      return Math.max(1, Math.min(current, Math.ceil(coQuery.state.data.total / size)))
    })
  }

  /** 移除一枚已生效的公司条件：draft 与 applied 一起换、页码回第一页。 */
  const coRemoveChip = (id: string): void => {
    const chip = coAppliedChips.find((item) => item.id === id)
    if (chip === undefined) return
    setCoDraft(chip.next)
    setCoApplied(chip.next)
    setCoPage(1)
  }

  /**
   * 行内拉黑 / 取消拉黑：与详情里的复核（CompanyReview）写同一份状态，
   * 成功后刷公司列表 + 通知宿主（岗位库那边也依赖黑名单过滤）。
   */
  const toggleCoBlacklist = async (company: CompanyProfileDto, blacklisted: boolean): Promise<void> => {
    setCoMarking(company.id)
    try {
      await updateCompanyReview(company.id, { blacklisted })
      coQuery.reload()
      props.onChanged()
    } catch {
      // 失败时列表不真实，但重载会把它画回去；这里没有常驻的错误条，
      // 拉黑是可重试的轻动作，不值得为它弹整屏错误。
      coQuery.reload()
    } finally {
      setCoMarking(null)
    }
  }

  return {
    coQuery,
    coDraft,
    coApplied,
    coPage,
    setCoPage,
    coPageSize,
    coMarking,
    coPendingChanges,
    coAppliedChips,
    coSubmit,
    coReset,
    coChangeOrder,
    coChangePageSize,
    coRemoveChip,
    toggleCoBlacklist,
    /** 工具条的四个草稿 setter（CompanyBar 的受控控件用）。 */
    setCoKeyword: (q: string): void => setCoDraft((current) => ({ ...current, q })),
    setCoBlacklist: (blacklisted: '' | 'yes' | 'no'): void =>
      setCoDraft((current) => ({ ...current, blacklisted })),
    setCoLabel: (manualLabel: string): void => setCoDraft((current) => ({ ...current, manualLabel })),
    setCoMinJobs: (minJobCount: string): void =>
      setCoDraft((current) => ({ ...current, minJobCount: coJobCountInput(minJobCount) })),
  }
}
