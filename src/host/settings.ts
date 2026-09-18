/**
 * 插件配置门面（§22.2 `job_settings` / §15）。
 *
 * 界面上改配置、模型工具改配置、审计三者必须**同一套写入路径** ——
 * 否则"模型改了一个开关但界面上看不到"这种事故迟早发生。
 *
 * 写 guard 配置必须持有 guard 令牌（`guardToken` 参数强制），
 * 所以 `settings.write` 这个动作也要过闸门：中危 + 界面发起 → 不打扰用户；
 * 中危 + 模型发起 → 走审批（模型扩大自身权限正是 D-14 要防的事）。
 */
import type { AiConfig, AiConfigPatch, AiPurpose } from './ai/purposes.js'
import { AI_PURPOSE_DEFAULT_ENABLED, AI_PURPOSE_LABEL, normalizeAiConfig } from './ai/purposes.js'
import type { BrowserConfig } from './browser-config.js'
import type { SettingsWriteDeps } from './guard/actions/settings.js'
import { writeGuardSettings } from './guard/actions/settings.js'
import type { GuardToken } from './guard/token.js'
import { DEFAULT_GUARD_CONFIG, readGuardConfig, type GuardConfig } from './guard/rules.js'
import type { Store } from './store/store.js'
import type { CrawlConfig } from './crawl-config.js'

export interface SettingsSnapshot {
  ai: AiConfig
  guard: GuardConfig
  /** 浏览器运行期设置（目前只有空闲自关）。**不是**闸门配置。 */
  browser: BrowserConfig
  /** 采集运行期设置（单轮预算）。资源/节奏设置，**不是**闸门配置。 */
  crawl: CrawlConfig
  /** 供界面展示"这些开关现在是什么状态"的派生信息。 */
  derived: {
    /** 每个用途是否真的可用（总开关 + 用途开关）。 */
    purposes: Array<{ purpose: AiPurpose; label: string; enabled: boolean }>
    /** 模型能改哪些、不能改哪些，直接告诉用户。 */
    modelEditable: string[]
    modelForbidden: string[]
    /**
     * 出厂默认值。
     *
     * 为什么由宿主下发而不是客户端写死：默认值的事实来源是
     * `DEFAULT_GUARD_CONFIG` 与 `AI_PURPOSE_DEFAULT_ENABLED`，客户端再抄一份迟早会漂移
     * （本项目已经在"同名规则各写一份"上吃过亏）。界面只拿它做两件事：
     * 问号说明里的"默认是多少"，以及发送时段被清空（不限）后输入框该显示什么。
     */
    defaults: {
      /** 每个用途的出厂默认开关。 */
      purposes: Record<string, boolean>
      guard: {
        dailyLimits: { greeting: number; application: number; reply: number }
        cooldownMinutes: number
        batchLimit: number
        sendWindow: string
        dayOffProbability: number
      }
    }
  }
}

export interface SettingsPatch {
  ai?: AiConfigPatch
  guard?: Partial<GuardConfig>
  browser?: Partial<BrowserConfig>
  crawl?: Partial<CrawlConfig>
}

export interface SettingsService {
  snapshot(): SettingsSnapshot
  /** 写配置。`guardToken` 由 `guard.run('settings.write')` 签发。 */
  update(patch: SettingsPatch, guardToken: GuardToken): SettingsSnapshot
}

export interface SettingsDeps extends SettingsWriteDeps {
  ai: {
    config(): AiConfig
    setConfig(patch: AiConfigPatch): AiConfig
  }
  /**
   * 浏览器运行期设置。
   *
   * `write` **必须**同时把新值作用到浏览器实例上（不只是落库）——
   * 否则界面上显示"已改成 5 分钟"，实际还是旧值，这类"设置不生效"最难查。
   */
  browser: {
    read(): BrowserConfig
    write(patch: Partial<BrowserConfig>): BrowserConfig
  }
  /** 采集运行期设置（单轮预算）。调度器每次开轮都读一次，改完即刻生效。 */
  crawl: {
    read(): CrawlConfig
    write(patch: Partial<CrawlConfig>): CrawlConfig
  }
  clock?: () => string
}

/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。 */
export const MODEL_FORBIDDEN_KEYS = [
  'requireApproval',
  'auditEnabled',
  'batchLimit',
  'dailyLimits',
  'cooldownMinutes',
  'sendWindow',
  'dayOffProbability',
] as const

/** 模型能改的键：只影响"读什么、用什么"，不影响闸门本身。 */
export const MODEL_EDITABLE_KEYS = ['ai', 'levels', 'browser'] as const

