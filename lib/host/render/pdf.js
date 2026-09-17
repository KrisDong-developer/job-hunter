import { candidateExecutables, discoverExecutable } from '../platform/browser.js';
/** PDF 页边距：与 `resume-html.ts` 里的 `@page` 对齐，避免两处不一致导致排版被裁。 */
const MARGIN = { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' };
const DEFAULT_IDLE_MS = 90_000;
export function createPdfRenderer(options = {}) {
    const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    let browser;
    let launching;
    let idleTimer;
    const isRunning = () => browser !== undefined;
    const clearIdle = () => {
        if (idleTimer !== undefined) {
            clearTimeout(idleTimer);
            idleTimer = undefined;
        }
    };
    const shutdown = async () => {
        clearIdle();
        const active = browser;
        browser = undefined;
        if (active === undefined)
            return;
        await active.close().catch(() => undefined);
    };
    const armIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
            idleTimer = undefined;
            // 空闲关闭失败不重要，下一次渲染会重新拉起
            void shutdown();
        }, idleMs);
        // 不要因为这个定时器把宿主进程吊住
        idleTimer.unref?.();
    };
    const ensure = async () => {
        if (browser !== undefined)
            return browser;
        if (launching !== undefined)
            return await launching;
        launching = (async () => {
            const { chromium } = await import('playwright-core');
            const configured = options.executablePath;
            const executablePath = configured !== undefined && configured !== ''
                ? configured
                : discoverExecutable(candidateExecutables({}));
            if (executablePath === undefined) {
                options.logger?.warn('[pdf] 没找到系统 Chrome/Edge，交给 playwright 自行解析');
            }
            const created = await chromium.launch({
                headless: true,
                // printToPDF 需要 headless；这两条让中文与背景色按预期输出
                args: ['--font-render-hinting=none', '--disable-lcd-text'],
                ...(executablePath === undefined ? {} : { executablePath }),
            });
            browser = created;
            return created;
        })();
        try {
            return await launching;
        }
        finally {
            launching = undefined;
        }
    };
    return {
        async render(html) {
            clearIdle();
            const instance = await ensure();
            const page = await instance.newPage();
            try {
                await page.setContent(html, { waitUntil: 'load' });
                // 字体没排上版就打印 → 中文可能变方框，或行高错乱
                await page.evaluate(async () => {
                    const fonts = globalThis.document?.fonts;
                    if (fonts?.ready !== undefined)
                        await fonts.ready;
                });
                const bytes = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: MARGIN,
                    preferCSSPageSize: true,
                });
                options.logger?.info(`[pdf] 已渲染 ${String(bytes.byteLength)} 字节`);
                return new Uint8Array(bytes);
            }
            finally {
                await page.close().catch(() => undefined);
                armIdle();
            }
        },
        close: shutdown,
        isRunning,
    };
}
//# sourceMappingURL=pdf.js.map