/**
 * **在页面上下文里**读 Messaging 收件箱（已导航到 `/messaging/` 的活 DOM）。
 *
 * 容器找不到时**抛错**而不是返回 []：空数组会被上层读成「今天没人回我」，
 * 而 0 条必须可信（zhipin `readInboxInPage` 同款口径）。容器在而 0 行 =
 * 可信的 0 条（当前无空态文案证据，不编判据）。
 */
export function readInboxInPage(arg) {
    const out = [];
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    // ① 容器必须先找到 —— 找不到 = 选择器腐烂 / 当前不是 Messaging 页。
    let container = null;
    try {
        container = document.querySelector(arg.selectors.listContainer);
    }
    catch {
        container = null;
    }
    if (container === null) {
        throw new Error(`会话列表容器未找到（${arg.selectors.listContainer}）—— 选择器可能已腐烂，或当前页面不是 Messaging`);
    }
    // ② 行：每个 li 是一条会话。
    let rows = [];
    try {
        rows = Array.from(container.querySelectorAll(arg.selectors.row));
    }
    catch {
        return out;
    }
    rows.forEach((row, index) => {
        const name = norm(row.querySelector(arg.selectors.name)?.textContent);
        if (name === '')
            return;
        const snippet = norm(row.querySelector(arg.selectors.snippet)?.textContent);
        const time = norm(row.querySelector(arg.selectors.time)?.textContent);
        // conversationId：卡片自己的 id（如 conversation-card-ember48）。
        // ⚠️ ember 序号跨轮会变，去重键弱于 zhipin 的行 id —— 但 DOM 没有提供 thread URN
        // （逐属性搜过），退到「名字#序号」兜底（zhipin 同款兜底链）。
        const cardId = norm(row.querySelector(arg.selectors.card)?.getAttribute('id'));
        const conversationId = cardId !== '' ? cardId : `${name}#${String(index)}`;
        out.push({
            conversationId,
            hrName: name,
            company: '',
            lastMessage: snippet,
            // 无方向判据（见文件头证据边界）→ 按 hr：收件箱的用途是「有没有人回我」，漏报比误报贵。
            direction: 'hr',
            unread: false,
            at: time === '' ? null : time,
        });
    });
    return out;
}
//# sourceMappingURL=inbox.js.map