export function createSettingsService(deps: SettingsDeps): SettingsService {
  const snapshot = (): SettingsSnapshot => {
    const ai = normalizeAiConfig(deps.ai.config())
    const guard = readGuardConfig(deps.store)
    return {
      ai,
      guard,
      browser: deps.browser.read(),
      crawl: deps.crawl.read(),
      derived: {
        purposes: (Object.keys(AI_PURPOSE_LABEL) as AiPurpose[]).map((purpose) => ({
          purpose,
          label: AI_PURPOSE_LABEL[purpose],
          enabled: ai.enabled && ai.purposes[purpose] !== false,
        })),
        modelEditable: [...MODEL_EDITABLE_KEYS],
        modelForbidden: [...MODEL_FORBIDDEN_KEYS],
        defaults: {
          purposes: { ...AI_PURPOSE_DEFAULT_ENABLED },
          guard: {
            dailyLimits: { ...DEFAULT_GUARD_CONFIG.dailyLimits },
            cooldownMinutes: DEFAULT_GUARD_CONFIG.cooldownMinutes,
            batchLimit: DEFAULT_GUARD_CONFIG.batchLimit,
            sendWindow: DEFAULT_GUARD_CONFIG.sendWindow,
            dayOffProbability: DEFAULT_GUARD_CONFIG.dayOffProbability,
          },
        },
      },
    }
  }

  return {
    snapshot,

    update(patch, guardToken): SettingsSnapshot {
      // guard 配置的写入必须过令牌校验（`writeGuardSettings` 首行 assert）
      if (patch.guard !== undefined && Object.keys(patch.guard).length > 0) {
        writeGuardSettings({ store: deps.store, ...(deps.clock === undefined ? {} : { clock: deps.clock }) }, guardToken, patch.guard)
      }
      if (patch.ai !== undefined && Object.keys(patch.ai).length > 0) {
        deps.ai.setConfig(patch.ai)
      }
      // 浏览器设置**不过** guard 令牌：它是资源设置，不是闸门。
      if (patch.browser !== undefined && Object.keys(patch.browser).length > 0) {
        deps.browser.write(patch.browser)
      }
      // 采集预算同理（资源/节奏设置）；且模型不可改 —— 见 crawl-config.ts 的说明。
      if (patch.crawl !== undefined && Object.keys(patch.crawl).length > 0) {
        deps.crawl.write(patch.crawl)
      }
      return snapshot()
    },
  }
}

/** 把用户能看懂的一行摘要给审批文案用。 */
export function describeSettingsPatch(patch: SettingsPatch): string {
  const parts: string[] = []
  if (patch.ai !== undefined) {
    if (patch.ai.enabled !== undefined) parts.push(`模型总开关 → ${patch.ai.enabled ? '开' : '关'}`)
    for (const [purpose, value] of Object.entries(patch.ai.purposes ?? {})) {
      const label = AI_PURPOSE_LABEL[purpose as AiPurpose] ?? purpose
      parts.push(`${label} → ${value === true ? '开' : '关'}`)
    }
  }
  if (patch.guard !== undefined) {
    if (patch.guard.levels !== undefined) {
      const levels = patch.guard.levels
      if (levels.l3Greeting !== undefined) parts.push(`L3 打招呼 → ${levels.l3Greeting ? '开' : '关'}`)
      if (levels.l4Application !== undefined) parts.push(`L4 投递 → ${levels.l4Application ? '开' : '关'}`)
      if (levels.l4Reply !== undefined) parts.push(`L4 回复 → ${levels.l4Reply ? '开' : '关'}`)
    }
    for (const key of MODEL_FORBIDDEN_KEYS) {
      if (patch.guard[key] !== undefined) parts.push(`${key} → ${JSON.stringify(patch.guard[key])}`)
    }
  }
  if (patch.browser?.idleCloseMinutes !== undefined) {
    const minutes = patch.browser.idleCloseMinutes
    parts.push(minutes <= 0 ? '浏览器空闲后不自动关闭' : `浏览器空闲 ${String(minutes)} 分钟后关闭`)
  }
  if (patch.browser?.closeAfterRun !== undefined) {
    parts.push(
      patch.browser.closeAfterRun
        ? '每轮采集结束后关闭采集浏览器'
        : '每轮采集结束后不关闭采集浏览器（改由空闲时长决定）',
    )
  }
  if (patch.crawl?.roundBudgetMinutes !== undefined) {
    parts.push(`单轮采集预算 → ${String(patch.crawl.roundBudgetMinutes)} 分钟`)
  }
  return parts.length === 0 ? '（没有实际改动）' : parts.join('；')
}

/** 供 `store` 参数的类型标注复用。 */
export type { Store }
