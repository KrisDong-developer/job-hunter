/**
 * `/health` 的版本号必须来自**包清单**，而不是那个静默退化值。
 *
 * 这条断言之所以值得有：读包清单那段代码有三种执行位置（`src/host/`、`lib/host/`、
 * 以及被 esbuild 打进的测试产物 `.test-build/host/`），深度各不相同；
 * 一旦路径算错，`readVersion` 会**静默**返回 `'0.0.0'`（catch 吞掉 ENOENT）——
 * 界面上是个假版本号，不报错、不影响启动。所以这里断言它等于清单里的真值。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createHostRuntime } from '../../src/host/runtime.js'
import { cleanup, tempDataDir } from '../support/store.js'

function manifestVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version?: unknown }
  assert.equal(typeof manifest.version, 'string', 'package.json 里应当有 version')
  return manifest.version as string
}

test('/health 的 version 是包清单里的真版本（不是 0.0.0 那个静默退化值）', () => {
  const expected = manifestVersion()
  // 清单自己写 0.0.0 的话这条断言就失去意义了 —— 先把它挡掉
  assert.notEqual(expected, '0.0.0')

  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    // 不用 await ready()：版本号是装配期就定下的，与数据层无关
    assert.equal(runtime.health().version, expected)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
