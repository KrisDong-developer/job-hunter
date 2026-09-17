/**
 * 浏览器生命周期（§4.2.1）。
 *
 * 关键决策：
 *   * **只依赖 `playwright-core`** + 指向系统 Chrome 的 `executablePath`：
 *     `playwright` 的 postinstall 会被 pnpm 拦（C5），`playwright-core` 没有安装脚本；
 *   * **持久化 profile**：复用用户手动登录一次之后的登录态；
 *   * **进程内单例**：Chromium 本身是独立 OS 进程，playwright 客户端很轻，省掉 IPC（ADR-5）；
 *   * **幂等**：profile 是 `patchReload: live`，dispose → apply 会反复发生，
 *     `ensure()` 必须能重复调用而不产生第二个实例（C15 / R19）；
 *   * **孤儿清理**：宿主被强杀会留下 Chromium 子进程与「幽灵锁」，下次直接起不来 ——
 *     所以启动时先清残留锁。
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
 * 创建浏览器管理器。
 *
 * `playwright-core` 是**动态导入**的：没装也不该让插件挂不上（C5 的同类风险），
 * 只在实际要抓取时报一个可读错误。
 */
export function createBrowserManager(options) {
    const { profileDir, logger } = options;
    const config = options.config ?? {};
    let context;
    let launching;
    let playwrightModule;
    const isRunning = () => context !== undefined;
    const loadPlaywright = async () => {
        if (playwrightModule !== undefined)
            return playwrightModule;
        try {
            playwrightModule = await import('playwright-core');
            return playwrightModule;
        }
        catch (error) {
            throw new Error(`playwright-core 不可用：${error instanceof Error ? error.message : String(error)}。` +
                '请确认依赖已安装（它没有 postinstall，不会被 pnpm 拦）。');
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
        const { chromium } = await loadPlaywright();
        const executablePath = discoverExecutable(candidateExecutables(config));
        if (executablePath === undefined) {
            logger?.warn('[browser] 没找到系统 Chrome/Edge，交给 playwright 自行解析');
        }
        else {
            logger?.info(`[browser] 使用浏览器：${executablePath}`);
        }
        const created = (await chromium.launchPersistentContext(profileDir, {
            headless: config.headless ?? false,
            locale: config.locale ?? 'zh-CN',
            timezoneId: config.timezoneId ?? 'Asia/Shanghai',
            viewport: null,
            args: [
                '--disable-blink-features=AutomationControlled',
                ...(config.args ?? []),
            ],
            ...(executablePath === undefined ? {} : { executablePath }),
        }));
        created.on('close', () => {
            // 用户手动关掉浏览器 = 停止，不是错误（C12）
            if (context === created)
                context = undefined;
        });
        context = created;
    };
    /** 懒启动 + 单例；并发调用只会真正启动一次。 */
    const ensure = async () => {
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
            if (active === undefined)
                throw new Error('browser: 上下文不可用');
            const pages = active.pages();
            const reusable = pages.find((candidate) => !candidate.isClosed());
            return reusable ?? (await active.newPage());
        },
        async release(page) {
            // 只关我们自己多开出来的页面；只剩一页时留着，别把用户的窗口关掉。
            if (context === undefined)
                return;
            if (context.pages().length <= 1)
                return;
            if (!page.isClosed())
                await page.close().catch(() => undefined);
        },
        async close() {
            const active = context;
            context = undefined;
            if (active === undefined)
                return;
            await active.close().catch(() => undefined); // 不留孤儿进程
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