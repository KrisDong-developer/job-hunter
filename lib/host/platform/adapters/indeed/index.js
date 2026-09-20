import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_INDEED_CONFIG, INDEED_BLOCK_SIGNALS, INDEED_DEFAULT_MAX_PAGES, INDEED_MAX_PAGES, indeedBlockFlags, } from './config.js';
import { extractJobsInPage, hasNextPageInPage } from './page.js';
import { buildIndeedSearchUrl } from './urls.js';
/** 构造 Indeed 适配器。 */
export function createIndeedAdapter(options = {}) {
    const config = options.config ?? DEFAULT_INDEED_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        { key: 'city', label: '地点', values: [], hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码' },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: INDEED_MAX_PAGES,
            hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；Indeed 免费版无页码按钮 + Cloudflare 风控，刻意保守。注意：中国大陆站已停运，默认 host 会命中重定向/验证墙`,
        },
    ];
    return {
        id: 'indeed',
        ...platformFacts('indeed'),
        displayName: 'Indeed',
        capabilities: {
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 无可信中国大陆夹具：锚点来自公开描述的稳定结构，未校准 → 如实标 low。
            fieldCompleteness: 'low',
            antiBot: 'high',
        },
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: INDEED_MAX_PAGES,
        defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,
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
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(INDEED_BLOCK_SIGNALS),
                    card: config.selectors.titleLink,
                    flags: indeedBlockFlags(config.host),
                });
            },
        },
        // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：Indeed 中国站已停运，
        //   无法实测打招呼/投递契约，fail-closed 而不是假装能发（与猎聘同策略）。
    };
}
//# sourceMappingURL=index.js.map