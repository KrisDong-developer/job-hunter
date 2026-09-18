/**
 * 宿主侧运行时装配（composition root）。
 *
 * 把各部件接起来：sqlite store、适配器注册表、全局互斥、浏览器管理器、领域服务、
 * 单实例租约、登录态、自排程器。入口层（http / tools）只跟这个门面打交道。
 *
 * **硬规则（§4.9）**：`apply()` 必须立即返回。所以数据层是**异步就绪**的：
 * `ready()` 返回一个 promise，而 apply 不 await 它；在它完成之前 `/health` 会如实报告
 * `dataReady: false` 与失败原因 —— 而不是让插件挂不上、或者让宿主启动被迁移拖慢。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAILY_CRAWL_LIMIT, PHASE, PLUGIN_ID, REQUEST_DELAY_MAX_MS, REQUEST_DELAY_MIN_MS, ROUTE_PREFIX, } from '../shared/constants.js';
import { createAiService } from './ai/client.js';
import { createLlmPort } from './ai/llm-port.js';
import { createCompanyService } from './domain/companies.js';
import { runCrawl } from './domain/crawl.js';
import { createJobService } from './domain/jobs.js';
import { createPipelineService } from './domain/pipeline.js';
import { createMessageService } from './domain/messages.js';
import { createInterviewService } from './domain/interviews.js';
import { createAnalyticsService } from './domain/analytics.js';
import { createCampusService } from './domain/campus.js';
import { createOverseasService } from './domain/overseas.js';
import { createOutreachService } from './domain/outreach.js';
import { createResumeService, stripContacts } from './domain/resumes.js';
import { createPdfRenderer } from './render/pdf.js';
import { createPlanService } from './domain/plans.js';
import { createIntelService } from './domain/intel.js';
import { buildToday, buildTodayUnavailable } from './domain/today.js';
import { createApprovalPort, renderApproval } from './guard/approval.js';
import { sendGreeting, GREETING_SEND_ACTION } from './guard/actions/greeting.js';
import { SETTINGS_WRITE_ACTION } from './guard/actions/settings.js';
import { createGuard } from './guard/index.js';
import { createEventBus } from './http/sse.js';
import { createFiftyOneAdapter, mergeFiftyOneConfig } from './platform/adapters/fiftyone-job.js';
import { createGuopinAdapter, mergeGuopinConfig } from './platform/adapters/guopin.js';
import { createLagouAdapter, mergeLagouConfig } from './platform/adapters/lagou.js';
import { createLiepinAdapter, mergeLiepinConfig } from './platform/adapters/liepin.js';
import { createWaiqiAdapter, mergeWaiqiConfig } from './platform/adapters/waiqi-job.js';
import { createZhaopinAdapter, mergeZhaopinConfig } from './platform/adapters/zhaopin.js';
import { createZhipinAdapter, mergeZhipinConfig } from './platform/adapters/zhipin.js';
import { browserPageSource, createBrowserManager } from './platform/browser.js';
import { readBrowserConfig, writeBrowserConfig } from './browser-config.js';
import { readAdapterHealth } from './platform/health.js';
import { createLease } from './platform/lease.js';
import { createMutex } from './platform/mutex.js';
import { createAdapterRegistry } from './platform/registry.js';
import { createLoginFlow, createSessionService, toAccountDto } from './platform/session.js';
import { createScheduler } from './scheduler/index.js';
import { cordisTimerPort, nativeTimerPort } from './scheduler/timer-port.js';
import { createSettingsService, describeSettingsPatch } from './settings.js';
import { resolveDataDir } from './store/db.js';
import { openStore } from './store/store.js';
import { toolExec } from './tools/exec-context.js';
import { DomainError, messageOf } from './util/errors.js';
import { assertNetworkAllowed, isOfflineMode, NO_NETWORK_ENV } from './util/offline.js';
import { systemClock } from './util/time.js';
/** 数据层未就绪时的统一错误。 */
export function dataNotReady(runtime) {
    const failure = runtime.failure();
    return new DomainError('DATA_UNAVAILABLE', failure?.message ?? '数据层尚未就绪', {
        ...(failure?.hint === undefined ? {} : { hint: failure.hint }),
    });
}
/** 从包清单读版本；读不到就退化，绝不因此让插件挂不上。 */
function readVersion() {
    try {
        const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
        return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
/** 租约心跳间隔。比 `LEASE_STALE_MS` 小得多，留足抖动余量。 */
const HEARTBEAT_MS = 30_000;
export function createHostRuntime(options = {}) {
    const logger = options.logger;
    const startedAt = Date.now();
    const version = readVersion();
    const dataDir = resolveDataDir(options.dataDir);
    const clock = systemClock;
    const timerPort = options.timer === undefined ? nativeTimerPort() : cordisTimerPort(options.timer);
    const registry = createAdapterRegistry();
    const mutex = createMutex();
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
            // 采集 / 补跑进行中：互斥锁被持有
            if (mutex.isBusy())
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
    let campus;
    let overseas;
    const pdfRenderer = createPdfRenderer({
        ...(logger === undefined ? {} : { logger }),
    });
    let toolReport = null;
    let heartbeatCancel = null;
    let failure = null;
    let readyPromise;
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
     * SR-16：**每平台独立**检查前置条件。
     *
     * 这是一个**纯判定**函数（不发请求、不改状态）—— 它回答的正是用户最想知道的那个问题：
     * 「为什么今天没跑？」。所以它的返回值直接进界面文案（SR-17/26）。
     *
     * 顺序：离线闸门 → 适配器健康 → 登录态 → 每日配额。
     * 顺序有讲究：越"根本、越不可能自愈"的原因越先报，
     * 否则"没到点/配额"这类会盖住"你的适配器已经坏了"。
     */
    const platformGate = (platformId) => {
        const opened = store;
        if (opened === undefined)
            return 'lease_lost';
        // 离线闸门（§14）：开了就**绝不**发起真实访问
        if (isOfflineMode())
            return 'offline_gate';
        const adapter = registry.get(platformId);
        if (adapter === undefined)
            return 'adapter_broken';
        const health = readAdapterHealth(opened, platformId);
        if (health.health === 'broken')
            return 'adapter_broken';
        // 登录态：只有"确实被登录墙挡过"才算未登录。
        // 全新安装时 account_state 是空的（logged_in=0），但 51job 的搜索本来就不需要登录 ——
        // 把"从没检查过"当成"没登录"会让定时任务永远不跑，那是个很隐蔽的死锁。
        const account = opened.account.get(platformId);
        if (account !== undefined && !account.loggedIn && account.lastCheckAt !== null)
            return 'not_logged_in';
        // SR-20/23：**每平台独立冷却** —— 这个平台刚失败过就先别去碰它。
        // 判定放在这里（而不是调度器里）是因为这里已经是"每平台前置条件"的唯一入口，
        // 写冷却在调度器（它才知道哪一轮失败了），读冷却在这里。
        const cooldown = opened.setting.get('cooldown-until', 'platform', platformId);
        if (cooldown !== null && typeof cooldown === 'object' && typeof cooldown.until === 'string') {
            const until = new Date(cooldown.until).getTime();
            if (!Number.isNaN(until) && until > new Date(clock()).getTime())
                return 'backoff';
        }
        // SR-3：每日上限（只算自动触发的那些；手动是人在操作，不该被这条挡住）
        const today = clock().slice(0, 10);
        const autoToday = opened.crawlRun
            .list(200, platformId)
            .filter((run) => run.startedAt.slice(0, 10) === today && run.reason !== 'manual').length;
        if (autoToday >= DAILY_CRAWL_LIMIT)
            return 'quota_reached';
        return null;
    };
    /** 当前启用简历的标识；没有简历时是 `{null, 0}`（此时分数一律算作"无简历基准"）。 */
    const currentResumeStamp = () => resumes?.scoreStamp() ?? { resumeId: null, rev: 0 };
    /** 从当前简历派生匹配偏好（§4.5.1：简历是最诚实的偏好声源）。 */
    const resumeProfile = () => {
        const current = resumes === undefined ? undefined : safeDefaultResume(resumes);
        if (current === undefined)
            return undefined;
        const content = current.content;
        const keywords = [
            ...content.skills.slice(0, 15).map((skill) => skill.name),
            ...content.basics.title.split(/[\s/、,，]+/),
        ].filter((token) => token.trim() !== '');
        return {
            keywords: [...new Set(keywords)].slice(0, 20),
            cities: content.basics.city === undefined ? [] : [content.basics.city],
        };
    };
    const readOnlyReason = () => {
        if (store === undefined)
            return failure?.message ?? '数据层尚未就绪';
        if (!lease.held()) {
            const status = lease.status();
            return `另一个实例正在运行（pid ${String(status.pid ?? '?')}）`;
        }
        return null;
    };
    /** 拿到租约后要做的事（心跳里可能晚一步才拿到）。 */
    let onLeaseAcquired = null;
    /** 心跳用 after 自链，两种 TimerPort 都能干净取消（C15）。 */
    const startHeartbeat = () => {
        const beat = () => {
            if (lease.held()) {
                lease.heartbeat();
            }
            else {
                // 只读实例不能就此躺平：上一个实例可能已经被强杀，
                // 等它的心跳过期后我们要能自己接管，而不是必须重启。
                const verdict = lease.acquire();
                if (verdict.held) {
                    logger?.info(`[${PLUGIN_ID}] 已接管租约（上一次持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期），开始调度`);
                    bus.publish('lease.acquired', { pid: process.pid });
                    onLeaseAcquired?.();
                }
            }
            heartbeatCancel = timerPort.after(HEARTBEAT_MS, beat);
        };
        heartbeatCancel = timerPort.after(HEARTBEAT_MS, beat);
    };
    const openDataLayer = () => {
        // 注意作用域：`opened` 必须在 try 之外可见 —— 下面租约与调度都要用它
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
            // 故意不抛出：数据层挂了插件仍要挂上去，
            // 好让 /health 与面板能告诉用户「为什么没有数据」，而不是静默消失。
            return;
        }
        store = opened;
        // 设置存在库里，而库要等租约拿到才打开 —— 所以空闲关闭时长在这里才装上。
        // 用户改设置时 settings 服务会再调一次 setIdleCloseMs，无需重启。
        try {
            const browserRuntimeConfig = readBrowserConfig(opened);
            browser.setIdleCloseMs(browserRuntimeConfig.idleCloseMinutes * 60_000);
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
        // 简历服务要先建：匹配分要读"当前简历版本"，而 jobs/intel 都需要它（§4.1）
        const filesDirPath = join(dataDir, 'files');
        resumes = createResumeService({
            store: opened,
            filesDir: filesDirPath,
            clock,
            ai,
            pdf: pdfRenderer,
            ...(logger === undefined ? {} : { logger }),
        });
        jobs = createJobService(opened, { scoreStamp: () => currentResumeStamp() });
        companies = createCompanyService(opened);
        // 注册表传进去：方案的平台与筛选条件必须按**适配器声明**校验（SR-39/41/42/45）
        plans = createPlanService(opened, clock, registry);
        session = createSessionService(opened, clock);
        // 适配器配置以 DB 为权威（ADR-19）：DB 覆盖合并到代码默认值之上
        const override = opened.setting.get('adapter-config', 'platform', '51job');
        registry.register(createFiftyOneAdapter({
            config: mergeFiftyOneConfig(override),
            // P5：请求之间要随机延时，别踩出规律性的节奏
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 51job 已注册（配置来源：${override === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 拉勾（lagou.com）：列表公开可爬，但被 WAF 滑块挡门（antiBot=high）——
        // 关键词进路径段、城市用中文名；翻页读「下一页」真实 href，不自己拼拼音 slug。
        // 详见适配器文件头。
        const lagouOverride = opened.setting.get('adapter-config', 'platform', 'lagou');
        registry.register(createLagouAdapter({
            config: mergeLagouConfig(lagouOverride),
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 lagou 已注册（配置来源：${lagouOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 神仙外企（waiqi.com）：列表走接口、DOM 不承载岗位数据 —— 详见适配器文件头。
        const waiqiOverride = opened.setting.get('adapter-config', 'platform', 'waiqi');
        registry.register(createWaiqiAdapter({
            config: mergeWaiqiConfig(waiqiOverride),
            // P5：请求之间要随机延时，别踩出规律性的节奏
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 waiqi 已注册（配置来源：${waiqiOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 智联招聘（zhaopin.com）：搜索页是 /sou/jl<城市码>，**不是** /jobs?jl= 那条老路由 ——
        // 两条路由的 DOM 完全不同，详见适配器文件头。
        const zhaopinOverride = opened.setting.get('adapter-config', 'platform', 'zhaopin');
        registry.register(createZhaopinAdapter({
            config: mergeZhaopinConfig(zhaopinOverride),
            // P5：请求之间要随机延时，别踩出规律性的节奏
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 zhaopin 已注册（配置来源：${zhaopinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 猎聘（liepin.com）：风控最强（检测"CDP 控制页面"本身）—— 依赖 D-17a
        // 环境一致性三件套（patchright 引擎 + stealth 注入 + 端口守卫，平台层已就位）。
        // 适配器只做 URL 导航 + 语义锚点解析 + 判墙即停；锚点待 probe:liepin 夹具校准。
        const liepinOverride = opened.setting.get('adapter-config', 'platform', 'liepin');
        registry.register(createLiepinAdapter({
            config: mergeLiepinConfig(liepinOverride),
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 liepin 已注册（配置来源：${liepinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // BOSS 直聘（zhipin.com）：与猎聘同路线（D-17a 三件套）。2026-09-18 夹具校准：
        // 未登录可搜（薪资隐藏 → requiredFields 不含 salary_raw）；详情选择器来自
        // BossHunter site-patterns（2026-05-26 验证）。
        const zhipinOverride = opened.setting.get('adapter-config', 'platform', 'zhipin');
        registry.register(createZhipinAdapter({
            config: mergeZhipinConfig(zhipinOverride),
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 zhipin 已注册（配置来源：${zhipinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 国聘网（iguopin.com）：「国聘行动」官方平台，央企/国企/事业单位为主。
        // 2026-09-18 真实线上调研（列表页 /jobList?keyword=，详情 /job/detail?id=）。
        // v1 语义锚点单页采集：分页参数与城市码未确证，**不编** —— 见适配器文件头。
        const guopinOverride = opened.setting.get('adapter-config', 'platform', 'guopin');
        registry.register(createGuopinAdapter({
            config: mergeGuopinConfig(guopinOverride),
            delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
        }));
        logger?.info(`[${PLUGIN_ID}] 适配器 guopin 已注册（配置来源：${guopinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`);
        // 平台实体随适配器注册一起登记：account_state 有指向 platform 的外键，
        // 而用户可能在第一次抓取之前就先点「登录」。
        for (const adapter of registry.list()) {
            opened.platform.ensure({ id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities }, clock());
        }
        // 情报引擎（P4）：先幂等播种内置词表，再装配服务
        intel = createIntelService(opened, clock, {
            resumeProfile,
            scoreStamp: currentResumeStamp,
        });
        const seeded = intel.seedDictionary();
        if (seeded > 0)
            logger?.info(`[${PLUGIN_ID}] 已播种 ${String(seeded)} 条内置词表`);
        // ── P5：安全与模型层 ────────────────────────────────────────────
        guard = createGuard({
            store: opened,
            session,
            approval: approvalPort,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
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
        ai = createAiService({
            store: opened,
            llm: () => llmPort,
            onDegrade: (info) => {
                // 降级必须可见：用户要能知道"这次给你的不是模型结果"（J10）
                logger?.info(`[${PLUGIN_ID}] 模型用途 ${info.purpose} 降级：${info.reason}`);
                bus.publish('llm.degraded', { purpose: info.purpose, reason: info.reason });
            },
        });
        outreach = createOutreachService({
            store: opened,
            ai,
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
            ai,
            clock,
            browser: {
                read: () => readBrowserConfig(opened),
                // 写完立刻作用到浏览器实例上：改设置不该要求重启插件
                write: (patch) => {
                    const next = writeBrowserConfig(opened, patch, clock());
                    browser.setIdleCloseMs(next.idleCloseMinutes * 60_000);
                    browser.applyRuntimeConfig({ engine: next.engine, stealthInit: next.stealthInit });
                    return next;
                },
            },
        });
        // ── P7：跟进与看板 ──────────────────────────────────────────────
        // guardRun 把"走闸门"这件事以回调形式注进去，领域层因此不需要 import guard
        // （依赖方向保持 domain ← guard，而不是互相依赖）
        const guardRun = async (input, fn) => {
            if (guard === undefined)
                throw dataNotReady(runtime);
            return await guard.run({
                action: input.action,
                actor: input.actor,
                danger: input.danger,
                ...(input.target === undefined ? {} : { target: input.target }),
                ...(input.payload === undefined ? {} : { payload: input.payload }),
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async () => await fn());
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
            guardRun,
            ai,
            ...(logger === undefined ? {} : { logger }),
        });
        interviews = createInterviewService({
            store: opened,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        analytics = createAnalyticsService({ store: opened, clock });
        // ── P8：校招与海外支线 ──────────────────────────────────────────
        campus = createCampusService({
            store: opened,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        overseas = createOverseasService({
            store: opened,
            ai,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        // 硬截止进待办：这些节点**不可逆**，所以必须是 urgent 而不是普通提示。
        // 用 createOnce 保证反复 tick 不会堆出一串同样的待办。
        try {
            for (const deadline of campus.deadlines()) {
                if (!deadline.urgent)
                    continue;
                opened.todo.createOnce({
                    kind: 'deadline',
                    level: 'urgent',
                    title: `${deadline.label}（${deadline.overdue ? '已过期' : `剩 ${String(deadline.hoursLeft)} 小时`}）`,
                    ref: `${deadline.kind}:${String(deadline.refId)}`,
                    detail: {
                        kind: deadline.kind,
                        refId: deadline.refId,
                        dueAt: deadline.dueAt,
                        irreversible: deadline.irreversible,
                        hint: '校招的笔试/网申/三方错过就是终态，没有第二次机会。',
                    },
                }, clock());
            }
        }
        catch (error) {
            logger?.warn(`[${PLUGIN_ID}] 硬截止写待办失败（不影响其它功能）：${messageOf(error)}`);
        }
        logger?.info(`[${PLUGIN_ID}] 安全闸门已就绪（审批通道：${approvalService === undefined ? '无 → 高危一律拒绝' : '有'}）；` +
            `模型：${llmPort === undefined ? '未配置 → 全部降级为规则/模板' : '已接入'}`);
        if (isOfflineMode()) {
            logger?.warn(`[${PLUGIN_ID}] 离线模式已开启（${NO_NETWORK_ENV}）：抓取与登录引导一律拒绝，` +
                '这是「自动化测试绝不访问真实招聘站」的机制化兜底。');
        }
        bus.publish('data.ready', { path: opened.path });
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
        startHeartbeat();
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
            }),
            timer: timerPort,
            events: bus,
            canSchedule,
            readOnlyReason,
            leaseStatus: () => lease.status(),
            platformGate,
            clock,
            ...(logger === undefined ? {} : { logger }),
        });
        onLeaseAcquired = () => {
            scheduler?.start();
        };
        scheduler.start();
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
            const opened = store;
            const base = {
                ok: true,
                name: PLUGIN_ID,
                version,
                phase: PHASE,
                routePrefix: ROUTE_PREFIX,
                hostUptimeMs: Date.now() - startedAt,
            };
            if (opened === undefined) {
                return {
                    ...base,
                    dataReady: false,
                    dataPath: null,
                    jobCount: 0,
                    companyCount: 0,
                    pendingRepairCount: 0,
                    lastCrawl: null,
                    adapters: [],
                    dataError: failure?.message ?? '数据层尚未就绪',
                    offline: isOfflineMode(),
                    tools: toolReport,
                };
            }
            return {
                ...base,
                dataReady: true,
                dataPath: opened.path,
                jobCount: opened.job.count(),
                companyCount: opened.company.count(),
                pendingRepairCount: opened.repair.countPending(),
                lastCrawl: opened.crawlRun.latest() ?? null,
                adapters: registry.list().map((adapter) => {
                    const snapshot = readAdapterHealth(opened, adapter.id);
                    return {
                        platformId: adapter.id,
                        health: snapshot.health,
                        failStreak: snapshot.failStreak,
                        lastOkAt: snapshot.lastOkAt,
                        fields: snapshot.fields,
                        reason: snapshot.reason,
                    };
                }),
                dataError: null,
                offline: isOfflineMode(),
                tools: toolReport,
            };
        },
        today() {
            const opened = store;
            if (opened === undefined) {
                return buildTodayUnavailable(failure?.message ?? '数据层尚未就绪', systemClock());
            }
            return buildToday({ store: opened, registry, clock });
        },
        crawlStatus() {
            const opened = store;
            const adapters = registry.list().map((adapter) => {
                const snapshot = opened === undefined
                    ? { health: 'healthy', failStreak: 0, lastOkAt: null, reason: null, fields: [] }
                    : readAdapterHealth(opened, adapter.id);
                return {
                    platformId: adapter.id,
                    health: snapshot.health,
                    failStreak: snapshot.failStreak,
                    lastOkAt: snapshot.lastOkAt,
                    fields: snapshot.fields,
                    reason: snapshot.reason,
                };
            });
            return {
                busy: mutex.isBusy(),
                paused: adapters.filter((adapter) => adapter.health !== 'healthy').map((adapter) => adapter.platformId),
                adapters,
                recentRuns: opened?.crawlRun.list(10) ?? [],
            };
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
            if (!lease.held()) {
                throw new DomainError('CONFLICT', readOnlyReason() ?? '本实例不持有租约', {
                    hint: '另一个实例正在运行 —— 请在那边抓取。',
                });
            }
            bus.publish('crawl.started', { platformId: options.platformId, criteria: options.criteria });
            try {
                const summary = await runCrawl({
                    store: opened,
                    registry,
                    mutex,
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
            if (intel === undefined)
                throw dataNotReady(runtime);
            return intel;
        },
        // ── P5：安全与工具 ────────────────────────────────────────────────
        guard() {
            if (guard === undefined)
                throw dataNotReady(runtime);
            return guard;
        },
        ai() {
            if (ai === undefined)
                throw dataNotReady(runtime);
            return ai;
        },
        outreach() {
            if (outreach === undefined)
                throw dataNotReady(runtime);
            return outreach;
        },
        settings() {
            if (settings === undefined)
                throw dataNotReady(runtime);
            return settings;
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
            if (resumes === undefined)
                throw dataNotReady(runtime);
            return resumes;
        },
        filesDir() {
            return join(dataDir, 'files');
        },
        pdfRendererRunning() {
            return pdfRenderer.isRunning();
        },
        pipeline() {
            if (pipeline === undefined)
                throw dataNotReady(runtime);
            return pipeline;
        },
        messages() {
            if (messages === undefined)
                throw dataNotReady(runtime);
            return messages;
        },
        interviews() {
            if (interviews === undefined)
                throw dataNotReady(runtime);
            return interviews;
        },
        analytics() {
            if (analytics === undefined)
                throw dataNotReady(runtime);
            return analytics;
        },
        followUps() {
            return pipeline?.followUpSuggestions() ?? [];
        },
        unreadCount() {
            return messages?.unreadCount() ?? 0;
        },
        campus() {
            if (campus === undefined)
                throw dataNotReady(runtime);
            return campus;
        },
        overseas() {
            if (overseas === undefined)
                throw dataNotReady(runtime);
            return overseas;
        },
        deadlines() {
            return campus?.deadlines() ?? [];
        },
        async draftGreeting(input) {
            const service = outreach;
            if (service === undefined)
                throw dataNotReady(runtime);
            return await service.draft({
                jobId: input.jobId,
                ...(input.tone === undefined ? {} : { tone: input.tone }),
                ...(input.highlights === undefined ? {} : { highlights: input.highlights }),
                ...(input.extra === undefined ? {} : { extra: input.extra }),
            });
        },
        async sendGreeting(input) {
            const opened = store;
            const service = outreach;
            const gate = guard;
            const sessionService = session;
            if (opened === undefined || service === undefined || gate === undefined || sessionService === undefined) {
                throw dataNotReady(runtime);
            }
            const job = opened.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
                    hint: '它可能已被删除；先用 job_list 看当前有哪些岗位。',
                });
            }
            // 文本没给就现生成 —— 生成是**低危**的（不发送），所以它理应发生在闸门之前
            let text = input.text?.trim() ?? '';
            let via = 'given';
            if (text === '') {
                const draft = await service.draft({ jobId: job.id });
                text = draft.text;
                via = draft.via;
            }
            const result = await gate.run({
                action: GREETING_SEND_ACTION,
                actor: input.actor,
                danger: 'high',
                target: {
                    jobId: job.id,
                    platformId: job.platformId,
                    ...(job.companyId === null ? {} : { companyId: job.companyId }),
                },
                payload: {
                    // 正文只用于**审批展示**；审计里只留长度（§4.1）
                    text,
                    jobTitle: job.title,
                    company: job.companyName ?? '',
                    // §4.4.2 要求审批文案显示"用了哪版简历" —— 打招呼不用简历，如实写出来
                    resumeVersion: '不适用（打招呼只发文本）',
                    draftVia: via,
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => await sendGreeting({
                store: opened,
                registry,
                session: sessionService,
                pageSource: browserPageSource(browser),
                clock,
                ...(logger === undefined ? {} : { logger }),
                // P7：发送**成功后**记一笔接触记录（接触态的载体，§7.0）
                record: (recorded) => {
                    pipeline?.recordGreetingSent(recorded);
                    bus.publish('greeting.recorded', {
                        jobId: recorded.jobId,
                        actor: recorded.actor,
                    });
                },
            }, token, { jobId: job.id, text }));
            bus.publish('greeting.sent', {
                jobId: result.jobId,
                platformId: result.platformId,
                company: result.company,
                actor: input.actor,
            });
            return result;
        },
        async updateSettings(patch, actor, guiConfirmed) {
            const opened = store;
            const service = settings;
            const gate = guard;
            if (opened === undefined || service === undefined || gate === undefined)
                throw dataNotReady(runtime);
            // 禁止项检查看的是**顶层键**，所以 guard 那半边要摊平传进去
            //（否则 `requireApproval` 藏在 patch.guard 里就查不到了）。
            const guardPatch = (patch.guard ?? {});
            const description = describeSettingsPatch(patch);
            return await gate.run({
                action: SETTINGS_WRITE_ACTION,
                actor,
                danger: 'mid',
                payload: { patch: guardPatch, description },
                ...(guiConfirmed === true ? { guiConfirmed: true } : {}),
            }, async (token) => {
                const next = service.update(patch, token);
                bus.publish('settings.updated', { by: actor, description });
                return next;
            });
        },
        // ── P3 ────────────────────────────────────────────────────────────
        plans() {
            if (plans === undefined)
                throw dataNotReady(runtime);
            return plans;
        },
        schedulerStatus() {
            if (scheduler === undefined) {
                // 数据层还没就绪：如实报告，并且**每个字段都给一个真值** ——
                // 少一个字段就是界面上一个 `undefined`，比空态更难查。
                return {
                    scheduling: false,
                    readOnly: true,
                    readOnlyReason: readOnlyReason() ?? '数据层尚未就绪',
                    armed: false,
                    nextRunAt: null,
                    lastRunAt: null,
                    running: false,
                    plans: [],
                    lease: lease.status(),
                    timezone: 'UTC',
                    jitterMs: 0,
                    paused: false,
                    pausedReason: null,
                    planStatus: [],
                    triggers: [],
                    recentRuns: [],
                    refreshSuggested: false,
                    refreshHint: null,
                };
            }
            return scheduler.status();
        },
        setSchedulePaused(paused, reason) {
            const instance = scheduler;
            if (instance === undefined)
                throw dataNotReady(runtime);
            instance.setPaused(paused, reason);
        },
        resumeRisk(planId) {
            const instance = scheduler;
            if (instance === undefined)
                throw dataNotReady(runtime);
            instance.resumeRisk(planId);
        },
        recheckLease() {
            // 只读实例不能躺平等：上一个实例可能刚被关掉，这里立刻重试一次
            if (!lease.held()) {
                const verdict = lease.acquire();
                if (verdict.held) {
                    logger?.info(`[${PLUGIN_ID}] 重新检测后接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')}）`);
                    bus.publish('lease.acquired', { pid: process.pid });
                    onLeaseAcquired?.();
                }
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
            const verdict = lease.acquire();
            if (!verdict.held) {
                throw new DomainError('CONFLICT', '接管租约失败', {
                    hint: '另一个实例刚刚又活过来了。点「重新检测」看看当前状态。',
                });
            }
            logger?.warn(`[${PLUGIN_ID}] 人工接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期）`);
            bus.publish('lease.acquired', { pid: process.pid });
            onLeaseAcquired?.();
            return runtime.schedulerStatus();
        },
        async runPlan(planId, reason) {
            if (scheduler === undefined)
                throw dataNotReady(runtime);
            return await scheduler.runPlan(planId, reason);
        },
        async schedulerTick() {
            if (scheduler === undefined)
                return;
            await scheduler.tick();
        },
        platforms() {
            const opened = store;
            return registry.list().map((adapter) => {
                const record = opened?.platform.get(adapter.id);
                const snapshot = opened === undefined
                    ? { health: 'healthy', failStreak: 0, lastOkAt: null, reason: null, fields: [] }
                    : readAdapterHealth(opened, adapter.id);
                const account = session?.status(adapter.id) ?? {
                    platformId: adapter.id,
                    loggedIn: false,
                    hiddenFromCurrentEmployer: null,
                    lastCheckAt: null,
                    hint: null,
                    updatedAt: null,
                };
                const login = loginFlow?.status(adapter.id);
                return {
                    id: adapter.id,
                    displayName: adapter.displayName,
                    enabled: record?.enabled ?? true,
                    capabilities: adapter.capabilities,
                    health: snapshot.health,
                    healthReason: snapshot.reason,
                    failStreak: snapshot.failStreak,
                    lastOkAt: snapshot.lastOkAt,
                    account: toAccountDto(account),
                    fields: snapshot.fields,
                    login: { state: login?.state ?? 'idle', message: login?.message ?? null },
                };
            });
        },
        loginStatuses() {
            return registry.list().map((adapter) => {
                if (loginFlow !== undefined)
                    return loginFlow.status(adapter.id);
                const account = session?.status(adapter.id);
                return {
                    platformId: adapter.id,
                    state: 'idle',
                    message: null,
                    startedAt: null,
                    account: toAccountDto(account ?? {
                        platformId: adapter.id,
                        loggedIn: false,
                        hiddenFromCurrentEmployer: null,
                        lastCheckAt: null,
                        hint: null,
                        updatedAt: null,
                    }),
                };
            });
        },
        startLogin(platformId) {
            // 登录引导会真的打开招聘站页面 —— 同样受离线闸门约束
            assertNetworkAllowed('打开招聘网站登录页');
            const flow = loginFlow;
            if (flow === undefined)
                throw dataNotReady(runtime);
            return flow.start(platformId);
        },
        closeTodo(id) {
            const opened = store;
            if (opened === undefined)
                throw dataNotReady(runtime);
            return opened.todo.close(id, clock());
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
        registry() {
            return registry;
        },
        mutex() {
            return mutex;
        },
        browser() {
            return browser;
        },
        close() {
            // 顺序有讲究：先停调度（别再排新任务），再关数据层，最后放租约
            scheduler?.stop();
            if (heartbeatCancel !== null) {
                heartbeatCancel();
                heartbeatCancel = null;
            }
            loginFlow?.cancelAll();
            try {
                store?.close();
            }
            catch (error) {
                logger?.warn(`[${PLUGIN_ID}] 关闭数据库失败：${messageOf(error)}`);
            }
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
/** 从当前简历派生匹配偏好时用的小工具：没有简历就返回 undefined（不是抛错）。 */
function safeDefaultResume(service) {
    try {
        const listed = service.list().find((item) => item.isDefault && item.state === 'active');
        if (listed === undefined)
            return undefined;
        return { content: service.get(listed.id).content };
    }
    catch {
        // 简历坏了不该让「岗位列表」整个挂掉
        return undefined;
    }
}
//# sourceMappingURL=runtime.js.map