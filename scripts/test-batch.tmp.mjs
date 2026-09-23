#!/usr/bin/env node
/**
 * 临时脚本：分批跑测试，排查哪个测试会弹真浏览器。用法：
 *   node scripts/test-batch.tmp.mjs host
 *   node scripts/test-batch.tmp.mjs scheduler store shared ai client tools
 * 逻辑与 scripts/test.mjs 一致，只是按目录前缀过滤；用完即删。
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
    if (statSync(full).isDirectory()) found.push(...findTests(full))
    else if (name.endsWith('.test.ts')) found.push(full)
  }
  return found
}

const prefixes = process.argv.slice(2)
if (prefixes.length === 0) {
  console.error('用法: node scripts/test-batch.tmp.mjs <目录前缀...>')
  process.exit(1)
}

const entries = findTests(testRoot).filter((full) => {
  const rel = relative(testRoot, full).replaceAll('\\', '/')
  return prefixes.some((prefix) => rel.startsWith(prefix))
})
if (entries.length === 0) {
  console.error(`[batch] 没有匹配 ${prefixes.join(' / ')} 的测试`)
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

console.log(`[batch] ${prefixes.join(' + ')}：${outputs.length} 个测试文件`)
// 夹具要跟着产物走（与 test.mjs 同一约定）
const fixtures = join(testRoot, 'fixtures')
if (existsSync(fixtures)) cpSync(fixtures, join(outRoot, 'fixtures'), { recursive: true })
execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...outputs], {
  cwd: root,
  stdio: 'inherit',
})
