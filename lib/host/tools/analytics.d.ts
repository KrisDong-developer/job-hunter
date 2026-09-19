/**
 * 看板工具：投递漏斗 / 归因 / 薪资分位与箱线图 / 本地基准 / 简历版本 A/B 对比。
 *
 * 一条硬规矩（写进工具描述，也体现在返回文案里）：**样本不足不给结论**。
 * `MIN_SAMPLE = 5` 的原则不许绕过 —— 宁可说"别看差额"，也不硬给一个百分比。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function analyticsTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=analytics.d.ts.map