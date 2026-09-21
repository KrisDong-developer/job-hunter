/**
 * LinkedIn 的**列表页页面上下文函数**：解析 guest 端点渲染出的岗位卡片文档。
 *
 * ⚠️ **自包含警告**：本文件的函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 不得引用模块级的常量或工具函数 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 *
 * ⚠️ **Trusted Types 红线**（2026-09-20 v2 探针两次真机实测）：LinkedIn 的 CSP 启用
 * Trusted Types，`innerHTML = 字符串` 与 `DOMParser.parseFromString` 在真实页面上都会抛
 * 「requires TrustedHTML」。本文件只做**读**（querySelector / getAttribute / textContent）。
 *
 * 完整调研记录见 `../index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js';
import type { LinkedInSelectors } from '../config.js';
/** 卡片解析的入参（解析**当前文档** —— guest 端点经顶层导航后，片段已是活 DOM）。 */
export interface ExtractCardsArg {
    selectors: LinkedInSelectors;
    host: string;
    jobUrnPattern: string;
    jobIdFromUrlPattern: string;
    salaryPattern: string;
}
/**
 * **在页面上下文里**解析岗位卡片（当前文档）。
 *
 * 卡片锚点：`div.base-card`；平台 id 优先取 `data-entity-urn`（`urn:li:jobPosting:{id}`），
 * 没有再从标题链接 href 抠（`/jobs/view/{slug}-{id}`）。sourceUrl 一律规范成
 * `https://{host}/jobs/view/{id}`（LinkedIn 的岗位 URL 不带 securityId 一类的会话参数，
 * 规范形可幂等 —— 与 BOSS「绝不重构 URL」的规则不冲突）。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export declare function extractJobsInPage(arg: ExtractCardsArg): RawJob[];
/**
 * **在页面上下文里**读登录态搜索页列表卡的薪资表（`{ jobPostingId: salaryRaw }`）。
 *
 * 2026-09-21 第三轮 actions 探针实测：登录态搜索页的列表卡（`[data-occludable-job-id]`）
 * 部分展示薪资明文（`¥20K/月 - ¥27K/月` 形态）；**薪资节点的类名是每次随机的混淆串**
 * （实测 `jVDYikdkEUKpihBiaAiheLNfuBZXssxrtmqk`），只能按**文本正则**从卡内抠 ——
 * 与 BOSS 薪资语义解析同款做法。连接键 `data-occludable-job-id` 与 guest 通道的
 * `platformJobId`（`urn:li:jobPosting:{id}` / `/jobs/view/{id}`）同源。
 *
 * 只返回「卡上真的写着薪资」的条目 —— 对不上的岗位由调用方留空（绝不猜）。
 */
export declare function extractPanelSalariesInPage(arg: {
    cardSelector: string;
    salaryPattern: string;
}): Record<string, string>;
//# sourceMappingURL=list.d.ts.map