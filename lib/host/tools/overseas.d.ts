/**
 * 海外/远程工具：工签立场识别、按立场/模式筛选、面试时间双时区显示、英文简历体检、Cover Letter。
 *
 * 两条边界写在工具描述里、也写在返回文案里：
 *   · 英文体检**只检查，不翻译** —— 机翻简历是海外求职最致命的错误；
 *   · filter 的结果**只包含识别过的岗位**，"没识别"不等于"不符合"。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function overseasTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=overseas.d.ts.map