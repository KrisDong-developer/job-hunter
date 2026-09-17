#!/usr/bin/env node
/**
 * 跑一个 TS 入口：用 esbuild 打成自包含 ESM 再交给 node。
 *
 * 存在的理由：`lib/` 是给 DSH 加载器用的产物，而 `test/tools/*` 这类开发期脚本
 * 需要引用 jsdom 等 devDependency 与 TS 源码。复用手头已有的 esbuild，不引入 tsx/ts-node。
 *
 * 用法：node scripts/run-ts.mjs <entry.ts> [...args]
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [entry, ...rest] = process.argv.slice(2)
if (entry === undefined) {
  console.error('用法：node scripts/run-ts.mjs <entry.ts> [...args]')
  process.exit(2)
}

const entryPath = resolve(root, entry)
const outDir = join(root, '.test-build', 'tools')
mkdirSync(outDir, { recursive: true })
const outfile = join(outDir, 'run.mjs')

await build({
  entryPoints: [entryPath],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2023',
  packages: 'external',
  sourcemap: 'inline',
  logLevel: 'warning',
})

execFileSync(process.execPath, [outfile, ...rest], { cwd: root, stdio: 'inherit' })
