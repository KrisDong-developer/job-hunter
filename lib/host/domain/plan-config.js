import { DomainError } from '../util/errors.js';
import { normalizePostProcess, normalizeSchedule } from '../store/repo/plans.js';
/** 会被原样交给适配器的键（不属于"筛选维度"，但适配器认识）。 */
const PAGINATION_KEYS = new Set(['page']);
/**
 * 数值型维度的键（SR-40）。它们参与校验但仍然存在 `criteria` 里，
 * 因为 `plan.criteria` 的形状是"平台无关的键值对"，加一层类型只会让 DTO 更绕。
 */
const NUMERIC_KEYS = new Set(['maxPages', 'postedWithinDays']);
/** 关键词/城市这类自由文本维度的值做一次温和的清洗（去首尾空白、折叠内部空白）。 */
function cleanValue(value) {
    return value.replace(/\s+/g, ' ').trim();
}
/**
 * 把 `Record<string,string>` 归一成适配器认识的 `SearchCriteria`。
 *
 * 数值维度在这里转型：`'3'` → `3`。转不动就报错 —— 静默当成 0 会让
 * "页数上限设成 abc"变成"只抓 1 页"，而用户以为自己改了配置。
 */
export function criteriaToSearchCriteria(criteria) {
    const out = {};
    const extra = {};
    for (const [key, raw] of Object.entries(criteria)) {
        const value = cleanValue(raw);
        if (value === '')
            continue;
        if (key === 'keyword') {
            out.keyword = value;
            continue;
        }
        if (key === 'city') {
            out.city = value;
            continue;
        }
        if (key === 'sort') {
            out.sort = value;
            continue;
        }
        if (key === 'maxPages') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0)
                out.maxPages = parsed;
            continue;
        }
        if (key === 'postedWithinDays') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0)
                out.postedWithinDays = parsed;
            continue;
        }
        extra[key] = value;
    }
    if (Object.keys(extra).length > 0)
        out.extra = extra;
    return out;
}
/**
 * 校验一份方案配置。**不写库**，只回答"这份配置合法吗、和谁重复"。
 *
 * @throws DomainError('INVALID_INPUT') 平台未注册 / 条件键未声明 / 取值越域
 */
