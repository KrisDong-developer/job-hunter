/**
 * BOSS 直聘（zhipin.com）适配器 —— 2026-09-18 由 probe:zhipin 真实夹具校准。
 *
 * ## 环境一致性（D-17a）
 *
 * 与猎聘同一套三件套：patchright 启动式 + 系统 Chrome + stealth 注入。
 * BOSS 的 CDP 检测强度低于猎聘（§7.1：BossHunter 用 CDP attach 日常 Chrome
 * 都能跑完整流程），本探针实测 patchright 启动式未登录即可见列表。
 *
 * ## 未登录形态（2026-09-18 夹具实测，很重要）
 *
 * * **列表可见但薪资隐藏**：`.job-salary` 元素存在但为空 —— 所以本适配器的
 *   `requiredFields` **不含 salary_raw**（否则每条记录都被字段断言隔离），
 *   `fieldCompleteness: 'medium'` 如实声明；登录后薪资可见，届时再升级；
 * * `.boss-name` 装的是**公司名**（未登录视图；BossHunter 选择器
 *   `.boss-name || .company-name` 正是为此）；
 * * 无分页区（`hasNextPage` 恒 false，单页 15 条）；登录后有标准分页，待登录夹具补；
 * * 岗位链接 `/job_detail/<加密id>.html`，**未登录不带 securityId** ——
 *   BossHunter 站点规则"详情 URL 必须带完整 securityId"是**已登录**场景；
 *   本适配器只存原始 href（绝不重构 URL），详情抓取（detail.extract）需登录态
 *   才真正可用。
 * * 访问会被 `_security_check` 参数重定向一次（正常现象，不是风控墙）。
 *
 * ## 详情页选择器（BossHunter site-patterns，2026-05-26 验证）
 *
 * `.info-primary .name h1`（标题）/ `.info-primary .salary`（薪资）/
 * `.info-primary .tag-list span`（经验/学历）/ `.job-sec-text`（JD 全文）/
 * `.sider-company`（公司侧栏）/ `.job-boss-info`（HR）—— 实现见 `extractDetailInPage`。
 *
 * ## 登录形态与翻页契约（2026-09-18 `npm run probe:zhipin-login` 实测，证据见
 *    `test/fixtures/zhipin-pagination-report.json` 与 `zhipin-search-api.json`）
 *
 * 登录之后有三件事和未登录视图**不一样**，逐条实测过：
 *
 *   * **薪资可见**：15/15 张卡片 `.job-salary` 有文本（未登录时元素在、文本空）；
 *     `requiredFields` 仍**不含** `salary_raw` —— 见下面的说明；
 *   * **仍然没有页码分页区**，且 `&page=2` **无效**：实测带 `page=2` 的 URL 返回的
 *     前 3 个岗位 id 与第 1 页**完全相同**（SPA 忽略该参数）。所以 `hasNextPage` 恒 false
 *     不是"还没实现"，而是**平台事实**；
 *   * **翻页只有滚动加载**：滚动到底部自动追加，每轮 +15 条（实测 15→30→45→60→75→90→105）。
 *     列表接口 `wapi/zpgeek/search/joblist.json` 自报 `totalCount = 300` ——
 *     即平台对这个搜索条件**封顶 300 条 = 20 轮**，这就是 `scrollRounds` 上限的来源。
 *
 * 因此"抓得更深"用 `scrollRounds` 维度表达（在**一次页面加载之内**把列表读厚），
 * 而不是 `maxPages`（URL 翻页在这个站点不存在，见上）。
 *
 * 搜索页 URL 实测会被重定向：`/web/geek/job` → `/web/geek/jobs`（两条都通，我们照旧用前者）。
 *
 * ⚠️ `requiredFields` 为什么仍然不含 `salary_raw`：适配器在**登录态与未登录态之间是同一个
 *   实例**，而登录态会静默过期。把薪资列进必需字段，会在某次会话失效后把**整页**记录
 *   打成待修复（`pending_repair`），等于用一次登录过期换掉一整轮数据。宁可让
 *   `adapters/../health.ts` 的逐字段缺失计数去报警（连续 3 次缺失即降级 + 待办），
 *   那是"可见的降级"，比"静默隔离"好。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { platformFacts } from '../platform-facts.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformCriterion } from '../types.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

/** 列表页选择器集（BossHunter 生产选择器 + 本项目夹具双重验证）。 */
export interface ZhipinSelectors {
  card: string
  cardBox: string
  /** 职位名链接（标题 + href 三合一）。 */
  jobName: string
  /** 薪资（未登录为空元素）。 */
  salary: string
  /** 「经验 / 学历」标签列表。 */
  tagList: string
  /** 公司名（未登录视图装在 boss-name 里；BossHunter 兜底 company-name）。 */
  company: string
  /** 「城市·区域·地标」文本。 */
  location: string
}

