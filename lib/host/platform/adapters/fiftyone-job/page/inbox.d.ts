/**
 * 51job 的**收件箱页面上下文函数**：读会话列表、按会话行判定接触阶段。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 *
 * ## 证据状态（2026-09-21）
 *
 * 51job 的站内消息页**本仓没有夹具、没有探针记录**（搜索页未登录视图不暴露消息入口；
 * 个人侧域名 i.51job.com 只在夹具里出现过 `resume_center.php` 一条链接）。本文件的
 * 选择器全是**候选**，`chatUrl` 也是候选地址 —— 语义上按 zhipin 求职者端会话列表的
 * 同款结构写（容器 → 行 → 行内字段），配齐 DB 覆盖即可在真机校准后点亮，不必发版。
 *
 * 两条**语义纪律**先于选择器成立（离线测试钉住的就是它们）：
 *   * 容器缺失 ⇒ **抛错**而非返回 `[]`：空数组会被上层读成"今天没人回我"；
 *   * 方向/状态认不出 ⇒ 按 `hr` 记、阶段返回 `null`，**不猜**。
 */
import type { ContactStage } from '../../../../../shared/contract/enums/pipeline.js';
import type { RawInboxMessage } from '../../../types.js';
import type { FiftyOneInboxSelectors } from '../config.js';
/**
 * **在页面上下文里**解析收件箱（会话列表）。⚠️ 必须完全自包含。
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记** ——
 * 收件箱的用途是"有没有人回我"，漏报比误报贵（zhipin 同款取舍）。
 */
export declare function readInboxInPage(arg: {
    selectors: FiftyOneInboxSelectors;
}): RawInboxMessage[];
/**
 * **在页面上下文里**判断某个岗位当前的接触阶段。⚠️ 必须完全自包含。
 *
 * 判据沿 zhipin `detectStageInPage` 的口径，**认不出来就返回 `null` 并带原因，绝不猜**：
 *   * 列表里没有这一行 → `null`（分不清"从没打过招呼"与"会话超出平台保留窗口"）；
 *   * 行在 + 未读徽章 / 最后一条不是我们发的 → `replied`；
 *   * 最后一条是我们发的 + 状态类名认得出 → `read` / `delivered`；
 *   * 状态类名认不出 → `null`（让上层保留原值，而不是被降级）。
 */
export declare function detectStageInPage(arg: {
    selectors: FiftyOneInboxSelectors;
    company: string;
    title: string;
}): {
    stage: ContactStage | null;
    reason: string;
};
//# sourceMappingURL=inbox.d.ts.map