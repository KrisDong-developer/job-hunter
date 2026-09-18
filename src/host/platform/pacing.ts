/**
 * 采集节奏（P5 反风控节流，D-17a 同批升级）。
 *
 * 数值参考 BossHunter 的 `throttle.py`（BOSS 直聘上实战验证过的一组参数）：
 *
 *   * **均匀随机 → 高斯分布**：真人操作间隔是钟形的，不是平的。
 *     均匀分布在 [min,max] 两端出现的概率和高斯差异明显，是可识别的统计特征；
 *   * **犹豫（5%）**：额外 +2~5s 的停顿，模拟"人停下来想了想"；
 *   * **突发惩罚**：15 秒内 ≥3 次、45 秒内 ≥6 次操作时加罚延迟 ——
 *     连续快请求是频控最容易抓的特征，单纯随机区间完全防不住
 *     "随机数连续落在小区间"的情况。
 *
 * 随机源可注入（默认 `Math.random`），离线单测不必碰真随机。
 */

/** 随机源：返回 [0, 1)。 */
export type Random = () => number

/** Box-Muller 正态抽样。 */
function gaussStandard(random: Random): number {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** 均值/方差意义下的高斯抽样，直接裁剪到 [min, max]（钟形保留，尾巴截断）。 */
export function gaussBounded(
  mean: number,
  std: number,
  min: number,
  max: number,
  random: Random = Math.random,
): number {
  if (max <= min) return min
  const value = mean + std * gaussStandard(random)
  return Math.min(max, Math.max(min, value))
}

export interface HumanDelayOptions {
  /** 随机源（测试注入用）。 */
  random?: Random
  /** 犹豫概率。默认 0.05（BossHunter 同值）。`0` = 关闭犹豫。 */
  hesitateProbability?: number
  /** 犹豫额外延时的下限（ms）。默认 2000。 */
  hesitateMinMs?: number
  /** 犹豫额外延时的上限（ms）。默认 5000。 */
  hesitateMaxMs?: number
}

/**
 * 页间拟人延时（毫秒）：`N((min+max)/2, (max-min)/4)` 裁剪到 [min,max]，
 * 再按概率叠一层犹豫。只算数不等待 —— 等待由调用方用 `waitForTimeout` 执行，
 * 这样离线夹具（不真等）与真路径共用同一份计算。
 */
export function humanDelayMs(range: readonly [number, number], options: HumanDelayOptions = {}): number {
  const [min, max] = range
  if (max <= 0 || max <= min) return Math.max(0, min)
  const random = options.random ?? Math.random
  const mean = (min + max) / 2
  const std = (max - min) / 4
  let delay = gaussBounded(mean, std, min, max, random)

  const probability = options.hesitateProbability ?? 0.05
  if (probability > 0 && random() < probability) {
    const hesitateMin = options.hesitateMinMs ?? 2000
    const hesitateMax = options.hesitateMaxMs ?? 5000
    delay += hesitateMin + random() * Math.max(0, hesitateMax - hesitateMin)
  }
  return Math.round(delay)
}

/** 一条突发规则：`windowMs` 内已发生 ≥ `maxCount` 次 → 加罚 [penaltyMin, penaltyMax] ms。 */
export interface BurstRule {
  windowMs: number
  maxCount: number
  penaltyMinMs: number
  penaltyMaxMs: number
}

/** 默认突发规则（BossHunter 同款数值）。 */
export const BURST_RULES: readonly BurstRule[] = [
  { windowMs: 15_000, maxCount: 3, penaltyMinMs: 1_200, penaltyMaxMs: 2_800 },
  { windowMs: 45_000, maxCount: 6, penaltyMinMs: 4_000, penaltyMaxMs: 7_000 },
]

/** BurstGuard 的最小面（crawl 依赖它，测试注入桩也实现它）。 */
export interface BurstGuardLike {
  /** 当前该罚多少毫秒（0 = 不罚）。只读不改状态。 */
  penaltyMs(): number
  /** 记一次"动作已发生"。 */
  mark(): void
}

export interface BurstGuardOptions {
  /** 时间源（默认 `Date.now`）。 */
  now?: () => number
  /** 随机源。 */
  random?: Random
  /** 规则集（默认 `BURST_RULES`）。 */
  rules?: readonly BurstRule[]
}

/**
 * 滑动窗口突发惩罚。
 *
 * 访问模式假设：**同一把守卫只被一个平台、且串行地使用** —— 生产侧由
 * runtime 按 platformId 记忆实例（跨平台并发下各平台各一份，互不污染窗口），
 * 同平台串行由 platform/locks.ts 保证。跨轮次共享是刻意的：突发规则的
 * 本意就是"这个站点最近是不是被连续快请求打过"，换个轮次就清零等于没防。
 */
export class BurstGuard implements BurstGuardLike {
  private readonly marks: number[] = []
  private readonly now: () => number
  private readonly random: Random
  private readonly rules: readonly BurstRule[]

  constructor(options: BurstGuardOptions = {}) {
    this.now = options.now ?? ((): number => Date.now())
    this.random = options.random ?? Math.random
    this.rules = options.rules ?? BURST_RULES
  }

  mark(): void {
    const at = this.now()
    this.marks.push(at)
    // 只留最长窗口（再加余量）内的记录；BossHunter 用 deque(maxlen=12)，
    // 这里按窗口裁剪语义更直接 —— 反正最长窗口也只有 45s。
    const widest = this.rules.reduce((acc, rule) => Math.max(acc, rule.windowMs), 0)
    while (this.marks.length > 0) {
      const oldest = this.marks[0]
      if (oldest === undefined || at - oldest <= widest) break
      this.marks.shift()
    }
  }

  penaltyMs(): number {
    const at = this.now()
    let penalty = 0
    for (const rule of this.rules) {
      const count = this.marks.filter((mark) => at - mark <= rule.windowMs).length
      if (count < rule.maxCount) continue
      const extra = rule.penaltyMinMs + this.random() * Math.max(0, rule.penaltyMaxMs - rule.penaltyMinMs)
      penalty = Math.max(penalty, extra)
    }
    return Math.round(penalty)
  }
}
