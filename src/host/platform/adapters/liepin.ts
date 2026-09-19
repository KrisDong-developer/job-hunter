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
 */
import type { BlockKind, CoreField } from '../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../pacing.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

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
  cityCodes: {
    // 全国 = **不带城市参数**（最像真人默认进入）。接口采样证据：无 city 时站点自己发
    // `city=410&dq=410` —— 410 是平台的**全国码**，而这里留空是「不带参数」这个约定，
    // 两者不是一回事（`gotoSearch` 在算接口请求体时才把空兜成 410）。
    //
    // 其余 370 个城市码**全部实测**（2026-09-19 逐省点开「请选择城市」弹窗采得，
    // 原始数据 + 采样方式 + 三个坑见 `test/fixtures/liepin-city-codes.json`），
    // **不是抄第三方的"猎聘城市码表"** —— 未经验证的码会把用户搜到别的城市去。
    全国: '',
    // 直辖市（它们本身就是市级码：弹窗里点开得到 0 个市，因为不再往下分）
    北京: '010',
    上海: '020',
    天津: '030',
    重庆: '040',
    // 河北
    石家庄: '140020',
    保定: '140030',
    张家口: '140090',
    承德: '140040',
    沧州: '140110',
    唐山: '140080',
    廊坊: '140060',
    衡水: '140120',
    秦皇岛: '140070',
    邯郸: '140050',
    雄安新区: '140180',
    邢台: '140100',
    // 山西
    太原: '260020',
    阳泉: '260070',
    长治: '260060',
    晋城: '260080',
    朔州: '260090',
    晋中: '260100',
    运城: '260050',
    忻州: '260110',
    临汾: '260040',
    吕梁: '260120',
    大同: '260030',
    // 辽宁
    大连: '210040',
    沈阳: '210020',
    抚顺: '210060',
    本溪: '210070',
    丹东: '210080',
    锦州: '210090',
    营口: '210100',
    阜新: '210110',
    辽阳: '210120',
    盘锦: '210130',
    铁岭: '210140',
    朝阳: '210150',
    葫芦岛: '210050',
    鞍山: '210030',
    // 吉林
    长春: '190020',
    白山: '190070',
    松原: '190080',
    白城: '190090',
    延边: '190110',
    吉林: '190030',
    四平: '190040',
    辽源: '190050',
    通化: '190060',
    // 黑龙江
    哈尔滨: '160020',
    佳木斯: '160040',
    七台河: '160110',
    牡丹江: '160050',
    黑河: '160120',
    绥化: '160130',
    大兴安岭: '160140',
    齐齐哈尔: '160060',
    鸡西: '160070',
    鹤岗: '160080',
    双鸭山: '160090',
    大庆: '160030',
    伊春: '160100',
    // 江苏
    苏州: '060080',
    南京: '060020',
    淮安: '060140',
    盐城: '060150',
    扬州: '060120',
    镇江: '060130',
    泰州: '060160',
    宿迁: '060170',
    无锡: '060100',
    徐州: '060110',
    常州: '060040',
    南通: '060070',
    连云港: '060060',
    // 浙江
    杭州: '070020',
    台州: '070070',
    丽水: '070110',
    宁波: '070030',
    温州: '070040',
    嘉兴: '070090',
    湖州: '070080',
    绍兴: '070050',
    金华: '070060',
    衢州: '070100',
    舟山: '070120',
    // 安徽
    合肥: '080020',
    亳州: '080150',
    池州: '080160',
    宣城: '080170',
    芜湖: '080050',
    蚌埠: '080040',
    淮南: '080060',
    马鞍山: '080070',
    淮北: '080080',
    铜陵: '080090',
    安庆: '080030',
    黄山: '080100',
    滁州: '080110',
    阜阳: '080120',
    宿州: '080130',
    六安: '080140',
    // 福建
    福州: '090020',
    厦门: '090040',
    莆田: '090060',
    三明: '090070',
    泉州: '090030',
    漳州: '090050',
    南平: '090080',
    龙岩: '090090',
    宁德: '090100',
    // 江西
    南昌: '200020',
    萍乡: '200100',
    九江: '200030',
    新余: '200110',
    鹰潭: '200120',
    赣州: '200040',
    吉安: '200060',
    宜春: '200050',
    抚州: '200080',
    上饶: '200070',
    景德镇: '200090',
    // 山东
    济南: '250020',
    枣庄: '250140',
    东营: '250040',
    烟台: '250120',
    潍坊: '250110',
    济宁: '250050',
    泰安: '250090',
    威海: '250100',
    日照: '250080',
    临沂: '250060',
    德州: '250030',
    聊城: '250160',
    滨州: '250150',
    青岛: '250070',
    菏泽: '250170',
    淄博: '250130',
    // 河南
    郑州: '150020',
    商丘: '150050',
    开封: '150030',
    信阳: '150180',
    洛阳: '150040',
    周口: '150150',
    驻马店: '150160',
    平顶山: '150070',
    济源: '150190',
    安阳: '150060',
    鹤壁: '150140',
    新乡: '150080',
    焦作: '150090',
    濮阳: '150100',
    许昌: '150110',
    漯河: '150120',
    三门峡: '150130',
    南阳: '150170',
    // 湖北
    武汉: '170020',
    黄冈: '170110',
    咸宁: '170130',
    随州: '170140',
    恩施州: '170180',
    仙桃: '170150',
    潜江: '170060',
    天门: '170160',
    神农架: '170170',
    黄石: '170090',
    十堰: '170030',
    宜昌: '170050',
    襄阳: '170040',
    鄂州: '170100',
    荆门: '170070',
    孝感: '170120',
    荆州: '170080',
    // 湖南
    长沙: '180020',
    永州: '180130',
    怀化: '180140',
    娄底: '180120',
    湘西: '180150',
    株洲: '180040',
    湘潭: '180030',
    衡阳: '180060',
    邵阳: '180100',
    岳阳: '180090',
    常德: '180050',
    张家界: '180110',
    益阳: '180070',
    郴州: '180080',
    // 广东
    广州: '050020',
    深圳: '050090',
    惠州: '050060',
    梅州: '050190',
    汕尾: '050200',
    河源: '050210',
    阳江: '050160',
    清远: '050070',
    东莞: '050040',
    韶关: '050170',
    中山: '050130',
    珠海: '050140',
    潮州: '050030',
    揭阳: '050220',
    汕头: '050080',
    云浮: '050230',
    佛山: '050050',
    江门: '050150',
    湛江: '050110',
    茂名: '050180',
    肇庆: '050120',
    // 广西
    梧州: '110070',
    北海: '110030',
    防城港: '110100',
    钦州: '110120',
    贵港: '110150',
    玉林: '110060',
    百色: '110110',
    贺州: '110130',
    河池: '110140',
    来宾: '110090',
    崇左: '110080',
    南宁: '110020',
    柳州: '110050',
    桂林: '110040',
    // 海南
    海口: '130020',
    三亚: '130030',
    三沙: '130040',
    儋州: '130090',
    五指山: '130110',
    琼海: '130070',
    文昌: '130060',
    万宁: '130080',
    东方: '130100',
    定安县: '130120',
    屯昌县: '130130',
    澄迈县: '130140',
    临高县: '130150',
    白沙县: '130180',
    昌江县: '130190',
    乐东县: '130200',
    陵水县: '130210',
    保亭县: '130170',
    琼中县: '130160',
    // 四川
    成都: '280020',
    南充: '280130',
    眉山: '280140',
    宜宾: '280070',
    广安: '280150',
    达州: '280160',
    雅安: '280170',
    巴中: '280180',
    自贡: '280080',
    资阳: '280190',
    阿坝: '280220',
    攀枝花: '280090',
    泸州: '280040',
    甘孜: '280210',
    德阳: '280100',
    绵阳: '280050',
    凉山: '280230',
    广元: '280110',
    遂宁: '280120',
    内江: '280060',
    乐山: '280030',
    // 贵州
    贵阳: '120020',
    遵义: '120030',
    安顺: '120050',
    毕节: '120060',
    铜仁: '120070',
    黔西南: '120080',
    黔东南: '120090',
    黔南: '120100',
    六盘水: '120040',
    // 云南
    昆明: '310020',
    丽江: '310040',
    普洱: '310090',
    临沧: '310100',
    楚雄州: '310150',
    红河: '310110',
    文山州: '310120',
    西双版纳: '310130',
    大理州: '310030',
    德宏: '310140',
    怒江: '310160',
    迪庆: '310170',
    曲靖: '310060',
    玉溪: '310050',
    保山: '310070',
    昭通: '310080',
    // 陕西
    西安: '270020',
    汉中: '270070',
    榆林: '270110',
    安康: '270080',
    商洛: '270090',
    杨凌: '270120',
    铜川: '270050',
    宝鸡: '270030',
    咸阳: '270040',
    渭南: '270060',
    延安: '270100',
    // 甘肃
    兰州: '100020',
    临夏: '100140',
    甘南: '100150',
    嘉峪关: '100030',
    金昌: '100050',
    白银: '100060',
    天水: '100070',
    武威: '100090',
    张掖: '100080',
    平凉: '100120',
    酒泉: '100040',
    庆阳: '100130',
    定西: '100100',
    陇南: '100110',
    // 青海
    西宁: '240020',
    海东: '240030',
    海北: '240050',
    黄南: '240060',
    海南州: '240070',
    果洛: '240080',
    玉树: '240090',
    海西: '240040',
    // 西藏
    昌都: '290060',
    林芝: '290040',
    山南: '290050',
    那曲: '290070',
    阿里: '290080',
    拉萨: '290020',
    日喀则: '290030',
    // 宁夏
    银川: '230020',
    石嘴山: '230030',
    吴忠: '230040',
    固原: '230050',
    中卫: '230060',
    // 新疆
    博尔塔拉: '300190',
    巴音郭楞: '300180',
    阿克苏: '300060',
    克州: '300170',
    喀什: '300030',
    和田: '300160',
    伊犁: '300050',
    塔城: '300150',
    阿勒泰: '300130',
    石河子: '300080',
    阿拉尔: '300090',
    图木舒克: '300110',
    五家渠: '300100',
    北屯: '300250',
    铁门关: '300260',
    双河: '300220',
    可克达拉: '300230',
    昆玉: '300240',
    胡杨河: '300270',
    乌鲁木齐: '300020',
    新星: '300280',
    克拉玛依: '300040',
    吐鲁番: '300140',
    哈密: '300070',
    昌吉: '300120',
    // 内蒙古
    乌海: '220060',
    赤峰: '220040',
    通辽: '220070',
    鄂尔多斯: '220050',
    呼伦贝尔: '220080',
    巴彦淖尔: '220090',
    乌兰察布: '220100',
    兴安盟: '220110',
    锡盟: '220120',
    阿拉善盟: '220130',
    呼和浩特: '220020',
    包头: '220030',
  },
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
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null {
  let cityCode: string | undefined
  if (criteria.city !== undefined && criteria.city !== '') {
    cityCode = config.cityCodes[criteria.city]
    if (cityCode === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (cityCode !== undefined && cityCode !== '') {
    params.set(config.urlParams.cityParam, cityCode)
    params.set(config.urlParams.cityAliasParam, cityCode)
  }
  // criteria.page 是 1 起；猎聘 currentPage 是 0 起（get_jobs 实测首页为 0）。
  const page = criteria.page === undefined ? 1 : criteria.page
  params.set(config.urlParams.pageParam, String(Math.max(0, page - 1)))

  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown> {
  const page = criteria.page === undefined ? 1 : criteria.page
  const form: Record<string, unknown> = {
    city: cityCode,
    dq: cityCode,
    pubTime: '',
    currentPage: String(Math.max(0, page - 1)),
    pageSize: 40,
    key: criteria.keyword ?? '',
    suggestTag: '',
    workYearCode: '',
    compId: '',
    compName: '',
    compTag: '',
    industry: '',
    salaryCode: '',
    jobKind: '',
    compScale: '',
    compKind: '',
    compStage: '',
    eduLevel: '',
    salaryLow: '',
    salaryHigh: '',
  }
  return {
    data: {
      mainSearchPcConditionForm: form,
      passThroughForm: { scene: 'init', skId: '', fkId: '', ckId: '' },
    },
  }
}

/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 *
 * ⚠️ 请求头**不是可选的**：少一组 `x-fscp-*` 服务端就回 `{"flag":0,"code":"-1400"}`
 * （HTTP 200！），而调用方会静默回退 DOM —— 见 `LIEPIN_API_HEADERS` 的实测表。
 * 其中三项必须在**页面里现造**（序列化进来的函数不能引用闭包）：
 *   * `x-fscp-trace-id`：每请求一个 UUID（实测服务端不校验其内容，格式对即可）；
 *   * `x-fscp-bi-stat`：`{"location": <当前页 URL>}`；
 *   * `x-fscp-fe-version`：实测是**空字符串**（但必须存在）。
 *
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg: {
  apiPath: string
  body: Record<string, unknown>
  /** 静态头（来自 `LiepinConfig.apiHeaders`；页面函数不能引用模块作用域的东西）。 */
  headers: Record<string, string>
}): Promise<unknown> {
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchImpl !== 'function') return Promise.resolve(null)

  const uuid = ((): string => {
    const cryptoImpl = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID()
    // 退化形态：**保持 UUID 的形状**（实测只验形状，不验出处），别退成别的格式。
    const hex = (length: number): string => {
      let out = ''
      while (out.length < length) out += Math.floor(Math.random() * 16).toString(16)
      return out.slice(0, length)
    }
    return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
  })()

  const headers: Record<string, string> = {
    ...arg.headers,
    'x-fscp-trace-id': uuid,
    'x-fscp-bi-stat': JSON.stringify({ location: (globalThis as { location?: { href?: string } }).location?.href ?? '' }),
    'x-fscp-fe-version': '',
  }

  return fetchImpl(arg.apiPath, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(arg.body),
  })
    .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
    .catch(() => null)
}

