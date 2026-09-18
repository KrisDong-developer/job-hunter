/**
 * 浏览器运行期配置（"空闲自关" + D-17a 的引擎/stealth 开关）。
 *
 * 为什么不塞进 `guard/rules.ts` 的 `GuardConfig`：那一层是**安全闸门**
 * （额度、冷却、审批开关），这些键模型一律不能改（`MODEL_FORBIDDEN_KEYS`）。
 * "浏览器空闲多久关掉"是**资源与体验**设置，"用哪个引擎/要不要 stealth 注入"
 * 是**环境一致性**设置（D-17a）—— 都不是闸门，
 * 混进 GuardConfig 会让"模型能不能改"这件事变得含糊。
 *
 * 也没有复用它自己的 `ai` 通道：那是模型用途开关，同样不是一类东西。
 * 所以单独一个键 + 单独一个读写器，走 setting 表的 `scope='global'`。
 */
import { BROWSER_CLOSE_AFTER_RUN_MS, BROWSER_IDLE_DEFAULT_MIN, BROWSER_IDLE_KEY, BROWSER_IDLE_MAX_MIN, BROWSER_IDLE_MIN_MIN, } from '../shared/constants.js';
export const BROWSER_IDLE_FALLBACK = {
    idleCloseMinutes: BROWSER_IDLE_DEFAULT_MIN,
    closeAfterRun: true,
    engine: 'auto',
    stealthInit: true,
};
const ENGINES = ['auto', 'patchright', 'playwright-core'];
/**
 * 把任意输入收敛成合法值。
 *
 * 坏输入都要能被吸收，而不是让浏览器关不掉或关太快：
 *   * 非数字 / NaN / Infinity → 用默认值；
 *   * 负数 → 0（= 不关，"我明确不要它关"比"关得比谁都快"更接近意图）；
 *   * 超上限 → 上限。
 * 小数按四舍五入取整分钟。
 */
export function normalizeBrowserConfig(input) {
    const raw = input;
    const fallback = { ...BROWSER_IDLE_FALLBACK };
    if (raw === null || typeof raw !== 'object')
        return fallback;
    const minutesRaw = raw.idleCloseMinutes;
    let idleCloseMinutes = fallback.idleCloseMinutes;
    if (typeof minutesRaw === 'number' && Number.isFinite(minutesRaw)) {
        idleCloseMinutes = Math.min(BROWSER_IDLE_MAX_MIN, Math.max(BROWSER_IDLE_MIN_MIN, Math.round(minutesRaw)));
    }
    // 老版本存下来的 JSON 里没有这个键 → 用默认值（默认是开，所以升级后行为立即符合预期）。
    const closeAfterRun = typeof raw.closeAfterRun === 'boolean' ? raw.closeAfterRun : fallback.closeAfterRun;
    const engine = typeof raw.engine === 'string' && ENGINES.includes(raw.engine)
        ? raw.engine
        : fallback.engine;
    const stealthInit = typeof raw.stealthInit === 'boolean' ? raw.stealthInit : fallback.stealthInit;
    return { idleCloseMinutes, closeAfterRun, engine, stealthInit };
}
/**
 * 实际生效的空闲关闭时长（毫秒）。`<= 0` = 不自动关闭。
 *
 * **唯一的裁决点**：启动后读一次、设置写入时再作用一次，两处都走它 ——
 * 各写一遍 `closeAfterRun ? 短 : 分钟 * 60000` 迟早会漂移，
 * 而漂移的表现是"设置里写着 10 分钟，实际 3 秒就关了"这种最难查的错。
 */
export function idleCloseMsOf(config) {
    // 开关打开时由它接管：短时长**优先**，分钟那一格不再起作用（设置页里会说明并置灰）。
    if (config.closeAfterRun)
        return BROWSER_CLOSE_AFTER_RUN_MS;
    return config.idleCloseMinutes * 60_000;
}
export function readBrowserConfig(store) {
    return normalizeBrowserConfig(store.setting.get(BROWSER_IDLE_KEY, 'global', ''));
}
export function writeBrowserConfig(store, patch, now) {
    const current = readBrowserConfig(store);
    const next = normalizeBrowserConfig({ ...current, ...patch });
    store.setting.set(BROWSER_IDLE_KEY, 'global', '', next, now);
    return next;
}
//# sourceMappingURL=browser-config.js.map