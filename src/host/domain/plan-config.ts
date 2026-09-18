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
import { PLAN_KEYWORDS_MAX } from '../../shared/constants.js'
import type { PlanDto, PlanPlatformOverrideDto, PlanPostProcess, PlanSchedule } from '../../shared/dto.js'
import { MATURITY_LEVEL_LABEL, maturityNeedsWarning } from '../../shared/enums.js'
import { canonicalCityOf, citySupportOf, orderCities, type CitySupport } from '../platform/cities.js'
import type { AdapterRegistry } from '../platform/registry.js'
import type { SearchCriteria } from '../platform/types.js'
import { DomainError } from '../util/errors.js'
import {
  keywordsOfPlan,
  normalizeKeywords,
  normalizePlatformOverrides,
  normalizePostProcess,
  normalizeSchedule,
  platformOverrideOf,
} from '../store/repo/plans.js'

/** 会被原样交给适配器的键（不属于"筛选维度"，但适配器认识）。 */
const PAGINATION_KEYS = new Set(['page'])

/**
 * 数值型维度的键（SR-40）。它们参与校验但仍然存在 `criteria` 里，
 * 因为 `plan.criteria` 的形状是"平台无关的键值对"，加一层类型只会让 DTO 更绕。
 */
const NUMERIC_KEYS = new Set(['maxPages', 'postedWithinDays', 'scrollRounds'])

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
  // BOSS 直聘：scrollRounds（滚动加载轮数 —— 该站点没有可寻址的页码翻页）
  'scrollRounds',
])

export interface PlanConfigInput {
  name?: string
  platforms?: string[]
  /**
   * 多关键词（逐个采集，方案级）。非空时 `criteria.keyword` 被忽略并从结果里剔除 ——
   * **单一事实源**：两处都写只会让"到底按哪个跑"变成悬案。
   */
  keywords?: string[]
  /** 每平台的覆盖项（稀疏）。 */
  platformOverrides?: Record<string, Partial<PlanPlatformOverrideDto>>
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
  /** 收敛后的多关键词（trim/去重；空 = 老形态，按 criteria.keyword 跑一趟）。 */
  keywords: string[]
  /** 收敛后的每平台覆盖项（稀疏：等于默认的条目不在里面）。 */
  platformOverrides: Record<string, PlanPlatformOverrideDto>
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

  // ── 多关键词（逐个采集）：收敛 + 上限 + 单一事实源 ──────────────────
  const keywords = normalizeKeywords(input.keywords)
  if (keywords.length > PLAN_KEYWORDS_MAX) {
    throw new DomainError(
      'INVALID_INPUT',
      `关键词最多 ${String(PLAN_KEYWORDS_MAX)} 个，收到 ${String(keywords.length)} 个`,
      {
        hint:
          `每个关键词一轮里各抓一次，N 个关键词 = N 次站点访问（计入每日额度）。` +
          '需要更多就拆成两个方案 —— 各自的额度与时段独立。',
      },
    )
  }
  // 非空时剔除 criteria.keyword：keyword 的唯一事实源是这里。
  // "两处都写"不报错而以 keywords 为准 —— 剔除动作本身会体现在保存结果里。
  const criteriaInput: Record<string, string> = { ...(input.criteria ?? {}) }
  if (keywords.length > 0) delete criteriaInput['keyword']

  // ── 每平台覆盖项（批次 3）────────────────────────────────────────────
  const overrides = normalizePlatformOverrides(input.platformOverrides, platforms)
  for (const id of Object.keys(input.platformOverrides ?? {})) {
    if (!platforms.includes(id)) {
      throw new DomainError('INVALID_INPUT', `覆盖项里的平台「${id}」不在这个方案的平台里`, {
        hint: `方案的平台是：${platforms.join(' / ')}。覆盖项只能针对已经在方案里的平台 —— 否则它会在某天被重新加回方案时突然生效。`,
      })
    }
  }
  if (!platforms.some((id) => platformOverrideOf({ platformOverrides: overrides }, id).enabled)) {
    throw new DomainError('INVALID_INPUT', '这个方案的所有平台都被停用了，它永远不会抓任何东西', {
      hint: '至少留一个启用的平台。如果只是不想抓某个平台，把它从方案的平台列表里移除也可以。',
    })
  }
  // 每平台的页数上限按**它自己的**适配器上限校验。
  // 方案级校验只看"并集里的第一个平台"的声明，于是"方案设 5 页"在 waiqi（1 页）上
  // 会被静默截断成 1 页，而用户以为自己抓了 5 页 —— 这类静默必须变成显式报错。
  for (const [id, override] of Object.entries(overrides)) {
    if (override.maxPages === null) continue
    const adapter = context.registry.get(id)
    if (adapter === undefined) continue
    if (override.maxPages > adapter.maxPages) {
      throw new DomainError(
        'INVALID_INPUT',
        `${adapter.displayName}（${id}）最多 ${String(adapter.maxPages)} 页，收到 ${String(override.maxPages)}`,
        {
          hint: `把「${id}」的页数上限改成 ${String(adapter.maxPages)} 或更小，或者留空使用方案级页数。`,
        },
      )
    }
  }

