/**
 * 宿主侧运行时装配（composition root）。
 *
 * 把各部件接起来：sqlite store、适配器注册表、全局互斥、浏览器管理器、领域服务、
 * 单实例租约、登录态、自排程器。入口层（http / tools）只跟这个门面打交道。
 *
 * **硬规则（§4.9）**：`apply()` 必须立即返回。所以数据层是**异步就绪**的：
 * `ready()` 返回一个 promise，而 apply 不 await 它；在它完成之前 `/health` 会如实报告
 * `dataReady: false` 与失败原因 —— 而不是让插件挂不上、或者让宿主启动被迁移拖慢。
 *
 * 对外形状（`HostRuntime` / 选项 / 失败）就声明在这个文件里；实现按职责拆在 `runtime/` 下，
 * 每个子模块都是**叶子或单向依赖**（不反向 import 本文件）：
 *
 *   * `contract.ts` —— 失败形状与 `dataNotReady`（路由不必为一个错误依赖整个装配点）
 *   * `adapters.ts` —— 平台清单与注册样板（新增平台 = 表里加一行）
 *   * `gate.ts`     —— 每平台前置条件（SR-16）与冷却/配额两个读数
 *   * `views.ts`    —— 只读投影：store → DTO（同一份事实只映射一次）
 *   * `actions.ts`  —— 七个编排：闸门 + 令牌 + 成功后才回写 + 事件广播
 *   * `lifecycle.ts`—— 租约（R20）与心跳
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EXPORTS_DIR_NAME, PLUGIN_ID, } from '../shared/constants.js';
import { createAiService } from './ai/client.js';
import { createLlmPort } from './ai/llm-port.js';
import { createCompanyService } from './domain/companies.js';
import { runCrawl } from './domain/crawl.js';
import { sweepDedup } from './domain/dedupe-sweep.js';
import { createJobService } from './domain/jobs.js';
import { createPipelineService } from './domain/pipeline.js';
import { createOfferService } from './domain/offers.js';
import { createMessageService } from './domain/messages.js';
import { createInterviewService } from './domain/interviews.js';
import { createAnalyticsService } from './domain/analytics.js';
import { createCampusService, syncDeadlineTodos as syncDeadlineTodoItems } from './domain/campus.js';
import { createOverseasService } from './domain/overseas.js';
import { createOutreachService } from './domain/outreach.js';
import { createResumeService } from './domain/resumes.js';
import { createPdfRenderer } from './render/pdf.js';
import { createPlanService } from './domain/plans.js';
import { exportData as exportDataOf, importJobs as importJobsOf } from './domain/portability.js';
import { cleanupPlanOf, maybeAutoClean, readRetentionPolicy, runCleanupOf, storageUsageOf, writeRetentionPolicy, } from './store/cleanup.js';
import { createIntelService, resumeProfileOf } from './domain/intel.js';
import { buildToday, buildTodayUnavailable } from './domain/today.js';
import { createApprovalPort, renderApproval } from './guard/approval.js';
import { createGuard } from './guard/index.js';
import { createEventBus } from './http/sse.js';
import { browserPageSource, createBrowserManager } from './platform/browser.js';
import { idleCloseMsOf, readBrowserConfig, writeBrowserConfig } from './browser-config.js';
import { readCrawlConfig, writeCrawlConfig } from './crawl-config.js';
import { createLease } from './platform/lease.js';
import { createPlatformLocks } from './platform/locks.js';
import { BurstGuard } from './platform/pacing.js';
import { createAdapterRegistry } from './platform/registry.js';
import { createLoginFlow, createSessionService } from './platform/session.js';
import { ADAPTER_CONFIG_KEY, ADAPTER_CONFIG_MAX_CHARS, adapterSpecOf, rebuildAdapter, registerAdapters, } from './runtime/adapters.js';
import { createRuntimeActions } from './runtime/actions.js';
import { dataNotReady } from './runtime/contract.js';
import { createPlatformGate } from './runtime/gate.js';
import { readOnlyReasonOf, requireLease, startHeartbeat, takeOverLease } from './runtime/lifecycle.js';
import { guardUsageOf } from './guard/rules.js';
import { buildCrawlStatus, buildHealth, buildLoginStatuses, buildPlatforms, unavailableSchedulerStatus, } from './runtime/views.js';
import { createScheduler } from './scheduler/index.js';
import { cordisTimerPort, nativeTimerPort } from './scheduler/timer-port.js';
import { createSettingsService } from './settings.js';
import { resolveDataDir } from './store/db.js';
import { openStore } from './store/store.js';
import { toolExec } from './tools/exec-context.js';
import { DomainError, messageOf } from './util/errors.js';
import { assertNetworkAllowed, isOfflineMode, NO_NETWORK_ENV } from './util/offline.js';
import { systemClock } from './util/time.js';
// 契约层（叶子）是权威；这里 re-export 让既有的 `import ... from './runtime.js'` 继续可用。
export { dataNotReady } from './runtime/contract.js';
/**
 * 往上找**最近的** `package.json`（那就是本包清单）读版本；全找不到就退化，
 * 绝不因此让插件挂不上。
 *
 * ## 为什么不写死一个相对层数
 *
 * 这个文件会在三种位置被执行，而它们的相对深度**并不相同**：
 * `src/host/runtime.ts`（源码/单测）、`lib/host/runtime.js`（生产产物）、
 * 以及被 esbuild 打进测试产物（`npm test` 把 `test` 下的 `*.test.ts` 连依赖打成
 * `.test-build/host/` 里的 `.mjs`，那时 `import.meta.url` 指向的是打包产物）。
 *
 * 写死层数的后果是**静默**的：读不到时 `catch` 把它变成 `'0.0.0'` ——
 * 界面上就是一个假版本号，不报错、不影响启动，也几乎没人会发现。
 * 沿目录往上找（由近及远）在以上四种布局里都指向正确的那一份，
 * 而且是"谁拥有这个文件"的直接翻译。`test/host/version.test.ts` 钉住它。
 */
