/**
 * 判墙信号的**平台无关词表**（批次 6）。
 *
 * ## 它解决的是什么
 *
 * 10 个适配器各自重写了一遍同一套东西：验证码选择器、限流文案、
 * 配额文案、登录墙判据、`blank` 阈值。**这已经从"风格问题"变成"正确性问题"**：
 * `quota-exhausted` 在 indeed / guopin 上缺失、`login-required` 在 liepin / indeed
 * 上故意不判 —— 这些遗漏散在 10 份独立实现里，没人能一眼看出谁漏了什么。
 *
 * 集中之后，"遗漏"变成**显式声明**：没写的平台就是没写，而不是"忘了写"。
 *
 * ## 为什么是"数据 + 自包含函数"，不是普通模块导出
 *
 * 这些判据要**在页面上下文里跑**（`page.evaluate(fn, arg)`），而 `evaluate` 会
 * **序列化函数的源码**：页面里没有这个模块，函数体里任何"引用本模块的东西"
 * 都会变成 `X is not defined`。
 *
 * 所以有两条硬约束，`test/platform/block-signals.test.ts` 会钉住它们：
 *
 *   1. `detectBlockWithSignals` **只引用自己的参数**（连本模块里的小工具函数
 *      都不能调 —— 那是这个仓库踩过的坑）；
 *   2. 传进去的 `signals` 必须是**纯数据**（字符串/数字/数组），能 JSON 往返。
 *
 * 平台特有的判据（indeed 的 host 校验、sinojobs 的卡片数、waiqi 的载荷错误码）
 * 不塞进来 —— 它们各自留在自己的适配器里，只把**通用的那一半**领走。
 */
import type { BlockKind } from '../../shared/enums.js';
/**
 * 平台无关的通用信号。
 *
 * 只放**确实跨平台成立**的：验证码组件的常见选择器、中文招聘站通用的限流/配额文案。
 * 不确定的不要往这里加 —— 一个平台专属的文案放进来，会让别的平台误判。
 */
export declare const COMMON_SIGNALS: {
    /** 验证码/滑块组件的常见 DOM 特征（geetest / 通用 captcha 容器）。 */
    readonly captchaSelectors: readonly [".geetest_panel", ".geetest_holder", "iframe[src*=\"captcha\"]", "#captcha", "[class*=\"verify-wrap\"]", "[class*=\"slide-verify\"]"];
    /** 限流/风控拦截文案（"访问过于频繁"这一类）。 */
    readonly rateText: readonly ["访问过于频繁", "操作频繁", "请稍后再试", "访问受限", "请求异常", "安全验证", "异常流量"];
    /**
     * **验证码/人机验证的文案**（与上面的 DOM 选择器互补）。
     *
     * 通用词表里目前是**空的**，而这不是遗漏：各家说法完全不同
     * （Indeed 是「需要进行其他验证」+ 英文 `Ray ID`，国内平台基本靠 DOM 组件识别）。
     * 留这个空槽是为了让"验证码文案"在各平台有**同一个位置**声明 ——
     * 否则每家都会把它塞进 `rateText` 或另起一个只有自己懂的字段。
     */
    readonly captchaText: readonly [];
    /**
     * 平台侧当日动作额度用尽的文案。
     * 用「休息一下」而不是各家完整句子：BOSS 说「休息一下明天再来」、
     * 猎聘说「休息一下明天再来」、拉勾只说「达到上限」——
     * 取共同的最短片段，比给每家各写一条完整句子更不容易漏。
     */
    readonly quotaText: readonly ["今日投递太多", "休息一下", "达到上限", "次数过多"];
    /** 登录墙文案。**必须配合"卡片数为 0 + 文本很短"**才判，否则正文里出现这几个词就误判。 */
    readonly loginText: readonly ["扫码登录", "手机号登录", "请先登录", "登录后查看"];
};
/** 页面文本短于此长度且**一条卡片都没有** → 判 `blank`。 */
export declare const BLANK_TEXT_LENGTH = 120;
/** 登录墙还要求整页文本短于此长度（避免在长页面里误判）。 */
export declare const LOGIN_WALL_TEXT_LENGTH = 800;
/** 一份完整的信号集。**纯数据**（会进 `evaluate` 的 arg，必须能 JSON 往返）。 */
export interface BlockSignalSet {
    /** 判墙用的 **URL 正则源码串**（平台特有，如 BOSS 的滑块页路径）。 */
    urlPatterns: string[];
    captchaSelectors: string[];
    captchaText: string[];
    rateText: string[];
    quotaText: string[];
    loginText: string[];
    blankTextLength: number;
    loginTextLength: number;
}
/** 平台特有信号（与通用词表**并集**，不是替换）。 */
export interface BlockSignalExtra {
    urlPatterns?: readonly string[];
    captchaSelectors?: readonly string[];
    captchaText?: readonly string[];
    rateText?: readonly string[];
    quotaText?: readonly string[];
    loginText?: readonly string[];
    blankTextLength?: number;
    loginTextLength?: number;
}
/**
 * 组装信号集：**通用 ∪ 平台特有**。
 *
 * 为什么是并集而不是让平台整份覆盖：平台特有文案是"额外的证据"，
 * 不是"换一套判据"。覆盖式很容易在某次改动里把通用词表悄悄丢掉，
 * 而那正是这个模块要消灭的那类问题。
 */
export declare function signalsOf(extra?: BlockSignalExtra): BlockSignalSet;
/**
 * 结构性判据的开关（不是文案、不是选择器，所以只能是开关）。
 *
 * 存在的理由：平台之间不只有"多加几个词"的差异，还有**判断方式本身**的差异，
 * 以及**故意不判**的决定。这些都必须能表达出来 —— 否则适配器为了保住自己的行为，
 * 只能退回各写一份，"共享表"就白做了。
 */
export interface BlockFlags {
    /**
     * `location.protocol === 'about:'` → 判 `blank`。
     *
     * 有些平台的风控处置是**把页面销毁**（猎聘的 `security.min.js` 会
     * `location.replace('about:blank')`）—— 那既不是文案也不是 DOM 特征。
     */
    blankOnAboutProtocol?: boolean;
    /**
     * 当前 host **与预期不符** → 判 `blank`。
     *
     * Indeed 中国站停运的实际表现就是被 302 送到别的域（`cn.indeed.com` → `www.indeed.com`）。
     * "我们要的那个站把我们挪走了"既不是文案也不是 DOM 特征 —— 它是**地址级**的事实。
     */
    expectedHost?: string;
    /**
     * **不判登录墙**。
     *
     * 有的平台我们**没有**登录墙的实测文案（猎聘明确记着"尚无实测证据，不判"）。
     * 让它拿通用词表去猜，会把"搜到 0 条"误报成"需要登录"，把用户引到错误方向。
     * 所以给一个**显式退出开关** —— **不判也是一种决定，要写出来**，
     * 而不是靠"通用表里恰好没有它要的词"。
     */
    skipLoginWall?: boolean;
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
export declare function detectBlockWithSignals(arg: {
    signals: BlockSignalSet;
    /** 卡片选择器：用来判断"一条都没解析出来"。 */
    card: string;
    /** 额外要一起数的卡片容器（有些平台的列表分两层）。 */
    cardBox?: string;
    /** 结构性判据的开关，见 `BlockFlags`。 */
    flags?: BlockFlags;
}): BlockKind | null;
//# sourceMappingURL=block-signals.d.ts.map