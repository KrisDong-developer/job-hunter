/**
 * Indeed（cn.indeed.com）适配器。
 *
 * ## ⚠️ 2026-09-18 真实调研结论：中国大陆站已停运（必须先读，再决定怎么用）
 *
 * * 直接请求 `cn.indeed.com/jobs?q=…&l=…`：被 **302 重定向到全球站 `www.indeed.com`**，
 *   随后被 **Cloudflare 验证墙拦截**（页面文案「需要进行其他验证」，响应带 `Ray ID`）。
 * * 站点自身也印证停运：全球站首页直接引导「For jobs in China, visit cn.indeed.com」，
 *   但 cn 站首页已变成通用跳转页，职位搜索入口不再返回岗位数据 —— 与 Indeed
 *   2022 年起退出中国大陆市场的事实一致。
 * * 因此**本适配器没有一个可信的「中国大陆岗位列表」真实夹具可校准**。
 *   ADAPTERS.md §6 铁律（不编选择器、未验证不猜）在这里直接适用。
 *
 * ## 那么这份适配器是什么 / 不是什么
 *
 * * **是**：对 Indeed 全球通行的职位搜索页（JCS，job search）真实结构的适配器。
 *   该结构的核心语义锚点（`data-testid` / 类名）在所有 Indeed 国家域上**多年稳定**，
 *   是社区公开文档描述的形态。选择器与 URL 约定全部进配置（DB 可覆盖，ADR-19），
 *   留了后续换域（`host` 可配）即可在仍运营的 Indeed 国家站上校准的余地。
 * * **不是**：对「中国大陆 Indeed 在营数据源」的承诺。默认 `host=cn.indeed.com` 只是
 *   尊重用户原意的默认值 —— 它当前会命中 Cloudflare 墙或重定向，判墙即停（C12）。
 *
 * 诚实边界：因为拿不到可信的中国大陆夹具，`capabilities.fieldCompleteness='low'`、
 * `antiBot='high'`，未锚定字段**留空 + notes**，由字段级断言隔离进 pending_repair，不编。
 *
 * ✍️ 换一个仍运营的域来启用真实采集（示例）：
 *   在 `setting` 表写一条
 *   `scope='platform', scope_ref='indeed', key='adapter-config'` 的 JSON：
 *   `{"host":"de.indeed.com"}`（德国）或 `{"host":"sg.indeed.com"}`（新加坡）等，
 *   再把 `test/fixtures/indeed-search.html` 换成对应域用手动浏览器保存的搜索结果页，
 *   跑 `npm run probe:*` 校准锚点后，本适配器即可变成真实在用的适配器。
 *
 * ## Indeed JCS 结构（社区文档描述的稳定形态，2026-09-18 据此实现，待校准）
 *
 * * 搜索 URL：`https://{host}/jobs?q={关键词}&l={地点}&start={第几批}`；
 *   `start` 每页偏移一个定长（`pageSize`，默认 15）—— Indeed 免费版没有页码按钮，
 *   只有「下一页」，`start=0,15,30…`；
 * * 地点是**自由文本**（`l=` 直接吃中文/英文地名），不依赖城市码映射；
 * * 卡片：职位标题锚 `a.jcs-JobTitle`（就业界稳定类名），href 内带 `jk=<jobkey>`，
 *   `jobkey` 就是平台 id（幂等 upsert 键）；公司 `[data-testid="company-name"]`、
 *   地点 `[data-testid="text-location"]`、薪资 `[data-testid="attribute_snippet_testid"]`、
 *   发布日期 `[data-testid="jobListingDate"]`；
 * * 翻页：分页区 `a[data-testid="pagination-page-next"]`，被禁用时打 `aria-disabled`。
 *
 * 以上锚点**只是实现依据，不是验证证据**（拿不到中国大陆夹具）。锚不中就留空，
 * 靠 `pp()` 架构里已有的字段级断言隔离，绝不假装抓到。
 */
import type { BlockKind, CoreField } from '../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../pacing.js'
import { humanBrowse } from '../humanize.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../types.js'

/** 结构锚点集（按照 Indeed JCS 稳定语义锚点，2026-09-18；待域校准后写 DB 覆盖）。 */
export interface IndeedSelectors {
  /** 职位标题链接：`a.jcs-JobTitle`（就业界稳定；href 内嵌 `jk=` 平台 id）。 */
  titleLink: string
  /** 公司名（教程/site:indeed 文档形态）。 */
  company: string
  /** 地点。 */
  location: string
  /** 薪资。 */
  salary: string
  /** 发布日期。 */
  date: string
  /** 分页容器（通常就是 `nav[aria-label*="分页"]` / `.pagination`）。 */
  pagination: string
  /** 「下一页」锚点。 */
  nextPage: string
  /** 「下一页」被禁用时打在这个属性上（如 `aria-disabled="true"`）。 */
  nextPageDisabledAttr: string
}

