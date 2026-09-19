/**
 * 数据搬家工具（J8 / §18）：导出、导入、看占用、清理预览。
 *
 * ## 为什么把四件事收在一个工具里
 *
 * 它们回答的是同一个问题——"我这台机器上的求职数据现在什么状况、能不能搬走"——
 * 而 §22.1 明确要求"工具数量克制、同类操作合并"。拆成四个工具只会挤占模型上下文。
 *
 * ## 一条刻意的边界：**不给"执行清理"**
 *
 * 清理会**删掉用户数据**，而且不可撤销。界面上的执行入口前面有"预览 → 弹窗 → 确认"三步，
 * 而模型这边只给 `cleanup_preview`（只读）—— 让模型能回答"能清出多少空间"，
 * 但不能自己把用户的历史删了。这与 §22.4 的取向一致（模型的权限只能小于等于用户，
 * 不能大于），只是这里比"过审批"更保守一点：连审批入口都不开。
 *
 * ## 导出为什么落盘而不是把字节交给模型
 *
 * 对话里没有二进制通道。导出写进 `<dataDir>/exports/`，返回**文件路径**；
 * 用户拿着路径就能找到文件。导入反过来：读 `exports/` 下一个**文件名**（不接受任意路径）。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function dataTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=data.d.ts.map