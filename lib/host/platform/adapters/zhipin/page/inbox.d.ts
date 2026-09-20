/**
 * BOSS 直聘的**收件箱页面上下文函数**：读会话列表、按会话行判定接触阶段。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { ContactStage } from '../../../../../shared/contract/enums/pipeline.js';
import type { RawInboxMessage } from '../../../types.js';
import type { ZhipinInboxSelectors } from '../config.js';
/**
 * **在页面上下文里**解析收件箱（求职者端会话列表）。
 *
 * 结构（2026-09-18 / **09-20 两次真实会话实测**，两条会话行逐字段核对过）：
 *   li[role=listitem]
 *     ├ .name-box                              ← 名字容器（实测 3 个 span：HR 名 / 公司 / 头衔）
 *     │    ├ span[0] = HR 名
 *     │    ├ span[1] = 公司名
 *     │    └ span[last] = HR 头衔
 *     ├ .name-text                             ← HR 名（独立节点，更稳）
 *     ├ .last-msg-text                         ← 最后一条消息
 *     ├ .message-status                        ← 方向线索（`status-delivery` / `status-read` 是"我发的"）
 *     ├ .notice-badge                          ← 未读数（09-20 实测：HR 主动发来的那行才有）
 *     └ .time                                  ← `00:53` / `昨天`（相对时间，原样带出）
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记**
 * —— 收件箱的用途是"有没有人回我"，漏报比误报贵（BossHunter 同样把不确定行
 * 当作候选回复来处理）。
 *
 * ⚠️ 必须完全自包含。
 */
export declare function readInboxInPage(arg: {
    selectors: ZhipinInboxSelectors;
}): RawInboxMessage[];
/**
 * **在页面上下文里**判断某个岗位当前的接触阶段。
 *
 * 判据只用**已实测**的收件箱选择器（2026-09-18 / 09-20）：
 *   `.time` / `.name-text` / `.name-box` / `.last-msg-text` / `.message-status` /
 *   未读徽章 `.notice-badge`。
 *
 * ⚠️ 认不出来就返回 `null` 并带上原因，**绝不猜**：
 *   * 列表里没有这一行 → 分不清"从没打过招呼"与"会话已超出平台保留窗口"，返回 `none` 会写错账；
 *   * 状态类名不认识 → 返回 `null`，让上层**保留原值**而不是被降级。
 * ⚠️ 必须完全自包含。
 */
export declare function detectStageInPage(arg: {
    selectors: ZhipinInboxSelectors;
    company: string;
    title: string;
}): {
    stage: ContactStage | null;
    reason: string;
};
//# sourceMappingURL=inbox.d.ts.map