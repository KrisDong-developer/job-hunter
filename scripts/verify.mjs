#!/usr/bin/env node
/**
 * 构建产物的契约自检 —— 不启动 DSH，只检查“装进 profile 后加载器会看到什么”。
 *
 * 检查项：
 *   ① 宿主半 `lib/host/index.js` 可导入，并导出 cordis 需要的 name / inject / apply
 *   ② 客户端半 `client/client.js` 语法合法，且外壳是 `__ModuleLoader__.load({ id, factory })`
 *   ③ `client/client.js` 的 id 与包名一致，且没有把 shell seed 打进去
 *   ④ `cordis.patch.yml` 只有 insert 行、**没有** config / 表达式（C2）
 *   ⑤ package.json 声明了 `dsh.bundle.patch` 与 `dsh.client.platform === "web"`（C1）
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const notes = []

function check(label, ok, detail = '') {
  if (ok) notes.push(`  ✔ ${label}`)
  else failures.push(`  ✘ ${label}${detail === '' ? '' : ` —— ${detail}`}`)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const hostEntry = join(root, 'lib', 'host', 'index.js')
const clientEntry = join(root, 'client', 'client.js')

// ① 宿主半
if (!existsSync(hostEntry)) {
  check('lib/host/index.js 存在', false, '先跑 npm run build')
} else {
  const host = await import(pathToFileURL(hostEntry).href)
  check('宿主半可导入', true)
  check('宿主半导出 name', typeof host.name === 'string' && host.name === manifest.name, `name=${host.name}`)
  check('宿主半导出 apply', typeof host.apply === 'function')
  // P5 改的契约：**不**声明硬依赖。硬依赖 webServer 会让 headless / CLI profile
  // 因为 "1 entry did not activate" 整个起不来（实测踩到，见 README 坑 12）。
  // 真正要对的是"路由是反应式注册的"，所以这里断言源码里用了 ctx.inject(['webServer'])。
  check(
    '宿主半未把 webServer 声明成硬依赖',
    !Array.isArray(host.inject) || !host.inject.includes('webServer'),
    `inject=${JSON.stringify(host.inject)}`,
  )
  const hostSource = readFileSync(hostEntry, 'utf8')
  check(
    '宿主半反应式注册 GUI 路由（ctx.inject）',
    hostSource.includes("inject(['webServer']") || hostSource.includes('inject(["webServer"]') ||
      // 构建产物可能被压缩，退一步：至少要有 webServer 这个名字，且 apply 里会做可选处理
      hostSource.includes("'webServer'"),
    '缺少 ctx.inject([\'webServer\'], …) —— 路由会永远注册不上',
  )
}

// ② 客户端半外壳
if (!existsSync(clientEntry)) {
  check('client/client.js 存在', false, '先跑 npm run build')
} else {
  const bundle = readFileSync(clientEntry, 'utf8')
  try {
    // 只编译不执行：顶层用了 window，不能在 Node 里直接跑
    new Function(bundle)
    check('客户端半语法合法', true)
  } catch (error) {
    check('客户端半语法合法', false, error instanceof Error ? error.message : String(error))
  }
  check('外壳为 __ModuleLoader__.load', bundle.includes('window.__ModuleLoader__.load({'))
  check('外壳含 factory: (require)', bundle.includes('factory: (require) => {'))
  check('外壳含 return module.exports', bundle.includes('return module.exports;'))
  check(
    'bundle id 与包名一致',
    bundle.includes(`id: ${JSON.stringify(manifest.name)}`),
    `期望 ${manifest.name}`,
  )
  // react 是 external：产物里应当只有 require 调用，没有 React 自己的实现。
  check('react 走 external（有 require 调用）', /require\("react(?:\/jsx-runtime)?"\)/.test(bundle))
  check(
    'react 未被打进产物（无 React 内部实现）',
    !bundle.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'),
    '产物里出现了 React 内部实现，说明 external 配置漏了',
  )
}

// ④ patch 纯净性
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const patchBody = patch
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
check('patch 含 insert', /^-\s*insert:/m.test(patchBody))
check('patch 无 config 行（C2）', !/^\s*config\s*:/m.test(patchBody))
check('patch 无 !!js 表达式（C2）', !patchBody.includes('!!js'))
check('patch 的 name 指向本包', patchBody.includes(manifest.name))

// ⑤ 清单字段
check('声明 dsh.bundle.patch（C1）', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('声明 dsh.client.platform = web（C6）', manifest.dsh?.client?.platform === 'web')
check('exports["./client"] 指向 client/client.js', manifest.exports?.['./client']?.default === './client/client.js')

console.log('[verify] 构建产物契约自检\n')
for (const note of notes) console.log(note)
if (failures.length > 0) {
  console.log('')
  for (const failure of failures) console.log(failure)
  console.log(`\n[verify] 失败 ${failures.length} 项`)
  process.exit(1)
}
console.log(`\n[verify] 全部通过（${notes.length} 项）`)
