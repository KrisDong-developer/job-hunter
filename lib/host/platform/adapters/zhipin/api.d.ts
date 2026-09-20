/**
 * BOSS 直聘列表接口（薪资明文通道）的页面内请求与响应解析。
 *
 * `fetchJoblistInPage` 是**页面上下文函数**（`page.evaluate` 序列化后送进浏览器执行）：
 * 不得引用任何模块级的值；`salaryMapOf` 是宿主机侧的纯解析，不受此限。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/**
 * **在页面上下文里**发 joblist 请求（自包含；用页面自己的 fetch 带 Cookie/指纹/TLS）。
 * 返回解析后的 JSON；任何失败返回 `null`（调用方**保持 DOM 结果**）。
 */
export declare function fetchJoblistInPage(arg: {
    apiPath: string;
    body: string;
}): Promise<unknown>;
/**
 * 从 joblist 响应里取 `encryptJobId → salaryDesc`。
 *
 * 连接键是 `encryptJobId` ↔ 卡片 href 里那个 id（2026-09-18 实测重合 15/15）。
 * 结构不符就返回空表（**不抛错**：这条通道只是"锦上添花"，失败不该让整轮抓取失败）。
 */
export declare function salaryMapOf(payload: unknown): Map<string, string>;
//# sourceMappingURL=api.d.ts.map