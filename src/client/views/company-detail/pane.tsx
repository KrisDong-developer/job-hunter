import { useState } from 'react'
import type { CompanyEnrichmentDto, EnrichmentCandidateDto, JobDto } from '../../../shared/contract/dto/job.js'
import { useAsync } from '../../hooks/use-async.js'
import { enrichCompany, fetchCompanyDetail } from '../../net/companies.js'
import { ApiError } from '../../net/client.js'
import { LoadingLine } from '../../ui/async-view.js'
import { CompanyPanel } from '../job-detail/panels/company-panel.js'
import { relativeTime } from '../../format/job.js'

/**
 * 公司维度详情 —— **右侧内嵌栏**（与岗位详情 `JobDetailPane` 平行、同一位置）。
 *
 * 取数一次 `fetchCompanyDetail`：画像卡（复用 `CompanyPanel`，含人工复核）、
 * 岗位数卡与工商快照卡吃同一份数据 —— 不复用岗位详情里的 `CompanyJobs`
 * （它自己会再发一次同样的请求，同一个详情栏会重复打一遍 `/companies/:id`）。
 *
 * 「查工商」走免登录浏览器通道（宿主侧真实浏览器拟人操作天眼查）：
 * 多候选时**就地列出让人点选**（候选不持久化，本次会话内有效）；
 * 撞墙/超额的错误文案由宿主统一协议给出（`ApiError.display`），如实显示、不重试轰炸。
 */
export function CompanyDetailPane(props: {
  id: number | null
  revision: number
  onChanged: () => void
  /** 点某条岗位：切回岗位维度并选中它（详情直接按 id 取数，不依赖列表当前筛选）。 */
  onViewJob: (id: number) => void
}) {
  if (props.id === null) {
    return (
      <section className="jh-detail-pane jh-detail-pane-empty" data-job-hunter="company-detail" aria-label="公司详情">
        <p className="jh-detail-empty-title">从左侧选一家公司</p>
        <p className="jh-note">这里显示它的画像（外包 / 风险信号）、人工复核和它的岗位，列表保持不动。</p>
        <p className="jh-note">分数冷启动时偏低：岗位越多判断越准，依据不足时宁可少说。</p>
      </section>
    )
  }
  return (
    <section className="jh-detail-pane" data-job-hunter="company-detail" aria-label="公司详情">
      <CompanyDetailBody id={props.id} revision={props.revision} onChanged={props.onChanged} onViewJob={props.onViewJob} />
    </section>
  )
}

