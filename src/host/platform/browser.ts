/**
 * 浏览器生命周期（§4.2.1）。
 *
 * 关键决策：
 *   * **引擎可切换（D-17a 环境一致性）**：默认 `auto` —— 优先 `patchright`
 *     （playwright-core 的反检测分支，隐藏 CDP 自动化痕迹），装不上再退
 *     `playwright-core`。两者都只是"启动同一个真实 Chrome 的客户端"，
 *     不伪造任何身份信号；显式指定时不做静默回退；
 *   * **持久化 profile**：复用用户手动登录一次之后的登录态；
 *   * **进程内单例**：Chromium 本身是独立 OS 进程，playwright 客户端很轻，省掉 IPC（ADR-5）；
 *   * **幂等**：profile 是 `patchReload: live`，dispose → apply 会反复发生，
 *     `ensure()` 必须能重复调用而不产生第二个实例（C15 / R19）；
 *   * **孤儿清理**：宿主被强杀会留下 Chromium 子进程与「幽灵锁」，下次直接起不来 ——
 *     所以启动时先清残留锁；
 *   * **每页加固**：stealth 注入（`stealth.ts`，context 级 addInitScript）+
 *     调试端口守卫（`cdp-guard.ts`，仅当启动参数真的开了 TCP 调试端口时）。
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { nativeTimerPort, type TimerPort } from '../scheduler/timer-port.js'
import { installPortGuard, type CdpSessionLike } from './cdp-guard.js'
import { createIdleCloser } from './idle-close.js'
import { STEALTH_INIT_SCRIPT } from './stealth.js'
import type { PageLike, PageResponseLike, PageSource } from './types.js'

/** 浏览器引擎（D-17a）。`auto` = 优先 patchright，装不上退 playwright-core。 */
export type BrowserEngine = 'auto' | 'patchright' | 'playwright-core'

/** 启动配置。 */
export interface BrowserConfig {
  /** 显式指定浏览器可执行文件；不填则按发现顺序兜底。 */
  executablePath?: string
  headless?: boolean
  locale?: string
  timezoneId?: string
  args?: string[]
  /** 引擎偏好（D-17a）。默认 `auto`。 */
  engine?: BrowserEngine
  /** 是否注入 stealth 脚本（D-17a）。默认 `true`；某站点被误伤时可关。 */
  stealthInit?: boolean
}

/** 与本包交互所需的最小页面面。 */
export interface BrowserPage extends PageLike {
  bringToFront(): Promise<void>
  close(): Promise<void>
  isClosed(): boolean
}

/* ── 页面池（跨平台并发的地基）────────────────────────────────────────
   旧实现两行代码（"复用第一个没关的页" / "多于一页就关掉多余的那页"）在
   串行世界里没问题，在并发世界里是两个 bug：
     * 并发 acquire 会拿到**同一页**，互相把对方正在解析的页面导航走；
     * 并发 release 会把**别人正在用的页**当成"多出来的那页"关掉。
   池的规则：
     * 借出中的页（checkedOut）绝不再借、绝不被 release 关掉；
     * 归还的页进空闲表，空闲表**最多留 1 页**（多了就地关闭）——
       串行行为与旧实现一致（一页反复复用），并发时 tab 数收敛在
       「并发数 + 1」附近，不会越积越多；
     * 空闲表里已死的页（被用户手关）直接跳过。
   抽成纯逻辑（注入 newPage / 初始空闲页）是为了离线单测 ——
   这类"谁拿到了哪一页、谁关了谁的页"恰恰是最需要钉住的行为。 */

/** 池对页面的最小要求（测试可以注入假页）。 */
export interface PoolPage {
  isClosed(): boolean
  close(): Promise<unknown>
}

