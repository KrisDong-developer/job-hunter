/**
 * 拟人输入层（P1 / D-17a）—— 采集与高危动作**唯一**的输入通道。
 *
 * 数值取自两个实战验证过的项目：
 *
 *   * **三段式 CDP 点击**（`mouseMoved` → `mousePressed` → `mouseReleased`，
 *     间隔 60ms / 80ms）与**逐字符打字**（25–70ms/字符，标点再 +70ms）：
 *     BossHunter 在 BOSS 直聘上验证过；
 *   * **点击前 ±2px 像素微调**（中心 → +2 → −2 → 中心，每步 50ms）：
 *     get_jobs 在猎聘上验证过的反爬手段（其文档明确称之为反爬措施）；
 *   * **发送前停留**（15–30s）：BossHunter 的 `browse_before_greet` ——
 *     打开岗位页先"看一会儿"再动手；
 *   * **分步滚动**：一次 `scrollBy` 大跳变是非人类特征，分步 + 页间停顿。
 *
 * 在此之上补了三件事（2026-09-20），它们各自对应一类**无法用"节奏"掩盖**的痕迹：
 *   * `humanMoveTo` / `humanHover`：一次 `move(x,y)` 在页面上只有**一个**
 *     mousemove 事件，而真人每秒产生几十个 —— 折线轨迹 + 落点停留；
 *   * `humanPress`：按键本身该是瞬时的，但"打完字 0ms 就回车"不是；
 *   * `humanBrowse`：**只读页面也要留下真实的滚动与指针行为**（八个适配器
 *     原先一次输入事件都不产生）。
 *
 * 为什么不走 DOM 事件（`el.click()` / `dispatchEvent`）：那些不产生
 * `Input` 域的 trusted 事件（`isTrusted=false`），是最廉价的自动化特征。
 * Playwright/patchright 的 `page.mouse` / `page.keyboard` 走 CDP `Input` 域，
 * 产生浏览器合成的 trusted 事件 —— 本模块只依赖两者的最小结构面，离线可测。
 *
 * ⚠️ 一条贯穿本模块的纪律：**能力缺失时宁可不做，也不换一种痕迹**。
 * `mouse.wheel` / `keyboard.down` 缺省时调用方跳过对应步骤，绝不退回 DOM 模拟。
 */
import type { Random } from './pacing.js';
/** 鼠标的最小结构面（`page.mouse` 满足它）。 */
export interface HumanMouse {
    move(x: number, y: number): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
    /**
     * 可选：滚轮（Playwright `mouse.wheel(deltaX, deltaY)`）。
     *
     * 只为一件事存在：**滚动也要产生真实输入事件**。`window.scrollBy` 只产生 scroll 事件、
     * 没有 wheel 事件，而真人滚页面**先有轮子**。缺省时 `humanBrowse` **直接跳过滚动**，
     * 绝不退回 DOM 滚动 —— 与 `HumanKeyboard.down/up` 同一条纪律（宁可少做，不换一种痕迹）。
     */
    wheel?(deltaX: number, deltaY: number): Promise<void>;
}
/** 键盘的最小结构面（`page.keyboard` 满足它）。 */
export interface HumanKeyboard {
    /** 按一个功能键（'Enter' / 'Backspace' 等）。 */
    press(key: string): Promise<void>;
    /** 以输入法提交的方式插入文本（一次一个字符）。 */
    insertText(text: string): Promise<void>;
    /**
     * 可选：逐字符**真键盘**输入（keydown/keypress/input/keyup 全套事件，
     * Playwright `keyboard.type(text, { delay })`）。
     *
     * 为什么需要它：`insertText` 只发 input 事件，且**前提是焦点真的落在目标输入框上** ——
     * 猎聘 IM 的 textarea（2026-09-20 两次实验：第一次点击落在动画中的弹窗上、焦点没进
     * 输入框，`insertText` 全部落空；第二次焦点落定后 `insertText` 即正常上屏）。
     * 它是"输入路径校验失败时"的回退手段之一；缺省时调用方只能用 `insertText`，
     * 失败就如实报告（fail-closed），绝不退回 DOM 改写。
     */
    type?(text: string, options?: {
        delay?: number;
    }): Promise<void>;
    /**
     * 可选：按住修饰键（Playwright `keyboard.down`）。
     *
     * 只为一件事存在：清空一个可能已有内容的输入框（`Ctrl/Cmd+A` → `Backspace`）。
     * 缺省时调用方**跳过清空**而不是改用 DOM 改写 —— 直接改 `innerHTML`
     * 绕过 Input 域，正是本模块要避免的那类痕迹。
     */
    down?(key: string): Promise<void>;
    /** 可选：松开修饰键（与 `down` 成对）。 */
    up?(key: string): Promise<void>;
}
export interface HumanizeOptions {
    /** 随机源（测试注入用；默认 `Math.random`）。 */
    random?: Random;
    /** 等待函数（测试注入用；默认真实 setTimeout）。 */
    wait?: (ms: number) => Promise<void>;
}
/**
 * 拟人移动：从进入点到目标走一条 **3–5 段的折线**，段间 12–38ms。
 *
 * 与 `humanClick` 的关系：点击 = 先移动到目标（本函数）+ ±2px 微调 + 三段式按下抬起。
 * 单独导出是为了让"只移动不点击"（悬停、浏览）也有同一条轨迹，而不是各写一份。
 */
