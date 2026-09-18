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
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { nativeTimerPort } from '../scheduler/timer-port.js';
import { installPortGuard } from './cdp-guard.js';
import { createIdleCloser } from './idle-close.js';
import { STEALTH_INIT_SCRIPT } from './stealth.js';
export function createPagePool(options) {
    const maxIdle = options.maxIdle ?? 1;
    const idle = [...(options.seed ?? [])];
    const checkedOut = new Set();
    return {
        async acquire() {
            while (idle.length > 0) {
                const candidate = idle.shift();
                if (candidate !== undefined && !candidate.isClosed()) {
                    checkedOut.add(candidate);
                    return candidate;
                }
                // 死页（被用户手关）直接丢弃，试下一张
            }
            const fresh = await options.newPage();
            checkedOut.add(fresh);
            return fresh;
        },
        async release(page) {
            if (!checkedOut.has(page))
                return 'foreign';
            checkedOut.delete(page);
            if (page.isClosed())
                return 'closed';
            if (idle.length < maxIdle) {
                idle.push(page);
                return 'kept';
            }
            await page.close().catch(() => undefined);
            return 'closed';
        },
        inFlight() {
            return checkedOut.size;
        },
    };
}
/**
 * 浏览器发现顺序（§4.2.1）：配置指定 → 系统 Chrome → 系统 Edge → playwright 缓存。
 * 纯函数，便于离线单测 —— 只依赖注入的 `exists`，不碰真实文件系统。
 */
