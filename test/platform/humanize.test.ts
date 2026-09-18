import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dwellBeforeActMs,
  humanClick,
  humanType,
  smoothScrollBy,
  type HumanKeyboard,
  type HumanMouse,
} from '../../src/host/platform/humanize.js'

class RecordingMouse implements HumanMouse {
  readonly moves: Array<[number, number]> = []
  downs = 0
  ups = 0

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

test('humanClick：±2px 微调 + 三段式点击（move×4 → down → up）', async () => {
  const mouse = new RecordingMouse()
  const waits: number[] = []
  await humanClick(mouse, 100, 200, { wait: async (ms) => void waits.push(ms) })

  assert.deepEqual(mouse.moves, [
    [100, 200],
    [102, 200],
    [98, 200],
    [100, 200],
  ])
  assert.equal(mouse.downs, 1)
  assert.equal(mouse.ups, 1)
  assert.deepEqual(waits, [50, 50, 50, 60, 80])
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
