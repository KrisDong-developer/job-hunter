/**
 * 抓取执行工具：`crawl_run`（手动抓一次，中危需审批）与 `crawl_status`（健康查询，只读）。
 *
 * 与 `plans.ts` 的分工：方案怎么配是那边的事；这里只负责"现在抓一次"与"现在什么状态"。
 * 真正的抓取一律经 `runtime.crawl` / `runtime.runPlan` —— 工具层不自己开浏览器。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function crawlTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=crawl.d.ts.map