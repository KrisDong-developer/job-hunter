#!/usr/bin/env node
/** 删除构建产物。 */
import { rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const dir of ['lib', 'client', '.build']) {
  rmSync(join(root, dir), { recursive: true, force: true })
  console.log(`[clean] 已删除 ${dir}/`)
}
