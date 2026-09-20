import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dwellBeforeActMs,
  humanBrowse,
  humanClick,
  humanHover,
  humanMoveTo,
  humanPress,
  humanType,
  smoothScrollBy,
  type HumanKeyboard,
  type HumanMouse,
} from '../../src/host/platform/humanize.js'

class RecordingMouse implements HumanMouse {
  readonly moves: Array<[number, number]> = []
  readonly wheels: Array<[number, number]> = []
  downs = 0
  ups = 0
  /**
   * 与真实页面一致：**没有滚轮能力时这个属性根本不存在**（而不是"存在但会抛"）——
   * `humanBrowse` 就是靠这一点决定跳过的，夹具必须复刻这个形状。
   */
  wheel?: (deltaX: number, deltaY: number) => Promise<void>

  constructor(withWheel = false) {
    if (withWheel) {
      this.wheel = async (deltaX: number, deltaY: number): Promise<void> => {
        this.wheels.push([deltaX, deltaY])
      }
    }
  }

  async move(x: number, y: number): Promise<void> {
    this.moves.push([x, y])
  }

  async down(): Promise<void> {
    this.downs += 1
  }

  async up(): Promise<void> {
    this.ups += 1
  }
}

class RecordingKeyboard implements HumanKeyboard {
  readonly typed: string[] = []
  readonly pressed: string[] = []

  async press(key: string): Promise<void> {
    this.pressed.push(key)
  }

  async insertText(text: string): Promise<void> {
    this.typed.push(text)
  }
}

test('humanClick：折线移动 → ±2px 微调 → 三段式点击（最后四步一字未改）', async () => {
  const mouse = new RecordingMouse()
  const waits: number[] = []
  await humanClick(mouse, 100, 200, {
    random: () => 0,
    wait: async (ms) => void waits.push(ms),
  })

  // 轨迹是 3 段折线（random 恒 0 → 段数取下限），最后精确落在目标上
  assert.deepEqual(mouse.moves, [
    [85, 194],
    [91, 196],
    [100, 200],
    [102, 200],
    [98, 200],
    [100, 200],
  ])
  assert.equal(mouse.downs, 1)
  assert.equal(mouse.ups, 1)
  // 前 3 个是轨迹采样间隔，后 5 个是实测过的原序列
  assert.deepEqual(waits, [12, 12, 12, 50, 50, 50, 60, 80])
})

test('humanClick：轨迹段数落在 3–5 段、采样间隔 12–38ms（随机源下的边界）', async () => {
  for (let run = 0; run < 20; run += 1) {
    const mouse = new RecordingMouse()
    const waits: number[] = []
    await humanClick(mouse, 300, 400, { wait: async (ms) => void waits.push(ms) })

    // 3–5 段轨迹 + 三段式的后 3 次移动 = 6–8 次移动
    assert.ok(
      mouse.moves.length >= 6 && mouse.moves.length <= 8,
      `移动次数越界：${String(mouse.moves.length)}`,
    )
    const last = mouse.moves[mouse.moves.length - 1]
    assert.deepEqual(last, [300, 400], '最后一步必须精确落在目标上，否则点击会偏')
    // 后 3 次移动是 ±2px 微调之前的三段式序列，它们的间隔（50/60/80）不走轨迹口径
    const trackWaits = waits.slice(0, mouse.moves.length - 3)
    assert.equal(trackWaits.length, mouse.moves.length - 3)
    for (const ms of trackWaits) {
      assert.ok(ms >= 12 && ms <= 38, `轨迹采样间隔越界：${String(ms)}`)
    }
  }
})

test('humanMoveTo：只移动、不按下（给悬停用）', async () => {
  const mouse = new RecordingMouse()
  await humanMoveTo(mouse, 50, 60, { random: () => 0, wait: async () => undefined })
  assert.equal(mouse.downs, 0)
  assert.equal(mouse.ups, 0)
  assert.deepEqual(mouse.moves[mouse.moves.length - 1], [50, 60])
})

test('humanHover：移动到目标后**停留**一会儿（不打字、不点击）', async () => {
  const mouse = new RecordingMouse()
  const waits: number[] = []
  await humanHover(mouse, 80, 90, { random: () => 0, wait: async (ms) => void waits.push(ms) })

  assert.equal(mouse.downs, 0, '悬停不该按下鼠标')
  assert.deepEqual(mouse.moves[mouse.moves.length - 1], [80, 90])
  // 最后一段是"停在目标上"的耗时（150–500ms），random 恒 0 → 150
  assert.equal(waits[waits.length - 1], 150)
})

test('humanPress：按下前后各留一段停顿，键本身照按', async () => {
  const keyboard = new RecordingKeyboard()
  const waits: number[] = []
  await humanPress(keyboard, 'Enter', {
    random: () => 0,
    wait: async (ms) => void waits.push(ms),
  })

  assert.deepEqual(keyboard.pressed, ['Enter'])
  // random 恒 0 → 前 150ms、后 120ms（真人"打完看一眼再回车"）
  assert.deepEqual(waits, [150, 120])
})

