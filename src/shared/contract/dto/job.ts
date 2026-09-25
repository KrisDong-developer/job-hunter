

import type { CompanyOrderValue, FreshnessLevel, JobFlagType, JobOrderValue, JobState } from '../enums/job.js'
import type { ApplicationStage, ContactStage } from '../enums/pipeline.js'

/**
 * job 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */

export interface JobDto {
  id: number
  platformId: string
  /**
   * 平台显示名（服务端 JOIN 出来的）。
   *
   * 界面必须能回答"这条是从哪个平台来的"：同一个岗位横跨多个平台本身就是判断依据
   * （谁在批量转载、哪家平台信息更准）。`null` = 平台表里没有这一行（历史数据或平台已卸载），
   * 那时退回显示 `platformId`。
   */
  platformName: string | null
  platformJobId: string
  title: string
  companyId: number | null
  companyName: string | null
  salaryRaw: string
  salaryMin: number | null
  salaryMax: number | null
  salaryMonths: number | null
  city: string
  district: string
  expReq: string
  eduReq: string
  tags: string[]
  sourceUrl: string
  publishedAt: string | null
  firstSeenAt: string
  lastSeenAt: string
  /**
   * **这条记录被抓取入库的时间**。
   *
   * 与 `lastSeenAt` 是两个不同的问题：后者回答"这岗还在招吗"（新鲜度），
   * 前者回答"我这份库里的这条是什么时候拿到的"（数据来路）。
   * 界面上的用途是把来源与时间放在一起 —— 用户看到"某平台 · 抓取于 3 小时前"，
   * 才知道这条信息的时效边界在哪。
   *
   * 列表默认排序（`orderBy: 'crawled_at'`）用的就是这一列，但它在界面上从来没露过面：
   * 用户看到的是"按抓取时间"排出来的顺序，却指不出哪一列是抓取时间。
   */
  crawledAt: string
  state: JobState
  /**
   * **第一次打开这条详情的时间**（`null` = 从没打开过）。
   *
   * 与 `state` 分工明确：`readAt` 是**事实**（我看过它了，自动记的），
   * `state` 是**决定**（收藏 / 忽略 / 归档，只有显式动作才改）。
   * 界面上"新"的判据是 `state === 'new' && readAt === null`；
   * 一旦读过，`state` 会被自动推到 `'seen'`（只在 `new` 时），徽章随之安静下来。
   *
   * 为什么不让模型读一下就写：`job_detail` 是**模型替你看**，不等于你看过。
   */
  readAt: string | null
  /** L1 粗筛分（0-100）。**不是**完整评估，界面上必须标清楚（§4.5.1）。 */
  matchScore: number | null
  /** 算这个分时用的是哪一版简历、哪个 rev（§4.1）。 */
  scoreRev: number
  scoreResumeId: number | null
  /**
   * 这个分是不是**过期**了 —— 简历改过之后，旧分数必须被标出来而不是继续用。
   *
   * §4.1 把这条列为"最容易出的看起来对、其实全错的 bug"：分数还是那个分数，
   * 但它已经不是在评价当前这份简历了。
   */
  scoreStale: boolean
  /** 命中的标注类型；完整依据在详情里。 */
  flagTypes: JobFlagType[]
  /**
   * 跨平台去重分组 id（§4.10.1）。`null` = 它没有被判定为"另一个平台的同一个岗位"。
   *
   * 有了它，列表才能**按组折叠**（同一条岗位在 4 个平台各抓一条时只占一行），
   * 而不是让用户在一屏里看到四条几乎一样的卡片。
   */
  dedupGroupId: number | null
  /**
   * 接触态（§12.2）—— `none` = 还没有任何打招呼记录。
   *
   * 之前只有详情能回答"这条打过招呼没有"（详情单独调 `GET /jobs/:id/history`）。
   * 列表也要能回答：**打招呼与投递是不可逆的对外动作**，行内给了按钮就必须能
   * 显示"已经发过了"，否则一屏几十行里重复发是迟早的事。
   */
  contactStage: ContactStage
  /**
   * 最近一次投递的阶段（§12.1）—— `null` = 没投过。
   *
   * 与 `contactStage` **刻意分开**：接触态回答"有没有接触上"（含手工标记），
   * 这个回答"简历投出去之后走到哪一步了"。两者是两个状态机，不合并。
   */
  applicationStage: ApplicationStage | null
}