/** 字段 → URL 参数映射（get_jobs / Indeed 公开约定同款：`q` / `l` / `start`）。 */
export interface IndeedUrlParams {
  keywordParam: string
  locationParam: string
  /** 分页偏移参数（按 `pageSize` 递增）。 */
  startParam: string
}

export interface IndeedConfig {
  /** 站点域；默认 cn.indeed.com（已停运，见文件头）—— 换仍运营域见文件头说明。 */
  host: string
  selectors: IndeedSelectors
  urlParams: IndeedUrlParams
  /** 每页条数（免费版固定每页一个定长，`start` 步进默认 15；可按域实测调整）。 */
  pageSize: number
  /** 从职位链接 href 里抠 `jk=<jobkey>` 的模式。 */
  jobKeyPattern: string
  /** 薪资文本模式（字符串形态，序列化进页面）。 */
  salaryPattern: string
}

export const INDEED_JOB_KEY_PATTERN = '[?&]jk=([A-Za-z0-9]+)'
export const INDEED_SALARY_PATTERN =
  '\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?\\s*[-~至]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?(?:\\s*元?(?:/月|/年|月薪|年薪))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK万](?:\\s*元?(?:/月|/年|月薪|年薪))?\\s*以上|面议'

/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export const INDEED_DEFAULT_MAX_PAGES = 3
export const INDEED_MAX_PAGES = 5

