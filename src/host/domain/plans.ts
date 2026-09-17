/**
 * 搜索方案领域服务（§4.3）。
 *
 * 方案 = 抓什么（平台 + 条件）+ 什么时候抓（`PlanSchedule`）。
 * 定时配置坏掉会**静默不跑**，所以写入前一律经 `normalizeSchedule` 收敛。
 */
import type { PlanDto } from '../../shared/dto.js'
import type { PlanRepo, PlanUpsertInput } from '../store/repo/plans.js'
import type { Store } from '../store/store.js'
import { DomainError } from '../util/errors.js'
import type { Clock } from '../util/time.js'
import { systemClock } from '../util/time.js'

/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export function defaultPlanInput(): PlanUpsertInput {
  return {
    name: '默认方案 · 深圳 Java',
    platforms: ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    enabled: true,
  }
}

export interface PlanService {
  list(): PlanDto[]
  get(id: number): PlanDto
  create(input: PlanUpsertInput): PlanDto
  update(id: number, patch: Partial<PlanUpsertInput>): PlanDto
  remove(id: number): boolean
  /** 完全没有方案时建一个默认方案；已有方案则返回 null。 */
  ensureDefault(): PlanDto | null
  repo(): PlanRepo
}

export function createPlanService(store: Store, clock: Clock = systemClock): PlanService {
  const validate = (input: PlanUpsertInput): void => {
    if (typeof input.name !== 'string' || input.name.trim() === '') {
      throw new DomainError('INVALID_INPUT', '方案名不能为空')
    }
    if (!Array.isArray(input.platforms) || input.platforms.length === 0) {
      throw new DomainError('INVALID_INPUT', '方案至少要选一个平台')
    }
  }

  const get = (id: number): PlanDto => {
    const plan = store.plan.get(id)
    if (plan === undefined) {
      throw new DomainError('NOT_FOUND', `方案不存在：${String(id)}`)
    }
    return plan
  }

  return {
    list(): PlanDto[] {
      return store.plan.list()
    },

    get,

    create(input): PlanDto {
      validate(input)
      return store.plan.create(input, clock())
    },

    update(id, patch): PlanDto {
      if (patch.name !== undefined && patch.name.trim() === '') {
        throw new DomainError('INVALID_INPUT', '方案名不能为空')
      }
      if (patch.platforms !== undefined && patch.platforms.length === 0) {
        throw new DomainError('INVALID_INPUT', '方案至少要选一个平台')
      }
      get(id) // 不存在直接 404
      return store.plan.update(id, patch, clock())
    },

    remove(id): boolean {
      return store.plan.remove(id)
    },

    ensureDefault(): PlanDto | null {
      if (store.plan.count() > 0) return null
      return store.plan.create(defaultPlanInput(), clock())
    },

    repo(): PlanRepo {
      return store.plan
    },
  }
}
