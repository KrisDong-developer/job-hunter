/**
 * 保存的筛选视图（第五轮，批次 B2）—— 规范化、校验与存取。
 *
 * ## 为什么需要"读到宽容、写到严格"两套口径
 *
 * 这份数据会被**长时间留在库里**，而它的形状依赖枚举（`orderBy` / `newWindow` /
 * `state`）。这些枚举会随版本变化：某个排序键被删掉、某个时间窗被改名，
 * 库里那份视图就出现了"当年合法、今天不合法"的字段。
 *
 *   * **写**（PUT）：必须显式报错，指名字段与原因 —— 它来自我们自己的界面，
 *     出现非法值意味着界面有 bug 或被手搓了请求，静默修正等于把问题藏起来。
 *   * **读**（GET）：必须宽容 —— 一个过期的视图条目不该让整个岗位库打不开。
 *     逐条规范化，坏条目**丢弃**（保留其余），条数超限则截断。
 *
 * 这条纪律与 `guard-config` / `browser-config` 的读取一致：配置是长期资产，
 * 读的时候要按"现在"的规则重新解释它。
 */
import type { JobViewsDto, SavedJobViewDto } from '../../shared/contract/dto/job.js';
import type { Store } from '../store/store.js';
/** `setting` 表里的键与作用域（全局偏好，与平台/方案无关）。 */
export declare const JOB_VIEWS_KEY = "saved-job-views";
export declare const JOB_VIEWS_SCOPE = "global";
/** 读取（宽容）：坏条目丢弃、超限截断。 */
export declare function readJobViews(raw: unknown): SavedJobViewDto[];
/** 写入（严格）：第一处不合法就报错，并指名字段。 */
export declare function assertJobViews(raw: unknown): SavedJobViewDto[];
/** 从 `setting` 读；坏内容不会抛错。 */
export declare function jobViewsOf(store: Store): JobViewsDto;
/** 整体覆盖写到 `setting`（幂等）；返回落库后的样子。 */
export declare function saveJobViews(store: Store, raw: unknown, now: string): JobViewsDto;
//# sourceMappingURL=job-views.d.ts.map