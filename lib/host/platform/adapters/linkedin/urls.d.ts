/**
 * LinkedIn 的 URL 构造（宿主机侧）：guest 匿名接口（**主通道的导航目标**）与
 * 搜索页（登录检测用）的地址拼装，**不碰 `document`**。
 *
 * 完整调研记录（为什么主通道是导航式 guest 端点、哪些参数真生效）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { LinkedInConfig } from './config.js';
/**
 * guest 匿名列表接口 URL —— **主通道的导航目标**：
 * `https://{host}/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=…&start=0`。
 *
 * 为什么是「导航」而不是「页面内 fetch 回来再解析」：LinkedIn 的 CSP 启用
 * Trusted Types，`innerHTML` / `DOMParser.parseFromString` 在真实页面上都会抛
 * 「requires TrustedHTML」（v2 探针两次真机实测）—— 字符串解析这条路是死的。
 * 顶层导航让浏览器自己把片段渲染成文档，`readListPage` 解析活 DOM。
 */
export declare function buildLinkedInGuestApiUrl(config: LinkedInConfig, criteria: SearchCriteria): string;
/**
 * 搜索页 URL（带 trk）：`https://{host}/jobs/search/?keywords=…&trk=<guestTrk>`。
 *
 * **不是采集通道**（登录态下搜索页初始 DOM 0 卡片、客户端渲染）—— 它只服务
 * `auth.checkUrl`（登录标记 global-nav 只在完整页面里有，guest 片段页没有页头）。
 * trk 模拟「从首页 Jobs 标签进来的游客」，降低未登录会话被 authwall 拦的概率。
 */
export declare function buildLinkedInSearchUrl(config: LinkedInConfig, criteria: SearchCriteria): string;
//# sourceMappingURL=urls.d.ts.map