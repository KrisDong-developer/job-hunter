

import type { JobState } from '../enums/job.js'

/**
 * dedup 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */

export interface DedupGroupDto {
  id: number
  primaryJobId: number | null
  basis: string
  score: number
  createdAt: string
  members: Array<{
    id: number
    platformId: string
    /** 平台显示名（服务端 JOIN 出来的；平台被卸载时为 null，界面退回显示 id）。 */
    platformName: string | null
    title: string
    companyName: string | null
    city: string
    salaryRaw: string
    sourceUrl: string
    state: JobState
    isPrimary: boolean
  }>
}

/** 全库去重复核的结果（批次 4）。 */
export interface DedupSweepResultDto {
  /** 真的送去判定的岗位数（跳过已分组、没公司名的）。 */
  scanned: number
  /** 已经**在某个分组里**、这一轮没再判的岗位数。 */
  skippedGrouped: number
  /**
   * 复核重判后**不再成立**的成员数（整组解散时，其余的成员也算在里面）。
   *
   * 成因：分组是**当时**的字段判出来的。公司名后来修对了、城市补上了、标题变了，
   * 那个合并就可能已经不成立 —— 以前这是单向门（复核一律跳过已分组的），只能人工拆。
   */
  unmerged: number
  /** 复核时**整组解散**的组数（拆到不足两条，组就没有意义了）。 */
  dissolved: number
  /**
   * **查不了**的岗位数：公司没归并（`company_id` 为空）→ 公司名读不出来 → 无法判重。
   *
   * 为什么必须报出来：去重的覆盖率取决于"公司登记"的成功率，而这件事以前是**隐形**的 ——
   * 那些岗位只是静静地不参与判定，用户在结果里看到的是"没有重复"，
   * 而不是"有 N 条根本没查过"。
   */
  skippedNoCompany: number
  /** 这一轮**进入分组**的岗位数（新建组时两条都算 —— 它们确实都被合并了）。 */
  merged: number
  /** 新建的分组数。 */
  newGroups: number
  /** 疑似重复但**未自动合并**的数量（要人工看一眼）。 */
  candidates: number
  /** 复核之后库里一共有多少个分组。 */
  groups: number
  /** 复核之后的分组列表（界面直接重渲染，不用再请求一次）。 */
  items: DedupGroupDto[]
}