export declare function humanMoveTo(mouse: HumanMouse, x: number, y: number, options?: HumanizeOptions): Promise<void>;
/**
 * 拟人悬停：移过去 + 在目标上停 150–500ms。
 *
 * 两个用途：
 *   * 有的站点**必须 hover 才亮出按钮**（猎聘的「聊一聊」实测如此）；
 *   * "动手之前先在目标上停一下"是真人最稳定的动作特征之一 —— 比点击本身更难伪装。
 */
export declare function humanHover(mouse: HumanMouse, x: number, y: number, options?: HumanizeOptions): Promise<void>;
/**
 * 拟人点击：折线移动 → ±2px 微调 → 三段式（move → press → release）。
 *
 * 事件序列（间隔为 BossHunter / get_jobs 实测值的折中）：
 *   1. 折线移动到 (x, y)（3–5 段，段间 12–38ms）；
 *   2. move(x+2, y) → 50ms（向右探 2px）；
 *   3. move(x−2, y) → 50ms（向左探 2px）；
 *   4. move(x, y) → 60ms（回到目标）；
 *   5. down() → 80ms → up()。
 *
 * 第 2–5 步是 BossHunter / get_jobs 在生产环境验证过的原序列，一字未改；
 * 新增的只有第 1 步（把"凭空出现在目标上"换成一条轨迹）。
 */
export declare function humanClick(mouse: HumanMouse, x: number, y: number, options?: HumanizeOptions): Promise<void>;
/**
 * 拟人逐字符输入。每个字符前先等 25–70ms（随机），标点再 +70ms。
 * 一次一个字符，绝不满屏 `fill` —— 瞬间出现的长文本是最明显的机器特征。
 */
export declare function humanType(keyboard: HumanKeyboard, text: string, options?: HumanizeOptions): Promise<void>;
export interface HumanPressOptions extends HumanizeOptions {
    /** 按键之前的停顿区间（ms）。默认 [150, 600]。 */
    beforeMs?: [number, number];
    /** 按键之后的停顿区间（ms）。默认 [120, 480]。 */
    afterMs?: [number, number];
}
/**
 * 拟人按键：**按键前后各留一点时间**。
 *
 * 为什么需要它：一次 `press('Enter')` 本身就该是瞬时的（真人的一次按键也是），
 * 但"打完字 0ms 就回车"不是 —— 真人在这里会停一下（看一遍自己打的字、找发送键）。
 * 这个函数把那段停顿显式化，且**前后都要**：按下之前是"看一眼"，之后是"等它上屏"。
 */
export declare function humanPress(keyboard: HumanKeyboard, key: string, options?: HumanPressOptions): Promise<void>;
/**
 * 发送/动手之前的停留时长（ms）。默认 15–30s（BossHunter `browse_before_greet` 同款区间）。
 *
 * `minMs` / `maxMs` 可调：会话里的**回复**用不着"打开页面看一刻钟"（那是首次打招呼的语义），
 * 给 3–8s 的"读完再回"即可 —— 但**绝不能是 0**（打完字立刻回车是纯机器节奏）。
 */
export declare function dwellBeforeActMs(options?: {
    random?: Random;
    minMs?: number;
    maxMs?: number;
}): number;
/**
 * 分步滚动。`scrollBy` 由调用方提供（真路径是 `page.mouse.wheel` 或
 * evaluate `window.scrollBy`；这里不绑定具体实现）。
 * 每步默认 600px、步间停 800–1600ms —— 一滚到底的大跳变不是人类行为。
 */
export declare function smoothScrollBy(scrollBy: (deltaY: number) => Promise<void>, totalDeltaY: number, options?: HumanizeOptions & {
    stepPx?: number;
}): Promise<void>;
/** `humanBrowse` 要用的最小页面面（`PageLike` 满足它）。 */
export interface HumanBrowseSurface {
    mouse?: HumanMouse;
    waitForTimeout(ms: number): Promise<void>;
}
export interface HumanBrowseOptions extends HumanizeOptions {
    /** 这一段最多滚多少像素。默认 520（≈ 半屏到一屏，看平台排版）。 */
    maxPx?: number;
}
/**
 * 拟人"看一眼这一页"：滚一小段，然后把光标挪到页面中部停一下。
 *
 * ## 为什么必须做
 *
 * 采集链路上十个适配器里八个**只导航、不产生任何输入事件**：没有 mousemove、
 * 没有 wheel、没有 scroll。而"一次页面访问里指针一次都没动过"本身就是一个
 * 稳定、廉价、难以伪造的特征 —— 真人看列表一定会滚动。
 *
 * ## 为什么只滚一小段（不是滚到底）
 *
 * 滚动会触发懒加载：滚到底等于**主动增加对这个站点的请求量**，与节流的目的相反。
 * 这里要的只是"有过真实的滚动与指针行为"，所以距离刻意压在 120–640px。
 *
 * ## 没有滚轮能力时**直接返回**
 *
 * 不退回 `window.scrollBy`：那是换一种痕迹（只有 scroll 没有 wheel），
 * 而不是更少的痕迹。与 `HumanKeyboard.down/up` 缺省时跳过清空是同一条纪律。
 */
export declare function humanBrowse(page: HumanBrowseSurface, options?: HumanBrowseOptions): Promise<void>;
//# sourceMappingURL=humanize.d.ts.map