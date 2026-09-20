/**
 * 智联的**会话（IM）接口面**：页面内 fetch 通道 + 响应收敛 + 会话行 → 领域结构。
 *
 * ⚠️ `fetchTalkListInPage` 是**页面上下文函数**：会被 `page.evaluate` 序列化后送进浏览器执行，
 * 必须完全自包含 —— **不得**在本文件新增任何模块级的值供它引用。离线 jsdom 测不出这个错
 * （Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头（含 `getTalkList` 的实测样本与方向判定依据）。
 */
import type { ContactStage } from '../../../../shared/contract/enums/pipeline.js';
import type { RawInboxMessage } from '../../types.js';
/** 会话行里我们真正用到的字段（**接口字段名是平台自己的**，别照我们的名字去找）。 */
export interface ZhaopinTalkRow {
    sessionid: string;
    peerPartnerId: string;
    staffName: string;
    companyName: string;
    jobTitle: string;
    jobNumber: string;
    text: string;
    unreadCount: number;
    sendTime: number;
    userId: number;
    senderId: number;
    oppositeRead: number;
    oppositeReply: number;
    selfRead: number;
    selfReply: number;
}
/**
 * **在页面上下文里**取会话列表（自包含）。
 *
 * ⚠️ 必须走页面上下文的 `fetch`：那才带着智联的登录 Cookie，与用户自己翻会话走同一条链路。
 * 绝不回退到宿主 Node 的 fetch —— 那等于绕开登录态直连接口，在离线测试里还会**真的打到线上**。
 */
export declare function fetchTalkListInPage(arg: {
    url: string;
}): Promise<{
    ok: boolean;
    status: number;
    code: number | null;
    message: string;
    payload: unknown;
}>;
/** 把接口返回的 `data` 数组收窄成 `ZhaopinTalkRow[]`。结构不符**抛错**（不静默降级）。 */
export declare function talkRowsOf(payload: unknown): ZhaopinTalkRow[];
/**
 * 会话行 → `RawInboxMessage`。
 *
 * 方向判定只有一条判据：**`senderId === userId` ⇒ 最后一条是我发的**。
 * 实测样本（`text:"已发送附件简历"` 那条）两者相等、且那条确实是系统代我发出的。
 * 两个字段缺任何一个都**抛错**而不是猜 —— 猜错会让"我发的话"变成"HR 说的"，
 * 那正是本仓库最不愿意看到的谎（见 §4.2.4）。
 */
export declare function mapTalkRowsToInbox(rows: ZhaopinTalkRow[]): RawInboxMessage[];
/**
 * 会话行 → 接触态。**判不出来返回 null，不猜**。
 *
 * 判据只用**有真实样本**的两个字段（`unreadCount`、`selfReply`）：
 *   * `unreadCount > 0` → `replied`（会话里有 HR 发来的未读 ⇒ 对方回过话）；
 *   * `selfReply > 0` → `delivered`（我这边发过 ⇒ 至少送达过）；
 *   * 其余 → `null`。
 *
 * ## ⚠️ 为什么**不用** `oppositeRead` / `oppositeReply`（2026-09-18 实测否决）
 *
 * 这两个字段按命名看着像"对方已读 / 对方已回"，所以第一版拿它们判 `read` / `replied`。
 * 探针把每行的**值**dump 出来之后否掉了这个假设：第 1 页 11 条会话里
 * `oppositeRead`/`oppositeReply` **全是 0**，**包括那几条有 2 条 / 1 条未读的会话**
 * （未读 = HR 刚发来消息，按命名 `oppositeReply` 本该是 1）。语义与命名不符 →
 * 用它判阶段就会把"HR 已回复"说成"没回复"。**没有样本支撑的字段一律不用。**
 *
 * 代价说清楚：**`read`（HR 已读）这一档在智联判不出来** —— 返回 `null`（契约允许），
 * 上层保留原值。要恢复这一档，得先拿到"已知已读"的会话样本、确认哪个字段真的会变。
 */
export declare function stageOfTalkRow(row: ZhaopinTalkRow): ContactStage | null;
//# sourceMappingURL=api.d.ts.map