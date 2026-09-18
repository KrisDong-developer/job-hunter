/**
 * 采集方案的**唯一校验实现**（SR-45）。
 *
 * 三条入口 —— GUI（HTTP `/plans`）、模型工具（`job_plan_manage`）、HTTP —— 必须共用这一份，
 * 否则"工具与界面各塞非法条件，报错不一致"是必然的：
 * 界面拦住了、模型绕过去了，用户看到的两套规则，然后**只相信严的那一套**。
 *
 * 校验做的三件事：
 *   1. **平台必须在注册表里**（SR-39：选到不存在的平台要报可读错，不能空跑）；
 *   2. **筛选键必须被某个平台的适配器声明过**（SR-41/42）——
 *      未声明的键**显式报错**，不静默丢弃；
 *   3. **取值域受声明约束**（SR-41）：声明了 `values` 的维度只接受域内的值。
 *
 * 还有一件**不报错但要说出来**的事：重复方案（SR-43）只提示、不合并。
 */
import type { PlanDto, PlanPostProcess, PlanSchedule } from '../../shared/dto.js'
import { MATURITY_LEVEL_LABEL, maturityNeedsWarning } from '../../shared/enums.js'
import type { AdapterRegistry } from '../platform/registry.js'
import type { SearchCriteria } from '../platform/types.js'
import { DomainError } from '../util/errors.js'
import { normalizePostProcess, normalizeSchedule } from '../store/repo/plans.js'

/** 会被原样交给适配器的键（不属于"筛选维度"，但适配器认识）。 */
const PAGINATION_KEYS = new Set(['page'])

/**
 * 数值型维度的键（SR-40）。它们参与校验但仍然存在 `criteria` 里，
 * 因为 `plan.criteria` 的形状是"平台无关的键值对"，加一层类型只会让 DTO 更绕。
 */
const NUMERIC_KEYS = new Set(['maxPages', 'postedWithinDays'])

/**
 * 平台特有维度的键（`SearchCriteria` 上的可选槽位）。
 *
 * **必须在这里列名**，否则 `criteriaToSearchCriteria` 会把它丢进 `extra`，
 * 适配器读 `criteria.workExp` 就永远读到空 —— 界面上选好了、实际没筛，
 * 正是 SR-42 要防的那种静默失败。
 */
const PLATFORM_KEYS = new Set([
  // 神仙外企：workExp / education / type
  'workExp',
  'education',
  'type',
  // SinoJobs：salaryRange / experience / workNature / jobType
  'salaryRange',
  'experience',
  'workNature',
  'jobType',
  // HiredChina：employment（雇佣类型）/ workMode（工作模式）
  'employment',
  'workMode',
])

export interface PlanConfigInput {
  name?: string
  platforms?: string[]
  criteria?: Record<string, string>
  schedule?: Partial<PlanSchedule>
  enabled?: boolean
  postProcess?: Partial<PlanPostProcess>
}

export interface PlanValidationContext {
  registry: AdapterRegistry
  /** 编辑已有方案时传它的 id，用于把"自己"从重复检测里排除。 */
  selfId?: number
  /** 现有方案（重复检测用）。 */
  existing?: PlanDto[]
}

export interface ValidatedPlanConfig {
  name: string
  platforms: string[]
  criteria: Record<string, string>
  schedule: PlanSchedule
  enabled: boolean
  postProcess: PlanPostProcess
  /** SR-42：被忽略的键（本版一律报错，所以只会是空数组；留着是为了将来改成"忽略"时不用改签名）。 */
  ignoredKeys: string[]
  /** SR-43：与哪些方案重复（只看，不合并）。 */
  duplicates: Array<{ planId: number; name: string; reason: string }>
  /**
   * **非致命**但用户必须知道的事（多平台相关）。
   *
   * 为什么值得一个专门的通道：它们对应的失败形态都是"平台安静地返回 0 条"，
   * 从数据里根本查不出来（0 条与 0 条长得一样）。报错太严（用户没法同时选
   * 能力不同的平台），不报又必然有人踩 —— 所以走"提示但不阻断"。
   */
  notices: string[]
}

/** 关键词/城市这类自由文本维度的值做一次温和的清洗（去首尾空白、折叠内部空白）。 */
function cleanValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * 把 `Record<string,string>` 归一成适配器认识的 `SearchCriteria`。
 *
 * 数值维度在这里转型：`'3'` → `3`。转不动就报错 —— 静默当成 0 会让
 * "页数上限设成 abc"变成"只抓 1 页"，而用户以为自己改了配置。
 */
