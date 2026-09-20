import { JOB_FLAG_TYPES, JOB_NEW_WINDOWS, JOB_ORDER_VALUES, JOB_STATES, } from '../../shared/contract/enums/job.js';
import { MAX_SAVED_JOB_VIEWS, MAX_SAVED_JOB_VIEW_ITEMS, MAX_SAVED_JOB_VIEW_NAME, } from '../../shared/config/limits.js';
import { DomainError } from '../util/errors.js';
/** `setting` 表里的键与作用域（全局偏好，与平台/方案无关）。 */
export const JOB_VIEWS_KEY = 'saved-job-views';
export const JOB_VIEWS_SCOPE = 'global';
const MAX_TEXT = 100;
const MAX_ITEM_TEXT = 40;
/** `''` 或若干位数字（与界面上那两个"只留数字"的输入框对齐）。 */
const DIGITS = /^\d{1,7}$/;
const SCORE_DIGITS = /^\d{1,3}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
function asStringArray(value, field, limit) {
    if (!Array.isArray(value))
        return `${field} 必须是数组`;
    if (value.length > limit)
        return `${field} 最多 ${String(limit)} 项`;
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string')
            return `${field} 的每一项都必须是字符串`;
        const text = item.trim();
        if (text === '')
            continue;
        if (text.length > MAX_ITEM_TEXT)
            return `${field} 的取值过长（最多 ${String(MAX_ITEM_TEXT)} 字）`;
        if (!out.includes(text))
            out.push(text);
    }
    return out;
}
/**
 * 把一份来历不明的 JSON 规范成一条视图；不合法时给出**可读原因**。
 *
 * 注意"丢什么"与"报什么"的分工：多选项里不认识的取值（例如某个标注类型被下线）
 * 一律**丢掉不报错** —— 它与"整条视图不可用"不是一回事；
 * 而枚举字段（排序键 / 时间窗 / 岗位状态）不合法则整条判为无效。
 */
