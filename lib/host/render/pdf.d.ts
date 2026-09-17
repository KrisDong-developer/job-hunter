export interface PdfRendererOptions {
    /** 显式指定可执行文件；不填按 `candidateExecutables` 顺序发现。 */
    executablePath?: string;
    /** 空闲多久后关掉浏览器（默认 90 秒）。 */
    idleMs?: number;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface PdfRenderer {
    /** 把一段**自包含** HTML 渲染成 PDF 字节。 */
    render(html: string): Promise<Uint8Array>;
    /** 插件卸载时调用；可重复调用。 */
    close(): Promise<void>;
    isRunning(): boolean;
}
export declare function createPdfRenderer(options?: PdfRendererOptions): PdfRenderer;
//# sourceMappingURL=pdf.d.ts.map