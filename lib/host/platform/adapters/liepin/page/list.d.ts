/**
 * 猎聘的**列表页页面上下文函数**：卡片解析、分页可用性、登录态锚点。
 *
 * 完整实测记录见 `../index.ts` 文件头。
 *
 * ⚠️ 它们在真机上**脱离模块作用域**执行 —— 本文件**不得**新增任何模块级的值
 * （常量 / 工具函数 / 其它函数）供它们引用；若某个页面函数需要模块私有的值，
 * 必须把那个值**内联进该函数体内**。离线 jsdom 测不出这个错（Node 里闭包还在），
 * 一上真机就整页解析失败 —— 本仓库踩过这个坑。
 *
 * 📌 与 `zhipin/page/{list,detail}.ts` 同一套分工：列表侧（含登录态锚点）在 `list.ts`、
 * 详情侧在 `detail.ts`。合并成一个 `page.ts` 时，登录态锚点这种"两边都不属于"的函数
 * 只能随便挂一处，拆开之后归属是明确的。
 */
import type { RawJob } from '../../../types.js';
import type { LiepinSelectors } from '../config.js';
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
 */
export declare function extractJobsInPage(arg: {
    selectors: LiepinSelectors;
    salaryPattern: string;
    jobIdPattern: string;
    /** 卡片 href 埋点 `pgRef` 里的数字 job id（规范 id，见 `LiepinConfig.jobPgRefPattern`）。 */
    jobPgRefPattern: string;
    cityPattern: string;
    expPattern: string;
    eduPattern: string;
}): RawJob[];
/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledClass: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据来自两份真实快照的对比（2026-09-19）——
 * 匿名夹具（`test/fixtures/liepin-search.html`，全新 profile 抓的）
 * vs 登录态捕获（`.probe-liepin-capture/liepin-walk-01-search.html`）：
 *
 * | 信号 | 未登录 | 已登录 |
 * |---|---|---|
 * | `#header-quick-menu-user-info`（`loggedInMarker`） | 无 | **有** |
 * | `.header-quick-menu-not-login-item`（`notLoggedInMarker`） | **有** | 无 |
 *
 * ⚠️ 两个都**不能**用文案判：「登录/注册」在匿名页出现 2 次、登录页 0 次，看着也能用，
 * 但文案一变就静默失效（本仓库有明文纪律：只认结构性信号）。
 *
 * ⚠️ 判据是在**搜索页**上校准的 ⇒ `auth.checkUrl` 也指向搜索页（见 `../index.ts`）：
 * 拿从未验证过的页面当检测页，等于换一套判据（就是 51job/智联那种"恒判已登录/未登录"的坑）。
 *
 * 两个标记都不在 ⇒ 返回 `null`（**判不出来**），由调用方决定怎么落地 ——
 * 适配器里按 `false` 处理（保守：宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export declare function isLoggedInInPage(arg: {
    loggedInMarker: string;
    notLoggedInMarker: string;
}): boolean | null;
//# sourceMappingURL=list.d.ts.map