function normalizeOne(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return { ok: false, reason: '每一项都必须是对象' };
    const record = raw;
    const id = typeof record['id'] === 'string' ? record['id'] : '';
    if (!ID_PATTERN.test(id))
        return { ok: false, reason: 'id 必须是 1–64 位的字母/数字/下划线/连字符' };
    const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
    if (name === '')
        return { ok: false, reason: '名字不能为空' };
    if (name.length > MAX_SAVED_JOB_VIEW_NAME) {
        return { ok: false, reason: `名字最多 ${String(MAX_SAVED_JOB_VIEW_NAME)} 字` };
    }
    const filtersRaw = record['filters'];
    if (filtersRaw === null || typeof filtersRaw !== 'object' || Array.isArray(filtersRaw)) {
        return { ok: false, reason: 'filters 必须是对象' };
    }
    const f = filtersRaw;
    const q = typeof f['q'] === 'string' ? f['q'].trim().slice(0, MAX_TEXT) : '';
    const state = typeof f['state'] === 'string' ? f['state'] : '';
    if (state !== '' && !JOB_STATES.includes(state)) {
        return { ok: false, reason: `不认识的岗位状态：${state}` };
    }
    const orderBy = typeof f['orderBy'] === 'string' ? f['orderBy'] : '';
    if (!JOB_ORDER_VALUES.includes(orderBy)) {
        return { ok: false, reason: `不认识的排序字段：${orderBy}` };
    }
    const newWindow = typeof f['newWindow'] === 'string' ? f['newWindow'] : '';
    if (newWindow !== '' && !JOB_NEW_WINDOWS.some((item) => item.value === newWindow)) {
        return { ok: false, reason: `不认识的时间窗：${newWindow}` };
    }
    const minSalary = typeof f['minSalary'] === 'string' ? f['minSalary'] : '';
    if (minSalary !== '' && !DIGITS.test(minSalary))
        return { ok: false, reason: '最低月薪必须是数字' };
    const minScore = typeof f['minScore'] === 'string' ? f['minScore'] : '';
    if (minScore !== '') {
        if (!SCORE_DIGITS.test(minScore) || Number(minScore) > 100) {
            return { ok: false, reason: '最低分必须是 0–100 的整数' };
        }
    }
    const cities = asStringArray(f['cities'], '城市', MAX_SAVED_JOB_VIEW_ITEMS);
    if (typeof cities === 'string')
        return { ok: false, reason: cities };
    const expBuckets = asStringArray(f['expBuckets'], '经验', MAX_SAVED_JOB_VIEW_ITEMS);
    if (typeof expBuckets === 'string')
        return { ok: false, reason: expBuckets };
    const eduReqs = asStringArray(f['eduReqs'], '学历', MAX_SAVED_JOB_VIEW_ITEMS);
    if (typeof eduReqs === 'string')
        return { ok: false, reason: eduReqs };
    // 标注类型：只保留当前认识的（下线的类型静默丢弃 —— 它不影响这条视图还能不能用）
    const excludeFlagsRaw = Array.isArray(f['excludeFlags']) ? f['excludeFlags'] : [];
    const excludeFlags = excludeFlagsRaw.filter((item) => typeof item === 'string' && JOB_FLAG_TYPES.includes(item));
    const filters = {
        q,
        cities,
        expBuckets,
        eduReqs,
        state,
        minSalary,
        minScore,
        excludeFlags,
        // 三个布尔量的缺省值：与界面 `EMPTY_FILTERS` / `DEFAULT_FILTERS` 保持一致
        // （尤其 `excludeBlacklisted` 默认 true —— 老视图没有这个字段时按"排除"处理）
        excludeBlacklisted: f['excludeBlacklisted'] !== false,
        groupDuplicates: f['groupDuplicates'] === true,
        newWindow,
        orderBy: orderBy,
        descending: f['descending'] !== false,
    };
    return { ok: true, view: { id, name, filters } };
}
/** 读取（宽容）：坏条目丢弃、超限截断。 */
export function readJobViews(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw.slice(0, MAX_SAVED_JOB_VIEWS)) {
        const normalized = normalizeOne(item);
        if (normalized.ok)
            out.push(normalized.view);
    }
    return out;
}
/** 写入（严格）：第一处不合法就报错，并指名字段。 */
export function assertJobViews(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new DomainError('INVALID_INPUT', '请求体必须是一个 JSON 对象');
    }
    const list = raw['views'];
    if (!Array.isArray(list)) {
        throw new DomainError('INVALID_INPUT', 'views 必须是数组', { hint: '要清空就传空数组。' });
    }
    if (list.length > MAX_SAVED_JOB_VIEWS) {
        throw new DomainError('INVALID_INPUT', `最多保存 ${String(MAX_SAVED_JOB_VIEWS)} 个视图`, {
            hint: '先删掉几个再保存。',
        });
    }
    const views = [];
    const seen = new Set();
    for (const [index, item] of list.entries()) {
        const normalized = normalizeOne(item);
        if (!normalized.ok) {
            throw new DomainError('INVALID_INPUT', `第 ${String(index + 1)} 个视图不合法：${normalized.reason}`);
        }
        if (seen.has(normalized.view.id)) {
            throw new DomainError('INVALID_INPUT', `第 ${String(index + 1)} 个视图的 id 与前面重复`);
        }
        seen.add(normalized.view.id);
        views.push(normalized.view);
    }
    return views;
}
/** 从 `setting` 读；坏内容不会抛错。 */
export function jobViewsOf(store) {
    return { views: readJobViews(store.setting.get(JOB_VIEWS_KEY, JOB_VIEWS_SCOPE, '')), max: MAX_SAVED_JOB_VIEWS };
}
/** 整体覆盖写到 `setting`（幂等）；返回落库后的样子。 */
export function saveJobViews(store, raw, now) {
    const views = assertJobViews(raw);
    store.setting.set(JOB_VIEWS_KEY, JOB_VIEWS_SCOPE, '', views, now);
    return { views, max: MAX_SAVED_JOB_VIEWS };
}
//# sourceMappingURL=job-views.js.map