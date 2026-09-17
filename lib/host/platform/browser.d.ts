import type { PageLike, PageSource } from './types.js';
/** 启动配置。 */
export interface BrowserConfig {
    /** 显式指定浏览器可执行文件；不填则按发现顺序兜底。 */
    executablePath?: string;
    headless?: boolean;
    locale?: string;
    timezoneId?: string;
    args?: string[];
}
/** 与本包交互所需的最小页面面。 */
export interface BrowserPage extends PageLike {
    bringToFront(): Promise<void>;
    close(): Promise<void>;
    isClosed(): boolean;
}
export interface BrowserManager {
    /** 懒启动 + 单例 + 崩溃后重建。并发调用只会启动一个实例。 */
    ensure(): Promise<void>;
    /** 串行取页（调用方自己保证不与其它抓取并发，互斥在 mutex.ts）。 */
    page(): Promise<BrowserPage>;
    release(page: BrowserPage): Promise<void>;
    /** 插件卸载时调用；可重复调用。 */
    close(): Promise<void>;
    isRunning(): boolean;
}
/**
 * 浏览器发现顺序（§4.2.1）：配置指定 → 系统 Chrome → 系统 Edge → playwright 缓存。
 * 纯函数，便于离线单测 —— 只依赖注入的 `exists`，不碰真实文件系统。
 */
export declare function candidateExecutables(config?: BrowserConfig, env?: NodeJS.ProcessEnv): string[];
/** 取第一个存在的可执行文件；都不存在返回 undefined（交给 playwright 自己找）。 */
export declare function discoverExecutable(candidates: readonly string[], exists?: (path: string) => boolean): string | undefined;
/** Chromium 在 profile 目录里留下的锁文件。 */
export declare const CHROMIUM_LOCK_FILES: readonly ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"];
/** 列出实际存在的锁文件。 */
export declare function staleLockFiles(profileDir: string, exists?: (path: string) => boolean): string[];
export interface BrowserManagerOptions {
    /** 持久化 profile 目录（`$DSH_HOME/job-hunter/browser-profile/`）。 */
    profileDir: string;
    config?: BrowserConfig;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/**
 * 创建浏览器管理器。
 *
 * `playwright-core` 是**动态导入**的：没装也不该让插件挂不上（C5 的同类风险），
 * 只在实际要抓取时报一个可读错误。
 */
export declare function createBrowserManager(options: BrowserManagerOptions): BrowserManager;
/**
 * 把浏览器管理器接成采集层要的 `PageSource`。
 * 离线夹具实现同一个接口，于是 `runCrawl` 对两条路径完全无感。
 */
export declare function browserPageSource(manager: BrowserManager): PageSource;
//# sourceMappingURL=browser.d.ts.map