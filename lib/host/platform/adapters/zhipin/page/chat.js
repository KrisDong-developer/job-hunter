/**
 * **在页面上下文里**读一个工具条按钮的状态（能不能点、为什么不能）。
 *
 * 需要它是因为 2026-09-18 实测：BOSS 的工具条按钮**用 CSS 类 + aria-label 表达"当前不可用"** ——
 * 「发简历」带 `unable`、`aria-label="求简历：双方回复后可用"`；直接点它什么也不会发生，
 * 而"点了没反应"最容易被误读成"投递成功了"。这里把不可用**读出来**再决定。
 * ⚠️ 必须完全自包含。
 */
export function toolbarButtonStateInPage(arg) {
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    let nodes = [];
    try {
        nodes = Array.from(document.querySelectorAll(arg.selector));
    }
    catch {
        return { found: false, disabled: false, reason: '' };
    }
    const wanted = norm(arg.textIncludes);
    const target = nodes.find((el) => wanted === '' || norm(el.textContent).includes(wanted));
    if (target === undefined)
        return { found: false, disabled: false, reason: '' };
    const className = (target.getAttribute('class') ?? '').toLowerCase();
    const ariaLabel = norm(target.getAttribute('aria-label'));
    const marked = arg.disabledClass !== '' && className.split(/\s+/).includes(arg.disabledClass.toLowerCase());
    return {
        found: true,
        disabled: marked,
        reason: marked ? ariaLabel || `带 ${arg.disabledClass} 标记（平台当前不可用）` : ariaLabel,
    };
}
/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export function detectGreetPopupInPage(arg) {
    const visible = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden');
        }
        catch {
            return false;
        }
    };
    try {
        const preset = Array.from(document.querySelectorAll(arg.selectors.presetPopup)).some((el) => visible(el));
        if (preset)
            return { kind: 'preset' };
        for (const dialog of Array.from(document.querySelectorAll(arg.selectors.startchatDialog))) {
            if (!visible(dialog))
                continue;
            if (dialog.querySelector(arg.selectors.startchatInput) !== null)
                return { kind: 'startchat' };
        }
    }
    catch {
        /* 选择器非法 → none */
    }
    return { kind: 'none' };
}
/**
 * **在页面上下文里**读会话消息，判断"我们发的那条"到了哪一步。
 *
 * 判据取自 BossHunter `_message_delivery_state`：
 *   * 消息文本比对前先去掉零宽字符与「发送中/已读/未读/送达」这类尾标；
 *   * `.message-status` 带 `status-error` → 发送失败；`status-loading` → 发送中；
 *     其余视为已送达。
 * 找不到对应消息 → `missing`（**绝不能**把"没看到"当成"已送达"）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readChatMessagesInPage(arg) {
    const norm = (value) => (value ?? '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    const stripTail = (value) => norm(value)
        .replace(/(发送中|已读|未读|送达|发送成功|重试|重新发送)$/g, '')
        .trim();
    const expected = norm(arg.expectText);
    if (expected === '')
        return { state: 'missing' };
    let list = null;
    try {
        list = document.querySelector(arg.selectors.messageList);
    }
    catch {
        list = null;
    }
    if (list === null)
        return { state: 'missing' };
    let nodes = [];
    try {
        nodes = Array.from(list.querySelectorAll(arg.selectors.myMessage));
    }
    catch {
        nodes = [];
    }
    const states = [];
    for (const node of nodes) {
        let text = '';
        try {
            const content = node.querySelector(arg.selectors.messageText);
            text = stripTail(content === null ? node.textContent : content.textContent);
        }
        catch {
            text = '';
        }
        if (text === '' || !text.includes(expected))
            continue;
        let statusClass = '';
        try {
            statusClass = node.querySelector(arg.selectors.messageStatus)?.getAttribute('class') ?? '';
        }
        catch {
            statusClass = '';
        }
        states.push(statusClass.includes('error') ? 'failed' : statusClass.includes('loading') ? 'pending' : 'delivered');
    }
    if (states.length === 0)
        return { state: 'missing' };
    if (states.includes('delivered'))
        return { state: 'delivered' };
    if (states.includes('pending'))
        return { state: 'pending' };
    return { state: 'failed' };
}
/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export function chatRowMatchesInPage(arg) {
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const company = norm(arg.company);
    const expected = norm(arg.expectText);
    if (company === '' || expected === '')
        return false;
    let rows = [];
    try {
        rows = Array.from(document.querySelectorAll(arg.selectors.row));
    }
    catch {
        return false;
    }
    return rows.some((row) => {
        const text = norm(row.textContent);
        return text.includes(company) && text.includes(expected);
    });
}
//# sourceMappingURL=chat.js.map