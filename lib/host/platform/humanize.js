const defaultWait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
/**
 * 落点附近的**进入点**：目标左上方一点。
 *
 * 为什么需要它：`mouse.move(x, y)` 一步到位，在页面上就是**一个** mousemove 事件 ——
 * 真人移动鼠标时，浏览器每秒会产生几十个。先落在附近再移向目标，至少构成一条折线。
 */
function approachPoint(x, y, random) {
    return {
        x: Math.max(1, Math.round(x - (18 + random() * 42))),
        y: Math.max(1, Math.round(y - (6 + random() * 20))),
    };
}
/**
 * 拟人移动：从进入点到目标走一条 **3–5 段的折线**，段间 12–38ms。
 *
 * 与 `humanClick` 的关系：点击 = 先移动到目标（本函数）+ ±2px 微调 + 三段式按下抬起。
 * 单独导出是为了让"只移动不点击"（悬停、浏览）也有同一条轨迹，而不是各写一份。
 */
export async function humanMoveTo(mouse, x, y, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? defaultWait;
    const from = approachPoint(x, y, random);
    const steps = 3 + Math.floor(random() * 3);
    for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps;
        const last = index === steps;
        // 最后一步**必须精确落在目标上**（否则点击会偏），中间几步带一点手抖。
        const jitterX = last ? 0 : Math.round((random() - 0.5) * 7);
        const jitterY = last ? 0 : Math.round((random() - 0.5) * 5);
        await mouse.move(Math.round(from.x + (x - from.x) * ratio) + jitterX, Math.round(from.y + (y - from.y) * ratio) + jitterY);
        await wait(12 + Math.floor(random() * 27));
    }
}
/**
 * 拟人悬停：移过去 + 在目标上停 150–500ms。
 *
 * 两个用途：
 *   * 有的站点**必须 hover 才亮出按钮**（猎聘的「聊一聊」实测如此）；
 *   * "动手之前先在目标上停一下"是真人最稳定的动作特征之一 —— 比点击本身更难伪装。
 */
export async function humanHover(mouse, x, y, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? defaultWait;
    await humanMoveTo(mouse, x, y, options);
    await wait(150 + Math.floor(random() * 350));
}
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
export async function humanClick(mouse, x, y, options = {}) {
    const wait = options.wait ?? defaultWait;
    await humanMoveTo(mouse, x, y, options);
    await wait(50);
    await mouse.move(x + 2, y);
    await wait(50);
    await mouse.move(x - 2, y);
    await wait(50);
    await mouse.move(x, y);
    await wait(60);
    await mouse.down();
    await wait(80);
    await mouse.up();
}
/** 中英文标点（打这些字时人会明显放慢）。 */
const PUNCTUATION = /[\u3002\uff0c\uff01\uff1f\uff1b\uff1a,.!?;:\n]/;
/**
 * 拟人逐字符输入。每个字符前先等 25–70ms（随机），标点再 +70ms。
 * 一次一个字符，绝不满屏 `fill` —— 瞬间出现的长文本是最明显的机器特征。
 */
export async function humanType(keyboard, text, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? defaultWait;
    for (const char of text) {
        const base = 25 + Math.floor(random() * 46);
        const delay = PUNCTUATION.test(char) ? base + 70 : base;
        await wait(delay);
        await keyboard.insertText(char);
    }
}
/**
 * 拟人按键：**按键前后各留一点时间**。
 *
 * 为什么需要它：一次 `press('Enter')` 本身就该是瞬时的（真人的一次按键也是），
 * 但"打完字 0ms 就回车"不是 —— 真人在这里会停一下（看一遍自己打的字、找发送键）。
 * 这个函数把那段停顿显式化，且**前后都要**：按下之前是"看一眼"，之后是"等它上屏"。
 */
export async function humanPress(keyboard, key, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? defaultWait;
    const [beforeMin, beforeMax] = options.beforeMs ?? [150, 600];
    const [afterMin, afterMax] = options.afterMs ?? [120, 480];
    await wait(beforeMin + Math.floor(random() * Math.max(0, beforeMax - beforeMin)));
    await keyboard.press(key);
    await wait(afterMin + Math.floor(random() * Math.max(0, afterMax - afterMin)));
}
/**
 * 发送/动手之前的停留时长（ms）。默认 15–30s（BossHunter `browse_before_greet` 同款区间）。
 *
 * `minMs` / `maxMs` 可调：会话里的**回复**用不着"打开页面看一刻钟"（那是首次打招呼的语义），
 * 给 3–8s 的"读完再回"即可 —— 但**绝不能是 0**（打完字立刻回车是纯机器节奏）。
 */
export function dwellBeforeActMs(options = {}) {
    const random = options.random ?? Math.random;
    const min = options.minMs ?? 15_000;
    const max = options.maxMs ?? 30_000;
    if (max <= min)
        return Math.max(0, min);
    return Math.round(min + random() * (max - min));
}
/**
 * 分步滚动。`scrollBy` 由调用方提供（真路径是 `page.mouse.wheel` 或
 * evaluate `window.scrollBy`；这里不绑定具体实现）。
 * 每步默认 600px、步间停 800–1600ms —— 一滚到底的大跳变不是人类行为。
 */
export async function smoothScrollBy(scrollBy, totalDeltaY, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? defaultWait;
    const stepPx = options.stepPx ?? 600;
    let remaining = totalDeltaY;
    while (remaining > 0) {
        const step = Math.min(stepPx, remaining);
        await scrollBy(step);
        remaining -= step;
        if (remaining > 0)
            await wait(800 + Math.round(random() * 800));
    }
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
export async function humanBrowse(page, options = {}) {
    const random = options.random ?? Math.random;
    const wait = options.wait ?? ((ms) => page.waitForTimeout(ms));
    const mouse = page.mouse;
    if (mouse === undefined)
        return;
    const wheel = mouse.wheel?.bind(mouse);
    if (wheel === undefined)
        return;
    const total = Math.round(120 + random() * Math.max(0, options.maxPx ?? 520));
    await smoothScrollBy((deltaY) => wheel(0, deltaY), total, {
        ...options,
        wait,
        stepPx: Math.round(160 + random() * 220),
    });
    await wait(300 + Math.floor(random() * 700));
    // 光标落在页面中部偏上的一块**安全区**（任何 ≥560×460 的视口都不可能越界），
    // 目的只是让这次访问留下真实的指针轨迹。
    await humanHover(mouse, 140 + Math.round(random() * 360), 180 + Math.round(random() * 260), {
        ...options,
        wait,
    });
}
//# sourceMappingURL=humanize.js.map