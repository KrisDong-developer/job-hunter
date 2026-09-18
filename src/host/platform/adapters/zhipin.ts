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
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
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

/** 未登录单页 15 条、无分页 —— 上限 1 页是平台事实，不是保守取舍。 */
export const ZHIPIN_MAX_PAGES = 1

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
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override: unknown): ZhipinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_ZHIPIN_CONFIG
  const patch = override as Partial<ZhipinConfig>
  const pattern = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  return {
    selectors: { ...DEFAULT_ZHIPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    detailSelectors: { ...DEFAULT_ZHIPIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
    urlParams: { ...DEFAULT_ZHIPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
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

/**
 * **在页面上下文里**判断风控/登录墙。
 * BOSS 特有：滑块页 URL `https://www.zhipin.com/web/user/safe/verify-slider`
 * （get_jobs 实证）→ 判 captcha，命中即停交人工。
 */
export function detectBlockInPage(arg: { card: string }): BlockKind | null {
  // BOSS 滑块验证页（URL 特征，get_jobs 实证）。
  if (/zhipin\.com\/web\/user\/safe\/verify/.test(location.href)) return 'captcha'

  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')
  let cards = 0
  try {
    cards = document.querySelectorAll(arg.card).length
  } catch {
    cards = 0
  }

  const captcha = document.querySelector(
    '.geetest_panel, .geetest_holder, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], [class*="slide-verify"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量/.test(compact)) {
    return 'rate-limited'
  }
  if (/今日投递太多|休息一下明天再来|达到上限|次数过多/.test(compact)) return 'quota-exhausted'
  // 登录墙：BOSS 未登录不挡列表（实测），但整页被登录表单替换时是墙。
  if (cards === 0 && /扫码登录|手机号登录/.test(compact) && compact.length < 800) return 'login-required'
  if (cards === 0 && compact.length < 120) return 'blank'
  return null
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
      hint: '未登录无分页区（单页 15 条）—— 上限 1 页是平台事实；登录后补分页契约再放开',
    },
  ]

  return {
    id: 'zhipin',
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
        // 未登录无分页区（夹具实测）—— 恒 false；登录夹具补契约后改造。
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
        return await page.evaluate(detectBlockInPage, { card: config.selectors.card })
      },
    },

    // ⚠️ sayHello 在批次 C 实现前保持 fail-closed（不声明 actions）。
  }
}
