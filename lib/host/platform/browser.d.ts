import { type TimerPort } from '../scheduler/timer-port.js';
import type { PageLike, PageSource } from './types.js';
/** 浏览器引擎（D-17a）。`auto` = 优先 patchright，装不上退 playwright-core。 */
export type BrowserEngine = 'auto' | 'patchright' | 'playwright-core';
/** 启动配置。 */
export interface BrowserConfig {
    /** 显式指定浏览器可执行文件；不填则按发现顺序兜底。 */
    executablePath?: string;
    headless?: boolean;
    locale?: string;
    timezoneId?: string;
    args?: string[];
    /** 引擎偏好（D-17a）。默认 `auto`。 */
    engine?: BrowserEngine;
    /** 是否注入 stealth 脚本（D-17a）。默认 `true`；某站点被误伤时可关。 */
    stealthInit?: boolean;
}
/** 与本包交互所需的最小页面面。 */
export interface BrowserPage extends PageLike {
    bringToFront(): Promise<void>;
    close(): Promise<void>;
    isClosed(): boolean;
}
/** 池对页面的最小要求（测试可以注入假页）。 */
export interface PoolPage {
    isClosed(): boolean;
    close(): Promise<unknown>;
}
export interface PagePool {
    /** 拿一页：优先复用空闲页，没有再开新页。借出中的页绝不算空闲。 */
    acquire(): Promise<PoolPage>;
    /**
     * 还一页。返回这页最终的归宿：`kept`（进空闲表，下次复用）或 `closed`（就地关闭）。
     * 不是本池借出的页 → `foreign`（不动它，由调用方处理）。
     */
    release(page: PoolPage): Promise<'kept' | 'closed' | 'foreign'>;
    /** 当前借出中的页数（诊断；空闲自关的守卫语义与它无关，别拿来当忙闲判据）。 */
    inFlight(): number;
}
export declare function createPagePool(options: {
    newPage: () => Promise<PoolPage>;
    /** context 自带的首页（about:blank）—— 没有它，串行场景会多开一个 tab。 */
    seed?: readonly PoolPage[];
    /** 空闲表容量。默认 1（与旧实现"只剩一页时留着"一致）。 */
    maxIdle?: number;
}): PagePool;
export interface BrowserManager {
    /** 懒启动 + 单例 + 崩溃后重建。并发调用只会启动一个实例。 */
    ensure(): Promise<void>;
    /** 取页。跨平台并发时各拿各的页（页面池）；同平台串行由 locks.ts 保证。 */
    page(): Promise<BrowserPage>;
    release(page: BrowserPage): Promise<void>;
    /** 插件卸载时调用；可重复调用。 */
    close(): Promise<void>;
    isRunning(): boolean;
    /**
     * 立刻开始计一轮空闲（"用完就还回去"的时刻调用）。
     *
     * `release()` 已经在末尾自动调用它；这个方法给"只用了一次 `ensure()`
     * 而没走 `page()`"的调用方兜底，也让测试能显式起表。
     */
    touch(): void;
    /** 当前是否已经排上了空闲关闭定时器（诊断与测试用）。 */
    idleScheduled(): boolean;
    /**
     * 运行期改空闲关闭时长（设置里改完立刻生效，不用重启插件）。
     * `0` / 非正数 = 关掉自动关闭，并清掉已排的定时器。
     */
    setIdleCloseMs(ms: number): void;
    /**
     * 运行期改引擎偏好 / stealth 注入开关（D-17a）。
     *
     * 这两项只在**启动浏览器那一刻**起作用。浏览器正开着时只记账并提示
     * "下次启动生效"（浏览器空闲自关后自然会用新值），绝不为了应用新设置
     * 去关一个可能正在采集的实例。
     */
    applyRuntimeConfig(patch: {
        engine?: BrowserEngine;
        stealthInit?: boolean;
    }): void;
    /** 当前实际解析到的引擎名；还没启动过时是 `null`（诊断与 `/health` 用）。 */
    activeEngine(): 'patchright' | 'playwright-core' | null;
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
/**
 * 从启动参数里解析 TCP 调试端口（`--remote-debugging-port=<port>`）。
 *
 * 为什么需要它：playwright 默认用 **pipe** 方式驱动 CDP，**没有** TCP 端口可探测，
 * 端口守卫无事可做；只有显式带了这个参数（或将来接"寄生日常 Chrome"模式）时，
 * 端口才真的暴露 —— 守卫恰好也只需要在那一刻工作。纯函数，离线可测。
 */
export declare function debugPortFromArgs(args: readonly string[]): number | undefined;
export interface BrowserManagerOptions {
    /** 持久化 profile 目录（`$DSH_HOME/job-hunter/browser-profile/`）。 */
    profileDir: string;
    config?: BrowserConfig;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    /**
     * 空闲多少毫秒后自动关闭浏览器。`0` / 不填 / 非正数 = 不自动关闭（旧行为）。
     *
     * 由 `runtime` 从设置（分钟）换算后传入 —— 这里只认毫秒，不读设置，
     * 这样管理器本身没有 store 依赖，也就能被纯单测直接驱动。
     */
    idleCloseMs?: number;
    /**
     * 空闲到点时再问一次"现在能关吗"。
     *
     * 三个**必须**拦住的场景（否则会把用户正在用的浏览器关掉）：
     *   * 登录引导轮询中 —— 用户正在那个窗口里登录；
     *   * 采集/补跑正在进行 —— 有平台锁被持有（locks.busy()）；
     *   * PDF 渲染中（它有自己的实例，与本实例无关）。
     * 返回 false = 这次不关，并**重新计时**（不是放弃：下一次空闲还会再试）。
     */
    shouldKeepAlive?: () => boolean;
    /** 定时器端口：生产用原生，测试注入 `createManualTimer()`，不必真等 10 分钟。 */
    timers?: TimerPort;
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