// 界面层用到的 DTO
/** 一页岗位（`GET /jobs`）。 */
export interface JobPageDto {
  items: JobDto[]
  page: number
  pageSize: number
  /** 当前筛选下的总条数（走同一套 WHERE 的 count）。 */
  total: number
  hasMore: boolean
  /**
   * 因为「排除已拉黑公司」而被隐藏的条数（第五轮，批次 B）。
   *
   * 只有请求里带了 `excludeBlacklisted=1` 时才有值（那时它是**同一套筛选条件**
   * 再去掉黑名单条件后的总数之差）。为什么由服务端算而不是前端多请求一次：
   * 一是省一次往返，二是这个数字必须与 `total` 出自同一份条件 ——
   * 两个数字各自算，早晚会出现"隐藏了 3 条，但列表少了 5 条"这种对不上的局面。
   *
   * 它的存在本身就是这条功能的纪律：**可以隐藏，但绝不静默隐藏**。
   */
  hiddenByBlacklist?: number
  /**
   * **全库还没有打开过的岗位数**（`state='new'`）—— 不受当前筛选影响。
   *
   * 为什么是全库口径而不是"当前筛选下的新岗位数"：这个数字要回答的是
   * "我这库里还堆着多少条没扫过"，那是用户决定"现在去扫一遍"的依据；
   * 如果它跟着筛选变，它回答的就成了"我现在看到的这些里有多少条没读"——
   * 而那个问题的答案就在眼前这一屏上，不需要一个数字。
   */
  unread: number
}

/** 岗位库筛选器的**取值集**（`GET /jobs/facets`）。 */
export interface JobFacetsDto {
  /** 出去重后的城市列表（界面多选城市用）。 */
  cities: string[]
  /** 去重后的经验要求取值 —— 平台原始串，不是枚举。 */
  expReqs: string[]
  /** 去重后的学历要求取值 —— 同上。 */
  eduReqs: string[]
}

/** `GET /jobs/:id` 的响应：岗位 + JD 原文 + 标注依据 + 匹配理由 + 所属公司画像。 */
export interface JobDetailDto {
  job: JobDto
  /**
   * JD 原文（岗位职责 / 任职要求）。
   *
   * 只在**详情**里给，不进 `JobDto` 与列表页：原文动辄几千字，列表一次几十条，
   * 塞进去等于把整页响应撑成几兆。
   *
   * `null` 表示**没抓到**（该平台没实现 `detail.extract`，或详情页没命中选择器）——
   * 界面必须如实说"没抓到"，不能拿标签拼一份看起来像 JD 的东西出来。
   */
  jdText: string | null
  /** 标注的完整记录（含依据）。**没有依据的结论不会出现在这里。** */
  flags: JobFlagDto[]
  /** 匹配分的逐条理由（§4.5.1：分数必须可解释）。 */
  matchReasons: Array<{ kind: string; text: string; weight: number }>
  company: CompanyProfileDto | null
}

/** 一条标注（带可读依据）。 */
export interface JobFlagDto {
  flagType: JobFlagType
  score: number
  evidence: string[]
  computedAt: string
}

/** 公司画像（U2 展示用）。 */
export interface CompanyProfileDto {
  id: number
  name: string
  nameNorm: string
  industry: string | null
  size: string | null
  nature: string | null
  jobCount: number
  geoSpread: number
  stackDiversity: number
  onsiteRatio: number | null
  nameKeywordHits: number
  outsourcingScore: number | null
  fraudScore: number | null
  /** 人工标签（复核时打的，不是规则算的）。 */
  manualLabel: string | null
  /**
   * 人工备注（第五轮补上）。
   *
   * 这一格此前**只存在于数据库与导出的 CSV 里**：表里有 `company.note`、
   * `PATCH /companies/:id` 也接受它，但 DTO 不带、界面更看不到 —— 于是
   * "为什么拉黑这家"只能记在别处，而导出的那一列永远是空的。
   */
  note: string | null
  /**
   * 是否被用户人工拉黑。
   *
   * ── 作用范围（第五轮，批次 B 起有变化，务必看清）
   *
   * 它仍然**不会**在服务端被自动过滤：`GET /jobs` 默认照旧返回已拉黑公司的岗位，
   * 因为静默隐藏数据比不隐藏更危险（用户会以为"这条岗位不存在"）。
   * 但界面上「排除已拉黑公司」这个筛选**默认是开着的** —— 也就是说，
   * 用户拉黑一家公司后，岗位库默认不再显示它，而这件事**是看得见的**：
   * 列表头栏会写明"已隐藏 N 条（来自已拉黑公司）"，并且一键可显示回来。
   *
   * 所以这条链路的完整口径是：**可以隐藏，但绝不静默隐藏**。
   * 服务端只在收到 `excludeBlacklisted=1` 时才加这个条件（由界面显式传）。
   */
  blacklisted: boolean
}

