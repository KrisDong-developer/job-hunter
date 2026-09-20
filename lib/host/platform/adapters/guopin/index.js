import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_GUOPIN_CONFIG, GUOPIN_BLOCK_SIGNALS, GUOPIN_MAX_PAGES } from './config.js';
import { extractDetailInPage, extractJobsInPage } from './page.js';
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
            hint: '分页参数未确证（?p=2 未翻页），v1 单页采集；探针夹具确认分页契约后放开',
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
            // 列表卡片**无薪资**（probe 实证）→ salary_raw 不在必需字段里；其余核心字段齐全。
            fieldCompleteness: 'medium',
            antiBot: 'low',
        },
        // 列表卡片无薪资、无平台 id（幂等键用内容哈希）→ 核心必需字段只声名 title/company/source_url。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: GUOPIN_MAX_PAGES,
        // 分页契约未确证（hasNextPage 恒 false）—— 默认就 1 页。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildGuopinSearchUrl(config, criteria);
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
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
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
            async hasNextPage() {
                // 分页参数未确证（见文件头）—— 恒 false；probe:guopin 夹具确认后补真实分页契约。
                return false;
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                    deadlinePattern: config.deadlinePattern,
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