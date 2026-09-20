/**
 * SinoJobs 中欧招聘（sinojobs.com.cn）适配器 —— 列表页采集 + 详情页解析。
 *
 * ## 平台实测（2026-09-18，真实页面与接口交叉验证）
 *
 * SinoJobs 有中英德三个版本；**中文站 `sinojobs.com.cn`** 是面向"中欧双向求职者"
 * 的求职入口（`www.sinojobs.com` 是面向欧洲企业的主站/门户）。岗位多为德企 /
 * 欧洲企业在华与海外职位，城市常见 `国外` / `上海` / `常州` 等。
 *
 * 与神仙外企同款的关键事实：**列表不在 DOM 里**。页面打开后，站内脚本
 * （`$(function(){ ... onloadPage(1, 15) })`）会用 jQuery 同步 AJAX 把
 * `POST /Recruitment/indexAjaxPage.html` 返回的 JSON 渲染进 `#recruitmentList`，
 * 而且渲染模板**不展示薪资**。所以：
 *
 *   * 抓 DOM 拿不到核心字段 —— 必须**在页面上下文里调接口**（`page.evaluate` 里 `fetch`）；
 *   * 在页面里发请求顺带拿到**同源 Cookie / 登录态**（`credentials: 'include'`），
 *     与用户自己在浏览器里翻列表走同一条链路。
 *
 * ## 接口契约（全部实测）
 *
 * `POST /Recruitment/indexAjaxPage.html`，表单编码（`application/x-www-form-urlencoded`）：
 *
 * | 参数 | 含义 | 取值 |
 * |---|---|---|
 * | `page` | 页码，**1 起** | 实测第 2 页与第 1 页零重叠 |
 * | `limit` | 页容量 | 站点自己用 15；实测 20/50/100 均正常（100 时一次返回全量 78） |
 * | `keywords` | 关键词 | 实测 `工程师` → 78→17 条 |
 * | `job_type` | 行业类别 | 43 项，id 见 `SINOJOBS_JOB_TYPE_SEED`；实测 `574`(IT/互联网) 生效 |
 * | `work_nature` | 工作性质 | 1=全职 / 2=兼职 / 3=实习；实测 `3` → 4 条 |
 * | `address_id` | 地点 | `10000`=国内 / `10001`=国外 / 省级 id（北京=1、上海=3…）；实测 `3` → 15 条上海岗 |
 * | `salary_range` | 薪资档 | 0=面议 / 3=3K以下 / 5=3K-5K / 10=5K-10K / 15=10K-15K / 25=15K-25K / 26=25K+ |
 * | `experience` | 经验档 | 0=不限 / 1=应届毕业生 / 2=1年～3年 / 3=3年～5年 / 4=5年以上 |
 *
 * 响应 `{"status":1, "info":"数据获取成功", "data":{"total":"78","rows":[...]}}`，
 * 每行字段：`id` / `job_title` / `company` / `work_city` / `release_time`（**Unix 秒**）/
 * `end_time` / `top_time`（置顶时间戳，null 或值）/ `experience` / `education` /
 * `salary_range`（`面议` 或 `25K+` 等）/ `company_id` / `logo`。**薪资在接口里就有**，
 * 只是站点自己的渲染模板不展示 —— 这正是本适配器要走接口而不是抓 DOM 的理由。
 *
 * ## robots 取舍
 *
 * `robots.txt` 只禁 `User-agent: *` 下的 `/UserCenter/*`、`/CompanyUcenter/*`、
 * `/Ucenter/*`、`/Oauth/*`。本适配器访问的 `/Recruitment/*`（列表页与列表接口
 * `indexAjaxPage.html`）与详情页 `/Recruitment/content.html` 都在允许范围内。
 * 投递要登录（`/UserCenter/resumeShow.html`），采集链路**不碰**投递与任何 Ucenter 路径。
 *
 * ## 本目录分工（每平台一个目录）
 *
 *   * `config.ts` —— 配置面：选择器接口 / 字段名 / 值域 / 地点码表 / 行业 seed /
 *     判墙信号常量 + `mergeSinoJobsConfig`（纯数据 + 纯函数）；
 *   * `urls.ts`   —— 宿主机侧的 URL 与请求体构造（不碰 `document`）；
 *   * `page.ts`   —— 页面上下文函数（`page.evaluate` 序列化后进浏览器），
 *     含 `fetchListInPage` 写 `globalThis.__SINOJOBS_LIST_PAYLOAD__`
 *     与 `extractJobsInPage` / `readTotalInPage` 读它的**同文件协议**；
 *   * `index.ts`  —— 工厂 `createSinoJobsAdapter` 与本文件头（实测记录的正身）。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { blockFromApiFailure, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import { PlatformBlockedError } from '../../types.js'
import {
  DEFAULT_SINOJOBS_CONFIG,
  SINOJOBS_BLOCK_SIGNALS,
  SINOJOBS_EXPERIENCE_OPTIONS,
  SINOJOBS_MAX_PAGES,
  SINOJOBS_SALARY_OPTIONS,
  SINOJOBS_WORK_NATURE_OPTIONS,
} from './config.js'
import type { SinoJobsConfig } from './config.js'
import { buildSinoJobsRequestBody, buildSinoJobsSearchUrl } from './urls.js'
import {
  countCardsInPage,
  detectBlockInPage,
  extractDetailInPage,
  extractJobsInPage,
  fetchListInPage,
  isLoggedInInPage,
  readTotalInPage,
} from './page.js'

export interface SinoJobsAdapterOptions {
  config?: SinoJobsConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等页面渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 SinoJobs 适配器。 */
