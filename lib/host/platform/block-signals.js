/**
 * 平台无关的通用信号。
 *
 * 只放**确实跨平台成立**的：验证码组件的常见选择器、中文招聘站通用的限流/配额文案。
 * 不确定的不要往这里加 —— 一个平台专属的文案放进来，会让别的平台误判。
 */
export const COMMON_SIGNALS = {
    /** 验证码/滑块组件的常见 DOM 特征（geetest / 通用 captcha 容器）。 */
    captchaSelectors: [
        '.geetest_panel',
        '.geetest_holder',
        'iframe[src*="captcha"]',
        '#captcha',
        '[class*="verify-wrap"]',
        '[class*="slide-verify"]',
    ],
    /** 限流/风控拦截文案（"访问过于频繁"这一类）。 */
    rateText: ['访问过于频繁', '操作频繁', '请稍后再试', '访问受限', '请求异常', '安全验证', '异常流量'],
    /**
     * **验证码/人机验证的文案**（与上面的 DOM 选择器互补）。
     *
     * 通用词表里目前是**空的**，而这不是遗漏：各家说法完全不同
     * （Indeed 是「需要进行其他验证」+ 英文 `Ray ID`，国内平台基本靠 DOM 组件识别）。
     * 留这个空槽是为了让"验证码文案"在各平台有**同一个位置**声明 ——
     * 否则每家都会把它塞进 `rateText` 或另起一个只有自己懂的字段。
     */
    captchaText: [],
    /**
     * 平台侧当日动作额度用尽的文案。
     * 用「休息一下」而不是各家完整句子：BOSS 说「休息一下明天再来」、
     * 猎聘说「休息一下明天再来」、拉勾只说「达到上限」——
     * 取共同的最短片段，比给每家各写一条完整句子更不容易漏。
     */
    quotaText: ['今日投递太多', '休息一下', '达到上限', '次数过多'],
    /** 登录墙文案。**必须配合"卡片数为 0 + 文本很短"**才判，否则正文里出现这几个词就误判。 */
    loginText: ['扫码登录', '手机号登录', '请先登录', '登录后查看'],
};
/** 页面文本短于此长度且**一条卡片都没有** → 判 `blank`。 */
export const BLANK_TEXT_LENGTH = 120;
/** 登录墙还要求整页文本短于此长度（避免在长页面里误判）。 */
export const LOGIN_WALL_TEXT_LENGTH = 800;
/**
 * 组装信号集：**通用 ∪ 平台特有**。
 *
 * 为什么是并集而不是让平台整份覆盖：平台特有文案是"额外的证据"，
 * 不是"换一套判据"。覆盖式很容易在某次改动里把通用词表悄悄丢掉，
 * 而那正是这个模块要消灭的那类问题。
 */
export function signalsOf(extra = {}) {
    return {
        urlPatterns: [...(extra.urlPatterns ?? [])],
        captchaSelectors: [...COMMON_SIGNALS.captchaSelectors, ...(extra.captchaSelectors ?? [])],
        captchaText: [...COMMON_SIGNALS.captchaText, ...(extra.captchaText ?? [])],
        rateText: [...COMMON_SIGNALS.rateText, ...(extra.rateText ?? [])],
        quotaText: [...COMMON_SIGNALS.quotaText, ...(extra.quotaText ?? [])],
        loginText: [...COMMON_SIGNALS.loginText, ...(extra.loginText ?? [])],
        blankTextLength: extra.blankTextLength ?? BLANK_TEXT_LENGTH,
        loginTextLength: extra.loginTextLength ?? LOGIN_WALL_TEXT_LENGTH,
    };
}
/**
 * **在页面上下文里**判墙。
 *
 * ⚠️ 这个函数会被 `page.evaluate(detectBlockWithSignals, arg)` 序列化，所以它
 * **只能引用 `arg`** —— 不能调本模块里的任何函数（哪怕是个纯工具函数也会
 * 在页面里变成 undefined）、不能引用任何模块级常量。判断顺序也固定：
 *
 *   ① about: 协议（页面被销毁）→ ② URL 特征 → ③ 验证码 DOM → ④ 限流
 *   → ⑤ 配额 → ⑥ 登录墙 → ⑦ blank
 *
 * 顺序有讲究：越"确定"的越先判。`blank` 放最后，因为它是**最弱**的判据 ——
 * 一个还没渲染完的正常页面也长这样，先判它会把"加载中"误报成"页面空白"。
 *
 * 平台特有的部分（host 校验、载荷错误码）不在这里 —— 由适配器自己在外面判完再进这里。
 */