export interface PagePool {
  /** 拿一页：优先复用空闲页，没有再开新页。借出中的页绝不算空闲。 */
  acquire(): Promise<PoolPage>
  /**
   * 还一页。返回这页最终的归宿：`kept`（进空闲表，下次复用）或 `closed`（就地关闭）。
   * 不是本池借出的页 → `foreign`（不动它，由调用方处理）。
   */
  release(page: PoolPage): Promise<'kept' | 'closed' | 'foreign'>
  /** 当前借出中的页数（诊断；空闲自关的守卫语义与它无关，别拿来当忙闲判据）。 */
  inFlight(): number
}

export function createPagePool(options: {
  newPage: () => Promise<PoolPage>
  /** context 自带的首页（about:blank）—— 没有它，串行场景会多开一个 tab。 */
  seed?: readonly PoolPage[]
  /** 空闲表容量。默认 1（与旧实现"只剩一页时留着"一致）。 */
  maxIdle?: number
}): PagePool {
  const maxIdle = options.maxIdle ?? 1
  const idle: PoolPage[] = [...(options.seed ?? [])]
  const checkedOut = new Set<PoolPage>()

  return {
    async acquire(): Promise<PoolPage> {
      while (idle.length > 0) {
        const candidate = idle.shift()
        if (candidate !== undefined && !candidate.isClosed()) {
          checkedOut.add(candidate)
          return candidate
        }
        // 死页（被用户手关）直接丢弃，试下一张
      }
      const fresh = await options.newPage()
      checkedOut.add(fresh)
      return fresh
    },

    async release(page: PoolPage): Promise<'kept' | 'closed' | 'foreign'> {
      if (!checkedOut.has(page)) return 'foreign'
      checkedOut.delete(page)
      if (page.isClosed()) return 'closed'
      if (idle.length < maxIdle) {
        idle.push(page)
        return 'kept'
      }
      await page.close().catch(() => undefined)
      return 'closed'
    },

    inFlight(): number {
      return checkedOut.size
    },
  }
}

interface PersistentContextLike {
  pages(): BrowserPage[]
  newPage(): Promise<BrowserPage>
  close(): Promise<void>
  on(event: 'close', listener: () => void): unknown
  /** context 级 init 脚本（每个新文档创建前执行）。playwright/patchright 都有。 */
  addInitScript?(script: { content: string }): Promise<unknown>
  /** 给页面开 CDP session（端口守卫用）。 */
  newCDPSession?(page: BrowserPage): Promise<CdpSessionLike>
}

export interface BrowserManager {
  /** 懒启动 + 单例 + 崩溃后重建。并发调用只会启动一个实例。 */
  ensure(): Promise<void>
  /** 取页。跨平台并发时各拿各的页（页面池）；同平台串行由 locks.ts 保证。 */
  page(): Promise<BrowserPage>
  release(page: BrowserPage): Promise<void>
  /** 插件卸载时调用；可重复调用。 */
  close(): Promise<void>
  isRunning(): boolean
  /**
   * 立刻开始计一轮空闲（"用完就还回去"的时刻调用）。
   *
   * `release()` 已经在末尾自动调用它；这个方法给"只用了一次 `ensure()`
   * 而没走 `page()`"的调用方兜底，也让测试能显式起表。
   */
  touch(): void
  /** 当前是否已经排上了空闲关闭定时器（诊断与测试用）。 */
  idleScheduled(): boolean
  /**
   * 运行期改空闲关闭时长（设置里改完立刻生效，不用重启插件）。
   * `0` / 非正数 = 关掉自动关闭，并清掉已排的定时器。
   */
  setIdleCloseMs(ms: number): void
  /**
   * 运行期改引擎偏好 / stealth 注入开关（D-17a）。
   *
   * 这两项只在**启动浏览器那一刻**起作用。浏览器正开着时只记账并提示
   * "下次启动生效"（浏览器空闲自关后自然会用新值），绝不为了应用新设置
   * 去关一个可能正在采集的实例。
   */
  applyRuntimeConfig(patch: { engine?: BrowserEngine; stealthInit?: boolean }): void
  /** 当前实际解析到的引擎名；还没启动过时是 `null`（诊断与 `/health` 用）。 */
  activeEngine(): 'patchright' | 'playwright-core' | null
}

