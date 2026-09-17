#!/usr/bin/env node
/**
 * 构建 dsh-job-hunter。
 *
 * 两份产物，形状都由 DSH 的加载契约决定：
 *
 *   1) **宿主半** `lib/**` —— 普通 ESM，tsc 输出，对应 package.json 的 `exports["."]`
 *      与 `main`。带 .d.ts，供后续复用。
 *
 *   2) **客户端半** `client/client.js` —— **必须是 `__ModuleLoader__` 工厂**：
 *        window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *      `react` / `react/jsx-runtime` 由 shell 的 seed 提供，一律 external；
 *      factory 收到的 `require` 就是那张 seed 表 + 已装载的包模块。
 *
 * 与 ARCHITECTURE §3 的差异：文档写的是 tsdown。这里用 esbuild，理由是工厂外壳
 * 由 `wrapFactory()` 自己包（形状与官方客户端包逐字一致），打包器只需产出一份
 * 自包含 CJS —— 换成 tsdown 时只改这一段，外壳契约不变。
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const stage = join(root, '.build')
const clientOut = join(root, 'client', 'client.js')

/** 由 shell seed 提供的模块：绝不打进产物（C6）。 */
const SHELL_SEED = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

/** 直接调 node 跑 tsc，避开 npx / shell 的平台差异。 */
function tsc(args) {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), ...args], {
    cwd: root,
    stdio: 'inherit',
  })
}

function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n')
}

/**
 * 把一份自包含 CJS 包成 `__ModuleLoader__` 工厂。
 * 外壳形状与官方客户端包（如 `@deepseek-ai/dsh-client-hmr`）逐字一致。
 */
function wrapFactory(id, cjs) {
  return [
    '// dsh-job-hunter 客户端半 —— 构建产物，请勿手改（见 scripts/build.mjs）。',
    '// 契约：window.__ModuleLoader__.load({ id, factory })；react 由 shell seed 提供。',
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(id)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    indent(cjs.trimEnd(), '\t\t'),
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')
}

console.log('[build] 宿主半 → lib/ （tsc）')
rmSync(join(root, 'lib'), { recursive: true, force: true })
tsc(['-p', 'tsconfig.build.json'])

console.log('[build] 客户端半 → client/client.js （esbuild + 工厂外壳）')
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
mkdirSync(dirname(clientOut), { recursive: true })

const staged = join(stage, 'client.cjs')
await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  outfile: staged,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: SHELL_SEED,
  legalComments: 'none',
  logLevel: 'warning',
})

writeFileSync(clientOut, wrapFactory(manifest.name, readFileSync(staged, 'utf8')), 'utf8')
rmSync(stage, { recursive: true, force: true })

console.log('[build] 完成：lib/** + client/client.js')
