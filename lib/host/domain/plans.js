import { DomainError } from '../util/errors.js';
import { systemClock } from '../util/time.js';
import { criteriaDimensionsFor, validatePlanConfig, } from './plan-config.js';
/** 首次安装时的默认方案：够跑起来，也够用户看懂怎么配。 */
export function defaultPlanInput() {
    return {
        name: '默认方案 · 深圳 Java',
        platforms: ['51job'],
        criteria: { keyword: 'Java', city: '深圳' },
        enabled: true,
    };
}
export function createPlanService(store, clock = systemClock, registry) {
    /** 没有注册表时的空注册表 —— 校验退化到"只查名字与平台非空"。 */
    const emptyRegistry = {
        register: () => () => undefined,
        get: () => undefined,
        list: () => [],
        has: () => true,
    };
    const adapters = registry ?? emptyRegistry;
    const validate = (input, selfId) => {
        const validated = validatePlanConfig(input, {
            registry: adapters,
            ...(selfId === undefined ? {} : { selfId }),
            existing: store.plan.list(),
        });
        return { ...validated, dimensions: criteriaDimensionsFor(adapters, validated.platforms) };
    };
    const get = (id) => {
        const plan = store.plan.get(id);
        if (plan === undefined) {
            throw new DomainError('NOT_FOUND', `方案不存在：${String(id)}`);
        }
        return plan;
    };
    /** 把校验结果摊成仓储的写入输入。 */
    const toUpsert = (validated) => ({
        name: validated.name,
        platforms: validated.platforms,
        criteria: validated.criteria,
        schedule: validated.schedule,
        enabled: validated.enabled,
        postProcess: validated.postProcess,
    });
    const ensureDefault = () => {
        if (store.plan.count() > 0)
            return null;
        return store.plan.create(toUpsert(validate(defaultPlanInput())), clock());
    };
    return {
        list() {
            return store.plan.list();
        },
        get,
        validate,
        dimensions(platforms) {
            return criteriaDimensionsFor(adapters, platforms);
        },
        availablePlatforms() {
            return adapters.list().map((adapter) => ({ id: adapter.id, displayName: adapter.displayName }));
        },
        create(input) {
            return store.plan.create(toUpsert(validate(input)), clock());
        },
        update(id, patch) {
            const current = get(id); // 不存在直接 404，先于任何校验
            // 补丁是**部分**的：缺的键沿用现值，这样"只改名字"不需要把条件一起传回来
            const merged = {
                name: patch.name ?? current.name,
                platforms: patch.platforms ?? current.platforms,
                criteria: patch.criteria ?? current.criteria,
                schedule: { ...current.schedule, ...(patch.schedule ?? {}) },
                enabled: patch.enabled ?? current.enabled,
                postProcess: { ...current.postProcess, ...(patch.postProcess ?? {}) },
            };
            return store.plan.update(id, toUpsert(validate(merged, id)), clock());
        },
        remove(id) {
            return store.plan.remove(id);
        },
        ensureDefault,
        repo() {
            return store.plan;
        },
    };
}
//# sourceMappingURL=plans.js.map