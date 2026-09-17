import { normalizeCompanyName } from '../util/company-name.js';
import { DomainError } from '../util/errors.js';
export function createCompanyService(store) {
    return {
        ensureByName(input, now) {
            const name = typeof input.name === 'string' ? input.name.trim() : '';
            if (name === '') {
                throw new DomainError('INVALID_INPUT', '公司名不能为空');
            }
            const nameNorm = normalizeCompanyName(name);
            if (nameNorm === '') {
                throw new DomainError('INVALID_INPUT', `公司名归一化后为空：${name}`);
            }
            const result = store.company.ensure({
                name,
                nameNorm,
                industry: input.industry ?? null,
                size: input.size ?? null,
                nature: input.nature ?? null,
            }, now);
            return result.id;
        },
        get(companyId) {
            return store.company.get(companyId);
        },
        recompute(companyId, now) {
            return store.company.recomputeProfile(companyId, now);
        },
        count() {
            return store.company.count();
        },
    };
}
//# sourceMappingURL=companies.js.map