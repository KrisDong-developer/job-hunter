import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_GUOPIN_CONFIG, GUOPIN_BLOCK_SIGNALS, GUOPIN_LOGIN_URL, GUOPIN_MAX_PAGES } from './config.js';
import { extractDetailInPage } from './page/detail.js';
import { extractJobsInPage, hasNextPageInPage, isLoggedInByMarkersInPage, turnToPageInPage } from './page/list.js';
import { buildGuopinSearchUrl } from './urls.js';
/** 构造国聘网适配器。 */
export function createGuopinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_GUOPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            // 空表 ≠ 自由文本：`buildGuopinSearchUrl` 带城市但表里没有就返回 null（**不猜**）。
            closed: true,
            hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: GUOPIN_MAX_PAGES,
            hint: 'ant 分页自报 20 页（每页 20 条）。⚠️ URL `?page=` 无效（SPA 忽略，2026-09-20 实测）—— ' +
                '第 N 页靠页面内连点「下一页」到达，每页都会重新导航再点击，页数越大请求越密，建议 2–5 页',
        },
    ];
    return {
        id: 'guopin',
        ...platformFacts('guopin'),
        displayName: '国聘网',
        capabilities: {
            // 列表页未登录可看（投递才要登录）。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 列表薪资 18/20 卡片有（少数没有、JD 只在详情页）→ medium 如实声明，不夸大。
            fieldCompleteness: 'medium',
            antiBot: 'low',
        },
        // 少数卡片无 .job-salary、无平台 id（幂等键用内容哈希）→ 核心必需字段只声明 title/company/source_url。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: GUOPIN_MAX_PAGES,
        // 默认 1 页是保守取舍（不是平台事实）：翻页要「重新导航 + 连点 next」，请求比 URL 翻页贵，
        // 想抓深就在方案里显式配 maxPages（上限 20，ant 分页自报）。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildGuopinSearchUrl(config, criteria);
            },
        },
        /**
         * 登录态检测（2026-09-20 补，锚点两端实测：未登录夹具 vs 登录态快照）。
         *
         * 为什么需要它：列表未登录可看，但**详情页投递/申请**要登录态；`adapter.auth` 缺席时
         * `platforms.loginStatus('guopin')` 会抛「没有声明登录入口」，用户既看不到登录态、
         * 也没法走登录引导（zhipin 2026-09-19 踩过同款坑，见其 index.ts 的 auth 注释）。
         */
        auth: {
            // 登录 URL 有据：未登录列表页头 `a.login`「登录/注册」的 href 就是 `/login?redirect=…`。
            loginUrl: GUOPIN_LOGIN_URL,
            async isLoggedIn(page) {
                const verdict = await page.evaluate(isLoggedInByMarkersInPage, {
                    loggedIn: config.loginSelectors.loggedIn,
                    notLoggedIn: config.loginSelectors.notLoggedIn,
                });
                // 判不出来时按"未登录"处理（保守，见 isLoggedInByMarkersInPage 的说明）。
                return verdict ?? false;
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildGuopinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`国聘网：城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                await page.goto(url);
                // 页面服务端可渲染，但仍等一次卡片容器存在：0 条最易被误读成「今天没有新岗位」。
                // 超时**不在这里抛**（与 zhipin 同口径）：真路径上 `waitForSelector` 超时会抛错，
                // 而这里抛出去会把"被登录墙/验证码顶掉"直接讲成一次导航失败 —— 那道墙该由
                // `guard.detectBlock` 分类、由 `readListPage` 的 0 条兜底，不该在半路截胡。
                if (page.waitForSelector !== undefined) {
                    try {
                        await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                    }
                    catch {
                        /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
                    }
                }
                // 第 N 页（N>1）：URL `?page=` 被 SPA 忽略（2026-09-20 实测）—— 只能页面内
                // 连点「下一页」到位。翻不到目标页就**抛错**：继续读会把第 1 页当第 N 页
                // 重复采集，那比失败更糟（内容哈希幂等键会悄悄吞掉，连重复都看不出来）。
                const targetPage = criteria.page ?? 1;
                if (targetPage > 1) {
                    const turned = await page.evaluate(turnToPageInPage, {
                        next: config.selectors.paginationNext,
                        nextDisabled: config.selectors.paginationNextDisabled,
                        active: config.selectors.paginationActive,
                        targetPage,
                        stepTimeoutMs: config.pageTurnTimeoutMs,
                    });
                    if (turned !== true) {
                        throw new Error(`国聘网：翻到第 ${String(targetPage)} 页失败（分页点击无响应或已到末页）`);
                    }
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
                await humanBrowse(page);
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, config);
            },
            async hasNextPage(page) {
                // 真实分页状态（2026-09-20 实测 ant 分页）：next 存在且不带 disabled → 还有下一页。
                // 分页区整个不在（0 条结果 / 离线夹具）→ false。
                return await page.evaluate(hasNextPageInPage, {
                    next: config.selectors.paginationNext,
                    nextDisabled: config.selectors.paginationNextDisabled,
                });
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                    deadlinePattern: config.deadlinePattern,
                    salaryPattern: config.salaryPattern,
                    eduPattern: config.eduPattern,
                    expPattern: config.expPattern,
                    naturePattern: config.naturePattern,
                    companyNaturePattern: config.companyNaturePattern,
                    companySizePattern: config.companySizePattern,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(GUOPIN_BLOCK_SIGNALS),
                    card: config.selectors.card,
                });
            },
        },
        // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
        //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
    };
}
//# sourceMappingURL=index.js.map