test('humanPress：前后停顿区间可调（beforeMs / afterMs）', async () => {
  const keyboard = new RecordingKeyboard()
  const waits: number[] = []
  await humanPress(keyboard, 'Enter', {
    random: () => 0,
    beforeMs: [1_000, 2_000],
    afterMs: [10, 20],
    wait: async (ms) => void waits.push(ms),
  })
  assert.deepEqual(waits, [1_000, 10])
})

test('humanType：逐字符输入；普通字 25ms 起步，标点再加 70ms', async () => {
  const keyboard = new RecordingKeyboard()
  const waits: number[] = []
  // random() 恒 0 → 普通字符 delay = 25 + 0 = 25；标点 = 25 + 70 = 95
  await humanType(keyboard, '你好。ok!', {
    random: () => 0,
    wait: async (ms) => void waits.push(ms),
  })

  assert.deepEqual(keyboard.typed, ['你', '好', '。', 'o', 'k', '!'], '一次一个字符，绝不 fill')
  assert.deepEqual(waits, [25, 25, 95, 25, 25, 95])
})

test('humanType：每个字符的延时落在 25–70ms（标点 95–140ms）区间内', async () => {
  const keyboard = new RecordingKeyboard()
  const waits: number[] = []
  await humanType(keyboard, '前端开发，求职中', { wait: async (ms) => void waits.push(ms) })

  assert.equal(waits.length, keyboard.typed.length)
  for (const [index, char] of keyboard.typed.entries()) {
    const delay = waits[index]
    assert.ok(delay !== undefined)
    if ('。，!?;:\n'.includes(char)) {
      assert.ok(delay >= 95 && delay <= 140, `标点延时越界：${char} → ${String(delay)}`)
    } else {
      assert.ok(delay >= 25 && delay <= 70, `普通延时越界：${char} → ${String(delay)}`)
    }
  }
})

test('dwellBeforeActMs：落在 15–30s 区间', () => {
  for (let i = 0; i < 100; i += 1) {
    const ms = dwellBeforeActMs()
    assert.ok(ms >= 15_000 && ms <= 30_000, `越界：${String(ms)}`)
  }
  assert.equal(dwellBeforeActMs({ random: () => 0 }), 15_000)
  assert.ok(dwellBeforeActMs({ random: () => 0.9999 }) <= 30_000)
})

test('dwellBeforeActMs：区间可调（回复用 3–8s 那一档）', () => {
  assert.equal(dwellBeforeActMs({ random: () => 0, minMs: 3_000, maxMs: 8_000 }), 3_000)
  assert.equal(dwellBeforeActMs({ random: () => 0.9999, minMs: 3_000, maxMs: 8_000 }) <= 8_000, true)
  // `[0, 0]`（离线测试）必须是**真的关闭**，而不是退回默认的 15–30s
  assert.equal(dwellBeforeActMs({ minMs: 0, maxMs: 0 }), 0)
})

test('humanBrowse：滚轮 + 指针都动，且**只滚一小段**（滚到底会主动增加请求量）', async () => {
  const mouse = new RecordingMouse(true)
  const waits: number[] = []
  await humanBrowse(
    { mouse, waitForTimeout: async (ms) => void waits.push(ms) },
    { random: () => 0, wait: async (ms) => void waits.push(ms) },
  )

  assert.ok(mouse.wheels.length > 0, '必须有真实的滚轮事件（程序化 scrollTo 不产生 wheel）')
  const total = mouse.wheels.reduce((sum, [, dy]) => sum + dy, 0)
  assert.ok(total <= 640, `滚动距离越界：${String(total)}`)
  assert.ok(mouse.moves.length > 0, '必须有指针轨迹')
  assert.ok(waits.length > 0, '滚完要停一下（"看一眼"）')
})

test('humanBrowse：没有滚轮能力 → 直接跳过，绝不退回 DOM 滚动', async () => {
  const mouse = new RecordingMouse(false)
  await humanBrowse({ mouse, waitForTimeout: async () => undefined })
  assert.deepEqual(mouse.wheels, [])
  assert.deepEqual(mouse.moves, [], '没有滚轮就什么都不做（不换一种痕迹）')
})

test('smoothScrollBy：按步滚动，最后一步后不再等待', async () => {
  const deltas: number[] = []
  const waits: number[] = []
  await smoothScrollBy(async (dy) => void deltas.push(dy), 1_500, {
    random: () => 0,
    wait: async (ms) => void waits.push(ms),
  })

  assert.deepEqual(deltas, [600, 600, 300], '分步滚动，余数作最后一步')
  assert.deepEqual(waits, [800, 800], '步间等待，滚完不等多余的一次')
})
