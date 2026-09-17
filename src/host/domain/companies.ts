/**
 * companies 领域服务（§4.3）。
 *
 * 职责边界：**归一化与实体身份判定在这里**，仓储只负责存取。
 * P1 只做到「归一化 + 精确比对 + 别名表精确命中」——
 * 第 3~5 级（包含关系 / 编辑距离 / 不确定不合并）与 `dedup_group` 一起放到 P4，
 * 因为那一步一旦误合并就不可逆（§4.10.1 铁律 1）。
 */
import type { CompanyProfileRecord, CompanyRecord } from '../store/repo/companies.js'
import type { Store } from '../store/store.js'
import { normalizeCompanyName } from '../util/company-name.js'
import { DomainError } from '../util/errors.js'

export interface EnsureCompanyInput {
  name: string
  industry?: string | null
  size?: string | null
  nature?: string | null
}

export interface CompanyService {
  /** 按公司名登记并返回实体 id；同一实体重复调用不会新建。 */
  ensureByName(input: EnsureCompanyInput, now: string): number
  get(companyId: number): CompanyRecord | undefined
  /** 重算画像（P1 只算岗位数 / 技术栈广度 / 地域跨度）。 */
  recompute(companyId: number, now: string): CompanyProfileRecord
  count(): number
}

export function createCompanyService(store: Store): CompanyService {
  return {
    ensureByName(input, now): number {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (name === '') {
        throw new DomainError('INVALID_INPUT', '公司名不能为空')
      }
      const nameNorm = normalizeCompanyName(name)
      if (nameNorm === '') {
        throw new DomainError('INVALID_INPUT', `公司名归一化后为空：${name}`)
      }
      const result = store.company.ensure(
        {
          name,
          nameNorm,
          industry: input.industry ?? null,
          size: input.size ?? null,
          nature: input.nature ?? null,
        },
        now,
      )
      return result.id
    },

    get(companyId): CompanyRecord | undefined {
      return store.company.get(companyId)
    },

    recompute(companyId, now): CompanyProfileRecord {
      return store.company.recomputeProfile(companyId, now)
    },

    count(): number {
      return store.company.count()
    },
  }
}
