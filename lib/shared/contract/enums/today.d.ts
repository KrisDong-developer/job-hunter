/**
 * today 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 待办类型。降级告警必须主动产生待办（§4.2.4 降级语义 / B13）。 */
export declare const TODO_KINDS: readonly ["adapter-degraded", "adapter-broken", "yield-drop", "login-required", "blocked", "new-jobs", "catch-up", "confirm-action", "deadline"];
export type TodoKind = (typeof TODO_KINDS)[number];
/** 待办级别。 */
export declare const TODO_LEVELS: readonly ["info", "warn", "urgent"];
export type TodoLevel = (typeof TODO_LEVELS)[number];
/**
 * 待办级别与类别的中文标签。
 *
 * 与其它枚举同一个理由：`urgent` / `catch-up` 是**机器**读的键，
 * 界面上直接印出来等于没说（用户看到"urgent"还得猜这是多急）。
 * 待办正文（`title`）本来就是中文，这两个标签补的是级别徽章与类别那一行。
 */
export declare const TODO_LEVEL_LABEL: Record<TodoLevel, string>;
export declare const TODO_KIND_LABEL: Record<TodoKind, string>;
//# sourceMappingURL=today.d.ts.map