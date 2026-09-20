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
import type { RawInboxMessage, RawJob } from '../../types.js';
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
/**
 * **在页面上下文里**发**会话列表**请求（自包含；表单体）。
 *
 * 与 `fetchListInPage` 是同一个门（2026-09-20 探针实测）：**六项静态头
 * （`LIEPIN_API_HEADERS`）+ 三项现造遥测**缺一不可 —— 只给静态头时服务端回
 * `{"flag":0,"code":"-1400"}`（HTTP 200），看上去像"接口坏了"。
 *
 * 为什么不复用 `fetchListInPage`：
 *   * 那个发的是 **JSON 体**（`content-type: application/json`），而这个接口要**表单体**；
 *   * 页面上下文函数**不能用模块级的共享工具**（会被序列化、脱离作用域），
 *     所以哪怕把两者合一，遥测构造那几行也得在函数体内再写一遍 ——
 *     合一反而会让调用方多传一个"体格式"开关，得不偿失。
 */
export declare function fetchContactListInPage(arg: {
    apiPath: string;
    /** 表单体（`buildContactListBody` 的产出）。 */
    body: string;
    /** 静态头（来自 `LiepinConfig.apiHeaders`）。 */
    headers: Record<string, string>;
}): Promise<unknown>;
/**
 * 一条会话行（**只留我们要用的字段**，形状来自 2026-09-20 实测的 8 行真实样本）。
 *
 * 行上还有 `photo`/`userTag`/`hunterLevel`/`contact`/`chatType` 等一堆字段，
 * 这里刻意不取 —— 用不到的东西不进类型，免得下游以为它们可信（`contact` 实测恒 false、
 * `oppositeRead` 实测恒 "1"，都没有反向样本，**不当作判据**）。
 */
export interface LiepinContactRow {
    /** 会话键（= 招聘者 id，实测与 `oppositeUserId` 同值）。 */
    id: string;
    /** HR 名（如「何女士」）。 */
    name: string;
    company: string;
    /** 未读数（0 = 已读/无未读）。 */
    unReadCnt: number;
    /**
     * 平台自己的方向字段（原样保留）。
     *
     * ⚠️ **不用它判方向**：语义始终没定论 —— 8 行样本里它与"最后一条消息的方向"和
     * "会话由谁发起"两种解释都吻合（7 行对方发来的真实消息是 `"1"`，1 行我发起、
     * 对方一个字没说的是 `"0"`）。留着是为了**下次有反例时能对比**，而不是当判据用。
     */
    directionRaw: string;
    /** 最后一条消息时间（**毫秒**时间戳，如 `1789886694000`）。 */
    latestMsgTime: string;
    /** 最后一条是否被撤回（实测样本里恒 false，**没有正向样本 ⇒ 不做特殊处理**）。 */
    latestMsgIsRevoke: boolean;
    /** 最后一条的扩展类型：`200` = 平台生成的招呼语建议（autoSayHi）、`202` = 带岗位卡的真实消息。 */
    extType: string;
    /** 最后一条的正文（来自 `lastPayload.bodies[].msg`）。 */
    lastMessage: string;
    /** 最后一条若是带岗位卡的消息（`extType 202`），这里就是**数字 jobId**（与列表的规范 id 同源）。 */
    jobId: string;
}
/**
 * 解析会话列表响应 → 会话行。
 *
 * ⚠️ **返回 `null` 表示"结构不认识"**（调用方必须抛错，不能当成 0 条）；
 * 返回 `[]` 才是**可信的 0 条**（`data.list` 真的是空数组）。这条区分是收件箱的命门
 * ——「今天没人回我」与「我读不出来」在界面上必须长得不一样。
 *
 * ⚠️ `totalCount` / `pageSize` / `hasNext` / `hasMore` **四个汇总量全都不可信**：
 * 实测 `list.length = 8` 而 `totalCount = 0`、`pageSize = 0`、`hasNext = hasMore = false`。
 * ⇒ 判空只能看 `list` 本身；翻页也只能靠"本页不满一页即停"（见 `actions.ts`）。
 */
export declare function contactRowsOf(payload: unknown): LiepinContactRow[] | null;
/**
 * 会话行 → `RawInboxMessage`。
 *
 * ## 方向怎么判（这是本适配器最容易撒谎的一格，逐条写清）
 *
 * 合同的 `direction` 是**"最后一条消息是谁发的"**。页面没有直接给这个答案，
 * 于是用**有真实样本支撑**的两条判据：
 *
 *   1. `unReadCnt > 0` ⇒ `hr`。**未读**的定义就是"对方发来、我没看" ⇒ 最后一条必然是对方发的。
 *      样本 8/8 一致（7 行对方发来的真实文案 + 1 行我发起的平台建议，后者 unread=0）。
 *   2. 否则 `extType === 200` ⇒ `me`。`200` 是平台在**我点「聊一聊」之后**替我生成的
 *      招呼语建议（`clickScheme: lptd://lp/p/autoSayHi`，文案「我们为您生成了合适的打招呼语」）
 *      —— 它是**我这一侧**的动作产物，对方一个字都没说（样本 1/1）。
 *   3. 其余情况**判不出来**（例如"我回过、对方也读过"的会话）⇒ 按 `hr` 记。
 *      口径与 `zhipin` 一致且理由相同：收件箱的用途是"有没有人回我"，
 *      **漏报（把回我的说成没回）比误报贵**。
 *
 * ⚠️ **不用平台的 `direction` 字段**：它的语义没定论（见 `LiepinContactRow.directionRaw`），
 * 拿它当判据会在反方向上撒谎。
 *
 * `at` 用真实时间戳（`latestMsgTime` 毫秒 → ISO），不像 zhipin 只能给"昨天"这类相对文本。
 * `platformJobId` 只在最后一条是带岗位卡的消息（`extType 202`）时才有 ——
 * 那时它给的是**数字 jobId**，与列表/接口的规范 id 同源（见 `LiepinConfig.jobPgRefPattern`）。
 */
export declare function inboxMessageOf(row: LiepinContactRow): RawInboxMessage;
//# sourceMappingURL=api.d.ts.map