import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_INDEED_CONFIG, INDEED_ANON_LOGIN_LINK, INDEED_BLOCK_SIGNALS, INDEED_DEFAULT_MAX_PAGES, INDEED_MAX_PAGES, INDEED_POSTED_AGE_PATTERN, indeedBlockFlags, } from './config.js';
import { extractDetailInPage, extractJobsInPage, hasNextPageInPage, isLoggedInInPage } from './page.js';
import { buildIndeedSearchUrl } from './urls.js';
/** 构造 Indeed 适配器。 */
export function createIndeedAdapter(options = {}) {
    const config = options.config ?? DEFAULT_INDEED_CONFIG;
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
            label: '地点',
            values: [],
            hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码',
            wire: { target: 'url', param: config.urlParams.locationParam },
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: INDEED_MAX_PAGES,
            hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；cn 站实测可用（未登录可搜），但 Cloudflare 风控在，刻意保守`,
        },
    ];
    return {
        id: 'indeed',
        ...platformFacts('indeed'),
        displayName: 'Indeed',
        capabilities: {
            // 2026-09-21 实测：未登录搜索直出 16 条（首访登录墙是抖动，见文件头）。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 2026-09-21 真实夹具：标题/公司/城市/jobKey 16/16 全中；薪资与日期在该批页面
            // 无数据源（0 命中）→ 如实标 medium，缺口靠 requiredFields 摘除 + notes 隔离。
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        // ⚠️ 不含 salary_raw：真实夹具 16 条薪资全空（卡片无该节点，数据无源）——
        //   列进必需字段会把整批记录打进 pending_repair（hiredchina/zhipin 同款取舍）。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: INDEED_MAX_PAGES,
        defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,
        auth: {
            // 2026-09-21 实测登录页（首访被送到的就是它；不带 continue，登录后平台自己跳）。
            loginUrl: 'https://secure.indeed.com/auth?hl=zh_CN&co=CN',
            // 判登录态用搜索页：载荷 isLoggedIn 在搜索页同样内嵌（匿名/已登录两侧实测），
            // 语义正是「当前页会不会被登录墙挡住」。
            checkUrl: 'https://cn.indeed.com/jobs',
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, { loginLinkSelector: INDEED_ANON_LOGIN_LINK });
            },
        },
        criteria: {
            buildSearchUrl(criteria) {
                return buildIndeedSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildIndeedSearchUrl(config, criteria);
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.titleLink, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
                await humanBrowse(page);
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    host: config.host,
                    jobKeyPattern: config.jobKeyPattern,
                    salaryPattern: config.salaryPattern,
                });
            },
            async hasNextPage(page) {
                return await page.evaluate(hasNextPageInPage, {
                    pagination: config.selectors.pagination,
                    nextPage: config.selectors.nextPage,
                    disabledAttr: config.selectors.nextPageDisabledAttr,
                });
            },
        },
        detail: {
            /**
             * 2026-09-21 `probe:indeed-detail` 三页实测（3/3 命中）：标题 / 公司 / 地点 /
             * `#jobDescriptionText`；无 JSON-LD JobPosting，发布日期走内嵌载荷
             * `hiringInsightsModel.age`；薪资在详情页同样无源（salaryRaw 恒空，notes 不记 ——
             * 列表侧已按"无源字段"处理，见 requiredFields）。
             */
            async extract(page) {
                return await page.evaluate(extractDetailInPage, {
                    selectors: config.detailSelectors,
                    host: config.host,
                    jobKeyPattern: config.jobKeyPattern,
                    postedAgePattern: INDEED_POSTED_AGE_PATTERN,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(INDEED_BLOCK_SIGNALS),
                    card: config.selectors.titleLink,
                    flags: indeedBlockFlags(config.host),
                });
            },
        },
        // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：打招呼/投递契约没有任何
        //   真机取证（登录态探针只读取证，未点任何岗位动作），fail-closed 而不是假装能发
        //   （与猎聘同策略）。要做须另开探针单独评审（如 probe:zhaopin-login 的分组开关）。
    };
}
//# sourceMappingURL=index.js.map