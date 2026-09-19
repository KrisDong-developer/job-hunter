/**
 * HTTP 路由层 —— **唯一入口**。
 *
 * 结构：这个文件只做三件事 —— 前置校验（同源）、按序命中路由表、把领域错误翻译成 HTTP。
 * 每条路由的实现在 `routes/` 下按域分文件；跨域共享的解析器在 `routes/kit.ts`。
 *
 * ## 路由表 = 完整的接口清单
 *
 * 表里**每个 handler 只接一个精确形状**（方法 + 段数 + 所有字面量段），
 * 所以它就是这套 HTTP 接口的全量清单，与 `README.dev.md` 的端点表一一对应。
 *
 * ⚠️ 曾经的"容器块"（用 `segments[0] === 'plans'` 之类的前缀通吃、块内再分子分支）
 * 已经全部拆掉。它们的问题不是风格：前缀通吃会让**没人服务的路径**也先进到那一段里，
 * 于是 `/plans/1/foo` 在数据层未就绪时报 503、`GET /plans/abc` 报「非法方案 id」400 ——
 * 而正确结果是 404。现在这类路径会一路落到末尾的 404。
 *
 * 顺序仍然重要的几处（字面量段 vs 参数段）
 *
 * 精确到段数之后，只有"同一形状里既有字面量又可能是参数"的少数地方还要靠顺序：
 *   · `jobs.facets`（`/jobs/facets`）必须早于 `jobs.detail`（`/jobs/:id`）—— 否则 `facets` 被当成 id；
 *   · `jobs.batchMark`（`/jobs/batch/mark`）必须早于 `jobs.mark`（`/jobs/:id/mark`）—— 否则 `batch` 被当成 id；
 *   · `interviews.conflicts` / `interviews.upcoming` 必须早于 `interviews.get`（`/interviews/:id`）。
 * 这三处的行为钉在 `test/http/route-precedence.test.ts` 里；改动这个数组时请连带看它。
 *
 * （同一形状内的字面量优先是一贯纪律：`/repairs/clear` 也排在 `/repairs/:id/discard` 之前 ——
 * 虽然两者段数不同、当下不会互相抢，但按这条纪律排，将来加 `/repairs/:id/xxx` 时才不会踩。）
 *
 * ## handler 的归属规则（为什么表里同一个模块会出现好几次）
 *
 * 一条路由归到**它调用的 runtime 方法所属的域**，而不是 URL 前缀：
 * `/jobs/:id/greeting/draft` → outreach.ts（调 `runtime.draftGreeting`）、
 * `/resumes/:id/english-check` → overseas.ts（调 `runtime.overseas()`）、
 * `/jobs/:id/history` → applications.ts（调 `runtime.pipeline()`）。
 * 好处是"改打招呼流程"只需要动 outreach.ts。
 */
import type { HostRuntime } from '../runtime.js';
import type { RouteRequest, RouteResult } from './routes/types.js';
export type { RouteRequest, RouteResult } from './routes/types.js';
export type { CrawlStatusDto } from '../../shared/contract/dto/crawl.js';
/**
 * 唯一入口。所有领域错误在这里翻译成 HTTP（§9 映射表）。
 */
export declare function routeRequest(runtime: HostRuntime, req: RouteRequest): Promise<RouteResult>;
//# sourceMappingURL=router.d.ts.map