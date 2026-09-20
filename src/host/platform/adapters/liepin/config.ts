/**
 * 猎聘适配器的配置面：选择器接口、URL 参数映射、配置接口、`DEFAULT_LIEPIN_CONFIG` 与
 * `mergeLiepinConfig`、正则与码表常量、判墙信号常量 —— 纯数据 + 纯函数，不碰 `document`。
 *
 * 城市码表因体量单独成文件（`./codes.ts`）。完整实测记录见 `./index.ts` 文件头。
 */
import { LIEPIN_CITY_CODES } from './codes.js'

/** 结构锚点集（2026-09-18 由 v8 探针真实夹具校准）。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface LiepinSelectors {
  /** 卡片容器（get_jobs 生产验证 + 夹具确认：`div._40108Nrnc3.job-card-pc-container`）。 */
  card: string
  /**
   * 职位链接：猎聘给语义属性 `data-nick="job-detail-job-info"`（比 href 更精确，
   * 夹具确认每张真职位卡恰好一条；广告卡没有）。标题/薪资/经验/学历都在这个链接内。
   */
  jobLink: string
  /** 公司信息盒：`data-nick="job-detail-company-info"`，内含公司名/行业/规模三个 span。 */
  companyInfoBox: string
  /** 标题节点：链接内带 title 属性的 div（夹具：`<div class="ellipsis-1" title="招聘Java工程师">`）。 */
  titleNode: string
  /** 分页容器（AntD）。 */
  pagination: string
  /** 「下一页」按钮所在 li（get_jobs 生产验证）。 */
  nextPage: string
  /** 「下一页」disabled 的类名标记。 */
  nextPageDisabledClass: string
  /**
   * ── 详情页（2026-09-18 详情探针夹具 `liepin-detail.html` 校准）──────
   * 详情页是 SSR 直出（真实文本就在 DOM 里），未登录也能读到 JD 正文。
   */
  /** 职位名（详情页）。 */
  detailTitle: string
  /** 薪资。**必须限定在 `.name-box` 内** —— 裸 `.salary` 会命中侧栏推荐岗位。 */
  detailSalary: string
  /** 关键信息行：「佛山-顺德区 5年以上 本科 招5人 9月17日更新」。 */
  detailProperties: string
  /**
   * 公司名（详情页）。取 `公司信息` 侧栏卡片里的名字节点。
   *
   * ⚠️ **不能复用列表页的 `job-detail-company-info`**：夹具里这个 `data-nick`
   * 在详情页出现 20 次，**全部**落在 `section.love-job-container`（「猜你喜欢」
   * 推荐位），第一个命中是别家公司的岗位卡 —— 会静默把公司名写错。
   */
  detailCompany: string
  /** JD 所在容器（语义类名，SSR 输出）。 */
  detailIntroSection: string
  /**
   * JD 所在块的 `dt` 文案。**用文案当锚点而不是类名**：同一容器里有多个 `dl`，
   * 只有 `dt=职位介绍` 那块是正文，其余是「其他信息」（语言/行业/部门要求）。
   */
  detailIntroTitleText: string
  /**
   * ── 登录态标记（2026-09-19 由两份快照对比定案）─────────────────────
   * 只认**结构性信号**，不认文案 —— 文案会改，而且「登录/注册」这类字样在页脚也可能出现。
   */
  /** **已登录**才有：页头「你好，<名字>」+ 头像那个下拉（`id` 是 `header-quick-menu-user-info`）。 */
  loggedInMarker: string
  /**
   * **未登录**才有：`.header-quick-menu-not-login-item`（类名自带 `not-login` 语义）。
   *
   * ⚠️ 别把它和已登录态的 `class="header-quick-menu-login"`（页头快捷菜单容器）搞混 ——
   * 后者**没有** `not-`，而且**未登录页里存在的是 `id="header-quick-menu-login"`（登录链接那个 span）**。
   * 一字之差、id 与 class 含义相反，差点写错。
   */
  notLoggedInMarker: string
}