export function candidateExecutables(config = {}, env = process.env) {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env['LOCALAPPDATA'] ?? '';
    const candidates = [];
    if (config.executablePath !== undefined && config.executablePath !== '') {
        candidates.push(config.executablePath);
    }
    // 系统 Chrome
    candidates.push(join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    // 系统 Edge
    candidates.push(join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    // playwright 缓存（revision 匹配脆，只作末选）
    if (localAppData !== '') {
        candidates.push(join(localAppData, 'ms-playwright', 'chromium', 'chrome-win', 'chrome.exe'));
    }
    return candidates;
}
/** 取第一个存在的可执行文件；都不存在返回 undefined（交给 playwright 自己找）。 */
export function discoverExecutable(candidates, exists = existsSync) {
    for (const candidate of candidates) {
        if (candidate !== '' && exists(candidate))
            return candidate;
    }
    return undefined;
}
/** Chromium 在 profile 目录里留下的锁文件。 */
export const CHROMIUM_LOCK_FILES = [
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'lockfile',
];
/** 列出实际存在的锁文件。 */
export function staleLockFiles(profileDir, exists = existsSync) {
    return CHROMIUM_LOCK_FILES.map((name) => join(profileDir, name)).filter((path) => exists(path));
}
/**
 * 从启动参数里解析 TCP 调试端口（`--remote-debugging-port=<port>`）。
 *
 * 为什么需要它：playwright 默认用 **pipe** 方式驱动 CDP，**没有** TCP 端口可探测，
 * 端口守卫无事可做；只有显式带了这个参数（或将来接"寄生日常 Chrome"模式）时，
 * 端口才真的暴露 —— 守卫恰好也只需要在那一刻工作。纯函数，离线可测。
 */
export function debugPortFromArgs(args) {
    for (const arg of args) {
        const match = /^--remote-debugging-port=(\d+)$/.exec(arg);
        if (match === null)
            continue;
        const port = Number(match[1]);
        if (Number.isInteger(port) && port > 0 && port < 65536)
            return port;
    }
    return undefined;
}
/**
 * 创建浏览器管理器。
 *
 * `playwright-core` 是**动态导入**的：没装也不该让插件挂不上（C5 的同类风险），
 * 只在实际要抓取时报一个可读错误。
 */
export function createBrowserManager(options) {
    const { profileDir, logger } = options;
    const config = options.config ?? {};
    const idleCloseMs = options.idleCloseMs !== undefined && options.idleCloseMs > 0 ? options.idleCloseMs : 0;
    const timers = options.timers ?? nativeTimerPort();
    let context;
    let launching;
    /** 引擎解析结果缓存；设置变更（applyRuntimeConfig）时作废重解。 */
    let engineModule;
    let enginePref = config.engine ?? 'auto';
    let stealthInit = config.stealthInit ?? true;
    /** 本次 launch 解析出的 TCP 调试端口；undefined = pipe 模式，端口守卫休眠。 */
    let guardPort;
    const guardedPages = new WeakSet();
    const guardDisposers = new WeakMap();
    let portGuardWarned = false;
    const isRunning = () => context !== undefined;
    /**
     * 页面池随 context 生死：旧 context 的页在 closeContext 里整批消失，
     * 池里再留着它们的引用只会让下一次 acquire 拿到死页。
     * 所以 context 重建时池也重建（seed 是新 context 的首页）。
     */
    let pool;
    const closeContext = async () => {
        const active = context;
        context = undefined;
        pool = undefined;
        if (active === undefined)
            return;
        await active.close().catch(() => undefined); // 不留孤儿进程
    };
    /* 空闲自关的具体时序（取消 / 到点复问 / 重新计时）在 idle-close.ts ——
       那里有离线单测，不必真等 10 分钟，也不必真起浏览器。 */
    const idle = createIdleCloser({
        idleMs: idleCloseMs,
        timers,
        close: closeContext,
        ...(options.shouldKeepAlive === undefined ? {} : { shouldKeepAlive: options.shouldKeepAlive }),
        ...(logger === undefined ? {} : { logger }),
    });
    const clearIdle = () => {
        idle.cancel();
    };
    const armIdle = () => {
        idle.arm();
    };
    /** 引擎解析顺序：显式指定就只试那一个（不静默回退）；`auto` 优先 patchright。 */
    const engineOrder = () => {
        if (enginePref === 'patchright')
            return ['patchright'];
        if (enginePref === 'playwright-core')
            return ['playwright-core'];
        return ['patchright', 'playwright-core'];
    };
    const importEngine = async (name) => {
        const mod = (await import(name));
        if (mod?.chromium?.launchPersistentContext === undefined) {
            throw new Error(`${name} 的导出形状不符合预期`);
        }
        return mod.chromium;
    };
    const loadEngine = async () => {
        if (engineModule !== undefined)
            return engineModule;
        const order = engineOrder();
        let lastError;
        for (const name of order) {
            try {
                const chromium = await importEngine(name);
                engineModule = { name, chromium };
                return engineModule;
            }
            catch (error) {
                lastError = error;
                // auto 模式下 patchright 失败不算错误：如实降级并说明原因。
                if (enginePref === 'auto') {
                    logger?.warn(`[browser] patchright 不可用（${error instanceof Error ? error.message : String(error)}），` +
                        '退回 playwright-core —— 猎聘/BOSS 级风控下可能被识别（D-17a）。');
                }
            }
        }
        throw new Error(`浏览器引擎不可用（尝试过：${order.join(' → ')}）：` +
            `${lastError instanceof Error ? lastError.message : String(lastError)}。` +
            '请确认依赖已安装（playwright-core / patchright 都没有 postinstall，不会被 pnpm 拦）。');
    };
    /**
     * 每页加固：调试端口开着（guardPort 有值）就装端口守卫。
     * 必须发生在页面**首次 goto 之前** —— 主链的取页入口是 `page()`，
     * 而 `pageSource.acquire()` 是所有导航的唯一前奏，所以在这里装正好。
     */
    const hardenPage = async (active, page) => {
        if (guardPort === undefined || guardedPages.has(page))
            return;
        if (typeof active.newCDPSession !== 'function')
            return;
        try {
            const session = await active.newCDPSession(page);
            const dispose = await installPortGuard(session, {
                port: guardPort,
                ...(logger === undefined ? {} : { logger }),
            });
            guardDisposers.set(page, dispose);
            guardedPages.add(page);
        }
        catch (error) {
            // 守卫失败不该让抓取挂掉，但必须可见（它失效意味着端口探测可能命中）。
            if (!portGuardWarned) {
                portGuardWarned = true;
                logger?.warn(`[browser] 端口守卫安装失败（本次运行不再重复提醒）：` +
                    `${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };
    const launch = async () => {
        // 孤儿清理：只有在**确认没有活跃实例**时才敢删锁，
        // 否则会把正在运行的 Chromium 的锁删掉，等于制造第二个实例。
        mkdirSync(profileDir, { recursive: true });
        const locks = staleLockFiles(profileDir);
        if (locks.length > 0) {
            for (const lock of locks) {
                try {
                    rmSync(lock, { recursive: true, force: true });
                }
                catch {
                    /* 删不掉就让 Chromium 自己报错 */
                }
            }
            logger?.warn(`[browser] 清理了 ${locks.length} 个残留锁文件（上次可能被强杀）`);
        }
        const { name, chromium } = await loadEngine();
        const executablePath = discoverExecutable(candidateExecutables(config));
        if (executablePath === undefined) {
            logger?.warn('[browser] 没找到系统 Chrome/Edge，交给 playwright 自行解析');
        }
        else {
            logger?.info(`[browser] 使用浏览器：${executablePath}`);
        }
        logger?.info(`[browser] 引擎：${name}（D-17a 环境一致性）`);
        const launchArgs = [
            '--disable-blink-features=AutomationControlled',
            ...(config.args ?? []),
        ];
        const created = (await chromium.launchPersistentContext(profileDir, {
            headless: config.headless ?? false,
            locale: config.locale ?? 'zh-CN',
            timezoneId: config.timezoneId ?? 'Asia/Shanghai',
            viewport: null,
            args: launchArgs,
            ...(executablePath === undefined ? {} : { executablePath }),
        }));
        // stealth 注入（D-17a）：context 级，之后每个新文档都在页面脚本之前拿到它。
        if (stealthInit && typeof created.addInitScript === 'function') {
            await created.addInitScript({ content: STEALTH_INIT_SCRIPT }).catch((error) => {
                logger?.warn(`[browser] stealth 注入失败（不影响抓取，但环境痕迹可能暴露）：` +
                    `${error instanceof Error ? error.message : String(error)}`);
            });
        }
        // 端口守卫只在 TCP 调试端口真的开着时启用（pipe 模式下无事可做）。
        guardPort = debugPortFromArgs(launchArgs);
        if (guardPort !== undefined) {
            logger?.info(`[browser] 检测到调试端口 ${String(guardPort)}，将为每个页面启用端口守卫`);
        }
        created.on('close', () => {
            // 用户手动关掉浏览器 = 停止，不是错误（C12）
            if (context === created) {
                context = undefined;
                pool = undefined;
            }
        });
        context = created;
        // 新 context 的池：把自带的首页 seed 进去，串行场景仍然一页反复复用。
        pool = createPagePool({
            newPage: async () => await created.newPage(),
            seed: created.pages().filter((page) => !page.isClosed()),
        });
    };
    /** 懒启动 + 单例；并发调用只会真正启动一次。 */
    const ensure = async () => {
        // 一开始动就把空闲关闭取消掉：不能在采集中途被自己的定时器关掉
        clearIdle();
        if (context !== undefined)
            return;
        if (launching !== undefined) {
            await launching;
            return;
        }
        launching = launch();
        try {
            await launching;
        }
        finally {
            launching = undefined;
        }
    };
    return {
        ensure,
        async page() {
            await ensure();
            const active = context;
            const activePool = pool;
            if (active === undefined || activePool === undefined)
                throw new Error('browser: 上下文不可用');
            // 并发调用各拿各的页（空闲页优先，没有再开新 tab）——
            // 这是跨平台并发能成立的地基，见 createPagePool 的注释。
            const chosen = (await activePool.acquire());
            // 每页加固（D-17a）：必须在首次 goto 之前（调用方拿到页面的第一件事就是导航）。
            // 复用的空闲页已加固过（guardedPages 记着），不会重复装。
            await hardenPage(active, chosen);
            return chosen;
        },
        async release(page) {
            const activePool = pool;
            if (activePool === undefined)
                return;
            const verdict = await activePool.release(page);
            if (verdict === 'closed') {
                // 关掉的页面顺手把守卫 session 拆了；留下的页面守卫保持活跃，下次直接复用。
                guardDisposers.get(page)?.();
            }
            // 「用完了」的时刻就是空闲计时的起点。放在这里而不是每个调用点：
            // pageSource 的 acquire/release 是所有采集与登录路径的**唯一**入口。
            armIdle();
        },
        touch() {
            if (context === undefined)
                return;
            armIdle();
        },
        idleScheduled() {
            return idle.scheduled();
        },
        setIdleCloseMs(ms) {
            idle.setIdleMs(ms);
            // 时长从"不关"改成"要关"时，当前这一轮空闲也应立刻起表，
            // 否则要等到下一次 release 才生效（用户会以为设置没生效）。
            if (context !== undefined && !idle.scheduled())
                armIdle();
        },
        applyRuntimeConfig(patch) {
            let changed = false;
            if (patch.engine !== undefined && patch.engine !== enginePref) {
                enginePref = patch.engine;
                changed = true;
            }
            if (patch.stealthInit !== undefined && patch.stealthInit !== stealthInit) {
                stealthInit = patch.stealthInit;
                changed = true;
            }
            if (!changed)
                return;
            // 作废引擎缓存，下一次 ensure 按新偏好重新解析。
            engineModule = undefined;
            if (context !== undefined) {
                logger?.warn('[browser] 引擎/stealth 设置已更新，将在浏览器下次启动时生效（不中断当前实例）');
            }
        },
        activeEngine() {
            return engineModule?.name ?? null;
        },
        async close() {
            await closeContext();
        },
        isRunning,
    };
}
/**
 * 把浏览器管理器接成采集层要的 `PageSource`。
 * 离线夹具实现同一个接口，于是 `runCrawl` 对两条路径完全无感。
 */
export function browserPageSource(manager) {
    return {
        async acquire() {
            return await manager.page();
        },
        async release(page) {
            await manager.release(page);
        },
    };
}
//# sourceMappingURL=browser.js.map