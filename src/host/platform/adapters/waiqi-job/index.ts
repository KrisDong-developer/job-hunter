/**
 * 神仙外企（waiqi.com）适配器 —— 列表页采集。
 *
 * ## 这个平台和 51job / 智联的根本区别：**页面里没有岗位列表的 HTML**
 *
 * `/position` 是纯前端 SPA（Vue3 + webpack 分包），列表由
 * `POST https://backservice.offerxiansheng.com/api/position-service/social-position/foreign/page-list`
 * 返回的 JSON 渲染而来。所以：
 *
 *   * 抓 DOM 只能拿到一堆空壳 —— 必须**在页面上下文里调接口**（`page.evaluate` 里 `fetch`）；
 *   * 在页面里发请求还顺带拿到了**同源 Cookie / 登录态**（`credentials: 'include'`），
 *     与用户自己在浏览器里翻列表走同一条链路（比在 Node 侧另起一个 HTTP 客户端更"像人"）。
 *
 * ## 两条实测出来的硬事实（决定了能力声明，不要试图"优化"掉）
 *
 * | 事实 | 实测 | 后果 |
 * |---|---|---|
 * | 服务端翻页是坏的 | `page>=2` 恒返回 `positionVO.records=[]`（`size` 取 1/3/10/20/21/50 都一样） | `maxPages = 1`，**不假装能翻页** |
 * | 单页容量上限 50 | `size=50` 正常；`size=100` → `code=1010 "size最大为50"` | 一次最多 50 条 |
 *
 * 翻页那条特别要紧：`page=2` 返回的是**成功响应 + 0 条**，
 * 如果声明 5 页，主链会把 4 次"成功但空"记成正常结果
 * —— 正好落进 §4.2.4 要防的"今天没有新岗位"静默失败。
 *
 * ## 哪些筛选真的生效（其余一律不声明）
 *
 * 实测生效：`name`（关键词）、`cityIds`（城市 id）、`workExp`、`education`、
 * `type`（外企 / 不限）、`posIds`（职能）、`businessCategoryIdList`（行业）、
 * `companyTypeList`（企业性质）。
 * 实测**不生效**：`keyword` / `positionName` / `searchKey`（原样返回全量）、
 * `cityName` / `city`（被忽略）、`foreignCompanyTag`、`status`、`expectId`；
 * `sort` 虽然收参数，但 0~5 的结果**逐条一致**（等于没有排序），所以也不声明。
 *
 * 所以本适配器只声明**验证过**的维度（关键词 / 城市 / 工作经验 / 学历 / 职位范围 /
 * 页数）；没验证过的一律不声明 —— 声明了却传不下去，用户会以为筛选生效了。
 * 职能 / 行业 / 企业性质虽然生效，但要各自挂一份 id 表才做得对，本轮先不做（见
 * `docs/PLATFORM-WAIQI.md` §6）。
 *
 * ## robots.txt 取舍（2026-09-21 口径更新，经用户确认）
 *
 * `https://www.waiqi.com/robots.txt` 只禁 `/position/detail`：
 * ```
 * User-agent: *
 * Disallow: /position/detail
 * Allow: /
 * ```
 * 2026-09-18 的旧口径是"完全不碰详情页"。本轮起 **detail 补抓会导航到该页**：
 * 主链 `fetchNewJobDetails` 固定 `goto(sourceUrl)`，适配器无法绕开。取舍如下 ——
 *
 *   * JD 明文取自**同源 details 接口**（`backservice.offerxiansheng.com`，不在
 *     www.waiqi.com robots 的管辖域），**不解析**页面 DOM；
 *   * 频次受主链三重约束：只补**新增**岗位、每轮 `DETAIL_FETCH_MAX_PER_ROUND` 上限、
 *     高斯间隔 + 突发惩罚（`domain/crawl.ts`）；
 *   * 平台若收紧 robots / 用户不想让采集链打开详情页：DB 覆盖
 *     `detailApiEnabled:false` 即可整体下线（`detail` 槽位随之为空）。
 *
 * 详情页链接 `source_url` 本来就是给人点的，这一点不变。
 *
 * ## 本目录分工（每平台一个目录）
 *
 *   * `config.ts` —— 配置面：选择器接口 / 字段名（列表 + 详情两份）/ 值域 / 城市码表 /
 *     职能与行业 seed / 判墙信号常量 + `mergeWaiqiConfig`（纯数据 + 纯函数）；
 *   * `urls.ts`   —— 宿主机侧的 URL 与请求体构造（含多城市归一化 `splitCityList`，不碰 `document`）；
 *   * `page.ts`   —— 页面上下文函数（`page.evaluate` 序列化后进浏览器），
 *     含 `fetchListInPage` 写 `globalThis.__WAIQI_LIST_PAYLOAD__`
 *     与 `extractJobsInPage` 读它的**同文件协议**（详情侧 `fetchDetailInPage` /
 *     `extractDetailInPage` 同款一对）；
 *   * `index.ts`  —— 工厂 `createWaiqiAdapter` 与本文件头（实测记录的正身）。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type {
  CriteriaDimension,
  PageLike,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../../types.js'
import { PlatformBlockedError } from '../../types.js'
import {
  DEFAULT_WAIQI_CONFIG,
  WAIQI_BLOCK_SIGNALS,
  WAIQI_EDUCATION_OPTIONS,
  WAIQI_MAX_PAGE_SIZE,
  WAIQI_MAX_PAGES,
  WAIQI_TYPE_OPTIONS,
  WAIQI_WORK_EXP_OPTIONS,
} from './config.js'
import type { WaiqiConfig } from './config.js'
import { WAIQI_BODY_FIELDS, buildWaiqiRequestBody, buildWaiqiSearchUrl } from './urls.js'
import {
  countCardsInPage,
  detectBlockInPage,
  extractDetailInPage,
  extractJobsInPage,
  fetchDetailInPage,
  fetchListInPage,
  hasNextPageInPage,
  isLoggedInInPage,
} from './page.js'

export interface WaiqiAdapterOptions {
  config?: WaiqiConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等页面渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造神仙外企适配器。 */