/** 字段 → URL 参数映射（get_jobs `getSearchUrl()` 同款：city 与 dq 双参数）。 */
export interface LiepinUrlParams {
  base: string
  keywordParam: string
  cityParam: string
  cityAliasParam: string
  /** 页码参数（**0 起**；本项目的 criteria.page 是 1 起，构造时换算）。 */
  pageParam: string
}

export interface LiepinConfig {
  selectors: LiepinSelectors
  urlParams: LiepinUrlParams
  /**
   * 城市名 → 平台城市码（**370 个实测值**，2026-09-19 逐省点开「请选择城市」弹窗采得）。
   *
   * ⚠️ 这份表**一次都不要靠猜**：错一个码就会把用户搜到另一个城市去，而且看不出来。
   * 采样方式、原始数据与三个坑见 `test/fixtures/liepin-city-codes.json`；
   * 重新采样跑 `npm run probe:liepin-chat`。
   *
   * `全国` → 空串 = **不带城市参数**（平台自己的全国码是 410，两者不是一回事）。
   * 未列出的城市 `buildSearchUrl` 返回 null（入口层拒绝）—— 单测会检查这里的城市
   * 都在跨平台城市目录 `CITY_DIRECTORY` 里。
   */
  cityCodes: Record<string, string>
  /**
   * 搜索接口的**静态请求头**（2026-09-19 逐组削减实测出的最小充分集，见 `LIEPIN_API_HEADERS`）。
   *
   * 为什么放进配置：其中 `x-fscp-std-info` 的 `client_id` 与 `x-fscp-version` 是**前端版本号**
   * 一类的值，猎聘发版就可能变。DB 覆盖（`adapter-config`）能在不改代码的前提下补上，
   * 探针 `npm run probe:liepin-chat` 会在线复验这套头是否还有效。
   */
  apiHeaders: Record<string, string>
  /** 薪资文本模式（字符串形态，会序列化进页面）。 */
  salaryPattern: string
  /** 职位链接里抠平台 id 的模式。 */
  jobIdPattern: string
  /** 城市模式：猎聘把城市包在【】里（夹具实测：`Java工程师【佛山-顺德区】急聘…`）。 */
  cityPattern: string
  /** 经验词模式（链接文本尾部匹配，夹具实测如「5年以上」）。 */
  expPattern: string
  /** 学历词模式（夹具实测如「本科」）。 */
  eduPattern: string
  /**
   * v2 接口化解析（P1）：非空时 `readListPage` 先在页面上下文里 POST 搜索接口，
   * 失败/为空自动回退 DOM 解析（双通道，永不比 v1 差）。
   * ⚠️ 请求体里的 `ckId` 透传字段留空 —— 真实页面会带会话 ckId，留空是否被
   * 服务端接受**待下次真实抓取验证**；不接受也无妨，会静默走 DOM 通道。
   */
  searchApiOrigin: string
  searchApiPath: string
  /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
  searchApiEnabled: boolean
}

export const LIEPIN_SALARY_PATTERN =
  '\\d+(?:\\.\\d+)?\\s*[-~]\\s*\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*[kK万]\\s*以上|面议'

/** 岗位链接形态（夹具实测两种并存）：`/job/<纯数字>.shtml`（普通岗）与
 * `/a/<纯数字>.shtml`（Agent/劳务类岗，如「测试工程师（不要Java）」）。
 * 两者都是真实职位，都要收。
 */
export const LIEPIN_JOB_ID_PATTERN = '/(?:job|a)/(\\d+)\\.shtml'

/**
 * 搜索接口（v2 接口化解析，2026-09-18 采样）：
 * `POST https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`。
 * 响应比 DOM 富（labels/refreshTime/compId/recruiter），refreshTime 让
 * publishedAt 首次可用。请求体结构来自真实采样（见 fixtures/liepin-search-api.json）。
 */