/** `GET /companies/:id`。 */
export interface CompanyDetailDto {
  company: CompanyProfileDto
  /** 累积的信号（识别依据的留痕）。 */
  signals: Array<{ type: string; weight: number; evidence: unknown; source: string; createdAt: string }>
  /** 该公司在手岗位（有界）。 */
  jobs: JobDto[]
  /** 该公司岗位的标注汇总（类型 → 条数）。 */
  flagCounts: Record<string, number>
  /** 工商补全快照（`POST /companies/:id/enrich` 抓到的天眼查免登录数据；没查过 = 缺省）。 */
  enrichment?: CompanyEnrichmentDto
}

/**
 * 工商补全快照（天眼查免登录通道，v13）。
 *
 * 只在**详情**接口返回（列表载荷不带它 —— 列表卡片不需要工商字段，别让每页
 * 50 家公司都驮着这份快照）。`confidence='unmatched'` 的行是"工商库查无此主体"
 * 的留痕（这本身是值得看见的警示），除 provider/fetchedAt 外字段全空。
 *
 * `legalPerson` 是自然人姓名：展示允许，**LLM 外发白名单默认排除**
 * （字段名黑名单拦不住中文人名，外发控制靠调用侧）。
 */
export interface CompanyEnrichmentDto {
  provider: string
  matchedName: string | null
  creditCode: string | null
  confidence: 'exact' | 'manual' | 'unmatched'
  /** 经营状态（存续/注销/吊销…）——「注销/吊销还在招人」是最强的僵尸岗信号。 */
  regStatus: string | null
  estDate: string | null
  regCapital: string | null
  orgType: string | null
  legalPerson: string | null
  industry: string | null
  staffNum: string | null
  /** 风险概览计数（免登录可见的部分；null = 页面上没有这个读数）。 */
  suitCount: number | null
  investCount: number | null
  licenseCount: number | null
  /** 平台标签（新三板/小微企业/瞪羚企业/司法案件…）。 */
  tags: string[]
  sourceUrl: string | null
  fetchedAt: string
}

/** 搜索结果里的一家候选公司（多候选时界面让用户点选，`pickUrl` 原样传回）。 */
export interface EnrichmentCandidateDto {
  name: string
  status: string | null
  creditCode: string | null
  /** 详情页相对链接（`/company/{id}`），点选后作为 `POST …/enrich` 的 `pickUrl` 传回。 */
  url: string
}

/**
 * `GET /companies` 的查询参数（公司维度列表）。
 *
 * 接口是 offset 分页模型（`limit`/`offset`），界面是页码模型 —— 换算在客户端做
 * （`offset = (page-1) * limit`），不为界面单独加 `page` 参数。
 */
export interface CompanyListParams {
  /** 关键词：匹配公司名 / 归一化名 / 别名 / 备注（不区分大小写）。 */
  q?: string
  /** 拉黑状态过滤；不传 = 全部。 */
  blacklisted?: boolean
  /** 人工标签精确匹配；不传 = 全部。 */
  manualLabel?: string
  /** 只保留在手岗位数 ≥ 该值的公司（无画像按 0 算）；不传 = 不限。 */
  minJobCount?: number
  orderBy?: CompanyOrderValue
  descending?: boolean
  limit?: number
  offset?: number
}

/**
 * `GET /companies`：item 复用扁平的 `CompanyProfileDto` —— 与详情同一形状，
 * 两端不维护第二套"列表版画像"（此前路由直接把 repo 的 `{company, profile}`
 * 嵌套漏出去，列表版 profile 还有四个字段是 0/null 占位，属于无意契约）。
 */
export interface CompanyPageDto {
  items: CompanyProfileDto[]
  /** 过滤后的总数（分页 total 用）。 */
  total: number
}

/**
 * 一个方案的新鲜度（SR-8）。
 *
 * 阈值**随计划频率**：每天跑一次的方案 18 小时就算旧了，
 * 每周跑一次的方案 18 小时完全正常。所以 `thresholds` 一起回传，
 * 界面上写"为什么它算 stale"时有据可依，而不是一个魔数。
 */
