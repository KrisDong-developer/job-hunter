import { humanDelayMs } from '../../pacing.js';
import { humanBrowse } from '../../humanize.js';
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js';
import { platformFacts } from '../../platform-facts.js';
import { PlatformBlockedError } from '../../types.js';
import { DEFAULT_LINKEDIN_CONFIG, LINKEDIN_BLOCK_SIGNALS, LINKEDIN_CITY_SUGGESTIONS, LINKEDIN_DEFAULT_MAX_PAGES, LINKEDIN_MAX_PAGES, LINKEDIN_POSTED_WITHIN_OPTIONS, linkedinBlockFlags, } from './config.js';
import { buildLinkedInGuestApiUrl, buildLinkedInSearchUrl } from './urls.js';
import { extractDetailInPage } from './page/detail.js';
import { readInboxInPage } from './page/inbox.js';
import { extractJobsInPage, extractPanelSalariesInPage } from './page/list.js';
import { isLoggedInInPage, wallKindInPage } from './page/guard.js';
/** 构造 LinkedIn 适配器。 */
export function createLinkedInAdapter(options = {}) {
    const config = options.config ?? DEFAULT_LINKEDIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const logger = options.logger;
    /**
     * 上一次 `gotoSearch` 记下的筛选条件：薪资回填通道要用它构造**同条件**的登录态
     * 搜索页（guest 文档页与搜索页的 start 对齐，连接键才对得上）。
     * WeakMap：页面关闭后条目自动消失，不留全局残留（C15）。
     */
    const pending = new WeakMap();
    /**
     * 上一轮解析到的条数，按页面记 —— `hasNextPage` 的判据。
     *
     * 「满页判据」：guest 端点**没有任何分页元信息**（没有 total），拉满 `pageSize`
     * （真机实测 10）说明大概率还有下一页；不满页说明这是最后一批。
     * 翻页契约已由 v2 探针钉死：三页零重叠、匿名侧同页大小。
     */
    const lastCount = new WeakMap();
    const dimensions = [
        {
            key: 'keyword',
            label: '关键词',
            values: [],
            hint: '自由文本，原样进 keywords（中英文皆可）',
            wire: { target: 'url', param: config.urlParams.keywordParam },
        },
        {
            key: 'city',
            label: '地点',
            values: LINKEDIN_CITY_SUGGESTIONS.map((city) => ({ value: city, label: city })),
            // 表里是**建议**不是取值域：location 是自由文本（英文地名最准，中文多数也能解析）
            closed: false,
            wire: { target: 'url', param: config.urlParams.locationParam },
            hint: '自由文本地点（location= 直接地名）。英文地名最准；「China」搜全国、' +
                '「Remote」搜远程岗 —— 列表外的地方（如 Hangzhou）也能直接收',
        },
        {
            key: 'postedWithinDays',
            label: '发布时间',
            values: LINKEDIN_POSTED_WITHIN_OPTIONS,
            // f_TPR=r<秒> 接受任意秒数（实测生效）—— 表里只是常用档
            closed: false,
            numeric: true,
            wire: { target: 'url', param: config.urlParams.timeRangeParam },
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
        // ── 站点有、当前通道收不了的筛选（2026-09-23 起如实声明，禁用而非隐藏）──────
        //
        // 用户真机在登录版搜索页全选筛选，地址栏形如
        // `…/jobs/search/?f_E=1,4&f_JT=F&f_WT=1&f_I=15&f_T=13&f_TPR=r2592000&sortBy=R…`
        // —— 但本适配器的主通道是**匿名 guest 端点**（登录页初始 0 卡片 + Trusted Types
        // 挡解析，走不通）。对 guest 端点做 slug 指纹对照（阳性对照 f_TPR 集合明显变化，
        // 证明方法有效）：`f_JT=F`、`f_E=1`、`f_WT=3`、多值 `f_JT=F,C` + `origin=…`
        // 与基线**逐条相同** —— guest 只认 keywords / location / f_TPR / start。
        //
        // 所以这三个维度声明为「封闭 + 空值域」（无 wire）：
        //   * 校验对带这些键的方案给出**精确报错**（"guest 通道忽略该参数"），
        //     而不是笼统的"当前平台不认识"；
        //   * 换平台残留的值照常进「用不了的筛选」可移除；
        //   * 界面不会多出控件（本来就没有能选的值）。
        // 若未来接入登录态搜索接口（那套面认筛选），再按真机证据把值域填上。
        {
            key: 'workExp',
            label: '经验等级',
            values: [],
            closed: true,
            hint: '登录版页面有 f_E（1实习-6高管），但匿名 guest 通道实测忽略该参数（2026-09-23 slug 指纹对照），带上不改结果',
        },
        {
            key: 'jobType',
            label: '职位类型',
            values: [],
            closed: true,
            hint: '登录版页面有 f_JT（F全职/P兼职/C合同/T临时/I实习），但匿名 guest 通道实测忽略该参数（2026-09-23 slug 指纹对照）',
        },
        {
            key: 'workMode',
            label: '办公形式',
            values: [],
            closed: true,
            hint: '登录版页面有 f_WT（1现场/2混合/3远程），但匿名 guest 通道实测忽略该参数（2026-09-23 slug 指纹对照）',
        },
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
            // 2026-09-21 actions 探针落地 readInbox：Messaging 会话卡结构有真机快照证据
            //（证据边界见 page/inbox.ts 文件头 —— 无未读/方向标记，如实降级）。
            supportsInbox: true,
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
                // 先记再跳：readListPage 的薪资回填要用同一条件构造搜索页。
                pending.set(page, criteria);
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
                // 可选薪资回填（2026-09-21 第三轮探针发现，默认关 —— 见 LinkedInConfig.salaryPanelEnabled）：
                // guest 通道 0/10 有薪资，但登录态搜索页列表卡部分展示（¥20K/月 形态）。
                // 「DOM 定列表、面板只补薪资」—— 与 zhipin 的 salaryApiEnabled 同一口径：
                // 按连接键只回填**空薪资**，对不上留空，绝不猜。
                if (config.salaryPanelEnabled && jobs.length > 0) {
                    try {
                        const panelUrl = buildLinkedInSearchUrl(config, pending.get(page) ?? {});
                        await page.goto(panelUrl);
                        if (page.waitForSelector !== undefined) {
                            await page.waitForSelector(config.salaryCardSelector, 15_000);
                        }
                        const wall = await page.evaluate(wallKindInPage, undefined);
                        if (wall === 'authwall' || wall === 'checkpoint') {
                            // 回填通道被墙：**不带倒主链**（列表数据已拿到，薪资本来就是可选）——
                            // 但要说出来，静默少数据是「不报警的坏法」。
                            options.logger?.warn(`[linkedin] 薪资回填通道被墙（${wall}）—— 本轮薪资留空`);
                        }
                        else {
                            const salaries = await page.evaluate(extractPanelSalariesInPage, {
                                cardSelector: config.salaryCardSelector,
                                salaryPattern: config.salaryPattern,
                            });
                            let filled = 0;
                            for (const job of jobs) {
                                if (job.salaryRaw !== '' || job.platformJobId === '')
                                    continue;
                                const salary = salaries[job.platformJobId];
                                if (salary === undefined || salary === '')
                                    continue;
                                job.salaryRaw = salary;
                                filled += 1;
                            }
                            if (filled > 0) {
                                options.logger?.info(`[linkedin] 薪资回填：${String(filled)}/${String(jobs.length)} 条`);
                            }
                        }
                    }
                    catch (error) {
                        options.logger?.warn(`[linkedin] 薪资回填通道失败（${error instanceof Error ? error.message : String(error)}）—— 本轮薪资留空`);
                    }
                }
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
        /**
         * 读收件箱（2026-09-21 `probe:linkedin-actions` 登录态真机证据落地）。
         *
         * 自导航契约（与 zhipin 同款）：goto Messaging → 等**容器**而不是行（空列表时
         * 容器在、行不在，等行会把"真的空"拖成超时，而超时的 [] 和"选择器腐烂"的 []
         * 长得一模一样）→ 判墙 → 解析。容器缺失时解析层抛错（0 条必须可信）。
         *
         * Messaging 是「人」维度（会话卡只有人名，无公司/岗位字段），与猎聘同形；
         * 未读与方向在 DOM 上**没有标记**（快照逐项核实过）—— `unread` 恒 false、
         * `direction` 按「漏报比误报贵」口径记 'hr'。证据边界详见 `page/inbox.ts`。
         */
        actions: {
            async readInbox(page) {
                await page.goto(`https://${config.host}${config.messagingPath}`);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.inboxSelectors.listContainer, options.waitForListMs ?? 20_000);
                }
                // 未登录会被弹到 authwall —— 这里抛风控错误而不是返回 []（guard 会如实转述）。
                const wall = await page.evaluate(wallKindInPage, undefined);
                if (wall === 'authwall') {
                    throw new PlatformBlockedError('login-required', 'Messaging 被登录墙接管（先完成登录）');
                }
                if (wall === 'checkpoint') {
                    throw new PlatformBlockedError('captcha', 'Messaging 被 checkpoint 挑战接管');
                }
                return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors });
            },
            // ⚠️ 刻意不实现 sayHello / sendResume / reply / detectStage：
            //   * send/reply：Easy Apply 是多步表单、Messaging 发送框无实测输入链路 —— 不可逆
            //     动作上没有实测过的确认链路就不写（两轮 actions 探针只读，均未渲染出按钮）；
            //   * sayHello：LinkedIn 求职者端没有「打招呼」语义（Messaging 需先建立联系）；
            //   * detectStage：登录态详情页两轮取证（9s sleep / 30s waitForSelector）连 h1
            //     都不渲染、`/my-items/applications/` 恒 404 空态 —— 无契约证据。
            //   调研入口：`npm run probe:linkedin-actions`（只读）。
        },
    };
}
//# sourceMappingURL=index.js.map