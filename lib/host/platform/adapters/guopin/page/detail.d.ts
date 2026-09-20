/**
 * 国聘网的**详情页页面上下文函数**：`/job/detail?id=` 页的解析。
 *
 * 结构由 2026-09-20 登录态快照 `.probe-guopin-capture/guopin-detail-2026-09-20.html` 实证
 * （此前是语义锚点，本轮校准为真实类名）：
 *
 * ```
 * div.job-banner > div.container
 *   div.title-box > div.title-wrap
 *     div.title-section > div.title                    ← 标题（页面无 h1）
 *     img.icon-time + span.update-time「更新于 2026-09-12」← publishedAt
 * div.job-container > div.container > div.job-content
 *   div.left
 *     div.job-overview-section > div.overview-item × N  ← 键值对（顺序不固定，按 title 文本归类）
 *       span.overview-title「报名截止：」+ span.overview-desc「2026-12-31 23:59:59」
 *       （实测项：职位性质 / 最低学历 / 报名截止；WebFetch 版本另见 招聘人数 / 工作经验 /
 *         专业要求 / 行业要求 —— 不同岗位项数不同，按词归类、认不出的进 tags）
 *     div.job-intro-section
 *       div.section-title「职位介绍」
 *       div.section-content
 *         div.intro-tag-wrap > span.intro-tag × N       ← 职能标签（进 tags）
 *         div.job-duty                                   ← JD 全文
 *   div.right
 *     div.job-company-wrap
 *       div.job-company-top > div.job-company-desc
 *         a[href="/company?id=…"] > div.company-title    ← 公司名（logo 那个 a 里没有文本）
 *       div.job-company-tag > span.company-tag × 4       ← 服务类型/性质/行业/规模（顺序不固定）
 * ```
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 不得引用任何模块级的值 —— 需要就把值内联进函数体。
 */
import type { RawJobDetail } from '../../../types.js';
import type { GuopinConfig } from '../config.js';
/**
 * **在页面上下文里**解析详情页（自包含）。
 *
 * 快照样本（引才计划岗）**没有薪资节点** —— 薪资不是每个详情页都有，
 * `detailSalary` 保留语义候选，读到就过 `salaryPattern` 校验（宁空勿脏）。
 */
export declare function extractDetailInPage(arg: {
    selectors: GuopinConfig['selectors'];
    jobIdPattern: string;
    deadlinePattern: string;
    salaryPattern: string;
    eduPattern: string;
    expPattern: string;
    naturePattern: string;
    companyNaturePattern: string;
    companySizePattern: string;
}): RawJobDetail;
//# sourceMappingURL=detail.d.ts.map