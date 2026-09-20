import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_LINKEDIN_CONFIG, LINKEDIN_BLOCK_SIGNALS, LINKEDIN_CITY_SUGGESTIONS, LINKEDIN_DEFAULT_MAX_PAGES, LINKEDIN_MAX_PAGES, LINKEDIN_POSTED_WITHIN_OPTIONS, linkedinBlockFlags, } from './config.js';
import { buildLinkedInGuestApiUrl, buildLinkedInSearchUrl } from './urls.js';
import { extractDetailInPage, extractJobsInPage, isLoggedInInPage, wallKindInPage } from './page.js';
/** 构造 LinkedIn 适配器。 */
export function createLinkedInAdapter(options = {}) {
    const config = options.config ?? DEFAULT_LINKEDIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 上一轮解析到的条数，按页面记 —— `hasNextPage` 的判据。
     *
     * 「满页判据」：guest 端点**没有任何分页元信息**（没有 total），拉满 `pageSize`
     * （真机实测 10）说明大概率还有下一页；不满页说明这是最后一批。
     * 翻页契约已由 v2 探针钉死：三页零重叠、匿名侧同页大小。
     */
    const lastCount = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，原样进 keywords（中英文皆可）' },
        {
            key: 'city',
            label: '地点',
            values: LINKEDIN_CITY_SUGGESTIONS.map((city) => ({ value: city, label: city })),
            // 表里是**建议**不是取值域：location 是自由文本（英文地名最准，中文多数也能解析）
            closed: false,
            hint: '自由文本地点（location= 直接地名）。英文地名最准；「China」搜全国、' +
                '「Remote」搜远程岗 —— 列表外的地方（如 Hangzhou）也能直接收',
        },
        {
            key: 'postedWithinDays',
            label: '发布时间',
            values: LINKEDIN_POSTED_WITHIN_OPTIONS,
            // f_TPR=r<秒> 接受任意秒数（实测生效）—— 表里只是常用档
            closed: false,
            hint: '对应 f_TPR=r<秒>（guest 端点实测生效）：任意天数都能拼（1/7/30 是常用档）',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: LINKEDIN_MAX_PAGES,
            hint: `默认 ${String(LINKEDIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LINKEDIN_MAX_PAGES)} 页（每页 10 条）。` +
                'LinkedIn 风控是业内最强一档（999 / authwall / checkpoint / 封号），刻意保守',
        },
        // ⚠️ 刻意不声明 experienceLevel / workMode / easyApply / sort：
        //   2026-09-20 v2 实测 guest 端点对这些参数**全部忽略**（f_E=4 与对照 id 集合差异 0、
        //   sortBy=DD 不降序）—— 声明了也不改结果，等于给配置界面撒谎。
        //   若未来接入登录态搜索接口（那套面认筛选），再按真机证据加回。
    ];
    return {
        id: 'linkedin',
        ...platformFacts('linkedin'),
        displayName: 'LinkedIn 领英',
        capabilities: {
            // guest 端点匿名可读（v2 真机：匿名侧 200、10 条）；详情页对游客 SSR 直出。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 真机读数：标题/公司/地点/日期 10/10；薪资无源（卡片 0/10、详情 0）→ medium。
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        // 薪资在这个数据源上**不存在**（v2 实测）—— 列进必需字段会把全部记录打成 pending_repair。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: LINKEDIN_MAX_PAGES,
        defaultMaxPages: LINKEDIN_DEFAULT_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                // 采集导航目标是 guest 端点（见 crawl.gotoSearch）—— 这里给的是同一条件的地址。
                return buildLinkedInGuestApiUrl(config, criteria);
            },
        },
        /**
         * 登录检测（2026-09-20 两侧真机证据落地，见文件头）。
         *
         * `checkUrl` 用**搜索页**而非登录页：判据是页头 global-nav 的「我」区，
         * 登录页上没有那个页头 —— 在那儿判会恒「未登录」（与 sinojobs 同坑）。
         */
        auth: {
            loginUrl: `https://${config.host}/login`,
            checkUrl: buildLinkedInSearchUrl(config, {}),
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, { selector: config.loggedInSelector });
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                // ⚠️ 导航目标是 **guest 端点**，不是搜索页：
                //   ① 搜索页登录态下初始 DOM 0 卡片（客户端渲染），guest 端点两种状态都有数据；
                //   ② LinkedIn 的 CSP（Trusted Types）让「fetch 回字符串再解析」在真实页面上
                //      必抛错 —— 顶层导航让浏览器自己渲染片段成文档，`readListPage` 解析活 DOM。
                const url = buildLinkedInGuestApiUrl(config, criteria);
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // 留下真实的滚动与指针轨迹（D-17a：纯无输入访问是可识别形态）。
                await humanBrowse(page);
            },
            async readListPage(page) {
                // 主链顺序保证 gotoSearch → detectBlock → readListPage：此时文档就是 guest
                // 端点渲染出的卡片列表（顶层导航，见 gotoSearch 的理由）。
                const jobs = await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    host: config.host,
                    jobUrnPattern: config.jobUrnPattern,
                    jobIdFromUrlPattern: config.jobIdFromUrlPattern,
                    salaryPattern: config.salaryPattern,
                });
                lastCount.set(page, jobs.length);
                return jobs;
            },
            async hasNextPage(page) {
                const count = lastCount.get(page);
                return count !== undefined && count >= config.pageSize;
            },
        },
        /**
         * 详情页解析（2026-09-20 v2 真机锚点，见文件头）。详情页对游客 SSR 直出 ——
         * 无需登录态；打不开（authwall/挑战）由主链 `fetchNewJobDetails` 的判墙兜底。
         */
        detail: {
            async extract(page) {
                const parsed = await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
                // 详情页真机上没有薪资（v2 实测 0 命中）—— 薪资留空是**平台事实**，不是解析失败。
                return parsed;
            },
        },
        guard: {
            /**
             * 判墙顺序：先**地址级**（结构性，最可靠）再词表。
             *
             * `/authwall` / `/login` → login-required；`/checkpoint` / `/captcha` → captcha。
             * 词表阶段 `skipLoginWall: true`：游客页页头本来就长着 Sign in 按钮，文案判据
             * 会误判 —— 登录墙只信地址。999（LinkedIn 专属风控码）以错误页文案进词表
             * （rateText 的 toomanyrequests 一族）。
             */
            async detectBlock(page) {
                const wall = await page.evaluate(wallKindInPage, undefined);
                if (wall === 'authwall')
                    return 'login-required';
                if (wall === 'checkpoint')
                    return 'captcha';
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(LINKEDIN_BLOCK_SIGNALS),
                    card: config.selectors.card,
                    flags: linkedinBlockFlags(config.host),
                });
            },
        },
        // ⚠️ 刻意不实现 actions.*：登录态动作链路未调研（封号风险高）—— fail-closed，
        //   而不是假装能用（与 indeed / guopin 同策略）。
    };
}
//# sourceMappingURL=index.js.map