/**
 * 浏览器发现顺序（§4.2.1）：配置指定 → 系统 Chrome → 系统 Edge → playwright 缓存。
 * 纯函数，便于离线单测 —— 只依赖注入的 `exists`，不碰真实文件系统。
 */
export function candidateExecutables(
  config: BrowserConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files'
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = env['LOCALAPPDATA'] ?? ''
  const candidates: string[] = []

  if (config.executablePath !== undefined && config.executablePath !== '') {
    candidates.push(config.executablePath)
  }
  // 系统 Chrome
  candidates.push(
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  )
  // 系统 Edge
  candidates.push(
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  )
  // playwright 缓存（revision 匹配脆，只作末选）
  if (localAppData !== '') {
    candidates.push(join(localAppData, 'ms-playwright', 'chromium', 'chrome-win', 'chrome.exe'))
  }
  return candidates
}

/** 取第一个存在的可执行文件；都不存在返回 undefined（交给 playwright 自己找）。 */
export function discoverExecutable(
  candidates: readonly string[],
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== '' && exists(candidate)) return candidate
  }
  return undefined
}

/** Chromium 在 profile 目录里留下的锁文件。 */
export const CHROMIUM_LOCK_FILES = [
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  'lockfile',
] as const

/** 列出实际存在的锁文件。 */
export function staleLockFiles(
  profileDir: string,
  exists: (path: string) => boolean = existsSync,
): string[] {
  return CHROMIUM_LOCK_FILES.map((name) => join(profileDir, name)).filter((path) => exists(path))
}

/**
 * 从启动参数里解析 TCP 调试端口（`--remote-debugging-port=<port>`）。
 *
 * 为什么需要它：playwright 默认用 **pipe** 方式驱动 CDP，**没有** TCP 端口可探测，
 * 端口守卫无事可做；只有显式带了这个参数（或将来接"寄生日常 Chrome"模式）时，
 * 端口才真的暴露 —— 守卫恰好也只需要在那一刻工作。纯函数，离线可测。
 */
export function debugPortFromArgs(args: readonly string[]): number | undefined {
  for (const arg of args) {
    const match = /^--remote-debugging-port=(\d+)$/.exec(arg)
    if (match === null) continue
    const port = Number(match[1])
    if (Number.isInteger(port) && port > 0 && port < 65536) return port
  }
  return undefined
}

export interface BrowserManagerOptions {
  /** 持久化 profile 目录（`$DSH_HOME/job-hunter/browser-profile/`）。 */
  profileDir: string
  config?: BrowserConfig
  logger?: { info(message: string): void; warn(message: string): void }
  /**
   * 空闲多少毫秒后自动关闭浏览器。`0` / 不填 / 非正数 = 不自动关闭（旧行为）。
   *
   * 由 `runtime` 从设置（分钟）换算后传入 —— 这里只认毫秒，不读设置，
   * 这样管理器本身没有 store 依赖，也就能被纯单测直接驱动。
   */
  idleCloseMs?: number
  /**
   * 空闲到点时再问一次"现在能关吗"。
   *
   * 三个**必须**拦住的场景（否则会把用户正在用的浏览器关掉）：
   *   * 登录引导轮询中 —— 用户正在那个窗口里登录；
   *   * 采集/补跑正在进行 —— 有平台锁被持有（locks.busy()）；
   *   * PDF 渲染中（它有自己的实例，与本实例无关）。
   * 返回 false = 这次不关，并**重新计时**（不是放弃：下一次空闲还会再试）。
   */
  shouldKeepAlive?: () => boolean
  /** 定时器端口：生产用原生，测试注入 `createManualTimer()`，不必真等 10 分钟。 */
  timers?: TimerPort
}

/**
 * 创建浏览器管理器。
 *
 * `playwright-core` 是**动态导入**的：没装也不该让插件挂不上（C5 的同类风险），
 * 只在实际要抓取时报一个可读错误。
 */
