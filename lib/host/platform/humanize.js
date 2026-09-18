const defaultWait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
/**
 * 拟人点击：像素微调 → 三段式（move → press → release）。
 *
 * 事件序列（间隔为 BossHunter / get_jobs 实测值的折中）：
 *   1. move(x, y) → 50ms；
 *   2. move(x+2, y) → 50ms（向右探 2px）；
 *   3. move(x−2, y) → 50ms（向左探 2px）；
 *   4. move(x, y) → 60ms（回到目标）；
 *   5. down() → 80ms → up()。
 */
export async function humanClick(mouse, x, y, options = {}) {
    const wait = options.wait ?? defaultWait;
    await mouse.move(x, y);
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
/** 发送前停留时长（ms）：15–30s（BossHunter `browse_before_greet` 同款区间）。 */
export function dwellBeforeActMs(options = {}) {
    const random = options.random ?? Math.random;
    return Math.round(15_000 + random() * 15_000);
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
//# sourceMappingURL=humanize.js.map