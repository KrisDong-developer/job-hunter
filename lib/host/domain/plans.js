import { DomainError } from '../util/errors.js';
import { systemClock } from '../util/time.js';
/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export function defaultPlanInput() {
    return {
        name: '默认方案 · 深圳 Java',
        platforms: ['51job'],
        criteria: { keyword: 'Java', city: '深圳' },
        enabled: true,
    };
}
export function createPlanService(store, clock = systemClock) {
    const validate = (input) => {
        if (typeof input.name !== 'string' || input.name.trim() === '') {
            throw new DomainError('INVALID_INPUT', '方案名不能为空');
        }
        if (!Array.isArray(input.platforms) || input.platforms.length === 0) {
            throw new DomainError('INVALID_INPUT', '方案至少要选一个平台');
        }
    };
    const get = (id) => {
        const plan = store.plan.get(id);
        if (plan === undefined) {
            throw new DomainError('NOT_FOUND', `方案不存在：${String(id)}`);
        }
        return plan;
    };
    return {
        list() {
            return store.plan.list();
        },
        get,
        create(input) {
            validate(input);
            return store.plan.create(input, clock());
        },
        update(id, patch) {
            if (patch.name !== undefined && patch.name.trim() === '') {
                throw new DomainError('INVALID_INPUT', '方案名不能为空');
            }
            if (patch.platforms !== undefined && patch.platforms.length === 0) {
                throw new DomainError('INVALID_INPUT', '方案至少要选一个平台');
            }
            get(id); // 不存在直接 404
            return store.plan.update(id, patch, clock());
        },
        remove(id) {
            return store.plan.remove(id);
        },
        ensureDefault() {
            if (store.plan.count() > 0)
                return null;
            return store.plan.create(defaultPlanInput(), clock());
        },
        repo() {
            return store.plan;
        },
    };
}
//# sourceMappingURL=plans.js.map