/**
 * LinkedIn（www.linkedin.com）适配器 —— 2026-09-21 调研实现，2026-09-20 两轮真机校准
 * （`probe:linkedin-login` 登录侧 + `probe:linkedin-v2` 深度探针）。
 *
 * ## 调研来源与结论
 *
 * **每条关键事实都有真机证据**（`.probe-linkedin-capture/` 的快照与 v2-report）：
 *
 * * **中国版已死**：InCareer 2023-08 下线，`cn.linkedin.com` 只剩落地页 → 全球站
 *   `www.linkedin.com`（中文界面/中国岗位照常可搜）。
 * * **主通道 = guest 匿名端点（导航式）**：`/jobs-guest/jobs/api/seeMoreJobPostings/search`
 *   返回岗位卡片 HTML 片段，匿名可读（v2：匿名侧 200、10 条，与登录态一致）。
 *   ⚠️ **必须顶层导航**，不能「页面内 fetch 回字符串再解析」—— LinkedIn 的 CSP 启用
 *   **Trusted Types**，`innerHTML` 与 `DOMParser.parseFromString` 在真实页面上都抛
 *   「requires TrustedHTML」（v2 探针两次真机实测；jsdom 离线测试测不出 —— 没有 CSP）。
 *   适配器 v1 的「fetch + 注入解析」在真机上就是这个坑：**静默**退回 DOM 兜底。
 * * **搜索页不是采集通道**：登录态下初始 DOM 0 卡片（1.5MB 页面，客户端渲染）；
 *   未登录（游客）态虽 SSR 直出（v2 实测匿名访问带 trk 的搜索页落点无 authwall、
 *   60 张卡片），但主通道统一走 guest 端点后搜索页只剩一个用途：`auth.checkUrl`
 *   （登录标记 global-nav 只在完整页面里有，guest 片段页没有页头）。
 * * **URL 参数真伪（v2 实测）**：guest 端点只认 `keywords` / `location` / `start` /
 *   `f_TPR`（r86400 → 全部 datetime 落在当天，**真生效**）。`f_E`（经验）、`f_WT`
 *   （工作方式）、`f_AL`（Easy Apply）、`sortBy` **全部被忽略**（f_E=4 与对照 id
 *   集合差异 0；sortBy=DD 序列不降序）→ 这些维度**不声明**（拼一个不生效的参数
 *   就是在骗配置界面）。
 * * **翻页契约定案（v2 实测）**：start=0/10/20 三页各 **10 条**、页间**零重叠**、
 *   匿名侧同样 10 条 —— 不是社区文档说的 25。满页判据（拉满 pageSize = 有下一页）
 *   因此成立。
 * * **详情页对游客 SSR 直出（v2 实测）**：`/jobs/view/{id}` 匿名打开落点无 authwall，
 *   锚点全中：标题 `h1.topcard__title`、公司 `a.topcard__org-name-link`、JD 全文
 *   `.description__text--rich .show-more-less-html__markup`（clamp 折叠是 CSS 层的事，
 *   textContent 是全文）、criteria `li.description__job-criteria-item`（h3 标题 +
 *   span 值：职位级别/职位性质/职能类别/行业）→ `detail.extract` 已落地，无需登录。
 * * **薪资并非无源（第三轮翻案）**：guest 通道卡片 0/10，但**登录态搜索页的列表卡**
 *   （`[data-occludable-job-id]`）部分展示薪资明文（实测 `¥20K/月 - ¥27K/月`，薪资节点
 *   类名是每次随机的混淆串 → 按文本抠）→ 已接**可选回填通道** `salaryPanelEnabled`
 *   （默认关；开启后 readListPage 额外导航一次登录态搜索页，按 occludable id ↔
 *   platformJobId 只回填**空薪资**，对不上留空 —— 与 zhipin 的 salaryApiEnabled 同口径）。
 * * **卡片结构（base-card 族）**：卡片 `div.base-card` 带
 *   `data-entity-urn="urn:li:jobPosting:{id}"`；标题链 `a.base-card__full-link`；
 *   公司 `.base-search-card__subtitle`；地点 `.job-search-card__location`（真机样本含
 *   中文「上海市」）；时间 `time[class*="listdate"]`（datetime 是 ISO 日期）。
 *   真机读数：标题/公司/地点/日期 10/10。
 * * **风控（业内最强一档）**：专属 **HTTP 999** 状态码、429、`/checkpoint/challenge/`
 *   挑战页、authwall → `antiBot: high`；页数刻意保守（默认 2 / 上限 5）。
 *   **登录墙只信地址**（`/authwall`、`/login`），词表 `skipLoginWall` —— 游客页页头
 *   本来就长着 Sign in / Join now 按钮，文案判据会把正常页误判成登录墙。
 * * **登录标记两侧定案**（login 探针）：`.global-nav__me-photo` / `.global-nav__me`
 *   已登录侧各 1、未登录侧 0 → `auth.isLoggedIn` 已落地（`checkUrl` 用搜索页 —— 登录页
 *   上没有 global-nav，在那儿判恒「未登录」）。
 *
 * ## 登录态动作（2026-09-21 `probe:linkedin-actions` 登录态只读取证）
 *
 * * **readInbox 已落地**：Messaging（/messaging/）会话卡结构有真机快照证据
 *   （`li.msg-conversation-listitem` + `.msg-conversation-card__participant-names` /
 *   `__message-snippet` / `__time-stamp`）；DOM 上**无未读标记**（唯一的
 *   `.notification-badge` 是全局导航的）、**无方向标记**（zhipin 有 `.message-status`，
 *   LinkedIn 没有）→ `unread` 恒 false、`direction` 按「漏报比误报贵」记 'hr'。
 *   会话卡也无公司/岗位字段（「人」维度，与猎聘同形）。
 * * **sayHello / sendResume / reply / detectStage 保持 fail-closed**，因为：
 *   * 游客版详情页点「申请」只弹注册登录模态（`contextual-sign-in-modal`，v2 快照证实）；
 *     登录态的**动作入口**已由第三轮探针拿到（登录态搜索页 + currentJobId 的右侧详情
 *     面板正常渲染：`.jobs-apply-button` / `.jobs-save-button` 各 2，aria-label 区分
 *     Easy Apply 与站外申请），但 **Easy Apply 是多步表单**（简历→问题→提交）——
 *     入口有了，提交链路没有；不可逆动作上没有实测过的确认链路就不写；
 *   * `/my-items/applications/` 对无申请记录的账号是 **404 空态**
 *     （`data-test-not-found-error-container`，两轮一致）—— detectStage 无契约来源；
 *   * LinkedIn 封号风险业内最高。
 *   调研入口：`npm run probe:linkedin-actions`（只读：不点申请、不发消息）。
 *
 * ## 本仓实测入口
 *
 * * `npm run probe:linkedin` —— guest 端点 + 搜索页落点的轻量探针（可离线复跑）
 * * `npm run probe:linkedin-login` —— 手动登录 + 登录标记两侧对比 + 登录态快照
 * * `npm run probe:linkedin-v2` —— 深度探针：翻页契约 / 筛选参数真伪 / 详情两条路 /
 *   匿名侧（产物 `v2-report-<日期>.json`）
 *
 * ── 本目录分工 ─────────────────────────────────────────────────────────
 * * `config.ts`：选择器（列表+详情+收件箱）/ URL 参数 / guest 端点路径 / 正则 / 时间窗 / 判墙信号（纯数据+纯函数）；
 * * `urls.ts`：guest 端点（主导航目标）与搜索页（登录检测用）的 URL 构造，不碰 `document`；
 * * `page/list.ts`：卡片解析（活 DOM）；`page/detail.ts`：详情页解析；`page/inbox.ts`：
 *   Messaging 收件箱解析；`page/guard.ts`：地址级判墙 + 登录检测 —— 全部自包含、只读（Trusted Types 红线）；
 * * `index.ts`：本文件 —— 适配器装配（`createLinkedInAdapter`）与 `criteriaDimensions` 表。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type {
  AdapterLogger,
  CriteriaDimension,
  RawInboxMessage,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../../types.js'
import { PlatformBlockedError } from '../../types.js'
import {
  DEFAULT_LINKEDIN_CONFIG,
  LINKEDIN_BLOCK_SIGNALS,
  LINKEDIN_CITY_SUGGESTIONS,
  LINKEDIN_DEFAULT_MAX_PAGES,
  LINKEDIN_MAX_PAGES,
  LINKEDIN_POSTED_WITHIN_OPTIONS,
  linkedinBlockFlags,
} from './config.js'
import type { LinkedInConfig } from './config.js'
import { buildLinkedInGuestApiUrl, buildLinkedInSearchUrl } from './urls.js'
import { extractDetailInPage } from './page/detail.js'
import { readInboxInPage } from './page/inbox.js'
import { extractJobsInPage, extractPanelSalariesInPage } from './page/list.js'
import { isLoggedInInPage, wallKindInPage } from './page/guard.js'

export interface LinkedInAdapterOptions {
  config?: LinkedInConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等卡片文档渲染出来的上限（ms）。 */
  waitForListMs?: number
  /** 诊断日志：只用于上报「薪资回填通道被墙/失败」这一类不报警的坏法。 */
  logger?: AdapterLogger
}

