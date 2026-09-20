/**
 * BOSS 直聘的**会话页页面上下文函数**：工具条按钮状态、招呼语弹窗识别、消息送达判读、
 * 会话列表行交叉验证。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { ZhipinChatSelectors, ZhipinInboxSelectors } from '../config.js';
/**
 * **在页面上下文里**读一个工具条按钮的状态（能不能点、为什么不能）。
 *
 * 需要它是因为 2026-09-18 实测：BOSS 的工具条按钮**用 CSS 类 + aria-label 表达"当前不可用"** ——
 * 「发简历」带 `unable`、`aria-label="求简历：双方回复后可用"`；直接点它什么也不会发生，
 * 而"点了没反应"最容易被误读成"投递成功了"。这里把不可用**读出来**再决定。
 * ⚠️ 必须完全自包含。
 */
export declare function toolbarButtonStateInPage(arg: {
    selector: string;
    textIncludes: string;
    disabledClass: string;
}): {
    found: boolean;
    disabled: boolean;
    reason: string;
};
/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export declare function detectGreetPopupInPage(arg: {
    selectors: ZhipinChatSelectors;
}): {
    kind: 'preset' | 'startchat' | 'none';
};
/**
 * **在页面上下文里**读简历选择弹窗的状态（有没有可选简历、发送按钮能不能点）。
 *
 * 为什么需要它（2026-09-20 实测弹窗原文 `resume-dialog-2026-09-20.html`）：
 *   * 弹窗在**一条可选简历都没有**时照样会打开，渲染的是空态 `.resume-top-tip`
 *     （「未上传简历」＋一个 `.btn-upload`「去上传」）；
 *   * 确认按钮是 `<button class="btn-v2 btn-sure-v2 btn-confirm disabled" disabled>发送</button>`
 *     —— 未选中简历时它**带 `disabled` 类且带 `disabled` 属性**，点了什么都不会发生。
 * 不读这两件事，`sendResume` 就会把"弹窗还开着、其实什么都没发"讲成
 * 「已确认发送但没有出现简历卡片（pending）」—— 那是在说一件没发生的事。
 * ⚠️ 必须完全自包含。
 */
export declare function resumeDialogStateInPage(arg: {
    selectors: ZhipinChatSelectors;
}): {
    found: boolean;
    itemCount: number;
    confirmFound: boolean;
    confirmDisabled: boolean;
    emptyTip: string;
};
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
export declare function readChatMessagesInPage(arg: {
    selectors: ZhipinChatSelectors;
    expectText: string;
}): {
    state: 'delivered' | 'pending' | 'failed' | 'missing';
};
/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export declare function chatRowMatchesInPage(arg: {
    selectors: ZhipinInboxSelectors;
    company: string;
    expectText: string;
}): boolean;
//# sourceMappingURL=chat.d.ts.map