/**
 * 拉勾网（lagou.com）适配器 —— 2026-09-18 基于真实平台调研。
 *
 * ## 调研来源（2026-09-18 线上抓取 + 搜索量抽样，多次互证）
 *
 * 抓取 `https://www.lagou.com/hangzhou-zhaopin/Python/`、`/jobs/list_AR`、`/jobs/list_Python`
 * 三个真实列表页（另见 docs/ADAPTERS.md 的调研记录）：
 *
 * ## 路由与 URL（**相机里的关键事实**）
 *
 * | 用途 | URL 形态 | 说明 |
 * |---|---|---|
 * | 搜索第 1 页 | `/jobs/list_<关键词>?city=<城市中文名>&px=new` | **关键词进路径**（`list_Java`），城市用**中文名**进 query，**不是数字码** —— 这跟其它平台都不一样 |
 * | 已登录详情 | `/wn/jobs/<纯数字id>.html?show=<token>` | 岗位 id 是**纯数字**（可作幂等键） |
 * | 分页 | `/hangzhou-zhaopin/Python/2/` | 城市拼**拼音 slug 段**，页码是尾部 `/2/`；slug 无法逐城推导 |
 * | 公司 | `/gongsi/v1/<hash>.html` | — |
 *
 * **翻页因此用「读真实 href」而不是自己拼**：第 2 页起读上一页分页区「下一页」链接的真实
 * href（`/hangzhou-zhaopin/Python/2/` 这种），与 zhaopin 的 `nextPageUrlInPage` 同一套路
 * （ADR-9 URL 导航、无 query、贴近站点自己生成的链接）。页码码段走不正也不敢猜。
 *
 * ## 风控强度（本平台最要紧的调研结论）
 *
 * 拉勾 **2020 年后重建 + 上了 WAF**：对 V8/Playwright 探测流量高频返回一个滑块验证页
 * （`appkey: "CF_APP_WAF"`、`sceneId` 随机、请求头注入 `userUserId`），URL 形如
 * `/s/list_<随机hex>`，正文「为了更好的访问体验，请滑动滑块进行验证」。
 * → **antiBot 定 `high`**；`detectBlock` 必须把这套滑块页与极验/阿里云 nc 一起判 `captcha`，
 *   命中即停不重试（C12）。
 *
 * 与此同时，**列表页本身是公开可爬的**（未登录就能拿到职位与薪资明文，本调研的 SEO
 * 直出页即证据），所以 `searchWithoutLogin: true`。`searchWithoutLogin:true` 与
 * `antiBot:high` 并存是拉勾的实情：**能不能进门是反爬的事，进不进得来不是登录的事**。
 *
 * ## 选择器现状（诚实声明）
 *
 * 本次调研拿到的是**内容结构**（标题/地点/薪资/经验/学历/公司/融资/标签），不是构建产物
 * 的 class。拉勾列表页是 Vue 重写，class 混淆且未做真机抓取校准 —— 按项目铁律**不编经典
 * 时代的选择器当真值**：默认选择器射到经典结构（`.con_list_item`/`.position_link`/
 * `.money`/`.company_name`…），但解析体用**语义模式**（薪资/经验/学历/地点从卡片文本抠，
 * 与猎聘同一族做法），锚不中的字段留空进 `pending_repair`。等 `npm run probe:lagou` 保存
 * 真实夹具（`test/fixtures/lagou-search.html`）后校准。
 *
 * ## 城市
 *
 * `city` 参数就是**中文城市名**（`city=深圳`、全国不带该参数）。所以不需要城市码表：
 * 任何中文城市名都能直接拼，UI 枚举用内置 20 城（identity 映射），别处城市自由文本也能收。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createLagouAdapter` 与 `LagouAdapterOptions`；含 `nextUrlByPage` 与
 *   `lastCriteria` 两个页面对象级的 WeakMap 编排状态（它们是编排，不是配置）。
 * * `config.ts` —— 选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 `merge*`（配置面）。
 * * `urls.ts` —— 搜索 URL / 接口地址 / 请求体的宿主机侧构造（不碰 `document`）。
 * * `api.ts` —— 页面内 fetch 通道 + 响应 → `RawJob` 的解析（v2 双通道）。
 * * `page.ts` —— `page.evaluate` 送进浏览器的自包含解析函数（列表 / 详情 / 翻页 / 登录态）。
 * * 配置面（`DEFAULT_*` / `merge*`）一律从 `./config.js` 取，本文件不转出。
 */
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { blockFromApiFailure, detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { PlatformBlockedError } from '../../types.js';
import { fetchListInPage, parseSearchApiResponse } from './api.js';
import { DEFAULT_LAGOU_CONFIG, LAGOU_BLOCK_SIGNALS, LAGOU_DEFAULT_MAX_PAGES, LAGOU_MAX_PAGES, LAGOU_POSTED_WITHIN_OPTIONS, LAGOU_SORT_OPTIONS, } from './config.js';
import { extractDetailInPage, extractJobsInPage, hasNextPageInPage, isLoggedInInPage, nextPageUrlInPage } from './page.js';
import { buildLagouRequestBody, buildLagouSearchApiUrl, buildLagouSearchUrl } from './urls.js';
/** 构造拉勾网适配器。 */
export function createLagouAdapter(options = {}) {
    const config = options.config ?? DEFAULT_LAGOU_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const logger = options.logger;
    /**
     * 记住每个页面「上一页读到的下一页真实 URL」，供 gotoSearch 在 page>1 时导航。
     * 与猎聘的 `lastSearch` 同一模式：单轮抓取内页面对象稳定、循环顺序推进
     * （gotoSearch → detectBlock → readListPage 顺序保证它是新鲜的）。
     */
    const nextUrlByPage = new WeakMap();
    /** 记下某个页面读到的「下一页」URL。 */
    const rememberNextUrl = (page, next) => {
        if (next === null || next === '')
            nextUrlByPage.delete(page);
        else
            nextUrlByPage.set(page, next);
    };
    /** 上一次 `gotoSearch` 记下的筛选条件：`readListPage(page)` 只拿得到 page，拿不到 criteria。 */
    const lastCriteria = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，拼进路径段（/jobs/list_<关键词>）' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityNames).map((city) => ({ value: city, label: city })),
            // 表里的 20 个是**建议**不是取值域：`buildLagouSearchUrl` 把中文名原样拼进 URL
            closed: false,
            hint: '拉勾的 city 参数就是中文城市名，无需码表 —— 列表里没有的城市也能以自由文本直接收；「全国」不带 city 参数',
        },
        {
            key: 'sort',
            label: '排序方式',
            values: LAGOU_SORT_OPTIONS,
            hint: '搜索页只有默认与「最新」有证据（px=new）；其余取值无线上证据，故不提供',
        },
        {
            key: 'postedWithinDays',
            label: '发布时间',
            values: LAGOU_POSTED_WITHIN_OPTIONS,
            hint: '拉勾搜索 URL 不暴露发布时间维度（那套筛选走 positionAjax POST），因此该维度不可用',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: LAGOU_MAX_PAGES,
            hint: `默认 ${String(LAGOU_DEFAULT_MAX_PAGES)} 页、最多 ${String(LAGOU_MAX_PAGES)} 页；拉勾 antiBot=high（WAF 滑块），刻意比其它平台保守`,
        },
    ];
    return {
        id: 'lagou',
        ...platformFacts('lagou'),
        displayName: '拉勾',
        capabilities: {
            // 列表公开可爬（SEO 直出页即证据）；但能不能进门要过 WAF 滑块 —— 两件事分开说。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 选择器待夹具校准，可能缺失 → medium。
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        requiredFields: CORE_FIELDS,
        criteriaDimensions: dimensions,
        maxPages: LAGOU_MAX_PAGES,
        defaultMaxPages: LAGOU_DEFAULT_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildLagouSearchUrl(config, criteria);
            },
        },
        auth: {
            loginUrl: 'https://www.lagou.com/login',
            // 检测判**搜索页**：`isLoggedInInPage` 认的是页头的用户入口/头像，
            // 而登录页是登录表单（没有页头用户区）—— 在那儿判会得到"未登录"。
            // 见 `auth.checkUrl` 的说明。
            checkUrl: buildLagouSearchUrl(config, {}),
            // 结构性信号（待含登录夹具校准）。搜索不需要登录，这个入口只服务登录引导与后续高危动作。
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, undefined);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                let url = buildLagouSearchUrl(config, criteria);
                // 第 2 页起用上一页读到的「下一页」真实 href（拼音 slug 拼不了，只能照抄）。
                if (url === null && criteria.page !== undefined && criteria.page > 1) {
                    const next = nextUrlByPage.get(page) ?? '';
                    if (next !== '')
                        url = next;
                }
                lastCriteria.set(page, criteria);
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
                // 拉勾是 WAF 滑块挡门（`antiBot: high`），而它原先一次输入事件都不产生。
                await humanBrowse(page);
            },
            async readListPage(page) {
                // 双通道（v2 接口化）：先试 positionAjax（字段更富：createTime/companySize/financeStage），
                // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
                const remembered = lastCriteria.get(page);
                if (config.searchApiEnabled && remembered !== undefined) {
                    const payload = await page
                        .evaluate(fetchListInPage, {
                        apiPath: buildLagouSearchApiUrl(config, remembered.city ?? ''),
                        form: buildLagouRequestBody(remembered, remembered.page ?? 1),
                    })
                        .catch(() => null);
                    const viaApi = parseSearchApiResponse(payload);
                    if (viaApi.length > 0)
                        return viaApi;
                    // 走到这里 = 接口**没给出东西**。拉勾被限流时的典型返回是
                    // `{"status":false,"msg":"您操作太频繁，请稍后再访问"}` —— 这一类**必须抛出去**：
                    // 它是"平台已经认出你了"的证据，而回退 DOM 只会把这条信号咽成一次普通解析。
                    const record = payload;
                    const message = typeof record?.msg === 'string' ? record.msg : '';
                    const block = blockFromApiFailure({ message });
                    if (block !== null)
                        throw new PlatformBlockedError(block, `搜索接口：${message}`);
                    // 其余失败**留痕后**继续回退 DOM（原先连痕迹都没有）：接口长期失效的表现是
                    // "一切正常，只是 createTime / companySize / financeStage / industryField 永远空"。
                    if (payload === null || message !== '' || record?.status === false || record?.success === false) {
                        logger?.warn(`[lagou] 搜索接口没给出结果（${payload === null ? '请求失败' : message === '' ? '结构与预期不符' : message}）—— 已回退 DOM；这一批的 createTime / companySize / financeStage / industryField 会留空`);
                    }
                }
                const raw = await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    salaryPattern: config.salaryPattern,
                    jobIdPattern: config.jobIdPattern,
                    infoSeparator: config.infoSeparator,
                    publishPattern: config.publishPattern,
                });
                // 顺带把「下一页」真实链接记下来，供 gotoSearch 第 N+1 页使用。
                const next = await page
                    .evaluate(nextPageUrlInPage, { pagination: config.selectors.pagination, next: config.selectors.next })
                    .catch(() => null);
                rememberNextUrl(page, next);
                return raw;
            },
            async hasNextPage(page) {
                return await page.evaluate(hasNextPageInPage, {
                    pagination: config.selectors.pagination,
                    next: config.selectors.next,
                });
            },
        },
        detail: {
            /** 详情页解析（选择器为经典结构，**待含登录夹具校准**）。 */
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(LAGOU_BLOCK_SIGNALS),
                    card: config.selectors.card,
                });
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
        // 拉勾的「立即沟通 / 投递」需要登录态 + 页面会话 anti-forge，且按钮层级无真机契约证据。
        // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed），
        // 也不上线一个会误点真实按钮的实现。详见文件头调研记录。
    };
}
//# sourceMappingURL=index.js.map