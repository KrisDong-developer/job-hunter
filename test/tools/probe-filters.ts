#!/usr/bin/env node
/**
 * **筛选条件探针**（各平台通用）：把"这个平台到底有哪些搜索筛选"用真实页面 + 真实请求查清楚。
 *
 * 为什么单开一个探针：现有的 `probe-<platform>.ts` 各自只关心自己那一件事（列表解析、
 * 登录、动作），没有一个统一回答"这个平台的搜索条件有哪些、取值是什么、落到哪个请求参数"。
 * 而界面上的筛选条件必须与适配器声明一致，声明又必须与真实请求一致 —— 这条链的证据端
 * 就在这里。
 *
 * 一次运行对每个平台做三件事，全部落盘到 `.probe-filters/<平台>-<日期>.json`：
 *   ① 打开搜索页，等列表出现，抓 `page.url()` 与标题（含风控/登录墙判定）；
 *   ② 抓**所有** XHR/fetch 的 url + method + postData + 响应体（截断），特别是列表/条件接口 ——
 *      参数名与取值码就在这里面；跨平台通用，不依赖各站 DOM 结构；
 *   ③ 把筛选控件容器的 outerHTML 截断存下来（DOM 里常有 `data-value` 之类的码表）。
 *
 * 用法：
 *   node scripts/run-ts.mjs test/tools/probe-filters.ts --platforms=waiqi,sinojobs
 *   node scripts/run-ts.mjs test/tools/probe-filters.ts --platforms=zhipin --headful
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

/** 一个平台的探测配方。刻意只有"入口 + 抓什么"，不做任何解析 —— 解析留在离线分析里。 */
interface FilterProbeSpec {
  id: string
  /** 搜索页地址（用 `{kw}` 占位关键词）。 */
  url: string
  /** 复用已有的登录态 profile（存在就用它，否则新建一个空的）。 */
  profile: string
  /** 只抓这些子串匹配的响应体（`[]` = 全抓）。 */
  apiMarkers: string[]
  /** 筛选控件容器的候选选择器（命中的第一个/前若干个的外层 HTML 会存下来）。 */
  panelSelectors: string[]
  /** 需要一起 dump 的页面全局（如智联的 `__INITIAL_STATE__`）。 */
  globals: string[]
  /** 是否必须登录才有完整筛选（只影响报告里的一句说明）。 */
  needsLogin?: boolean
  /**
   * **要点击的筛选项文案**（按可见文本精确匹配）。
   *
   * 这是拿到"参数名"的唯一办法：初始载荷只能证明"参数存在"，
   * 而"点一下之后请求里多出哪个键"才能证明**这个筛选落到哪个参数**。
   * 文案取自各平台自己的码表（`groups`/`codes` 工具抠出来的 label）。
   */
  clickLabels?: string[]
  /**
   * **按选择器点击**的筛选项（形如 `#work-salary strong[rel="10"]`）。
   *
   * 为什么两种都要：文案匹配在"选项藏在折叠区/文案带全角字符"时会找不到
   *（sinojobs 的 `5K-10K` 就没匹配上），而选择器对这类站点是精确的。
   */
  clickSelectors?: string[]
  /**
   * **多步点击**：每一步一个选择器，按顺序点完再抓请求。
   *
   * 为什么需要：不少平台的筛选项藏在**弹出的面板**里（51job 的 `.j_filter` 弹层、
   * BOSS 的筛选抽屉）—— 不先点开，选项根本不在 DOM 里，单步点击只会得到"没找到"。
   */
  clickSequences?: Array<{ label: string; steps: string[] }>
  /**
   * **URL 变体对比**：同一页面的几个地址（例如加上 `/&S_SOU_EDUCATION_LOWESTLEVEL=4`），
   * 逐个打开并数一数结果卡片 —— 用来判定"这些参数从**网页 URL** 上到底生效不生效"。
   *
   * 为什么必须单独测：筛选参数往往同时存在于"页面 URL"和"页面内调用的接口体"两处，
   * 而适配器（URL + DOM 解析）只走前者。把只对接口生效的参数接到 URL 上，
   * 就是我们这轮要消灭的"声明了但发不出去"。
   */
  urlVariants?: Array<{ label: string; url: string }>
  /**
   * 数结果卡片用的选择器（**可以给多个候选**）。
   *
   * 为什么给多个：站点改版时旧的卡片类名会**静默失效**（数到 0，看起来像"今天没岗位"），
   * 而适配器正是按那个类名解析列表的。一次打开把几个候选都数一遍，
   * "哪个还有卡片"当场就看得出来。也用来判定 URL 参数变体是否真的改变了结果集。
   */
  countSelectors?: string[]
  /**
   * **内联脚本**的标记词（如 `__INITIAL_STATE__`）：命中的 `<script>` 文本会被抓下来（截断）。
   *
   * 为什么需要它：好几个平台把岗位载荷**内联在页面脚本里**（适配器正是从那儿读的），
   * 而它既不是 XHR 响应、也不是 DOM 文本 —— 不专门抓，就会像刚才那样"报告里搜不到，
   * 于是错误地以为站点把载荷删了"。抓下来既能验证适配器的读法，也能当夹具。
   */
  inlineScriptMarkers?: string[]
  /**
   * dump `localStorage` 的键（值只留前 40 字符）。
   *
   * 为什么要它：有些平台的搜索接口要**页面自己生成的令牌**（智联的 `at`/`rt`），
   * 而适配器要在页面里发这个请求就得知道令牌从哪取。先看清它存在哪儿，
   * 才不会写一个"猜键名"的实现。
   */
  dumpStorage?: boolean
}

