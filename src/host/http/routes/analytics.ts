/**
 * 看板与归因（P7 与批次 F）相关端点：`/analytics` 系列 —— 漏斗（GET /analytics/funnel）、
 * 归因（GET /analytics/attribution）、薪资带（GET /analytics/salary）、
 * 薪资箱线图（GET /analytics/salary/box）、本地基准（GET /analytics/salary/baseline）、
 * 简历版本 A/B 对比（GET /analytics/resume/compare）。
 * 这几个接口共用一组 query 筛选参数，解析与校验统一放在私有的 `analyticsFilterOf` 里。
 */
import type { AnalyticsFilter } from '../../../shared/dto.js'
import { SALARY_BASES, type SalaryBasis } from '../../../shared/dto.js'
import { DomainError } from '../../util/errors.js'
import { json, requireData, type RouteContext } from './kit.js'
import type { RouteRequest, RouteResult } from './types.js'

// ── P7：看板与归因（§13 U8）──────────────────────────────────────
//
// 全局筛选：三个接口共用一组 query 参数。解析与校验都在这里做完 ——
// 非法的时间或 id 一路传到服务层，只会换来一个看不懂的空结果。
function analyticsFilterOf(req: RouteRequest): AnalyticsFilter {
  const iso = (value: string | null, name: string): string | undefined => {
    if (value === null || value === '') return undefined
    if (!Number.isFinite(Date.parse(value))) {
      throw new DomainError('INVALID_INPUT', `${name} 不是合法时间：${value}`, {
        hint: '用 ISO 格式，例如 2026-09-01 或 2026-09-01T00:00:00Z。',
      })
    }
    return value
  }
  const resumeIdRaw = req.query.get('resumeId')
  let resumeId: number | undefined
  if (resumeIdRaw !== null && resumeIdRaw !== '') {
    const parsed = Number.parseInt(resumeIdRaw, 10)
    if (!Number.isFinite(parsed)) {
      throw new DomainError('INVALID_INPUT', `resumeId 不是数字：${resumeIdRaw}`)
    }
    resumeId = parsed
  }
  const from = iso(req.query.get('from'), 'from')
  const to = iso(req.query.get('to'), 'to')
  const city = req.query.get('city')
  const keyword = req.query.get('q')
  const direction = req.query.get('direction')
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(city === null || city === '' ? {} : { city }),
    ...(keyword === null || keyword === '' ? {} : { keyword }),
    ...(direction === null || direction === '' ? {} : { direction }),
    ...(resumeId === undefined ? {} : { resumeId }),
  }
}

export async function funnel(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'funnel') {
    requireData(runtime)
    return json(200, runtime.analytics().funnel(analyticsFilterOf(req)))
  }

  return undefined
}

export async function attribution(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'attribution') {
    requireData(runtime)
    return json(200, runtime.analytics().attribution(analyticsFilterOf(req)))
  }

  return undefined
}

export async function salary(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (method === 'GET' && segments.length === 2 && segments[0] === 'analytics' && segments[1] === 'salary') {
    requireData(runtime)
    const filter = analyticsFilterOf(req)
    // 城市/关键词由岗位库自己筛；时间窗是**岗位库的时间轴**，与投递时间不是一回事
    return json(
      200,
      runtime.analytics().salaryBand({
        ...(filter.city === undefined ? {} : { city: filter.city }),
        ...(filter.keyword === undefined ? {} : { keyword: filter.keyword }),
        ...(filter.from === undefined ? {} : { from: filter.from }),
        ...(filter.to === undefined ? {} : { to: filter.to }),
      }),
    )
  }

  return undefined
}

export async function salaryBox(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // ── 批次 F：箱线图 / 本地基准 / 简历 A/B（看板遗留）────────────────

  /** F1：薪资箱线图。口径必须显式传（默认月薪下限），不接受"让服务猜一个"。 */
  if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'salary' && segments[2] === 'box') {
    requireData(runtime)
    const filter = analyticsFilterOf(req)
    const basisRaw = req.query.get('basis')
    if (basisRaw !== null && basisRaw !== '' && !SALARY_BASES.includes(basisRaw as never)) {
      throw new DomainError('INVALID_INPUT', `不认识的口径：${basisRaw}`, {
        hint: `合法取值：${SALARY_BASES.join(' / ')}。这一项必须显式给 —— "月薪下限"与"年薪折算"算出来的中位数可以差几成，不写清就是误导。`,
      })
    }
    return json(
      200,
      runtime.analytics().salaryBox({
        ...(filter.city === undefined ? {} : { city: filter.city }),
        ...(filter.keyword === undefined ? {} : { keyword: filter.keyword }),
        ...(basisRaw === null || basisRaw === '' ? {} : { basis: basisRaw as SalaryBasis }),
      }),
    )
  }

  return undefined
}

export async function salaryBaseline(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  /** F2：本地基准对比 —— 用自己抓到的岗位库当基准（绝不联网、绝不编行业数据）。 */
  if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'salary' && segments[2] === 'baseline') {
    requireData(runtime)
    return json(200, runtime.analytics().salaryBaseline(analyticsFilterOf(req)))
  }

  return undefined
}

export async function resumeCompare(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  /** F3：简历版本 A/B 对比（每格带样本量，不做显著性检验）。 */
  if (method === 'GET' && segments.length === 3 && segments[0] === 'analytics' && segments[1] === 'resume' && segments[2] === 'compare') {
    requireData(runtime)
    return json(200, runtime.analytics().resumeCompare(analyticsFilterOf(req)))
  }

  return undefined
}
