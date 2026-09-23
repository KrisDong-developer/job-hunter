import { humanBrowse } from '../../humanize.js';
import { humanDelayMs } from '../../pacing.js';
import { platformFacts } from '../../platform-facts.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { actionBlockOf, PlatformBlockedError, platformCriterion } from '../../types.js';
import { createZhipinActions } from './actions.js';
import { extrasMapOf, fetchJoblistInPage } from './api.js';
import { DEFAULT_ZHIPIN_CONFIG, ZHIPIN_DEFAULT_SCROLL_ROUNDS, ZHIPIN_FILTER_OPTIONS, ZHIPIN_MAX_PAGES, ZHIPIN_MAX_SCROLL_ROUNDS, ZHIPIN_PAGE_SIZE, } from './config.js';
import { extractDetailInPage } from './page/detail.js';
import { extractJobsInPage, isLoggedInByMarkersInPage, scrollToLoadInPage } from './page/list.js';
import { ZHIPIN_BODY_FIELDS, buildJoblistBody, buildZhipinSearchUrl, zhipinFiltersOf, } from './urls.js';
/** JSON.parse 的防爆壳：截获到的响应体不是 JSON（被换成验证页/空体）就当没有。 */
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_ZHIPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const logger = options.logger;
    /**
     * 记住每个页面最近一次 `gotoSearch` 的搜索条件 —— 供 `readListPage` 构造
     * joblist 请求体（那条通道要靠**同一组条件**才能问出同一批岗位的补充字段）。
     * `rounds` 一起记：回填要翻几页接口由它联动（滚了 N 屏就最多补 N 页）。
     * `filters` 一起记（2026-09-23 起方案可带筛选）：不带它们去回填，接口返回的
     * 是**没筛过**的一页，与页面上筛过的 DOM 卡片对不上号，补充字段全部回填不到。
     *
     * `seenExtras` 是 **SPA 自己发过的 joblist 响应**（gotoSearch 期间截获）：
     * 回填优先用它 —— 滚动加载时这批数据已经到过本机一次，再原样 POST 一遍
     * 等于把请求量翻倍，而平台风控看到的正是"同参数连发"这种机器特征
     * （2026-09-23 实测：scrollRounds=20 → 滚动 20 个 POST + 回填 20 个 POST，
     * 回填从第 6 页起被限流，securityId/薪资覆盖率掉到 ~25%）。
     *
     * 主链顺序 `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的
     * （与 liepin 的 `lastSearch` 同一模式）。
     */
    const lastSearch = new WeakMap();
    /**
     * 判墙的**唯一实现**（采集与动作链共用）。
     *
     * 抽出来是因为它现在有两个调用方：`guard.detectBlock`（主链在列表/详情页上判）
     * 与 `assertActionPage`（动作在岗位页/会话页上判）。各写一遍
     * `page.evaluate(detectBlockWithSignals, …)` 的话，改信号集时漏掉一处就会出现
     * "采集认得这道墙、动作不认得"——而动作那边恰恰是**会真发东西**的一侧。
     *
     * 信号只声明 BOSS 特有的 URL 特征：滑块页 `zhipin.com/web/user/safe/verify`（get_jobs 实证）。
     */
    const detectBlockOf = async (page) => await page.evaluate(detectBlockWithSignals, {
        signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
        card: config.selectors.card,
    });
    /**
     * 动作链上的判墙：命中就抛 `PlatformBlockedError`（由 `guard.run()` 写平台级暂停）。
     *
     * `blank` **不算**风控（见 `types.ts` 的 `actionBlockOf`）：会话页上 0 张岗位卡片
     * 本来就是常态 —— 一个空收件箱（「30天内暂无联系人」）文本很短，会被判成 blank，
     * 照单全收就等于每同步一次就白白暂停一次平台。
     */
    const assertActionPage = async (page) => {
        const kind = actionBlockOf(await detectBlockOf(page).catch(() => null));
        if (kind !== null)
            throw new PlatformBlockedError(kind, '动作页面上看到风控页面');
    };
    /**
     * 本次要滚动加载几轮（`scrollRounds` 维度，方案里配）。
     *
     * 缺省 `ZHIPIN_DEFAULT_SCROLL_ROUNDS = 3`（≈45 条/轮采集）；显式配 1 仍表示
     * "只读第一屏"。上限取平台自报的 `totalCount / 15`，不是我们拍的保守值 ——
     * 再多滚平台也不给。
     */
    const scrollRoundsOf = (criteria) => {
        const parsed = Number.parseInt(platformCriterion(criteria, 'scrollRounds'), 10);
        const base = Number.isFinite(parsed) && parsed >= 1 ? parsed : ZHIPIN_DEFAULT_SCROLL_ROUNDS;
        return Math.max(1, Math.min(base, ZHIPIN_MAX_SCROLL_ROUNDS));
    };
    /**
     * 用 joblist 接口把 DOM 里拿不到的字段补上（见 `ZhipinConfig.salaryApiEnabled` 的说明；
     * 2026-09-20 起从"只补薪资"升级为**字段级回填**，来源清单见 `ZhipinApiExtras`）。
     *
     * 四条纪律：
     *   1. **岗位集合仍以 DOM 为准** —— 接口只按 `encryptJobId` 补字段，**不引入新岗位**；
     *   2. `sourceUrl` 的路径与 id 仍来自 DOM 的原始 href，**只追加**同一接口给的
     *      `securityId` 查询参数（BossHunter 站点规则：详情抓取必须带它；这不是重构 URL）；
     *   3. **失败就保持原样** —— 接口挂了 / 结构变了，返回 DOM 的结果与原有 note，
     *      **不抛错**（这条通道是"锦上添花"，不该让整轮抓取失败）；
     *   4. **填上之后要撤掉 DOM 通道留下的那两条 note**（`salary:obfuscated` /
     *      "未登录视图薪资隐藏"）—— 否则数据是新的、说明是旧的，自相矛盾。
     *
     * 接口要翻几页与滚动轮数联动：滚了 N 屏（≈15N 条）就最多补 N 页（`joblistMaxPages`
     * 是老配置的下限兜底）。固定 5 页的老上限在滚 20 轮时只覆盖 75 条，后段岗位全部裸奔。
     */
    const enrichFromApi = async (page, jobs) => {
        if (!config.salaryApiEnabled)
            return jobs;
        const remembered = lastSearch.get(page);
        if (remembered === undefined || remembered.query === '')
            return jobs;
        const missing = jobs.filter((job) => job.salaryRaw === '');
        if (missing.length === 0)
            return jobs;
        const extrasById = new Map();
        // ① 先用 **SPA 自己发过的响应**（gotoSearch 期间截获，零请求）—— 滚动加载
        //    时这批数据已经到过本机，能覆盖的就不要再发请求（见 lastSearch 的说明）。
        for (const [id, extras] of remembered.seenExtras)
            extrasById.set(id, extras);
        const stillMissing = missing.filter((job) => !extrasById.has(job.platformJobId));
        // ② 剩下的缺口才自己补发（老通道：页面内 fetch，带 Cookie/指纹）。
        //    截获通道覆盖了全部缺口（页面没滚动过 / 响应全截到了）时一次都不发。
        if (stillMissing.length > 0) {
            const pages = Math.min(Math.max(config.joblistMaxPages, remembered.rounds), Math.max(1, Math.ceil(stillMissing.length / config.joblistPageSize)));
            for (let index = 1; index <= pages; index += 1) {
                // 页与页之间要有**间隔**：这是同一个站点上的连续请求，而 SPA 刚刚自己发过
                // 同一批（page=1..N）。零间隔连发正是 `pacing.ts` 突发规则要拦的形态 ——
                // 只是那条规则只挂在采集主链上，回填这条支线以前完全不受它管。
                if (index > 1 && delayMax > 0)
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                const payload = await page
                    .evaluate(fetchJoblistInPage, {
                    apiPath: config.joblistApiPath,
                    body: buildJoblistBody({
                        query: remembered.query,
                        cityCode: remembered.cityCode,
                        filters: remembered.filters,
                        page: index,
                        pageSize: config.joblistPageSize,
                    }),
                })
                    .catch(() => null);
                const got = extrasMapOf(payload);
                // 一页都没解析出东西 ⇒ 视为通道不可用，保持 DOM 结果（不抛错）
                if (got.size === 0) {
                    // **必须留痕**：这条通道是"锦上添花"，失败不抛错是对的；但它长期失效的表现
                    // 是"薪资/补充字段永远是空"—— 而核心字段照常命中，字段健康度、量级基线
                    // 一个都不会报警。日志是这种静默降级唯一的出口。
                    const code = payload?.code;
                    logger?.warn(`[zhipin] 列表接口没能取到数据（第 ${String(index)} 页，` +
                        (payload === null ? '请求失败 / 未登录' : `code=${String(code)}`) +
                        '）—— 保持 DOM 结果，这一批补充字段留空');
                    break;
                }
                for (const [id, extras] of got)
                    extrasById.set(id, extras);
                if (stillMissing.every((job) => extrasById.has(job.platformJobId)))
                    break;
            }
        }
        if (extrasById.size === 0)
            return jobs;
        return jobs.map((job) => {
            const extras = extrasById.get(job.platformJobId);
            if (extras === undefined)
                return job;
            const filled = { ...job };
            if (extras.salaryDesc !== '')
                filled.salaryRaw = extras.salaryDesc;
            // 技能 + 福利进 tags（与既有 DOM tags 合并去重；技能在前，它们对匹配更有用）
            const tags = [...new Set([...(job.tags ?? []), ...extras.skills, ...extras.welfareList])];
            if (tags.length > 0)
                filled.tags = tags;
            // 单值补充字段：DOM 没给（zhipin 的列表卡片本来就没有）才写，已有值不覆盖
            if ((filled.industry ?? '') === '' && extras.brandIndustry !== '')
                filled.industry = extras.brandIndustry;
            if ((filled.companySize ?? '') === '' && extras.brandScaleName !== '')
                filled.companySize = extras.brandScaleName;
            // 融资阶段 → companyNature：与列表接口的 brandStageName、本适配器详情页 `.icon-stage` 同一去处
            if ((filled.companyNature ?? '') === '' && extras.brandStageName !== '')
                filled.companyNature = extras.brandStageName;
            // 区 + 商圈（接口两段比 DOM 的第二段多一段商圈；DOM 值保留为兜底）
            if (extras.areaDistrict !== '') {
                filled.district =
                    extras.businessDistrict !== '' ? `${extras.areaDistrict}·${extras.businessDistrict}` : extras.areaDistrict;
            }
            // 详情页令牌：只追加参数，不动路径
            if (extras.securityId !== '' && !filled.sourceUrl.includes('securityId=')) {
                filled.sourceUrl = `${filled.sourceUrl}${filled.sourceUrl.includes('?') ? '&' : '?'}securityId=${extras.securityId}`;
            }
            const notes = (job.notes ?? []).filter((note) => note !== 'salary:obfuscated' && note !== '未登录视图薪资隐藏（登录后可升级）');
            if (notes.length === 0)
                delete filled.notes;
            else
                filled.notes = notes;
            return filled;
        });
    };
    const dimensions = [
        {
            key: 'keyword',
            label: '关键词',
            values: [],
            hint: '自由文本，平台原样接收',
            // BOSS 的筛选**不在页面 URL 里**：真正的请求是页面内调 joblist 接口的表单体
            // （`query` / `city`），URL 只承载页面外壳。声明落到 body 字段上，预览与对账看的是同一个请求。
            wire: { target: 'body', param: ZHIPIN_BODY_FIELDS.keyword },
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
            wire: { target: 'body', param: ZHIPIN_BODY_FIELDS.city },
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: ZHIPIN_MAX_PAGES,
            hint: 'BOSS 搜索页**没有可寻址的第 N 页**（2026-09-18 实测 `&page=2` 返回同一批数据）—— 深度改用「滚动加载轮数」',
        },
        {
            key: 'scrollRounds',
            label: '加载轮数',
            values: [],
            max: ZHIPIN_MAX_SCROLL_ROUNDS,
            // 数值维度由**适配器**声明（不再靠宿主那张全局 NUMERIC_KEYS 猜）。
            numeric: true,
            hint: `BOSS 没有页码翻页，只能滚动加载：每滚一次 +${String(ZHIPIN_PAGE_SIZE)} 条。` +
                `不填默认 ${String(ZHIPIN_DEFAULT_SCROLL_ROUNDS)} 轮（≈${String(ZHIPIN_PAGE_SIZE * ZHIPIN_DEFAULT_SCROLL_ROUNDS)} 条）；` +
                '填 1 = 只读第一屏 15 条；填 4 ≈ 60 条。平台自报 totalCount 封顶 300 条（= 20 轮），' +
                '再滚也没有新数据。轮数越大请求越密、风控风险越高 —— 保守起见先配 2–4 试。',
        },
        // ── 站点筛选面板的六个维度（2026-09-23 实测接入，取值编码见 config.ts 的
        // ZHIPIN_FILTER_OPTIONS）。wire 落在 joblist 表单字段上 —— URL 参数与表单字段
        // 同名，`buildZhipinSearchUrl` 会把同样的参数写进搜索 URL，让 SPA 自己的请求
        // 带上筛选（对账测试盯着的是 body 这份）。
        ...[
            ['jobType', '求职类型'],
            ['salary', '薪资待遇'],
            ['experience', '工作经验'],
            ['degree', '学历要求'],
            ['scale', '公司规模'],
            ['stage', '融资阶段'],
        ].map(([key, label]) => ({
            key,
            label,
            values: ZHIPIN_FILTER_OPTIONS[key],
            hint: '取值编码来自站点筛选面板（2026-09-23 实测：编码同时出现在搜索 URL 与 joblist 表单里）。' +
                '站点还有「工作区域 / 职位类型 / 公司行业」三个筛选，值域是随城市变化的区划码或六位树形码，暂未接入',
            wire: { target: 'body', param: ZHIPIN_BODY_FIELDS[key] },
        })),
    ];
    return {
        id: 'zhipin',
        ...platformFacts('zhipin'),
        displayName: 'BOSS直聘',
        capabilities: {
            // 夹具实测：未登录可见列表；但薪资隐藏 → 如实两说。
            searchWithoutLogin: true,
            // 平台能发简历（工具条「发简历」），但**要求双方回复之后**才可用（2026-09-18 实测
            // `unable` + aria-label「双方回复后可用」）；且会话里**没有**把本地文件发给 HR 的入口。
            supportsAttachment: true,
            // 会话里区分 status-read / status-delivery（BossHunter 实测），平台有回执可读。
            supportsReadReceipt: true,
            supportsInbox: true,
            supportsGreeting: true,
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        // 未登录薪资隐藏：salary_raw 不进必需字段（否则全部被隔离）。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: ZHIPIN_MAX_PAGES,
        // 没有可寻址的页码（滚动加载走 scrollRounds 维度）—— 页数恒 1。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildZhipinSearchUrl(config, criteria);
            },
            /**
             * 预览：BOSS 的筛选**不在页面 URL 里**，而是页面内调 joblist 接口的表单体
             * （`query` / `city`），URL 只是把页面开起来。所以预览必须给出**那个请求**，
             * 否则界面上会显示"这个方案什么都没筛"（而声明里明明有 wire）。
             *
             * 与采集走**同一个** `buildJoblistBody`：预览与真实请求不可能分叉。
             */
            preview(criteria) {
                const url = buildZhipinSearchUrl(config, criteria);
                const cityCode = criteria.city === undefined || criteria.city === ''
                    ? ''
                    : (config.cityCodes[criteria.city] ?? '');
                const body = buildJoblistBody({
                    query: criteria.keyword ?? '',
                    cityCode,
                    filters: zhipinFiltersOf(criteria),
                    page: 1,
                    pageSize: config.joblistPageSize,
                });
                const params = {};
                for (const [key, value] of new URLSearchParams(body))
                    params[key] = value;
                // 城市码未知时 URL 是 null（不猜）—— 页面地址仍然给得出来，参数表能说明原因
                return {
                    url: url ?? config.urlParams.base,
                    method: 'POST',
                    params,
                    body,
                    crawlOnly: [],
                };
            },
        },
        /**
         * 登录态检测（2026-09-19 补）。
         *
         * 为什么必须有它：BOSS 是**最需要登录**的平台（详情页要登录后才有的 `securityId`），
         * 而在补上这一块之前 `adapter.auth === undefined` ⇒
         *   * `platforms.loginStatus('zhipin')` 直接抛「没有声明登录入口」，用户在设置里
         *     既看不到登录态、也没法走登录引导；
         *   * `account.loggedIn` 恒 `false`，而界面那些"需要登录"的入口都是按它过滤的 ——
         *     结果就是**打招呼 / 收件箱 / 回复全做好了，入口却永远不亮**。
         *
         * 不声明 auth 与"不需要登录"是两件事：后者看 `authRequirement.crawl`（BOSS 的
         * 搜索确实不需要登录），前者看这里有没有实现。
         */
        auth: {
            // 登录 URL 有据：未登录夹具里 `ka="header-login"` 那个链接的 href 就是它。
            loginUrl: 'https://www.zhipin.com/web/user/',
            // 检测判**搜索页**：`loginSelectors` 的两个锚点是在搜索页夹具上校准的（见
            // config.ts 的注释），而登录页 `/web/user/` 没有那套页头 —— 在登录页上判，
            // 两个锚点都不命中，null 被兜底成 false，于是**已登录也恒判未登录**。
            // 见 `auth.checkUrl` 的说明（猎聘/智联/51job 的同款坑）。传空 criteria：
            // 检测页只要"页头在"就够，不需要关键词与城市。
            checkUrl: buildZhipinSearchUrl(config, {}),
            async isLoggedIn(page) {
                // BOSS 页头是 SPA 异步挂载的：goto 一返回就判，锚点可能还没渲染（探针
                // 脚本 goto 后要等，gotoSearch 也等卡片）。先等两个锚点**任一**出现再判；
                // 等不到（超时 / 离线夹具没有 waitForSelector）就按原样 evaluate。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(`${config.loginSelectors.loggedIn}, ${config.loginSelectors.notLoggedIn}`, options.waitForListMs ?? 15_000);
                }
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
                const url = buildZhipinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                // 轮数在这里一次算好：滚动用它，回填的接口页数也用它（联动，见 enrichFromApi）
                const rounds = scrollRoundsOf(criteria);
                /** 截获到的 joblist 响应（SPA 滚动加载时自己发的那些，见 lastSearch 的说明）。 */
                const seenExtras = new Map();
                lastSearch.set(page, {
                    query: criteria.keyword ?? '',
                    cityCode: criteria.city === undefined || criteria.city === '' ? '' : config.cityCodes[criteria.city] ?? '',
                    // 筛选随 URL 一起生效（SPA 读地址栏参数），回填通道要带**同一组**才能对上号
                    filters: zhipinFiltersOf(criteria),
                    rounds,
                    seenExtras,
                });
                // 截获 SPA 自己的 joblist 响应（可选能力，离线夹具没有 → 空表，回填走老路）。
                // 订阅只在本函数内存活；text() 的 Promise 晚一点落进 Map 也无妨 ——
                // readListPage 在滚动结束、拟人延时之后才来读，迟到者最多错过这一轮。
                const unsubscribe = page.onResponse === undefined
                    ? null
                    : page.onResponse((response) => {
                        if (!response.url().includes('joblist.json'))
                            return;
                        void response
                            .text()
                            .then((text) => {
                            for (const [id, extras] of extrasMapOf(safeJsonParse(text)))
                                seenExtras.set(id, extras);
                        })
                            .catch(() => {
                            /* 重定向/响应体已释放都会抛 —— 截获是锦上添花，不许打扰主链 */
                        });
                    });
                try {
                    await page.goto(url);
                    if (page.waitForSelector !== undefined) {
                        try {
                            await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                        }
                        catch {
                            /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
                        }
                    }
                    // "看一眼"（真实的滚轮 + 指针事件）。之所以要放在懒加载之前：
                    // 下面的 `scrollToLoadInPage` 走的是页面内 `scrollTo`，那是**程序化滚动** ——
                    // 它产生 scroll 事件，但**没有 wheel、也没有 mousemove**。
                    await humanBrowse(page);
                    // 滚动加载（`scrollRounds`，方案里配）：BOSS 的"翻页"只发生在页面内 ——
                    // 第一屏已经在上面等到了，这里再滚 (rounds - 1) 次把它读厚。
                    if (rounds > 1) {
                        await page.evaluate(scrollToLoadInPage, {
                            card: config.selectors.card,
                            rounds: rounds - 1,
                            stepTimeoutMs: config.scrollStepTimeoutMs,
                        });
                    }
                    if (delayMax > 0) {
                        await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                    }
                }
                finally {
                    unsubscribe?.();
                }
            },
            async readListPage(page) {
                const jobs = await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                });
                return await enrichFromApi(page, jobs);
            },
            async hasNextPage() {
                // 恒 false 是**平台事实**，不是没实现：2026-09-18 登录态实测，搜索页没有页码分页区，
                // 且 `&page=2` 返回的前 3 个岗位 id 与第 1 页完全相同（SPA 忽略该参数）——
                // 也就是说"下一页"这个东西在这个站点**不可寻址**。深度靠滚动加载（见 gotoSearch）。
                // 证据：test/fixtures/zhipin-pagination-report.json 的 `urlPaging.changed === false`。
                return false;
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        guard: {
            // 判墙的实现只有一份（`detectBlockOf`）—— 动作链与采集共用它。
            detectBlock: detectBlockOf,
        },
        /**
         * 高危动作（§4.2.2 的 `actions`）。
         *
         * ⚠️ 这三个方法**不允许被 domain 直接调用** —— 实现放在 `./actions.ts`，但必须由
         * `guard.run()` 签发一次性令牌后经 `guard/actions/` 调用（§4.4.1）。适配器只负责"怎么点"。
         *
         * 判墙实现留在本文件（`assertActionPage`，与 `guard.detectBlock` 共用 `detectBlockOf`），
         * 以 `assertActionPage` 的形式交给动作链 —— 一处实现两个消费者。
         */
        actions: createZhipinActions({ config, assertActionPage }),
    };
}
//# sourceMappingURL=index.js.map