const MANIFEST_DIRS = ['./', '../', '../../', '../../../'];
function readVersion() {
    for (const dir of MANIFEST_DIRS) {
        try {
            const manifest = JSON.parse(readFileSync(new URL(`${dir}package.json`, import.meta.url), 'utf8'));
            if (typeof manifest.version === 'string')
                return manifest.version;
        }
        catch {
            // 这一层没有（或不是合法 JSON）→ 继续往上找
        }
    }
    return '0.0.0';
}
export function createHostRuntime(options = {}) {
    const logger = options.logger;
    const startedAt = Date.now();
    const version = readVersion();
    const dataDir = resolveDataDir(options.dataDir);
    const clock = systemClock;
    const timerPort = options.timer === undefined ? nativeTimerPort() : cordisTimerPort(options.timer);
    const registry = createAdapterRegistry();
    const platformLocks = createPlatformLocks();
    /**
     * 突发惩罚守卫按平台记忆（跨平台并发后各平台各一份窗口，跨轮次连续）。
     * 见 crawl.ts 对 `createBurstGuard` 的说明 —— 那里记着为什么必须共享。
     */
    const burstGuards = new Map();
    const bus = createEventBus();
    const lease = createLease({
        path: join(dataDir, 'lease.json'),
        pid: process.pid,
        label: PLUGIN_ID,
    });
    const browser = createBrowserManager({
        profileDir: join(dataDir, 'browser-profile'),
        ...(logger === undefined ? {} : { logger }),
        /* 空闲自关（NFR-7 / C12）。
           idleCloseMs 由设置决定，但**设置存在 store 里，而 store 要等租约拿到才打开**
           （见下面 `opened = openStore(...)`）—— 所以这里先不传时长，
           等 store 就绪后立即 `browser.setIdleCloseMs(...)` 一次。
           守卫用闭包读**调用时**的状态，因此不必关心初始化顺序。 */
        shouldKeepAlive: () => {
            // 登录引导轮询中：那是用户正在输密码的窗口，绝不能关
            if (loginFlow?.isRunning() === true)
                return false;
            // 采集 / 补跑进行中：任一平台锁被持有（并发下只要还有一条泳道在跑就不算空闲）
            if (platformLocks.busy())
                return false;
            return true;
        },
    });
    let store;
    let jobs;
    let companies;
    let plans;
    let session;
    let loginFlow;
    let scheduler;
    let intel;
    let guard;
    let ai;
    let outreach;
    let settings;
    let resumes;
    let pipeline;
    let messages;
    let interviews;
    let analytics;
    let offers;
    let campus;
    let overseas;
    const pdfRenderer = createPdfRenderer({
        ...(logger === undefined ? {} : { logger }),
    });
    let toolReport = null;
    let heartbeatCancel = null;
    let failure = null;
    let readyPromise;
    /**
     * 清空**全部**服务槽（`close()` 用）。
     *
     * 它紧贴在声明下面，因为"新增一个槽时忘了清"这件事**不会报错**：漏掉的槽在
     * `close()` 之后仍返回一个绑在**已关闭 sqlite** 上的旧服务 —— 不是"未就绪"的
     * `DATA_UNAVAILABLE`，而是拿旧对象去用。这份清单曾经写在 `close()` 里（文件末尾），
     * 于是漂移过一次：`pipeline` / `messages` / `interviews` / `analytics` / `campus` / `overseas`
     * 六个都被漏掉。
     *
     * 现在由 `test/host/lifecycle.test.ts` 兜底：它逐个访问器断言 close 之后一律
     * `DATA_UNAVAILABLE`。**加槽时在下面补一行，并在那个测试里加一条断言。**
     */
    const clearSlots = () => {
        store = undefined;
        jobs = undefined;
        companies = undefined;
        plans = undefined;
        session = undefined;
        loginFlow = undefined;
        scheduler = undefined;
        intel = undefined;
        guard = undefined;
        ai = undefined;
        outreach = undefined;
        settings = undefined;
        resumes = undefined;
        pipeline = undefined;
        messages = undefined;
        interviews = undefined;
        analytics = undefined;
        offers = undefined;
        campus = undefined;
        overseas = undefined;
    };
    /**
     * 取一个**已就绪**的服务；数据层还没起来就抛 `DATA_UNAVAILABLE`。
     *
     * 为什么值得有这么个东西：十几个访问器原本各写一遍
     * `if (x === undefined) throw dataNotReady(runtime)`。样板本身无害，
     * 但它让"哪个访问器漏了检查"必须逐个读才能确认 —— 而漏一个的后果正是
     * 把 `undefined` 漏给调用方（下一个错误信息会离现场很远）。
     */
    const need = (value) => {
        if (value === undefined)
            throw dataNotReady(runtime);
        return value;
    };
    // ── P5：审批端口 ────────────────────────────────────────────────────
    // 模型发起的高危动作只有一条审批通道：`ctx.approval.request`。
    // 它要求 `agent` + `toolName`，而那两样只有工具执行期间才知道，
    // 所以这里从 AsyncLocalStorage 取（见 tools/exec-context.ts）。
    const approvalService = options.approval;
    const approvalIsUsable = () => approvalService !== undefined && toolExec.current() !== undefined;
    const approvalPort = createApprovalPort({
        available: approvalIsUsable,
        ask: async (request) => {
            const exec = toolExec.current();
            if (approvalService === undefined)
                throw new Error('宿主没有 approval 服务');
            if (exec === undefined)
                throw new Error('不在工具调用上下文里，无法弹出审批');
            const outcome = await approvalService.request({
                agent: exec.agent,
                toolName: exec.toolName,
                ...(exec.callId === undefined ? {} : { callId: exec.callId }),
                // 审批文案就是 `renderApproval` 的结果（含发起者/平台/目标/正文全文/简历版本）
                reason: renderApproval(request),
                ...(exec.signal === undefined ? {} : { signal: exec.signal }),
            });
            // **如实区分**三种"没放行"：宿主说没有应答者，不等于"用户拒绝了"。
            // 真实模型在 headless 里跑的时候正是这一点读不出来 —— 它只看到"用户未批准"，
            // 而真相是那个环境根本没有审批界面（该走 fail-closed + 建待办，而不是当成用户的决定）。
            switch (outcome) {
                case 'allowed-once':
                    return true;
                case 'rejected':
                    return false;
                case 'cancelled':
                    return 'cancelled';
                default:
                    // 'unavailable' 以及任何宿主将来新增的未知取值，一律按"没问到"处理（fail-closed）
                    return 'unavailable';
            }
        },
    });
    /** 是否允许调度：数据层就绪 **且** 持有单实例租约（R20）。 */
    const canSchedule = () => store !== undefined && lease.held();
    /** SR-44：读方案上的后处理开关。没有方案（裸抓一次）时按默认全开。 */
    const postProcessForPlan = (planId) => {
        if (planId === null)
            return { score: true, flag: true, dedup: true };
        return store?.plan.get(planId)?.postProcess ?? { score: true, flag: true, dedup: true };
    };
    /**
     * SR-16：每平台前置条件 —— 判定与它的两个读数（冷却截止 / 今日配额）都在
     * `runtime/gate.ts`。那里是唯一实现；这里只负责把它接到**当前**这一份 store 上
     * （数据层异步就绪，所以传的是读取函数而不是快照）。
     */
    const platformGate = createPlatformGate({ storeOf: () => store, registry, clock });
    /**
     * 七个编排动作（闸门 + 一次性令牌 + 成功后才回写 + 事件广播）。实现见 `runtime/actions.ts`。
     *
     * 依赖**全部传取值函数**：数据层是异步就绪的，这些槽会在运行期从 undefined 变成服务；
     * 传快照会让动作永远看到 undefined（`gate.ts` 的 `storeOf` 是同一个理由）。
     */
    const actions = createRuntimeActions({
        storeOf: () => store,
        guardOf: () => guard,
        sessionOf: () => session,
        outreachOf: () => outreach,
        settingsOf: () => settings,
        pipelineOf: () => pipeline,
        messagesOf: () => messages,
        registry,
        browser,
        events: bus,
        clock,
        // 简历附件的根目录：只有"把 resume_file.id 解析成绝对路径"这一处要用它
        filesDir: join(dataDir, 'files'),
        failureOf: () => failure,
        ...(logger === undefined ? {} : { logger }),
    });
    /** 当前启用简历的标识；没有简历时是 `{null, 0}`（此时分数一律算作"无简历基准"）。 */
    const currentResumeStamp = () => resumes?.scoreStamp() ?? { resumeId: null, rev: 0 };
    /** 从当前简历派生匹配偏好（§4.5.1）；派生规则本身在 domain/intel.ts。 */
    const resumeProfile = () => {
        const service = resumes;
        return service === undefined ? undefined : resumeProfileOf(service);
    };
    /** 本实例为什么是只读的（`null` = 不是）。说法只有一份，见 runtime/lifecycle.ts。 */
    const readOnlyReason = () => readOnlyReasonOf({ storeReady: store !== undefined, failureMessage: failure?.message, lease });
    /** 一条覆盖里"顶层键有哪些"（用于界面判断这东西是不是长得不正常）。非对象一律空。 */
    const overrideKeysOf = (override) => override !== null && typeof override === 'object' && !Array.isArray(override)
        ? Object.keys(override)
        : [];
    /**
     * 组装适配器配置的三层视图。
     *
     * `effective` 走的是 `spec.config.merge` —— 与 `build` 内部同一个函数，
     * 所以界面上看到的生效值**就是**适配器此刻拿在手里的那一份（见 `AdapterSpec.config`）。
     */
    const buildAdapterConfigOf = (opened, platformId) => {
        const spec = adapterSpecOf(platformId);
        if (spec === undefined) {
            throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
                hint: '平台清单见 GET /platforms。',
                detail: { platformId },
            });
        }
        const override = opened.setting.get(ADAPTER_CONFIG_KEY, 'platform', platformId) ?? null;
        return {
            platformId,
            displayName: registry.get(platformId)?.displayName ?? platformId,
            override,
            defaults: spec.config.defaults,
            effective: spec.config.merge(override ?? undefined),
            overrideKeys: overrideKeysOf(override),
        };
    };
    /**
     * 把硬截止同步进待办（§12.7）。规则本身在 `domain/campus.ts`，这里只做两件事：
     * 在数据层/校招服务还没就绪时安静跳过，以及**失败不影响其它功能**
     * （它挂在心跳上跑，抛出去会打断心跳）。
     */
    const syncDeadlineTodos = () => {
        const opened = store;
        const service = campus;
        if (opened === undefined || service === undefined)
            return;
        try {
            syncDeadlineTodoItems(opened, service.deadlines(), clock());
        }
        catch (error) {
            logger?.warn(`[${PLUGIN_ID}] 硬截止同步待办失败（不影响其它功能）：${messageOf(error)}`);
        }
    };
    /**
     * 拿到租约后要做的事（心跳里可能晚一步才拿到 —— 见 runtime/lifecycle.ts）。
     * 心跳与两个按钮（重新检测 / 人工接管）共用它，所以只在这里写一次。
     */
    const onLeaseAcquired = () => {
        scheduler?.start();
    };
    /** 心跳（含"等对方过期就自己接管"的探测循环）。取消函数归 close 保管。 */
    const cancelHeartbeat = () => {
        if (heartbeatCancel === null)
            return;
        heartbeatCancel();
        heartbeatCancel = null;
    };
    /**
     * ① 开库 + 浏览器运行配置 + 崩溃恢复（SR-15 悬挂记录收敛）。
     *
     * 失败**不抛**、返回 `undefined`：数据层挂了插件仍要挂上去，
     * 好让 `/health` 与面板能告诉用户「为什么没有数据」，而不是静默消失（§4.9）。
     */
    const openStorePhase = () => {
        let opened;
        try {
            opened = openStore({
                ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
                ...(logger === undefined ? {} : { logger }),
            });
        }
        catch (error) {
            const domain = error instanceof DomainError ? error : undefined;
            failure = {
                code: domain?.code ?? 'INTERNAL',
                message: messageOf(error),
                ...(domain?.hint === undefined ? {} : { hint: domain.hint }),
            };
            logger?.warn(`[${PLUGIN_ID}] 数据层启动失败：${failure.message}`);
            bus.publish('data.failed', { message: failure.message, code: failure.code });
            return undefined;
        }
        store = opened;
        // 设置存在库里，而库要等租约拿到才打开 —— 所以空闲关闭时长在这里才装上。
        // 用户改设置时 settings 服务会再调一次 setIdleCloseMs，无需重启。
        try {
            const browserRuntimeConfig = readBrowserConfig(opened);
            browser.setIdleCloseMs(idleCloseMsOf(browserRuntimeConfig));
            // D-17a 环境一致性：引擎偏好与 stealth 注入开关（浏览器未启动时立即生效，
            // 已启动则等空闲自关后的下一次启动生效）。
            browser.applyRuntimeConfig({
                engine: browserRuntimeConfig.engine,
                stealthInit: browserRuntimeConfig.stealthInit,
            });
        }
        catch (error) {
            logger?.warn(`[${PLUGIN_ID}] 读取浏览器设置失败：${messageOf(error)}`);
        }
        // SR-15（A3）：**崩溃安全**。进程被强杀时 `finish()` 没机会执行，
        // 那条 crawl_run 会永远停在 `running`，于是界面上永远显示"正在跑"。
        // 启动时收敛超阈值的悬挂记录；没找到就什么都不做（正常启动的代价为零）。
        try {
            const reaped = opened.crawlRun.reapStale(clock());
            if (reaped > 0) {
                logger?.warn(`[${PLUGIN_ID}] 收敛了 ${String(reaped)} 条悬挂的抓取记录（上次进程在结束前退出）—— 已置为 failed`);
            }
        }
        catch (error) {
            logger?.warn(`[${PLUGIN_ID}] 收敛悬挂抓取记录失败（不影响其它功能）：${messageOf(error)}`);
        }
        return opened;
    };
    /**
     * ② 模型层（P5）：宿主 llm 服务 → 端口 → 模型服务。
     *
     * **它必须早于任何会用到模型的服务**，尤其早于简历服务 —— 简历定制（`resume_tailor`）
     * 要拿它调模型。这里曾经排在简历之后，于是 `resumes` 拿到的 `ai` 永远是 `undefined`：
     * 表现是"配了模型、也点了用模型定制，结果永远走规则路径"，而且不报错、不留痕
     * （`via` 如实写 `'rule'`，所以也不算说谎 —— 只是那个降级是接线造成的）。
     * 顺序上就能成立的事，别靠注释提醒：`test/host/ai-wiring.test.ts` 钉着它。
     */
    const modelPhase = (opened) => {
        // 模型端口可能压根不存在（用户没配模型）—— 那就一切走降级，而不是让插件挂不上
        const llmPort = options.llm === undefined
            ? undefined
            : createLlmPort({
                llm: options.llm,
                ...(options.defaultModel === undefined
                    ? {}
                    : { defaultModel: options.defaultModel }),
                onWarn: (message) => logger?.warn(`[${PLUGIN_ID}] ${message}`),
            });
        // 注意：即便用户没配模型，这个服务也**存在**（它内部一律降级），只是端口为 undefined
        const service = createAiService({
            store: opened,
            llm: () => llmPort,
            onDegrade: (info) => {
                // 降级必须可见：用户要能知道"这次给你的不是模型结果"（J10）
                logger?.info(`[${PLUGIN_ID}] 模型用途 ${info.purpose} 降级：${info.reason}`);
                bus.publish('llm.degraded', { purpose: info.purpose, reason: info.reason });
            },
        });
        ai = service;
        // 模型是否真的接上了：这条日志是"为什么一直是模板结果"的第一现场
        logger?.info(`[${PLUGIN_ID}] 模型服务已装配（${llmPort === undefined ? '未配置 → 全部降级为规则/模板' : '已接入'}）`);
        return service;
    };
    /**
     * ③ 基础领域服务与平台注册。
     *
     * 顺序有依赖：**简历服务在这一步要先建** —— 匹配分要读"当前简历版本"，而 jobs 与 intel 都要它（§4.1）；
     * 而它要用的模型服务已经在 ② 里就位（这正是 ② 必须在前的原因）。
     */
    const coreServicesPhase = (opened, model) => {
        const filesDirPath = join(dataDir, 'files');
        resumes = createResumeService({
            store: opened,
            filesDir: filesDirPath,
            clock,
            // 简历定制要用模型（`resume_tailor`）—— 拿到的必须是**已建好的**那一个（见 ② 的注释）
            ai: model,
            pdf: pdfRenderer,
            ...(logger === undefined ? {} : { logger }),
        });
        jobs = createJobService(opened, { scoreStamp: () => currentResumeStamp() });
        companies = createCompanyService(opened);
        // 注册表传进去：方案的平台与筛选条件必须按**适配器声明**校验（SR-39/41/42/45）
        plans = createPlanService(opened, clock, registry);
        session = createSessionService(opened, clock);
        // 适配器清单与注册样板在 runtime/adapters.ts（含 platform 行登记）
        registerAdapters({ store: opened, registry, clock, ...(logger === undefined ? {} : { logger }) });
        // 情报引擎（P4）：先幂等播种内置词表，再装配服务
        intel = createIntelService(opened, clock, {
            resumeProfile,
            scoreStamp: currentResumeStamp,
        });
        const seeded = intel.seedDictionary();
        if (seeded > 0)
            logger?.info(`[${PLUGIN_ID}] 已播种 ${String(seeded)} 条内置词表`);
    };
    /**
     * ④ 安全闸门与话术、设置（P5）：闸门 → 话术 → 设置。
     *
     * 闸门在这里才建，是因为它要 `session`（③）与审批端口；而话术/设置要模型服务（②）。
     */
    const safetyPhase = (opened, model) => {
        guard = createGuard({
            store: opened,
            session,
            approval: approvalPort,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        outreach = createOutreachService({
            store: opened,
            ai: model,
            ...(logger === undefined ? {} : { logger }),
            onInjection: (info) => {
                logger?.warn(`[${PLUGIN_ID}] 岗位 ${String(info.jobId)} 的 JD 命中疑似提示注入：` +
                    info.hits.map((hit) => `${hit.name}(${hit.sample})`).join(' / '));
                bus.publish('ai.injection.suspected', {
                    jobId: info.jobId,
                    hits: info.hits.map((hit) => hit.name),
                });
            },
        });
        settings = createSettingsService({
            store: opened,
            ai: model,
            clock,
            browser: {
                read: () => readBrowserConfig(opened),
                // 写完立刻作用到浏览器实例上：改设置不该要求重启插件
                write: (patch) => {
                    const next = writeBrowserConfig(opened, patch, clock());
                    browser.setIdleCloseMs(idleCloseMsOf(next));
                    browser.applyRuntimeConfig({ engine: next.engine, stealthInit: next.stealthInit });
                    return next;
                },
            },
            crawl: {
                // 单轮预算落库即可 —— 调度器每次开轮都通过 roundBudgetMs 读一次，天然即时生效
                read: () => readCrawlConfig(opened),
                write: (patch) => writeCrawlConfig(opened, patch, clock()),
            },
            // 保留策略（§18）：预览与清理每次都现读，所以写库即生效
            retention: {
                read: () => readRetentionPolicy(opened),
                write: (patch) => writeRetentionPolicy(opened, patch, clock()),
            },
        });
        // 审批通道有没有，是"高危动作会不会被一律拒绝"的第一现场（模型接入与否见 ② 的日志）
        logger?.info(`[${PLUGIN_ID}] 安全闸门已就绪（审批通道：${approvalService === undefined ? '无 → 高危一律拒绝' : '有'}）`);
        if (isOfflineMode()) {
            logger?.warn(`[${PLUGIN_ID}] 离线模式已开启（${NO_NETWORK_ENV}）：抓取与登录引导一律拒绝，` +
                '这是「自动化测试绝不访问真实招聘站」的机制化兜底。');
        }
    };
    /** ⑤ 跟进与看板（P7）+ 校招与海外支线（P8），最后宣告数据层就绪。 */
    const followUpPhase = (opened, model) => {
        // ── P7：跟进与看板 ──────────────────────────────────────────────
        // guardRun 把"走闸门"这件事以回调形式注进去，领域层因此不需要 import guard
        // （依赖方向保持 domain ← guard，而不是互相依赖）。
        // `fn` 收一次性令牌：领域层若真要执行对外动作（而不是只写本地库），
        // 必须把令牌一路传到 `guard/actions/*` 的实现在首行校验 —— 否则那个实现会拒绝执行。
        const guardRun = async (input, fn) => {
            return await need(guard).run({
                action: input.action,
                actor: input.actor,
                danger: input.danger,
                ...(input.target === undefined ? {} : { target: input.target }),
                ...(input.payload === undefined ? {} : { payload: input.payload }),
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => await fn(token));
        };
        pipeline = createPipelineService({
            store: opened,
            clock,
            guardRun,
            ...(logger === undefined ? {} : { logger }),
        });
        messages = createMessageService({
            store: opened,
            clock,
            ai: model,
            ...(logger === undefined ? {} : { logger }),
        });
        interviews = createInterviewService({
            store: opened,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        analytics = createAnalyticsService({ store: opened });
        // Offer（§4.H）：要模型是为了 `offer_compare` 的建议；关掉用途/没有模型时
        // 对比表照常可用（结论 `facts` 是规则算的）
        offers = createOfferService({
            store: opened,
            clock,
            ai: model,
            ...(logger === undefined ? {} : { logger }),
        });
        // ── P8：校招与海外支线 ──────────────────────────────────────────
        campus = createCampusService({
            store: opened,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        overseas = createOverseasService({
            store: opened,
            ai: model,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        // 硬截止进待办：这些节点**不可逆**，所以必须是 urgent 而不是普通提示（§12.7）。
        // 同步逻辑在 syncDeadlineTodos()，心跳里还会再跑一次 —— 只在启动时写一次的话，
        // 用户今天新建的笔试要等到下次重启才会进待办。
        syncDeadlineTodos();
        bus.publish('data.ready', { path: opened.path });
    };
    /** ⑥ 租约与调度（R20 / P3）：单实例仲裁 → 心跳 → 登录引导 → 自排程器。 */
    const schedulingPhase = (opened) => {
        // 数据层好了才谈租约与调度
        const verdict = lease.acquire();
        if (verdict.held) {
            if (verdict.stale) {
                logger?.warn(`[${PLUGIN_ID}] 接管了一个过期租约（上次 pid ${String(verdict.other?.pid ?? '?')}，可能被强杀）`);
            }
        }
        else {
            logger?.warn(`[${PLUGIN_ID}] 另一个实例正在运行（pid ${String(verdict.other?.pid ?? '?')}）→ ` +
                '本实例只读：不启动调度、不开浏览器（R20）。对方心跳过期后本实例会自动接管。');
        }
        // 无论持没持有都起心跳：没持有的话，它是「等待接管」的探测循环
        heartbeatCancel = startHeartbeat({
            lease,
            timer: timerPort,
            events: bus,
            ...(logger === undefined ? {} : { logger }),
            onAcquired: onLeaseAcquired,
            // 硬截止待办跟着心跳走：新截止要能进待办，旧待办的数字也要跟着时间变
            onBeat: syncDeadlineTodos,
            describe: (verdict) => `已接管租约（上一次持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期），开始调度`,
        });
        loginFlow = createLoginFlow({
            registry,
            session: session,
            pageSource: browserPageSource(browser),
            events: bus,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        scheduler = createScheduler({
            store: opened,
            plans: plans,
            run: async (input) => await runtime.crawl({
                platformId: input.platformId,
                criteria: input.criteria,
                planId: input.planId,
                reason: input.reason,
                // SR-46：把本轮终点传给抓取侧 —— 平台内部据此在页与页之间收手
                ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
            }),
            timer: timerPort,
            events: bus,
            canSchedule,
            readOnlyReason,
            leaseStatus: () => lease.status(),
            platformGate,
            // 单轮预算从设置读（每次开轮读一次 → 改完立刻生效，不必重启）
            roundBudgetMs: () => readCrawlConfig(opened).roundBudgetMinutes * 60_000,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        scheduler.start();
    };
    /**
     * 数据层从"打不开"到"能调度"的**全部步骤，按顺序读**。
     *
     * 拆成阶段不是为了少几行：这里的顺序是有语义的（库没开就没有服务、没有租约就不许
     * 驱动浏览器），而一个四百行的函数里读不出"哪些相邻是顺序要求、哪些只是碰巧挨着"。
     * 失败语义也随之分开了 —— **只有 ① 会失败**（后面各阶段的输入是一份已打开的库），
     * 而 ① 的失败不抛（见它自己的注释）。
     */
    const openDataLayer = () => {
        const opened = openStorePhase();
        if (opened === undefined)
            return;
        // 模型服务**显式往下传**：谁要用模型，签名上就写着（不再靠"它在前面已经赋过值了"）
        const model = modelPhase(opened);
        coreServicesPhase(opened, model);
        safetyPhase(opened, model);
        followUpPhase(opened, model);
        schedulingPhase(opened);
        autoCleanPhase(opened);
    };
    /**
     * ⑦ 启动时的**定时清理**（§18.3 P1，默认关闭）。
     *
     * 为什么放在最后、只跑一次：VACUUM 可能阻塞几百毫秒到几秒，而心跳是几十秒一次的轻活 ——
     * 往心跳里塞写操作迟早出事。放在启动末尾，代价可预期；而且此时租约已拿到（
     * `schedulingPhase` 在前面），不会出现"只读实例偷偷删数据"。
     *
     * 只在**真的删了东西**时才提示：默认关、且大多数启动没有到期数据，
     * 每天弹一条"清理完成（0 行）"只会让人学会忽略通知。
     */
    const autoCleanPhase = (opened) => {
        if (!lease.held())
            return;
        try {
            const result = maybeAutoClean(opened, clock);
            if (result === null)
                return;
            logger?.info(`[${PLUGIN_ID}] 启动时自动清理：${String(result.totalRows)} 行 · ` +
                `文件 ${String(result.dbBytesBefore)} → ${String(result.dbBytesAfter)} 字节`);
            bus.publish('storage.cleaned', {
                totalRows: result.totalRows,
                dbBytesBefore: result.dbBytesBefore,
                dbBytesAfter: result.dbBytesAfter,
                vacuumed: result.vacuumed,
                automatic: true,
            });
        }
        catch (error) {
            // 自动清理失败绝不能影响启动（它是后台的维护动作，不是启动的必要条件）
            logger?.warn(`[${PLUGIN_ID}] 启动时自动清理失败（不影响其它功能）：${messageOf(error)}`);
        }
    };
    const runtime = {
        ready() {
            if (readyPromise !== undefined)
                return readyPromise;
            // setImmediate：把开库与迁移推到 apply 返回之后再跑（§4.9 / §6.5）
            readyPromise = new Promise((resolve) => {
                setImmediate(resolve);
            }).then(() => {
                openDataLayer();
            });
            return readyPromise;
        },
        isReady() {
            return store !== undefined;
        },
        failure() {
            return failure;
        },
        health() {
            return buildHealth({
                store,
                registry,
                version,
                startedAt,
                dataError: failure?.message ?? '数据层尚未就绪',
                tools: toolReport,
            });
        },
        today() {
            const opened = store;
            if (opened === undefined) {
                return buildTodayUnavailable(failure?.message ?? '数据层尚未就绪', systemClock());
            }
            return buildToday({
                store: opened,
                registry,
                clock,
                // offer 截止倒计时（H3）：它是**有时间窗**的决策，必须进首屏
                ...(offers === undefined ? {} : { offers }),
            });
        },
        crawlStatus() {
            return buildCrawlStatus({ store, registry, busy: platformLocks.busy() });
        },
        async crawl(options) {
            // §14 的机制化兜底：离线模式下**绝不**发起真实访问
            assertNetworkAllowed('抓取招聘网站');
            const opened = store;
            const jobService = jobs;
            const companyService = companies;
            if (opened === undefined || jobService === undefined || companyService === undefined) {
                throw dataNotReady(runtime);
            }
            // 不持租约就不许驱动浏览器：两个实例抢同一个 profile 会直接报错（R20）
            requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边抓取。');
            bus.publish('crawl.started', { platformId: options.platformId, criteria: options.criteria });
            try {
                const summary = await runCrawl({
                    store: opened,
                    registry,
                    locks: platformLocks,
                    // 突发惩罚按平台共享（跨轮次连续）—— 各平台各一份滑动窗口。
                    createBurstGuard: (platformId) => {
                        const existing = burstGuards.get(platformId);
                        if (existing !== undefined)
                            return existing;
                        const created = new BurstGuard();
                        burstGuards.set(platformId, created);
                        return created;
                    },
                    pageSource: browserPageSource(browser),
                    jobs: jobService,
                    companies: companyService,
                    ...(intel === undefined ? {} : { intel }),
                    ...(logger === undefined ? {} : { logger }),
                }, {
                    platformId: options.platformId,
                    criteria: options.criteria,
                    ...(options.planId === undefined ? {} : { planId: options.planId }),
                    // SR-28：触发原因随记录落库 —— 运行历史表要能回答「这次是谁触发的」
                    reason: options.reason ?? 'manual',
                    // SR-44：抓取后处理开关来自**方案**。方案服务不认识"抓取"，
                    // 抓取不认识"方案" —— 所以由装配点在这里把它们接起来。
                    postProcess: postProcessForPlan(options.planId ?? null),
                    // SR-46：到点时刻由调度器给（本轮开始 + `ROUND_BUDGET_MS`）。
                    // 界面/工具直接调 `crawl` 时不带它 —— 那种场合用户就在屏幕前，
                    // 一个 20 分钟的保险丝不该悄无声息地把他的抓取腰斩。
                    ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
                });
                bus.publish('crawl.finished', {
                    platformId: options.platformId,
                    state: summary.run.state,
                    found: summary.run.found,
                    inserted: summary.run.inserted,
                    updated: summary.run.updated,
                    quarantined: summary.quarantined,
                });
                return summary;
            }
            catch (error) {
                bus.publish('crawl.failed', { platformId: options.platformId, message: messageOf(error) });
                throw error;
            }
        },
        events() {
            return bus;
        },
        intel() {
            return need(intel);
        },
        // ── P5：安全与工具 ────────────────────────────────────────────────
        guard() {
            return need(guard);
        },
        ai() {
            return need(ai);
        },
        outreach() {
            return need(outreach);
        },
        settings() {
            return need(settings);
        },
        approvalAvailable() {
            return approvalIsUsable();
        },
        setToolReport(report) {
            toolReport = report;
        },
        toolReport() {
            return toolReport;
        },
        resumes() {
            return need(resumes);
        },
        filesDir() {
            return join(dataDir, 'files');
        },
        pdfRendererRunning() {
            return pdfRenderer.isRunning();
        },
        pipeline() {
            return need(pipeline);
        },
        messages() {
            return need(messages);
        },
        interviews() {
            return need(interviews);
        },
        analytics() {
            return need(analytics);
        },
        offers() {
            return need(offers);
        },
        followUps() {
            return pipeline?.followUpSuggestions() ?? [];
        },
        unreadCount() {
            return messages?.unreadCount() ?? 0;
        },
        campus() {
            return need(campus);
        },
        overseas() {
            return need(overseas);
        },
        deadlines() {
            return campus?.deadlines() ?? [];
        },
        // ── P5：高危动作与配置写入 ────────────────────────────────────────
        // 七个编排（闸门 + 令牌 + 成功后才回写 + 事件广播）在 runtime/actions.ts。
        // 放那边的理由是顺序约束要能被一屏读完 —— 读不完的顺序约束等于没有约束。
        draftGreeting: actions.draftGreeting,
        sendGreeting: actions.sendGreeting,
        previewGreetingBatch: actions.previewGreetingBatch,
        sendGreetingBatch: actions.sendGreetingBatch,
        replyToMessage: actions.replyToMessage,
        syncInbox: actions.syncInbox,
        probeContactStage: actions.probeContactStage,
        sendApplication: actions.sendApplication,
        previewApplicationBatch: actions.previewApplicationBatch,
        sendApplicationBatch: actions.sendApplicationBatch,
        updateSettings: actions.updateSettings,
        // ── P3 ────────────────────────────────────────────────────────────
        plans() {
            return need(plans);
        },
        schedulerStatus() {
            // 数据层还没就绪：如实报告（字段清单在 views.ts，与真实的 status 形状对齐）
            if (scheduler === undefined) {
                return unavailableSchedulerStatus(readOnlyReason() ?? '数据层尚未就绪', lease.status());
            }
            return scheduler.status();
        },
        setSchedulePaused(paused, reason) {
            need(scheduler).setPaused(paused, reason);
        },
        resumeRisk(planId) {
            need(scheduler).resumeRisk(planId);
        },
        recheckLease() {
            // 只读实例不能躺平等：上一个实例可能刚被关掉，这里立刻重试一次
            if (!lease.held()) {
                takeOverLease({
                    lease,
                    events: bus,
                    ...(logger === undefined ? {} : { logger }),
                    onAcquired: onLeaseAcquired,
                    describe: (verdict) => `重新检测后接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')}）`,
                });
            }
            return runtime.schedulerStatus();
        },
        takeoverLease() {
            if (lease.held())
                return runtime.schedulerStatus();
            const before = lease.status();
            // 对方心跳**新鲜** = 它还活着 → 拒绝，并把「怎么办」说清楚。
            // 这是这个接口存在的全部意义：它绝不能变成"抢活人的锁"的按钮。
            if (!before.stale) {
                const beat = before.heartbeatAt === null ? '未知' : new Date(before.heartbeatAt).toLocaleTimeString();
                throw new DomainError('CONFLICT', `另一个实例（进程 ${String(before.pid ?? '?')}）还在运行，不能接管`, {
                    hint: `它的心跳是 ${beat}，说明那个窗口还活着。请在那个窗口里操作，或者关掉它 —— ` +
                        '关掉之后本实例会在 90 秒内自动接管（不需要重启），也可以点「重新检测」立刻重试。',
                    detail: { pid: before.pid, heartbeatAt: before.heartbeatAt },
                });
            }
            const taken = takeOverLease({
                lease,
                events: bus,
                ...(logger === undefined ? {} : { logger }),
                onAcquired: onLeaseAcquired,
                level: 'warn',
                describe: (verdict) => `人工接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期）`,
            });
            if (!taken) {
                throw new DomainError('CONFLICT', '接管租约失败', {
                    hint: '另一个实例刚刚又活过来了。点「重新检测」看看当前状态。',
                });
            }
            return runtime.schedulerStatus();
        },
        async runPlan(planId, reason) {
            return await need(scheduler).runPlan(planId, reason);
        },
        async schedulerTick() {
            if (scheduler === undefined)
                return;
            await scheduler.tick();
        },
        platforms() {
            return buildPlatforms({
                store,
                registry,
                sessionOf: () => session,
                loginFlowOf: () => loginFlow,
                gate: platformGate,
                clock,
            });
        },
        loginStatuses() {
            return buildLoginStatuses({ registry, sessionOf: () => session, loginFlowOf: () => loginFlow });
        },
        startLogin(platformId) {
            // 登录引导会真的打开招聘站页面 —— 同样受离线闸门约束
            assertNetworkAllowed('打开招聘网站登录页');
            // 与 `crawl` 同一条纪律（R20）：只读实例不许开浏览器。
            // 两个实例共用一个 browser-profile 目录会互相踩，而登录引导恰好是**最长**的一次占用
            // （用户在里面输密码，可能几分钟）—— 恰恰是最不该被第二个实例插进来的场景。
            requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边登录，避免两个实例抢同一个浏览器 profile。');
            return need(loginFlow).start(platformId);
        },
        closeTodo(id) {
            return need(store).todo.close(id, clock());
        },
        guardUsage(platformId) {
            const opened = store;
            const since = `${clock().slice(0, 10)}T00:00:00.000Z`;
            // 数据层没就绪时 U0 仍要能渲染：如实说明，而不是抛错让首屏整块空掉
            if (opened === undefined) {
                return { since, platforms: [], note: '数据层尚未就绪 —— 暂时读不到额度余量。' };
            }
            const targets = platformId === undefined
                ? registry.list().map((adapter) => ({ id: adapter.id, displayName: adapter.displayName }))
                : (() => {
                    const adapter = registry.get(platformId);
                    if (adapter === undefined) {
                        throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
                            hint: '平台清单见 GET /platforms。',
                            detail: { platformId },
                        });
                    }
                    return [{ id: adapter.id, displayName: adapter.displayName }];
                })();
            return {
                since,
                platforms: targets.map((target) => ({
                    platformId: target.id,
                    displayName: target.displayName,
                    actions: guardUsageOf(opened, clock, target.id),
                })),
                note: '计数只算**今天成功**的动作（口径与闸门拒绝时同一份：审计表 + UTC 日）。' +
                    'limit 是 min(你的每日额度, 平台侧上限)；limitedBy=platform 时改自己的额度没有用。',
            };
        },
        adapterConfig(platformId) {
            return buildAdapterConfigOf(need(store), platformId);
        },
        updateAdapterConfig(platformId, override) {
            const opened = need(store);
            const spec = adapterSpecOf(platformId);
            if (spec === undefined) {
                throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
                    hint: '平台清单见 GET /platforms。',
                    detail: { platformId },
                });
            }
            // 只接受普通对象或 null：数组/字符串/数字都不是"一份配置覆盖"，
            // 放进去会在 merge 时被当成"没改"而静默无效（那正是最难查的一类问题）
            if (override !== null && (typeof override !== 'object' || Array.isArray(override))) {
                throw new DomainError('INVALID_INPUT', 'override 必须是一个 JSON 对象，或 null（清除覆盖）', {
                    hint: '只写你要改的键即可（会与代码默认值合并），例如 {"selectors":{"card":".joblist-item"}}。',
                });
            }
            const serialized = JSON.stringify(override ?? null);
            if (serialized.length > ADAPTER_CONFIG_MAX_CHARS) {
                throw new DomainError('INVALID_INPUT', `覆盖太大了（${String(serialized.length)} 字符，上限 ${String(ADAPTER_CONFIG_MAX_CHARS)}）`, {
                    hint: '配置覆盖只该写"要改的那几个键"，不该整份复制进来。',
                });
            }
            if (override === null) {
                opened.setting.remove(ADAPTER_CONFIG_KEY, 'platform', platformId);
            }
            else {
                opened.setting.set(ADAPTER_CONFIG_KEY, 'platform', platformId, override, clock());
            }
            // **重建并热替换**：配置是在 build 时快照进闭包的，只写库要等下次装配才生效（J2）
            const adapter = rebuildAdapter(spec, override ?? undefined, registry);
            const next = buildAdapterConfigOf(opened, platformId);
            bus.publish('adapter.config.updated', {
                platformId,
                keys: next.overrideKeys,
                cleared: override === null,
            });
            logger?.info(`[${PLUGIN_ID}] 适配器 ${platformId} 配置已更新并热生效（覆盖键：${next.overrideKeys.length === 0 ? '无（回到代码默认）' : next.overrideKeys.join('、')}；适配器 ${adapter.displayName}）`);
            return next;
        },
        // ── P20：数据保留、清理与可携带性（§18 / J8）──────────────────────
        storage() {
            return storageUsageOf(need(store), dataDir, clock);
        },
        cleanupPreview() {
            return cleanupPlanOf(need(store), clock);
        },
        runCleanup(only) {
            const opened = need(store);
            // 与 `crawl` / `startLogin` 同一条纪律：只读实例不许写库（两个实例抢同一个文件）
            requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边清理数据。');
            const result = runCleanupOf(opened, only === undefined ? {} : { only }, clock);
            if (result.totalRows > 0) {
                bus.publish('storage.cleaned', {
                    totalRows: result.totalRows,
                    dbBytesBefore: result.dbBytesBefore,
                    dbBytesAfter: result.dbBytesAfter,
                    vacuumed: result.vacuumed,
                });
            }
            logger?.info(`[${PLUGIN_ID}] 数据清理：${String(result.totalRows)} 行 · ` +
                `文件 ${String(result.dbBytesBefore)} → ${String(result.dbBytesAfter)} 字节` +
                `${result.vacuumed ? '（已 VACUUM）' : '（未 VACUUM）'}`);
            return result;
        },
        exportData(format) {
            const opened = need(store);
            const result = exportDataOf({ store: opened, filesDir: join(dataDir, 'files'), format }, clock);
            bus.publish('data.exported', { format, fileName: result.fileName, bytes: result.bytes.byteLength });
            return result;
        },
        saveExport(format) {
            const opened = need(store);
            const result = exportDataOf({ store: opened, filesDir: join(dataDir, 'files'), format }, clock);
            const dir = join(dataDir, EXPORTS_DIR_NAME);
            mkdirSync(dir, { recursive: true });
            const path = join(dir, basename(result.fileName));
            writeFileSync(path, result.bytes);
            bus.publish('data.exported', { format, fileName: result.fileName, bytes: result.bytes.byteLength });
            logger?.info(`[${PLUGIN_ID}] 已导出数据（${format}）→ ${path}（${String(result.bytes.byteLength)} 字节）`);
            return {
                fileName: result.fileName,
                path,
                bytes: result.bytes.byteLength,
                entries: result.entries,
                note: result.note,
            };
        },
        readExportFile(fileName) {
            // 只认文件名：`basename` 之外的一律拒绝 —— 与 `system/reveal` 同一条纪律
            // （不接受任意路径，于是"导入"永远不会读到你没预期的文件）
            const safe = basename(fileName);
            if (safe !== fileName || safe === '' || safe.startsWith('.')) {
                throw new DomainError('INVALID_INPUT', `只接受 exports/ 目录下的文件名：${fileName}`, {
                    hint: '用 data_transfer 的 export 动作先导出，再用返回的文件名导入。',
                });
            }
            const path = join(dataDir, EXPORTS_DIR_NAME, safe);
            try {
                return readFileSync(path, 'utf8');
            }
            catch (error) {
                throw new DomainError('NOT_FOUND', `读不到导出文件：${safe}`, {
                    hint: `它应该在本机的 ${join(dataDir, EXPORTS_DIR_NAME)} 目录下。`,
                    cause: error,
                });
            }
        },
        importJobs(input) {
            const opened = need(store);
            requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边导入数据。');
            const companyService = companies;
            const intelService = intel;
            const result = importJobsOf({
                store: opened,
                ensureCompany: (companyInput) => {
                    if (companyService === undefined) {
                        throw new DomainError('DATA_UNAVAILABLE', '公司服务还没就绪');
                    }
                    return companyService.ensureByName(companyInput, clock());
                },
                // 导入的岗位立刻算一遍匹配分与标注，与抓取来的岗位长得一样 ——
                // 否则用户在列表里看到一批"还没有分"的岗位，会以为导入没成功
                ...(intelService === undefined ? {} : { evaluate: (jobId) => intelService.evaluateJob(jobId, clock()) }),
            }, input, clock);
            if (result.inserted > 0 || result.updated > 0) {
                bus.publish('data.imported', {
                    inserted: result.inserted,
                    updated: result.updated,
                    skipped: result.skipped,
                });
            }
            logger?.info(`[${PLUGIN_ID}] 导入岗位（${input.format}）：新增 ${String(result.inserted)} · ` +
                `更新 ${String(result.updated)} · 跳过 ${String(result.skipped)}`);
            return result;
        },
        store() {
            return store;
        },
        jobs() {
            return jobs;
        },
        companies() {
            return companies;
        },
        sweepDedup() {
            const opened = need(store);
            const result = sweepDedup(opened, clock());
            // 复核会改分组：让界面（与其它窗口）知道该重拉，而不是等下次手动刷新
            if (result.merged > 0 || result.newGroups > 0) {
                bus.publish('dedup.swept', result);
            }
            logger?.info(`[dedup] 全库复核：看过 ${String(result.scanned)} 条 · 合并 ${String(result.merged)} 条 · ` +
                `新建 ${String(result.newGroups)} 组 · 疑似待确认 ${String(result.candidates)} 条`);
            return result;
        },
        registry() {
            return registry;
        },
        locks() {
            return platformLocks;
        },
        browser() {
            return browser;
        },
        close() {
            // 顺序有讲究：先停调度（别再排新任务），再关数据层，最后放租约
            scheduler?.stop();
            cancelHeartbeat();
            loginFlow?.cancelAll();
            try {
                store?.close();
            }
            catch (error) {
                logger?.warn(`[${PLUGIN_ID}] 关闭数据库失败：${messageOf(error)}`);
            }
            // 一次清空**全部**槽（清单在声明旁边，见 clearSlots）
            clearSlots();
            // PDF 渲染器是独立的 headless 实例：不关就是孤儿 Chromium（C12）
            void pdfRenderer.close().catch(() => undefined);
            lease.release();
            // 浏览器关闭是异步的：不阻塞卸载，但必须发起，否则会留孤儿 Chromium（§4.2.1）
            void browser.close().catch((error) => {
                logger?.warn(`[${PLUGIN_ID}] 关闭浏览器失败：${messageOf(error)}`);
            });
        },
    };
    return runtime;
}
//# sourceMappingURL=runtime.js.map