/** 构造 LinkedIn 适配器。 */
export function createLinkedInAdapter(options: LinkedInAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_LINKEDIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]
  const logger = options.logger

  /**
   * 上一次 `gotoSearch` 记下的筛选条件：薪资回填通道要用它构造**同条件**的登录态
   * 搜索页（guest 文档页与搜索页的 start 对齐，连接键才对得上）。
   * WeakMap：页面关闭后条目自动消失，不留全局残留（C15）。
   */
  const pending = new WeakMap<object, SearchCriteria>()

  /**
   * 上一轮解析到的条数，按页面记 —— `hasNextPage` 的判据。
   *
   * 「满页判据」：guest 端点**没有任何分页元信息**（没有 total），拉满 `pageSize`
   * （真机实测 10）说明大概率还有下一页；不满页说明这是最后一批。
   * 翻页契约已由 v2 探针钉死：三页零重叠、匿名侧同页大小。
   */
  const lastCount = new WeakMap<object, number>()

  const dimensions: CriteriaDimension[] = [
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
      hint:
        `默认 ${String(LINKEDIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LINKEDIN_MAX_PAGES)} 页（每页 10 条）。` +
        'LinkedIn 风控是业内最强一档（999 / authwall / checkpoint / 封号），刻意保守',
    },
    // ⚠️ 刻意不声明 experienceLevel / workMode / easyApply / sort：
    //   2026-09-20 v2 实测 guest 端点对这些参数**全部忽略**（f_E=4 与对照 id 集合差异 0、
    //   sortBy=DD 不降序）—— 声明了也不改结果，等于给配置界面撒谎。
    //   若未来接入登录态搜索接口（那套面认筛选），再按真机证据加回。
  ]

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
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: LINKEDIN_MAX_PAGES,
    defaultMaxPages: LINKEDIN_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        // 采集导航目标是 guest 端点（见 crawl.gotoSearch）—— 这里给的是同一条件的地址。
        return buildLinkedInGuestApiUrl(config, criteria)
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
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, { selector: config.loggedInSelector })
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        // ⚠️ 导航目标是 **guest 端点**，不是搜索页：
        //   ① 搜索页登录态下初始 DOM 0 卡片（客户端渲染），guest 端点两种状态都有数据；
        //   ② LinkedIn 的 CSP（Trusted Types）让「fetch 回字符串再解析」在真实页面上
        //      必抛错 —— 顶层导航让浏览器自己渲染片段成文档，`readListPage` 解析活 DOM。
        const url = buildLinkedInGuestApiUrl(config, criteria)
        // 先记再跳：readListPage 的薪资回填要用同一条件构造搜索页。
        pending.set(page as object, criteria)
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // 留下真实的滚动与指针轨迹（D-17a：纯无输入访问是可识别形态）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        // 主链顺序保证 gotoSearch → detectBlock → readListPage：此时文档就是 guest
        // 端点渲染出的卡片列表（顶层导航，见 gotoSearch 的理由）。
        const jobs = await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          host: config.host,
          jobUrnPattern: config.jobUrnPattern,
          jobIdFromUrlPattern: config.jobIdFromUrlPattern,
          salaryPattern: config.salaryPattern,
        })

        // 可选薪资回填（2026-09-21 第三轮探针发现，默认关 —— 见 LinkedInConfig.salaryPanelEnabled）：
        // guest 通道 0/10 有薪资，但登录态搜索页列表卡部分展示（¥20K/月 形态）。
        // 「DOM 定列表、面板只补薪资」—— 与 zhipin 的 salaryApiEnabled 同一口径：
        // 按连接键只回填**空薪资**，对不上留空，绝不猜。
        if (config.salaryPanelEnabled && jobs.length > 0) {
          try {
            const panelUrl = buildLinkedInSearchUrl(config, pending.get(page as object) ?? {})
            await page.goto(panelUrl)
            if (page.waitForSelector !== undefined) {
              await page.waitForSelector(config.salaryCardSelector, 15_000)
            }
            const wall = await page.evaluate(wallKindInPage, undefined as never)
            if (wall === 'authwall' || wall === 'checkpoint') {
              // 回填通道被墙：**不带倒主链**（列表数据已拿到，薪资本来就是可选）——
              // 但要说出来，静默少数据是「不报警的坏法」。
              options.logger?.warn(`[linkedin] 薪资回填通道被墙（${wall}）—— 本轮薪资留空`)
            } else {
              const salaries = await page.evaluate(extractPanelSalariesInPage, {
                cardSelector: config.salaryCardSelector,
                salaryPattern: config.salaryPattern,
              })
              let filled = 0
              for (const job of jobs) {
                if (job.salaryRaw !== '' || job.platformJobId === '') continue
                const salary = salaries[job.platformJobId]
                if (salary === undefined || salary === '') continue
                job.salaryRaw = salary
                filled += 1
              }
              if (filled > 0) {
                options.logger?.info(`[linkedin] 薪资回填：${String(filled)}/${String(jobs.length)} 条`)
              }
            }
          } catch (error) {
            options.logger?.warn(
              `[linkedin] 薪资回填通道失败（${error instanceof Error ? error.message : String(error)}）—— 本轮薪资留空`,
            )
          }
        }

        lastCount.set(page as object, jobs.length)
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        const count = lastCount.get(page as object)
        return count !== undefined && count >= config.pageSize
      },
    },

    /**
     * 详情页解析（2026-09-20 v2 真机锚点，见文件头）。详情页对游客 SSR 直出 ——
     * 无需登录态；打不开（authwall/挑战）由主链 `fetchNewJobDetails` 的判墙兜底。
     */
    detail: {
      async extract(page): Promise<RawJobDetail> {
        const parsed = await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
        // 详情页真机上没有薪资（v2 实测 0 命中）—— 薪资留空是**平台事实**，不是解析失败。
        return parsed
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
      async detectBlock(page): Promise<BlockKind | null> {
        const wall = await page.evaluate(wallKindInPage, undefined as never)
        if (wall === 'authwall') return 'login-required'
        if (wall === 'checkpoint') return 'captcha'
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(LINKEDIN_BLOCK_SIGNALS),
          card: config.selectors.card,
          flags: linkedinBlockFlags(config.host),
        })
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
      async readInbox(page): Promise<RawInboxMessage[]> {
        await page.goto(`https://${config.host}${config.messagingPath}`)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.inboxSelectors.listContainer, options.waitForListMs ?? 20_000)
        }
        // 未登录会被弹到 authwall —— 这里抛风控错误而不是返回 []（guard 会如实转述）。
        const wall = await page.evaluate(wallKindInPage, undefined as never)
        if (wall === 'authwall') {
          throw new PlatformBlockedError('login-required', 'Messaging 被登录墙接管（先完成登录）')
        }
        if (wall === 'checkpoint') {
          throw new PlatformBlockedError('captcha', 'Messaging 被 checkpoint 挑战接管')
        }
        return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors })
      },
      // ⚠️ 刻意不实现 sayHello / sendResume / reply / detectStage：
      //   * send/reply：Easy Apply 是多步表单、Messaging 发送框无实测输入链路 —— 不可逆
      //     动作上没有实测过的确认链路就不写（两轮 actions 探针只读，均未渲染出按钮）；
      //   * sayHello：LinkedIn 求职者端没有「打招呼」语义（Messaging 需先建立联系）；
      //   * detectStage：登录态详情页两轮取证（9s sleep / 30s waitForSelector）连 h1
      //     都不渲染、`/my-items/applications/` 恒 404 空态 —— 无契约证据。
      //   调研入口：`npm run probe:linkedin-actions`（只读）。
    },
  }
}