export const LIEPIN_SEARCH_API_PATH = '/api/com.liepin.searchfront4c.pc-search-job'

/**
 * 搜索接口的**静态请求头** —— 2026-09-19 用"逐组削减"实测出的最小充分集。
 *
 * ## 为什么这份常量必须存在（真踩过）
 *
 * `readListPage` 是**双通道**（接口优先、失败静默回退 DOM），而接口这条一度是**死代码**：
 * 当初只带了 `content-type`，服务端一律回 `{"flag":0,"code":"-1400","msg":"出错了（400）！"}`
 * （HTTP 仍是 200），于是**每次都静默回退 DOM**，丢掉了接口独有的
 * `publishedAt`（`refreshTime`）/`industry`/`companySize`/`labels` —— 而且**没有任何信号**。
 *
 * ## 实测（`npm run probe:liepin-chat` 的变体实验，一次只动一个变量）
 *
 * | 请求头 | 结果 |
 * |---|---|
 * | 页面原样（对照组） | `flag=1`，42 条 |
 * | 页面头 + **适配器构造的 body** | `flag=1`，42 条 ⇒ **body 构造没问题**（`ckId` 留空无妨） |
 * | 只有 `content-type` | ❌ `-1400` |
 * | 本常量（六项静态）+ **遥测三项** | `flag=1`，42 条 |
 * | 本常量**不含**遥测三项 | ❌ `-1400` ⇒ **门就是 `x-fscp-*` 这一族的完整性** |
 * | 去掉 `x-xsrf-token` | `flag=1` ⇒ **xsrf 不需要**（所以不必去读任何 cookie） |
 * | 遥测三项改用**自造值**（随机 UUID / 当前页 URL / 空串） | `flag=1` ⇒ 可以自己造 |
 *
 * 结论：**这六项静态头 + 三个自造的 `x-fscp-*`**（见 `fetchListInPage`）就够，
 * 不需要 `x-xsrf-token`、也不需要从页面的请求里抄任何东西。
 *
 * ⚠️ `x-fscp-std-info` 的 `client_id: 40108` 与 DOM 里那串 `_40108cpKKS` 类名前缀**同号**
 * （互相印证这是前端应用号）；`x-fscp-version: 1.1` 与 `client_id` 都是**会随发版变的值**，
 * 所以放在 `LiepinConfig.apiHeaders` 里允许 DB 覆盖。
 */
export const LIEPIN_API_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',
  'x-client-type': 'web',
  'x-fscp-version': '1.1',
  'x-fscp-std-info': '{"client_id": "40108"}',
  'x-requested-with': 'XMLHttpRequest',
}

/** 城市：夹具实测「Java工程师【佛山-顺德区】急聘15-30k·14薪」——【】里就是城市。 */
export const LIEPIN_CITY_PATTERN = '【([^】]{2,15})】'

/** 经验/学历词表（夹具实测位于链接文本尾部，如「5年以上本科」）。 */
export const LIEPIN_EXP_PATTERN = '(\\d+年以上|\\d+年以内|1年以下|经验不限|在校生|应届生)'
export const LIEPIN_EDU_PATTERN = '(本科|硕士|博士|大专|学历不限|中专|高中|MBA|统招本科)'

/**
 * 单次抓取的页数上限。猎聘 antiBot=high，给得比 51job/智联更保守：
 * 默认 3 页、上限 8 页。
 */
export const LIEPIN_DEFAULT_MAX_PAGES = 3
export const LIEPIN_MAX_PAGES = 8

