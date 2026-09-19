/**
 * message 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 消息方向（§11.3 `message.direction`）。 */
export declare const MESSAGE_DIRECTIONS: readonly ["hr", "me"];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
/** 消息中心的回复拟稿情境（卡片快捷键的同一份说法）。 */
export declare const REPLY_SCENARIOS: readonly [{
    readonly key: "negotiate-time";
    readonly label: "协商面试时间";
}, {
    readonly key: "salary";
    readonly label: "询问薪资结构";
}, {
    readonly key: "decline";
    readonly label: "婉拒邀约";
}];
export type ReplyScenario = (typeof REPLY_SCENARIOS)[number]['key'];
export declare const REPLY_SCENARIO_LABEL: Record<ReplyScenario, string>;
//# sourceMappingURL=message.d.ts.map