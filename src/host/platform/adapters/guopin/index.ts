/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上 + probe 夹具实证，非二手资料）
 *
 * * **列表页**：真实路由 `/jobList?keyword=<明文>` **302 到 `/job?keyword=Java`**
 *   （probe 实证，2026-09-18）。未登录可看、服务端 SSR。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（WebFetch 实证命中
 *   「财税管理岗（校招）」详情页）。页面含标题 / 更新于 / 薪资 / 公司 / 职位性质 /
 *   招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / **报名截止** / 职位介绍（度量 JD）。
 * * **列表卡片真实 DOM**（probe 实证，`test/fixtures/guopin-search.html`）：
 *
 *   ```html
 *   <div class="job-card">
 *     <div class="job-title" title="java后端 「北京-东城区」">   ← 标题+城市（全角书名号）
 *       <div class="job-name">java后端</div>
 *     </div>
 *     <div class="job-info">     ← 薪资 + 「性质/经验/学历」tag（顺序不固定，经验偶缺）
 *       <span class="job-salary">面议</span>   ← 18/20 卡片有（面议/10~13K/8~9K·16薪…）
 *       <span class="tag-item">校招</span><span>应届生</span><span>本科</span>
 *     </div>
 *     <div class="job-tag"><span class="ant-tag">Java工程师</span>…</div>
 *     <a class="company-name" href="/company?id=…" title="…">…</a>  ← 公司（文本可能省略号截断）
 *     <div class="company-info">  ← 顺序固定 ×3：性质/规模/行业
 *       <span class="company-info-item">国企</span><span>1000-2000人</span><span>软件和信息技术服务业</span>
 *     </div>
 *   </div>
 *   ```
 *
 * ## ⚠️ 两个 phase-1 就被 probe 推翻 / 修正的事实（决定本适配器形态）
 *
 * 1. **列表卡片薪资：多数有、少数无**（2026-09-20 夹具全量复核，推翻 09-18 旧结论
 *    "列表卡片无薪资"—— 那是对恰好无薪资首卡的过采样）：20 张卡片里 **18 张带
 *    `.job-info .job-salary`**（面议 / 10~13K / 8~9K·16薪 / 1.5K…），2 张没有。
 *    因此 `readListPage` 读 `.job-salary`（文本过 `salaryPattern` 校验才收，宁空勿脏）；
 *    `requiredFields` 仍**不含 `salary_raw`**（少数卡片确实没有，列进去会把那几条隔离），
 *    读不到的由详情抓取（detail.extract）补。
 * 2. **列表页无平台 id**：无 `/job/detail?id=` 链接、无 `__NEXT_DATA__`/`jobId`/`positionId`
 *    持久化载荷。id 只在详情页。⇒ **upsert 幂等键用内容哈希**（用户拍板）：
 *    `platformJobId = "ch:" + FNV1a(title|company|city|district)`，deterministic，
 *    同岗位重复抓不重复；`sourceUrl` 存列表页 URL（不编详情 URL）。
 *
 * ## 分页 / 城市码 / 登录 / 详情：2026-09-20 登录态探针全面定案
 *
 * 当天用 `npm run probe:guopin-login`（人工登录）+ `npm run probe:guopin-pagination`
 * （自动实测）补齐了四块证据，产物在 `.probe-guopin-capture/`：
 *
 * * **分页（推翻"参数未确证"）**：列表页有 `ul.ant-pagination`，**自报 20 页**；
 *   URL `?page=2` 被 SPA **忽略**（active 仍为 1），真鼠标点页码**有效**（active=2、
 *   数据换 9/20）⇒ `maxPages=20`、翻页靠 `gotoSearch` 里连点「下一页」
 *   （`turnToPageInPage`），`hasNextPage` 读 next 的 disabled 状态（不再是恒 false）。
 *   ⚠️ 默认仍 1 页（`defaultMaxPages`）：每页要「重新导航 + 连点」，比 URL 翻页贵。
 * * **登录态**：登录信号 cookie 是 `__token__`；页头锚点两端实测 —— 已登录
 *   `.avatar-box .user-name`（脱敏手机号）/ 未登录 `a.login`「登录/注册」⇒ `auth`
 *   已声明（`isLoggedIn` + `loginUrl`），登录页路由 `/login?redirect=…`。
 * * **详情页真实结构**（此前是语义锚点）：标题 `.title-section .title`（页面无 h1）、
 *   JD `.job-duty`、公司 `.company-title`、键值对 `.overview-item`（按 title 文本归类出
 *   报名截止/学历/经验/性质）、公司标签 `.company-tag` ×4（顺序不固定，按词表归类）、
 *   更新时间 `.update-time` → `publishedAt`。快照样本（引才计划岗）无薪资节点 ——
 *   薪资不是每个详情页都有，选择器留语义候选 + `salaryPattern` 校验。
 * * **城市码仍未实测**（筛选栏有城市名但 URL 参数未实证）→ `cityCodes` 仍置空，
 *   未列出城市 `buildSearchUrl` 返回 null（入口层拒绝）。顺带记录：`?channel=campus`
 *   会换结果集、`channel=social` 与默认相同（2026-09-20 实测）—— 证据不足以做成维度，只记档。
 *
 * ## 判定墙
 *
 * 国聘是政府背景平台，未观测到 CDP 检测（对应 §7.1「51job/智联/神仙外企」那一档）。
 * `detectBlock` 走通用文案判定：验证控件 → 频控 → 登录墙 → 空页。列表页未登录可看
 * （投递才要登录），所以 `searchWithoutLogin: true`；antiBot 如实定 `low`。
 *
 * ── 本目录分工（2026-09-20 拆成目录，与 zhipin/liepin 同构）────────────
 * * `./config.ts`：结构锚点集、字段 → URL 参数映射、默认值与合并、城市码表、
 *   各字段正则常量、页数上限、平台判墙信号 —— 纯数据 + 纯函数；
 * * `./urls.ts`：宿主机侧的列表页 / 详情页 URL 构造（不碰 `document`）；
 * * `./page/list.ts` / `./page/detail.ts`：送进 `page.evaluate` 的**自包含**页面
 *   上下文解析函数（国聘没有会话/收件箱能力，所以没有 chat.ts / inbox.ts）；
 * * `./index.ts`：本文件 —— 适配器装配（`createGuopinAdapter`）与 `criteriaDimensions` 表。
 * 上面这些实测结论（薪资 18/20 / 无平台 id / 翻页点击契约 / 登录锚点 / 详情结构）各归其位。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../../pacing.js'
