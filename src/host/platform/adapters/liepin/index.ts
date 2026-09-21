/**
 * 猎聘（liepin.com）适配器 —— 风控强度最高的平台（R4 / `docs/ADAPTERS.md` §7.1）。
 *
 * ## 路线（D-17a 环境一致性）
 *
 * 平台层已就位的三件套是**能不能进门**的前提，本适配器自己不做任何反检测：
 *   * patchright 引擎（`platform/browser.ts`，默认 auto → 优先 patchright）；
 *   * stealth 注入（`platform/stealth.ts`）；
 *   * 端口守卫（`platform/cdp-guard.ts`，仅 TCP 调试端口开着时）。
 * 探针结论（§7.1）：猎聘检测的是"CDP 控制页面"的痕迹**本身**（`security.min.js`
 * 主动探测 + 页面被 `location.replace('about:blank')` 销毁），
 * 原版 playwright-core 与 attach 日常 Chrome 都过不去 —— 必须走 patchright 启动式。
 *
 * ## 猎聘特有信号
 *
 * 风控命中时页面被**整体销毁**成 about:blank —— `detectBlock` 把它判为 `blank`，
 * 调用方命中即停（C12），**绝不重试**（重试 = 再撞一次枪口）。
 *
 * ## 解析策略：语义锚点，不是类名锚点
 *
 * 猎聘是构建产物 DOM（class 混淆、随版本变），类名锚点易腐烂。
 * v1 用**语义锚点**（get_jobs 生产验证过的稳定结构）：
 *   * 卡片容器 `div[class*='job-card-pc-container']`（get_jobs Locators 生产在用）；
 *   * 职位链接 `a[href*='/job/']`：标题 + 详情 URL + 平台 id 三合一；
 *   * 公司链接 `a[href*='/company/']`：公司名（待夹具校准，锚不中就留空）；
 *   * 薪资：卡片文本匹配薪资模式（与 `parseSalary` 同一族形态）；
 *   * 「城市·经验·学历」三段文本：只在第三段命中学历词时才采信。
 *
 * **不编选择器**：锚不中的字段留空，由字段级断言隔离进 `pending_repair`
 * （原始片段保留，修好选择器后可重放）—— 这是 §4.2.4 设计好的降级路径。
 * 全部锚点与模式都在配置里（DB 可覆盖），待 `npm run probe:liepin` 保存的真实
 * 夹具（`test/fixtures/liepin-search.html`）校准后可换成精确选择器。
 *
 * ## 翻页（2026-09-18 实测验证）
 *
 * URL 参数 `currentPage`（**0 起**）真换数据：v8 探针对比第 1/2 页夹具，
 * 各 42 个 jobId **零重叠**（`test/fixtures/liepin-search{-p2}.html` 是证据，
 * 对应回归测试见 `test/platform/liepin.test.ts`）。只读采集用 URL 导航
 * （ADR-9），不需要 get_jobs 那种 AntD 按钮点击（那是投递场景）。
 * `hasNextPage` 看 `.list-pagination-box li.ant-pagination-next` 是否
 * disabled（夹具实测共 21 页）。
 *
 * ## 调研结论（夹具 + 接口采样交叉验证，2026-09-18）
 *
 * * 搜索接口 `POST api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`，
 *   请求体 `mainSearchPcConditionForm` 暴露了全部筛选参数：`city/dq`（码）、
 *   `pubTime`、`salaryCode`、`workYearCode`、`eduLevel`、`industry`、`compScale`…
 *   —— 但**只有 city 有 URL 证据**，其余维度不在搜索 URL 上（JS 控件），
 *   所以本适配器只声明 keyword/city/maxPages，**不编**其余维度；
 * * 无城市时接口默认 `city=410`（= 全国，接口采样证据）；具体城市码需逐城实测；
 * * 响应里的 `job.dq` 是**中文**（如 `北京-海淀区`），与 DOM【】文本一致；
 * * 响应字段比 DOM 富得多：`labels`（职位标签）、`refreshTime`（yyyymmddHHMMss）、
 *   `compId`、`recruiter.*`（HR 名/头衔/imId/是否已聊过）、`advViewFlag`（广告位）、
 *   `pcOuterLink`（外链岗）—— 这是 v2 接口化解析的方向（采样已存
 *   `test/fixtures/liepin-search-api*.json`）。
 *
 * ## 本目录分工（`adapters/liepin/`）
 *
 *   * `config.ts`：选择器 / URL 参数 / 配置接口 / `DEFAULT_LIEPIN_CONFIG` /
 *     `mergeLiepinConfig` / 正则与模式 / 判墙信号常量（纯数据 + 纯函数）；
 *   * `codes.ts`：370 条城市码表（体量大，单独成文件）；
 *   * `urls.ts`：宿主侧搜索 URL 与请求体构造（不碰 `document`）；
 *   * `api.ts`：页面内 fetch 通道 + 响应 → `RawJob` 解析；
 *   * `page/list.ts`：**列表侧**页面上下文函数（卡片解析 / 分页可用性 / 登录态锚点）；
 *   * `page/detail.ts`：**详情侧**页面上下文函数（JD / 薪资 / 关键信息行 / 公司名）；
 *   * `index.ts`：工厂 `createLiepinAdapter` 与 `LiepinAdapterOptions`（不转出配置面）。
 *     判墙的**唯一实现**（`detectBlockOf`）也在本文件 —— 与 `zhipin` 同一处，
 *     将来实现动作链时它的第二个消费者（`assertActionPage`）直接接在这里，不必再抄一遍信号集。
 *
 * 📌 `page/` 这一层是 2026-09-20 从单个 `page.ts` 拆出来的，对齐 `zhipin/page/` 的
 *    功能分区（那边是 `list/detail/chat/inbox`）。拆的理由与那边一样：**"这段函数在哪个
 *    页面上下文里跑"是读这份代码时最要紧的一件事**，而登录态锚点这种"列表页与详情页都不属于"
 *    的函数，塞在单文件里只能随便挂一处。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import { actionBlockOf, PlatformBlockedError } from '../../types.js'
import type {
  AdapterLogger,
  CriteriaDimension,
  PageLike,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../../types.js'
import { createLiepinActions } from './actions.js'
import { fetchListInPage, parseSearchApiResponse } from './api.js'
import {
  DEFAULT_LIEPIN_CONFIG,
  LIEPIN_BLOCK_FLAGS,
  LIEPIN_BLOCK_SIGNALS,
  LIEPIN_DEFAULT_MAX_PAGES,
  LIEPIN_MAX_PAGES,
  type LiepinConfig,
} from './config.js'
import { extractJobDetailInPage } from './page/detail.js'
import { extractJobsInPage, hasNextPageInPage, isLoggedInInPage } from './page/list.js'
import { buildLiepinSearchUrl, buildSearchRequestBody } from './urls.js'

export interface LiepinAdapterOptions {
  config?: LiepinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先；高斯 + 犹豫见 pacing.ts）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
  /** 诊断日志：只用于上报"接口通道静默降级了"这一类**不报警的坏法**。 */
  logger?: AdapterLogger
}

