/**
 * 猎聘的**页面内请求通道**：在页面上下文里发搜索接口请求、把响应解析回 `RawJob`。
 *
 * 完整实测记录见 `./index.ts` 文件头。
 *
 * ⚠️ 本文件里的 **页面上下文函数**（`fetchListInPage`）会被 `page.evaluate` 序列化后
 * 送进浏览器，**脱离模块作用域**执行：不得引用任何模块级的值（常量 / 工具函数）。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 纯 Node 侧的解析函数（`parseSearchApiResponse` / `refreshTimeToIso`）不受此限。
 */
import type { RawJob } from '../../types.js';
/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 *
 * ⚠️ 请求头**不是可选的**：少一组 `x-fscp-*` 服务端就回 `{"flag":0,"code":"-1400"}`
 * （HTTP 200！），而调用方会静默回退 DOM —— 见 `LIEPIN_API_HEADERS` 的实测表。
 * 其中三项必须在**页面里现造**（序列化进来的函数不能引用闭包）：
 *   * `x-fscp-trace-id`：每请求一个 UUID（实测服务端不校验其内容，格式对即可）；
 *   * `x-fscp-bi-stat`：`{"location": <当前页 URL>}`；
 *   * `x-fscp-fe-version`：实测是**空字符串**（但必须存在）。
 *
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export declare function fetchListInPage(arg: {
    apiPath: string;
    body: Record<string, unknown>;
    /** 静态头（来自 `LiepinConfig.apiHeaders`；页面函数不能引用模块作用域的东西）。 */
    headers: Record<string, string>;
}): Promise<unknown>;
/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export declare function refreshTimeToIso(raw: string): string | null;
/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export declare function parseSearchApiResponse(payload: unknown): RawJob[];
//# sourceMappingURL=api.d.ts.map