import { humanBrowse } from '../../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { platformFacts } from '../../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../../types.js'
import { DEFAULT_GUOPIN_CONFIG, GUOPIN_BLOCK_SIGNALS, GUOPIN_LOGIN_URL, GUOPIN_MAX_PAGES } from './config.js'
import type { GuopinConfig } from './config.js'
import { extractDetailInPage } from './page/detail.js'
import { extractJobsInPage, hasNextPageInPage, isLoggedInByMarkersInPage, turnToPageInPage } from './page/list.js'
import { buildGuopinSearchUrl } from './urls.js'

export interface GuopinAdapterOptions {
  config?: GuopinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造国聘网适配器。 */
export function createGuopinAdapter(options: GuopinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_GUOPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

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
      // 空表 ≠ 自由文本：`buildGuopinSearchUrl` 带城市但表里没有就返回 null（**不猜**）。
      closed: true,
      hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: GUOPIN_MAX_PAGES,
      hint:
        'ant 分页自报 20 页（每页 20 条）。⚠️ URL `?page=` 无效（SPA 忽略，2026-09-20 实测）—— ' +
        '第 N 页靠页面内连点「下一页」到达，每页都会重新导航再点击，页数越大请求越密，建议 2–5 页',
    },
  ]

  return {
    id: 'guopin',
    ...platformFacts('guopin'),
    displayName: '国聘网',
    capabilities: {
      // 列表页未登录可看（投递才要登录）。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 列表薪资 18/20 卡片有（少数没有、JD 只在详情页）→ medium 如实声明，不夸大。
      fieldCompleteness: 'medium',
      antiBot: 'low',
    },
    // 少数卡片无 .job-salary、无平台 id（幂等键用内容哈希）→ 核心必需字段只声明 title/company/source_url。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: GUOPIN_MAX_PAGES,
    // 默认 1 页是保守取舍（不是平台事实）：翻页要「重新导航 + 连点 next」，请求比 URL 翻页贵，
    // 想抓深就在方案里显式配 maxPages（上限 20，ant 分页自报）。
    defaultMaxPages: 1,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildGuopinSearchUrl(config, criteria)
      },
    },

    /**
     * 登录态检测（2026-09-20 补，锚点两端实测：未登录夹具 vs 登录态快照）。
     *
     * 为什么需要它：列表未登录可看，但**详情页投递/申请**要登录态；`adapter.auth` 缺席时
     * `platforms.loginStatus('guopin')` 会抛「没有声明登录入口」，用户既看不到登录态、
     * 也没法走登录引导（zhipin 2026-09-19 踩过同款坑，见其 index.ts 的 auth 注释）。
     */
    auth: {
      // 登录 URL 有据：未登录列表页头 `a.login`「登录/注册」的 href 就是 `/login?redirect=…`。
      loginUrl: GUOPIN_LOGIN_URL,
      async isLoggedIn(page): Promise<boolean> {
        const verdict = await page.evaluate(isLoggedInByMarkersInPage, {
          loggedIn: config.loginSelectors.loggedIn,
          notLoggedIn: config.loginSelectors.notLoggedIn,
        })
        // 判不出来时按"未登录"处理（保守，见 isLoggedInByMarkersInPage 的说明）。
        return verdict ?? false
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildGuopinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`国聘网：城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        await page.goto(url)
        // 页面服务端可渲染，但仍等一次卡片容器存在：0 条最易被误读成「今天没有新岗位」。
        // 超时**不在这里抛**（与 zhipin 同口径）：真路径上 `waitForSelector` 超时会抛错，
        // 而这里抛出去会把"被登录墙/验证码顶掉"直接讲成一次导航失败 —— 那道墙该由
        // `guard.detectBlock` 分类、由 `readListPage` 的 0 条兜底，不该在半路截胡。
        if (page.waitForSelector !== undefined) {
          try {
            await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
          } catch {
            /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
          }
        }
        // 第 N 页（N>1）：URL `?page=` 被 SPA 忽略（2026-09-20 实测）—— 只能页面内
        // 连点「下一页」到位。翻不到目标页就**抛错**：继续读会把第 1 页当第 N 页
        // 重复采集，那比失败更糟（内容哈希幂等键会悄悄吞掉，连重复都看不出来）。
        const targetPage = criteria.page ?? 1
        if (targetPage > 1) {
          const turned = await page.evaluate(turnToPageInPage, {
            next: config.selectors.paginationNext,
            nextDisabled: config.selectors.paginationNextDisabled,
            active: config.selectors.paginationActive,
            targetPage,
            stepTimeoutMs: config.pageTurnTimeoutMs,
          })
          if (turned !== true) {
            throw new Error(`国聘网：翻到第 ${String(targetPage)} 页失败（分页点击无响应或已到末页）`)
          }
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      async hasNextPage(page): Promise<boolean> {
        // 真实分页状态（2026-09-20 实测 ant 分页）：next 存在且不带 disabled → 还有下一页。
        // 分页区整个不在（0 条结果 / 离线夹具）→ false。
        return await page.evaluate(hasNextPageInPage, {
          next: config.selectors.paginationNext,
          nextDisabled: config.selectors.paginationNextDisabled,
        })
      },
    },

    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
          deadlinePattern: config.deadlinePattern,
          salaryPattern: config.salaryPattern,
          eduPattern: config.eduPattern,
          expPattern: config.expPattern,
          naturePattern: config.naturePattern,
          companyNaturePattern: config.companyNaturePattern,
          companySizePattern: config.companySizePattern,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(GUOPIN_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
      },
    },

    // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
    //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
  }
}
