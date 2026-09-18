/**
 * 采集运行期配置（"单轮预算"）。与 `browser-config.ts` 同一模式：
 * 资源/节奏设置**不是**安全闸门，不进 `GuardConfig`（键模型动不得），
 * 单独一个键 + 读写器，走 setting 表的 `scope='global'`。
 *
 * 刻意**不进** `MODEL_EDITABLE_KEYS`：预算直接决定一轮对站点的访问量，
 * 让模型自己调高它等于让被监管方掌握监管参数 —— 浏览器空闲关闭是纯资源
 * 设置所以放行了，这条不一样。
 */
import { CRAWL_ROUND_BUDGET_DEFAULT_MIN, CRAWL_ROUND_BUDGET_KEY, CRAWL_ROUND_BUDGET_MAX_MIN, CRAWL_ROUND_BUDGET_MIN_MIN, } from '../shared/constants.js';
export const CRAWL_CONFIG_FALLBACK = {
    roundBudgetMinutes: CRAWL_ROUND_BUDGET_DEFAULT_MIN,
};
/** 任意输入收敛成合法值（坏输入退默认；越界收到边界；小数四舍五入）。 */
export function normalizeCrawlConfig(input) {
    if (input === null || typeof input !== 'object')
        return { ...CRAWL_CONFIG_FALLBACK };
    const raw = input.roundBudgetMinutes;
    if (typeof raw !== 'number' || !Number.isFinite(raw))
        return { ...CRAWL_CONFIG_FALLBACK };
    return {
        roundBudgetMinutes: Math.min(CRAWL_ROUND_BUDGET_MAX_MIN, Math.max(CRAWL_ROUND_BUDGET_MIN_MIN, Math.round(raw))),
    };
}
export function readCrawlConfig(store) {
    return normalizeCrawlConfig(store.setting.get(CRAWL_ROUND_BUDGET_KEY, 'global', ''));
}
export function writeCrawlConfig(store, patch, now) {
    const current = readCrawlConfig(store);
    const next = normalizeCrawlConfig({ ...current, ...patch });
    store.setting.set(CRAWL_ROUND_BUDGET_KEY, 'global', '', next, now);
    return next;
}
//# sourceMappingURL=crawl-config.js.map