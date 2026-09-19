import { activePlatformsOf, normalizePlatformOverrides } from '../store/repo/plans.js';
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
        replace: () => undefined,
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
        return {
            ...validated,
            // 维度快照按**启用的**平台算：被停用的平台不该再往界面上塞它的筛选维度。
            dimensions: criteriaDimensionsFor(adapters, activePlatformsOf(validated)),
        };
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
        keywords: validated.keywords,
        platformOverrides: validated.platformOverrides,
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
            const platforms = patch.platforms ?? current.platforms;
            // ⚠️ 覆盖项必须在**校验之前**按新的平台集合收敛一次。
            // 否则"把某个平台移出方案"会被校验的"覆盖项越界"拦住 ——
            // 而那不是用户的错：他只是移走了一个平台，覆盖项是系统自己带过来的。
            // 收敛掉"不在方案里的平台"，正是"移出即清理"这条语义的落点。
            const merged = {
                name: patch.name ?? current.name,
                platforms,
                // 注意：GUI 全量表单会显式传空数组（清空关键词）；模型工具的**部分补丁**
                // 不带这个键 → 沿用现值。`??` 恰好表达这个语义（[] 不是 nullish）。
                keywords: patch.keywords ?? current.keywords,
                platformOverrides: normalizePlatformOverrides(patch.platformOverrides ?? current.platformOverrides, platforms),
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