import type { BrowserPage } from '../platform/browser.js'
import type { EnrichmentCandidateDto } from '../../shared/contract/dto/job.js'

/**
 * 工商补全（enrichment）领域的类型。
 *
 * 与招聘平台的 `SiteAdapter` 是两套契约，刻意不共用：SiteAdapter 为"岗位列表采集"
 * 建模（SearchCriteria → RawJob[] → 翻页），工商查询是"输入公司名 → 单条快照"，
 * 强行实现 readListPage 只会把它注册进采集方案的平台下拉里（污染 plan 校验）。
 */

/** provider 从详情页解析出的原始工商数据（领域层再补 companyId/时间戳入库）。 */
export interface RawEnrichment {
  /** 注册全称。只有 NEXT_DATA 能可靠拿到；文本路径**宁可 null 也不猜**（回退正则会
   *  命中页头"请输入公司名称"这类噪声，拿错名字比拿空更糟），入库时编排层用公司名兜底。 */
  matchedName: string | null
  creditCode: string | null
  regStatus: string | null
  estDate: string | null
  regCapital: string | null
  orgType: string | null
  legalPerson: string | null
  industry: string | null
  staffNum: string | null
  suitCount: number | null
  investCount: number | null
  licenseCount: number | null
  tags: string[]
  /** 详情页完整 URL（溯源 + 界面跳转）。 */
  sourceUrl: string
}

/** 撞墙的种类 —— 每种都要有给人读的说法，绝不静默当"查无结果"。 */
export type BlockedReason = 'login-wall' | 'captcha' | 'timeout'

/**
 * 搜索一步的结果：
 *   * `candidates` —— 拿到候选列表（匹配判断不在这层，交给 matcher）；
 *   * `empty` —— 搜索零结果（工商库查无此主体，是有价值的留痕，不是错误）；
 *   * `blocked` —— 登录墙 / 人机验证 / 超时（如实上报，不绕过）。
 */
export type LookupOutcome =
  | { kind: 'candidates'; items: EnrichmentCandidateDto[] }
  | { kind: 'empty' }
  | { kind: 'blocked'; reason: BlockedReason }

/**
 * 一个工商数据源的浏览器操作面 —— **只负责"操作平台"**：
 * 导航、输入、判墙、拿 HTML。解析（extractor）与匹配（matcher）是源无关的，
 * 不塞进 provider，改版只动各自的文件。
 */
export interface EnrichmentProvider {
  id: string
  /** 在平台的搜索框里拟人输入公司名并提交，返回候选列表。 */
  search(name: string, page: BrowserPage): Promise<LookupOutcome>
  /** 从当前（搜索结果）页面读出候选 —— 导航结束后由编排层调用一次。 */
  readCandidates(page: BrowserPage): Promise<EnrichmentCandidateDto[]>
  /** 进某个详情页，拿原始 HTML 与最终 URL（解析归 extractor）。 */
  fetchDetail(
    path: string,
    page: BrowserPage,
  ): Promise<{ html: string; url: string } | { kind: 'blocked'; reason: BlockedReason }>
}
