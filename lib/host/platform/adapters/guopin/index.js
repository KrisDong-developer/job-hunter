import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_GUOPIN_CONFIG, GUOPIN_BLOCK_SIGNALS, GUOPIN_LOGIN_URL, GUOPIN_MAX_PAGES } from './config.js';
import { extractDetailInPage } from './page/detail.js';
import { extractJobsInPage, hasNextPageInPage, isLoggedInByMarkersInPage, turnToPageInPage } from './page/list.js';
import { buildGuopinSearchUrl } from './urls.js';
import { buildGuopinListBody, fetchGuopinListInPage, guopinListPageOf, } from './api.js';
import { GUOPIN_EXPERIENCE_OPTIONS, GUOPIN_MAJOR_OPTIONS } from './dictionaries.js';
/** 构造国聘网适配器。 */
export function createGuopinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_GUOPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        {
            key: 'keyword',
            label: '关键词',
            values: [],
            hint: '自由文本，平台原样接收',
            wire: { target: 'url', param: config.urlParams.keywordParam },
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            // 空表 ≠ 自由文本：`buildGuopinSearchUrl` 带城市但表里没有就返回 null（**不猜**）。
            closed: true,
            hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
        },
        {
            key: 'experience',
            label: '工作经验',
            values: GUOPIN_EXPERIENCE_OPTIONS,
            hint: '对应接口的 `search.experience`（**数组**，2026-09-21 探针实测：点「1-3年」→ ' +
                '`search.experience=["113aJGtA"]`，api-diff 验证 total 400→48）',
            wire: { target: 'body', param: 'experience' },
        },
        {
            key: 'major',
            label: '专业',
            values: GUOPIN_MAJOR_OPTIONS,
            hint: '对应接口的 `search.major`（**数组**，2026-09-21 探针实测：api-diff 验证 400→364）。' +
                '同一份字典里的其它键按测过的形状**不生效**，所以没声明',
            wire: { target: 'body', param: 'major' },
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
    /**
     * 接口路径的结论按**页面**缓存：`gotoSearch` 取一次，`readListPage` / `hasNextPage` 复用。
     * （waiqi / sinojobs 同款：契约是"先导航再读"，中间没有别的通道放这份数据。）
     */
    const listCache = new WeakMap();
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
            /**
             * 预览：国聘的筛选**只在接口请求体**里（URL 不认），所以预览必须给那条请求，
             * 否则界面上会显示"这个方案什么都没筛"。与采集走同一个 `buildGuopinListBody`。
             *
             * ⚠️ **带城市就必须先看 `buildGuopinSearchUrl`**：城市码表是空的，采集端
             * （`gotoSearch`）遇到未列城市会直接抛错跳过这一轮。这里要是照样给出一条
             * POST，界面上就是"这个筛选好着呢"，而真跑起来这一轮压根不会发生 ——
             * 那正是 preview 这个模块要消灭的那种"筛了没结果 / 根本没筛"的错觉。
             */
            preview(criteria) {
                const url = buildGuopinSearchUrl(config, criteria);
                // 构造不出页面地址 = 这一轮会被跳过 —— 如实返回 null，别给一条发不出去的请求。
                if (url === null)
                    return null;
                const body = buildGuopinListBody(criteria, criteria.page ?? 1, config.listApi.pageSize);
                const params = {};
                const parsed = JSON.parse(body);
                for (const [key, value] of Object.entries(parsed.search)) {
                    params[key] = Array.isArray(value) ? value.join(',') : String(value);
                }
                return {
                    url: `${config.listApi.base}${config.listApi.path}`,
                    method: 'POST',
                    params,
                    body,
                    crawlOnly: [],
                };
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
                // ── 首选：**列表接口**（2026-09-21 探针实测）──────────────────────────
                // 筛选条件只在这条请求的 body 里（页面 URL 不认），而且接口直接给出分页真值
                // （`total/page/page_size`）—— 于是"页面内连点下一页"那套麻烦事也不必了。
                // 拿不到（离线夹具没有 fetch / 接口挂了 / 被墙）就落到下面的 DOM 路径。
                const apiPage = guopinListPageOf(await page
                    .evaluate(fetchGuopinListInPage, {
                    url: `${config.listApi.base}${config.listApi.path}`,
                    body: buildGuopinListBody(criteria, criteria.page ?? 1, config.listApi.pageSize),
                })
                    .catch(() => null), config);
                if (apiPage !== null) {
                    listCache.set(page, apiPage);
                    if (delayMax > 0) {
                        await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                    }
                    await humanBrowse(page);
                    return;
                }
                // ── 兜底：老的 DOM 路径 ──────────────────────────────────────────────
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
                const cached = listCache.get(page);
                if (cached !== undefined)
                    return cached.jobs;
                return await page.evaluate(extractJobsInPage, config);
            },
            async hasNextPage(page) {
                // 接口给了 total → "还有没有下一页"是个算术题，不必再看分页控件。
                const cached = listCache.get(page);
                if (cached !== undefined) {
                    return cached.pageSize > 0 && cached.page * cached.pageSize < cached.total;
                }
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