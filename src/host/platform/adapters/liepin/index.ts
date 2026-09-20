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
 *   * `page.ts`：页面上下文函数（会被 `page.evaluate` 序列化送进浏览器）；
 *   * `index.ts`：工厂 `createLiepinAdapter` 与 `LiepinAdapterOptions`（不转出配置面）。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { AdapterLogger, CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import { fetchListInPage, parseSearchApiResponse } from './api.js'
import {
  DEFAULT_LIEPIN_CONFIG,
  LIEPIN_BLOCK_FLAGS,
  LIEPIN_BLOCK_SIGNALS,
  LIEPIN_DEFAULT_MAX_PAGES,
  LIEPIN_MAX_PAGES,
  type LiepinConfig,
} from './config.js'
import { extractJobDetailInPage, extractJobsInPage, hasNextPageInPage, isLoggedInInPage } from './page.js'
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

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
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
      supportsInbox: false,
      supportsGreeting: false,
      // 公司/薪资锚点待夹具校准，可能缺失 → medium。
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
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
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
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
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(LIEPIN_BLOCK_SIGNALS),
          card: config.selectors.card,
          flags: LIEPIN_BLOCK_FLAGS,
        })
      },
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

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 猎聘的打招呼需要 hover 后才出现的按钮 + 登录态 + 实测契约
    // （见 docs/ADAPTERS.md §7.2），fail-closed 而不是假装能发。
  }
}