export const DEFAULT_LIEPIN_CONFIG: LiepinConfig = {
  selectors: {
    card: "div[class*='job-card-pc-container']",
    jobLink: "a[data-nick='job-detail-job-info']",
    companyInfoBox: "[data-nick='job-detail-company-info']",
    titleNode: 'div[title]',
    pagination: '.list-pagination-box',
    nextPage: 'li.ant-pagination-next',
    nextPageDisabledClass: 'ant-pagination-disabled',
    // 详情页（2026-09-18 详情探针夹具校准）
    detailTitle: '.job-title',
    detailSalary: '.name-box .salary',
    detailProperties: '.job-properties',
    detailCompany: 'div.company-info-container .company-card .name',
    detailIntroSection: 'section.job-intro-container',
    detailIntroTitleText: '职位介绍',
    // 登录态（2026-09-19：匿名夹具 vs 登录态捕获，各命中 0/1，见 LiepinSelectors 注释）
    loggedInMarker: '#header-quick-menu-user-info',
    notLoggedInMarker: '.header-quick-menu-not-login-item',
  },
  urlParams: {
    base: 'https://www.liepin.com/zhaopin/',
    keywordParam: 'key',
    cityParam: 'city',
    cityAliasParam: 'dq',
    pageParam: 'currentPage',
  },
  cityCodes: LIEPIN_CITY_CODES,
  salaryPattern: LIEPIN_SALARY_PATTERN,
  jobIdPattern: LIEPIN_JOB_ID_PATTERN,
  cityPattern: LIEPIN_CITY_PATTERN,
  expPattern: LIEPIN_EXP_PATTERN,
  eduPattern: LIEPIN_EDU_PATTERN,
  apiHeaders: LIEPIN_API_HEADERS,
  searchApiOrigin: 'https://api-c.liepin.com',
  searchApiPath: LIEPIN_SEARCH_API_PATH,
  searchApiEnabled: true,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLiepinConfig(override: unknown): LiepinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_LIEPIN_CONFIG
  const patch = override as Partial<LiepinConfig>
  const pattern = (key: keyof LiepinConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  return {
    selectors: { ...DEFAULT_LIEPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_LIEPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_LIEPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    salaryPattern: pattern('salaryPattern', DEFAULT_LIEPIN_CONFIG.salaryPattern),
    jobIdPattern: pattern('jobIdPattern', DEFAULT_LIEPIN_CONFIG.jobIdPattern),
    cityPattern: pattern('cityPattern', DEFAULT_LIEPIN_CONFIG.cityPattern),
    expPattern: pattern('expPattern', DEFAULT_LIEPIN_CONFIG.expPattern),
    eduPattern: pattern('eduPattern', DEFAULT_LIEPIN_CONFIG.eduPattern),
    // 按 key 浅合并：发版变了只需要覆盖变的那一两个头，不必整份重写。
    apiHeaders: { ...DEFAULT_LIEPIN_CONFIG.apiHeaders, ...(patch.apiHeaders ?? {}) },
    searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LIEPIN_CONFIG.searchApiOrigin),
    searchApiPath: pattern('searchApiPath', DEFAULT_LIEPIN_CONFIG.searchApiPath),
    searchApiEnabled:
      typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LIEPIN_CONFIG.searchApiEnabled,
  }
}

/**
 * 猎聘特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 *   * 验证码：多出 `.geetest_box` / `#nc_1_wrapper`（探针实测的极验容器），
 *     以及阿里云 WAF 的 `waf-nc-title` + `aliyunwaf_` 脚本名；
 *   * `blankOnAboutProtocol`：风控命中时 `security.min.js` 会
 *     `location.replace('about:blank')` **把页面销毁** —— 那不是文案也不是 DOM 特征，
 *     是结构性判据，所以只能是开关；
 *   * `skipLoginWall`：猎聘的登录墙文案**尚无实测证据**，原实现明确写着"不判"
 *     （宁可让 blank / 0 条暴露，也不猜）。这里把它变成**显式开关** ——
 *     不判也是一种决定，要写出来，而不是靠"通用词表里恰好没有它要的词"。
 */
export const LIEPIN_BLOCK_SIGNALS = {
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
} as const

export const LIEPIN_BLOCK_FLAGS = { blankOnAboutProtocol: true, skipLoginWall: true } as const
