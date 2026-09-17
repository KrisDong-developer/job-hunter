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
}

export interface JsdomPageOptions {
  html: string
  url: string
  /** 可选：按 URL 换夹具内容（多页测试用）。返回 undefined 表示沿用当前内容。 */
  loader?: (url: string) => string | undefined
}

/** 一个用 jsdom 支撑的页面。`goto` 只换内容，不发任何网络请求。 */
export class JsdomPage implements PageLike {
  private dom: JSDOM
  private currentUrl: string
  private readonly loader: ((url: string) => string | undefined) | undefined

  constructor(options: JsdomPageOptions) {
    this.loader = options.loader
    this.currentUrl = options.url
    this.dom = new JSDOM(options.html, { url: options.url })
  }

  /** 夹具里没有网络：只记录地址，必要时换一份内容。 */
  async goto(url: string): Promise<void> {
    this.currentUrl = url
    const next = this.loader?.(url)
    if (next !== undefined) this.dom = new JSDOM(next, { url })
  }

  url(): string {
    return this.currentUrl
  }

  async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
    const globals = globalThis as GlobalWithDom
    const previousDocument = globals.document
    const previousWindow = globals.window
    globals.document = this.dom.window.document
    globals.window = this.dom.window
    try {
      // 夹具是同步的；真路径上这是异步往返。签名保持兼容。
      return await Promise.resolve(fn(arg))
    } finally {
      globals.document = previousDocument
      globals.window = previousWindow
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
