/**
 * today 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 待办类型。降级告警必须主动产生待办（§4.2.4 降级语义 / B13）。 */
export const TODO_KINDS = [
    'adapter-degraded',
    'adapter-broken',
    /**
     * 批次 5：**量级骤降**（`found` 掉到该平台历史常态的三成以下）。
     *
     * 与 `adapter-degraded` 的区别：后者是"某个字段整页解析不出来"（逐字段计数），
     * 这条是"字段都好好的、条目数却掉了一个数量级"。两者成因与修法都不同，
     * 合成一类会让"先去查什么"失去指向。
     */
    'yield-drop',
    'login-required',
    'blocked',
    'new-jobs',
    'catch-up',
    /** §4.4.2：审批超时/无人响应时，把这次动作转成"待确认"，不静默丢弃。 */
    'confirm-action',
    /**
     * P8：**不可逆硬截止**（校招笔试截止 / 网申截止 / 三方签署）。
     *
     * 单独一类而不是复用 `new-jobs`：这类节点错过就是终态，
     * 待办列表必须能把它们挑出来当 urgent 显示（§12.7 / 决策记录第 3 条）。
     */
    'deadline',
];
/** 待办级别。 */
export const TODO_LEVELS = ['info', 'warn', 'urgent'];
/**
 * 待办级别与类别的中文标签。
 *
 * 与其它枚举同一个理由：`urgent` / `catch-up` 是**机器**读的键，
 * 界面上直接印出来等于没说（用户看到"urgent"还得猜这是多急）。
 * 待办正文（`title`）本来就是中文，这两个标签补的是级别徽章与类别那一行。
 */
export const TODO_LEVEL_LABEL = {
    info: '提示',
    warn: '提醒',
    urgent: '紧急',
};
export const TODO_KIND_LABEL = {
    'adapter-degraded': '适配器降级',
    'adapter-broken': '适配器失效',
    'yield-drop': '量级骤降',
    'login-required': '需要登录',
    blocked: '风控暂停',
    'new-jobs': '新岗位',
    'catch-up': '补抓欠账',
    'confirm-action': '待确认动作',
    deadline: '硬截止',
};
//# sourceMappingURL=today.js.map