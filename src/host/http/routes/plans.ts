/**
 * 搜索方案与调度（P3）的路由块。
 * 管 GET/POST /plans、POST /plans/validate、POST|PATCH|DELETE /plans/:id，
 * 以及 POST /plans/:id/validate（只校验不写库）、/run（manual 或 catch-up）、/resume（人工恢复风控暂停）。
 */
import type { PlanDto, PlanPlatformOverrideDto, PlanSchedule } from '../../../shared/dto.js'
import type { PlanConfigInput } from '../../domain/plans.js'
import { normalizePlatformOverrides } from '../../store/repo/plans.js'
import { DomainError } from '../../util/errors.js'
import { json, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 把请求体收敛成**显式给出**的方案字段。没给的键一律不出现 —— 更新时靠这一点保留原值。 */
function planPatchOf(body: Record<string, unknown>): PlanConfigInput {
  const patch: PlanConfigInput = {}
  if (typeof body['name'] === 'string') patch.name = body['name']
  if (Array.isArray(body['platforms'])) {
    patch.platforms = body['platforms'].filter(
      (value): value is string => typeof value === 'string' && value !== '',
    )
  }
  // 多关键词：字符串数组白名单（trim/去重/上限在领域层校验）。
  // 注意 `[]` 是合法值（清空关键词）—— 判 `Array.isArray` 而不是"非空才收"。
  if (Array.isArray(body['keywords'])) {
    patch.keywords = body['keywords'].filter(
      (value): value is string => typeof value === 'string',
    )
  }
  if (typeof body['criteria'] === 'object' && body['criteria'] !== null && !Array.isArray(body['criteria'])) {
    const criteria: Record<string, string> = {}
    for (const [key, value] of Object.entries(body['criteria'] as Record<string, unknown>)) {
      // 数值型维度允许直接给数字（界面上的数字输入框就是这么发的）
      if (typeof value === 'string') criteria[key] = value
      else if (typeof value === 'number' && Number.isFinite(value)) criteria[key] = String(value)
    }
    patch.criteria = criteria
  }
  if (typeof body['platformOverrides'] === 'object' &&
    body['platformOverrides'] !== null &&
    !Array.isArray(body['platformOverrides'])) {
    // 批次 3：每平台的覆盖项（`enabled` / `maxPages`）。
    // `maxPages` 同时接受数字与字符串 —— 界面上的数字输入框两种都可能发。
    // 语义是**整份替换**（与 criteria 一致），不是逐键合并：稀疏存储下
    // "把某平台的覆盖删掉"必须能表达得出来，逐键合并做不到这件事。
    const overrides: Record<string, Partial<PlanPlatformOverrideDto>> = {}
    for (const [id, raw] of Object.entries(body['platformOverrides'] as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
      const entry = raw as Record<string, unknown>
      const parsed: Partial<PlanPlatformOverrideDto> = {}
      if (typeof entry['enabled'] === 'boolean') parsed.enabled = entry['enabled']
      const maxPages = entry['maxPages']
      if (maxPages === null) {
        parsed.maxPages = null
      } else if (typeof maxPages === 'number' && Number.isFinite(maxPages)) {
        parsed.maxPages = Math.trunc(maxPages)
      } else if (typeof maxPages === 'string' && maxPages.trim() !== '') {
        const value = Number.parseInt(maxPages, 10)
        parsed.maxPages = Number.isFinite(value) ? value : null
      }
      overrides[id] = parsed
    }
    patch.platformOverrides = overrides
  }
  if (typeof body['schedule'] === 'object' && body['schedule'] !== null) {
    patch.schedule = scheduleOf(body['schedule'] as Record<string, unknown>)
  }
  if (typeof body['postProcess'] === 'object' && body['postProcess'] !== null) {
    const source = body['postProcess'] as Record<string, unknown>
    const postProcess: Record<string, boolean> = {}
    for (const key of ['score', 'flag', 'dedup']) {
      if (typeof source[key] === 'boolean') postProcess[key] = source[key] as boolean
    }
    patch.postProcess = postProcess
  }
  if (typeof body['enabled'] === 'boolean') patch.enabled = body['enabled']
  return patch
}

/**
 * 解析偏好时段（SR-1/32）。
 *
 * **不认识 `hour` / `minute`**：那正是 SR-32 要取消的"精确到分钟的单点时刻"。
 * 收到它们就明确报错并指出正确用法 —— 静默忽略会让调用方以为自己配成功了，
 * 而实际跑的是另一个时段（这类"看起来对、其实不对"的配置 bug 最难查）。
 */
function scheduleOf(source: Record<string, unknown>): Partial<PlanSchedule> {
  const schedule: Partial<PlanSchedule> = {}
  const hourKeys = ['hour', 'minute'].filter((key) => source[key] !== undefined)
  if (hourKeys.length > 0) {
    throw new DomainError('INVALID_INPUT', `偏好时段不接受 ${hourKeys.join(' / ')}`, {
      hint:
        '配置的是**时段**而不是单点时刻（SR-32）：用 windowStartHour / windowEndHour ' +
        '（可加 windowStartMinute / windowEndMinute），触发点在这个时段内随机选。',
    })
  }
  const intField = (key: string, min: number, max: number): void => {
    const value = source[key]
    if (value === undefined) return
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DomainError('INVALID_INPUT', `${key} 必须是数字`)
    }
    const truncated = Math.trunc(value)
    if (truncated < min || truncated > max) {
      throw new DomainError('INVALID_INPUT', `${key} 必须在 ${String(min)}–${String(max)} 之间`)
    }
    ;(schedule as Record<string, number>)[key] = truncated
  }
  intField('windowStartHour', 0, 23)
  intField('windowStartMinute', 0, 59)
  intField('windowEndHour', 0, 23)
  intField('windowEndMinute', 0, 59)
  intField('jitterMs', 0, 60 * 60 * 1000)
  intField('missedGraceMs', 0, 7 * 24 * 60 * 60 * 1000)
  if (Array.isArray(source['weekdays'])) {
    schedule.weekdays = source['weekdays'].filter(
      (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6,
    )
  }
  if (typeof source['enabled'] === 'boolean') schedule.enabled = source['enabled']
  return schedule
}

/**
 * 新建方案：缺省字段交给领域层。
 *
 * 注意 `platforms` **不在这里兜底** —— 写死 `['51job']` 会在多平台落地那天
 * 变成"新装的用户只抓到 51job"这种没人查得出来的 bug。
 * 缺省平台由路由层用**注册表**补齐（见 `POST /plans` 的处理）。
 */
function planCreateOf(body: Record<string, unknown>): PlanConfigInput {
  const patch = planPatchOf(body)
  return {
    name: patch.name ?? '未命名方案',
    ...(patch.platforms === undefined ? {} : { platforms: patch.platforms }),
    ...(patch.keywords === undefined ? {} : { keywords: patch.keywords }),
    ...(patch.platformOverrides === undefined ? {} : { platformOverrides: patch.platformOverrides }),
    ...(patch.criteria === undefined ? {} : { criteria: patch.criteria }),
    ...(patch.schedule === undefined ? {} : { schedule: patch.schedule }),
    ...(patch.postProcess === undefined ? {} : { postProcess: patch.postProcess }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
  }
}

/**
 * 「方案现值 + 补丁」→ **校验输入**。
 *
 * ## 为什么必须有这一份（而不是各处手拼）
 *
 * 界面上的"实时查重 / 点「检查」"（`POST /plans/:id/validate`）与真正保存
 * （`PATCH /plans/:id`）报的必须是同一套结论 —— 否则会出现"检查说没重复、
 * 保存后才发现重复"。
 *
 * ⚠️ 拼法必须与 `PlanService.update` 内部的 `merged` **逐字段一致**。
 * 这里曾经漏掉 `keywords` 与 `platformOverrides`：`keywords` 一缺，查重口径里的
 * 生效关键词恒为空串，多关键词方案之间**永远查不出重复**；`platformOverrides`
 * 一缺，"所有平台都被停用""单平台页数超上限"这类硬判据在保存前根本不出现。
 *
 * `platformOverrides` 先按新的平台集合收敛一次，与 `update` 一致 —— 否则
 * "把某个平台移出方案"会被校验的越界检查拦住，而那不是用户的错。
 */
function validationInputOf(current: PlanDto, patch: PlanConfigInput): PlanConfigInput {
  const platforms = patch.platforms ?? current.platforms
  return {
    name: patch.name ?? current.name,
    platforms,
    keywords: patch.keywords ?? current.keywords,
    platformOverrides: normalizePlatformOverrides(
      patch.platformOverrides ?? current.platformOverrides,
      platforms,
    ),
    criteria: patch.criteria ?? current.criteria,
    schedule: { ...current.schedule, ...(patch.schedule ?? {}) },
    enabled: patch.enabled ?? current.enabled,
    postProcess: { ...current.postProcess, ...(patch.postProcess ?? {}) },
  }
}

export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'plans')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()
  return json(200, { items: planService.list() })
}

export async function create(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'plans')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  const body = await readObject(req)
  const input = planCreateOf(body)
  // SR-39：缺省平台 = **注册表里的全部平台**，不是写死的 '51job'。
  // 写死会在多平台落地那天变成"新装的用户只抓到 51job"这种没人查得出来的 bug。
  if (input.platforms === undefined || input.platforms.length === 0) {
    input.platforms = runtime.registry().list().map((adapter) => adapter.id)
  }
  // SR-43：先校验一次，把"与谁重复"如实回给调用方（保存仍然成功 —— 只提示不合并）
  const checked = planService.validate(input)
  const plan = planService.create(input)
  return json(201, { ok: true, plan, duplicates: checked.duplicates, notices: checked.notices })
}