export function criteriaToSearchCriteria(criteria: Record<string, string>): SearchCriteria {
  const out: SearchCriteria = {}
  const extra: Record<string, string> = {}
  const platform: Record<string, string> = {}
  for (const [key, raw] of Object.entries(criteria)) {
    const value = cleanValue(raw)
    if (value === '') continue
    if (key === 'keyword') {
      out.keyword = value
      continue
    }
    if (key === 'city') {
      out.city = value
      continue
    }
    if (key === 'sort') {
      out.sort = value
      continue
    }
    if (key === 'maxPages') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) out.maxPages = parsed
      continue
    }
    if (key === 'postedWithinDays') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) out.postedWithinDays = parsed
      continue
    }
    // 平台特有维度：**进 `platform` 命名空间**，而不是摊平成顶层键。
    // 摊平会让"某平台才认识的键"被另一个平台的适配器当成自由参数拼进 URL（静默语义污染）。
    if (PLATFORM_KEYS.has(key)) {
      platform[key] = value
      continue
    }
    extra[key] = value
  }
  if (Object.keys(extra).length > 0) out.extra = extra
  if (Object.keys(platform).length > 0) out.platform = platform
  return out
}

/**
 * 校验一份方案配置。**不写库**，只回答"这份配置合法吗、和谁重复"。
 *
 * @throws DomainError('INVALID_INPUT') 平台未注册 / 条件键未声明 / 取值越域
 */