export const DEFAULT_INDEED_CONFIG: IndeedConfig = {
  // ⚠️ 中国大陆站已停运。保留为默认值仅尊重原意；真正启用请换仍运营的域（见文件头）。
  host: 'cn.indeed.com',
  selectors: {
    titleLink: 'a.jcs-JobTitle',
    company: "[data-testid='company-name']",
    location: "[data-testid='text-location']",
    salary: "[data-testid='attribute_snippet_testid']",
    date: "[data-testid='jobListingDate']",
    pagination: 'nav[aria-label]',
    nextPage: "[data-testid='pagination-page-next']",
    nextPageDisabledAttr: 'aria-disabled',
  },
  urlParams: {
    keywordParam: 'q',
    locationParam: 'l',
    startParam: 'start',
  },
  pageSize: 15,
  jobKeyPattern: INDEED_JOB_KEY_PATTERN,
  salaryPattern: INDEED_SALARY_PATTERN,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeIndeedConfig(override: unknown): IndeedConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_INDEED_CONFIG
  const patch = override as Partial<IndeedConfig>
  const str = (key: keyof IndeedConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  const num = (key: keyof IndeedConfig, fallback: number): number =>
    typeof patch[key] === 'number' && patch[key] > 0 ? (patch[key] as number) : fallback
  return {
    host: str('host', DEFAULT_INDEED_CONFIG.host),
    selectors: { ...DEFAULT_INDEED_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_INDEED_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    pageSize: num('pageSize', DEFAULT_INDEED_CONFIG.pageSize),
    jobKeyPattern: str('jobKeyPattern', DEFAULT_INDEED_CONFIG.jobKeyPattern),
    salaryPattern: str('salaryPattern', DEFAULT_INDEED_CONFIG.salaryPattern),
  }
}

/**
 * 构造搜索 URL：`https://{host}/jobs?q=Java&l=北京&start=0`。
 * 关键词 / 地点都是**自由文本**，没有城市码映射 —— 地点为空就不带 `l=`。
 * `criteria.page` 是 1 起（项目约定）；`start` = (page-1) * pageSize（0 起）。
 */
export function buildIndeedSearchUrl(config: IndeedConfig, criteria: SearchCriteria): string {
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    params.set(config.urlParams.locationParam, criteria.city)
  }
  const page = criteria.page === undefined ? 1 : criteria.page
  const start = Math.max(0, page - 1) * config.pageSize
  params.set(config.urlParams.startParam, String(start))

  const base = `https://${config.host}/jobs`
  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}

/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export function extractJobsInPage(arg: {
  selectors: IndeedSelectors
  host: string
  jobKeyPattern: string
  salaryPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let links: NodeListOf<Element> | null = null
  try {
    links = document.querySelectorAll(arg.selectors.titleLink)
  } catch {
    return out
  }
  if (links === null) return out

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const keyRe = compile(arg.jobKeyPattern)
  const salaryRe = compile(arg.salaryPattern)

  const textOf = (selector: string, scope: Element): string => {
    try {
      const el = scope.querySelector(selector)
      if (el === null) return ''
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  for (const link of Array.from(links)) {
    const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const rawHref = link.getAttribute('href') ?? ''
    if (rawHref === '') continue

    const keyMatch = keyRe !== null ? keyRe.exec(rawHref) : null
    const platformJobId = keyMatch !== null ? (keyMatch[1] ?? '') : ''
    // 有 jk 就用规范详情地址（viewjob 比 /rc/clk 点击追踪链接干净、可幂等）。
    const sourceUrl =
      platformJobId !== '' ? `https://${arg.host}/viewjob?jk=${platformJobId}` : new URL(rawHref, location.origin).href

    // 找"同卡"做字段锚点：真页面上公司/地点/薪资是标题锚点的**兄弟节点**（都在卡片容器内）。
    // 从链接往上爬，找到第一个包含公司节点的祖先当作卡片容器；找不到就退化为链接自身。
    let card: Element = link
    try {
      let node = link
      while (node.parentElement !== null && node.parentElement !== document.body) {
        node = node.parentElement
        if (node.querySelector(arg.selectors.company) !== null) {
          card = node
          break
        }
      }
    } catch {
      /* 保持 card = link */
    }

    const salaryRaw = salaryRe !== null ? (salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '') : ''
    const company = textOf(arg.selectors.company, card)
    const city = textOf(arg.selectors.location, card)
    const dateRaw = textOf(arg.selectors.date, card)

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobKeyPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(notes.length === 0 ? {} : { notes }),
      ...(dateRaw === '' ? {} : { publishedAt: dateRaw }),
    })
  }
  return out
}

/**
 * Indeed 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare 挑战的 DOM 特征**（`#challenge-error-title` / `.cf-error-*` /
 *     `challenges.cloudflare.com` 的 iframe）—— 通用词表里没有 Cloudflare；
 *   * **验证码文案**：Indeed 是「需要进行其他验证」+ 英文 `Ray ID` / `captcha` / `robot`。
 *     它们必须进 `captchaText` 而**不是** `rateText` —— 判定顺序上验证码在前，
 *     但语义错了会让界面把"人机验证"说成"限流"，给用户的下一步动作完全不同；
 *   * `expectedHost`：中国站停运的实际表现是被 302 送到别的域（`cn.indeed.com` →
 *     `www.indeed.com`）→ 判 `blank`。这是**地址级**事实；
 *   * `skipLoginWall`：原实现**没有**登录墙判据（Indeed 用 Cloudflare 而非登录墙），
 *     让通用词表替它猜会把"0 条"误报成"需要登录"。
 */
const INDEED_BLOCK_SIGNALS = {
  captchaSelectors: [
    '#challenge-error-title',
    '.cf-error-details',
    '.cf-error-h1',
    '[id^="challenge-running"]',
    'iframe[src*="challenges.cloudflare.com"]',
  ],
  captchaText: ['需要进行其他验证', '请稍候', 'Ray ID', 'cloudflare', 'cf-error', '验证码', 'captcha', '安全验证', 'robot'],
  // 通用词表里没有「请求过于频繁」，Indeed 的文案是这一条
  rateText: ['请求过于频繁'],
} as const

/** 见 `INDEED_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
function indeedBlockFlags(host: string): { expectedHost: string; skipLoginWall: boolean } {
  return { expectedHost: host, skipLoginWall: true }
}

/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export function hasNextPageInPage(arg: {
  pagination: string
  nextPage: string
  disabledAttr: string
}): boolean {
  try {
    const nav = document.querySelector(arg.pagination)
    if (nav === null) return false
    const next = nav.querySelector(arg.nextPage)
    if (next === null) return false
    if (String(next.getAttribute(arg.disabledAttr)).toLowerCase() === 'true') return false
    if (next.hasAttribute('disabled')) return false
    return true
  } catch {
    return false
  }
}

export interface IndeedAdapterOptions {
  config?: IndeedConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 Indeed 适配器。 */
export function createIndeedAdapter(options: IndeedAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_INDEED_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    { key: 'city', label: '地点', values: [], hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码' },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: INDEED_MAX_PAGES,
      hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；Indeed 免费版无页码按钮 + Cloudflare 风控，刻意保守。注意：中国大陆站已停运，默认 host 会命中重定向/验证墙`,
    },
  ]

  return {
    id: 'indeed',
    ...platformFacts('indeed'),
    displayName: 'Indeed',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 无可信中国大陆夹具：锚点来自公开描述的稳定结构，未校准 → 如实标 low。
      fieldCompleteness: 'low',
      antiBot: 'high',
    },
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: INDEED_MAX_PAGES,
    defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildIndeedSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildIndeedSearchUrl(config, criteria)
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.titleLink, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        await humanBrowse(page)
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          host: config.host,
          jobKeyPattern: config.jobKeyPattern,
          salaryPattern: config.salaryPattern,
        })
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {
          pagination: config.selectors.pagination,
          nextPage: config.selectors.nextPage,
          disabledAttr: config.selectors.nextPageDisabledAttr,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(INDEED_BLOCK_SIGNALS),
          card: config.selectors.titleLink,
          flags: indeedBlockFlags(config.host),
        })
      },
    },

    // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：Indeed 中国站已停运，
    //   无法实测打招呼/投递契约，fail-closed 而不是假装能发（与猎聘同策略）。
  }
}