export function createBrowserManager(options: BrowserManagerOptions): BrowserManager {
  const { profileDir, logger } = options
  const config = options.config ?? {}
  const idleCloseMs = options.idleCloseMs !== undefined && options.idleCloseMs > 0 ? options.idleCloseMs : 0
  const timers = options.timers ?? nativeTimerPort()
  let context: PersistentContextLike | undefined
  let launching: Promise<void> | undefined
  /** 引擎解析结果缓存；设置变更（applyRuntimeConfig）时作废重解。 */
  let engineModule: { name: 'patchright' | 'playwright-core'; chromium: ChromiumModule } | undefined
  let enginePref: BrowserEngine = config.engine ?? 'auto'
  let stealthInit = config.stealthInit ?? true
  /** 本次 launch 解析出的 TCP 调试端口；undefined = pipe 模式，端口守卫休眠。 */
  let guardPort: number | undefined
  const guardedPages = new WeakSet<object>()
  const guardDisposers = new WeakMap<object, () => void>()
  let portGuardWarned = false

  const isRunning = (): boolean => context !== undefined

  /**
   * 页面池随 context 生死：旧 context 的页在 closeContext 里整批消失，
   * 池里再留着它们的引用只会让下一次 acquire 拿到死页。
   * 所以 context 重建时池也重建（seed 是新 context 的首页）。
   */
  let pool: PagePool | undefined

  const closeContext = async (): Promise<void> => {
    const active = context
    context = undefined
    pool = undefined
    if (active === undefined) return
    await active.close().catch(() => undefined) // 不留孤儿进程
  }

  /* 空闲自关的具体时序（取消 / 到点复问 / 重新计时）在 idle-close.ts ——
     那里有离线单测，不必真等 10 分钟，也不必真起浏览器。 */
  const idle = createIdleCloser({
    idleMs: idleCloseMs,
    timers,
    close: closeContext,
    ...(options.shouldKeepAlive === undefined ? {} : { shouldKeepAlive: options.shouldKeepAlive }),
    ...(logger === undefined ? {} : { logger }),
  })

  const clearIdle = (): void => {
    idle.cancel()
  }

  const armIdle = (): void => {
    idle.arm()
  }

  /** 两个引擎共有的最小面：我们只用 `chromium.launchPersistentContext`。 */
  interface ChromiumModule {
    launchPersistentContext(dir: string, options: Record<string, unknown>): Promise<unknown>
  }

  /** 引擎解析顺序：显式指定就只试那一个（不静默回退）；`auto` 优先 patchright。 */
  const engineOrder = (): Array<'patchright' | 'playwright-core'> => {
    if (enginePref === 'patchright') return ['patchright']
    if (enginePref === 'playwright-core') return ['playwright-core']
    return ['patchright', 'playwright-core']
  }

  const importEngine = async (name: 'patchright' | 'playwright-core'): Promise<ChromiumModule> => {
    const mod = (await import(name)) as unknown as { chromium?: ChromiumModule }
    if (mod?.chromium?.launchPersistentContext === undefined) {
      throw new Error(`${name} 的导出形状不符合预期`)
    }
    return mod.chromium
  }

  const loadEngine = async (): Promise<{ name: 'patchright' | 'playwright-core'; chromium: ChromiumModule }> => {
    if (engineModule !== undefined) return engineModule
    const order = engineOrder()
    let lastError: unknown
    for (const name of order) {
      try {
        const chromium = await importEngine(name)
        engineModule = { name, chromium }
        return engineModule
      } catch (error) {
        lastError = error
        // auto 模式下 patchright 失败不算错误：如实降级并说明原因。
        if (enginePref === 'auto') {
          logger?.warn(
            `[browser] patchright 不可用（${error instanceof Error ? error.message : String(error)}），` +
              '退回 playwright-core —— 猎聘/BOSS 级风控下可能被识别（D-17a）。',
          )
        }
      }
    }
    throw new Error(
      `浏览器引擎不可用（尝试过：${order.join(' → ')}）：` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}。` +
        '请确认依赖已安装（playwright-core / patchright 都没有 postinstall，不会被 pnpm 拦）。',
    )
  }

  /**
   * 每页加固：调试端口开着（guardPort 有值）就装端口守卫。
   * 必须发生在页面**首次 goto 之前** —— 主链的取页入口是 `page()`，
   * 而 `pageSource.acquire()` 是所有导航的唯一前奏，所以在这里装正好。
   */
  const hardenPage = async (active: PersistentContextLike, page: BrowserPage): Promise<void> => {
    if (guardPort === undefined || guardedPages.has(page)) return
    if (typeof active.newCDPSession !== 'function') return
    try {
      const session = await active.newCDPSession(page)
      const dispose = await installPortGuard(session, {
        port: guardPort,
        ...(logger === undefined ? {} : { logger }),
      })
      guardDisposers.set(page, dispose)
      guardedPages.add(page)
    } catch (error) {
      // 守卫失败不该让抓取挂掉，但必须可见（它失效意味着端口探测可能命中）。
      if (!portGuardWarned) {
        portGuardWarned = true
        logger?.warn(
          `[browser] 端口守卫安装失败（本次运行不再重复提醒）：` +
            `${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  const launch = async (): Promise<void> => {
    // 孤儿清理：只有在**确认没有活跃实例**时才敢删锁，
    // 否则会把正在运行的 Chromium 的锁删掉，等于制造第二个实例。
    mkdirSync(profileDir, { recursive: true })
    const locks = staleLockFiles(profileDir)
    if (locks.length > 0) {
      for (const lock of locks) {
        try {
          rmSync(lock, { recursive: true, force: true })
        } catch {
          /* 删不掉就让 Chromium 自己报错 */
        }
      }
      logger?.warn(`[browser] 清理了 ${locks.length} 个残留锁文件（上次可能被强杀）`)
    }

    const { name, chromium } = await loadEngine()
    const executablePath = discoverExecutable(candidateExecutables(config))
    if (executablePath === undefined) {
      logger?.warn('[browser] 没找到系统 Chrome/Edge，交给 playwright 自行解析')
    } else {
      logger?.info(`[browser] 使用浏览器：${executablePath}`)
    }
    logger?.info(`[browser] 引擎：${name}（D-17a 环境一致性）`)

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      ...(config.args ?? []),
    ]
    const created = (await chromium.launchPersistentContext(profileDir, {
      headless: config.headless ?? false,
      locale: config.locale ?? 'zh-CN',
      timezoneId: config.timezoneId ?? 'Asia/Shanghai',
      viewport: null,
      args: launchArgs,
      ...(executablePath === undefined ? {} : { executablePath }),
    })) as unknown as PersistentContextLike

    // stealth 注入（D-17a）：context 级，之后每个新文档都在页面脚本之前拿到它。
    if (stealthInit && typeof created.addInitScript === 'function') {
      await created.addInitScript({ content: STEALTH_INIT_SCRIPT }).catch((error: unknown) => {
        logger?.warn(
          `[browser] stealth 注入失败（不影响抓取，但环境痕迹可能暴露）：` +
            `${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }

    // 端口守卫只在 TCP 调试端口真的开着时启用（pipe 模式下无事可做）。
    guardPort = debugPortFromArgs(launchArgs)
    if (guardPort !== undefined) {
      logger?.info(`[browser] 检测到调试端口 ${String(guardPort)}，将为每个页面启用端口守卫`)
    }

    created.on('close', () => {
      // 用户手动关掉浏览器 = 停止，不是错误（C12）
      if (context === created) {
        context = undefined
        pool = undefined
      }
    })
    context = created
    // 新 context 的池：把自带的首页 seed 进去，串行场景仍然一页反复复用。
    pool = createPagePool({
      newPage: async () => normalizePage(await created.newPage()),
      seed: created.pages().filter((page) => !page.isClosed()).map(normalizePage),
    })
  }

  /** 懒启动 + 单例；并发调用只会真正启动一次。 */
  const ensure = async (): Promise<void> => {
    // 一开始动就把空闲关闭取消掉：不能在采集中途被自己的定时器关掉
    clearIdle()
    if (context !== undefined) return
    if (launching !== undefined) {
      await launching
      return
    }
    launching = launch()
    try {
      await launching
    } finally {
      launching = undefined
    }
  }

  return {
    ensure,

    async page(): Promise<BrowserPage> {
      await ensure()
      const active = context
      const activePool = pool
      if (active === undefined || activePool === undefined) throw new Error('browser: 上下文不可用')
      // 并发调用各拿各的页（空闲页优先，没有再开新 tab）——
      // 这是跨平台并发能成立的地基，见 createPagePool 的注释。
      const chosen = (await activePool.acquire()) as BrowserPage
      // 每页加固（D-17a）：必须在首次 goto 之前（调用方拿到页面的第一件事就是导航）。
      // 复用的空闲页已加固过（guardedPages 记着），不会重复装。
      await hardenPage(active, chosen)
      return chosen
    },

    async release(page: BrowserPage): Promise<void> {
      const activePool = pool
      if (activePool === undefined) return
      const verdict = await activePool.release(page)
      if (verdict === 'closed') {
        // 关掉的页面顺手把守卫 session 拆了；留下的页面守卫保持活跃，下次直接复用。
        guardDisposers.get(page)?.()
      }
      // 「用完了」的时刻就是空闲计时的起点。放在这里而不是每个调用点：
      // pageSource 的 acquire/release 是所有采集与登录路径的**唯一**入口。
      armIdle()
    },

    touch(): void {
      if (context === undefined) return
      armIdle()
    },

    idleScheduled(): boolean {
      return idle.scheduled()
    },

    setIdleCloseMs(ms: number): void {
      idle.setIdleMs(ms)
      // 时长从"不关"改成"要关"时，当前这一轮空闲也应立刻起表，
      // 否则要等到下一次 release 才生效（用户会以为设置没生效）。
      if (context !== undefined && !idle.scheduled()) armIdle()
    },

    applyRuntimeConfig(patch: { engine?: BrowserEngine; stealthInit?: boolean }): void {
      let changed = false
      if (patch.engine !== undefined && patch.engine !== enginePref) {
        enginePref = patch.engine
        changed = true
      }
      if (patch.stealthInit !== undefined && patch.stealthInit !== stealthInit) {
        stealthInit = patch.stealthInit
        changed = true
      }
      if (!changed) return
      // 作废引擎缓存，下一次 ensure 按新偏好重新解析。
      engineModule = undefined
      if (context !== undefined) {
        logger?.warn('[browser] 引擎/stealth 设置已更新，将在浏览器下次启动时生效（不中断当前实例）')
      }
    },

    activeEngine(): 'patchright' | 'playwright-core' | null {
      return engineModule?.name ?? null
    },

    async close(): Promise<void> {
      await closeContext()
    },

    isRunning,
  }
}

/**
 * 把 Playwright 的 `waitForSelector` 归一成 `PageLike` 声明的那个形状。
 *
 * ## 为什么必须在**这里**做（而不是逐个适配器补）
 *
 * `PageLike` 声明的是 `waitForSelector(selector: string, timeoutMs: number): Promise<boolean>`，
 * 而 Playwright 的签名是 `waitForSelector(selector, options?: { state?, timeout? })` ——
 * 第二个参数是**配置对象**。适配器传了个**数字**，于是：
 *
 *   * `options.state` 取不到 ⇒ 用默认的 **`'visible'`**（而适配器的注释写的是"等卡片挂载，不要求可见"）；
 *   * `options.timeout` 取不到 ⇒ 用默认的 **30s**（调用方传的 `waitForListMs` **完全失效**）。
 *
 * 2026-09-19 的真实故障就是这么来的：猎聘一次定时采集报「连搜索页都没打开成功」，
 * 而 Playwright 的日志自相矛盾 —— **locator 解析到了 42 个元素**，却判"不可见"直到 30s 超时。
 * 卡片明明在 DOM 里（页面早就加载好了，跟网络无关），只是被判成了"不可见"
 * （窗口最小化 / 布局未成形时，元素可以有零尺寸框）。
 *
 * ## 归一化的两条约定
 *
 * 1. **等的是"挂载"（`attached`）而不是"可见"** —— 适配器随后是 `evaluate` 读文本，
 *    根本不需要像素可见；把"可见"当门槛等于白白引入一个失败模式。
 * 2. **超时返回 `false`，不抛错** —— 这与离线夹具的行为一致（`jsdom-page.ts` 返回 false），
 *    从此两条路径**同形**。抛错的版本还顺带把"等地雷"变成了"炸掉整轮采集"：
 *    适配器里那些 `await page.waitForSelector(...)` 大多没包 try/catch，
 *    于是一次"没等到"直接变成导航失败。
 *
 * 归一化之后，"到底有没有内容"由 `detectBlock` 判（它是为这件事设计的：
 * 0 卡片 + 短文本 ⇒ `blank`、命中验证码 ⇒ `captcha`…），错误分类也不再误导用户去查网络。
 */
export function normalizeWaitForSelector(page: BrowserPage): BrowserPage {
  // 先把**原始**方法读出来，按 Playwright 的真实签名（第二参数是配置对象）拿；
  // 写回时则走 `page.waitForSelector`（`PageLike` 声明的数字签名）——
  // 一读一写用两个类型，是因为这两个签名在参数位置上是逆变的，互相不可赋值。
  const original = (page as unknown as {
    waitForSelector?: (selector: string, options?: unknown) => Promise<unknown>
  }).waitForSelector
  if (typeof original !== 'function') return page
  page.waitForSelector = async (selector: string, timeoutMs: number): Promise<boolean> => {
    try {
      await original.call(page, selector, { state: 'attached', timeout: timeoutMs })
      return true
    } catch {
      return false
    }
  }
  return page
}

/**
 * 把 Playwright 的响应订阅归一成 `PageLike.onResponse` 声明的形状（返回退订函数）。
 *
 * Playwright 的 `page.on('response', h)` 返回 `this`、退订要靠 `page.off(event, h)`
 * —— 与 `waitForSelector` 同一类"签名逆变"问题，同样必须在这里一次性归一，
 * 否则每个想复用 SPA 响应的适配器都要自己写一遍 `on`/`off` 配对（漏一个就是泄漏）。
 * 页面对象没有这两个方法（假页 / 旧版包装）时保持缺失：适配器按"没有该能力"降级。
 */
export function wireResponseSubscription(page: BrowserPage): BrowserPage {
  const candidate = page as unknown as {
    on?: (event: 'response', handler: (response: PageResponseLike) => void) => unknown
    off?: (event: 'response', handler: (response: PageResponseLike) => void) => unknown
  }
  if (typeof candidate.on !== 'function' || typeof candidate.off !== 'function') return page
  page.onResponse = (handler): (() => void) => {
    candidate.on?.('response', handler)
    return () => {
      candidate.off?.('response', handler)
    }
  }
  return page
}

/** 建页时的能力归一（挂载点收敛在一处：池的 newPage 与 seed）。 */
function normalizePage(page: BrowserPage): BrowserPage {
  return wireResponseSubscription(normalizeWaitForSelector(page))
}

/**
 * 把浏览器管理器接成采集层要的 `PageSource`。
 * 离线夹具实现同一个接口，于是 `runCrawl` 对两条路径完全无感。
 */
export function browserPageSource(manager: BrowserManager): PageSource {
  return {
    async acquire(): Promise<PageLike> {
      return await manager.page()
    },
    async release(page: PageLike): Promise<void> {
      await manager.release(page as BrowserPage)
    },
  }
}
