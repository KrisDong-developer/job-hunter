/**
 * 搜索方案领域服务（§4.3）。
 *
 * 方案 = 抓什么（平台 + 条件 + 抓取深度）+ 什么时候抓（`PlanSchedule`）+ 抓完做什么（后处理）。
 *
 * ## 两条不变量
 *
 * 1. **写入前一律校验** —— 定时配置坏掉会**静默不跑**，筛选条件坏掉会**静默不筛**，
 *    两种都是"用户以为自己配好了"的坑。所以这里统一走 `validatePlanConfig`（SR-45）：
 *    GUI / 模型工具 / HTTP 三条入口共用**同一份**校验，报错完全一致。
 * 2. **重复方案只提示，不合并**（SR-43）—— 合并会替用户抹掉他的两个意图。
 */
import type { PlanDto, PlanPostProcess, PlanSchedule } from '../../shared/dto.js'
import { activePlatformsOf, normalizePlatformOverrides } from '../store/repo/plans.js'
import type { PlanRepo, PlanUpsertInput } from '../store/repo/plans.js'
import type { Store } from '../store/store.js'
import type { AdapterRegistry } from '../platform/registry.js'
import { DomainError } from '../util/errors.js'
import type { Clock } from '../util/time.js'
import { systemClock } from '../util/time.js'
import {
  criteriaDimensionsFor,
  validatePlanConfig,
  type CriteriaDimensionDto,
  type PlanConfigInput,
  type ValidatedPlanConfig,
} from './plan-config.js'

/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export function defaultPlanInput(): PlanUpsertInput {
  return {
    name: '默认方案 · 深圳 Java',
    platforms: ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    enabled: true,
  }
}

/** `validate()` 的结果：多一个"和谁重复"的提示，供界面在保存前展示。 */
export interface PlanValidationResult extends ValidatedPlanConfig {
  dimensions: CriteriaDimensionDto[]
}

export interface PlanService {
  list(): PlanDto[]
  get(id: number): PlanDto
  create(input: PlanConfigInput): PlanDto
  update(id: number, patch: PlanConfigInput): PlanDto
  remove(id: number): boolean
  /** 完全没有方案时建一个默认方案；已有方案则返回 null。 */
  ensureDefault(): PlanDto | null
  /**
   * 只校验、不写库（SR-43/45）。
   *
   * 界面"保存前先问一句"靠它；模型工具与 HTTP 的写入路径内部也调它 ——
   * 所以**界面能看到的错误和工具能看到的错误是同一份**。
   */
  validate(input: PlanConfigInput, selfId?: number): PlanValidationResult
  /** SR-41：当前平台集合支持的筛选维度（界面渲染筛选器用）。 */
  dimensions(platforms: string[]): CriteriaDimensionDto[]
  /** SR-39：可选平台来自注册表。 */
  availablePlatforms(): Array<{ id: string; displayName: string }>
  repo(): PlanRepo
}

export function createPlanService(
  store: Store,
  clock: Clock = systemClock,
  registry?: AdapterRegistry,
): PlanService {
  /** 没有注册表时的空注册表 —— 校验退化到"只查名字与平台非空"。 */
  const emptyRegistry: AdapterRegistry = {
    register: () => () => undefined,
    get: () => undefined,
    list: () => [],
    has: () => true,
  }
  const adapters = registry ?? emptyRegistry

  const validate = (input: PlanConfigInput, selfId?: number): PlanValidationResult => {
    const validated = validatePlanConfig(input, {
      registry: adapters,
      ...(selfId === undefined ? {} : { selfId }),
      existing: store.plan.list(),
    })
    return {
      ...validated,
      // 维度快照按**启用的**平台算：被停用的平台不该再往界面上塞它的筛选维度。
      dimensions: criteriaDimensionsFor(adapters, activePlatformsOf(validated)),
    }
  }

  const get = (id: number): PlanDto => {
    const plan = store.plan.get(id)
    if (plan === undefined) {
      throw new DomainError('NOT_FOUND', `方案不存在：${String(id)}`)
    }
    return plan
  }

  /** 把校验结果摊成仓储的写入输入。 */
  const toUpsert = (validated: ValidatedPlanConfig): PlanUpsertInput => ({
    name: validated.name,
    platforms: validated.platforms,
    keywords: validated.keywords,
    platformOverrides: validated.platformOverrides,
    criteria: validated.criteria,
    schedule: validated.schedule,
    enabled: validated.enabled,
    postProcess: validated.postProcess,
  })

  const ensureDefault = (): PlanDto | null => {
    if (store.plan.count() > 0) return null
    return store.plan.create(toUpsert(validate(defaultPlanInput())), clock())
  }

  return {
    list(): PlanDto[] {
      return store.plan.list()
    },

    get,

    validate,

    dimensions(platforms): CriteriaDimensionDto[] {
      return criteriaDimensionsFor(adapters, platforms)
    },

    availablePlatforms(): Array<{ id: string; displayName: string }> {
      return adapters.list().map((adapter) => ({ id: adapter.id, displayName: adapter.displayName }))
    },

    create(input): PlanDto {
      return store.plan.create(toUpsert(validate(input)), clock())
    },

    update(id, patch): PlanDto {
      const current = get(id) // 不存在直接 404，先于任何校验
      // 补丁是**部分**的：缺的键沿用现值，这样"只改名字"不需要把条件一起传回来
      const platforms = patch.platforms ?? current.platforms
      // ⚠️ 覆盖项必须在**校验之前**按新的平台集合收敛一次。
      // 否则"把某个平台移出方案"会被校验的"覆盖项越界"拦住 ——
      // 而那不是用户的错：他只是移走了一个平台，覆盖项是系统自己带过来的。
      // 收敛掉"不在方案里的平台"，正是"移出即清理"这条语义的落点。
      const merged: PlanConfigInput = {
        name: patch.name ?? current.name,
        platforms,
        // 注意：GUI 全量表单会显式传空数组（清空关键词）；模型工具的**部分补丁**
        // 不带这个键 → 沿用现值。`??` 恰好表达这个语义（[] 不是 nullish）。
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
      return store.plan.update(id, toUpsert(validate(merged, id)), clock())
    },

    remove(id): boolean {
      return store.plan.remove(id)
    },

    ensureDefault,

    repo(): PlanRepo {
      return store.plan
    },
  }
}

export type { PlanPostProcess, PlanSchedule, PlanConfigInput }
