import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { fetchListInPage, parseSearchApiResponse } from './api.js';
import { DEFAULT_LIEPIN_CONFIG, LIEPIN_BLOCK_FLAGS, LIEPIN_BLOCK_SIGNALS, LIEPIN_DEFAULT_MAX_PAGES, LIEPIN_MAX_PAGES, } from './config.js';
import { extractJobDetailInPage, extractJobsInPage, hasNextPageInPage, isLoggedInInPage } from './page.js';
import { buildLiepinSearchUrl, buildSearchRequestBody } from './urls.js';
/** 构造猎聘适配器。 */
export function createLiepinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_LIEPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const logger = options.logger;
    /**
     * 记住每个页面最近一次 gotoSearch 的条件（city 码 + 页码），供 readListPage
     * 构造接口请求体 —— 与 waiqi 的 `lastCode` 同一模式（主链顺序
     * `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的）。
     */
    const lastSearch = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '370 个城市码是 2026-09-19 从猎聘「请选择城市」弹窗**逐省实测**的（原始数据与采样坑见 ' +
                'test/fixtures/liepin-city-codes.json）；表外城市一律拒绝，不猜。要加城市：重跑 ' +
                'npm run probe:liepin-chat，或写 DB 覆盖（setting scope=platform scope_ref=liepin key=adapter-config）',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: LIEPIN_MAX_PAGES,
            hint: `默认 ${String(LIEPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LIEPIN_MAX_PAGES)} 页；猎聘风控强度最高（antiBot=high），刻意比其它平台更保守`,
        },
    ];
    return {
        id: 'liepin',
        ...platformFacts('liepin'),
        displayName: '猎聘',
        capabilities: {
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 公司/薪资锚点待夹具校准，可能缺失 → medium。
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: LIEPIN_MAX_PAGES,
        defaultMaxPages: LIEPIN_DEFAULT_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildLiepinSearchUrl(config, criteria);
            },
        },
        // 登录态检测（2026-09-19 落地）。此前**故意不声明** —— `auth === undefined` 会让
        // `platforms.loginStatus` 直接抛「没有声明登录入口」，而 `account.loggedIn` 恒 false，
        // 于是界面上所有"需要登录"的入口永远不会亮（哪怕适配器已经能干活）。
        // 语义提醒：搜索**不需要**登录（`capabilities.searchWithoutLogin`），
        // 这个检测主要服务于"别把登录墙当成没有新岗位"与后续高危动作。
        auth: {
            // 没有可验证的独立登录页：登录是**页头弹层**（`#header-quick-menu-login` 是个没有 href 的 span），
            // 所以这里用首页兜底 —— 导航过去后用户在页头点「登录/注册」即可。**不编 URL**。
            loginUrl: 'https://www.liepin.com/',
            async isLoggedIn(page) {
                const verdict = await page.evaluate(isLoggedInInPage, {
                    loggedInMarker: config.selectors.loggedInMarker,
                    notLoggedInMarker: config.selectors.notLoggedInMarker,
                });
                // 判不出来时按"未登录"处理（保守，见 isLoggedInInPage 的说明）。
                return verdict ?? false;
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildLiepinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`liepin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                const cityCode = criteria.city !== undefined && criteria.city !== '' && config.cityCodes[criteria.city] !== ''
                    ? config.cityCodes[criteria.city]
                    : '410';
                lastSearch.set(page, {
                    keyword: criteria.keyword ?? '',
                    cityCode,
                    page: criteria.page ?? 1,
                });
                await page.goto(url);
                // 等卡片挂载（不要求可见：猎聘卡片可能被弹窗遮挡）。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts）。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // 猎聘是**风控最强**的一档，而它原先在整条采集链上一次输入事件都不产生
                // （只有导航 + 读 DOM）。"指针一次都没动过"在这种站点上是低强度但稳定可累积的信号。
                await humanBrowse(page);
            },
            async readListPage(page) {
                // 双通道（v2 接口化）：先试搜索接口（字段更富：refreshTime/labels/compId），
                // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
                // ⚠️ 但"静默"回退有个陷阱：接口要是**一直**失败（例如请求头少了 `x-fscp-*`），
                //    表现是"一切正常"，只是永远拿不到 `publishedAt`/`industry`/`companySize`。
                //    所以请求头是**必填**的（见 `LIEPIN_API_HEADERS` 的实测表），
                //    并由 `probe:liepin-chat` 的"生产路径"变体在线复验 + 用例钉住形状。
                const remembered = lastSearch.get(page);
                if (config.searchApiEnabled && remembered !== undefined) {
                    const payload = await page
                        .evaluate(fetchListInPage, {
                        apiPath: `${config.searchApiOrigin}${config.searchApiPath}`,
                        body: buildSearchRequestBody({ keyword: remembered.keyword, page: remembered.page }, remembered.cityCode),
                        headers: config.apiHeaders,
                    })
                        .catch(() => null);
                    const viaApi = parseSearchApiResponse(payload);
                    if (viaApi.length > 0)
                        return viaApi;
                    // 走到这里 = 接口**没给出东西**。三种情况要分清，前两种必须留痕：
                    //   * `payload === null`：请求根本没通（网络 / CORS / 页面没到域上）；
                    //   * `flag ≠ 1`：服务端拒绝了这次请求（`-1400` = `x-fscp-*` 一族不全或风控收紧）；
                    //   * `flag === 1` 但列表空：**这是正常结果**（真的没搜到），不打日志。
                    //
                    // 为什么非留痕不可：静默回退 DOM 的代价是"接口坏掉几个月，表现一切正常"——
                    // 四个核心字段照常命中（DOM 兜底也给得出），只是 `publishedAt` / `industry` /
                    // `companySize` / `labels` **永远是空**。健康度、字段计数、量级基线一个都不会响。
                    const flag = payload?.flag;
                    if (payload === null || flag !== 1) {
                        logger?.warn(`[liepin] 搜索接口没给出结果（${payload === null ? '请求失败' : `flag=${String(flag)}`}）` +
                            '—— 已回退 DOM 解析；这一批的 publishedAt / industry / companySize / labels 会留空');
                    }
                }
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    salaryPattern: config.salaryPattern,
                    jobIdPattern: config.jobIdPattern,
                    cityPattern: config.cityPattern,
                    expPattern: config.expPattern,
                    eduPattern: config.eduPattern,
                });
            },
            async hasNextPage(page) {
                return await page.evaluate(hasNextPageInPage, {
                    pagination: config.selectors.pagination,
                    nextPage: config.selectors.nextPage,
                    disabledClass: config.selectors.nextPageDisabledClass,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(LIEPIN_BLOCK_SIGNALS),
                    card: config.selectors.card,
                    flags: LIEPIN_BLOCK_FLAGS,
                });
            },
        },
        /**
         * 详情页解析（2026-09-18 探针夹具校准）。
         *
         * 为什么值得实现：猎聘的**列表接口与列表 DOM 都不含 JD**（采样逐键确认），
         * 而 JD 是打分/黑话标注/简历定制的输入 —— 不抓 JD，猎聘的岗位在这几项上
         * 只能按"无 JD"降级。详情页 SSR 直出、未登录可读，实测量级允许（见 ADAPTERS §7.2）。
         */
        detail: {
            async extract(page) {
                return await page.evaluate(extractJobDetailInPage, {
                    selectors: config.selectors,
                    expPattern: config.expPattern,
                    eduPattern: config.eduPattern,
                });
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
        // 猎聘的打招呼需要 hover 后才出现的按钮 + 登录态 + 实测契约
        // （见 docs/ADAPTERS.md §7.2），fail-closed 而不是假装能发。
    };
}
//# sourceMappingURL=index.js.map