function CompanyDetailBody(props: {
  id: number
  revision: number
  onChanged: () => void
  onViewJob: (id: number) => void
}) {
  const { state, reload } = useAsync(
    (signal) => fetchCompanyDetail(props.id, signal),
    [props.id, props.revision],
  )
  /** 「查工商」进行中（按钮转态 + 防连点）。 */
  const [enriching, setEnriching] = useState(false)
  /** 上一次查询带回的候选（点选后清空；不持久化 —— 过期候选没有意义）。 */
  const [candidates, setCandidates] = useState<EnrichmentCandidateDto[] | null>(null)
  const [enrichError, setEnrichError] = useState<string | null>(null)

  if (state.status === 'loading') {
    return <LoadingLine busy live="polite">正在读取公司…</LoadingLine>
  }
  if (state.status === 'error') {
    return (
      <div className="jh-card">
        <h2 className="jh-card-title">读取失败</h2>
        <p className="jh-error">{state.message}</p>
        {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
        <button type="button" className="jh-btn" onClick={reload}>重试</button>
      </div>
    )
  }

  const detail = state.data
  /** 跑一次工商查询：done/unmatched 刷新详情；pick-one 留下候选等人点。 */
  const runEnrich = async (pick?: { url: string; name?: string }): Promise<void> => {
    setEnriching(true)
    setEnrichError(null)
    setCandidates(null)
    try {
      const outcome = await enrichCompany(props.id, pick)
      if (outcome.kind === 'pick-one') {
        setCandidates(outcome.candidates)
        return
      }
      // done / unmatched：快照已入库，重取详情把它画出来
      reload()
      props.onChanged()
    } catch (error) {
      setEnrichError(error instanceof ApiError ? error.display : error instanceof Error ? error.message : String(error))
    } finally {
      setEnriching(false)
    }
  }

  return (
    <>
      {/* 标题行：公司名 + 人工标签 + 拉黑态 + 「查工商」入口。 */}
      <div className="jh-jobs-co-detail-head">
        <h2 className="jh-detail-title">{detail.company.name}</h2>
        {detail.company.manualLabel === null ? null : (
          <span className="jh-tag" title="人工标签（复核时打的，不是规则算的）">{detail.company.manualLabel}</span>
        )}
        {detail.company.blacklisted ? <span className="jh-state jh-state-blacked">已拉黑</span> : null}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-jobs-co-enrich-btn"
          disabled={enriching}
          title="用浏览器在天眼查上查这家公司的工商信息（免登录、每天限 20 家）"
          onClick={() => void runEnrich()}
        >
          {enriching ? '查询中…' : detail.enrichment === undefined ? '查工商' : '重新查询'}
        </button>
      </div>

      {enrichError === null ? null : (
        <p className="jh-error" role="alert">{enrichError}</p>
      )}

      {/* 多候选：让人点（自动匹配只认唯一 exact，同名/写法对不上都交给人）。 */}
      {candidates === null ? null : (
        <section className="jh-card">
          <h3 className="jh-card-title">找到 {String(candidates.length)} 家候选，点一个是这家的</h3>
          <ul className="jh-jobs-co-candidates">
            {candidates.map((candidate) => (
              <li key={candidate.url}>
                <button
                  type="button"
                  className="jh-jobs-co-candidate"
                  disabled={enriching}
                  onClick={() => void runEnrich({ url: candidate.url, name: candidate.name })}
                >
                  <span className="jh-jobs-co-candidate-name">{candidate.name}</span>
                  <span className="jh-jobs-co-candidate-meta">
                    {[candidate.status, candidate.creditCode].filter((item) => item !== null).join(' · ') || '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="jh-note" style={{ margin: '8px 0 0' }}>都不对？可能工商库没有完全同名的主体 —— 关掉重搜换个写法，或直接放弃。</p>
        </section>
      )}

      {/* 画像 + 人工复核：复用岗位详情里的同一张卡（含拉黑警示与备注编辑）。 */}
      <CompanyPanel
        company={detail.company}
        onSaved={() => {
          reload()
          props.onChanged()
        }}
      />

      {/* 工商快照：查过才出现（没查过 = 没有"工商信息"卡，而不是一张全空的卡）。 */}
      {detail.enrichment === undefined ? null : <EnrichmentCard enrichment={detail.enrichment} />}

      {/* 岗位数：吃 detail.jobs（≤50，详情接口给的全量），不再发第二次请求。 */}
      <section className="jh-card">
        <h3 className="jh-card-title">岗位数{detail.jobs.length === 0 ? '' : `（${String(detail.jobs.length)} 条）`}</h3>
        {detail.jobs.length === 0 ? (
          <p className="jh-note">库里还没有这家公司的岗位 —— 画像与分数因此偏弱（冷启动信号不足）。</p>
        ) : (
          <ul className="jh-jobs-co-jobs">
            {detail.jobs.map((job) => (
              <MiniJob key={job.id} job={job} onView={props.onViewJob} />
            ))}
          </ul>
        )}
        {detail.company.jobCount > detail.jobs.length ? (
          <p className="jh-note">只列最近 {String(detail.jobs.length)} 条，共 {String(detail.company.jobCount)} 条 —— 点「查看岗位」看全部。</p>
        ) : null}
      </section>
    </>
  )
}

/** 工商快照卡：企业属性 + 风险概览，每项带来源与抓取时间（快照是"某时刻的事实"）。 */
function EnrichmentCard(props: { enrichment: CompanyEnrichmentDto }) {
  const e = props.enrichment
  /** 查无此主体的留痕：一张说明卡，不硬摆一堆"—"。 */
  if (e.confidence === 'unmatched') {
    return (
      <section className="jh-card">
        <h3 className="jh-card-title">工商信息</h3>
        <p className="jh-note">
          工商库（天眼查）没有找到与这家公司名完全匹配的主体 —— 可能是简称、写法差异，
          也可能它根本没注册。这值得警惕，但不足以定罪。
        </p>
        <p className="jh-note">抓取于 {relativeTime(e.fetchedAt) ?? e.fetchedAt}。</p>
      </section>
    )
  }
  const dead = e.regStatus !== null && /注销|吊销|清算/.test(e.regStatus)
  const rows: Array<[string, string]> = [
    ['注册全称', e.matchedName ?? '—'],
    ['经营状态', e.regStatus ?? '—'],
    ['成立日期', e.estDate ?? '—'],
    ['注册资本', e.regCapital ?? '—'],
    ['法定代表人', e.legalPerson ?? '—'],
    ['国标行业', e.industry ?? '—'],
    ['员工人数', e.staffNum ?? '—'],
    ['信用代码', e.creditCode ?? '—'],
  ]
  return (
    <section className="jh-card">
      <h3 className="jh-card-title">工商信息</h3>
      {/* 已注销/吊销还在招人 = 最强的僵尸岗信号，值得放在卡顶大声说。 */}
      {dead ? (
        <p className="jh-error" role="alert">
          这家公司在工商系统里已是「{e.regStatus}」状态 —— 还在招人的岗位大概率是僵尸岗。
        </p>
      ) : null}
      <ul className="jh-kv">
        {rows.map(([key, value]) => (
          <li key={key}><span>{key}</span><span>{value}</span></li>
        ))}
      </ul>
      {e.tags.length === 0 ? null : (
        <span className="jh-tags">
          {e.tags.map((tag) => (
            <span key={tag} className="jh-tag">{tag}</span>
          ))}
        </span>
      )}
      {/* 风险概览计数：免登录档能看到的读数；null = 页面上没有，如实不显示。 */}
      {e.suitCount === null && e.investCount === null && e.licenseCount === null ? null : (
        <p className="jh-note" style={{ margin: '8px 0 0' }}>
          {[
            e.suitCount === null ? null : `开庭公告 ${String(e.suitCount)} 条`,
            e.investCount === null ? null : `对外投资 ${String(e.investCount)} 家`,
            e.licenseCount === null ? null : `行政许可 ${String(e.licenseCount)} 个`,
          ]
            .filter((item) => item !== null)
            .join(' · ')}
        </p>
      )}
      <p className="jh-note" style={{ margin: '8px 0 0' }}>
        {e.sourceUrl === null ? null : (
          <>
            <a className="jh-link" href={e.sourceUrl} target="_blank" rel="noreferrer">来源：天眼查</a>
            {' · '}
          </>
        )}
        抓取于 {relativeTime(e.fetchedAt) ?? e.fetchedAt}
        {e.confidence === 'manual' ? ' · 从候选人工点选' : ''}
      </p>
    </section>
  )
}

/** 详情内嵌的岗位行（轻量版）：标题 + 薪资 + 地点/要求，点击切到岗位维度看完整详情。 */
function MiniJob(props: { job: JobDto; onView: (id: number) => void }) {
  const job = props.job
  const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
  const place = `${job.city}${job.district === '' ? '' : `·${job.district}`}`
  return (
    <li>
      <button
        type="button"
        className="jh-jobs-co-mini"
        aria-label={`岗位：${job.title}，${job.salaryRaw}，${place}`}
        onClick={() => props.onView(job.id)}
      >
        <span className="jh-jobs-co-mini-title">
          <span>{job.title}</span>
          <b className="jh-salary jh-jobs-co-mini-salary">{job.salaryRaw}</b>
        </span>
        <span className="jh-jobs-co-mini-meta">
          {[place, requirements === '' ? null : requirements].filter((item) => item !== null).join(' · ')}
        </span>
      </button>
    </li>
  )
}