export function createSinoJobsAdapter(options: SinoJobsAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_SINOJOBS_CONFIG
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
   * 最近一次列表响应的 `{total, page}`，按页面记 —— `hasNextPage` 的**真判据**。
   *
   * 为什么不用下一页按钮：接口的 `page` 参数是真实分页（实测第 2 页与第 1 页零重叠），
   * 而"按钮在不在"只反映 UI 状态。抓取主链的顺序是 `readListPage → hasNextPage`，
   * 所以读上一轮响应的 total 最精确：`page * pageSize < total` 才翻页。
   */
  const lastMeta = new WeakMap<object, { total: number; page: number }>()

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，对应接口的 keywords 字段（实测生效：工程师 → 78→17 条）',
    },
    {
      key: 'city',
      label: '地点',
      values: Object.keys(config.addressCodes).map((name) => ({ value: name, label: name })),
      hint:
        '对应接口 address_id。取值来自平台级联接口（10000=国内/10001=国外/省级 id，实测 address_id=3 → 只回上海岗）；' +
        '城市级 id 未内置，需要时在 DB 覆盖 config.addressCodes 补',
    },
    {
      key: 'salaryRange',
      label: '薪资',
      values: SINOJOBS_SALARY_OPTIONS,
      hint: '对应接口 salary_range，值域来自页面筛选项（#work-salary strong[rel]）',
    },
    {
      key: 'experience',
      label: '经验',
      values: SINOJOBS_EXPERIENCE_OPTIONS,
      hint: '对应接口 experience，值域来自页面筛选项（#work-year strong[rel]）',
    },
    {
      key: 'workNature',
      label: '工作性质',
      values: SINOJOBS_WORK_NATURE_OPTIONS,
      hint: '对应接口 work_nature（全职/兼职/实习）',
    },
    {
      key: 'jobType',
      label: '行业类别',
      values: config.jobTypeList.map((item) => ({ value: item.id, label: item.name })),
      hint:
        '对应接口 job_type，内置为页面 #job_type 全部 43 项的实测 seed；' +
        '站点增删行业时在 DB 覆盖 config.jobTypeList 即可',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: SINOJOBS_MAX_PAGES,
      hint:
        `最多 ${String(SINOJOBS_MAX_PAGES)} 页（每页 ${String(config.pageSize)} 条）—— ` +
        '全量池实测约 78 条，4 页即可抓完；给 6 页留足余量',
    },
  ]

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
    requiredFields: CORE_FIELDS as readonly CoreField[],
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
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, undefined as never)
      },
    },

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildSinoJobsSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildSinoJobsSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(
            `SinoJobs：无法为地点「${criteria.city ?? ''}」构造搜索地址（地点 id 未配置，` +
              '地点 id 只能从平台级联接口实测拿到）',
          )
        }
        // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
        // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
        pending.set(page as object, criteria)
        await page.goto(url)

        // 站点是静态页 + AJAX 渲染：`load` 时列表还没渲染。等卡片只是为了
        // "别在页面还没活过来时发请求"，**解析不依赖它**（数据来自接口），
        // 所以超时也不当错误。
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
          url: `${config.webBase}${config.apiPath}`,
          body: buildSinoJobsRequestBody(config, criteria, pageNo),
        })

        if (!request.ok) {
          // 先看这**是不是风控/登录墙**：站点脚本走 jQuery `$.ajax`，失败时 `info` 里是
          // 人话（「请先登录」/「操作过于频繁」这一类）。能认出来就抛**风控错误** ——
          // 主链会因此停手并把平台置为风控暂停（SR-22），而不是把"你被挡了"
          // 降级成一次普通的 `PARSE_FAILED`（那会一路退避重试，越撞越紧）。
          const block = blockFromApiFailure({ code: request.statusCode, message: request.message })
          if (block !== null) {
            throw new PlatformBlockedError(
              block,
              `列表接口 status=${request.statusCode === null ? '?' : String(request.statusCode)}：${request.message}`,
            )
          }
          // 认不出来仍是普通失败。抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
          // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
          throw new Error(
            `SinoJobs：列表接口未返回可用数据（status=${request.statusCode === null ? '?' : String(request.statusCode)}，` +
              `message=${request.message === '' ? '（空）' : request.message}）`,
          )
        }

        const jobs = await page.evaluate(extractJobsInPage, config)
        // 记住 total + 当前页：hasNextPage 用 `page * pageSize < total` 决定是否翻页。
        // total 来自响应文本（`"78"`），页面上下文里已把载荷挂到全局。
        const total = await page.evaluate(readTotalInPage, undefined as never)
        lastMeta.set(page as object, { total, page: pageNo })

        if (jobs.length === 0) {
          // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
          // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        const meta = lastMeta.get(page as object)
        if (meta === undefined) return false
        // 真实分页判据：当前页已拉到的条数还不到总量就还有下一页。
        return meta.page * config.pageSize < meta.total
      },
    },

    // P2 详情页：服务端渲染的静态 HTML，选择器有实测证据（2026-09-18 逐项验证）。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, config)
      },
    },

    guard: {
      /**
       * 判墙**不发请求**：接口错误在 `readListPage` 处以抛错暴露（PARSE_FAILED），
       * 这里只读当前页面的结构性信号（验证码 / 限流文案 / 错误弹窗 / 空白页）。
       */
      async detectBlock(page): Promise<BlockKind | null> {
        const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card })
        return await page.evaluate(detectBlockInPage, {
          cardCount,
          signals: signalsOf(SINOJOBS_BLOCK_SIGNALS),
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 投递要登录态，且未登录 DOM 里没有可靠的投递按钮契约（入口是 /UserCenter/resumeShow.html）。
    // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed）。
  }
}
