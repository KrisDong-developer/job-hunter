/**
 * 每平台前置条件（SR-16）与它的两个**读数**：冷却截止 / 今日配额。
 *
 * ## 为什么从装配点搬出来
 *
 * 这三样都是**纯判定**（不发请求、不改状态），但读者有三个：
 * 调度器（据此拦）、`/platforms` 总览矩阵（据此显示"为什么不能跑"）、
 * 以及"为什么今天没跑"这个追问。住在 `runtime.ts` 的闭包里时，测试唯一的办法是
 * **复刻一份**（`test/scheduler/city-gate.test.ts` 里那句"复刻 runtime 门的城市档"
 * 就是这个后果）—— 而两份实现必然漂移，漂移的表现是
 * 「矩阵写着可以、到点却被挡住」，这类不一致比不做矩阵更糟。
 *
 * 所以判定与读数集中在这里：一条算法一份实现，读者按需 import。
 * 门的**判定顺序**钉在 `test/host/gate.test.ts`（越根本、越不可能自愈的原因越先报）。
 */
import { DAILY_CRAWL_LIMIT } from '../../shared/config/crawl.js'
import { citySupportOf } from '../platform/cities.js'
import { readAdapterHealth } from '../platform/health.js'
import { readPlatformRiskPause } from '../platform/risk-pause.js'
import type { AdapterRegistry } from '../platform/registry.js'
import type { PlatformGate } from '../scheduler/index.js'
import type { Store } from '../store/store.js'
import { isOfflineMode } from '../util/offline.js'
import type { Clock } from '../util/time.js'

/**
 * 装配参数。
 *
 * `storeOf` 是**读取函数**而不是快照：数据层是异步就绪的（§4.9），
 * 门在数据层就绪之前就可能被问到，而且必须如实回答 `lease_lost`。
 */
export interface PlatformGateDeps {
  storeOf: () => Store | undefined
  registry: AdapterRegistry
  clock: Clock
}

/**
 * SR-20：这个平台自己的冷却截止（ISO）。`null` = 没在冷却。
 *
 * 抽出来是因为**它有两个读者**：`createPlatformGate`（据此拦）与平台总览矩阵（据此显示）。
 * 两处各写一遍必然漂移，而这类漂移最难发现：矩阵写着"可以"，到点却被挡住。
 */
export function cooldownUntilOf(store: Store | undefined, platformId: string): string | null {
  if (store === undefined) return null
  const cooldown = store.setting.get<{ until?: string }>('cooldown-until', 'platform', platformId)
  if (cooldown === null || typeof cooldown !== 'object') return null
  const until = typeof cooldown.until === 'string' ? cooldown.until : null
  if (until === null) return null
  const at = new Date(until).getTime()
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

/**
 * SR-3：今天这个平台已经自动跑了几轮 / 上限。**同上：两个读者共用一份算法。**
 *
 * 只算**自动**触发的那些：手动是人在操作，不该被这条挡住（SR-3 的例外）。
 */
export function crawlQuotaOf(
  store: Store | undefined,
  platformId: string,
  clock: Clock,
): { used: number; limit: number } {
  if (store === undefined) return { used: 0, limit: DAILY_CRAWL_LIMIT }
  const today = clock().slice(0, 10)
  const used = store.crawlRun
    .list(200, platformId)
    .filter((run) => run.startedAt.slice(0, 10) === today && run.reason !== 'manual').length
  return { used, limit: DAILY_CRAWL_LIMIT }
}

/**
 * SR-16：**每平台独立**检查前置条件。
 *
 * 这是一个**纯判定**函数（不发请求、不改状态）—— 它回答的正是用户最想知道的那个问题：
 * 「为什么今天没跑？」。所以它的返回值直接进界面文案（SR-17/26）。
 *
 * 顺序：离线闸门 → **平台级风控暂停** → 适配器健康 → 登录态 → 每平台冷却 → 每日配额。
 * 顺序有讲究：越"根本、越不可能自愈"的原因越先报，
 * 否则"没到点/配额"这类会盖住"你的适配器已经坏了"。
 *
 * 风控暂停紧跟在离线闸门之后，是为了**保持迁移前的可见行为**：
 * 旧实现里方案级 `riskPaused` 也先于平台 gate 判定，于是"连续失败达阈值时
 * health 同时变 broken"的场合，用户看到的一直是 `risk_paused`。
 */
export function createPlatformGate(deps: PlatformGateDeps): PlatformGate {
  return (platformId, options) => {
    const opened = deps.storeOf()
    if (opened === undefined) return 'lease_lost'
    // 离线闸门（§14）：开了就**绝不**发起真实访问
    if (isOfflineMode()) return 'offline_gate'

    // SR-21：**平台级**风控暂停（真值在 `platform/risk-pause.ts`）。
    // 补跑（catch-up）是用户看到欠账后显式点的，按既有例外放行。
    if (options?.ignoreRiskPause !== true && readPlatformRiskPause(opened, platformId).paused) {
      return 'risk_paused'
    }

    const adapter = deps.registry.get(platformId)
    if (adapter === undefined) return 'adapter_broken'

    // 城市档（city_unsupported）：方案配了城市而**这个平台不认识它** ——
    // 配置层面的必败（buildSearchUrl 会直接拒绝，不猜城市码）。
    // 以前这种平台每个调度日真跑一次、烧一条注定失败的 crawl_run 再进冷却；
    // 现在门前拦下、带原因留痕。放在健康/登录之前：它**永远不会自愈**，
    // 只有用户改方案才会变 —— 越根本的原因越先报。
    const city = options?.city
    if (city !== undefined && city !== '' && citySupportOf(adapter, city) === 'unsupported') {
      return 'city_unsupported'
    }

    const health = readAdapterHealth(opened, platformId)
    if (health.health === 'broken') return 'adapter_broken'

    // 登录态：只有"确实被登录墙挡过"才算未登录。
    // 全新安装时 account_state 是空的（logged_in=0），但 51job 的搜索本来就不需要登录 ——
    // 把"从没检查过"当成"没登录"会让定时任务永远不跑，那是个很隐蔽的死锁。
    const account = opened.account.get(platformId)
    if (account !== undefined && !account.loggedIn && account.lastCheckAt !== null) return 'not_logged_in'

    // SR-20/23：**每平台独立冷却** —— 这个平台刚失败过就先别去碰它。
    // 判定放在这里（而不是调度器里）是因为这里已经是"每平台前置条件"的唯一入口，
    // 写冷却在调度器（它才知道哪一轮失败了），读冷却在这里。
    const cooldownUntil = cooldownUntilOf(opened, platformId)
    if (cooldownUntil !== null && new Date(cooldownUntil).getTime() > new Date(deps.clock()).getTime()) {
      return 'backoff'
    }

    // SR-3：每日上限（只算自动触发的那些；手动是人在操作，不该被这条挡住）
    const quota = crawlQuotaOf(opened, platformId, deps.clock)
    if (quota.used >= quota.limit) return 'quota_reached'

    return null
  }
}
