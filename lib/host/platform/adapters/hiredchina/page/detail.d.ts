/**
 * HiredChina 的**详情侧页面上下文函数**：JD / 薪资 / 公司 / 行业 / 徽章行归一。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行（`page.evaluate` 序列化后送进浏览器）：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `../index.ts` 的文件头。
 *
 * 详情页与列表页相反，是 **SSR 直出 DOM**（2026-09-20 真实详情页夹具
 * `hiredchina-detail.html` 校准）：h1 / 公司名 / 薪资 / 徽章行 / JD 全在 HTML 里，
 * 不需要等客户端渲染。
 */
import type { RawJobDetail } from '../../../types.js';
import type { HiredChinaDetailSelectors } from '../config.js';
/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器由真实详情页夹具校准（见 `config.ts` 的结构图）。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。
 *
 * JD 按**标题锚定**拼接：夹具里 `div.prose.prose-sm` 有两段 —— `Job Description`
 * 与 `Requirements`（各挂在 `h3` 标题之后）。只取第一段会丢任职要求，而下游的
 * 打分与技能差距分析恰恰要读 Requirements 里的技能词。标题词表在
 * `jdSectionTitles`（en/zh 双语，可 DB 覆盖）；一个标题都锚不到时回退取第一段。
 *
 * 字段锚不到时**记 note 而不是静默留空**（与 `zhipin` 的 `page/detail.ts` 同款口径）。
 */
export declare function extractDetailInPage(arg: {
    selectors: HiredChinaDetailSelectors;
}): RawJobDetail;
//# sourceMappingURL=detail.d.ts.map