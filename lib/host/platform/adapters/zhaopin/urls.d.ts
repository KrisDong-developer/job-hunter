/**
 * 智联的 URL 构造（**宿主机侧**）：搜索页 URL 与会话列表接口地址。
 *
 * 不碰 `document`、不发请求 —— 页面内解析见 `./page/*.ts`。
 * 「第 1 页用 `?kw=`、第 2 页起优先用站点自发的无 query path」这条 robots 取舍，
 * 以及 `/jobs?jl=` **不是**搜索页的实测事实，见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { ZhaopinConfig } from './config.js';
/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - **无筛选**：`https://www.zhaopin.com/sou/jl765?kw=Java`（有真实分页、薪资明文）
 *   - **带筛选**：`https://www.zhaopin.com/jobs?jl=765&kw=Java&el=4`（实测站点自己跳的地址）
 *
 * 翻页：第 1 页用 `?kw=` / `?p=`；第 2 页起**优先**用站点给的无 query path 形式 ——
 * 真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`），这里只是兜底。
 */
export declare function buildZhaopinSearchUrl(config: ZhaopinConfig, criteria: SearchCriteria): string | null;
/**
 * 会话列表接口地址（某个页号的最简调用形式：**不带** at/rt 与任何自定义头 —— 实测四个变体等价）。
 *
 * ⚠️ `PageSize` 与 `pageSize` **两个参数名都要带**：实测的真实请求里两个都出现了，
 * 而只带一个是否也生效**没单独验证过** —— 一次只读请求多带一个参数没有代价，就不去赌。
 */
export declare function buildTalkListUrl(config: ZhaopinConfig, pageNo: number): string;
//# sourceMappingURL=urls.d.ts.map