export function detectBlockWithSignals(arg) {
    const signals = arg.signals;
    const flags = arg.flags;
    // ① 页面被风控销毁（about:blank）—— 最确定，放最前
    if (flags?.blankOnAboutProtocol === true && location.protocol === 'about:')
        return 'blank';
    // ①' 被重定向到别的域（站点把我们挪走了）—— 同样是地址级事实
    if (flags?.expectedHost !== undefined && flags.expectedHost !== '') {
        let hostname = '';
        try {
            hostname = location.hostname;
        }
        catch {
            hostname = '';
        }
        if (hostname !== '' && hostname !== flags.expectedHost)
            return 'blank';
    }
    // ② URL 特征：滑块/验证页直接改地址，也是最确定的证据
    for (const pattern of signals.urlPatterns) {
        try {
            if (new RegExp(pattern).test(location.href))
                return 'captcha';
        }
        catch {
            // 正则非法就跳过这一条 —— 不能让它把整条判墙打掉（fail-open 但只影响这一条）
        }
    }
    const body = document.body;
    const text = body === null ? '' : String(body.textContent ?? '');
    const compact = text.replace(/\s+/g, '');
    let cards = 0;
    try {
        cards = document.querySelectorAll(arg.card).length;
        if (cards === 0 && arg.cardBox !== undefined) {
            cards = document.querySelectorAll(arg.cardBox).length;
        }
    }
    catch {
        cards = 0;
    }
    // ③ 验证码 DOM（选择器可能非法，逐个 try）
    for (const selector of signals.captchaSelectors) {
        try {
            if (document.querySelector(selector) !== null)
                return 'captcha';
        }
        catch {
            // 同上：单个选择器非法不影响其它判据
        }
    }
    // ④ 验证码**文案**（与 ③ 的 DOM 选择器互补：有的平台只给文字不给组件）
    //    必须排在限流之前：Indeed 的「安全验证」两边都能对上，但它是验证码而不是限流。
    for (const word of signals.captchaText) {
        if (compact.includes(word))
            return 'captcha';
    }
    // ⑤ 限流文案
    for (const word of signals.rateText) {
        if (compact.includes(word))
            return 'rate-limited';
    }
    // ⑥ 平台侧配额用尽
    for (const word of signals.quotaText) {
        if (compact.includes(word))
            return 'quota-exhausted';
    }
    // ⑦ 登录墙：**必须同时满足**"没有卡片 + 出现登录文案 + 文本很短"
    if (flags?.skipLoginWall !== true && cards === 0 && compact.length < signals.loginTextLength) {
        for (const word of signals.loginText) {
            if (compact.includes(word))
                return 'login-required';
        }
    }
    // ⑧ 空白页：最弱判据，放最后
    if (cards === 0 && compact.length < signals.blankTextLength)
        return 'blank';
    return null;
}
/**
 * 从**接口失败**的返回里判读风控类型（平台无关的那一半）。
 *
 * ## 为什么需要它
 *
 * 明确返回码（waiqi 的 `1022` / `429`、zhaopin 的 `code≠200`）各平台自己在适配器里认 ——
 * 码表是平台事实。但"返回文本里写着『请先登录』/『访问过于频繁』"这一类**没有码表**
 * 的情况各平台完全一样，不该每家写一份正则（写十份就会有九份慢慢漂移）。
 *
 * 接口型平台还有一层时序问题：判墙（`detectBlock`）跑在请求**之前**，
 * 所以请求的失败只能由适配器在拿到应答时**抛出去**（`PlatformBlockedError`），
 * 再由主链/闸门按风控处置 —— 这个函数就是那一步的判读口径。
 *
 * 认不出来返回 `null`：**不猜**。把一次普通的接口失败说成"你被风控了"，
 * 会把用户引向错误的处置（去重新登录、去等，而真实原因是服务端改了字段名）。
 */
export function blockFromApiFailure(input) {
    const message = input.message;
    if (/登录|login/i.test(message))
        return 'login-required';
    if (input.code === 429 || /频繁|限流|限制|稍后再试|过于频繁/.test(message))
        return 'rate-limited';
    if (/额度|次数过多|达到上限/.test(message))
        return 'quota-exhausted';
    return null;
}
//# sourceMappingURL=block-signals.js.map