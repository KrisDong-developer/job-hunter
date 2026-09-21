/**
 * 条件 → **实际会发出的请求**：唯一的实现。
 *
 * 为什么值得一个专门的模块：界面上写的条件、校验放行的条件、**真正发出去的请求**
 * 是三件事，而它们分叉时用户什么都看不到 —— "筛了没结果"与"根本没筛"长得一模一样。
 * 这里把第三件事变成可读、可对账的一份数据，供三处共用：
 *
 *   * **界面预览**（`POST /criteria/preview`）：保存前就能看到"这个方案对每个平台
 *     会请求什么、哪个条件落到哪个参数上"；
 *   * **单测对账**（`test/platform/dimension-wiring.test.ts`）：声明里写了 `wire`
 *     的维度，探针值必须让请求**真的改变**，声明过 `param` 的必须能在请求里找到它；
 *   * **诊断**：出问题时不必猜"到底带没带这个参数"。
 *
 * ⚠️ URL 型平台**不要**各写一遍 `preview`：共享实现直接解析 `buildSearchUrl()` 的
 * 结果，于是"预览"与"采集"用的是同一个函数，不可能分叉。只有**筛选条件不在 URL 里**
 * 的接口型平台（waiqi / sinojobs / zhipin）才自己实现 —— 它们必须实现，否则预览里
 * 只剩一个页面地址，看起来"什么都没筛"，而对账测试会当场红。
 */
import type { CriteriaRequestPreview, SearchCriteria, SiteAdapter } from './types.js';
/** 从 URL 里取出 query 参数（预览与对账共用同一份解析，避免两套口径）。 */
export declare function queryParamsOf(url: string): Record<string, string>;
/**
 * 声明了、但**不进请求**的维度（采集深度这类旋钮）。
 *
 * 判据是"声明里没有 `wire`"**且"它本身是可填的"** —— 后半个条件不能少：
 * 51job / 智联的 `postedWithinDays` 同样没有 wire，但它不是"采集深度"，
 * 而是"平台侧这个筛选没打通"（声明为封闭 + 空值域）。把它列进"不进请求的旋钮"里，
 * 界面就会拿一句错话解释它。
 */
export declare function crawlOnlyKeysOf(adapter: SiteAdapter): string[];
/** 这个适配器对这份条件会发出什么请求；`null` = 连请求都构造不出来（如城市码未配置）。 */
export declare function previewOf(adapter: SiteAdapter, criteria: SearchCriteria): CriteriaRequestPreview | null;
//# sourceMappingURL=preview.d.ts.map