export interface FreshnessDto {
  level: FreshnessLevel
  /** 用来判定的小时数（负数 = 从未成功过，按 cold 处理）。 */
  hoursSinceSuccess: number | null
  thresholds: { freshHours: number; coldHours: number }
}

export interface JobListParams {
  q?: string
  /** 城市数组：命中任意一个即可。 */
  cities?: string[]
  city?: string
  state?: string
  /**
   * 只看这一家公司的岗位（公司维度的「查看岗位」跳转用）。
   * 精确匹配 `company_id`，比拿公司名当关键词搜可靠（关键词只匹配标题）。
   */
  companyId?: number
  minSalary?: number | null
  /**
   * 最低匹配分（0–100）；不传 = 不限。
   *
   * ⚠️ 排的是**库里存着的那个分**（可能已过期，见 `JobDto.scoreStale`）。
   * 未打分的岗位（`matchScore === null`）**不会被返回** —— 没有分就没法比较，
   * 硬塞进来等于给用户看一批无法判断的条目。界面上要写明这一点。
   */
  minScore?: number | null
  /** 经验要求多选：命中任意一个即可（取值来自 `fetchJobFacets`）。 */
  expReqs?: string[]
  /** 学历要求多选：同上。 */
  eduReqs?: string[]
  /** 屏蔽这些标注类型的岗位（传出 `excludeFlags`，黑白名单只有这里的类型）。 */
  excludeFlags?: JobFlagType[]
  /**
   * 排除**已拉黑公司**的岗位（第五轮，批次 B）。
   *
   * 服务端默认不做这件事（见 `CompanyProfileDto.blacklisted` 的注释）；
   * 界面上的筛选默认开着，并在头栏写明因此隐藏了几条。
   */
  excludeBlacklisted?: boolean
  /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
  groupDuplicates?: boolean
  /**
   * 「只看新增」：只返回**首次见到**时间 ≥ 该 ISO 时刻的岗位。
   * 界面按时间窗（近 24 小时 / 3 天 / 7 天）算好再传，口径与首屏「今日新增」一致。
   */
  firstSeenSince?: string
  orderBy?: string
  descending?: boolean
  page?: number
  pageSize?: number
}

/**
 * 界面的筛选条件状态（第五轮，批次 B2 起进 shared）。
 *
 * ── 为什么要进 shared
 *
 * "保存的筛选视图"要落库（`setting` 表），而**服务端必须逐字段校验**它 ——
 * 不能把界面随手拼的 JSON 原样存进库。校验要有类型可依，所以形状放在这里，
 * 界面侧 `screens/jobs/filters.ts` 的 `Filters` 直接别名到它：**只此一份定义**，
 * 免得两端各写一遍然后悄悄漂移（本项目在标签文案上吃过一次这个亏）。
 *
 * 注意它与 `JobListParams` **不是一回事**：后者是"发给 `GET /jobs` 的查询参数"
 * （时间窗已经算成 ISO 时刻），这里存的是**界面上的控件状态**
 * （时间窗存 `'1d'` 这种令牌）—— 否则存下来的"近 24 小时"会随保存时间一起冻结。
 */
export interface JobFilterState {
  q: string
  /** 命中任意一个即可；空 = 不限。 */
  cities: string[]
  /** 经验梯队 chip id（不是平台原始串，见界面 `filters.ts`）。 */
  expBuckets: string[]
  eduReqs: string[]
  state: string
  minSalary: string
  minScore: string
  excludeFlags: JobFlagType[]
  /** 排除已拉黑公司（默认 true，见 `JobListParams.excludeBlacklisted`）。 */
  excludeBlacklisted: boolean
  groupDuplicates: boolean
  /** `''` = 不限；否则是 `JOB_NEW_WINDOWS` 里的 value。 */
  newWindow: string
  orderBy: JobOrderValue
  descending: boolean
}

/** 一个保存的筛选视图（第五轮，批次 B2）。 */
export interface SavedJobViewDto {
  /** 客户端生成的稳定 id（服务端只校验长度与字符集）。 */
  id: string
  /** 用户起的名字。 */
  name: string
  filters: JobFilterState
}

/** `GET/PUT /jobs/views`：整体读、整体写（幂等，避免"改一半"的中间态）。 */
export interface JobViewsDto {
  views: SavedJobViewDto[]
  /** 服务端强制的条数上限 —— 界面据此禁用"保存"并说明原因，而不是等被拒。 */
  max: number
}
