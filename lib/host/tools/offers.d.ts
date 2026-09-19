/**
 * Offer 工具（§22.2 的 `offer_manage`；H1/H2/H3/H4）。
 *
 * ## 为什么是一个工具而不是七个
 *
 * §22.1 要求"工具数量克制"：offer 的增删改查 + 对比是**同一件事的不同步骤**
 * （登记 → 补条件 → 对比 → 定下来），拆成七个工具只会挤占模型上下文。
 * 与 `interview_manage` / `job_plan_manage` 同一个形状。
 *
 * ## 一处刻意的**不同**于仓储的语义
 *
 * 仓储那边 `comp` 是**整份替换**（与 `criteria` / `resume.content` 一致）。
 * 但工具这一层收的是**扁平参数**（模型逐个填比搓一个嵌套 JSON 可靠得多），
 * 所以这里会先把现值读出来合并再写 —— 否则"把公积金比例补上"会顺手清掉
 * 用户先前填的月 base。这条差异是有意的，也是这一层唯一替调用方做的决定。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function offersTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=offers.d.ts.map