const KEYWORD = process.env['PROBE_KEYWORD'] ?? 'Java'
const OUT_DIR = join(process.cwd(), '.probe-filters')
const MAX_BODY = 200_000
/**
 * **码表类**响应多留一些：筛选条件的取值域（枚举 / 字典 / 分类 / 城市树）往往几百 KB，
 * 被 200KB 截断就再也解析不出来（只能看到"非 JSON"）。页面类响应照旧少留 ——
 * 报告文件不该被无关的 HTML 撑爆。
 */
const CODE_TABLE_HINTS = ['category', 'districts', 'enum', 'dict', 'condition', 'by-alias', 'tag']
const MAX_CODE_BODY = 3_000_000
const MAX_PANEL = 120_000
const SETTLE_MS = 7_000

const SPECS: FilterProbeSpec[] = [
  {
    id: 'waiqi',
    url: `https://www.waiqi.com/position?keyword=${KEYWORD}`,
    profile: '.probe-filters-waiqi-profile',
    // 神仙外企列表走接口（backservice.offerxiansheng.com）——条件码表也在接口里。
    apiMarkers: ['backservice', 'position', 'enum', 'platform-type'],
    panelSelectors: ['.filter', '.screen', '[class*="filter"]', '[class*="condition"]'],
    globals: [],
  },
  {
    id: 'sinojobs',
    url: `https://sinojobs.com.cn/Recruitment/index.html?keywords=${KEYWORD}`,
    profile: '.probe-filters-sinojobs-profile',
    apiMarkers: ['indexAjaxPage', 'Recruitment', 'ajax'],
    panelSelectors: ['#work-salary', '#work-year', '#job_type', '.screen', '.filter'],
    globals: [],
    // 直接点 `strong[rel]`（rel 就是平台自己的码：薪资=下限 K，经验=档位）。
    // 文案匹配在这里失效（选项在折叠区/全角字符），所以用选择器。
    clickSelectors: ['#work-salary strong[rel="10"]', '#work-year strong[rel="2"]'],
  },
  {
    id: '51job',
    url: `https://we.51job.com/pc/search?keyword=${KEYWORD}&jobArea=000000`,
    profile: '.probe-filters-51job-profile',
    apiMarkers: ['/api/', 'search-pc', 'job'],
    panelSelectors: ['.j-search-condition', '[class*="filter"]', '[class*="condition"]', '.j-filter'],
    globals: [],
    // 51job 是 URL 驱动的 SPA。这里专门验一件事：适配器**已经在发** `issueDate`（发布时间，天），
    // 但那个维度被声明成"不可用"（早先探针没在页面上找到控件）。直接比 URL 变体的结果卡片数：
    // 真会筛 → 计数与基线不同；不筛 → 一模一样。
    countSelectors: ['.joblist-item', '[class*="joblist"]', '[class*="job-item"]', '.e'],
    urlVariants: [
      { label: '基线', url: `https://we.51job.com/pc/search?keyword=${KEYWORD}&jobArea=000000` },
      { label: 'issueDate=7', url: `https://we.51job.com/pc/search?keyword=${KEYWORD}&jobArea=000000&issueDate=7` },
      // **对照组**：把基线放在最后再跑一次。若它也变成 0 条，说明是站点在限流后续加载，
      // 而不是 issueDate 起了作用 —— 没有这个对照，刚才那两个 0 条会被误读成"筛选生效"。
      { label: '基线（对照）', url: `https://we.51job.com/pc/search?keyword=${KEYWORD}&jobArea=000000` },
    ],
  },
  {
    id: 'zhipin',
    url: `https://www.zhipin.com/web/geek/job?query=${KEYWORD}&city=101280600`,
    profile: '.probe-zhipin-profile',
    apiMarkers: ['/wapi/zpgeek/'],
    panelSelectors: ['.filter-panel', '.job-filter', '[class*="filter"]', '[class*="condition"]'],
    globals: [],
    needsLogin: true,
    // 码表来自 `/wapi/zpgeek/pc/all/filter/conditions.json`（抓包里实测）。
    // 关键问题：选完筛选项后是**页面 URL** 变，还是只有 joblist 接口体变 —— 这决定接线方式。
    clickLabels: ['本科', '1-3年'],
  },
  {
    // BOSS 匿名对照：判定"筛选项是走页面 URL 还是只走 joblist 接口体"。
    // 码表来自 `/wapi/zpgeek/pc/all/filter/conditions.json`：degreeList 203=本科，experienceList 104=1-3年。
    id: 'zhipin-anon',
    url: `https://www.zhipin.com/web/geek/jobs?query=${KEYWORD}&city=101280600`,
    profile: '.probe-filters-zhipin-anon-profile',
    apiMarkers: ['/wapi/zpgeek/'],
    panelSelectors: ['[class*="job-card"]'],
    globals: [],
    countSelectors: ['[class*="job-card-wrapper"]', '[class*="job-card"]', '.job-list-box li'],
    urlVariants: [
      { label: '基线', url: `https://www.zhipin.com/web/geek/jobs?query=${KEYWORD}&city=101280600` },
      { label: 'degree=203', url: `https://www.zhipin.com/web/geek/jobs?query=${KEYWORD}&city=101280600&degree=203` },
      { label: 'experience=104', url: `https://www.zhipin.com/web/geek/jobs?query=${KEYWORD}&city=101280600&experience=104` },
    ],
  },
  {
    id: 'zhaopin',
    url: `https://www.zhaopin.com/sou/jl765?kw=${KEYWORD}`,
    profile: '.probe-zhaopin-logged-profile',
    apiMarkers: ['fe-api', 'search', 'sou'],
    // 卡片容器也抓一份：站点改版时类名会静默失效，卡片 HTML 是"新选择器长什么样"的唯一依据。
    panelSelectors: ['[class*="job-card"]', '.joblist-box__item', '[class*="filter"]'],
    globals: ['__INITIAL_STATE__'],
    inlineScriptMarkers: ['__INITIAL_STATE__', 'positionList', 'salary60'],
    // 搜索接口 `POST /c/i/search/positions` 要 `at`/`rt` 令牌 —— 先看清它们存在哪儿。
    dumpStorage: true,
    needsLogin: true,
    // 文案取自 `/c/i/search/base/data` 实测字典（educationType / workExpType / companyType / jobStatus）。
    clickLabels: ['本科', '1-3年', '国企', '全职'],
    // 候选卡片选择器：`.joblist-box__item` 是适配器在用的（2026-09-20 匿名页里出现 233 次），
    // 其余是同义类名 —— 一次打开全数一遍，看是不是站点改版把类名换掉了。
    countSelectors: [
      '.joblist-box__item',
      '[class*="joblist-box"]',
      '[class*="joblist"]',
      '[class*="job-card"]',
      '[class*="jobcard"]',
      '[class*="position-card"]',
      'li[class*="job"]',
      'div[class*="job"][class*="item"]',
    ],
    urlVariants: [{ label: '基线', url: 'https://www.zhaopin.com/sou/jl765?kw=Java' }],
  },
  {
    // 匿名对照：同样的地址，换一个全新 profile —— 判定"卡片类名变了"是不是登录态造成的。
    id: 'zhaopin-anon',
    url: `https://www.zhaopin.com/sou/jl765?kw=${KEYWORD}`,
    profile: '.probe-filters-zhaopin-anon-profile',
    apiMarkers: ['fe-api', 'search', 'sou'],
    panelSelectors: ['[class*="job-card"]', '.joblist-box__item'],
    globals: [],
    countSelectors: ['.joblist-box__item', '[class*="job-card"]', '[class*="joblist"]'],
    urlVariants: [{ label: '匿名基线', url: 'https://www.zhaopin.com/sou/jl765?kw=Java' }],
  },
  {
    id: 'liepin',
    url: `https://www.liepin.com/zhaopin/?key=${KEYWORD}`,
    profile: '.probe-liepin-profile',
    apiMarkers: ['api', 'search', 'get_jobs', 'condition'],
    panelSelectors: ['[class*="filter"]', '[class*="screen"]', '[class*="condition"]'],
    globals: ['__INITIAL_STATE__'],
    needsLogin: true,
    // 2026-09-21 第 12 轮补：面板 HTML 里每个可选项都带
    // `data-key` / `data-code` / `data-name`（如 `data-key="workYearCode" data-code="3$5" data-name="3-5年"`）
    // —— 码表不用猜。这里要问的是另一件事：**点了之后页面 URL 变不变**，
    // 因为适配器走的是"URL + DOM 解析"，筛选只有进 URL 才算接得上。
    clickSelectors: ['[data-selector="filter-option-item"]'],
    clickLabels: ['3-5年', '21-30万', '一周以内', '本科', '高新技术企业'],
    countSelectors: [
      "div[class*='job-card-pc-container']",
      "a[data-nick='job-detail-job-info']",
      '[data-selector="job-card"]',
      '[class*="job-card"]',
    ],
    // 变体：把面板里的 `data-code` **原样**当 URL 参数试一次，比卡片数（基线放在最后再跑一遍当对照）。
    urlVariants: [
      { label: '经验=3-5年', url: 'https://www.liepin.com/zhaopin/?key=Java&workYearCode=3$5' },
      { label: '薪资=21-30万', url: 'https://www.liepin.com/zhaopin/?key=Java&salaryCode=4' },
      { label: '基线', url: 'https://www.liepin.com/zhaopin/?key=Java' },
    ],
  },
  {
    id: 'linkedin',
    url: `https://www.linkedin.com/jobs/search?keywords=${KEYWORD}&location=China`,
    profile: '.probe-linkedin-profile',
    apiMarkers: ['jobs-guest', 'voyager', 'search'],
    panelSelectors: ['[class*="filter"]', '[class*="search-filters"]', 'fieldset'],
    globals: [],
  },
  {
    id: 'hiredchina',
    url: `https://www.hiredchina.com/jobs?kw=${KEYWORD}`,
    profile: '.probe-filters-hiredchina-profile',
    apiMarkers: ['jobs', '_next', 'api'],
    panelSelectors: ['[class*="filter"]', '[class*="screen"]', 'select'],
    globals: [],
    // 双语站点：英文/中文标签都试一遍（筛选条是客户端渲染的，抓不到静态链接）。
    clickLabels: ['Full-time', 'Part-time', 'Remote', 'On-site', '全职', '兼职', '远程', '现场'],
  },
  {
    id: 'guopin',
    url: `https://www.iguopin.com/jobList?keyword=${KEYWORD}`,
    profile: '.probe-guopin-profile',
    apiMarkers: ['jobList', 'job', 'api'],
    panelSelectors: ['[class*="filter"]', '[class*="screen"]', '[class*="condition"]'],
    globals: [],
    // 文案取自 `by-alias` 实测码表（groups 工具抠出来的 label）：
    // 点一下看请求里多出哪个键 —— 这是拿到参数名的唯一办法。
    clickLabels: ['本科', '1-3年', '社招', '国企', '已上市'],
  },
  {
    id: 'indeed',
    url: `https://cn.indeed.com/jobs?q=${KEYWORD}`,
    profile: '.probe-indeed-profile',
    apiMarkers: ['jobs', 'mosaic', 'api'],
    panelSelectors: ['[class*="filter"]', '[id*="filter"]', 'fieldset'],
    globals: [],
    // 2026-09-21 第 12 轮补：Indeed 的现代 SERP 把筛选编成不透明的 `sc=0kf:attr(…)`，
    // 硬猜没意义；但 `fromage`（发布天数）与 `jt`（职位类型）是它多年公开的 URL 参数 ——
    // 那就**拿真实 URL 去比卡片数**，不生效就不接（基线放最后当对照）。
    clickLabels: ['全职', '兼职', '实习', '远程', '过去 7 天'],
    countSelectors: [
      'a.jcs-JobTitle',
      '.job_seen_beacon',
      '[data-testid="slider_item"]',
      '.cardOutline',
      'div[data-jk]',
    ],
    urlVariants: [
      { label: '发布=1天内', url: 'https://cn.indeed.com/jobs?q=Java&fromage=1' },
      { label: '发布=7天内', url: 'https://cn.indeed.com/jobs?q=Java&fromage=7' },
      { label: '类型=全职', url: 'https://cn.indeed.com/jobs?q=Java&jt=fulltime' },
      { label: '类型=兼职', url: 'https://cn.indeed.com/jobs?q=Java&jt=parttime' },
      { label: '基线', url: 'https://cn.indeed.com/jobs?q=Java' },
    ],
  },
]