export function validatePlanConfig(input, context) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name === '')
        throw new DomainError('INVALID_INPUT', '方案名不能为空');
    // ── SR-39：平台来自注册表，未注册的不可选 ──────────────────────────
    const platforms = [...new Set(input.platforms ?? [])];
    if (platforms.length === 0) {
        throw new DomainError('INVALID_INPUT', '方案至少要选一个平台', {
            hint: `当前已注册的平台：${context.registry.list().map((adapter) => adapter.id).join(' / ') || '（一个都没有）'}`,
        });
    }
    for (const platformId of platforms) {
        if (!context.registry.has(platformId)) {
            throw new DomainError('INVALID_INPUT', `未注册的平台：${platformId}`, {
                hint: `可选平台：${context.registry.list().map((adapter) => adapter.id).join(' / ') || '（一个都没有）'}。` +
                    '多平台是工程量问题（每个平台一个适配器），不是配置问题。',
            });
        }
    }
    // ── SR-41/42：筛选键必须被**选中平台之一**声明过 ────────────────────
    const declared = new Map();
    /** 至少有一个选中的平台真的在注册表里。一个都没有 → 没有声明可依据。 */
    let hasKnownPlatform = false;
    for (const platformId of platforms) {
        const adapter = context.registry.get(platformId);
        if (adapter === undefined)
            continue;
        hasKnownPlatform = true;
        for (const dimension of adapter.criteriaDimensions) {
            if (declared.has(dimension.key))
                continue;
            declared.set(dimension.key, {
                values: dimension.values.map((item) => item.value),
                ...(dimension.max === undefined ? {} : { max: dimension.max }),
                label: dimension.label,
                hint: dimension.hint,
            });
        }
    }
    // 注册表里一个平台都没有（纯逻辑单测直接 new 服务、没有装配适配器）时，
    // **不做键校验**：没有声明可依据，报"平台不认识这个条件"只会变成误报。
    // 生产路径永远有注册表（runtime 把 registry 传进来），所以这条不会掩盖真问题。
    const registryEmpty = context.registry.list().length === 0;
    const criteria = {};
    const unknown = [];
    for (const [key, raw] of Object.entries(input.criteria ?? {})) {
        if (PAGINATION_KEYS.has(key))
            continue;
        const value = cleanValue(String(raw));
        if (value === '')
            continue;
        const spec = declared.get(key);
        if (spec === undefined) {
            if (registryEmpty || !hasKnownPlatform) {
                // 没有声明可依据 → 原样放行（见上面的 registryEmpty 说明）
                criteria[key] = value;
                continue;
            }
            unknown.push(key);
            continue;
        }
        if (NUMERIC_KEYS.has(key)) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new DomainError('INVALID_INPUT', `${spec.label} 需要一个正整数，收到「${value}」`, {
                    hint: spec.hint,
                });
            }
            if (spec.max !== undefined && parsed > spec.max) {
                throw new DomainError('INVALID_INPUT', `${spec.label} 最大 ${String(spec.max)}，收到 ${String(parsed)}`, {
                    hint: spec.hint,
                });
            }
            criteria[key] = String(parsed);
            continue;
        }
        // 声明了取值域就只接受域内的值；空数组表示自由文本
        if (spec.values.length > 0 && !spec.values.includes(value)) {
            throw new DomainError('INVALID_INPUT', `${spec.label} 不接受取值「${value}」`, {
                hint: `合法取值：${spec.values.join(' / ')}。${spec.hint}`,
            });
        }
        criteria[key] = value;
    }
    if (unknown.length > 0) {
        // SR-42 明确要求**显式报错**，不能静默丢掉 —— 静默丢掉的后果是
        // 用户以为筛了"薪资 20K 以上"，实际什么都没筛，而他不会发现。
        const available = [...declared.entries()].map(([key, spec]) => `${key}（${spec.label}）`).join(' / ');
        throw new DomainError('INVALID_INPUT', `这些筛选条件当前平台不认识：${unknown.join('、')}`, {
            hint: `已选平台（${platforms.join('/')}）支持的维度：${available || '（没有声明任何维度）'}`,
        });
    }
    // ── SR-43：重复方案只**提示**，不合并 ───────────────────────────────
    const duplicates = [];
    for (const other of context.existing ?? []) {
        if (context.selfId !== undefined && other.id === context.selfId)
            continue;
        const samePlatforms = other.platforms.length === platforms.length &&
            [...other.platforms].sort().join(',') === [...platforms].sort().join(',');
        if (!samePlatforms)
            continue;
        if (sameCriteria(other.criteria, criteria)) {
            duplicates.push({
                planId: other.id,
                name: other.name,
                reason: '同样的平台 + 同样的筛选条件',
            });
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
    };
}
/** 条件是否等价（比较前先排序键，避免键顺序造成假不等）。 */
export function sameCriteria(a, b) {
    const keysA = Object.keys(a).filter((key) => a[key] !== '').sort();
    const keysB = Object.keys(b).filter((key) => b[key] !== '').sort();
    if (keysA.length !== keysB.length)
        return false;
    return keysA.every((key, index) => key === keysB[index] && a[key] === b[key]);
}
/** 所有可能出现的维度键（用于"不支持"的维度也出现在界面上并解释原因）。 */
export const ALL_DIMENSION_KEYS = ['keyword', 'city', 'sort', 'postedWithinDays', 'maxPages'];
export function criteriaDimensionsFor(registry, platforms) {
    const supported = new Map();
    for (const platformId of platforms) {
        const adapter = registry.get(platformId);
        if (adapter === undefined)
            continue;
        for (const dimension of adapter.criteriaDimensions) {
            if (supported.has(dimension.key))
                continue;
            supported.set(dimension.key, {
                values: dimension.values,
                max: dimension.max ?? null,
                label: dimension.label,
                hint: dimension.hint,
            });
        }
    }
    const keys = [...new Set([...ALL_DIMENSION_KEYS, ...supported.keys()])];
    return keys.map((key) => {
        const spec = supported.get(key);
        if (spec === undefined) {
            return {
                key,
                label: key,
                values: [],
                max: null,
                hint: '当前选中的平台没有声明这个筛选维度',
                supported: false,
                disabledReason: platforms.length === 0
                    ? '还没有选平台'
                    : `已选平台（${platforms.join('/')}）不支持这个筛选维度 —— 平台侧没有这个参数`,
                numeric: NUMERIC_KEYS.has(key),
            };
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
        };
    });
}
//# sourceMappingURL=plan-config.js.map