import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/** 原 router.ts L1111-1135。 */
export declare function greetingDraft(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1137-1155。 */
export declare function greetingSend(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /greeting/send-batch/preview`（批量预览）与 `POST /greeting/send-batch`（批量发送）。
 *
 * ## 三条刻意的形状
 *
 * 1. **预览与发送分开**，且预览只读（`preview` 路径下不写任何东西、不发任何消息）。
 *    §4.4.2 要求用户在确认时看到**正文全文** —— 20 条话术塞进一个 409 的确认文案里
 *    是没法看的，所以批量走"先预览拿到逐条全文、再由界面组织确认"的分工。
 * 2. **必须带 `confirm: true`**：不带就是 400 并提示先看预览。
 *    这条与单条发送的 409 两段式是**两个层次**：单条由闸门自己问（`ConfirmRequiredError`），
 *    批量由这条路由先拦一道，免得出现"只显示了第 1 条正文就发出去了"的怪状态。
 * 3. **单次条数上限与逐条间隔都在宿主里**：界面与模型都绕不过（D3 的"限速 + 随机间隔"）。
 */
export declare function greetingBatch(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1157-1174。 */
export declare function inboxSync(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1176-1190。 */
export declare function detectStage(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /jobs/:id/contact-stage` —— **人工标记**接触态（§12.2）。
 *
 * 为什么必须有这一条：`probeContactStage`（探测）是刻意"只报事实、不改状态"的，
 * 而在此之前**没有任何入口能把结果落成状态** —— `pipeline.advanceContact` 写好了
 * 却零调用。后果不是少一个按钮：接触态永远停在 `greeted`，而
 * `followUpSuggestions()` 的"未读超时 / 已读未回"两条分支分别挂在
 * `delivered` / `read` 上 → **整条跟进链路是空的**。
 *
 * 低危（只写本地库、不碰平台）→ 不过闸门，但过同源校验（`POST` 自动过，见 router.ts）。
 * 每次变更都写一条 `stage_event`（`source='manual'`），所以回退也有痕迹。
 */
export declare function contactStageUpdate(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `GET /greetings` —— 打招呼记录（D6：说了什么、几点发的、结果如何）。
 *
 * 在它之前，这些事实只以 `stage_event` 的形式散在 `/jobs/:id/history` 里，
 * 拿不到"实际发送内容 + 模板 + 渠道"这张表 —— 于是话术效果对比（D2）没有数据面。
 */
export declare function greetings(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1908-1941。 */
export declare function greetingTemplates(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=outreach.d.ts.map