import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { blockFromApiFailure, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { PlatformBlockedError } from '../../types.js';
import { DEFAULT_SINOJOBS_CONFIG, SINOJOBS_BLOCK_SIGNALS, SINOJOBS_EXPERIENCE_OPTIONS, SINOJOBS_LIST_URL, SINOJOBS_MAX_PAGES, SINOJOBS_SALARY_OPTIONS, SINOJOBS_WORK_NATURE_OPTIONS, } from './config.js';
import { SINOJOBS_BODY_FIELDS, buildSinoJobsRequestBody, buildSinoJobsSearchUrl } from './urls.js';
import { countCardsInPage, detectBlockInPage, extractDetailInPage, extractJobsInPage, fetchListInPage, isLoggedInInPage, readTotalInPage, } from './page.js';
/** 构造 SinoJobs 适配器。 */
export function createSinoJobsAdapter(options = {}) {
    const config = options.config ?? DEFAULT_SINOJOBS_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const logger = options.logger;
    /**
     * 上一次 `gotoSearch` 记下的筛选条件。
     *
     * 为什么需要它：抓取主链每页会重新调 `gotoSearch`，而 `readListPage(page)`
     * 只拿得到 `page`，拿不到 `criteria`（见 `domain/crawl.ts` 的循环）。
     * 用 `WeakMap` 而不是 `Map`：页面关闭后条目自动消失，不留全局残留（C15）。
     */
    const pending = new WeakMap();
    /**
     * 最近一次列表响应的 `{total, page}`，按页面记 —— `hasNextPage` 的**真判据**。
     *
     * 为什么不用下一页按钮：接口的 `page` 参数是真实分页（实测第 2 页与第 1 页零重叠），
     * 而"按钮在不在"只反映 UI 状态。抓取主链的顺序是 `readListPage → hasNextPage`，
     * 所以读上一轮响应的 total 最精确：`page * pageSize < total` 才翻页。
     */
    const lastMeta = new WeakMap();
    /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
    const dimensions = [
        {
            key: 'keyword',
            label: '关键词',
            values: [],
            hint: '自由文本，对应接口的 keywords 字段（实测生效：工程师 → 78→17 条）',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.keyword },
        },
        {
            key: 'city',
            label: '地点',
            values: Object.keys(config.addressCodes).map((name) => ({ value: name, label: name })),
            hint: '对应接口 address_id。取值来自平台级联接口（10000=国内/10001=国外/省级 id，实测 address_id=3 → 只回上海岗）；' +
                '城市级 id 未内置，需要时在 DB 覆盖 config.addressCodes 补',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.city },
        },
        {
            key: 'salaryRange',
            label: '薪资',
            values: SINOJOBS_SALARY_OPTIONS,
            hint: '对应接口 salary_range，值域来自页面筛选项（#work-salary strong[rel]）',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.salaryRange },
        },
        {
            key: 'experience',
            label: '经验',
            values: SINOJOBS_EXPERIENCE_OPTIONS,
            hint: '对应接口 experience，值域来自页面筛选项（#work-year strong[rel]）',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.experience },
        },
        {
            key: 'workNature',
            label: '工作性质',
            values: SINOJOBS_WORK_NATURE_OPTIONS,
            hint: '对应接口 work_nature（全职/兼职/实习）',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.workNature },
        },
        {
            key: 'jobType',
            label: '行业类别',
            values: config.jobTypeList.map((item) => ({ value: item.id, label: item.name })),
            hint: '对应接口 job_type，内置为页面 #job_type 全部 43 项的实测 seed；' +
                '站点增删行业时在 DB 覆盖 config.jobTypeList 即可',
            wire: { target: 'body', param: SINOJOBS_BODY_FIELDS.jobType },
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: SINOJOBS_MAX_PAGES,
            hint: `最多 ${String(SINOJOBS_MAX_PAGES)} 页（每页 ${String(config.pageSize)} 条）—— ` +
                '全量池实测约 78 条，4 页即可抓完；给 6 页留足余量',
        },
    ];
    return {
        id: 'sinojobs',
        ...platformFacts('sinojobs'),
        displayName: 'SinoJobs 中欧招聘',
        capabilities: {
            // 实测：列表接口匿名可读、可翻页、可筛选（关键词/薪资/经验/性质/行业/地点全部生效）。
            searchWithoutLogin: true,
            // 投递要登录（/UserCenter/resumeShow.html），且未登录 DOM 里没有可靠的投递入口 ——
            // 与打招呼一起留空（fail-closed）。
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 结构化接口：字段齐、几乎不用猜；但大量岗位薪资是"面议"（这是平台的真实展示值），
            // 且"国外"岗位没有区划信息，所以不是 high。
            fieldCompleteness: 'medium',
            // 简单 PHP+jQuery 站，匿名接口实测未观察到验证码 —— 按 low。
            antiBot: 'low',
        },
        // §4.2.4：适配器自己声明必需字段（协议里的四个核心字段）。
        requiredFields: CORE_FIELDS,
        criteriaDimensions: dimensions,
        maxPages: SINOJOBS_MAX_PAGES,
        // hint 说了"4 页可抓完"是**实测覆盖**，不是声明的默认深度 —— 默认仍 1 页。
        defaultMaxPages: 1,
        auth: {
            loginUrl: `${config.webBase}/Ucenter/login.html`,
            // 检测判**列表页**：判据是"页头还有没有那个登录链接"，而登录页本身没有站内页头
            // —— 在那儿判会恒判已登录。见 `auth.checkUrl` 的说明。
            checkUrl: buildSinoJobsSearchUrl(config, {}),
            /**
             * 搜索不需要登录，所以这里只看**登录链接是否还在**这一个结构性信号
             * （未登录是 `a.sign-out`，已登录被用户菜单替换）。
             */
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, undefined);
            },
        },
        criteria: {
            buildSearchUrl(criteria) {
                return buildSinoJobsSearchUrl(config, criteria);
            },
            /**
             * 预览：SinoJobs 的筛选**不在 URL 里**（URL 只承载页面自己的 `keywords`），
             * 真正的条件全在 POST body。所以预览必须给出那个请求 —— 否则界面上会显示
             * "这个方案什么都没筛"。与采集走**同一个** `buildSinoJobsRequestBody`。
             */
            preview(criteria) {
                const url = buildSinoJobsSearchUrl(config, criteria);
                const body = buildSinoJobsRequestBody(config, criteria, 1);
                const params = {};
                for (const [key, value] of new URLSearchParams(body))
                    params[key] = value;
                return {
                    url: url ?? SINOJOBS_LIST_URL,
                    method: 'POST',
                    params,
                    body: new URLSearchParams(body).toString(),
                    crawlOnly: [],
                };
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildSinoJobsSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`SinoJobs：无法为地点「${criteria.city ?? ''}」构造搜索地址（地点 id 未配置，` +
                        '地点 id 只能从平台级联接口实测拿到）');
                }
                // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
                // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
                pending.set(page, criteria);
                await page.goto(url);
                // 站点是静态页 + AJAX 渲染：`load` 时列表还没渲染。等卡片只是为了
                // "别在页面还没活过来时发请求"，**解析不依赖它**（数据来自接口），
                // 所以超时也不当错误。
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
                    url: `${config.webBase}${config.apiPath}`,
                    body: buildSinoJobsRequestBody(config, criteria, pageNo),
                });
                if (!request.ok) {
                    // 先看这**是不是风控/登录墙**：站点脚本走 jQuery `$.ajax`，失败时 `info` 里是
                    // 人话（「请先登录」/「操作过于频繁」这一类）。能认出来就抛**风控错误** ——
                    // 主链会因此停手并把平台置为风控暂停（SR-22），而不是把"你被挡了"
                    // 降级成一次普通的 `PARSE_FAILED`（那会一路退避重试，越撞越紧）。
                    const block = blockFromApiFailure({ code: request.statusCode, message: request.message });
                    if (block !== null) {
                        throw new PlatformBlockedError(block, `列表接口 status=${request.statusCode === null ? '?' : String(request.statusCode)}：${request.message}`);
                    }
                    // 认不出来仍是普通失败。抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
                    // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
                    throw new Error(`SinoJobs：列表接口未返回可用数据（status=${request.statusCode === null ? '?' : String(request.statusCode)}，` +
                        `message=${request.message === '' ? '（空）' : request.message}）`);
                }
                const jobs = await page.evaluate(extractJobsInPage, config);
                // 记住 total + 当前页：hasNextPage 用 `page * pageSize < total` 决定是否翻页。
                // total 来自响应文本（`"78"`），页面上下文里已把载荷挂到全局。
                const total = await page.evaluate(readTotalInPage, undefined);
                lastMeta.set(page, { total, page: pageNo });
                if (jobs.length === 0) {
                    // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
                    // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
                    //
                    // 但 total>0 时"形状变了"的证据是压倒性的（平台自报有 N 条，我们一条都
                    // 解析不出来）—— 这种**静默降级**不会触发任何报警，日志是它唯一的出口。
                    if (total > 0) {
                        logger?.warn(`[sinojobs] 列表接口成功（total=${String(total)}）但一条都没解析出来 —— ` +
                            '响应形状可能变了（rows / 字段名漂移），本页按 0 条入库');
                    }
                    return [];
                }
                return jobs;
            },
            async hasNextPage(page) {
                const meta = lastMeta.get(page);
                if (meta === undefined)
                    return false;
                // 真实分页判据：当前页已拉到的条数还不到总量就还有下一页。
                return meta.page * config.pageSize < meta.total;
            },
        },
        // P2 详情页：服务端渲染的静态 HTML，选择器有实测证据（2026-09-18 逐项验证）。
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, config);
            },
        },
        guard: {
            /**
             * 判墙**不发请求**：接口错误在 `readListPage` 处以抛错暴露（PARSE_FAILED），
             * 这里只读当前页面的结构性信号（验证码 / 限流文案 / 错误弹窗 / 空白页）。
             */
            async detectBlock(page) {
                const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card });
                return await page.evaluate(detectBlockInPage, {
                    cardCount,
                    signals: signalsOf(SINOJOBS_BLOCK_SIGNALS),
                });
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`（四个槽位全空）：
        // 申请入口实测是 /UserCenter/resumeShow.html?recruitment_id=<id> —— robots 禁区
        // （/UserCenter/*）+ 需登录态，且没有任何已登录样本；平台也没有消息/会话体系。
        // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed）。
        // 完整证据链见文件头「为什么仍然不实现 actions」。
    };
}
//# sourceMappingURL=index.js.map