export async function validateDraft(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'plans' && segments[1] === 'validate')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  // 草稿校验（没有 id 的新方案）：新建方案在保存**之前**也需要
  // "与谁重复 / 哪些平台会返回空"。保存后才提示已经晚了一步。
  // 与上面那条共用 `planService.validate` —— 三条入口一份实现的约定不变（SR-45）。
  const body = await readObject(req)
  const input = planCreateOf(body)
  if (input.platforms === undefined || input.platforms.length === 0) {
    input.platforms = runtime.registry().list().map((adapter) => adapter.id)
  }
  return json(200, { ok: true, validation: planService.validate(input) })
}

export async function validate(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'plans' && segments[2] === 'validate')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  const planId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(planId)) {
    throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`)
  }

  // SR-45："只校验、不写库"—— 界面保存前先问一句靠它。
  // 它与下面的写入路径、与模型工具调的都是 `planService.validate`，
  // 且输入由**同一个** `validationInputOf` 拼出来，所以三边报错完全一致。
  const body = await readObject(req)
  const input = planCreateOf(body)
  const current = planService.get(planId)
  return json(200, {
    ok: true,
    validation: planService.validate(validationInputOf(current, input), planId),
  })
}

export async function patch(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'plans')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  const planId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(planId)) {
    throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  const patch = planPatchOf(body)
  const current = planService.get(planId)
  // 回执里的"与谁重复 / 有哪些提示"必须与真正写进去的那份配置同一口径，
  // 所以这里与写入路径共用 `validationInputOf`（见它的注释）。
  const checked = planService.validate(validationInputOf(current, patch), planId)
  return json(200, {
    ok: true,
    plan: planService.update(planId, patch),
    duplicates: checked.duplicates,
    notices: checked.notices,
  })
}

export async function remove(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'plans')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  const planId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(planId)) {
    throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`)
  }

  const removed = planService.remove(planId)
  if (!removed) throw new DomainError('NOT_FOUND', `方案不存在：${String(planId)}`)
  return json(200, { ok: true })
}

export async function run(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'plans' && segments[2] === 'run')) {
    return undefined
  }
  requireData(runtime)

  const planId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(planId)) {
    throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  const reason = body['catchUp'] === true ? 'catch-up' : 'manual'
  const summary = await runtime.runPlan(planId, reason)
  return json(200, summary)
}

export async function resume(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'plans' && segments[2] === 'resume')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()

  const planId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(planId)) {
    throw new DomainError('INVALID_INPUT', `非法方案 id：${segments[1] ?? ''}`)
  }

  // SR-21：风控暂停只能由**人工确认**恢复，系统不会自动恢复。
  runtime.resumeRisk(planId)
  return json(200, { ok: true, plan: planService.get(planId) })
}
