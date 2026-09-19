/**
 * 岗位库工具：搜索 / 查询 / 详情 / 标记 / 去重 / 粗筛算分。
 *
 * 这一族的共同点：只跟 `runtime.jobs()`、`runtime.store()`、`runtime.intel()` 打交道，
 * 不触发任何对外动作（唯一的例外是 `job_search` 会真的抓一次，它走 `runtime.crawl`）。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function jobsTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=jobs.d.ts.map