export function createWaiqiAdapter(options: WaiqiAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_WAIQI_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 上一次 `gotoSearch` 记下的筛选条件。
   *
   * 为什么需要它：抓取主链每页会重新调 `gotoSearch`，而 `readListPage(page)`
   * 只拿得到 `page`，拿不到 `criteria`（见 `domain/crawl.ts` 的循环）。
   * 用 `WeakMap` 而不是 `Map`：页面关闭后条目自动消失，不留全局残留（C15）。
   */
  const pending = new WeakMap<object, SearchCriteria>()

  /**
   * 最近一次列表接口返回的 code，按页面记。
   *
   * 为什么需要它：抓取主链的顺序是 `gotoSearch → detectBlock → readListPage`，
   * 而接口请求发生在第三步。所以 `detectBlock` **不能**自己去再发一次请求
   * （那会让每次抓取都翻倍请求，把风控概率也翻倍）。
   * 我们记下上一轮的结果，让判墙用"最近一次真实的接口应答"。
   */
  const lastCode = new WeakMap<object, number | null>()

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，对应接口的 name 字段（实测：keyword/positionName 这些键**无效**，只有 name 生效）',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.keyword },
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint:
        '城市走接口的 cityIds（平台自增主键，不能按行政区划码猜）；表里没有的城市无法构造请求。' +
        '支持逗号分隔**多城市**（如 `深圳,广州`），一次请求按多个城市过滤',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.city },
    },
    {
      key: 'workExp',
      label: '工作经验',
      values: WAIQI_WORK_EXP_OPTIONS,
      hint: '平台只有 6 档（0~5）；实测 6/7 恒为 0 条，故不列出',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.workExp },
    },
    {
      key: 'education',
      label: '学历',
      values: WAIQI_EDUCATION_OPTIONS,
      hint: '取值域来自平台的 education-enum，**不是从 0 递增**（6/7/8 分别对应初中/高中/中专）',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.education },
    },
    {
      key: 'businessCategory',
      label: '行业',
      values: config.businessCategoryList.map((item) => ({ value: String(item.id), label: item.name })),
      hint:
        '对应接口 businessCategoryIdList（**2026-09-21 探针全量实测**：30 项，去掉"不限"）。' +
        '⚠️ 旧 seed 抄的是**职能**的 id 空间（8=产品/33=IT技术），与行业字典不是一套码 —— ' +
        '已经换成实测表；要加行业在 DB 覆盖 config.businessCategoryList',
      // ⚠️ 这一行就是那次静默失败的修复点：`param` 必须指向构造端真正写的字段名。
      // 声明与构造共用 `WAIQI_BODY_FIELDS`，中间不存在第二份字面量。
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.businessCategory },
    },
    {
      key: 'companyType',
      label: '公司类型',
      values: config.companyTypeList.map((item) => ({ value: String(item.id), label: item.name })),
      // 平台这个参数是**数组**（可多选）：界面上按多选渲染，值在 criteria 里以逗号分隔存，
      // 由 `buildWaiqiRequestBody` 拆成 number[] 写进请求体。
      multi: true,
      hint:
        '对应接口 companyTypeList（数组，可多选）：美企 / 德企 / 中德合资 … ' +
        '**2026-09-21 探针实测 45 项**（company-tag/fixed-group-list）。不选 = 不按公司类型筛。',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.companyType },
    },
    {
      key: 'posInfo',
      label: '职能',
      values: config.posInfoList.map((item) => ({ value: String(item.id), label: item.name })),
      hint:
        '对应接口 posIds（前端为两级树 businessCategory→posInfos）。' +
        '内置为实测 seed，可在 DB 覆盖 config.posInfoList 补全',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.posInfo },
    },
    {
      key: 'type',
      label: '职位范围',
      values: WAIQI_TYPE_OPTIONS,
      hint: '页面顶部的两个 tab；默认只看外企（type=2）',
      wire: { target: 'body', param: WAIQI_BODY_FIELDS.type },
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: WAIQI_MAX_PAGES,
      hint:
        `最多 ${String(WAIQI_MAX_PAGES)} 页 —— 平台的服务端翻页是坏的（page≥2 恒定返回 0 条），` +
        `单页上限 ${String(WAIQI_MAX_PAGE_SIZE)} 条`,
    },
  ]

  return {
    id: 'waiqi',
    ...platformFacts('waiqi'),
    displayName: '神仙外企',
    capabilities: {
      // 实测：列表接口匿名可读（第一页 20 条），但页面上有「登录账号，查看更多好职位」遮罩。
      searchWithoutLogin: true,
      // 平台的投递要登录，且未登录 DOM 里没有可靠的投递入口 —— 与打招呼一起留空（fail-closed）。
      supportsAttachment: false,
      supportsReadReceipt: false,
      // 2026-09-21 修正为 false：此前标 true 但既无实现、也无平台证据 ——
      // 该平台投递大量跳企业 ATS（outsideUrl / informationSource），未观察到平台内消息中心
      // （路由里没有会话页）。全仓口径是「实现了 readInbox 才承认平台有收件箱」（见 liepin），
      // 反过来「标了 true 却没有实现」会让能力矩阵对用户说谎。
      supportsInbox: false,
      supportsGreeting: false,
      // 结构化接口：字段齐、几乎不用猜；但薪资大量缺失（实测约 1/5 才有明文），所以不是 high。
      fieldCompleteness: 'medium',
      // 匿名可读、未观察到验证码；但页面确实有登录遮罩与订阅拦截，保守按 medium。
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段（协议里的四个核心字段）。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: WAIQI_MAX_PAGES,
    // 服务端翻页是坏的（page≥2 恒 0 条）—— 永远只有 1 页。
    defaultMaxPages: 1,

    auth: {
      loginUrl: `${config.webBase}/login`,
      // 检测判**搜索页**：判据是页头有没有用户头像，而登录页没有页头用户区
      // —— 在那儿判会恒判未登录。见 `auth.checkUrl` 的说明。
      checkUrl: buildWaiqiSearchUrl(config, {}),
      /**
       * 搜索不需要登录，所以这里**只看用户头像**这一个正向信号；
       * 「没登录」不该让采集停摆（`runtime` 那侧也只在"确实被登录墙挡过"时才拦）。
       *
       * 2026-09-21 补 SPA 挂载等待（zhipin 同款坑）：站点是 Vue3 纯前端渲染，
       * `goto` 一返回页头多半还没挂上 —— 立刻判会**恒判未登录**（头像锚点必然缺席），
       * 定时任务就永远不跑。先等**卡片**出现（列表页最稳定的"应用活过来了"信号，
       * 匿名可读、选择器已夹具校准），等到或超时都再按原样 evaluate。
       * 没有等"未登录锚点"：未登录态的页头结构没有实测样本，编一个就是猜。
       */
      async isLoggedIn(page): Promise<boolean> {
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        return await page.evaluate(isLoggedInInPage, undefined as never)
      },
    },

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildWaiqiSearchUrl(config, criteria)
      },
      /**
       * 预览：神仙外企的筛选**不在 URL 里**（URL 只承载页面自己的 keyword / posType），
       * 真正的条件全在 POST body。所以预览必须给出那个请求 —— 否则界面上会显示
       * "这个方案什么都没筛"。与采集走**同一个** `buildWaiqiRequestBody`。
       */
      preview(criteria: SearchCriteria) {
        const url = buildWaiqiSearchUrl(config, criteria)
        const body = buildWaiqiRequestBody(criteria, config.cityCodes, 1)
        const params: Record<string, string> = {}
        for (const [key, value] of Object.entries(body)) params[key] = String(value)
        return {
          url: url ?? `${config.webBase}/position`,
          method: 'POST' as const,
          params,
          body: JSON.stringify(body),
          crawlOnly: [],
        }
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildWaiqiSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(
            `神仙外企：无法为城市「${criteria.city ?? ''}」构造搜索地址（城市 id 未配置，` +
              '城市 id 不能按行政区划码猜）',
          )
        }
        // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
        // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
        pending.set(page as object, criteria)
        await page.goto(url)

        // 站点是 SPA：`load` 时列表还没渲染。等卡片只是为了"别在页面还没活过来时发请求"，
        // **解析不依赖它**（数据来自接口），所以超时也不当错误。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // 列表数据来自接口，DOM 只是"页面活过来了"的旁证；但**一次输入事件都不产生**
        // 的访问本身是可识别的形态，所以仍然要留下真实的滚动与指针轨迹。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        const criteria = pending.get(page as object) ?? {}
        const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1
        const request = await page.evaluate(fetchListInPage, {
          url: `${config.apiBase}${config.listPath}`,
          body: buildWaiqiRequestBody(criteria, config.cityCodes, pageNo),
        })
        lastCode.set(page as object, request.code)

        if (!request.ok) {
          // 风控/登录墙**在返回码里**（这是本平台的实测事实：`429` = 频控墙、
          // `1022` = 需要登录）→ 抛风控错误，由主链停手 + 平台级暂停。
          //
          // 为什么不能只靠 `detectBlock`：主链顺序是 `gotoSearch → detectBlock → readListPage`，
          // 而返回码只有**发完请求**才存在 —— 判墙那一刻它还是 `null`。
          // 抛出去是唯一能在**当轮**生效的通道（否则要等下一轮判墙才被认出来）。
          const block: BlockKind | null =
            request.code === 1022
              ? 'login-required'
              : request.code === 429
                ? 'rate-limited'
                : null
          if (block !== null) {
            throw new PlatformBlockedError(
              block,
              `列表接口 code=${String(request.code)}：${request.message === '' ? '（无说明）' : request.message}`,
            )
          }
          // 认不出来仍是普通失败。抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
          // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
          throw new Error(
            `神仙外企：列表接口未返回可用数据（code=${request.code === null ? '?' : String(request.code)}，` +
              `status=${String(request.status)}，message=${request.message === '' ? '（空）' : request.message}）`,
          )
        }

        const jobs = await page.evaluate(extractJobsInPage, config)
        if (jobs.length === 0) {
          // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
          // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        // 平台的翻页参数在服务端是坏的（page≥2 恒返回空），所以这一层只回答
        // "页面上还有没有下一页按钮"。**真正的闸门是 `maxPages = 1`**（见 WAIQI_MAX_PAGES）。
        return await page.evaluate(hasNextPageInPage, { selector: config.selectors.nextPage })
      },
    },

    /**
     * 详情补抓（2026-09-21 落地）—— JD 明文来自**同源 details 接口**，不解析页面 DOM。
     *
     * 主链调用契约：先 `goto(sourceUrl)`（即 `/position/detail?id=…&posType=…`），
     * 本实现从**当前页 URL** 取 `id` 拼 API 地址 —— 与列表侧 upsert 的 platformJobId 同键。
     * robots 口径的更新见文件头；`config.detailApiEnabled=false`（DB 覆盖）可整体下线，
     * 此时适配器**不声明** `detail`（`adapterImplementationOf` 如实反映）。
     */
    ...(config.detailApiEnabled
      ? {
          detail: {
            async extract(page: PageLike): Promise<RawJobDetail> {
              const idMatch = /[?&]id=(\d+)/.exec(page.url())
              const id = idMatch === null ? '' : (idMatch[1] ?? '')
              if (id === '') {
                throw new Error(
                  `神仙外企：当前页地址里没有岗位 id（${page.url()}）—— 无法构造详情接口请求`,
                )
              }
              const request = await page.evaluate(fetchDetailInPage, {
                url: `${config.apiBase}${config.detailPath}?id=${id}`,
              })
              // 接口侧风控与列表同一套语义：1022=登录墙、429=频控墙 → 抛 PlatformBlockedError，
              // 主链据此停手 + 平台级暂停（而不是记成这一条解析失败）。
              const block: BlockKind | null =
                request.code === 1022 ? 'login-required' : request.code === 429 ? 'rate-limited' : null
              if (block !== null) {
                throw new PlatformBlockedError(
                  block,
                  `详情接口 code=${String(request.code)}：${
                    request.message === '' ? '（无说明）' : request.message
                  }`,
                )
              }
              if (!request.ok) {
                throw new Error(
                  `神仙外企：详情接口未返回可用数据（code=${
                    request.code === null ? '?' : String(request.code)
                  }，status=${String(request.status)}，message=${
                    request.message === '' ? '（空）' : request.message
                  }）`,
                )
              }
              return await page.evaluate(extractDetailInPage, config)
            },
          },
        }
      : {}),

    guard: {
      /**
       * 判墙**不发请求**（见 `lastCode` 的注释）：它读的是
       * 「最近一次列表接口的应答 + 当前页面的结构性信号」。
       *
       * ⚠️ 主链的顺序是 `gotoSearch → detectBlock → readListPage`，
       * 所以**首次**判墙时还没有接口应答（`code = null`），此时只能靠页面信号
       * （验证码 / 限流文案 / 空白页）。这不是缺陷：真正的登录墙
       * 会在 `readListPage` 处以 `code=1022` 暴露出来，并在下一次判墙时被识别。
       */
      async detectBlock(page): Promise<BlockKind | null> {
        const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card })
        return await page.evaluate(detectBlockInPage, {
          cardCount,
          code: lastCode.get(page as object) ?? null,
          signals: signalsOf(WAIQI_BLOCK_SIGNALS),
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.*`（sayHello / sendResume / reply / readInbox / detectStage）：
    // 神仙外企的投递要登录态，且未登录 DOM 里没有可靠的投递按钮契约；
    // 大量岗位的投递其实是**跳转到企业官网 ATS**（记录里的 `outsideUrl`，
    // `informationSource` 指名 workday / successfactors 等渠道）。
    // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed），
    // 也不上线一个会乱点的实现。`supportsInbox` 也因此如实为 false（见 capabilities 注释）。
  }
}
