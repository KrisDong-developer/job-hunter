/**
 * 全库去重复核（批次 4）。
 *
 * ## 为什么需要"独立触发"
 *
 * 去重以前**只在抓取的后处理里**发生（`crawl.ts` 的 `postProcess.dedup`）。于是有两件事
 * 用户做不到：
 *
 *   * **补做**：刚打开了去重开关（或者刚把某个平台加进方案），库里已有的重复不会被合并
 *     —— 只有"再抓一轮"才会碰到它们，而那一轮本来可能一条新岗位都没有；
 *   * **重判**：去重规则改过（例如 R25 修掉"薪资未锚定不当门槛"之后），
 *     老数据里那些**本该合并却漏了**的仍然散着 —— 没有任何入口能重跑一遍。
 *
 * ## 它和抓取里那一半的关系
 *
 * **同一份判断**：共用 `applyDedup`（`domain/dedupe.ts`）与同一个候选构造器
 * （`dedupDepsOf`）。差别只在**输入集合**：抓取只看这一轮写进去的岗位，
 * 复核看全库。判断逻辑有第二份实现才是最坏的情况 —— 那意味着"抓取时合并、
 * 复核时不合并"这类自相矛盾的行为。
 *
 * ## 保守规则一条都不放松
 *
 * 复核**不改变**任何门槛（跨平台、公司/城市硬相等、薪资只在两边都锚定时才比、
 * 标题相似度 ≥0.9）。它只是把同一把尺子拿到整个库上再量一遍：
 * 宁可不合并 —— 合并之后投递记录会串，而且用户很难发现。
 */
import type { JobDto } from '../../shared/dto.js'
import type { Store } from '../store/store.js'
import { applyDedup, dedupCandidateOf, type DedupCandidate, type DedupDeps } from './dedupe.js'

/**
 * 去重依赖：候选 = **同一家公司的其它岗位**（跨平台由 `shouldMerge` 过滤）。
 *
 * 抽成共享工厂是因为它有**两个调用方**（抓取后处理、全库复核）。各写一份的话，
 * 迟早一份按公司取候选、另一份按城市取 —— 而那种差异不会报错，只会少合并。
 */
export function dedupDepsOf(store: Store): DedupDeps {
  return {
    dedupGroup: store.dedupGroup,
    candidatesFor: (self) => {
      if (self.companyId === null) return []
      return store.job
        .query({ companyId: self.companyId })
        .map(dedupCandidateOf)
        .filter((item): item is DedupCandidate => item !== undefined)
        .filter((item) => item.id !== self.id && item.platformId !== self.platformId)
    },
  }
}

export interface DedupSweepResult {
  /** 真的送去判定的岗位数（跳过已分组、没公司名的）。 */
  scanned: number
  /** 已经**在某个分组里**、这一轮没再判的岗位数。 */
  skippedGrouped: number
  /** 这一轮**进入分组**的岗位数（新建组时两条都算 —— 它们确实都被合并了）。 */
  merged: number
  /** 新建的分组数。 */
  newGroups: number
  /** 疑似重复但**未自动合并**的数量（要人工看一眼）。 */
  candidates: number
  /** 复核之后库里一共有多少个分组。 */
  groups: number
}

/**
 * 跑一遍全库复核。
 *
 * ## 为什么跳过"已经在分组里"的岗位
 *
 * `applyDedup` 的语义是"把这个岗位并进它该在的组"。对一个**已经有组**的岗位再跑一次，
 * 它要么找到同一个组（白跑），要么因为库里出现了新的重复而想把自己挪到别的组 ——
 * 而"挪组"不是这套模型支持的（成员是显式 id 列表，挪动等于悄悄改掉用户看过的分组）。
 * 所以：**已分组的不动**；新岗位会通过"候选有组 → 并进那个组"正确挂上去。
 *
 * ## 为什么分页
 *
 * `DatabaseSync` 是同步 API，一次把全库读进内存会把宿主卡住（§4.1 / R3）。
 *
 * @param limit 一次取多少条（默认 200，与写批次同量级）
 */
export function sweepDedup(store: Store, now: string, options: { pageSize?: number } = {}): DedupSweepResult {
  const pageSize = Math.max(1, Math.trunc(options.pageSize ?? 200))
  const deps = dedupDepsOf(store)
  const total = store.job.countMatching({})
  const groupsBefore = store.dedupGroup.count()
  const result: DedupSweepResult = {
    scanned: 0,
    skippedGrouped: 0,
    merged: 0,
    newGroups: 0,
    candidates: 0,
    groups: 0,
  }

  for (let offset = 0; offset < total; offset += pageSize) {
    const page: JobDto[] = store.job.query({}, pageSize, offset)
    if (page.length === 0) break
    for (const job of page) {
      if (job.dedupGroupId !== null) {
        result.skippedGrouped += 1
        continue
      }
      const candidate = dedupCandidateOf(job)
      if (candidate === undefined) continue
      result.scanned += 1
      const outcome = applyDedup(deps, candidate, now)
      if (outcome.groupId !== null) result.merged += 1
      else if (outcome.candidate) result.candidates += 1
    }
  }

  result.groups = store.dedupGroup.count()
  // 新建了几个组：**数出来**比在循环里猜可靠（`applyDedup` 只会告诉你"进了哪个组"）
  result.newGroups = result.groups - groupsBefore
  return result
}
