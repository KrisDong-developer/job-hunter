/**
 * SinoJobs 的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ## 页面全局「写 / 读」协议（三者必须同文件同改）
 *
 * `fetchListInPage` 把列表响应挂到 `globalThis.__SINOJOBS_LIST_PAYLOAD__`，
 * 随后 `extractJobsInPage` 与 `readTotalInPage` 在**同一次 evaluate 的后续调用**里
 * 把它读出来 —— 写入与读取的**顺序由宿主在 `readListPage` 里保证**（写 → 解析 → 读 total）。
 * 写的一半与读的两半是**同一个页面上下文协议**，不许拆到不同文件。
 *
 * ⚠️ 本文件的函数在真机上**脱离模块作用域**执行（`evaluate` 只序列化源码，闭包不存在）：
 * 不得引用本文件的任何模块级**值**（常量 / 工具函数）；需要就**内联进函数体内**。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败（本仓库踩过）。
 *
 * 完整实测记录（详情页 DOM 结构、接口响应形状）见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../shared/contract/enums/crawl.js';
import type { BlockSignalSet } from '../../block-signals.js';
import type { RawJob, RawJobDetail } from '../../types.js';
import type { SinoJobsConfig } from './config.js';
/**
 * **在页面上下文里**解析列表响应。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以日期换算这类逻辑在函数体内**各写一遍**。
 *
 * @param config 字段配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: SinoJobsConfig): RawJob[];
/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 与神仙外企同款的两步拆分：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export declare function fetchListInPage(arg: {
    url: string;
    body: Record<string, string>;
}): Promise<{
    ok: boolean;
    statusCode: number | null;
    message: string;
    rawStatus: number;
}>;
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与神仙外企同理：列表不是 DOM 渲染的，"卡片数"只能当佐证，**接口返回**才是主判据 ——
 * 但接口侧的错误（`status != 1`）已经在 `readListPage` 处以抛错暴露成 `PARSE_FAILED`，
 * 这里只处理**页面结构信号**（实测该平台未观察到接口侧的专门风控码）。
 */
export declare function detectBlockInPage(arg: {
    cardCount: number;
    /** 通用词表（宿主侧用 `signalsOf(...)` 组装后传进来）。 */
    signals: BlockSignalSet;
}): BlockKind | null;
/** 在页面上下文里找「下一页」是否可用（UI 信号；真正的闸门是 `maxPages` + 接口 total）。 */
export declare function hasNextPageInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递（`/UserCenter/...`）。
 * 未登录时顶部导航是 `<a class="sign-out" href="/Ucenter/login.html">登录</a>`（实测）；
 * 已登录时该链接被用户菜单替换。所以这里只看一个结构性信号：**登录链接是否还在**。
 */
export declare function isLoggedInInPage(): boolean;
/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export declare function countCardsInPage(arg: {
    selector: string;
}): number;
/**
 * **在页面上下文里**解析详情页（服务端渲染的静态 HTML，实测结构）：
 *
 *   * 职位名：`h5`；
 *   * 公司名：第一个 `h6`；
 *   * 信息列表（`ul li`）：`[薪资, 城市, 经验 X, 全职/兼职/实习, 发布于YYYY-MM-DD]`；
 *   * JD 正文：`h6`（职位描述/任职要求/联系方式/公司信息）+ 随后的 `p`。
 *
 * 信息列表**按文案模式分类而不是按下标**：平台字段增减时按位置读会错位。
 */
export declare function extractDetailInPage(config: SinoJobsConfig): RawJobDetail;
/** 在页面上下文里读最近一次列表响应的 total（没抓到就 0）。 */
export declare function readTotalInPage(): number;
//# sourceMappingURL=page.d.ts.map