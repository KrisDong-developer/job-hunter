/**
 * 拟人输入层（P1 / D-17a）—— 给将来的 `actions.sayHello` / `actions.sendResume` 用。
 *
 * 现状：三个适配器的打招呼动作都 fail-closed（`ADAPTER_BROKEN`）。本模块是
 * 实现"怎么点 / 怎么输入"时的**唯一**输入通道，数值取自两个实战验证过的项目：
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
 * 为什么不走 DOM 事件（`el.click()` / `dispatchEvent`）：那些不产生
 * `Input` 域的 trusted 事件（`isTrusted=false`），是最廉价的自动化特征。
 * Playwright/patchright 的 `page.mouse` / `page.keyboard` 走 CDP `Input` 域，
 * 产生浏览器合成的 trusted 事件 —— 本模块只依赖两者的最小结构面，离线可测。
 */
import type { Random } from './pacing.js'

/** 鼠标的最小结构面（`page.mouse` 满足它）。 */
export interface HumanMouse {
  move(x: number, y: number): Promise<void>
  down(): Promise<void>
  up(): Promise<void>
}

/** 键盘的最小结构面（`page.keyboard` 满足它）。 */
export interface HumanKeyboard {
  /** 按一个功能键（'Enter' / 'Backspace' 等）。 */
  press(key: string): Promise<void>
  /** 以输入法提交的方式插入文本（一次一个字符）。 */
  insertText(text: string): Promise<void>
  /**
   * 可选：按住修饰键（Playwright `keyboard.down`）。
   *
   * 只为一件事存在：清空一个可能已有内容的输入框（`Ctrl/Cmd+A` → `Backspace`）。
   * 缺省时调用方**跳过清空**而不是改用 DOM 改写 —— 直接改 `innerHTML`
   * 绕过 Input 域，正是本模块要避免的那类痕迹。
   */
  down?(key: string): Promise<void>
  /** 可选：松开修饰键（与 `down` 成对）。 */
  up?(key: string): Promise<void>
}

export interface HumanizeOptions {
  /** 随机源（测试注入用；默认 `Math.random`）。 */
  random?: Random
  /** 等待函数（测试注入用；默认真实 setTimeout）。 */
  wait?: (ms: number) => Promise<void>
}

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

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
export async function humanClick(
  mouse: HumanMouse,
  x: number,
  y: number,
  options: HumanizeOptions = {},
): Promise<void> {
  const wait = options.wait ?? defaultWait
  await mouse.move(x, y)
  await wait(50)
  await mouse.move(x + 2, y)
  await wait(50)
  await mouse.move(x - 2, y)
  await wait(50)
  await mouse.move(x, y)
  await wait(60)
  await mouse.down()
  await wait(80)
  await mouse.up()
}

/** 中英文标点（打这些字时人会明显放慢）。 */
const PUNCTUATION = /[\u3002\uff0c\uff01\uff1f\uff1b\uff1a,.!?;:\n]/

/**
 * 拟人逐字符输入。每个字符前先等 25–70ms（随机），标点再 +70ms。
 * 一次一个字符，绝不满屏 `fill` —— 瞬间出现的长文本是最明显的机器特征。
 */
export async function humanType(
  keyboard: HumanKeyboard,
  text: string,
  options: HumanizeOptions = {},
): Promise<void> {
  const random = options.random ?? Math.random
  const wait = options.wait ?? defaultWait
  for (const char of text) {
    const base = 25 + Math.floor(random() * 46)
    const delay = PUNCTUATION.test(char) ? base + 70 : base
    await wait(delay)
    await keyboard.insertText(char)
  }
}

/** 发送前停留时长（ms）：15–30s（BossHunter `browse_before_greet` 同款区间）。 */
export function dwellBeforeActMs(options: { random?: Random } = {}): number {
  const random = options.random ?? Math.random
  return Math.round(15_000 + random() * 15_000)
}

/**
 * 分步滚动。`scrollBy` 由调用方提供（真路径是 `page.mouse.wheel` 或
 * evaluate `window.scrollBy`；这里不绑定具体实现）。
 * 每步默认 600px、步间停 800–1600ms —— 一滚到底的大跳变不是人类行为。
 */
export async function smoothScrollBy(
  scrollBy: (deltaY: number) => Promise<void>,
  totalDeltaY: number,
  options: HumanizeOptions & { stepPx?: number } = {},
): Promise<void> {
  const random = options.random ?? Math.random
  const wait = options.wait ?? defaultWait
  const stepPx = options.stepPx ?? 600
  let remaining = totalDeltaY
  while (remaining > 0) {
    const step = Math.min(stepPx, remaining)
    await scrollBy(step)
    remaining -= step
    if (remaining > 0) await wait(800 + Math.round(random() * 800))
  }
}
