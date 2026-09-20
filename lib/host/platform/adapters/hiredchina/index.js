import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_HIREDCHINA_CONFIG, HIREDCHINA_BLOCK_SIGNALS, HIREDCHINA_EMPLOYMENT_OPTIONS, HIREDCHINA_TYPE_OPTIONS, HIREDCHINA_WORK_MODE_OPTIONS, } from './config.js';
import { extractDetailInPage, extractJobsInPage, hasNextPageInPage } from './page.js';
import { buildHiredChinaSearchUrl } from './urls.js';
/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options = {}) {
    const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 上一次 `gotoSearch` 记下的筛选条件（与 waiqi 同因：`readListPage(page)` / `hasNextPage(page)`
     * 只拿得到 page，拿不到 criteria —— 见 domain/crawl.ts 的循环）。
     */
    const pending = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，对应 ?kw=（实测键名；需在页面输入触发）' },
        {
            key: 'type',
            label: 'Job Type',
            values: HIREDCHINA_TYPE_OPTIONS,
            hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 建议 probe 逐档确认',
        },
        {
            key: 'employment',
            label: '雇佣类型',
            values: HIREDCHINA_EMPLOYMENT_OPTIONS,
            hint: '对应 ?employmentId=（已实测：1=全职 / 2=兼职）',
        },
        {
            key: 'workMode',
            label: '工作模式',
            values: HIREDCHINA_WORK_MODE_OPTIONS,
            hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时归一到 远程/现场/混合 标签',
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            // 同上：本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
            closed: true,
            hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: config.maxPages,
            hint: `翻页已实测有效（?page=N、每页 10 条、749 页）；` +
                `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
        },
    ];
    return {
        id: 'hiredchina',
        ...platformFacts('hiredchina'),
        displayName: 'HiredChina',
        capabilities: {
            // 列表公共可看（探针浏览器未登录即可渲染列表）→ 搜索不需要登录。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 结构化卡片：标题/公司/薪资/地点几乎都在；但字段靠底色徽章锚定，偶发缺失 → medium。
            fieldCompleteness: 'medium',
            // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
            antiBot: 'medium',
        },
        // 薪资绝大多数存在（"Negotiable" 也是合法值，见 validate.ts）→ 用完整核心四字段。
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: config.maxPages,
        // 未声明默认深度（hint 只说了上限的取舍理由）—— 1 页。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildHiredChinaSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildHiredChinaSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`HiredChina：城市「${criteria.city ?? ''}」筛选未实现（URL 参数未确证）—— 拒绝猜测`);
                }
                pending.set(page, criteria);
                await page.goto(url);
                // 列表是 RSC SSR，load 时卡片应已在；仍等一次卡片锚点，防「今天没有新岗位」误读。
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
                const jobs = await page.evaluate(extractJobsInPage, config);
                if (jobs.length === 0) {
                    // 0 条可能是真没结果，也可能是改版 —— 交给主链按 NO_RECORDS 记 partial，不在这里猜。
                    return [];
                }
                return jobs;
            },
            async hasNextPage(page) {
                const criteria = pending.get(page) ?? {};
                const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1;
                return await page.evaluate(hasNextPageInPage, {
                    selector: config.selectors.pagination,
                    currentPage: pageNo,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
                    card: config.selectors.card,
                    // ⚠️ **刻意不传 `cardBox`**：原实现的 arg 里声明了它，但函数体从未使用过
                    //    （只 querySelectorAll(arg.card)）。传进去会让"卡片数为 0"多一条兜底判据，
                    //    从而少判 blank —— 那是行为改变，不是迁移。
                });
            },
        },
        // 详情页 JD 全文（P2 详情抓取）。选择器（h1 / 渐变卡片薪资 / prose JD）探针注明，
        // 待 probe:hiredchina 落盘详情夹具校准；该平台无签证/公司规模字段，故不编这些。
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        // ⚠️ 不实现 `actions`：投递需登录且列表夹具未验证稳定投递契约 → fail-closed。
    };
}
//# sourceMappingURL=index.js.map