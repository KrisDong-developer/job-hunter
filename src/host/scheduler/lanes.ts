/**
 * 泳道发令器：把一轮的平台按 `MAX_CONCURRENT_PLATFORMS` 条泳道并发启动。
 *
 * ## 为什么单独一个文件
 *
 * 这是"跨平台并发"唯一的新编排逻辑，抽成纯函数（注入 launch 与预算判定）
 * 是为了让并发行为可以**离线钉住**：谁和谁重叠过、上限有没有被尊重、
 * 结果顺序是否稳定 —— 这些恰恰是并发改动里最容易悄悄退化的性质。
 *
 * ## 三条不变量
 *
 * 1. **每个平台恰好启动一次**，按传入顺序领取（freshness 序）；
 *    预算耗尽时，还没**领取**的不启动、如实报 `cut` —— 被裁掉的是
 *    "最不需要现在跑"的尾部，与串行时代的裁剪语义一致；
 * 2. **结果顺序 = 启动顺序**（不是完成顺序）：界面的"本轮结果"与既有测试
 *    都依赖确定性，完成顺序在并发下是随机的，不能让它漏出去；
 * 3. **一个平台失败不阻断其它平台**（沿用 SR-18 的不连坐原则）。
 *
 * 同平台串行不在这里管 —— 那是 platform/locks.ts 的事；这里的输入
 * （一个方案的平台列表）本身就不含重复。
 */
import { MAX_CONCURRENT_PLATFORMS } from '../../shared/constants.js'

export interface LaneOutcome<T> {
  platformId: string
  /** 成功的结果；失败为 null（error 承载原因）。 */
  summary: T | null
  error: unknown
}

export interface LanesRunOptions<T> {
  /** 待启动的平台，按期望的启动序（调度器传 freshness 序）。 */
  platforms: readonly string[]
  /** 启动一个平台（生产接 runtime.crawl / 测试注入桩）。 */
  launch: (platformId: string) => Promise<T>
  /** 启动前问一次"预算还在吗"。true = 已耗尽，这个平台不启动、进 cut。 */
  budgetExhausted: () => boolean
  /** 并发上限。缺省 MAX_CONCURRENT_PLATFORMS。 */
  lanes?: number
  /**
   * 每个平台的结论出来时回调（成功与失败都会调）。
   * 供调用方**即时**发 SSE 事件 —— 不用它的话事件会攒到整轮结束才发。
   */
  onSettled?: (outcome: LaneOutcome<T>) => void
}

export interface LanesRunResult<T> {
  /** 按**启动序**排列的结论（只含真正启动过的平台）。 */
  outcomes: Array<LaneOutcome<T>>
  /** 因预算耗尽而没启动的平台（原顺序）。 */
  cut: string[]
}

export async function runInLanes<T>(options: LanesRunOptions<T>): Promise<LanesRunResult<T>> {
  const { platforms, launch, budgetExhausted } = options
  const lanes = Math.max(1, options.lanes ?? MAX_CONCURRENT_PLATFORMS)
  /** 启动序的槽位：worker 领到哪个下标就写哪个槽，最后按序压实。 */
  const slots: Array<LaneOutcome<T> | undefined> = []
  const cut: string[] = []
  let cursor = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      // 领号要同步：两个 worker 不能领到同一个下标（JS 单线程，这里没有竞态）。
      const index = cursor
      cursor += 1
      const platformId = platforms[index]
      if (platformId === undefined) return

      // SR-46：到点了就不再开始新平台。判定在**领取时**做 ——
      // 已在跑的泳道继续到自己的终点（页与页之间收手由 deadlineAt 管）。
      if (budgetExhausted()) {
        cut.push(platformId)
        continue
      }

      const outcome: LaneOutcome<T> = { platformId, summary: null, error: null }
      try {
        outcome.summary = await launch(platformId)
      } catch (error) {
        outcome.error = error
      }
      slots[index] = outcome
      options.onSettled?.(outcome)
    }
  }

  const laneCount = Math.min(lanes, platforms.length)
  await Promise.all(Array.from({ length: laneCount }, () => worker()))

  // 按启动序压实（worker 写槽是乱序完成的）。
  const outcomes: Array<LaneOutcome<T>> = []
  for (const slot of slots) {
    if (slot !== undefined) outcomes.push(slot)
  }
  return { outcomes, cut }
}
