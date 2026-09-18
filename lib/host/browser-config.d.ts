import type { BrowserEngine } from './platform/browser.js';
import type { Store } from './store/store.js';
export interface BrowserConfig {
    /**
     * 采集浏览器空闲多少**分钟**后自动关闭。
     * `0` = 不自动关闭（保持"一直开着直到插件卸载"的旧行为）。
     */
    idleCloseMinutes: number;
    /**
     * **每轮采集结束后就关掉采集浏览器**（用户要求：跑完那扇窗口就该消失）。
     *
     * 默认开。打开时 `idleCloseMinutes` 那一格被接管（实际时长见 `idleCloseMsOf`）——
     * 代价是"连着点两次立即采集"时第二次会多花几秒冷启动浏览器；
     * 想要"留一会儿、连着跑几次"就把它关掉，改由分钟那一格决定。
     */
    closeAfterRun: boolean;
    /**
     * 引擎偏好（D-17a）。`auto` = 优先 patchright，装不上退 playwright-core。
     */
    engine: BrowserEngine;
    /**
     * 是否注入 stealth 脚本（D-17a）。默认开；某站点被误伤时可关。
     */
    stealthInit: boolean;
}
export declare const BROWSER_IDLE_FALLBACK: BrowserConfig;
/**
 * 把任意输入收敛成合法值。
 *
 * 坏输入都要能被吸收，而不是让浏览器关不掉或关太快：
 *   * 非数字 / NaN / Infinity → 用默认值；
 *   * 负数 → 0（= 不关，"我明确不要它关"比"关得比谁都快"更接近意图）；
 *   * 超上限 → 上限。
 * 小数按四舍五入取整分钟。
 */
export declare function normalizeBrowserConfig(input: unknown): BrowserConfig;
/**
 * 实际生效的空闲关闭时长（毫秒）。`<= 0` = 不自动关闭。
 *
 * **唯一的裁决点**：启动后读一次、设置写入时再作用一次，两处都走它 ——
 * 各写一遍 `closeAfterRun ? 短 : 分钟 * 60000` 迟早会漂移，
 * 而漂移的表现是"设置里写着 10 分钟，实际 3 秒就关了"这种最难查的错。
 */
export declare function idleCloseMsOf(config: BrowserConfig): number;
export declare function readBrowserConfig(store: Store): BrowserConfig;
export declare function writeBrowserConfig(store: Store, patch: Partial<BrowserConfig>, now: string): BrowserConfig;
//# sourceMappingURL=browser-config.d.ts.map