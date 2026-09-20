/**
 * LinkedIn 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 ——
 * 列表卡片解析（活 DOM）、详情页解析、地址级判墙、登录检测。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 *
 * ⚠️ **Trusted Types 红线**（2026-09-20 v2 探针两次真机实测）：LinkedIn 的 CSP 启用
 * Trusted Types，本文件的函数**不得**出现 `innerHTML = 字符串`、`outerHTML =`、
 * `DOMParser.parseFromString` 一类的注入 sink —— 真实页面上会直接抛
 * 「requires TrustedHTML」，而且离线 jsdom 测不出（没有 CSP）。
 * 所有解析都只做**读**（querySelector / getAttribute / textContent）。
 *
 * 完整调研记录见 `./index.ts` 文件头。
 */
import type { RawJob, RawJobDetail } from '../../types.js';
import type { LinkedInDetailSelectors, LinkedInSelectors } from './config.js';
/** 卡片解析的入参（解析**当前文档** —— guest 端点经顶层导航后，片段已是活 DOM）。 */
export interface ExtractCardsArg {
    selectors: LinkedInSelectors;
    host: string;
    jobUrnPattern: string;
    jobIdFromUrlPattern: string;
    salaryPattern: string;
}
/**
 * **在页面上下文里**解析岗位卡片（当前文档）。
 *
 * 卡片锚点：`div.base-card`；平台 id 优先取 `data-entity-urn`（`urn:li:jobPosting:{id}`），
 * 没有再从标题链接 href 抠（`/jobs/view/{slug}-{id}`）。sourceUrl 一律规范成
 * `https://{host}/jobs/view/{id}`（LinkedIn 的岗位 URL 不带 securityId 一类的会话参数，
 * 规范形可幂等 —— 与 BOSS「绝不重构 URL」的规则不冲突）。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export declare function extractJobsInPage(arg: ExtractCardsArg): RawJob[];
/**
 * **在页面上下文里**解析详情页（已导航到 `/jobs/view/{id}` 的活 DOM）。
 *
 * 锚点由 2026-09-20 `probe:linkedin-v2` 的真机快照逐项证实（见 config.ts 的
 * `LinkedInDetailSelectors` 文档注释）。详情页对游客 SSR 直出（真机：匿名打开
 * 落点无 authwall、JD/criteria 全在）—— 不需要登录态。
 *
 * 字段映射：criteria 里「职位级别」→ expReq；「职能类别 / 行业」→ tags；
 * JD 全文（`.show-more-less-html__markup` 的 textContent —— clamp 折叠是 CSS 层
 * 的事，textContent 一定是全文）→ jdText。
 */
export declare function extractDetailInPage(arg: {
    selectors: LinkedInDetailSelectors;
}): RawJobDetail;
/**
 * **在页面上下文里**读地址级的墙信号（结构性判据，比文案可靠）。
 *
 *   * `/authwall`（或被 302 到登录页）→ `'authwall'` → 调用方判 `login-required`；
 *   * `/checkpoint`、`/captcha` → `'checkpoint'` → 调用方判 `captcha`。
 *
 * 为什么不放 `detectBlockWithSignals` 的 urlPatterns：那里的 URL 特征**一律判 captcha**，
 * 而 authwall 是登录墙 —— 语义错了会把用户引去「重试/等待」而不是「登录」。
 */
export declare function wallKindInPage(): 'authwall' | 'checkpoint' | null;
/**
 * **在页面上下文里**判登录态：页头 global-nav 的「我」区（头像）在不在。
 *
 * 判据由 2026-09-20 `probe:linkedin-login` 的两侧对比定案（选择器由宿主机传入，
 * 见 `LinkedInConfig.loggedInSelector`）：`.global-nav__me-photo` / `.global-nav__me`
 * 已登录侧各 1 命中、未登录侧 0。⚠️ 判据按**正常页面**校准 —— 登录页上没有
 * global-nav，在那儿判会恒「未登录」，所以 `auth.checkUrl` 用搜索页。
 */
export declare function isLoggedInInPage(arg: {
    selector: string;
}): boolean;
//# sourceMappingURL=page.d.ts.map