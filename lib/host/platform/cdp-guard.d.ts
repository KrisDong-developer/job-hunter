/**
 * 调试端口守卫（从 BossHunter 移植的思路，见其 `cdp-proxy.mjs` 的 enablePortGuard）。
 *
 * ## 它解决什么问题
 *
 * 猎聘等平台的风控脚本（`security.min.js`，字节系 SDK）会在页面里**主动探测**
 * 本地调试端口（`http://127.0.0.1:<port>/` 与 `http://localhost:<port>/`），
 * 能连上就判定"浏览器正在被自动化控制"，然后 `location.replace('about:blank')` 销毁页面。
 *
 * 这正是「CDP 连接日常 Chrome」失败的原因：调试端口是开着的，页面一探测一个准。
 * 真人手动浏览时**没有**调试端口，所以不会被杀。
 *
 * 本模块用 CDP 的 `Fetch` 域，在**网络层拦截**页面发往调试端口的请求，
 * 统一伪造 `ConnectionRefused` —— 页面脚本收到"连接被拒"，就以为没有调试端口。
 * 于是自动化环境在页面眼里变得和真人环境一样"干净"。
 *
 * ## 使用方式
 *
 * 对**每个**新开的页面都要装一次（`Fetch.enable` 是 per-session 的）：
 *
 * ```ts
 * const session = await context.newCDPSession(page)
 * await installPortGuard(session, { port: 9222 })
 * ```
 *
 * 必须在 `page.goto()` **之前**装好，否则页面的首次探测已经逃过了拦截。
 *
 * ## 为什么拦截而不是放行
 *
 * 放行会让页面真的连上调试端口 → 风控判定命中。拦截并伪造连接失败，
 * 是"把调试端口藏起来"最直接的做法 —— 这也符合本项目的保守原则
 * （C12：不硬刚风控，让采集环境尽可能像真人环境）。
 */
/**
 * CDP session 的最小结构面。playwright-core 与 patchright 的 `CDPSession`
 * 都满足它 —— 用结构类型而不是具体 import，让本模块不绑死在某个引擎上。
 */
export interface CdpSessionLike {
    send(method: string, params?: object): Promise<unknown>;
    on(event: string, listener: (params: unknown) => void): void;
    off(event: string, listener: (params: unknown) => void): void;
}
export interface PortGuardOptions {
    /** 本地调试端口（如 9222）。页面探测的就是它。 */
    port: number;
    /** 诊断日志（可选）。 */
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/**
 * 在给定 CDP session 上启用端口守卫。
 *
 * 拦截规则：页面发起的、指向 `127.0.0.1:<port>` / `localhost:<port>` 的请求，
 * 一律 `Fetch.failRequest` 成 `ConnectionRefused`。
 *
 * @returns 清理函数：停止拦截（页面关闭时调用，避免 session 泄漏）。
 */
export declare function installPortGuard(session: CdpSessionLike, options: PortGuardOptions): Promise<() => void>;
//# sourceMappingURL=cdp-guard.d.ts.map