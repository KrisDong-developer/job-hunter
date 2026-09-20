/**
 * BOSS 直聘的**详情页页面上下文函数**：解析岗位详情（JD / 经验学历 / 公司侧栏事实）。
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { RawJobDetail } from '../../../types.js';
import type { ZhipinDetailSelectors } from '../config.js';
/**
 * **在页面上下文里**解析详情页（2026-09-18 由真实登录态快照 `probe:zhipin-chat` 校准）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 *
 * 快照实证的真实结构（深圳·Java 岗，2026-09-18）：
 *
 *   div.job-primary.detail-box
 *     └ div.info-primary
 *         ├ .name h1（标题） / .salary（薪资）
 *         └ p → a.text-city（城市，未解析：地址以列表那条为准）+ span.text-experiece（经验）
 *              + span.text-degree（学历）
 *   div.detail-content-header h3（「职位描述」）
 *   ul.job-keyword-list li（技能标签）
 *   div.job-sec-text（**JD 正文**）
 *   div.job-detail-section.job-detail-company
 *     └ div.job-sec-text.fold-text（**公司介绍** —— 必须排除，否则会把公司简介当成 JD）
 *   div.sider-company
 *     ├ .company-info a（第一个是 logo 链接、文本空；第二个才是公司名）
 *     └ p × 3：i.icon-stage（融资阶段）/ i.icon-scale（规模）/ i.icon-industry（行业）
 *
 * ## JD 里的**水印注入**（2026-09-20 实测发现，必须剔掉，否则写库的就是脏文本）
 *
 * BOSS 会把**品牌字串做成随机类名的 `<span>` 塞进 JD 正文的任意位置**。2026-09-20 的
 * 真实快照（`.probe-zhipin-capture/detail-2026-09-20.html`）里 JD 容器原文是：
 *
 * ```
 * <span class="TkBBeZbHdGjN">BOSS直聘</span>岗位职责<br>1. 参与后<span class="pyKakWzEQwNK">来自BOSS直聘</span>端业务系统的需求分析、…
 * ```
 *
 * ⇒ 直接 `textContent` 得到的是 **「BOSS直聘岗位职责1. 参与后来自BOSS直聘端业务系统…」**：
 * 开头多一段品牌串，而且**「后端业务系统」被从中间劈成了「后 + 水印 + 端业务系统」**。
 * 这不是显示问题 —— `crawl.ts` 会把 `jdText` 原样写库（`store.job.setJdText`），
 * 而它下游要喂给打分与面试技能差距分析（`interviews.ts` 的 `techTokens`）：
 * 脏 JD 会让「后端」这类词断成两半、还凭空多出一个品牌词。
 *
 * 类名是**每次随机**的（实测 `TkBBeZbHdGjN` / `pyKakWzEQwNK` 两个），**不能按类名匹配**；
 * 只能**按文本**判：元素的（去空白）全文恰好等于水印串 ⇒ 整个元素跳过（连子节点）。
 * 水印名单在 `ZhipinDetailSelectors.jdWatermarkTexts`（可 DB 覆盖，平台换字串时不必发版）。
 * ⚠️ 除了剔水印，JD 的取文本方式**与改动前逐字节一致**（`<br>` 本来就不产字符、`clean()` 照旧折空白）
 * —— 否则会静默改写所有已入库 JD 的格式，而既有用例正是钉住那个格式的。
 */
export declare function extractDetailInPage(arg: {
    selectors: ZhipinDetailSelectors;
}): RawJobDetail;
//# sourceMappingURL=detail.d.ts.map