  // ── SR-41/42：筛选键必须被**选中平台之一**声明过 ────────────────────
  //
  // 取值域是**并集**，外加一个"有没有平台把它当自由文本"的开关（批次 3）。
  // 多平台下"这个取值合不合法"只能按**有没有平台能用**来判：
  // 只按**第一个**声明该维度的平台判，会让 51job + zhipin 的组合选不到（也存不进）
  // 「东莞」—— 一个 zhipin 明明支持的取值。取值的最终解释权在**每个平台自己**手里，
  // "部分平台不接受"由下面的 notice ④ 说清楚，不是硬拒。
  const declared = new Map<
    string,
    { values: Set<string>; open: boolean; max?: number; label: string; hint: string }
  >()
  /** 至少有一个选中的平台真的在注册表里。一个都没有 → 没有声明可依据。 */
  let hasKnownPlatform = false
  for (const platformId of platforms) {
    const adapter = context.registry.get(platformId)
    if (adapter === undefined) continue
    hasKnownPlatform = true
    for (const dimension of adapter.criteriaDimensions) {
      // `closed` 缺省 = values 非空（历史行为）。空表 + `closed: true` 是"一个都别给"
      // （guopin/hiredchina），与"自由文本"（indeed/lagou）在数据上一样，语义相反。
      const closed = dimension.closed ?? dimension.values.length > 0
      const existing = declared.get(dimension.key)
      if (existing === undefined) {
        declared.set(dimension.key, {
          values: new Set(dimension.values.map((item) => item.value)),
          open: !closed,
          ...(dimension.max === undefined ? {} : { max: dimension.max }),
          label: dimension.label,
          hint: dimension.hint,
        })
        continue
      }
      for (const item of dimension.values) existing.values.add(item.value)
      if (!closed) existing.open = true
    }
  }
  // 注册表里一个平台都没有（纯逻辑单测直接 new 服务、没有装配适配器）时，
  // **不做键校验**：没有声明可依据，报"平台不认识这个条件"只会变成误报。
  // 生产路径永远有注册表（runtime 把 registry 传进来），所以这条不会掩盖真问题。
  const registryEmpty = context.registry.list().length === 0

