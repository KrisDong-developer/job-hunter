/**
 * pipeline 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 接触态（§12.2）—— 落在 `greeting.stage`，**最新一条即当前接触态**。
 *
 * 关键设计：未读超时与已读未回超时是**两条不同分支**（§3.3 的核心洞察），
 * 所以这里没有"超时"这个状态 —— 超时是**由 `delivered`/`read` + 时间推导出来的建议**，
 * 不是状态本身。把建议写成状态会让状态机被时间污染，回不来。
 */
export declare const CONTACT_STAGES: readonly ["none", "greeted", "delivered", "read", "replied", "interview_scheduled"];
export type ContactStage = (typeof CONTACT_STAGES)[number];
export declare const CONTACT_STAGE_LABEL: Record<ContactStage, string>;
/**
 * 用户**手工**可以标记的接触态（`POST /jobs/:id/contact-stage`）。
 *
 * 排除 `none`：「未接触」不是能"标记"出来的状态 —— 它的含义是"没有打招呼记录"，
 * 而手工标记的载体恰恰是一条打招呼记录（§7.0：最新一条即当前接触态）。
 * 允许把它标成 `none` 只会得到一条写着"未接触"的打招呼记录，自相矛盾。
 *
 * 其余五态都允许人工设置/回退：平台侧会误判，用户也可能是补记历史
 * （"上周其实已经读过了"）—— 所以要能改回来，且每次改动都留一条状态事件。
 */
export declare const MANUAL_CONTACT_STAGES: readonly ["greeted", "delivered", "read", "replied", "interview_scheduled"];
export type ManualContactStage = (typeof MANUAL_CONTACT_STAGES)[number];
/** 投递阶段（§12.1）—— 落在 `application.stage`。 */
export declare const APPLICATION_STAGES: readonly ["sent", "viewed", "interviewing", "interviewed", "offer", "rejected", "no_reply"];
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export declare const APPLICATION_STAGE_LABEL: Record<ApplicationStage, string>;
/**
 * 阶段的先后顺序。回退判断、漏斗排序、看板列序都靠它，
 * **顺序本身就是业务规则**（§12.1）。
 */
export declare const STAGE_ORDER: readonly ApplicationStage[];
export declare function stageRank(stage: ApplicationStage): number;
/**
 * 终态：到了这里就不该再自动往前走，也没有"下一格"。
 *
 * 放在 shared 而不是 host：客户端也要用它决定**要不要渲染"推进"按钮**。
 * 早先它只在 host，客户端因此只能"永远渲染、终态点了没反应"。
 */
export declare const TERMINAL_STAGES: readonly ApplicationStage[];
/**
 * 在途阶段里 stage 的下一格；终态没有下一格，返回 null。
 *
 * `advance` 的默认推进目标与看板按钮的目标都从这里取 —— 只有一份顺序，
 * 不会出现"按钮说去 A、后端去 B"。
 */
export declare function nextStageOf(stage: ApplicationStage): ApplicationStage | null;
/** 投递后完全没进展的阈值（天）——超过就该催了。 */
export declare const NO_PROGRESS_DAYS = 21;
/** 投递渠道（§11.3：归因分析必需）。 */
export declare const APPLICATION_CHANNELS: readonly ["platform", "referral", "website", "headhunter"];
export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number];
export declare const APPLICATION_CHANNEL_LABEL: Record<ApplicationChannel, string>;
/**
 * 状态变更的来源（`stage_event.source`）。
 *
 * 为什么必须记：§12.1 的转移表里"自动识别"与"人工打勾"混在一起，
 * 不记来源就无法解释"这个状态是谁改的"，也无法在自动识别错的时候回溯。
 */
export declare const STAGE_SOURCES: readonly ["auto", "manual", "model"];
export type StageSource = (typeof STAGE_SOURCES)[number];
export declare const STAGE_SOURCE_LABEL: Record<StageSource, string>;
/**
 * 打招呼语气。
 *
 * 与标签同住在这里而不是提示词旁边：它是**取值域**（请求体里传的就是这几个键），
 * 宿主提示词、HTTP 校验、工具参数、以及将来的语气选择器都要用同一套词。
 * 曾经宿主另抄了一份同名标签（正式/热情/简短），漂移过一次。
 */
export declare const GREETING_TONES: readonly ["formal", "warm", "concise"];
export type GreetingTone = (typeof GREETING_TONES)[number];
export declare const GREETING_TONE_LABEL: Record<GreetingTone, string>;
//# sourceMappingURL=pipeline.d.ts.map