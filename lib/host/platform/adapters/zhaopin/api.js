/**
 * **在页面上下文里**取会话列表（自包含）。
 *
 * ⚠️ 必须走页面上下文的 `fetch`：那才带着智联的登录 Cookie，与用户自己翻会话走同一条链路。
 * 绝不回退到宿主 Node 的 fetch —— 那等于绕开登录态直连接口，在离线测试里还会**真的打到线上**。
 */
export async function fetchTalkListInPage(arg) {
    // ⚠️ 不写 `window.fetch`：真浏览器里它挂在 window（= globalThis），而离线夹具里 `window`
    // 是 jsdom 的、**没有** fetch（见 `test/support/jsdom-page.ts`）。
    const scope = globalThis;
    if (typeof scope.fetch !== 'function') {
        return { ok: false, status: 0, code: null, message: '页面上下文没有 fetch', payload: null };
    }
    try {
        const response = await scope.fetch(arg.url, {
            method: 'GET',
            // 同源 Cookie / 登录态 —— 实测这就是全部所需（at/rt 与自定义头都不是必需的）
            credentials: 'include',
            headers: { accept: 'application/json, text/plain, */*' },
        });
        const payload = await response.json();
        const record = payload;
        return {
            ok: true,
            status: typeof response.status === 'number' ? response.status : 0,
            code: typeof record?.code === 'number' ? record.code : null,
            message: typeof record?.message === 'string' ? record.message : '',
            payload,
        };
    }
    catch (error) {
        return {
            ok: false,
            status: 0,
            code: null,
            message: error instanceof Error ? error.message : String(error),
            payload: null,
        };
    }
}
/** 把接口返回的 `data` 数组收窄成 `ZhaopinTalkRow[]`。结构不符**抛错**（不静默降级）。 */
export function talkRowsOf(payload) {
    const data = payload?.data;
    if (!Array.isArray(data)) {
        throw new Error('智联会话列表接口的形状变了：data 不是数组（改版了，先别当成"没人回我"）');
    }
    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const str = (value) => (typeof value === 'string' ? value : '');
    return data.map((item) => {
        // 单项不是对象也照常走完：读字段一律走上面两个收敛函数，
        // 不让一条脏数据在 `.map` 里抛个看不懂的 TypeError 把整次同步带崩。
        const row = (typeof item === 'object' && item !== null ? item : {});
        return {
            sessionid: str(row['sessionid']),
            peerPartnerId: str(row['peerPartnerId']),
            staffName: str(row['staffName']),
            companyName: str(row['companyName']),
            jobTitle: str(row['jobTitle']),
            jobNumber: str(row['jobNumber']),
            text: str(row['text']),
            unreadCount: num(row['unreadCount']),
            sendTime: num(row['sendTime']),
            userId: num(row['userId']),
            senderId: num(row['senderId']),
            oppositeRead: num(row['oppositeRead']),
            oppositeReply: num(row['oppositeReply']),
            selfRead: num(row['selfRead']),
            selfReply: num(row['selfReply']),
        };
    });
}
/**
 * 会话行 → `RawInboxMessage`。
 *
 * 方向判定只有一条判据：**`senderId === userId` ⇒ 最后一条是我发的**。
 * 实测样本（`text:"已发送附件简历"` 那条）两者相等、且那条确实是系统代我发出的。
 * 两个字段缺任何一个都**抛错**而不是猜 —— 猜错会让"我发的话"变成"HR 说的"，
 * 那正是本仓库最不愿意看到的谎（见 §4.2.4）。
 */
export function mapTalkRowsToInbox(rows) {
    return rows.map((row) => {
        if (row.userId === 0 || row.senderId === 0) {
            // 带上这一行的身份，否则维护者只看到"有一行坏了"却不知道是哪一行
            const who = row.companyName !== '' ? row.companyName : row.sessionid !== '' ? row.sessionid : '(未知会话)';
            throw new Error(`智联会话行缺少 userId/senderId（${who}），判不出最后一条是谁发的（改版了：方向判定必须重校）`);
        }
        const at = row.sendTime > 0 ? new Date(row.sendTime).toISOString() : null;
        return {
            conversationId: row.sessionid !== '' ? row.sessionid : row.peerPartnerId,
            hrName: row.staffName,
            company: row.companyName,
            lastMessage: row.text,
            direction: row.senderId === row.userId ? 'me' : 'hr',
            unread: row.unreadCount > 0,
            at,
            platformJobId: row.jobNumber,
        };
    });
}
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
export function stageOfTalkRow(row) {
    if (row.unreadCount > 0)
        return 'replied';
    if (row.selfReply > 0)
        return 'delivered';
    return null;
}
//# sourceMappingURL=api.js.map