/** 详情页选择器集（BossHunter site-patterns 2026-05-26 验证）。 */
export interface ZhipinDetailSelectors {
  title: string
  salary: string
  /** 经验/学历 span（顺序固定：先经验后学历）。 */
  tags: string
  jdText: string
  companySider: string
}

export interface ZhipinConfig {
  selectors: ZhipinSelectors
  detailSelectors: ZhipinDetailSelectors
  urlParams: { base: string; keywordParam: string; cityParam: string }
  cityCodes: Record<string, string>
  jobIdPattern: string
  /**
   * 滚动加载时，**每一轮等新卡片出现的上限**（ms）。
   *
   * 为什么进配置：离线夹具是静态 DOM，永远等不到"新卡片"，只能靠超时收手 ——
   * 测试要把它调到几十毫秒，否则每个用例白等十几秒。
   */
  scrollStepTimeoutMs: number
}

/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export const ZHIPIN_CITY_CODES: Record<string, string> = {
  北京: '101010100',
  上海: '101020100',
  广州: '101280100',
  深圳: '101280600',
  杭州: '101210100',
  成都: '101270100',
  南京: '101190100',
  苏州: '101190400',
  天津: '101030100',
  重庆: '101040100',
  武汉: '101200100',
  西安: '101110100',
  长沙: '101250100',
  郑州: '101180100',
  青岛: '101120200',
  合肥: '101220100',
  大连: '101070200',
  东莞: '101281600',
  佛山: '101280800',
  厦门: '101230200',
}

/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export const ZHIPIN_JOB_ID_PATTERN = '/job_detail/([0-9a-zA-Z~_-]+)\\.html'

/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export const ZHIPIN_MAX_PAGES = 1
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export const ZHIPIN_PAGE_SIZE = 15
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export const ZHIPIN_MAX_SCROLL_ROUNDS = 20

export const DEFAULT_ZHIPIN_CONFIG: ZhipinConfig = {
  selectors: {
    card: '.job-card-wrap',
    cardBox: '.job-card-box',
    jobName: '.job-name',
    salary: '.job-salary',
    tagList: '.tag-list li',
    company: '.boss-name, .company-name',
    location: '.company-location',
  },
  detailSelectors: {
    title: '.info-primary .name h1, .name h1',
    salary: '.info-primary .salary, .salary',
    tags: '.info-primary .tag-list span',
    jdText: '.job-sec-text',
    companySider: '.sider-company',
  },
  urlParams: {
    base: 'https://www.zhipin.com/web/geek/job',
    keywordParam: 'query',
    cityParam: 'city',
  },
  cityCodes: ZHIPIN_CITY_CODES,
  jobIdPattern: ZHIPIN_JOB_ID_PATTERN,
  // 一轮滚动给站点留 12 秒（实测每轮 1–3 秒就追加完，留足余量但不至于卡死整轮预算）
  scrollStepTimeoutMs: 12_000,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override: unknown): ZhipinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_ZHIPIN_CONFIG
  const patch = override as Partial<ZhipinConfig>
  const pattern = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  return {
    selectors: { ...DEFAULT_ZHIPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    detailSelectors: { ...DEFAULT_ZHIPIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
    urlParams: { ...DEFAULT_ZHIPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
    scrollStepTimeoutMs: positive(
      patch.scrollStepTimeoutMs,
      DEFAULT_ZHIPIN_CONFIG.scrollStepTimeoutMs,
    ),
  }
}

/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null {
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
    params.set(config.urlParams.cityParam, code)
  }
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * **在页面上下文里**滚动加载：滚到底 → 等新卡片出现 → 重复。
 *
 * 为什么需要它：BOSS 的搜索结果**没有可寻址的第 N 页**（`&page=2` 实测无效），
 * 唯一的翻页手段就是滚动触发的懒加载。所以"抓得更深"只能在一次页面加载之内做厚。
 *
 * 两个刻意的收手条件：
 *   * 某一轮**没有新增卡片**就停（平台封顶 300 条时就是这个表现，再滚也是白滚）；
 *   * 每轮只等到 `stepTimeoutMs` —— 站点不响应时不能让整轮预算被一个页面吃干。
 *
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export async function scrollToLoadInPage(arg: {
  card: string
  rounds: number
  stepTimeoutMs: number
}): Promise<number> {
  const count = (): number => {
    try {
      return document.querySelectorAll(arg.card).length
    } catch {
      return 0
    }
  }
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })

  let loaded = count()
  for (let round = 0; round < arg.rounds; round += 1) {
    try {
      window.scrollTo(0, document.body.scrollHeight)
    } catch {
      /* 离线夹具没有滚动（静态 DOM），靠下面的超时收手 */
    }
    const deadline = Date.now() + arg.stepTimeoutMs
    let grew = false
    while (Date.now() < deadline) {
      await sleep(400)
      const current = count()
      if (current > loaded) {
        loaded = current
        grew = true
        break
      }
    }
    if (!grew) break
  }
  return loaded
}

