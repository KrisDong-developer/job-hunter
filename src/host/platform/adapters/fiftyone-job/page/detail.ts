/**
 * 51job 的**详情页页面上下文函数**：解析岗位详情（JD / 经验学历 / 公司三段）。
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 *
 * ## 证据状态（2026-09-21，必须先读这段再用）
 *
 * 与 zhipin 不同，**本仓没有 51job 详情页的真实夹具**（`51job-sz.html` 是搜索列表页；
 * 详情页是 `jobs.51job.com/all/<jobId>.html`，另一棵 DOM 树）。下面的选择器全是
 * **候选链**：老版详情页的经典类名（`.job_msg` 一档）+ 新版 we-SPA 风格的结构式候选，
 * **没有一条在本仓实测过**。两条纪律因此成立：
 *
 *   1. **锚不到就留空 + 记 note**（`JD 未锚定（待校准）`），绝不编一份 ——
 *      `crawl.ts` 对空 JD 的降级路径是现成的（warn 日志 + jdText 留空）；
 *   2. **选择器全部可经 DB 覆盖**（`setting` 表 scope='platform'、scope_ref='51job'、
 *      key='adapter-config' 的 `detailSelectors` 段）：真机校准后改配置即可，不必发版。
 *      校准入口：`npm run probe:51job` 落盘的搜索快照里第一条 `sourceUrl` 就是详情页。
 *
 * 有两处**不是候选、是结构事实**：
 *   * `platformJobId` 从 `location.pathname` 里按 `/all/<id>.html` 反解 ——
 *     这个形态就是列表侧 `detailUrlTemplate` 拼出来的，同一份约定；
 *   * 标题/公司名的 `document.title` 兜底：51job 详情页标题形如
 *     `「职位名」_「公司名」…-前程无忧`（老版为 `职位名_公司名_城市-前程无忧`），
 *     按 `_` 分段、去掉站名后缀。
 */
import type { RawJobDetail } from '../../../types.js'
import type { FiftyOneDetailSelectors } from '../config.js'

/**
 * **在页面上下文里**解析详情页。⚠️ 必须完全自包含。
 * 详情页未登录通常可见（搜索引擎收录的就是它）；被墙时由调用方 `detectBlock` 兜底。
 */
export function extractDetailInPage(arg: { selectors: FiftyOneDetailSelectors }): RawJobDetail {
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const queryAll = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  // platformJobId：从地址反解（形态即 `detailUrlTemplate` 的约定），锚不到留空。
  let platformJobId = ''
  try {
    const match = /\/all\/([0-9]+)\.html/.exec(location.pathname)
    platformJobId = match === null ? '' : match[1] ?? ''
  } catch {
    platformJobId = ''
  }

  // document.title 兜底：`职位名_公司名_城市-前程无忧` → 去站名后缀、按 `_` 分段。
  let titleFallback = ''
  let companyFallback = ''
  try {
    const raw = clean(document.title).replace(/[-_]前程无忧$/, '').replace(/[-_]51job$/i, '')
    const parts = raw.split('_')
    titleFallback = clean(parts[0] ?? '')
    companyFallback = parts.length > 1 ? clean(parts[1] ?? '') : ''
  } catch {
    /* title 读不到就走纯 DOM 候选 */
  }

  let title = textOf(queryOne(arg.selectors.title))
  if (title === '') title = titleFallback
  let salaryRaw = textOf(queryOne(arg.selectors.salary)).replace(/\s+/g, '')

  // 经验 / 学历：标签行按顺序兜底（列表侧 sensorsdata 的 jobYear/jobDegree 同款语义）
  const tagTexts = queryAll(arg.selectors.tags)
    .map((node) => clean(node.textContent))
    .filter((text) => text !== '')
  const expReq = tagTexts.find((text) => /年|以上|应届|经验/.test(text)) ?? ''
  const eduReq = tagTexts.find((text) => /本科|大专|硕士|博士|学历|中专|高中/.test(text)) ?? ''

  // JD 正文：候选链里**第一个有文本的**胜出（老版 `.job_msg` 在前 —— 它存在了很多年）
  let jdText = ''
  for (const node of queryAll(arg.selectors.jdText)) {
    const text = clean(node.textContent)
    if (text !== '') {
      jdText = text
      break
    }
  }

  let company = textOf(queryOne(arg.selectors.company))
  if (company === '') company = companyFallback

  // 公司三段（行业 / 性质 / 规模）：与列表侧 `.bc .dc` 同一去处，顺序对齐
  const meta = queryAll(arg.selectors.companyMeta)
    .map((node) => clean(node.textContent))
    .filter((text) => text !== '')

  const notes: string[] = []
  if (jdText === '') notes.push('JD 未锚定（detailSelectors.jdText 待真机校准）')
  if (title === '') notes.push('详情标题未锚定（title 候选与 document.title 都没给到）')
  if (company === '') notes.push('详情公司名未锚定（company 候选与 document.title 都没给到）')
  if (salaryRaw === '') notes.push('详情薪资未锚定，待校准')
  if (expReq === '' && eduReq === '') notes.push('经验/学历未锚定（tags 候选待校准）')

  return {
    platformJobId,
    title,
    salaryRaw,
    company,
    // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
    sourceUrl: location.href,
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
    ...(meta.length === 0 ? {} : { industry: meta[0] ?? null }),
    ...(meta.length < 2 ? {} : { companyNature: meta[1] ?? null }),
    ...(meta.length < 3 ? {} : { companySize: meta[2] ?? null }),
    ...(jdText === '' ? {} : { jdText }),
    ...(notes.length === 0 ? {} : { notes }),
  }
}
