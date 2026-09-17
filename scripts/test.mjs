#!/usr/bin/env node
/**
 * 测试运行器。
 *
 * 用已有的 esbuild 把每个 `test/**\/*.test.ts` 打成一份自包含 ESM，再交给 Node 内置的
 * `node --test` 跑 —— **不引入 vitest / jest**：它们要拖进 vite 一整棵树，
 * 而本项目已经为了客户端打包装了 esbuild。
 *
 * `packages: 'external'` 保证 jsdom / node:sqlite 这类裸导入不被内联。
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testRoot = join(root, 'test')
const outRoot = join(root, '.test-build')

/** 递归收集测试入口。 */
function findTests(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      found.push(...findTests(full))
    } else if (name.endsWith('.test.ts')) {
      found.push(full)
    }
  }
  return found
}

const entries = findTests(testRoot)
if (entries.length === 0) {
  console.error('[test] 没找到任何 *.test.ts')
  process.exit(1)
}

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })

const outputs = []
for (const entry of entries) {
  const outfile = join(outRoot, relative(testRoot, entry).replace(/\.ts$/, '.mjs'))
  mkdirSync(dirname(outfile), { recursive: true })
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2023',
    packages: 'external',
    sourcemap: 'inline',
    logLevel: 'warning',
  })
  outputs.push(outfile)
}

console.log(`[test] 编译 ${outputs.length} 个测试文件 → .test-build/`)
// 夹具要跟着产物走：测试里用 import.meta.dirname 相对定位，产物目录下必须也有 fixtures/
const fixtures = join(testRoot, 'fixtures')
if (existsSync(fixtures)) {
  cpSync(fixtures, join(outRoot, 'fixtures'), { recursive: true })
}
execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...outputs], {
  cwd: root,
  stdio: 'inherit',
})
