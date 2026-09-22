/**
 * **在页面上下文里**解析收件箱（会话列表）。⚠️ 必须完全自包含。
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记** ——
 * 收件箱的用途是"有没有人回我"，漏报比误报贵（zhipin 同款取舍）。
 */
export function readInboxInPage(arg) {
    const out = [];
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    // ① 容器必须先找到。找不到就是"选择器未校准 / 当前不是消息页"——
    //    这里**抛错**而不是返回 []：空数组会被上层读成"今天没人回我"，
    //    0 条必须可信。
    let container = null;
    if (arg.selectors.listContainer !== '') {
        try {
            container = document.querySelector(arg.selectors.listContainer);
        }
        catch {
            container = null;
        }
        if (container === null) {
            throw new Error(`会话列表容器未找到（${arg.selectors.listContainer}）—— 选择器未校准或当前页面不是 51job 消息页` +
                '（chatUrl / inboxSelectors 可经 DB 覆盖修正）');
        }
        // ② 空态：容器在 + 自报"暂无" → 这才是**可信的 0 条**
        try {
            if (arg.selectors.emptyState !== '' && container.querySelector(arg.selectors.emptyState) !== null) {
                return out;
            }
        }
        catch {
            /* 选择器非法 → 继续按行解析 */
        }
        try {
            const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, '');
            if (bodyText.includes('暂无消息') || bodyText.includes('暂无会话') || bodyText.includes('暂无联系人')) {
                return out;
            }
        }
        catch {
            /* ignore */
        }
    }
    let rows = [];
    try {
        rows = Array.from(document.querySelectorAll(arg.selectors.row));
    }
    catch {
        return out;
    }
    rows.forEach((row, index) => {
        let name = '';
        try {
            name = norm(row.querySelector(arg.selectors.name)?.textContent);
        }
        catch {
            name = '';
        }
        if (name === '')
            return;
        let company = '';
        try {
            company = norm(row.querySelector(arg.selectors.company)?.textContent);
        }
        catch {
            company = '';
        }
        let lastMessage = '';
        let lastClass = '';
        try {
            const node = row.querySelector(arg.selectors.lastMessage);
            lastMessage = norm(node?.textContent);
            lastClass = (node?.getAttribute('class') ?? '').toLowerCase();
        }
        catch {
            lastMessage = '';
        }
        let hasStatus = false;
        let statusClass = '';
        try {
            const node = row.querySelector(arg.selectors.status);
            hasStatus = node !== null;
            statusClass = (node?.getAttribute('class') ?? '').toLowerCase();
        }
        catch {
            hasStatus = false;
            statusClass = '';
        }
        let unread = false;
        try {
            unread = row.querySelector(arg.selectors.unread) !== null;
        }
        catch {
            unread = false;
        }
        let time = '';
        try {
            time = norm(row.querySelector(arg.selectors.time)?.textContent);
        }
        catch {
            time = '';
        }
        // 方向判据与 zhipin 同款：状态节点（送达/已读这类尾标）只出现在**我们发出的**
        // 消息上 —— 节点在即"我发的"；类名兜底认 myself/self/outgoing/send。
        const isOurs = hasStatus || /(myself|self|mine|outgoing|send)/.test(lastClass + ' ' + statusClass);
        const rawId = row.getAttribute('id') ?? row.getAttribute('data-id') ?? '';
        const conversationId = rawId !== '' ? rawId : company === '' ? `${name}#${String(index)}` : `${name}|${company}`;
        out.push({
            conversationId,
            hrName: name,
            company,
            lastMessage,
            direction: isOurs ? 'me' : 'hr',
            unread,
            // 平台给「今天/昨天」这类相对时间的可能性大 —— 原样带出，由上层解释（编日期更糟）。
            at: time === '' ? null : time,
        });
    });
    return out;
}
/**
 * **在页面上下文里**判断某个岗位当前的接触阶段。⚠️ 必须完全自包含。
 *
 * 判据沿 zhipin `detectStageInPage` 的口径，**认不出来就返回 `null` 并带原因，绝不猜**：
 *   * 列表里没有这一行 → `null`（分不清"从没打过招呼"与"会话超出平台保留窗口"）；
 *   * 行在 + 未读徽章 / 最后一条不是我们发的 → `replied`；
 *   * 最后一条是我们发的 + 状态类名认得出 → `read` / `delivered`；
 *   * 状态类名认不出 → `null`（让上层保留原值，而不是被降级）。
 */
export function detectStageInPage(arg) {
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    let container = null;
    if (arg.selectors.listContainer !== '') {
        try {
            container = document.querySelector(arg.selectors.listContainer);
        }
        catch {
            container = null;
        }
        if (container === null) {
            return { stage: null, reason: `会话列表容器未找到（${arg.selectors.listContainer}）—— 判不出阶段` };
        }
    }
    let rows = [];
    try {
        rows = Array.from(document.querySelectorAll(arg.selectors.row));
    }
    catch {
        rows = [];
    }
    const hints = [norm(arg.company), norm(arg.title)].filter((hint) => hint !== '');
    if (hints.length === 0)
        return { stage: null, reason: '岗位没有公司名也没有标题，无法在会话列表里定位' };
    const row = rows.find((node) => {
        const text = norm(node.textContent);
        return hints.some((hint) => text.includes(hint));
    });
    if (row === undefined) {
        return {
            stage: null,
            reason: '会话列表里没有这个岗位的会话（可能从未打过招呼，或平台已把它移出保留窗口）—— 不写成 none',
        };
    }
    let statusClass = '';
    let hasStatus = false;
    try {
        const node = row.querySelector(arg.selectors.status);
        hasStatus = node !== null;
        statusClass = (node?.getAttribute('class') ?? '').toLowerCase();
    }
    catch {
        hasStatus = false;
        statusClass = '';
    }
    let lastClass = '';
    try {
        lastClass = (row.querySelector(arg.selectors.lastMessage)?.getAttribute('class') ?? '').toLowerCase();
    }
    catch {
        lastClass = '';
    }
    let unread = false;
    try {
        unread = row.querySelector(arg.selectors.unread) !== null;
    }
    catch {
        unread = false;
    }
    if (unread)
        return { stage: 'replied', reason: '会话有未读，说明 HR 发了新消息' };
    const ours = hasStatus || /(myself|self|mine|outgoing|send)/.test(lastClass);
    if (!ours)
        return { stage: 'replied', reason: '最后一条不是我们发的 → HR 已回复' };
    if (statusClass.includes('read'))
        return { stage: 'read', reason: '状态类名含 read' };
    if (statusClass.includes('delivery') || statusClass.includes('delivered')) {
        return { stage: 'delivered', reason: '状态类名含 delivery/delivered（已送达，未见已读）' };
    }
    return {
        stage: null,
        reason: `最后一条是我们发的，但状态类名认不出来（class="${statusClass}"）—— 不猜`,
    };
}
//# sourceMappingURL=inbox.js.map