/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export function extractJobsInPage(arg: {
  selectors: ZhipinSelectors
  jobIdPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    return out
  }
  if (cards === null) return out
  let idRe: RegExp | null = null
  try {
    idRe = new RegExp(arg.jobIdPattern)
  } catch {
    idRe = null
  }

  for (const card of Array.from(cards)) {
    let box: Element = card
    try {
      box = card.querySelector(arg.selectors.cardBox) ?? card
    } catch {
      box = card
    }

    let nameEl: Element | null = null
    try {
      nameEl = box.querySelector(arg.selectors.jobName)
    } catch {
      nameEl = null
    }
    if (nameEl === null) continue
    const href = nameEl.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 原样给，字段断言会兜 */
    }

    const title = (nameEl.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    // 未登录薪资隐藏：元素在、文本空 —— 留空（requiredFields 不含 salary_raw）。
    let salaryRaw = ''
    try {
      salaryRaw = (box.querySelector(arg.selectors.salary)?.textContent ?? '').replace(/\s+/g, '').trim()
    } catch {
      salaryRaw = ''
    }

    // tag-list 固定顺序：经验 / 学历（夹具实测）。
    let expReq = ''
    let eduReq = ''
    try {
      const tags = Array.from(box.querySelectorAll(arg.selectors.tagList))
        .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((text) => text !== '')
      expReq = tags[0] ?? ''
      eduReq = tags[1] ?? ''
    } catch {
      /* 留空 */
    }

    let company = ''
    try {
      company = (box.querySelector(arg.selectors.company)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      company = ''
    }

    // 「城市·区域·地标」→ city / district（夹具实测如「深圳·福田区·车公庙」）。
    let city = ''
    let district = ''
    try {
      const locationText = (box.querySelector(arg.selectors.location)?.textContent ?? '')
        .replace(/\s+/g, '')
        .trim()
      const parts = locationText.split('·')
      city = parts[0] ?? ''
      district = parts[1] ?? ''
    } catch {
      /* 留空 */
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobIdPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('未登录视图薪资隐藏（登录后可升级）')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(district === '' ? {} : { district }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（选择器：BossHunter site-patterns 2026-05-26 验证）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 */
export function extractDetailInPage(arg: { selectors: ZhipinDetailSelectors }): RawJobDetail {
  const pick = (selector: string): string => {
    try {
      return (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }
  let expReq = ''
  let eduReq = ''
  try {
    const tags = Array.from(document.querySelectorAll(arg.selectors.tags))
      .map((tag) => (tag.textContent ?? '').trim())
      .filter((text) => text !== '')
    expReq = tags[0] ?? ''
    eduReq = tags[1] ?? ''
  } catch {
    /* 留空 */
  }
  return {
    platformJobId: '',
    title: pick(arg.selectors.title),
    salaryRaw: pick(arg.selectors.salary),
    company: '',
    sourceUrl: location.href,
    jdText: pick(arg.selectors.jdText),
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
  }
}

export interface ZhipinAdapterOptions {
  config?: ZhipinConfig
  delayRangeMs?: [number, number]
  waitForListMs?: number
}

/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options: ZhipinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_ZHIPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 本次要滚动加载几轮（`scrollRounds` 维度，方案里配）。
   *
   * 缺省 1 = 只读当前这一屏 15 条（**与改动前行为一致**：保守是默认，加深度要显式配）。
   * 上限取平台自报的 `totalCount / 15`，不是我们拍的保守值 —— 再多滚平台也不给。
   */
  const scrollRoundsOf = (criteria: SearchCriteria): number => {
    const parsed = Number.parseInt(platformCriterion(criteria, 'scrollRounds'), 10)
    if (!Number.isFinite(parsed) || parsed <= 1) return 1
    return Math.min(parsed, ZHIPIN_MAX_SCROLL_ROUNDS)
  }

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: ZHIPIN_MAX_PAGES,
      hint: 'BOSS 搜索页**没有可寻址的第 N 页**（2026-09-18 实测 `&page=2` 返回同一批数据）—— 深度改用「滚动加载轮数」',
    },
    {
      key: 'scrollRounds',
      label: '加载轮数',
      values: [],
      max: ZHIPIN_MAX_SCROLL_ROUNDS,
      hint:
        `BOSS 没有页码翻页，只能滚动加载：每滚一次 +${String(ZHIPIN_PAGE_SIZE)} 条。` +
        '填 1 = 只读第一屏 15 条；填 4 ≈ 60 条。平台自报 totalCount 封顶 300 条（= 20 轮），' +
        '再滚也没有新数据。轮数越大请求越密、风控风险越高 —— 保守起见先配 2–4 试。',
    },
  ]

  return {
    id: 'zhipin',
    ...platformFacts('zhipin'),
    displayName: 'BOSS直聘',
    capabilities: {
      // 夹具实测：未登录可见列表；但薪资隐藏 → 如实两说。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    // 未登录薪资隐藏：salary_raw 不进必需字段（否则全部被隔离）。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: ZHIPIN_MAX_PAGES,
    // 没有可寻址的页码（滚动加载走 scrollRounds 维度）—— 页数恒 1。
    defaultMaxPages: 1,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildZhipinSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildZhipinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        // 滚动加载（`scrollRounds`，方案里配）：BOSS 的"翻页"只发生在页面内 ——
        // 第一屏已经在上面等到了，这里再滚 (rounds - 1) 次把它读厚。
        const rounds = scrollRoundsOf(criteria)
        if (rounds > 1) {
          await page.evaluate(scrollToLoadInPage, {
            card: config.selectors.card,
            rounds: rounds - 1,
            stepTimeoutMs: config.scrollStepTimeoutMs,
          })
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
        })
      },

      async hasNextPage(): Promise<boolean> {
        // 恒 false 是**平台事实**，不是没实现：2026-09-18 登录态实测，搜索页没有页码分页区，
        // 且 `&page=2` 返回的前 3 个岗位 id 与第 1 页完全相同（SPA 忽略该参数）——
        // 也就是说"下一页"这个东西在这个站点**不可寻址**。深度靠滚动加载（见 gotoSearch）。
        // 证据：test/fixtures/zhipin-pagination-report.json 的 `urlPaging.changed === false`。
        return false
      },
    },

    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        // 判墙的**通用那一半**（验证码选择器、限流/配额/登录墙文案、blank 阈值）
        // 已抽到 `block-signals.ts`；这里只声明 BOSS 特有的 URL 特征：
        // 滑块页 `https://www.zhipin.com/web/user/safe/verify-slider`（get_jobs 实证）。
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
          card: config.selectors.card,
        })
      },
    },

    // ⚠️ sayHello 在批次 C 实现前保持 fail-closed（不声明 actions）。
  }
}