/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export function refreshTimeToIso(raw: string): string | null {
  if (!/^\d{14}$/.test(raw)) return null
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export function parseSearchApiResponse(payload: unknown): RawJob[] {
  const out: RawJob[] = []
  if (payload === null || typeof payload !== 'object') return out
  const root = payload as {
    data?: { data?: { jobCardList?: unknown[] }; jobCardList?: unknown[] }
  }
  const cards = root.data?.data?.jobCardList ?? root.data?.jobCardList
  if (!Array.isArray(cards)) return out

  for (const entry of cards) {
    if (entry === null || typeof entry !== 'object') continue
    const item = entry as {
      job?: Record<string, unknown>
      comp?: Record<string, unknown>
    }
    const job = item.job
    const comp = item.comp
    if (job === undefined) continue
    const jobId = job['jobId']
    if (jobId === undefined || jobId === null || String(jobId) === '') continue

    const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
    const refreshIso = refreshTimeToIso(text(job['refreshTime']))
    const labels = job['labels']
    const tags = Array.isArray(labels)
      ? labels.filter((label): label is string => typeof label === 'string' && label !== '').slice(0, 6)
      : undefined

    out.push({
      platformJobId: String(jobId),
      title: text(job['title']),
      salaryRaw: text(job['salary']),
      company: comp === undefined ? '' : text(comp['compName']),
      sourceUrl: text(job['link']),
      city: text(job['dq']),
      expReq: text(job['requireWorkYears']),
      eduReq: text(job['requireEduLevel']),
      industry: comp === undefined ? null : text(comp['compIndustry']) || null,
      companySize: comp === undefined ? null : text(comp['compScale']) || null,
      publishedAt: refreshIso,
      ...(tags === undefined || tags.length === 0 ? {} : { tags }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
 */
export function extractJobsInPage(arg: {
  selectors: LiepinSelectors
  salaryPattern: string
  jobIdPattern: string
  cityPattern: string
  expPattern: string
  eduPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    return out
  }
  if (cards === null) return out

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const salaryRe = compile(arg.salaryPattern)
  const idRe = compile(arg.jobIdPattern)
  const cityRe = compile(arg.cityPattern)
  const expRe = compile(arg.expPattern)
  const eduRe = compile(arg.eduPattern)

  for (const card of Array.from(cards)) {
    let link: Element | null = null
    try {
      link = card.querySelector(arg.selectors.jobLink)
    } catch {
      link = null
    }
    // 广告/推荐卡没有职位链接 → 跳过（夹具实测 42 卡中 5 张属于此类）。
    if (link === null) continue

    const href = link.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 相对路径拼不成就原样给，字段断言会兜 */
    }

    const linkText = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim()

    // 标题：优先链接内带 title 属性的节点（文本比 title 属性干净——后者带"招聘"前缀）。
    let title = ''
    try {
      const titleNode = link.querySelector(arg.selectors.titleNode)
      if (titleNode !== null) {
        title = (titleNode.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (title === '') title = (titleNode.getAttribute('title') ?? '').trim()
      }
    } catch {
      title = ''
    }
    if (title === '') {
      // 兜底：链接文本截到第一个【或数字（薪资/城市）之前。
      const head = /[【\d]/.exec(linkText)
      title = head !== null ? linkText.slice(0, head.index).trim() : linkText.slice(0, 40).trim()
    }
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    const cityMatch = cityRe !== null ? cityRe.exec(linkText) : null
    const city = cityMatch !== null ? (cityMatch[1] ?? '').trim() : ''

    const salaryMatch = salaryRe !== null ? salaryRe.exec(cardText) : null
    const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : ''

    const expMatch = expRe !== null ? expRe.exec(linkText) : null
    const expReq = expMatch !== null ? (expMatch[1] ?? '') : ''
    const eduMatch = eduRe !== null ? eduRe.exec(linkText) : null
    const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : ''

    // 公司盒：span 文本按顺序是 公司名 / 行业 / 规模（夹具实测；logo 是 img 不干扰）。
    let company = ''
    let industry: string | null = null
    let companySize: string | null = null
    try {
      const box = card.querySelector(arg.selectors.companyInfoBox)
      if (box !== null) {
        const spans = Array.from(box.querySelectorAll('span'))
          .map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter((text) => text !== '')
        company = spans[0] ?? ''
        industry = spans[1] ?? null
        companySize = spans[2] ?? null
      }
    } catch {
      company = ''
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobIdPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(industry === null ? {} : { industry }),
      ...(companySize === null ? {} : { companySize }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
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
const LIEPIN_BLOCK_SIGNALS = {
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
} as const

const LIEPIN_BLOCK_FLAGS = { blankOnAboutProtocol: true, skipLoginWall: true } as const

/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export function hasNextPageInPage(arg: {
  pagination: string
  nextPage: string
  disabledClass: string
}): boolean {
  try {
    const box = document.querySelector(arg.pagination)
    if (box === null) return false
    const next = box.querySelector(arg.nextPage)
    if (next === null) return false
    const cls = next.getAttribute('class') ?? ''
    return !cls.includes(arg.disabledClass)
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**解析职位详情页（2026-09-18 探针真实夹具校准）。
 *
 * ⚠️ 必须完全自包含（会被序列化送进浏览器执行）。
 *
 * 与其它平台的关键差别：猎聘详情页是 **SSR 直出** —— JD 正文就在 DOM 里
 * （`section.job-intro-container` 中 `dt=职位介绍` 那块 `dd`，实测 1074 字），
 * **未登录也读得到**，不需要像智联那样从 `__INITIAL_STATE__` 挖载荷。
 * 薪资也**不做正则匹配**：详情页有明确的 `.salary` 节点（列表页才需要文本模式）。
 *
 * 为什么用 `dt` 的**文案**当锚点：同一个容器里有多个 `dl`，只有「职位介绍」
 * 那块是正文，其余是「其他信息」（语言/行业/部门要求）—— 按类名取会取错块。
 */
export function extractJobDetailInPage(arg: {
  selectors: LiepinSelectors
  expPattern: string
  eduPattern: string
}): RawJobDetail {
  const clean = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }

  const title = textOf(queryOne(arg.selectors.detailTitle))
  const salaryRaw = textOf(queryOne(arg.selectors.detailSalary)).replace(/\s+/g, '')

  // 关键信息行：「佛山-顺德区 5年以上 本科 招5人 9月17日更新」
  const properties = textOf(queryOne(arg.selectors.detailProperties))
  const city = properties.split(/\s+/)[0] ?? ''
  const expMatch = compile(arg.expPattern)?.exec(properties) ?? null
  const eduMatch = compile(arg.eduPattern)?.exec(properties) ?? null

  // 公司名：详情页的「公司信息」卡片（列表页那套三段式公司盒在详情页只出现在推荐位）
  const company = textOf(queryOne(arg.selectors.detailCompany))

  // JD 正文：遍历「职位介绍」那块 dl 的 dd，排除 .ellipsis-1（那是「其他信息」的条目）
  let jdText = ''
  const section = queryOne(arg.selectors.detailIntroSection)
  if (section !== null) {
    for (const dl of Array.from(section.querySelectorAll('dl'))) {
      const dt = dl.querySelector('dt')
      if (clean(dt === null ? '' : dt.textContent) !== arg.selectors.detailIntroTitleText) continue
      const parts: string[] = []
      for (const dd of Array.from(dl.querySelectorAll('dd'))) {
        if ((dd.getAttribute('class') ?? '').includes('ellipsis-1')) continue
        const text = clean(dd.textContent)
        if (text !== '') parts.push(text)
      }
      if (parts.length > 0) {
        jdText = parts.join('\n')
        break
      }
    }
  }

  const notes: string[] = []
  if (jdText === '') notes.push('JD 未锚定（detailIntroSection / detailIntroTitleText 待校准）')
  if (title === '') notes.push('详情标题未锚定，待校准')
  if (company === '') notes.push('详情公司名未锚定，待校准')

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company,
    // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
    sourceUrl: location.href,
    ...(city === '' ? {} : { city }),
    ...(expMatch === null ? {} : { expReq: expMatch[1] ?? '' }),
    ...(eduMatch === null ? {} : { eduReq: eduMatch[1] ?? '' }),
    ...(jdText === '' ? {} : { jdText }),
    ...(notes.length === 0 ? {} : { notes }),
  }
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据来自两份真实快照的对比（2026-09-19）——
 * 匿名夹具（`test/fixtures/liepin-search.html`，全新 profile 抓的）
 * vs 登录态捕获（`.probe-liepin-capture/liepin-walk-01-search.html`）：
 *
 * | 信号 | 未登录 | 已登录 |
 * |---|---|---|
 * | `#header-quick-menu-user-info`（`loggedInMarker`） | 无 | **有** |
 * | `.header-quick-menu-not-login-item`（`notLoggedInMarker`） | **有** | 无 |
 *
 * ⚠️ 两个都**不能**用文案判：「登录/注册」在匿名页出现 2 次、登录页 0 次，看着也能用，
 * 但文案一变就静默失效（本仓库有明文纪律：只认结构性信号）。
 *
 * 两个标记都不在 ⇒ 返回 `null`（**判不出来**），由调用方决定怎么落地 ——
 * 适配器里按 `false` 处理（保守：宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export function isLoggedInInPage(arg: { loggedInMarker: string; notLoggedInMarker: string }): boolean | null {
  const has = (selector: string): boolean => {
    if (selector === '') return false
    try {
      return document.querySelector(selector) !== null
    } catch {
      return false
    }
  }
  if (has(arg.loggedInMarker)) return true
  if (has(arg.notLoggedInMarker)) return false
  return null
}

export interface LiepinAdapterOptions {
  config?: LiepinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先；高斯 + 犹豫见 pacing.ts）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造猎聘适配器。 */
export function createLiepinAdapter(options: LiepinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_LIEPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

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