export function validatePlanConfig(
  input: PlanConfigInput,
  context: PlanValidationContext,
): ValidatedPlanConfig {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name === '') throw new DomainError('INVALID_INPUT', '方案名不能为空')

  // ── SR-39：平台来自注册表，未注册的不可选 ──────────────────────────
  const platforms = [...new Set(input.platforms ?? [])]
  if (platforms.length === 0) {
    throw new DomainError('INVALID_INPUT', '方案至少要选一个平台', {
      hint: `当前已注册的平台：${context.registry.list().map((adapter) => adapter.id).join(' / ') || '（一个都没有）'}`,
    })
  }
  for (const platformId of platforms) {
    if (!context.registry.has(platformId)) {
      throw new DomainError('INVALID_INPUT', `未注册的平台：${platformId}`, {
        hint:
          `可选平台：${context.registry.list().map((adapter) => adapter.id).join(' / ') || '（一个都没有）'}。` +
          '多平台是工程量问题（每个平台一个适配器），不是配置问题。',
      })
    }
  }

  // ── SR-41/42：筛选键必须被**选中平台之一**声明过 ────────────────────
  const declared = new Map<string, { values: string[]; max?: number; label: string; hint: string }>()
  /** 至少有一个选中的平台真的在注册表里。一个都没有 → 没有声明可依据。 */
  let hasKnownPlatform = false
  for (const platformId of platforms) {
    const adapter = context.registry.get(platformId)
    if (adapter === undefined) continue
    hasKnownPlatform = true
    for (const dimension of adapter.criteriaDimensions) {
      if (declared.has(dimension.key)) continue
      declared.set(dimension.key, {
        values: dimension.values.map((item) => item.value),
        ...(dimension.max === undefined ? {} : { max: dimension.max }),
        label: dimension.label,
        hint: dimension.hint,
      })
    }
  }
  // 注册表里一个平台都没有（纯逻辑单测直接 new 服务、没有装配适配器）时，
  // **不做键校验**：没有声明可依据，报"平台不认识这个条件"只会变成误报。
  // 生产路径永远有注册表（runtime 把 registry 传进来），所以这条不会掩盖真问题。
  const registryEmpty = context.registry.list().length === 0

  const criteria: Record<string, string> = {}
  const unknown: string[] = []
  for (const [key, raw] of Object.entries(input.criteria ?? {})) {
    if (PAGINATION_KEYS.has(key)) continue
    const value = cleanValue(String(raw))
    if (value === '') continue

    const spec = declared.get(key)
    if (spec === undefined) {
      if (registryEmpty || !hasKnownPlatform) {
        // 没有声明可依据 → 原样放行（见上面的 registryEmpty 说明）
        criteria[key] = value
        continue
      }
      unknown.push(key)
      continue
    }

    if (NUMERIC_KEYS.has(key)) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new DomainError('INVALID_INPUT', `${spec.label} 需要一个正整数，收到「${value}」`, {
          hint: spec.hint,
        })
      }
      if (spec.max !== undefined && parsed > spec.max) {
        throw new DomainError('INVALID_INPUT', `${spec.label} 最大 ${String(spec.max)}，收到 ${String(parsed)}`, {
          hint: spec.hint,
        })
      }
      criteria[key] = String(parsed)
      continue
    }

    // 声明了取值域就只接受域内的值；空数组表示自由文本
    if (spec.values.length > 0 && !spec.values.includes(value)) {
      throw new DomainError('INVALID_INPUT', `${spec.label} 不接受取值「${value}」`, {
        hint: `合法取值：${spec.values.join(' / ')}。${spec.hint}`,
      })
    }
    criteria[key] = value
  }

  if (unknown.length > 0) {
    // SR-42 明确要求**显式报错**，不能静默丢掉 —— 静默丢掉的后果是
    // 用户以为筛了"薪资 20K 以上"，实际什么都没筛，而他不会发现。
    const available = [...declared.entries()].map(([key, spec]) => `${key}（${spec.label}）`).join(' / ')
    throw new DomainError('INVALID_INPUT', `这些筛选条件当前平台不认识：${unknown.join('、')}`, {
      hint: `已选平台（${platforms.join('/')}）支持的维度：${available || '（没有声明任何维度）'}`,
    })
  }

  // ── SR-43：重复方案只**提示**，不合并 ───────────────────────────────
  const duplicates: Array<{ planId: number; name: string; reason: string }> = []
  for (const other of context.existing ?? []) {
    if (context.selfId !== undefined && other.id === context.selfId) continue
    const samePlatforms =
      other.platforms.length === platforms.length &&
      [...other.platforms].sort().join(',') === [...platforms].sort().join(',')
    if (!samePlatforms) continue
    if (sameCriteria(other.criteria, criteria)) {
      duplicates.push({
        planId: other.id,
        name: other.name,
        reason: '同样的平台 + 同样的筛选条件',
      })
    }
  }

  // ── 非致命、但**必须说出来**的事（notice）──────────────────────────
  //
  // 与 `duplicates` 同一族：只提示、不阻断保存。它们针对的是一类最伤用户的
  // 情况 —— **平台安静地返回 0 条**：用户以为"今天没岗位"，实际是自己勾了
  // 那个平台不认识的**城市**、或那个平台本身就还没校准、或抓取深度被平台上限截断。
  // 这类问题从数据里查不出来（0 条和 0 条长得一样），只能在这里说。
  const notices: string[] = []
  const plannedPages = criteria['maxPages'] === undefined ? null : Number.parseInt(criteria['maxPages'], 10)
  const city = criteria['city']
  for (const platformId of platforms) {
    const adapter = context.registry.get(platformId)
    if (adapter === undefined) continue
    const name = `${adapter.displayName}（${platformId}）`

    // ① 成熟度：勾了实验性/停用平台，大概率就是白跑一趟
    if (maturityNeedsWarning(adapter.maturity.level)) {
      notices.push(
        `${name}${MATURITY_LEVEL_LABEL[adapter.maturity.level]}` +
          (adapter.maturity.notes === undefined || adapter.maturity.notes === ''
            ? ''
            : ` —— ${adapter.maturity.notes}`),
      )
    }

    // ② 「不知道抓取要不要登录」+「本机也没有登录检测」= 被登录墙挡住时
    //    它会安静地返回 0 条，而系统连"未登录"都判断不出来。
    //    注意只在 crawl 不是确定 `none` 时才提示 —— BOSS 的列表确实不需要登录。
    const crawlAuth = adapter.authRequirement.crawl
    if (adapter.auth === undefined && (crawlAuth === 'required' || crawlAuth === 'unknown')) {
      notices.push(
        `${name}抓取是否需要登录${crawlAuth === 'required' ? '是' : '尚未验证'}，` +
          '而本机还没有登录态检测 —— 未登录时可能静默抓到空结果',
      )
    }

    // ③ 抓取深度：方案级 maxPages 被平台上限截断。静态截断是**安全**的（不会打平台），
    //    但用户以为抓了 5 页，实际只抓了 1 页 —— 这件事必须说出来。
    if (plannedPages !== null && Number.isFinite(plannedPages) && plannedPages > adapter.maxPages) {
      notices.push(
        `${name}最多 ${String(adapter.maxPages)} 页，本方案设的 ${String(plannedPages)} 页对它无效` +
          `（实际只抓 ${String(adapter.maxPages)} 页）`,
      )
    }

    // ④ 城市：该平台**声明了**城市取值域，而选的城市不在里面 → 它一定返回空。
    //    声明了空取值域的（如国聘）表示"自由文本"，不在此列。
    if (city !== undefined && city !== '') {
      const dimension = adapter.criteriaDimensions.find((item) => item.key === 'city')
      const values = dimension?.values.map((item) => item.value) ?? []
      if (values.length > 0 && !values.includes(city)) {
        notices.push(
          `${name}不认识城市「${city}」—— 它会返回空结果，建议去掉这个平台或换成它支持的城市`,
        )
      }
    }
  }

  return {
    name,
    platforms,
    criteria,
    schedule: normalizeSchedule(input.schedule),
    enabled: input.enabled !== false,
    postProcess: normalizePostProcess(input.postProcess),
    ignoredKeys: [],
    duplicates,
    notices,
  }
}

