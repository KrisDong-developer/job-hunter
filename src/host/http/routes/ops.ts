/**
 * 运维类端点：宿主自检操作、模型调用留痕、审计、插件配置、额度读数。
 *
 * 这个模块管这些端点：
 * - `POST /system/reveal` —— 打开数据文件所在目录；
 * - `GET /llm/calls` —— 模型调用留痕（I5 知情同意要可查）；
 * - `GET /audit` —— 审计日志；
 * - `GET /settings` / `PATCH /settings` —— 插件配置读写；
 * - `GET /guard/usage` —— 每日额度读数（D7 / U0「额度余量」）。
 */
import { dataNotReady } from '../../runtime/contract.js'
import type { SettingsPatch } from '../../settings.js'
import { DomainError } from '../../util/errors.js'
import { revealDataFile } from '../../util/reveal.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

export async function systemReveal(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── POST /system/reveal ────────────────────────────────────────────
  // 「设置 → 诊断与调用日志 → 数据文件」那一行的「打开所在文件夹」。
  // **不接受任何路径参数**：只能打开数据文件自己的目录（见 util/reveal.ts），
  // 所以界面拼不出"打开任意目录"的请求。POST 因此也自动过同源校验。
  //
  // 200 里带 ok 而不是直接 200=成功：打开失败（系统没有文件管理器）是**业务结果**
  // 不是协议错误，界面要如实转述，所以不用状态码表达。
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'system' && segments[1] === 'reveal')) return undefined
  requireData(runtime)
  const dataPath = runtime.health().dataPath
  if (dataPath === null || dataPath === '') {
    throw new DomainError('DATA_UNAVAILABLE', '还没有数据文件，没有可打开的目录')
  }
  const result = await revealDataFile(dataPath)
  return json(200, {
    ok: result.ok,
    dir: result.dir,
    ...(result.reason === null ? {} : { reason: result.reason }),
  })
}

export async function llmCalls(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // ── 审计与模型调用留痕（P5：I5 知情同意要可查）─────────────────────
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'llm' && segments[1] === 'calls')) return undefined
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)
  const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 500)
  const purpose = req.query.get('purpose')
  return json(200, {
    items: store.llmCall.list(limit, purpose === null || purpose === '' ? undefined : purpose),
    stats: store.llmCall.stats(),
    /** 口径说明必须在响应里 —— 用户看到的"外发字段"就是这些字段名。 */
    note: 'fields 是这次调用实际发给模型的字段清单（不含正文）。',
  })
}

export async function audit(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'audit')) return undefined
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)
  const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 500)
  const actor = req.query.get('actor')
  const action = req.query.get('action')
  return json(200, {
    items: store.audit.list(limit, {
      ...(actor === null || actor === '' ? {} : { actor }),
      ...(action === null || action === '' ? {} : { action }),
    }),
    count: store.audit.count(),
    /** 审计只存摘要与长度，不存正文（§4.1 审计表隐私策略）。 */
    note: 'detail 只保留字段摘要与长度，正文不入审计表；正文请到对应业务记录里看。',
  })
}

/**
 * `GET /guard/usage` —— D7 的额度读数（U0「额度余量」的数据面）。
 *
 * 在它之前，额度**只在被拒的那一刻**才说出来（`checkQuota` 的 deny 文案）：
 * 用户会去设置里把每日额度调大，却发现还是被拒 —— 因为限住他的是**平台侧上限**。
 * 所以每一格都带 `platformCap` 与 `limitedBy`，让"该改哪里"是读得出来的。
 *
 * 与抓取配额（`/platforms` 的 `governance.todayRuns`）**不是一回事**：
 * 那个数的是"自动跑了几轮采集"，这个数的是"发了几条招呼 / 投了几份 / 回了几条"。
 */
export async function guardUsage(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'guard' && segments[1] === 'usage')) {
    return undefined
  }
  const platformId = req.query.get('platformId')
  // 数据层未就绪时由 runtime 返回空结构 + 说明（U0 要能把"为什么没有数据"显示出来），
  // 所以这里**不**做 requireData
  return json(
    200,
    runtime.guardUsage(platformId === null || platformId === '' ? undefined : platformId),
  )
}

/** 原 router.ts 的 `GET /settings`。 */
export async function settingsGet(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── 插件配置（P5）─────────────────────────────────────────────────
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'settings')) return undefined
  requireData(runtime)
  return json(200, runtime.settings().snapshot())
}

export async function settingsPatch(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'PATCH' && segments.length === 1 && segments[0] === 'settings')) return undefined
  requireData(runtime)
  const body = await readObject(req)
  const next = await runtime.updateSettings(settingsPatchOf(body), 'gui')
  return json(200, { ok: true, settings: next })
}