  const criteria: Record<string, string> = {}
  const unknown: string[] = []
  /** 被目录归一过的取值（`深圳市` → `深圳`）—— 要如实告诉用户，不能悄悄改写。 */
  const normalized: string[] = []
  for (const [key, raw] of Object.entries(criteriaInput)) {
    if (PAGINATION_KEYS.has(key)) continue
    const inputValue = cleanValue(String(raw))
    if (inputValue === '') continue

    const spec = declared.get(key)
    if (spec === undefined) {
      if (registryEmpty || !hasKnownPlatform) {
        // 没有声明可依据 → 原样放行（见上面的 registryEmpty 说明）
        criteria[key] = inputValue
        continue
      }
      unknown.push(key)
      continue
    }

    if (NUMERIC_KEYS.has(key)) {
      const parsed = Number.parseInt(inputValue, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new DomainError('INVALID_INPUT', `${spec.label} 需要一个正整数，收到「${inputValue}」`, {
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

    /**
     * 城市写法先按目录归一（批次 3）。
     *
     * 「深圳市」是**最常见的一种写法**，而所有平台码表的键都是「深圳」——
     * 直接硬拒会让用户对着一个 60 项的城市清单发懵（他的城市明明在里面）。
     * 所以：只有"原样不行、规范名可用"时才换，并且**把改写说出来**（进 notices）。
     * 反过来（原样可用）绝不改写 —— 把用户写对的东西改掉是另一种意外。
     */
    let value = inputValue
    if (key === 'city' && !spec.open && !spec.values.has(value)) {
      const canonical = canonicalCityOf(value)
      if (canonical !== null && spec.values.has(canonical)) {
        value = canonical
        normalized.push(`城市「${inputValue}」已按城市目录归一为「${canonical}」`)
      }
    }

    // 取值域：**至少有一个已选平台接受**就放行（其余由 notice ④ 说清楚）。
    //
    // 一个都不接受时硬拒 —— 这种配置一定跑不出结果，而"存得下但每次都失败"
    // 是最难查的一类问题（用户会以为平台坏了）。提示里把"可选的取值"与
    // "为什么一个都不接受"一起给出来，否则用户只能一个个试。
    if (!spec.open && !spec.values.has(value)) {
      const list = [...spec.values]
      const shown = list.slice(0, 40).join(' / ')
      throw new DomainError('INVALID_INPUT', `${spec.label} 不接受取值「${inputValue}」`, {
        hint:
          list.length === 0
            ? `已选平台（${platforms.join('/')}）都没有${spec.label}的取值表 —— 带上它一定会失败：` +
              `去掉这个条件，或换一个支持它的平台。${spec.hint}`
            : `已选平台里没有一个接受它。可选取值：${shown}${list.length > 40 ? ` …等 ${String(list.length)} 个` : ''}。${spec.hint}`,
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
  //
  // 比较口径是**生效关键词**（`keywordsOfPlan` 把两种老形态 —— criteria.keyword
  // 与 keywords —— 都翻成等价列表），条件比较则两侧都剥掉 keyword ——
  // 否则"老方案 keyword=Java"与"新方案 keywords=[Java]"在字典层面永不相等，
  // 而它们执行起来一模一样，不提示才是漏报。
  const stripKeyword = (source: Record<string, string>): Record<string, string> => {
    const { keyword: _dropped, ...rest } = source
    return rest
  }
  const effectiveKeywords = [...keywordsOfPlan({ keywords, criteria: criteriaInput })].sort().join('\u0000')
  const duplicates: Array<{ planId: number; name: string; reason: string }> = []
  for (const other of context.existing ?? []) {
    if (context.selfId !== undefined && other.id === context.selfId) continue
    const samePlatforms =
      other.platforms.length === platforms.length &&
      [...other.platforms].sort().join(',') === [...platforms].sort().join(',')
    if (!samePlatforms) continue
    const sameKeywords =
      [...keywordsOfPlan(other)].sort().join('\u0000') === effectiveKeywords
    if (sameCriteria(stripKeyword(other.criteria), stripKeyword(criteria)) && sameKeywords) {
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
  const notices: string[] = [...normalized]
  const plannedPages = criteria['maxPages'] === undefined ? null : Number.parseInt(criteria['maxPages'], 10)
  const city = criteria['city']
  // ⚠️ 只对**启用的**平台提示 —— 用户刚把某个平台关掉，还继续提示它就是纯噪音。
  const enabledPlatforms = platforms.filter(
    (id) => platformOverrideOf({ platformOverrides: overrides }, id).enabled,
  )
  /**
   * 每个已选平台对**这个城市**的支持度（批次 3）。
   *
   * 先算一遍是为了让提示能给出下一步：只说"这个平台不认识深圳"，
   * 用户还得自己一个个平台去试；说"支持它的是 zhipin、zhaopin"就能直接改。
   */
  const citySupport = new Map<string, CitySupport>()
  if (city !== undefined && city !== '') {
    for (const platformId of enabledPlatforms) {
      const adapter = context.registry.get(platformId)
      if (adapter !== undefined) citySupport.set(platformId, citySupportOf(adapter, city))
    }
  }

  for (const platformId of enabledPlatforms) {
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
        `${name}抓取${crawlAuth === 'required' ? '需要登录' : '是否需要登录尚未验证'}，` +
          '而本机还没有登录态检测 —— 未登录时可能静默抓到空结果',
      )
    }

    // ③ 抓取深度：方案级 maxPages 被平台上限截断。静态截断是**安全**的（不会打平台），
    //    但用户以为抓了 5 页、实际只抓 1 页 —— 这件事必须说出来，并给出修法
    //    （现在可以给单个平台单独设页数上限了）。
    if (plannedPages !== null && Number.isFinite(plannedPages) && plannedPages > adapter.maxPages) {
      notices.push(
        `${name}最多 ${String(adapter.maxPages)} 页，本方案设的 ${String(plannedPages)} 页对它无效` +
          `（它只抓 ${String(adapter.maxPages)} 页）—— 给这个平台单独设页数上限，` +
          `或把方案页数降到 ${String(adapter.maxPages)}`,
      )
    }

    // ④ 城市：这个平台**会拒绝**这个城市（取值域封闭、且表里没有）→ 它一定失败或返回空。
    //
    // 判据是 `citySupportOf`，不是"values 空不空"（批次 3 修正）：
    //   * 空表 + `closed: true`（guopin / hiredchina）→ **要提示**。以前被当成"自由文本"
    //     跳过，于是用户在这里看不到任何警告，只在抓取那一步看到那个平台整轮失败；
    //   * 非空表 + `closed: false`（lagou）→ **不提示**。它原样收中文城市名，
    //     以前会因为"不在建议列表里"报一条**假的**警告。
    const support = citySupport.get(platformId)
    if (support === 'unsupported' && city !== undefined) {
      // 走到这里说明**有别的平台能用**这个城市（一个都不行的话上面已经硬拒了）——
      // 所以这里只讲"它会怎样 + 换成谁"，不再重复"换个城市"这类硬拒时才给的建议
      const helpers = [...citySupport.entries()]
        .filter(([id, value]) => id !== platformId && value !== 'unsupported')
        .map(([id]) => id)
      notices.push(
        `${name}不认识城市「${city}」—— 定时轮到它时会被自动跳过（city_unsupported），不会浪费一次抓取。` +
          (helpers.length === 0
            ? '已选平台里没有支持这个城市的：换一个城市，或去掉这个平台'
            : `支持它的是：${helpers.join('、')}（给这个平台单独换城市暂不支持 —— 条件是全方案共享的）`),
      )
    }
  }

  return {
    name,
    platforms,
    keywords,
    platformOverrides: overrides,
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
  /** 每个平台对"城市"这一维的处理方式（并集的提示要写清楚"谁支持"）。 */
  const cityNotes: string[] = []
  for (const platformId of platforms) {
    const adapter = registry.get(platformId)
    if (adapter === undefined) continue
    for (const dimension of adapter.criteriaDimensions) {
      if (dimension.key === 'city') {
        const closed = dimension.closed ?? dimension.values.length > 0
        cityNotes.push(
          closed
            ? dimension.values.length === 0
              ? `${platformId} 没有城市码（带城市会被拒）`
              : `${platformId} ${String(dimension.values.length)} 城`
            : `${platformId} 自由文本`,
        )
      }
      const existing = supported.get(dimension.key)
      if (existing === undefined) {
        supported.set(dimension.key, {
          values: dimension.values,
          max: dimension.max ?? null,
          label: dimension.label,
          hint: dimension.hint,
        })
        continue
      }
      // **城市取并集，其它维度刻意不并。**
      //
      // 城市是一个**跨平台共享的人的概念**："深圳"在哪个平台都是深圳。取并集
      // 才让多平台下"选得到 zhipin 有、51job 没有的城市"（以前只给**第一个**
      // 声明 city 的平台那张表，用户根本看不到别的平台支持什么）。
      //
      // 排序/时间/平台特有维度则**不能并**：它们的取值是各平台自己的**不透明编码**
      // （51job 的 sortType 2 与别家的 2 不是一回事），并起来会拼出一个错误的 URL，
      // 而且错得无声无息。
      if (dimension.key !== 'city') continue
      const merged = orderCities([
        ...existing.values.map((item) => item.value),
        ...dimension.values.map((item) => item.value),
      ])
      existing.values = merged.map((value) => ({ value, label: value }))
    }
  }

  const citySpec = supported.get('city')
  if (citySpec !== undefined) {
    // 并集的含义必须写出来：用户看着几十个城市，得知道**不是每个平台都吃**这些
    // （选了不受支持的组合，保存前的提示会说清是哪个平台）。
    // ⚠️ 这段文字进的是字段旁的 `?` 悬浮提示（`title`/`aria-label`），**不是 markdown** ——
    // 写 `**粗体**` 只会让用户看到一堆星号。
    citySpec.hint =
      `城市取值域是已选平台的并集（${String(citySpec.values.length)} 个）。` +
      `${cityNotes.join(' · ')}。选中某个平台不支持的城市时，保存前会提示 —— 只提示，仍然可以保存。`
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
