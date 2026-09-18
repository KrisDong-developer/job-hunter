/**
 * 离线夹具页面 —— 实现采集层的 `PageLike`，但用 jsdom 提供 `document`。
 *
 * 为什么要费这个劲：适配器的解析函数在真路径上会被序列化送进 Chromium，
 * 因此它只认全局 `document`。这里在调用期间把 jsdom 的 document 装到全局上，
 * 于是**同一份解析代码**在离线测试与真实浏览器里逐字执行 —— 离线测试才有意义。
 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import type { PageLike, PageSource } from '../../src/host/platform/types.js'

interface GlobalWithDom {
  document?: unknown
  window?: unknown
  location?: unknown
}

/** 页面上下文里的一次请求（适配器调用 `fetch` 时记录）。 */
export interface CapturedRequest {
  url: string
  init: Record<string, unknown> | undefined
}

/** 页面上下文里的 `fetch` 桩：给定请求返回一份 JSON。 */
export type PageFetchStub = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<{ json(): Promise<unknown>; status?: number; ok?: boolean }>

export interface JsdomPageOptions {
  html: string
  url: string
  /** 可选：按 URL 换夹具内容（多页测试用）。返回 undefined 表示沿用当前内容。 */
  loader?: (url: string) => string | undefined
  /**
   * 可选：给页面上下文装一个 `fetch`。
   *
   * 为什么需要它：神仙外企的适配器**在页面里发请求**（列表不是 DOM 渲染的），
   * 所以它依赖页面上下文的 `fetch`。真路径上那是浏览器的 fetch；
   * 离线路径上由这里提供，且**只挂在全局、不提供给 `window`** ——
   * 这正是真浏览器的样子（`window` 就是全局）。适配器里写的是 `globalThis.fetch`，
   * 所以两条路径逐字一致。
   */
  fetchStub?: PageFetchStub
  /**
   * 可选：每次 `goto` 时回调（测试用）。
   *
   * 用途（SR-46）：把"时间在翻页之间流逝"这件事**挂到导航上** —— 到点中止看的就是
   * "开新页之前时间到了没有"，用真实时间或按调用次数计数的时钟都做不到可重复。
   */
  onGoto?: (url: string) => void
}

/**
 * 用 jsdom 支撑的离线页面夹具，实现采集层的 `PageLike` 接口。
 *
 * 用途：适配器的解析函数在真实路径上会被序列化送进 Chromium 执行，因此只认
 * 全局 `document`。本类在 `evaluate` 调用期间把 jsdom 的 `document`/`window`
 * 临时挂到全局对象上，让**同一份解析代码**在离线测试与真实浏览器里逐字执行。
 *
 * - `goto`：夹具没有网络，只记录当前 URL，必要时通过 `loader` 按 URL 换内容。
 * - `evaluate`：把 jsdom 环境装到全局后执行传入函数（签名与真实路径的异步往返兼容）。
 * - `waitForTimeout` / `waitForSelector`：静态 DOM 下的简化实现，无真实等待。
 */
export class JsdomPage implements PageLike {
  private dom: JSDOM
  private currentUrl: string
  private readonly loader: ((url: string) => string | undefined) | undefined
  private readonly fetchStub: PageFetchStub | undefined
  private readonly onGoto: ((url: string) => void) | undefined
  /** 页面上下文里发出去的所有请求（断言"到底带了什么参数"用）。 */
  readonly requests: CapturedRequest[] = []

  constructor(options: JsdomPageOptions) {
    this.loader = options.loader
    this.fetchStub = options.fetchStub
    this.onGoto = options.onGoto
    this.currentUrl = options.url
    this.dom = this.createDom(options.html, options.url)
  }

