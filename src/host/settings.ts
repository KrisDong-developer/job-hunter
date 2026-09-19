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
import type { RetentionPolicy } from '../shared/dto.js'
import { RETENTION_AUTO_CLEAN_DEFAULT, RETENTION_DEFAULTS } from '../shared/constants.js'
import type { Store } from './store/store.js'
import type { CrawlConfig } from './crawl-config.js'

export interface SettingsSnapshot {
  ai: AiConfig
  guard: GuardConfig
  /** 浏览器运行期设置（目前只有空闲自关）。**不是**闸门配置。 */
  browser: BrowserConfig
  /** 采集运行期设置（单轮预算）。资源/节奏设置，**不是**闸门配置。 */
  crawl: CrawlConfig
  /**
   * 数据保留策略（§18 / §15 的「保留」一栏）。同样是资源设置，**不是**闸门。
   *
   * 放在这里而不是塞进 GuardConfig：额度/冷却/审批是"能不能发出去"，
   * 保留期是"留多久"—— 混在一起会让"模型能不能改"这件事变得含糊
   * （模型的禁止项清单里有额度，但没有保留期）。
   */
  retention: RetentionPolicy
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
      /** 保留期的出厂默认（界面用它显示"恢复默认"该填什么）。 */
      retention: RetentionPolicy
    }
  }
}

export interface SettingsPatch {
  ai?: AiConfigPatch
  guard?: Partial<GuardConfig>
  browser?: Partial<BrowserConfig>
  crawl?: Partial<CrawlConfig>
  retention?: Partial<RetentionPolicy>
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
  /** 数据保留策略（§18）。改动即刻生效 —— 预览与清理每次都现读。 */
  retention: {
    read(): RetentionPolicy
    write(patch: Partial<RetentionPolicy>): RetentionPolicy
  }
  clock?: () => string
}

/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。
 *
 * `retention` 是 2026-09-19 加进来的：它决定"多久之后删数据"，
 * 与额度、冷却期是同一类**保护性配置** —— 让模型能把保留期调成 0 天，
 * 等于给它一个"把用户数据清掉"的间接开关。实现上它本来就不在 `job_settings`
 * 工具的参数里（模型传不进来），这里只是把这条事实**写进用户能看到的清单**里。
 */
export const MODEL_FORBIDDEN_KEYS = [
  'requireApproval',
  'auditEnabled',
  'batchLimit',
  'dailyLimits',
  'cooldownMinutes',
  'sendWindow',
  'dayOffProbability',
  'retention',
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
      retention: deps.retention.read(),
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
          retention: { ...RETENTION_DEFAULTS, autoCleanEnabled: RETENTION_AUTO_CLEAN_DEFAULT },
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
      // 保留策略同理：资源设置，不是闸门。清理动作本身有预览 + 两段式确认把关。
      if (patch.retention !== undefined && Object.keys(patch.retention).length > 0) {
        deps.retention.write(patch.retention)
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
    // 注意：`MODEL_FORBIDDEN_KEYS` 里还有 `retention`（它不在 GuardConfig 上），
    // 所以这里按字符串取键 —— 直接用它索引 `patch.guard` 会编译不过
    const guardPatch = patch.guard as Record<string, unknown>
    for (const key of MODEL_FORBIDDEN_KEYS) {
      if (guardPatch[key] !== undefined) parts.push(`${key} → ${JSON.stringify(guardPatch[key])}`)
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
  if (patch.retention !== undefined) {
    const days = (value: number): string => (value <= 0 ? '永久保留' : `${String(value)} 天`)
    if (patch.retention.crawlRunsDays !== undefined) parts.push(`抓取运行记录 → ${days(patch.retention.crawlRunsDays)}`)
    if (patch.retention.auditLogDays !== undefined) parts.push(`操作审计 → ${days(patch.retention.auditLogDays)}`)
    if (patch.retention.llmCallsDays !== undefined) parts.push(`模型调用留痕 → ${days(patch.retention.llmCallsDays)}`)
    if (patch.retention.pendingRepairDays !== undefined) parts.push(`已处理待修复记录 → ${days(patch.retention.pendingRepairDays)}`)
    if (patch.retention.jdTextDays !== undefined) parts.push(`JD 原文与摘要 → ${days(patch.retention.jdTextDays)}`)
    if (patch.retention.jobsDays !== undefined) parts.push(`从没被碰过的老岗位 → ${days(patch.retention.jobsDays)}`)
    if (patch.retention.autoCleanEnabled !== undefined) {
      parts.push(`启动时自动清理 → ${patch.retention.autoCleanEnabled ? '开' : '关'}`)
    }
  }
  return parts.length === 0 ? '（没有实际改动）' : parts.join('；')
}

/** 供 `store` 参数的类型标注复用。 */
export type { Store }
