/**
 * HTML → PDF 渲染器（§17 R1：**复用 Chromium 的 printToPDF**，不引重型排版库）。
 *
 * ## 为什么不能复用抓取用的那个浏览器
 *
 * 抓取浏览器是 `launchPersistentContext(..., { headless: false })` —— 故意的：
 * 用户要能在里面登录、也少踩自动化特征。而 **`page.pdf()` 只在 headless 下可用**，
 * 在 headful Chromium 上直接抛错。两者需求相反，硬凑到一起只会两边都做不好。
 *
 * 所以这里是一个**专用的、临时的、headless 的**实例：
 *   - 不用 persistent profile（渲染不需要任何登录态，也就没有"把用户 profile 弄脏"的风险）；
 *   - 懒启动 + 空闲自动关闭：不渲染的时候不占内存，也不留孤儿进程（C12）；
 *   - 可执行文件发现复用 `platform/browser.ts` 的那套顺序，所以不依赖 playwright 自带下载。
 *
 * 中文字体（R1 特别点名）：Windows/macOS 上 Chromium 会用系统字体，
 * 但**必须给出显式字体栈**（见 `resume-html.ts`），否则某些环境下中文会退化成方框。
 * 渲染前后各等一次 `document.fonts.ready`，避免"字体还没排上版就打印"。
 */
import type { Browser } from 'playwright-core'
import { candidateExecutables, discoverExecutable } from '../platform/browser.js'

export interface PdfRendererOptions {
  /** 显式指定可执行文件；不填按 `candidateExecutables` 顺序发现。 */
  executablePath?: string
  /** 空闲多久后关掉浏览器（默认 90 秒）。 */
  idleMs?: number
  logger?: { info(message: string): void; warn(message: string): void }
}

export interface PdfRenderer {
  /** 把一段**自包含** HTML 渲染成 PDF 字节。 */
  render(html: string): Promise<Uint8Array>
  /** 插件卸载时调用；可重复调用。 */
  close(): Promise<void>
  isRunning(): boolean
}

/** PDF 页边距：与 `resume-html.ts` 里的 `@page` 对齐，避免两处不一致导致排版被裁。 */
const MARGIN = { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }
const DEFAULT_IDLE_MS = 90_000

export function createPdfRenderer(options: PdfRendererOptions = {}): PdfRenderer {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  let browser: Browser | undefined
  let launching: Promise<Browser> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const isRunning = (): boolean => browser !== undefined

  const clearIdle = (): void => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  const shutdown = async (): Promise<void> => {
    clearIdle()
    const active = browser
    browser = undefined
    if (active === undefined) return
    await active.close().catch(() => undefined)
  }

  const armIdle = (): void => {
    clearIdle()
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      // 空闲关闭失败不重要，下一次渲染会重新拉起
      void shutdown()
    }, idleMs)
    // 不要因为这个定时器把宿主进程吊住
    idleTimer.unref?.()
  }

  const ensure = async (): Promise<Browser> => {
    if (browser !== undefined) return browser
    if (launching !== undefined) return await launching
    launching = (async (): Promise<Browser> => {
      const { chromium } = await import('playwright-core')
      const configured = options.executablePath
      const executablePath =
        configured !== undefined && configured !== ''
          ? configured
          : discoverExecutable(candidateExecutables({}))
      if (executablePath === undefined) {
        options.logger?.warn('[pdf] 没找到系统 Chrome/Edge，交给 playwright 自行解析')
      }
      const created = await chromium.launch({
        headless: true,
        // printToPDF 需要 headless；这两条让中文与背景色按预期输出
        args: ['--font-render-hinting=none', '--disable-lcd-text'],
        ...(executablePath === undefined ? {} : { executablePath }),
      })
      browser = created
      return created
    })()
    try {
      return await launching
    } finally {
      launching = undefined
    }
  }

  return {
    async render(html: string): Promise<Uint8Array> {
      clearIdle()
      const instance = await ensure()
      const page = await instance.newPage()
      try {
        await page.setContent(html, { waitUntil: 'load' })
        // 字体没排上版就打印 → 中文可能变方框，或行高错乱
        await page.evaluate(async () => {
          const fonts = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document?.fonts
          if (fonts?.ready !== undefined) await fonts.ready
        })
        const bytes = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: MARGIN,
          preferCSSPageSize: true,
        })
        options.logger?.info(`[pdf] 已渲染 ${String(bytes.byteLength)} 字节`)
        return new Uint8Array(bytes)
      } finally {
        await page.close().catch(() => undefined)
        armIdle()
      }
    },

    close: shutdown,
    isRunning,
  }
}