  /**
   * 建 jsdom 并**补齐它在夹具里缺的那部分浏览器行为**。
   *
   * `window.scrollTo` 是最新的一处：jsdom 没有视口，原生的实现会往 virtualConsole
   * 发一条 "Not implemented"，在测试输出里留下一串与被测用例无关的栈（BOSS 的
   * 滚动加载适配器会调它）。离线夹具本来就没有"滚动加载出新一屏"这回事 ——
   * 明确给一个 no-op，比让它每次喊一句更诚实。
   */
  private createDom(html: string, url: string): JSDOM {
    const dom = new JSDOM(html, { url })
    const noopScroll = (): void => undefined
    dom.window.scrollTo = noopScroll as unknown as typeof dom.window.scrollTo
    dom.window.scrollBy = noopScroll as unknown as typeof dom.window.scrollBy
    return dom
  }

  /** 夹具里没有网络：只记录地址，必要时换一份内容。 */
  async goto(url: string): Promise<void> {
    this.onGoto?.(url)
    this.currentUrl = url
    const next = this.loader?.(url)
    if (next !== undefined) this.dom = this.createDom(next, url)
  }

  url(): string {
    return this.currentUrl
  }

  async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
    const globals = globalThis as GlobalWithDom & { fetch?: unknown; __WAIQI_FETCH__?: unknown }
    const previousDocument = globals.document
    const previousWindow = globals.window
    const previousLocation = globals.location
    const previousFetch = globals.fetch
    const previousMarker = globals.__WAIQI_FETCH__
    globals.document = this.dom.window.document
    globals.window = this.dom.window
    // 真浏览器的页面一定有 location（猎聘适配器用它读 about:blank 风控销毁信号）。
    globals.location = this.dom.window.location
    // **无论有没有 stub 都要给一个 fetch**：页面上下文里 fetch 一定存在
    // （真浏览器如此）。适配器会用 `__WAIQI_FETCH__` 这个标记确认
    // "这个 fetch 确实是页面上下文的"，从而绝不回退到宿主 Node 的 fetch ——
    // 那会让离线测试真的打到线上（§14 明令禁止）。
    globals.fetch =
      this.fetchStub === undefined
        ? () => Promise.reject(new Error('no fetch stub in offline fixture'))
        : (url: string, init?: Record<string, unknown>) => {
            this.requests.push({ url, init })
            return this.fetchStub?.(url, init) ?? Promise.reject(new Error('fetch stub missing'))
          }
    globals.__WAIQI_FETCH__ = globals.fetch
    try {
      // 夹具是同步的；真路径上这是异步往返。签名保持兼容 ——
      // 返回 Promise 的函数会被 await，所以"页面里的异步请求"这条路也走得通。
      return await Promise.resolve(fn(arg))
    } finally {
      globals.document = previousDocument
      globals.window = previousWindow
      globals.location = previousLocation
      globals.fetch = previousFetch
      globals.__WAIQI_FETCH__ = previousMarker
    }
  }

  /** 夹具里不真等：延时只用于生产路径的保守节奏。 */
  async waitForTimeout(_ms: number): Promise<void> {
    await Promise.resolve()
  }

  /** 夹具是静态 DOM：查一次就知道有没有。 */
  async waitForSelector(selector: string, _timeoutMs: number): Promise<boolean> {
    return this.dom.window.document.querySelector(selector) !== null
  }

  close(): void {
    this.dom.window.close()
  }
}

/** 从一个 HTML 文件造页面来源。 */
export function fixturePageSource(options: {
  htmlPath: string
  url: string
  loader?: (url: string) => string | undefined
}): PageSource {
  const html = readFileSync(options.htmlPath, 'utf8')
  const page = new JsdomPage({
    html,
    url: options.url,
    ...(options.loader === undefined ? {} : { loader: options.loader }),
  })
  return {
    async acquire(): Promise<PageLike> {
      return page
    },
    async release(): Promise<void> {
      /* 单页夹具无需释放 */
    },
  }
}

/** 直接用一段 HTML 造页面来源（构造异常页时用）。 */
export function inlinePageSource(options: { html: string; url: string }): PageSource {
  const page = new JsdomPage(options)
  return {
    async acquire(): Promise<PageLike> {
      return page
    },
    async release(): Promise<void> {
      /* 单页夹具无需释放 */
    },
  }
}
