import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { DEFAULT_HIREDCHINA_CONFIG, HIREDCHINA_BLOCK_SIGNALS, HIREDCHINA_EMPLOYMENT_OPTIONS, HIREDCHINA_TYPE_OPTIONS, HIREDCHINA_WORK_MODE_OPTIONS, } from './config.js';
import { extractDetailInPage } from './page/detail.js';
import { extractJobsFromPayloadInPage } from './page/list.js';
import { buildHiredChinaSearchUrl } from './urls.js';
/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options = {}) {
    const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 最近一次 `readListPage` 解析出的条数 —— `hasNextPage(page)` 只拿得到 page
     * （见 domain/crawl.ts 的循环），满页判据要靠它（payload 无任何分页元信息）。
     */
    const lastCount = new WeakMap();
    /**
     * 判墙的**唯一实现**（与 `zhipin` / `liepin` 同一处）。
     *
     * 现在只有一个消费者（`guard.detectBlock`），但先抽出来是因为动作链一旦落地，
     * `assertActionPage` 就是第二个 —— 各写一遍 `page.evaluate(detectBlockWithSignals, …)`
     * 的话，改信号集时漏掉一处就会出现"采集认得这道墙、动作不认得"，
     * 而动作那边恰恰是**会真发东西**的一侧。
     *
     * `card` 是判墙锚（"0 卡片 + 短文本"判 blank/登录墙的那条判据）—— 列表解析已走
     * payload，不再有卡片选择器；真浏览器 hydrate 后 `a[href*="/job/"]` 会命中渲染出的
     * 卡片，语义仍是"页面上有没有岗位"。
     */
    const detectBlockOf = async (page) => await page.evaluate(detectBlockWithSignals, {
        signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
        card: config.selectors.card,
    });
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，对应 ?kw=（实测键名）' },
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
            hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时按 payload 的 isOnline 归一',
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            // 本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
            closed: true,
            hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: config.maxPages,
            hint: `翻页已实测有效（?page=N 在 payload 层真换数据、每页 10 条）；` +
                `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
        },
    ];
    return {
        id: 'hiredchina',
        ...platformFacts('hiredchina'),
        displayName: 'HiredChina',
        capabilities: {
            // 列表公共可看（探针未登录即可抓）→ 搜索不需要登录。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 薪资约四成 keep.secret（2026-09-20 实测 4/10）→ 如实 medium，不夸大成 high。
            fieldCompleteness: 'medium',
            // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
            antiBot: 'medium',
        },
        // ⚠️ 不含 salary_raw：payload 实测 10 条里 4 条 `salaryKey=keep.secret`（还原为
        // "Negotiable" 面议）—— 列进必需字段会把约四成记录打进 pending_repair（zhipin 同款
        // 取舍，清单按各平台实测覆盖率定，不是统一模板）。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: config.maxPages,
        // 未声明默认深度 —— 1 页。
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
                await page.goto(url);
                // 不等卡片 DOM：列表卡片是客户端组件渲染的，raw HTML 里**没有**（2026-09-20
                // 实测定案）；岗位数据在 RSC 流里，HTML 送达那一刻就完整可读 —— `readListPage`
                // 直接解析 payload，无需等待渲染。风控接管由 `detectBlock` 判（Cloudflare 信号）。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
                await humanBrowse(page);
            },
            async readListPage(page) {
                // 0 条可能是真没结果，也可能是改版（RSC 流锚点漂移）—— 交给主链按
                // NO_RECORDS 记 partial，不在这里猜。
                const jobs = await page.evaluate(extractJobsFromPayloadInPage, {
                    anchors: config.payloadAnchors,
                    lang: config.lang,
                });
                lastCount.set(page, jobs.length);
                return jobs;
            },
            async hasNextPage(page) {
                // payload 里没有任何分页元信息（total/hasMore 实测全无）→ 满页即有下一页
                // （liepin「本页不满即停」的同款镜像；末页恰好满页时多探一页空页可接受）。
                const count = lastCount.get(page) ?? 0;
                return count > 0 && count >= config.pageSize;
            },
        },
        guard: {
            // 判墙的实现只有一份（`detectBlockOf`）—— 动作链将来落地时复用同一份信号集。
            detectBlock: detectBlockOf,
        },
        // 详情页 JD 全文（P2 详情抓取）。选择器 2026-09-20 由真实详情页夹具全套校准
        // （h1 / 公司 / 行业 / 薪资 / 徽章行 / JD 按标题锚定拼接）；该平台无签证/公司
        // 规模字段，故不编这些。
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        // ⚠️ 不实现 `actions`：投递需登录且未验证稳定投递契约 → fail-closed。
    };
}
//# sourceMappingURL=index.js.map