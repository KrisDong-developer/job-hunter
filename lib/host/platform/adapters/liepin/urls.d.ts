/**
 * 猎聘的 **宿主侧**（Node）URL 与搜索请求体构造 —— 这一层不碰 `document`。
 *
 * 页面内的 fetch 通道在 `./api.ts`。完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import { type LiepinConfig } from './config.js';
/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export declare function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null;
/**
 * 构造**会话列表**接口的请求体（表单编码，Node 侧纯函数）。
 *
 * 结构照抄页面自己那一次（2026-09-19 采样、2026-09-20 复验）：
 * `imUserType=0&imId=<可空>&imApp=1&pageSize=30&curPage=0`，**`curPage` 0 起**。
 *
 * ⚠️ `imId` **留空是实测结论，不是省事**：2026-09-20 探针三个变体（空 `imId` /
 * 完全不传该参数 / 带真实 `imId`）全部 `flag=1` 且行数相同 —— 服务端靠 cookie 认人。
 * 真实值来自 cookie `imId_0`（非 httpOnly），但**不需要**去读它（少一处会变的东西）。
 */
export declare function buildContactListBody(arg: {
    page: number;
    pageSize: number;
}): string;
/**
 * 从一份采集条件里抽出**猎聘搜索接口的筛选字段**（维度键 → body 字段，值原样透传）。
 *
 * 与 BOSS 的 `zhipinFiltersOf` 同构：只抽声明过映射的键，其余键（keyword/city/page/
 * maxPages 这类"条件"而不是"筛选"）不进 body。取值域的合法性由方案校验层把关
 * （`plan-config` 按维度声明验），这里**不重复校验**——重复一遍只会让两处规则漂移。
 */
export declare function liepinFiltersOf(criteria: SearchCriteria): Record<string, string>;
/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 *
 * 2026-09-23 起 `criteria` 里的筛选维度（见 `LIEPIN_BODY_FIELDS`）会填进对应槽位 ——
 * 效果经页面上下文重放实测（8 字段各挑代表值，jobId 集合与基线全部不同）。
 * URL 通道（`buildLiepinSearchUrl`）**不带**这些筛选：URL 参数是否生效未实测，
 * 主通道是这条接口，DOM 回退是兜底——不把没验证过的参数拼进 URL。
 */
export declare function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown>;
//# sourceMappingURL=urls.d.ts.map