interface CapturedRequest {
  url: string
  method: string
  postData: string | null
  status: number
  body: string | null
  bodyTruncated: boolean
}

function argOf(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.slice(2).find((item) => item.startsWith(prefix))
  return hit === undefined ? undefined : hit.slice(prefix.length)
}

async function probeOne(spec: FilterProbeSpec, headful: boolean): Promise<Record<string, unknown>> {
  const url = spec.url.split('{kw}').join(encodeURIComponent(KEYWORD))
  const profile = join(process.cwd(), spec.profile)
  const executablePath = discoverExecutable(candidateExecutables())
  const requests: CapturedRequest[] = []
  const consoleErrors: string[] = []

  const context: BrowserContext = await chromium.launchPersistentContext(profile, {
    headless: !headful,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1440, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  try {
    await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
    const page: Page = await context.newPage()
    page.on('pageerror', (error: Error) => consoleErrors.push(error.message.slice(0, 300)))
    page.on('response', (response) => {
      const req = response.request()
      const hit =
        spec.apiMarkers.length === 0 || spec.apiMarkers.some((marker) => response.url().includes(marker))
      if (!hit) return
      void response
        .text()
        .then((text: string) => {
          // **JSON 响应留大、HTML 页面留小**：码表/接口载荷（筛选取值域就在里面）常常几百 KB，
          // 而页面 HTML 留 200KB 足够判断内容与判墙 —— 报告文件不该被无关 HTML 撑爆。
          // 早先只按 URL 关键词判，漏了智联的 `/c/i/search/base/data`（过滤器定义就在这个响应里）。
          const contentType = response.headers()['content-type'] ?? ''
          const cap =
            contentType.includes('json') || CODE_TABLE_HINTS.some((hint) => response.url().includes(hint))
              ? MAX_CODE_BODY
              : MAX_BODY
          requests.push({
            url: response.url().slice(0, 600),
            method: req.method(),
            postData: req.postData()?.slice(0, 4_000) ?? null,
            status: response.status(),
            body: text.slice(0, cap),
            bodyTruncated: text.length > cap,
          })
        })
        .catch(() => undefined)
    })

    let gotoError: string | null = null
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((error: unknown) => {
      gotoError = error instanceof Error ? error.message : String(error)
    })
    await page.waitForTimeout(SETTLE_MS)

    const finalUrl = page.url()
    const title = await page.title().catch(() => '')
    // 页面文本前 4000 字：判"登录墙/验证码/空白"，也给离线分析留证据。
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.slice(0, 4_000) ?? '')
      .catch(() => '')

    const panels: Array<{ selector: string; html: string }> = []
    for (const selector of spec.panelSelectors) {
      const html = await page
        .evaluate((sel: string) => {
          const node = document.querySelector(sel)
          return node === null ? null : node.outerHTML.slice(0, 120_000)
        }, selector)
        .catch(() => null)
      if (typeof html === 'string' && html.length > 0) {
        panels.push({ selector, html: html.slice(0, MAX_PANEL) })
        if (panels.length >= 3) break
      }
    }

    /** 内联脚本：命中的抓文本（截断），用来验证"适配器从脚本里读载荷"这条路还在不在。 */
    const inlineScripts: Array<{ marker: string; length: number; head: string; hasPositionList: boolean }> = []
    for (const marker of spec.inlineScriptMarkers ?? []) {
      const found = await page
        .evaluate((needle: string) => {
          const scripts = Array.from(document.querySelectorAll('script'))
          const hit = scripts.find((node) => (node.textContent ?? '').includes(needle))
          if (hit === undefined) return null
          const text = hit.textContent ?? ''
          return { length: text.length, head: text.slice(0, 2_000), hasPositionList: text.includes('positionList') }
        }, marker)
        .catch(() => null)
      if (found !== null) inlineScripts.push({ marker, ...found })
    }

    const storage: Array<{ key: string; length: number; head: string }> = []
    if (spec.dumpStorage === true) {
      const entries = await page
        .evaluate(() => {
          const out: Array<{ key: string; length: number; head: string }> = []
          try {
            for (let i = 0; i < localStorage.length; i += 1) {
              const key = localStorage.key(i) ?? ''
              const value = localStorage.getItem(key) ?? ''
              out.push({ key, length: value.length, head: value.slice(0, 40) })
            }
          } catch {
            /* 取不到就算了 */
          }
          // Cookie **只取键名**（不取值）：智联那类令牌（at/rt）常常是 cookie，
          // 而"能不能从页面里读到"决定适配器能不能在页面内自己发那个请求。
          try {
            for (const pair of document.cookie.split(';')) {
              const key = pair.split('=')[0]?.trim() ?? ''
              if (key !== '') out.push({ key: `cookie:${key}`, length: 0, head: '' })
            }
          } catch {
            /* 同上 */
          }
          return out
        })
        .catch(() => [])
      storage.push(...entries)
    }

    const globals: Record<string, string> = {}
    for (const key of spec.globals) {
      const value = await page
        .evaluate((name: string) => {
          const raw = (window as unknown as Record<string, unknown>)[name]
          if (raw === undefined) return null
          try {
            return JSON.stringify(raw).slice(0, 200_000)
          } catch {
            return null
          }
        }, key)
        .catch(() => null)
      if (typeof value === 'string') globals[key] = value
    }

    /**
     * **点击差分**：逐个点击筛选项，看"点完之后新出现的请求"里多了哪些键。
     *
     * 每次都先重新加载页面再点 —— 否则上一次点击的状态会污染这一次的判定
     * （筛选大多是"选中态"，再点一次是取消）。
     */
    /** URL 变体：每个地址打开一次，数卡片 —— 变体之间**计数不同**才说明参数在 URL 上生效。 */
    const variants: Array<Record<string, unknown>> = []
    for (const variant of spec.urlVariants ?? []) {
      await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined)
      await page.waitForTimeout(4_000)
      const counts = await page
        .evaluate((selectors: string[]) => {
          const out: Record<string, number> = {}
          for (const selector of selectors) {
            try {
              out[selector] = document.querySelectorAll(selector).length
            } catch {
              out[selector] = -1
            }
          }
          return out
        }, spec.countSelectors ?? [])
        .catch(() => ({}))
      const textLength = await page
        .evaluate(() => (document.body?.innerText ?? '').length)
        .catch(() => 0)
      variants.push({
        label: variant.label,
        url: variant.url,
        counts,
        textLength,
        title: await page.title().catch(() => ''),
      })
    }

    const clicks: Array<Record<string, unknown>> = []
    /** 两种点击方式合流：文案匹配 + 选择器匹配（后者对折叠区/全角文案更稳）。 */
    const clickTargets: Array<{ label: string; selector: string | null; sequence?: string[] }> = [
      ...(spec.clickLabels ?? []).map((label) => ({ label, selector: null })),
      ...(spec.clickSelectors ?? []).map((selector) => ({ label: selector, selector })),
      ...(spec.clickSequences ?? []).map((step) => ({ label: step.label, selector: null, sequence: step.steps })),
    ]
    for (const target of clickTargets) {
      const label = target.label
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined)
      await page.waitForTimeout(3_000)
      const beforeIndex = requests.length
      const found = await page
        .evaluate((arg: { text: string; selector: string | null; sequence?: string[] }) => {
          if (arg.sequence !== undefined) {
            // 多步：先点开面板，再点选项。任何一步找不到就如实返回 false。
            for (const step of arg.sequence) {
              const node = document.querySelector(step)
              if (node === null) return false
              ;(node as HTMLElement).click()
            }
            return true
          }
          if (arg.selector !== null) {
            const node = document.querySelector(arg.selector)
            if (node === null) return false
            ;(node as HTMLElement).click()
            return true
          }
          const nodes = Array.from(document.querySelectorAll('a,button,li,span,div,label,p,em'))
          const hit = nodes.find(
            (el) => el.children.length === 0 && (el.textContent ?? '').trim() === arg.text,
          )
          if (hit === undefined) return false
          ;(hit as HTMLElement).click()
          return true
        }, { text: label, selector: target.selector, ...(target.sequence === undefined ? {} : { sequence: target.sequence }) })
        .catch(() => false)
      await page.waitForTimeout(3_000)
      const fresh = requests.slice(beforeIndex).map((item) => {
        let query: string[] = []
        try {
          query = [...new URL(item.url).searchParams.keys()]
        } catch {
          /* 相对地址 */
        }
        let bodyKeys: string[] = []
        if (item.postData !== null && item.postData.trim().startsWith('{')) {
          try {
            bodyKeys = Object.keys(JSON.parse(item.postData))
          } catch {
            bodyKeys = ['(JSON 解析失败)']
          }
        } else if (item.postData !== null) {
          bodyKeys = [...new Set(item.postData.split('&').map((pair) => pair.split('=')[0] ?? ''))]
        }
        return { method: item.method, url: item.url.slice(0, 300), query, bodyKeys }
      })
      clicks.push({ label, found, urlAfter: page.url(), fresh })
    }

    const blocked =
      /登录|登陆|扫码|验证码|安全验证|滑动|拖动|拦截/.test(`${title} ${bodyText.slice(0, 600)}`) &&
      bodyText.length < 1_200
        ? bodyText.slice(0, 200)
        : null

    return {
      platformId: spec.id,
      probeUrl: url,
      needsLogin: spec.needsLogin === true,
      gotoError,
      finalUrl,
      title,
      blockedHint: blocked,
      bodyTextHead: bodyText.slice(0, 1_200),
      panelCount: panels.length,
      panels,
      globals,
      inlineScripts,
      storage,
      clicks,
      variants,
      consoleErrors: consoleErrors.slice(0, 10),
      requests,
    }
  } finally {
    await context.close().catch(() => undefined)
  }
}