/**
 * 解析配置补丁（P5）。
 *
 * 只认识 `ai`、`guard`、`browser` 三个顶层键，其余一律忽略 ——
 * 让界面**不可能**通过手搓 JSON 去碰它不该碰的东西。
 * guard 那半边的键是否合法由 `guard/actions/settings.ts` 判定（模型有禁止项，用户没有）。
 * browser 暴露 `idleCloseMinutes`（数字）、`engine`（字符串枚举）、`stealthInit`（布尔）
 * —— 取值合法性由 `normalizeBrowserConfig` 收敛，这里只做类型白名单。
 */
function settingsPatchOf(body: Record<string, unknown>): SettingsPatch {
  const patch: SettingsPatch = {}
  const ai = body['ai']
  if (typeof ai === 'object' && ai !== null) {
    const source = ai as Record<string, unknown>
    const purposes =
      typeof source['purposes'] === 'object' && source['purposes'] !== null
        ? (source['purposes'] as Record<string, boolean>)
        : undefined
    patch.ai = {
      ...(typeof source['enabled'] === 'boolean' ? { enabled: source['enabled'] } : {}),
      ...(purposes === undefined ? {} : { purposes: purposes as never }),
    }
  }
  const guard = body['guard']
  if (typeof guard === 'object' && guard !== null) {
    const source = guard as Record<string, unknown>
    const levels =
      typeof source['levels'] === 'object' && source['levels'] !== null
        ? (source['levels'] as Record<string, boolean>)
        : undefined
    patch.guard = {
      ...(levels === undefined ? {} : { levels: levels as never }),
      ...(typeof source['requireApproval'] === 'boolean' ? { requireApproval: source['requireApproval'] } : {}),
      ...(typeof source['auditEnabled'] === 'boolean' ? { auditEnabled: source['auditEnabled'] } : {}),
      ...(typeof source['batchLimit'] === 'number' ? { batchLimit: source['batchLimit'] } : {}),
      ...(typeof source['cooldownMinutes'] === 'number' ? { cooldownMinutes: source['cooldownMinutes'] } : {}),
      ...(typeof source['sendWindow'] === 'string' ? { sendWindow: source['sendWindow'] } : {}),
      ...(typeof source['dayOffProbability'] === 'number' ? { dayOffProbability: source['dayOffProbability'] } : {}),
      ...(typeof source['dailyLimits'] === 'object' && source['dailyLimits'] !== null
        ? { dailyLimits: source['dailyLimits'] as never }
        : {}),
    }
  }
  const browser = body['browser']
  if (typeof browser === 'object' && browser !== null) {
    const source = browser as Record<string, unknown>
    patch.browser = {
      ...(typeof source['idleCloseMinutes'] === 'number' ? { idleCloseMinutes: source['idleCloseMinutes'] } : {}),
      // "每轮采集结束后就关"（用户要求）：布尔白名单；与分钟那一格的优先级在 idleCloseMsOf
      ...(typeof source['closeAfterRun'] === 'boolean' ? { closeAfterRun: source['closeAfterRun'] } : {}),
      // D-17a：引擎偏好与 stealth 注入开关（类型白名单；取值由 normalizeBrowserConfig 收敛）
      ...(typeof source['engine'] === 'string' ? { engine: source['engine'] as never } : {}),
      ...(typeof source['stealthInit'] === 'boolean' ? { stealthInit: source['stealthInit'] } : {}),
    }
  }
  // 单轮预算（用户要求可调）：数字白名单，取值由 normalizeCrawlConfig 收敛到 5–240。
  const crawl = body['crawl']
  if (typeof crawl === 'object' && crawl !== null) {
    const source = crawl as Record<string, unknown>
    patch.crawl = {
      ...(typeof source['roundBudgetMinutes'] === 'number'
        ? { roundBudgetMinutes: source['roundBudgetMinutes'] }
        : {}),
    }
  }
  // 数据保留策略（§18）：数字（天）与一个布尔，取值由 normalizeRetentionPolicy 收敛。
  // 与 browser / crawl 同级 —— 资源设置，不是闸门，所以不需要审批令牌。
  const retention = body['retention']
  if (typeof retention === 'object' && retention !== null) {
    const source = retention as Record<string, unknown>
    const days = (key: string): number | undefined =>
      typeof source[key] === 'number' ? (source[key] as number) : undefined
    const next: Record<string, number | boolean> = {}
    for (const key of [
      'crawlRunsDays',
      'auditLogDays',
      'llmCallsDays',
      'pendingRepairDays',
      'jdTextDays',
      'jobsDays',
    ]) {
      const value = days(key)
      if (value !== undefined) next[key] = value
    }
    if (typeof source['autoCleanEnabled'] === 'boolean') next['autoCleanEnabled'] = source['autoCleanEnabled']
    patch.retention = next as never
  }
  return patch
}