/** 条件是否等价（比较前先排序键，避免键顺序造成假不等）。 */
export function sameCriteria(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a).filter((key) => a[key] !== '').sort()
  const keysB = Object.keys(b).filter((key) => b[key] !== '').sort()
  if (keysA.length !== keysB.length) return false
  return keysA.every((key, index) => key === keysB[index] && a[key] === b[key])
}

/**
 * 给界面用的一份"这个平台能筛什么"的快照（SR-41）。
 *
 * 界面据它渲染筛选器：**不支持的维度禁用而非隐藏**，并把 `hint` 显示出来
 * —— 隐藏会让用户以为功能坏了（§5.5 能力驱动的 UI）。
 */
export interface CriteriaDimensionDto {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
  max: number | null
  hint: string
  /** 当前方案是否支持它。false = 界面上禁用 + 说明原因。 */
  supported: boolean
  /** 不支持的原因。 */
  disabledReason: string | null
  /** 数值型维度（界面渲染成数字输入而不是下拉）。 */
  numeric: boolean
}

/** 所有可能出现的维度键（用于"不支持"的维度也出现在界面上并解释原因）。 */
/**
 * 所有可能出现的维度键（用于"不支持"的维度也出现在界面上并解释原因）。
 *
 * ⚠️ 这是**固定槽位表**，不是"全部维度" —— 适配器自己声明的新维度由
 * `criteriaDimensionsFor` 的 `supported.keys()` 自动并进来（见下方 `keys`）。
 * 列在这里的键会**对每个平台都出现**（不支持的显示为禁用 + 原因），
 * 所以只列"跨平台都说得通"的几个：关键词 / 城市 / 排序 / 时间 / 页数，
 * 以及神仙外企引入的工作经验 / 学历 / 职位范围。
 */
export const ALL_DIMENSION_KEYS = [
  'keyword',
  'city',
  'workExp',
  'education',
  'type',
  'sort',
  'postedWithinDays',
  'maxPages',
] as const

export function criteriaDimensionsFor(
  registry: AdapterRegistry,
  platforms: string[],
): CriteriaDimensionDto[] {
  const supported = new Map<string, { values: Array<{ value: string; label: string }>; max: number | null; label: string; hint: string }>()
  for (const platformId of platforms) {
    const adapter = registry.get(platformId)
    if (adapter === undefined) continue
    for (const dimension of adapter.criteriaDimensions) {
      if (supported.has(dimension.key)) continue
      supported.set(dimension.key, {
        values: dimension.values,
        max: dimension.max ?? null,
        label: dimension.label,
        hint: dimension.hint,
      })
    }
  }

  const keys = [...new Set([...ALL_DIMENSION_KEYS, ...supported.keys()])]
  return keys.map((key) => {
    const spec = supported.get(key)
    if (spec === undefined) {
      return {
        key,
        label: key,
        values: [],
        max: null,
        hint: '当前选中的平台没有声明这个筛选维度',
        supported: false,
        disabledReason:
          platforms.length === 0
            ? '还没有选平台'
            : `已选平台（${platforms.join('/')}）不支持这个筛选维度 —— 平台侧没有这个参数`,
        numeric: NUMERIC_KEYS.has(key),
      }
    }
    return {
      key,
      label: spec.label,
      values: spec.values,
      max: spec.max,
      hint: spec.hint,
      supported: true,
      disabledReason: null,
      numeric: NUMERIC_KEYS.has(key),
    }
  })
}
