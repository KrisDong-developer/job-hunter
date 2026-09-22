/**
 * Indeed 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 ——
 * 列表页解析、翻页判断、登录态判定与详情页解析。
 *
 * 完整实测记录（JCS 结构、"同卡"向上爬的锚点策略、下一页的 `aria-disabled` 禁用态、
 * 登录态载荷判据、详情页四锚点 + 载荷 age 日期）见 `./index.ts` 文件头。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 */
import type { RawJob, RawJobDetail } from '../../types.js';
import type { IndeedSelectors } from './config.js';
/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 *
 * ## 内嵌载荷回填（2026-09-21 按真实夹具定案，zhipin 接口通道的同族纪律）
 *
 * 同一页面的 `window.mosaic.providerData["mosaic-provider-jobcards"]` 脚本里嵌着
 * 整批卡片的结构化数据（`metaData.mosaicProviderJobCardsModel.results[]`，连接键
 * `jobkey` ↔ DOM 的 `jk`，真实夹具 15/16 重合）—— **零额外请求**就拿到 DOM 拿不到的：
 *
 *   * `formattedRelativeTime`（「25天前」/「30+天前」）→ `publishedAt`：DOM 侧
 *     `jobListingDate` 0 命中，**这是发布日期的真源**；
 *   * `company` / `formattedLocation` → DOM 锚点 miss 时的兜底；
 *   * `salarySnippet.text` → `salaryRaw`：匿名侧实测恒为空对象，留空；
 *     登录侧若带明文则回填（DOM 正则抓不到时）。
 *
 * 四条纪律（照抄 zhipin `enrichFromApi`）：
 *   1. **岗位集合以 DOM 为准** —— 载荷只按 jobkey 补字段，**不引入新岗位**；
 *   2. **只补空缺** —— DOM 已锚定的值不覆盖（DOM 的 href 还要当 sourceUrl 的根）；
 *   3. **失败保持 DOM 结果** —— marker 找不到 / 大括号配不平 / JSON 烂，一律空表，
 *      不抛错（这条通道是"锦上添花"，不该让整页解析失败）；
 *   4. **补上之后撤掉对应 note** —— 否则数据是新的、说明是旧的，自相矛盾。
 */
export declare function extractJobsInPage(arg: {
    selectors: IndeedSelectors;
    host: string;
    jobKeyPattern: string;
    salaryPattern: string;
    payloadEnabled: boolean;
    payloadProviderKey: string;
}): RawJob[];
/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledAttr: string;
}): boolean;
/**
 * **在页面上下文里**判登录态（自包含）。
 *
 * 2026-09-21 `probe:indeed-login` 两侧实测的判据（同一条搜索页，匿名 vs 已登录）：
 *   * **权威**：页面内嵌载荷 `"isLoggedIn":true|false` —— 匿名搜索页与
 *     `secure.indeed.com/auth` 登录页都是 `false`，已登录搜索页是 `true`；
 *   * **回落**（载荷缺失时）：匿名侧登录入口链接只在未登录时渲染
 *     （`a[href*="account.indeed.com"]`：匿名 2 命中 / 已登录 0）—— 有它即未登录；
 *     没有它按已登录处理（真实 Indeed 页面都带载荷，走到回落的只有改版/异常页，
 *     语义交给调用方结合判墙读数决定）。
 *   * 正文过短的页（挑战页/错误页）直接按未登录处理，不拿残页猜。
 */
export declare function isLoggedInInPage(arg: {
    loginLinkSelector: string;
}): boolean;
/**
 * **在页面上下文里**解析详情页（`/viewjob?jk=`，自包含）。
 *
 * 2026-09-21 `probe:indeed-detail` 三页实测（Nike / Apple / Expressions，产物
 * `.probe-indeed-capture/indeed-detail-report-2026-09-21.json`）：
 *   * 标题 `h1[data-testid="jobsearch-JobInfoHeader-title"]`、公司
 *     `[data-testid="inlineHeader-companyName"]`、地点
 *     `[data-testid="inlineHeader-companyLocation"]`、JD 全文 `#jobDescriptionText`
 *     —— 全部 **3/3 命中**；
 *   * **无 JSON-LD JobPosting、无日期/薪资 DOM 节点**：发布日期唯一来源是内嵌载荷
 *     `"hiringInsightsModel":{"age":"30+天前"}`（`jobMetadataFooterModel.age` 同值回落）；
 *   * `jk` 从 `location.href` 抠（与列表侧同一套规范化 → `viewjob?jk=` 地址幂等）。
 * 锚不中的字段留空 + notes，不编。
 */
export declare function extractDetailInPage(arg: {
    selectors: {
        title: string;
        company: string;
        location: string;
        description: string;
    };
    host: string;
    jobKeyPattern: string;
    postedAgePattern: string;
}): RawJobDetail;
//# sourceMappingURL=page.d.ts.map