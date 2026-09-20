/**
 * BOSS 直聘列表接口（薪资明文 + 字段回填通道）的页面内请求与响应解析。
 *
 * `fetchJoblistInPage` 是**页面上下文函数**（`page.evaluate` 序列化后送进浏览器执行）：
 * 不得引用任何模块级的值；`extrasMapOf` / `salaryMapOf` 是宿主机侧的纯解析，不受此限。
 * 完整实测记录见 `./index.ts` 的文件头。
 */

/**
 * **在页面上下文里**发 joblist 请求（自包含；用页面自己的 fetch 带 Cookie/指纹/TLS）。
 * 返回解析后的 JSON；任何失败返回 `null`（调用方**保持 DOM 结果**）。
 */
export function fetchJoblistInPage(arg: { apiPath: string; body: string }): Promise<unknown> {
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchImpl !== 'function') return Promise.resolve(null)
  return fetchImpl(arg.apiPath, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: arg.body,
  })
    .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
    .catch(() => null)
}

/**
 * joblist 单条里"接口有、DOM 没有"的补充字段（2026-09-20 探针实测，15/15 覆盖）。
 *
 * 为什么值得拿：DOM 卡片只有 标题/薪资(混淆)/经验学历/公司名/城市区 三段，
 * 而接口同一批岗位还带着 技能、福利、行业、规模、融资阶段、商圈、securityId ——
 * 这些正是 `RawJob` 里 `tags/industry/companySize/companyNature` 一直空着的原因。
 */
export interface ZhipinApiExtras {
  /** 明文薪资（如 `12-20K·13薪`），DOM 里是字体混淆的私有区码点。 */
  salaryDesc: string
  /** 技能标签（如 Java/Spring/MySQL）。 */
  skills: string[]
  /** 福利标签（如 五险一金/股票期权）。 */
  welfareList: string[]
  /** 公司行业（如 互联网金融）。 */
  brandIndustry: string
  /** 公司规模（如 10000人以上）。 */
  brandScaleName: string
  /** 融资阶段（如 已上市；zhipin 详情页 `.icon-stage` 同样落 `companyNature`）。 */
  brandStageName: string
  /** 区（如 福田区，与 DOM 的 district 段一致）。 */
  areaDistrict: string
  /** 商圈（如 购物公园；DOM 三段 `深圳·福田区·购物公园` 的第三段以前被丢掉）。 */
  businessDistrict: string
  /** 详情页令牌：详情抓取必须带（BossHunter 站点规则），DOM href 里没有。 */
  securityId: string
}

/**
 * 从 joblist 响应里取 `encryptJobId → 补充字段`。
 *
 * 连接键是 `encryptJobId` ↔ 卡片 href 里那个 id（2026-09-18 实测重合 15/15）。
 * 结构不符就返回空表（**不抛错**：这条通道只是"锦上添花"，失败不该让整轮抓取失败）。
 */
export function extrasMapOf(payload: unknown): Map<string, ZhipinApiExtras> {
  const out = new Map<string, ZhipinApiExtras>()
  if (payload === null || typeof payload !== 'object') return out
  const list = (payload as { zpData?: { jobList?: unknown } }).zpData?.jobList
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const id = typeof item['encryptJobId'] === 'string' ? item['encryptJobId'] : ''
    if (id === '') continue
    const str = (key: string): string => (typeof item[key] === 'string' ? (item[key] as string).trim() : '')
    const arr = (key: string): string[] =>
      Array.isArray(item[key])
        ? (item[key] as unknown[]).filter(
            (value): value is string => typeof value === 'string' && value.trim() !== '',
          )
        : []
    out.set(id, {
      salaryDesc: str('salaryDesc'),
      skills: arr('skills'),
      welfareList: arr('welfareList'),
      brandIndustry: str('brandIndustry'),
      brandScaleName: str('brandScaleName'),
      brandStageName: str('brandStageName'),
      areaDistrict: str('areaDistrict'),
      businessDistrict: str('businessDistrict'),
      securityId: str('securityId'),
    })
  }
  return out
}

/**
 * 从 joblist 响应里取 `encryptJobId → salaryDesc`（探针与旧调用方的窄视图）。
 * 只是 `extrasMapOf` 的一层投影，契约不变：缺 salaryDesc 的条目要跳过。
 */
export function salaryMapOf(payload: unknown): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, extras] of extrasMapOf(payload)) {
    if (extras.salaryDesc === '') continue
    out.set(id, extras.salaryDesc)
  }
  return out
}