async function main(): Promise<void> {
  const only = argOf('platforms')
  const headful = process.argv.includes('--headful')
  const specs = only === undefined ? SPECS : SPECS.filter((item) => only.split(',').includes(item.id))
  if (specs.length === 0) {
    console.error(`没有匹配的平台：${String(only)}。可选：${SPECS.map((s) => s.id).join(' / ')}`)
    process.exit(2)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)

  for (const spec of specs) {
    const started = Date.now()
    process.stdout.write(`[probe-filters] ${spec.id} … `)
    let report: Record<string, unknown>
    try {
      report = await probeOne(spec, headful)
    } catch (error) {
      report = { platformId: spec.id, fatal: error instanceof Error ? error.message : String(error) }
    }
    const file = join(OUT_DIR, `${spec.id}-${stamp}.json`)
    writeFileSync(file, JSON.stringify(report, null, 2), 'utf8')
    const reqs = Array.isArray(report['requests']) ? (report['requests'] as CapturedRequest[]) : []
    const params = new Set<string>()
    for (const req of reqs) {
      if (req.postData === null) continue
      for (const pair of req.postData.split('&')) params.add(pair.split('=')[0] ?? '')
    }
    console.log(
      `完成（${String(Math.round((Date.now() - started) / 1000))}s）· 响应 ${String(reqs.length)} 条 · ` +
        `面板 ${String(report['panelCount'] ?? 0)} 个 · ` +
        `标题 ${String(report['title'] ?? '').slice(0, 40)}` +
        (report['blockedHint'] === null || report['blockedHint'] === undefined ? '' : ' · ⚠️ 疑似墙'),
    )
    if (params.size > 0) console.log(`   POST 参数：${[...params].slice(0, 40).join(', ')}`)
    const storage = Array.isArray(report['storage']) ? (report['storage'] as Array<Record<string, unknown>>) : []
    if (storage.length > 0) {
      console.log(
        `   localStorage 键（${String(storage.length)} 个）：${storage
          .map((item) => String(item['key']))
          .slice(0, 14)
          .join(',')}`,
      )
    }
    const inline = Array.isArray(report['inlineScripts'])
      ? (report['inlineScripts'] as Array<Record<string, unknown>>)
      : []
    for (const item of inline) {
      console.log(
        `   内联脚本「${String(item['marker'])}」：${String(item['length'])} 字符 · positionList=${String(item['hasPositionList'])}`,
      )
    }
    const variants = Array.isArray(report['variants']) ? (report['variants'] as Array<Record<string, unknown>>) : []
    for (const variant of variants) {
      const counts = (variant['counts'] ?? {}) as Record<string, number>
      const summary = Object.entries(counts)
        .map(([selector, count]) => `${selector}=${String(count)}`)
        .join(' · ')
      console.log(
        `   URL 变体「${String(variant['label'])}」：正文 ${String(variant['textLength'])} 字 · ${summary}`,
      )
    }
    const clicks = Array.isArray(report['clicks']) ? (report['clicks'] as Array<Record<string, unknown>>) : []
    for (const click of clicks) {
      const fresh = Array.isArray(click['fresh']) ? (click['fresh'] as Array<Record<string, unknown>>) : []
      if (click['found'] !== true) {
        console.log(`   点击「${String(click['label'])}」：页面上没找到这个文案`)
        continue
      }
      const keys = new Set<string>()
      for (const item of fresh) {
        for (const key of (item['query'] as string[]) ?? []) keys.add(`?${key}`)
        for (const key of (item['bodyKeys'] as string[]) ?? []) keys.add(key)
      }
      console.log(
        `   点击「${String(click['label'])}」：新请求 ${String(fresh.length)} 条 · 键 ${[...keys].slice(0, 18).join(',') || '（无）'}`,
      )
    }
  }
  console.log(`报告目录：${OUT_DIR}`)
}

await main()
