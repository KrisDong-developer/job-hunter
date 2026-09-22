/**
 * 神仙外企的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ## 页面全局「写 / 读」协议（两者必须同文件同改）
 *
 * `fetchListInPage` 把列表响应挂到 `globalThis.__WAIQI_LIST_PAYLOAD__`，
 * 随后 `extractJobsInPage` 在**同一次 evaluate 的后续调用**里把它读出来 ——
 * 写入与读取的**顺序由宿主在 `readListPage` 里保证**（写 → 解析）。
 * 写的一半与读的一半是**同一个页面上下文协议**，不许拆到不同文件。
 * 详情侧同款一对：`fetchDetailInPage` 写 `__WAIQI_DETAIL_PAYLOAD__` →
 * `extractDetailInPage` 读它（顺序由 `detail.extract` 保证）。
 *
 * ⚠️ 本文件的函数在真机上**脱离模块作用域**执行（`evaluate` 只序列化源码，闭包不存在）：
 * 不得引用本文件的任何模块级**值**（常量 / 工具函数）；需要就**内联进函数体内**。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败（本仓库踩过）。
 *
 * 完整实测记录（记录字段实测原文、接口 code 语义）见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../shared/contract/enums/crawl.js';
import type { BlockSignalSet } from '../../block-signals.js';
import type { RawJob, RawJobDetail } from '../../types.js';
import type { WaiqiConfig } from './config.js';
/**
 * **在页面上下文里**解析列表。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以薪资拼接、日期截取这些逻辑在函数体内**各写一遍**，
 * 并由 `test/platform/waiqi.test.ts` 的「按源码重建函数」护栏守住。
 *
 * @param config 选择器与字段配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: WaiqiConfig): RawJob[];
/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 为什么分两步而不是一个 async 函数干完：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果，不必给 jsdom 装 fetch。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export declare function fetchListInPage(arg: {
    url: string;
    body: Record<string, unknown>;
}): Promise<{
    ok: boolean;
    code: number | null;
    message: string;
    status: number;
}>;
/**
 * **在页面上下文里**解析详情接口响应 → `RawJobDetail`（同步、自包含）。
 *
 * 数据来源与列表同一协议：`fetchDetailInPage` 写 `globalThis.__WAIQI_DETAIL_PAYLOAD__`，
 * 这里读它；离线测试可改用 `<script id="waiqi-detail-fixture-payload">` 内联夹具。
 *
 * JD 的拼法（2026-09-21 实测定案）：`description` 是**原文**（外企岗常为纯英文），
 * `translateDescription` 是**平台提供的完整中文翻译**（实测可与原文逐段对上）。
 * 下游（打分 / 技能差距分析）按中文关键词匹配，纯英文 JD 会系统性漏配 ——
 * 所以两者都在时拼接为「原文 + 【平台中文翻译】标记 + 译文」；原文缺失时用译文兜底并记 note。
 *
 * ⚠️ 详情响应的城市键是 `cityNamelist`（小写 l），与列表不同 —— 字段表来自 `config.detailFields`。
 */
export declare function extractDetailInPage(config: WaiqiConfig): RawJobDetail;
/**
 * **在页面上下文里**发详情接口请求（GET，自包含），把响应挂到全局供 `extractDetailInPage` 解析。
 *
 * 与 `fetchListInPage` 同一套纪律：只认**页面上下文自己的** fetch（`__WAIQI_FETCH__` 护栏），
 * 绝不回退宿主 Node 的 fetch（那会脱离浏览器登录态、在离线测试里还会真的打到线上）。
 */
export declare function fetchDetailInPage(arg: {
    url: string;
}): Promise<{
    ok: boolean;
    code: number | null;
    message: string;
    status: number;
}>;
export declare function detectBlockInPage(arg: {
    cardCount: number;
    /** 最近一次列表接口返回的 code；`null` = 还没发过请求。 */
    code: number | null;
    /** 通用词表（宿主侧用 `signalsOf(...)` 组装后传进来）。见 `block-signals.ts`。 */
    signals: BlockSignalSet;
}): BlockKind | null;
/** 在页面上下文里找「下一页」是否可用。**注意**：真正的闸门是 `maxPages=1`。 */
export declare function hasNextPageInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递、收藏、订阅。
 * 所以这里只看一个结构性信号：页面上是否有用户头像（未登录时是"登录"按钮）。
 *
 * ⚠️ **不认"页面上有没有『登录』两个字"**：正常结果页右上角一直有登录入口，
 * 拿它判断会导致"永远判定为未登录"，定时任务就永远不跑了（那是个很隐蔽的死锁）。
 */
export declare function isLoggedInInPage(): boolean;
/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export declare function countCardsInPage(arg: {
    selector: string;
}): number;
//# sourceMappingURL=page.d.ts.map