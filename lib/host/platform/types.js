/**
 * 读一个平台特有维度的值。
 *
 * 存在的理由：适配器可能被两种方式构造 ——
 * 由 `criteriaToSearchCriteria`（走 `platform` 命名空间），或者由调用方直接拼一个
 * `SearchCriteria`（测试、脚本）。这个助手让两种来路读法一致，不必在每个调用点写两遍。
 */
export function platformCriterion(criteria, key) {
    const scoped = criteria.platform?.[key];
    if (scoped !== undefined && scoped !== '')
        return scoped;
    const loose = criteria[key];
    return typeof loose === 'string' ? loose : '';
}
/** 从适配器**派生**实现度 —— 手写必然与实际漂移。 */
export function adapterImplementationOf(adapter) {
    const actions = adapter.actions;
    return {
        crawl: true,
        detail: adapter.detail !== undefined,
        actions: {
            sayHello: actions?.sayHello !== undefined,
            sendResume: actions?.sendResume !== undefined,
            reply: actions?.reply !== undefined,
            readInbox: actions?.readInbox !== undefined,
            detectStage: actions?.detectStage !== undefined,
        },
        loginCheck: adapter.auth !== undefined,
    };
}
/**
 * 适配器**直接观察到**风控证据时抛这个。
 *
 * 抛它而不是抛普通 Error 的差别不在措辞，而在**后续动作**：
 *   * 采集链：`runCrawl` 不再记成 `PARSE_FAILED`，而是按风控处理（停手 + 平台级暂停）；
 *   * 动作链：`guard.run()` 会写平台级风控暂停，并把错误翻成用户看得懂的处置建议。
 *
 * 判据来源可以是 DOM（`guard.detectBlock`）、也可以是**接口返回码**
 * （waiqi 的 `code=429`、zhaopin 的 `code!==200`）—— 后者只能由适配器自己抛出来。
 */
export class PlatformBlockedError extends Error {
    kind;
    constructor(kind, detail) {
        super(detail === undefined ? `命中平台风控：${kind}` : `命中平台风控：${kind}（${detail}）`);
        this.name = 'PlatformBlockedError';
        this.kind = kind;
    }
}
/** 这个错误是不是"我看到风控了"；是的话风控类型是什么。 */
export function blockedKindOf(error) {
    return error instanceof PlatformBlockedError ? error.kind : null;
}
/**
 * 风控类型 → 采集失败码（`crawl_run.error_code`）。
 *
 * 与动作链**共用一份**：`rate-limited` / `captcha` / `blank` 统一收敛到 `BLOCKED`
 * 是既有口径（`RATE_LIMITED` / `RISK` 只在历史库里出现，见 `enums/error.ts`），
 * 这里不改动它 —— 只把映射从 `domain/crawl.ts` 挪到共享处，好让动作链用的也是同一份。
 */
export function blockFailureCode(kind) {
    if (kind === 'login-required')
        return 'NOT_LOGGED_IN';
    if (kind === 'quota-exhausted')
        return 'PLATFORM_QUOTA';
    return 'BLOCKED';
}
/** 风控类型 → 人话（界面与工具文本直接展示，不把 `quota-exhausted` 印给用户）。 */
export function blockLabel(kind) {
    switch (kind) {
        case 'captcha':
            return '验证码/人机验证';
        case 'login-required':
            return '登录墙';
        case 'rate-limited':
            return '访问频率受限';
        case 'quota-exhausted':
            return '平台侧当日额度耗尽';
        case 'blank':
            return '页面空白或被销毁';
        default:
            return kind;
    }
}
/**
 * **动作链上的判墙口径**：`blank` 不算风控。
 *
 * 为什么单独一条：`blank` 的判据是"0 卡片 + 文本很短"，那是**列表页**的语义
 * （`block-signals.ts` 里它本来就被放在最后，是最弱的一条）。在会话页/详情页上
 * 0 卡片是常态 —— 一个空收件箱（「30天内暂无联系人」）会当场被误判成 `blank`，
 * 于是每一轮同步都把整个平台暂停掉。
 *
 * 反过来，真正的"页面被销毁"由 `blankOnAboutProtocol` / `expectedHost` 这些
 * **结构性**判据表达（liepin / indeed），它们与 `blank` 同值但来源不同 ——
 * 那两处调用点自己判断，不走这里。
 */
export function actionBlockOf(kind) {
    return kind === 'blank' ? null : kind;
}
//# sourceMappingURL=types.js.map