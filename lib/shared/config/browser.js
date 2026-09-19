/**
 * 采集浏览器的空闲自关与跑完即关。
 */
/**
 * browser 相关常量（host 与 client 共享）。只放标量，不放运行时对象（§4.3）。
 */
// 浏览器空闲自关（NFR-7 / C12）
/**
 * 设置表里"浏览器空闲多少分钟后关闭"的键（`scope='global'`、`scope_ref=''`）。
 * 放在 shared：界面要显示它、HTTP 路由要校验它、宿主半要读它。
 */
export const BROWSER_IDLE_KEY = 'browserIdleCloseMinutes';
/**
 * 默认空闲关闭时间（分钟）。
 *
 * 为什么是 10 分钟而不是 PDF 渲染器那样的 90 秒：抓取浏览器是 headful 的，
 * 启动要几秒、还要复用登录态；连续补跑 / 手动连点两次采集很常见，
 * 90 秒会让第二次采集每次都重新冷启动。10 分钟既盖住"连着跑几次"，
 * 又不至于让一个 Chromium 整晚挂在内存里（NFR-7：单轮资源可控）。
 */
export const BROWSER_IDLE_DEFAULT_MIN = 10;
/** 允许范围：0 = 不自动关（保持旧行为）；上限 240 分钟。 */
export const BROWSER_IDLE_MIN_MIN = 0;
export const BROWSER_IDLE_MAX_MIN = 240;
/**
 * 「每轮采集结束后就关」时实际用的空闲时长（毫秒）。
 *
 * 为什么不直接"跑完立刻关"：`release()` 是在**互斥锁还握着**的时候被调用的，
 * 而"正在采集"恰恰是必须拦住的场景（`browser.ts` 的 `shouldKeepAlive`）——
 * 立刻关等于永远关不掉。所以给一个**几秒**的短时长，交给既有的
 * 「到点复问 + 重新计时」逻辑去等这一轮真正结束：
 *   * 一轮里多个方案串行跑时，前一个 `release()` 之后锁仍被下一个握着 → 复问被拦 → 改期，
 *     于是窗口**不会在方案之间被关掉又打开**（那比一直开着更难看）；
 *   * 等全部跑完，那一次复问没人再拦 → 关掉。
 *
 * 3 秒是"跑完就走"与"别在方案之间闪窗"之间的取舍值。登录引导轮询中同样会被拦住
 * （用户正在那个窗口里输密码），所以不用担心把登录页关掉。
 */
export const BROWSER_CLOSE_AFTER_RUN_MS = 3_000;
//# sourceMappingURL=browser.js.map