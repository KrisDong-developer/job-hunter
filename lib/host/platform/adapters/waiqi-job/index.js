import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { PlatformBlockedError } from '../../types.js';
import { DEFAULT_WAIQI_CONFIG, WAIQI_BLOCK_SIGNALS, WAIQI_EDUCATION_OPTIONS, WAIQI_MAX_PAGE_SIZE, WAIQI_MAX_PAGES, WAIQI_TYPE_OPTIONS, WAIQI_WORK_EXP_OPTIONS, } from './config.js';
import { buildWaiqiRequestBody, buildWaiqiSearchUrl } from './urls.js';
import { countCardsInPage, detectBlockInPage, extractJobsInPage, fetchListInPage, hasNextPageInPage, isLoggedInInPage, } from './page.js';
/** 构造神仙外企适配器。 */
export function createWaiqiAdapter(options = {}) {
    const config = options.config ?? DEFAULT_WAIQI_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 上一次 `gotoSearch` 记下的筛选条件。
     *
     * 为什么需要它：抓取主链每页会重新调 `gotoSearch`，而 `readListPage(page)`
     * 只拿得到 `page`，拿不到 `criteria`（见 `domain/crawl.ts` 的循环）。
     * 用 `WeakMap` 而不是 `Map`：页面关闭后条目自动消失，不留全局残留（C15）。
     */
    const pending = new WeakMap();
    /**
     * 最近一次列表接口返回的 code，按页面记。
     *
     * 为什么需要它：抓取主链的顺序是 `gotoSearch → detectBlock → readListPage`，
     * 而接口请求发生在第三步。所以 `detectBlock` **不能**自己去再发一次请求
     * （那会让每次抓取都翻倍请求，把风控概率也翻倍）。
     * 我们记下上一轮的结果，让判墙用"最近一次真实的接口应答"。
     */
    const lastCode = new WeakMap();
    /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
    const dimensions = [
        {
            key: 'keyword',
            label: '关键词',
            values: [],
            hint: '自由文本，对应接口的 name 字段（实测：keyword/positionName 这些键**无效**，只有 name 生效）',
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市走接口的 cityIds（平台自增主键，不能按行政区划码猜）；表里没有的城市无法构造请求。' +
                '支持逗号分隔**多城市**（如 `深圳,广州`），一次请求按多个城市过滤',
        },
        {
            key: 'workExp',
            label: '工作经验',
            values: WAIQI_WORK_EXP_OPTIONS,
            hint: '平台只有 6 档（0~5）；实测 6/7 恒为 0 条，故不列出',
        },
        {
            key: 'education',
            label: '学历',
            values: WAIQI_EDUCATION_OPTIONS,
            hint: '取值域来自平台的 education-enum，**不是从 0 递增**（6/7/8 分别对应初中/高中/中专）',
        },
        {
            key: 'businessCategory',
            label: '行业',
            values: config.businessCategoryList.map((item) => ({ value: String(item.id), label: item.name })),
            hint: '对应接口 businessCategoryIdList（前端取值来自 getBusList，已过滤"不限"）。' +
                '内置为实测 seed，可在 DB 覆盖 config.businessCategoryList 补全',
        },
        {
            key: 'posInfo',
            label: '职能',
            values: config.posInfoList.map((item) => ({ value: String(item.id), label: item.name })),
            hint: '对应接口 posIds（前端为两级树 businessCategory→posInfos）。' +
                '内置为实测 seed，可在 DB 覆盖 config.posInfoList 补全',
        },
        {
            key: 'type',
            label: '职位范围',
            values: WAIQI_TYPE_OPTIONS,
            hint: '页面顶部的两个 tab；默认只看外企（type=2）',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: WAIQI_MAX_PAGES,
            hint: `最多 ${String(WAIQI_MAX_PAGES)} 页 —— 平台的服务端翻页是坏的（page≥2 恒定返回 0 条），` +
                `单页上限 ${String(WAIQI_MAX_PAGE_SIZE)} 条`,
        },
    ];
    return {
        id: 'waiqi',
        ...platformFacts('waiqi'),
        displayName: '神仙外企',
        capabilities: {
            // 实测：列表接口匿名可读（第一页 20 条），但页面上有「登录账号，查看更多好职位」遮罩。
            searchWithoutLogin: true,
            // 平台的投递要登录，且未登录 DOM 里没有可靠的投递入口 —— 与打招呼一起留空（fail-closed）。
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: true,
            supportsGreeting: false,
            // 结构化接口：字段齐、几乎不用猜；但薪资大量缺失（实测约 1/5 才有明文），所以不是 high。
            fieldCompleteness: 'medium',
            // 匿名可读、未观察到验证码；但页面确实有登录遮罩与订阅拦截，保守按 medium。
            antiBot: 'medium',
        },
        // §4.2.4：适配器自己声明必需字段（协议里的四个核心字段）。
        requiredFields: CORE_FIELDS,
        criteriaDimensions: dimensions,
        maxPages: WAIQI_MAX_PAGES,
        // 服务端翻页是坏的（page≥2 恒 0 条）—— 永远只有 1 页。
        defaultMaxPages: 1,
        auth: {
            loginUrl: `${config.webBase}/login`,
            // 检测判**搜索页**：判据是页头有没有用户头像，而登录页没有页头用户区
            // —— 在那儿判会恒判未登录。见 `auth.checkUrl` 的说明。
            checkUrl: buildWaiqiSearchUrl(config, {}),
            /**
             * 搜索不需要登录，所以这里**只看用户头像**这一个正向信号；
             * 「没登录」不该让采集停摆（`runtime` 那侧也只在"确实被登录墙挡过"时才拦）。
             */
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, undefined);
            },
        },
        criteria: {
            buildSearchUrl(criteria) {
                return buildWaiqiSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildWaiqiSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`神仙外企：无法为城市「${criteria.city ?? ''}」构造搜索地址（城市 id 未配置，` +
                        '城市 id 不能按行政区划码猜）');
                }
                // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
                // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
                pending.set(page, criteria);
                await page.goto(url);
                // 站点是 SPA：`load` 时列表还没渲染。等卡片只是为了"别在页面还没活过来时发请求"，
                // **解析不依赖它**（数据来自接口），所以超时也不当错误。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // 列表数据来自接口，DOM 只是"页面活过来了"的旁证；但**一次输入事件都不产生**
                // 的访问本身是可识别的形态，所以仍然要留下真实的滚动与指针轨迹。
                await humanBrowse(page);
            },
            async readListPage(page) {
                const criteria = pending.get(page) ?? {};
                const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1;
                const request = await page.evaluate(fetchListInPage, {
                    url: `${config.apiBase}${config.listPath}`,
                    body: buildWaiqiRequestBody(criteria, config.cityCodes, pageNo),
                });
                lastCode.set(page, request.code);
                if (!request.ok) {
                    // 风控/登录墙**在返回码里**（这是本平台的实测事实：`429` = 频控墙、
                    // `1022` = 需要登录）→ 抛风控错误，由主链停手 + 平台级暂停。
                    //
                    // 为什么不能只靠 `detectBlock`：主链顺序是 `gotoSearch → detectBlock → readListPage`，
                    // 而返回码只有**发完请求**才存在 —— 判墙那一刻它还是 `null`。
                    // 抛出去是唯一能在**当轮**生效的通道（否则要等下一轮判墙才被认出来）。
                    const block = request.code === 1022
                        ? 'login-required'
                        : request.code === 429
                            ? 'rate-limited'
                            : null;
                    if (block !== null) {
                        throw new PlatformBlockedError(block, `列表接口 code=${String(request.code)}：${request.message === '' ? '（无说明）' : request.message}`);
                    }
                    // 认不出来仍是普通失败。抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
                    // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
                    throw new Error(`神仙外企：列表接口未返回可用数据（code=${request.code === null ? '?' : String(request.code)}，` +
                        `status=${String(request.status)}，message=${request.message === '' ? '（空）' : request.message}）`);
                }
                const jobs = await page.evaluate(extractJobsInPage, config);
                if (jobs.length === 0) {
                    // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
                    // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
                    return [];
                }
                return jobs;
            },
            async hasNextPage(page) {
                // 平台的翻页参数在服务端是坏的（page≥2 恒返回空），所以这一层只回答
                // "页面上还有没有下一页按钮"。**真正的闸门是 `maxPages = 1`**（见 WAIQI_MAX_PAGES）。
                return await page.evaluate(hasNextPageInPage, { selector: config.selectors.nextPage });
            },
        },
        guard: {
            /**
             * 判墙**不发请求**（见 `lastCode` 的注释）：它读的是
             * 「最近一次列表接口的应答 + 当前页面的结构性信号」。
             *
             * ⚠️ 主链的顺序是 `gotoSearch → detectBlock → readListPage`，
             * 所以**首次**判墙时还没有接口应答（`code = null`），此时只能靠页面信号
             * （验证码 / 限流文案 / 空白页）。这不是缺陷：真正的登录墙
             * 会在 `readListPage` 处以 `code=1022` 暴露出来，并在下一次判墙时被识别。
             */
            async detectBlock(page) {
                const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card });
                return await page.evaluate(detectBlockInPage, {
                    cardCount,
                    code: lastCode.get(page) ?? null,
                    signals: signalsOf(WAIQI_BLOCK_SIGNALS),
                });
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
        // 神仙外企的投递要登录态，且未登录 DOM 里没有可靠的投递按钮契约；
        // 大量岗位的投递其实是**跳转到企业官网 ATS**（记录里的 `outsideUrl`）。
        // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed），
        // 也不上线一个会乱点的实现。
    };
}
//# sourceMappingURL=index.js.map