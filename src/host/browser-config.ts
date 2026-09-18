/**
 * 浏览器运行期配置（"空闲自关" + D-17a 的引擎/stealth 开关）。
 *
 * 为什么不塞进 `guard/rules.ts` 的 `GuardConfig`：那一层是**安全闸门**
 * （额度、冷却、审批开关），这些键模型一律不能改（`MODEL_FORBIDDEN_KEYS`）。
 * "浏览器空闲多久关掉"是**资源与体验**设置，"用哪个引擎/要不要 stealth 注入"
 * 是**环境一致性**设置（D-17a）—— 都不是闸门，
 * 混进 GuardConfig 会让"模型能不能改"这件事变得含糊。
 *
 * 也没有复用它自己的 `ai` 通道：那是模型用途开关，同样不是一类东西。
 * 所以单独一个键 + 单独一个读写器，走 setting 表的 `scope='global'`。
 */
import {
  BROWSER_IDLE_DEFAULT_MIN,
  BROWSER_IDLE_KEY,
  BROWSER_IDLE_MAX_MIN,
  BROWSER_IDLE_MIN_MIN,
} from '../shared/constants.js'
import type { BrowserEngine } from './platform/browser.js'
import type { Store } from './store/store.js'

export interface BrowserConfig {
  /**
   * 采集浏览器空闲多少**分钟**后自动关闭。
   * `0` = 不自动关闭（保持"一直开着直到插件卸载"的旧行为）。
   */
  idleCloseMinutes: number
  /**
   * 引擎偏好（D-17a）。`auto` = 优先 patchright，装不上退 playwright-core。
   */
  engine: BrowserEngine
  /**
   * 是否注入 stealth 脚本（D-17a）。默认开；某站点被误伤时可关。
   */
  stealthInit: boolean
}

export const BROWSER_IDLE_FALLBACK: BrowserConfig = {
  idleCloseMinutes: BROWSER_IDLE_DEFAULT_MIN,
  engine: 'auto',
  stealthInit: true,
}

const ENGINES: readonly BrowserEngine[] = ['auto', 'patchright', 'playwright-core']

/**
 * 把任意输入收敛成合法值。
 *
 * 坏输入都要能被吸收，而不是让浏览器关不掉或关太快：
 *   * 非数字 / NaN / Infinity → 用默认值；
 *   * 负数 → 0（= 不关，"我明确不要它关"比"关得比谁都快"更接近意图）；
 *   * 超上限 → 上限。
 * 小数按四舍五入取整分钟。
 */
export function normalizeBrowserConfig(input: unknown): BrowserConfig {
  const raw = (input as { idleCloseMinutes?: unknown; engine?: unknown; stealthInit?: unknown } | null | undefined)
  const fallback = { ...BROWSER_IDLE_FALLBACK }
  if (raw === null || typeof raw !== 'object') return fallback

  const minutesRaw = raw.idleCloseMinutes
  let idleCloseMinutes = fallback.idleCloseMinutes
  if (typeof minutesRaw === 'number' && Number.isFinite(minutesRaw)) {
    idleCloseMinutes = Math.min(
      BROWSER_IDLE_MAX_MIN,
      Math.max(BROWSER_IDLE_MIN_MIN, Math.round(minutesRaw)),
    )
  }

  const engine = typeof raw.engine === 'string' && (ENGINES as readonly string[]).includes(raw.engine)
    ? (raw.engine as BrowserEngine)
    : fallback.engine

  const stealthInit = typeof raw.stealthInit === 'boolean' ? raw.stealthInit : fallback.stealthInit

  return { idleCloseMinutes, engine, stealthInit }
}

export function readBrowserConfig(store: Store): BrowserConfig {
  return normalizeBrowserConfig(store.setting.get<unknown>(BROWSER_IDLE_KEY, 'global', ''))
}

export function writeBrowserConfig(store: Store, patch: Partial<BrowserConfig>, now: string): BrowserConfig {
  const current = readBrowserConfig(store)
  const next = normalizeBrowserConfig({ ...current, ...patch })
  store.setting.set(BROWSER_IDLE_KEY, 'global', '', next, now)
  return next
}
