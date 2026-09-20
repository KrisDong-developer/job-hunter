/**
 * HiredChina 的**列表侧页面上下文函数**：从 Next.js RSC 流里解析岗位列表。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行（`page.evaluate` 序列化后送进浏览器）：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `../index.ts` 的文件头。
 *
 * ## 为什么解析 RSC 流而不是 DOM（2026-09-20 实测定案）
 *
 * 列表卡片是**客户端组件**（`JobsClientWrapper`）渲染的：raw HTML 里没有任何
 * `/job/` 链接、没有 `data-slot="card"`（真实夹具 `test/fixtures/hiredchina-search.html`
 * 是证据）。岗位数据整包躺在 `self.__next_f.push([1,"f:…"])` 的流里 —— 本函数
 * 就是把那段流拼出来、抽出 `initialData.list`、映射成 `RawJob`。
 *
 * 流的真实形态（夹具原文节选）：
 *
 * ```
 * <script>self.__next_f.push([1,"f:[\"$\",\"$L2a\",null,{\"initialData\":{\"list\":[
 *   {\"line\":\"<uuid>\",\"name\":\"…\",\"company\":{\"line\":\"…\",\"name\":\"Hank Times\",…},
 *    \"salaryKey\":\"support.salarie.20k.-.25k\",\"location\":\"support.nationalitie.malaysia\",
 *    \"isOnline\":0,\"employmentKey\":\"support.employment.full-time\",
 *    \"workingYearsKey\":\"support.workingyears.1～3.years\",\"refreshAt\":\"2026-09-03T01:52:00.000Z\",…}
 * ]}…"])</script>
 * ```
 *
 * ⚠️ 一个 JSON 对象可能被**切成多个 push 分片** —— 必须先拼接全部分片再提取，
 * 不能假设 `initialData` 完整地待在某一个分片里。
 *
 * ⚠️ 字段值大量是 **i18n key**（`support.salarie.*` / `support.nationalitie.*` …），
 * 页面里**没有**配套字典（实测：`support.*` 键只作为数据出现）—— 按 key 的构词规则
 * 还原成可读文本（见函数体内的 `pretty` / `salaryText`），这是"从平台自己的 key
 * 规则还原"，不是编数据。
 */
import type { RawJob } from '../../../types.js';
import type { HiredChinaPayloadAnchors } from '../config.js';
/**
 * **在页面上下文里**解析列表页（RSC 流 → `initialData.list` → `RawJob[]`）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param arg `anchors` = RSC 流锚点（dataKey/listKey/detailPathPattern，可 DB 覆盖）；
 *   `lang` = 语言路径段（`en`/`zh`，详情 URL 的 `/<lang>/job/<uuid>` 前缀）。
 */
export declare function extractJobsFromPayloadInPage(arg: {
    anchors: HiredChinaPayloadAnchors;
    lang: string;
}): RawJob[];
//# sourceMappingURL=list.d.ts.map