/** 构造猎聘适配器。 */
export function createLiepinAdapter(options: LiepinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_LIEPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]
  const logger = options.logger

  /**
   * 记住每个页面最近一次 gotoSearch 的条件（city 码 + 页码），供 readListPage
   * 构造接口请求体 —— 与 waiqi 的 `lastCode` 同一模式（主链顺序
   * `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的）。
   */
  const lastSearch = new WeakMap<object, { keyword: string; cityCode: string; page: number }>()

  /**
   * 判墙的**唯一实现**（与 `zhipin` 同一处）—— 两个消费者：`guard.detectBlock`（采集）
   * 与 `assertActionPage`（动作链）。
   *
   * 各写一遍意味着改信号时漏一处，就会出现"采集认得这道墙、动作不认得"，
   * 而动作那边恰恰是**会真发东西**的一侧。
   *
   * 猎聘特有的信号只有两项，都不是文案：`LIEPIN_BLOCK_SIGNALS`（极验 / 阿里云 WAF 的容器与脚本名）
   * 与 `LIEPIN_BLOCK_FLAGS` —— 后者是**结构性开关**（风控命中时 `security.min.js` 会
   * `location.replace('about:blank')` 把页面销毁 ⇒ `blankOnAboutProtocol`；登录墙**故意不判** ⇒
   * `skipLoginWall`，见 `config.ts` 里那份说明）。
   */
  const detectBlockOf = async (page: PageLike): Promise<BlockKind | null> =>
    await page.evaluate(detectBlockWithSignals, {
      signals: signalsOf(LIEPIN_BLOCK_SIGNALS),
      card: config.selectors.card,
      flags: LIEPIN_BLOCK_FLAGS,
    })

  /**
   * 动作链上的判墙：命中就抛 `PlatformBlockedError`（由 `guard.run()` 写平台级暂停）。
   *
   * `blank` **不算**风控（见 `types.ts` 的 `actionBlockOf`）：收件箱抽屉这类页面本来
   * 就没有岗位卡片，"0 卡片 + 文本短"是常态，照单全收等于每同步一次就白暂停一次平台。
   * 真正的"页面被销毁"由 `blankOnAboutProtocol` 那条结构性判据表达，与 `blank` 同值不同源。
   */
  const assertActionPage = async (page: PageLike): Promise<void> => {
    const kind = actionBlockOf(await detectBlockOf(page).catch(() => null))
    if (kind !== null) throw new PlatformBlockedError(kind, '动作页面上看到风控页面')
  }

  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，平台原样接收',
      wire: { target: 'url', param: config.urlParams.keywordParam },
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      // 猎聘的城市**同时进两个 query 参数**（`city` 与 `dq`，get_jobs 同款）——
      // 声明里指主参数，对账看的是"这个维度确实改变了请求"。
      wire: { target: 'url', param: config.urlParams.cityParam },
      hint:
        '370 个城市码是 2026-09-19 从猎聘「请选择城市」弹窗**逐省实测**的（原始数据与采样坑见 ' +
        'test/fixtures/liepin-city-codes.json）；表外城市一律拒绝，不猜。要加城市：重跑 ' +
        'npm run probe:liepin-chat，或写 DB 覆盖（setting scope=platform scope_ref=liepin key=adapter-config）',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: LIEPIN_MAX_PAGES,
      hint: `默认 ${String(LIEPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LIEPIN_MAX_PAGES)} 页；猎聘风控强度最高（antiBot=high），刻意比其它平台更保守`,
    },
  ]

  return {
    id: 'liepin',
    ...platformFacts('liepin'),
    displayName: '猎聘',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      /**
       * 平台**有**收件箱（IM 微前端 + `im.c.contact.get-contact-list`），
       * 且 2026-09-20 起我们**真的实现了** `readInbox` —— 两件事都必须为真才写 true
       * （`test/platform/facts.test.ts` 会钉住这条自洽性：实现了 `readInbox` 却标 false 会红）。
       */
      supportsInbox: true,
      /**
       * 2026-09-20 发送实验（三重证据闭环：上屏 → DOM 回读 → 接口交叉验证）后，
       * `sayHello` / `reply` 落地 —— 同上：平台有这能力**且**我们实现了，才写 true。
       * 副作用见 `greetingSideEffect`（插入建议卡片、**不代发**）。
       */
      supportsGreeting: true,
      // 核心字段**两条通道都给得全**（2026-09-20 复核：真实列表夹具 42 张卡
      // jobId/salary/company/city/edu/industry 各 42 命中，接口采样 42/42 同款齐全）。
      // 卡在这里的是**非核心**字段：`expReq` 夹具实测只有 23/42（近半数卡片锚不到经验词，
      // 具体形态未复核）—— 所以如实声明 medium，而不是因为核心字段可能缺。
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    /**
     * `requiredFields` **保留全部四个核心字段**（含 `salary_raw`）—— 与 `zhipin` 的取舍刚好相反，
     * 而这里的依据是实测数字：
     *
     *   * 猎聘的薪资是**明文**（夹具 `15-30k·14薪`，不像 BOSS 那种字体混淆成私有区码点），
     *     列表夹具 **salary 42/42**、接口采样 **42/42**；
     *   * `zhipin` 之所以把 `salary_raw` 剔出去，是因为那边"登录后才有、且 DOM 里是乱码"
     *     —— 薪资缺失是**平台事实**，留着会把整页记录打成待修复。猎聘没有这个事实。
     *
     * 换句话说：这条字段清单是**按各平台实测覆盖率**定的，不是统一套模板。
     * 真出现薪资锚不到的那一天（站点改版），这里该改的是**选择器/模式**，
     * 而不是把字段从必需清单里删掉把问题藏起来。
     */
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: LIEPIN_MAX_PAGES,
    defaultMaxPages: LIEPIN_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildLiepinSearchUrl(config, criteria)
      },
    },

    // 登录态检测（2026-09-19 落地）。此前**故意不声明** —— `auth === undefined` 会让
    // `platforms.loginStatus` 直接抛「没有声明登录入口」，而 `account.loggedIn` 恒 false，
    // 于是界面上所有"需要登录"的入口永远不会亮（哪怕适配器已经能干活）。
    // 语义提醒：搜索**不需要**登录（`capabilities.searchWithoutLogin`），
    // 这个检测主要服务于"别把登录墙当成没有新岗位"与后续高危动作。
    auth: {
      // 没有可验证的独立登录页：登录是**页头弹层**（`#header-quick-menu-login` 是个没有 href 的 span），
      // 所以这里用首页兜底 —— 导航过去后用户在页头点「登录/注册」即可。**不编 URL**。
      loginUrl: 'https://www.liepin.com/',
      /**
       * 检测判哪一页 —— 与 `loginUrl` 分开，是 `auth.checkUrl` 那条纪律的落地点
       * （见 `types.ts` 里 51job/智联那两个反例）：**判据是在哪一页校准的，就去哪一页判**。
       *
       * 猎聘的两个登录标记（`#header-quick-menu-user-info` / `.header-quick-menu-not-login-item`）
       * 是在**搜索页**上定案的 —— 匿名夹具 `test/fixtures/liepin-search.html` 抓的就是搜索页，
       * 登录态捕获那一份也是。而 `loginUrl` 是首页，**从未**被验证过页头结构与搜索页一致
       * （首页可能换版式/走另一套页头组件）⇒ 拿它当检测页等于换了一套没验过的判据。
       * 注意这里传空 criteria：检测页只要"能打开、页头在"，不需要关键词与城市。
       */
      checkUrl: buildLiepinSearchUrl(config, {}),
      async isLoggedIn(page): Promise<boolean> {
        const verdict = await page.evaluate(isLoggedInInPage, {
          loggedInMarker: config.selectors.loggedInMarker,
          notLoggedInMarker: config.selectors.notLoggedInMarker,
        })
        // 判不出来时按"未登录"处理（保守，见 isLoggedInInPage 的说明）。
        return verdict ?? false
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildLiepinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`liepin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        const cityCode =
          criteria.city !== undefined && criteria.city !== '' && config.cityCodes[criteria.city] !== ''
            ? (config.cityCodes[criteria.city] as string)
            : '410'
        lastSearch.set(page as object, {
          keyword: criteria.keyword ?? '',
          cityCode,
          page: criteria.page ?? 1,
        })
        await page.goto(url)
        // 等卡片挂载（不要求可见：猎聘卡片可能被弹窗遮挡）。
        //
        // ⚠️ **这里吞掉等待的失败，是刻意的**（`zhipin` 的 gotoSearch 同款）：
        //   等待超时本身按契约返回 `false`（不抛错），但页面**被销毁/崩溃**时 Playwright 会抛。
        //   而"抛"的后果很具体：`crawl.ts` 会把 `gotoSearch` 的异常记成 `NAVIGATION_FAILED`
        //   并**直接结束本轮**，也就**跳过了紧随其后的 `detectBlock`**
        //   —— 于是猎聘最典型的那个风控形态（`security.min.js` 把页面
        //   `location.replace('about:blank')`）会被报成"导航失败"而不是 `blank`/风控，
        //   既拿不到"该停手"的语义，也不会触发平台级暂停。
        //   吞掉之后：0 卡片 + 短文本会由 `detectBlock` 如实判成 `blank`。
        if (page.waitForSelector !== undefined) {
          try {
            await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
          } catch {
            /* 交给 detectBlock / readListPage 的 0 条去暴露（见上） */
          }
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts）。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // 猎聘是**风控最强**的一档，而它原先在整条采集链上一次输入事件都不产生
        // （只有导航 + 读 DOM）。"指针一次都没动过"在这种站点上是低强度但稳定可累积的信号。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        // 双通道（v2 接口化）：先试搜索接口（字段更富：refreshTime/labels/compId），
        // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
        // ⚠️ 但"静默"回退有个陷阱：接口要是**一直**失败（例如请求头少了 `x-fscp-*`），
        //    表现是"一切正常"，只是永远拿不到 `publishedAt`/`industry`/`companySize`。
        //    所以请求头是**必填**的（见 `LIEPIN_API_HEADERS` 的实测表），
        //    并由 `probe:liepin-chat` 的"生产路径"变体在线复验 + 用例钉住形状。
        const remembered = lastSearch.get(page as object)
        if (config.searchApiEnabled && remembered !== undefined) {
          const payload = await page
            .evaluate(fetchListInPage, {
              apiPath: `${config.searchApiOrigin}${config.searchApiPath}`,
              body: buildSearchRequestBody(
                { keyword: remembered.keyword, page: remembered.page },
                remembered.cityCode,
              ),
              headers: config.apiHeaders,
            })
            .catch(() => null)
          const viaApi = parseSearchApiResponse(payload)
          if (viaApi.length > 0) return viaApi
          // 走到这里 = 接口**没给出东西**。三种情况要分清，前两种必须留痕：
          //   * `payload === null`：请求根本没通（网络 / CORS / 页面没到域上）；
          //   * `flag ≠ 1`：服务端拒绝了这次请求（`-1400` = `x-fscp-*` 一族不全或风控收紧）；
          //   * `flag === 1` 但列表空：**这是正常结果**（真的没搜到），不打日志。
          //
          // 为什么非留痕不可：静默回退 DOM 的代价是"接口坏掉几个月，表现一切正常"——
          // 四个核心字段照常命中（DOM 兜底也给得出），只是 `publishedAt` / `industry` /
          // `companySize` / `labels` **永远是空**。健康度、字段计数、量级基线一个都不会响。
          const flag = (payload as { flag?: unknown } | null)?.flag
          if (payload === null || flag !== 1) {
            logger?.warn(
              `[liepin] 搜索接口没给出结果（${payload === null ? '请求失败' : `flag=${String(flag)}`}）` +
                '—— 已回退 DOM 解析；这一批的 publishedAt / industry / companySize / labels 会留空',
            )
          }
        }
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          salaryPattern: config.salaryPattern,
          jobIdPattern: config.jobIdPattern,
          // 规范 id 来源（与接口通道的 `job.jobId` 同一套）——见 `LiepinConfig.jobPgRefPattern`
          jobPgRefPattern: config.jobPgRefPattern,
          cityPattern: config.cityPattern,
          expPattern: config.expPattern,
          eduPattern: config.eduPattern,
        })
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {
          pagination: config.selectors.pagination,
          nextPage: config.selectors.nextPage,
          disabledClass: config.selectors.nextPageDisabledClass,
        })
      },
    },

    guard: {
      // 实现只有一份（`detectBlockOf`）—— 动作链接进来时也复用它。
      detectBlock: detectBlockOf,
    },

    /**
     * 详情页解析（2026-09-18 探针夹具校准）。
     *
     * 为什么值得实现：猎聘的**列表接口与列表 DOM 都不含 JD**（采样逐键确认），
     * 而 JD 是打分/黑话标注/简历定制的输入 —— 不抓 JD，猎聘的岗位在这几项上
     * 只能按"无 JD"降级。详情页 SSR 直出、未登录可读，实测量级允许（见 ADAPTERS §7.2）。
     */
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractJobDetailInPage, {
          selectors: config.selectors,
          expPattern: config.expPattern,
          eduPattern: config.eduPattern,
        })
      },
    },

    /**
     * 动作链：`readInbox`（接口）+ `sayHello` / `reply`（页面输入面 + CDP 真键盘），见 `./actions.ts`。
     *
     * 判墙实现（`assertActionPage`）留在本文件，与 `guard.detectBlock` 共用 `detectBlockOf`
     * —— 一处实现两个消费者。
     */
    actions: createLiepinActions({ config, assertActionPage, delayRangeMs: [delayMin, delayMax] }),

    /*
     * ## 发送链路的证据（2026-09-20 发送实验，`LIEPIN_ALLOW_SEND=1 npm run probe:liepin-chat`）
     *
     * 之前不实现 `sayHello`/`reply` 的理由是"点到了 ≠ 发出去了，没有可验证的桥"。发送实验把这座桥
     * 搭起来了 —— **三重证据闭环**，全部来自真实会话：
     *   ① `textarea.value === 话术`（回车前校验，防止把空框/半截文本发出去）；
     *   ② 回车后 `.im-ui-message-item-send` 出现同文本、loading 图标归 `hide`（DOM 送达）；
     *   ③ `get-contact-list` 第一行的 `lastPayload` 就是这句话（接口交叉验证）。
     * `open-chat` 的受理/被拒虽然看不到 HTTP 应答，但 **DOM 后果可辨**：被拒弹
   * `.complete-resume-modal`（code 30011）、受理则会话输入框出现 —— `sayHello` 按此分支。
     *
     * 两个实验里钉死的坑（都已写进实现）：
     *   * **焦点陷阱**：点击落在动画中的弹窗上、焦点没进输入框 ⇒ `insertText` 全部落空
     *     （第一次实验：value 恒空、Enter 落空、什么都没发出）。⇒ 输入前必校验 value、
     *     失败再聚焦并回退真键盘路径（`keyboard.type`），两路都不上屏就绝不按回车；
     *   * **入口懒加载**：详情页上 `#im-c-entry` 的内层 `.im-ui-basic-entry` 不保证渲染
     *     （快照实测详情页 0 / 搜索页 1）⇒ `reply` 固定从搜索页进抽屉，等待也等内层选择器。
     *
     * ## 仍不实现（结论，不是没排上）
     *
     *   * `sendResume`：投递入口 `a.btn-minor`「投简历」只取过证、有没有二级确认未实测 ——
     *     不可逆动作上没有实测过的确认链路就不写；
     *   * `detectStage`：会话按**人**归并（行 `id` = 招聘者 id），而调用只给
     *     `{title, company, sourceUrl}`、没有数字 jobId 可对 —— 只有 HR 主动发来的会话
     *     带岗位卡（`extType 202` 的 `bizData.jobId`），覆盖不全；
     *   * `supportsReadReceipt` 保持 false：平台会话行有 `oppositeRead` 但实测**恒 "1"**
     *     （没有反向样本），不敢当"对方已读"的判据。
     */
  }
}
