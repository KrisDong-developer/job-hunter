import type { AnalyticsFilter, ResumeCompareRowDto, SalaryBasis } from '../../../shared/dto.js'
import { SALARY_BASES, SALARY_BASIS_LABEL } from '../../../shared/dto.js'
import { useAsync } from '../../hooks/use-async.js'
import { fetchAttribution, fetchFunnel, fetchResumeCompare, fetchSalaryBand, fetchSalaryBaseline, fetchSalaryBox } from '../../net/pipeline.js'
import { fetchResumes } from '../../net/resumes.js'
import { FieldHint } from '../../ui/field-hint.js'
import { AttributionTable } from './attribution-table.js'
import { FunnelChart } from './funnel-chart.js'
import { SalaryBoxChart } from './salary-box-chart.js'
import { SampleBadge } from './sample-badge.js'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

/**
 * 筛选口径的完整说明 —— 收纳在标题右侧的问号里，不再占版面。
 *
 * 这几句话原来是一整段内嵌在筛选栏下面的 `jh-info`，首屏被它吃掉三行。
 * 但内容不能丢：**方向与简历版本只对投递段成立**这条边界，不写出来就会被误读成
 * "打招呼也没用这版简历"。所以是"收纳"而不是"删除"。
 */
const FILTER_SCOPE_HINT =
  '方向与简历版本只作用于投递段 —— 打招呼没有记录用过哪版简历／什么方向，' +
  '接触段（打招呼/送达/已读/回复）不受这两项影响。' +
  '薪资分位来自岗位库，它的时间窗是岗位抓取时间，不是你的投递时间。'


/** 去掉空值：空字符串等于"取消这一项"，别把它当成筛选条件发出去。 */
function cleanFilter(input: AnalyticsFilter): AnalyticsFilter {
  const next: AnalyticsFilter = { ...input }
  for (const key of Object.keys(next) as Array<keyof AnalyticsFilter>) {
    if (next[key] === '' || next[key] === undefined) delete next[key]
  }
  return next
}


/**
 * 稳定签名：判断"草稿与已生效是否不同"，与键的插入顺序无关。
 * 不用 JSON.stringify —— 两个对象字面量的键序不一样时会误判成"改过"。
 */
function filterSignature(input: AnalyticsFilter): string {
  return Object.entries(cleanFilter(input))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}


/**
 * U8 数据看板（§13）。
 *
 * 界面上**先显示样本量，再显示比率** —— 顺序不是小事：
 * 先看到"100% 回复率"再看到"样本 1 条"，人已经形成印象了。
 *
 * 第七轮（2026-09-18，PM 视角的界面重排）改了四件事：
 *   * 筛选区从"改一个字段立刻重查"改成**草稿 + 查询/重置**：
 *     6 个字段各自即时重查等于边打字边发 6 次请求，而且"改到一半"的结果会先闪一下；
 *     「查询」也才有明确语义（此前按钮的位置上什么都没有）。
 *   * 漏斗从"一排横条"改成**连续梯形**（见 `FunnelChart`）。
 *   * 每块数据一个**面板卡**：标题 16px、右上角挂样本徽章，长口径说明收进
 *     「口径说明」展开项或问号 —— 首屏只留结论，依据按需展开。
 *   * 表格数值列右对齐、表头有底、样本够的行才给高亮（判断全部来自 host）。
 */
export function BoardScreen(props: { revision: number; onDrillDown: (step: string) => void }) {
  // 草稿态与已生效态分开：输入先落草稿，点「查询」（或在字段里回车）才重算。
  const [draft, setDraft] = useState<AnalyticsFilter>({})
  const [applied, setApplied] = useState<AnalyticsFilter>({})
  const [resumeOptions, setResumeOptions] = useState<Array<{ id: number; label: string }>>([])
  const [directionOptions, setDirectionOptions] = useState<string[]>([])

  // 简历版本与方向是**投递链路**的维度：从简历列表取选项（只取有方向的，去重）
  useEffect(() => {
    void fetchResumes()
      .then((result) => {
        setResumeOptions(result.items.map((item) => ({ id: item.id, label: `${item.name} #${String(item.id)}` })))
        setDirectionOptions([...new Set(result.items.map((item) => item.direction).filter((d) => d !== ''))].sort())
      })
      .catch(() => {
        /* 选项拉不到不影响看板本身 */
      })
  }, [props.revision])

  // F1：口径是**用户选的**，不是服务猜的 —— 两个口径算出来的中位数可以差好几成
  const [basis, setBasis] = useState<SalaryBasis>('monthly_min')

  const funnel = useAsync((signal) => fetchFunnel(applied, signal), [props.revision, applied])
  const attribution = useAsync((signal) => fetchAttribution(applied, signal), [props.revision, applied])
  const salary = useAsync((signal) => fetchSalaryBand(applied, signal), [props.revision, applied])
  const salaryBox = useAsync((signal) => fetchSalaryBox(applied, basis, signal), [props.revision, applied, basis])
  // F2：基准来自**自己抓到的岗位库**（不联网、不编行业数据）
  const baseline = useAsync((signal) => fetchSalaryBaseline(applied, signal), [props.revision, applied])
  // F3：简历 A/B 对比（每格带样本量，不做显著性）
  const resumeCompare = useAsync((signal) => fetchResumeCompare(applied, signal), [props.revision, applied])
  // 提前取出数据：TS 不会把 `status === 'ok'` 的收窄带进回调里
  const funnelData = funnel.state.status === 'ok' ? funnel.state.data : null
  const attributionData = attribution.state.status === 'ok' ? attribution.state.data : null
  const salaryData = salary.state.status === 'ok' ? salary.state.data : null
  const resumeCompareData = resumeCompare.state.status === 'ok' ? resumeCompare.state.data : null
  /** 表现最好的一行在这里算一次，不在 map 里逐行重算（那也是 O(n²)）。 */
  const bestResume = resumeCompareData === null ? null : bestResumeKey(resumeCompareData.rows)

  const activeCount = Object.keys(applied).length
  const dirty = filterSignature(draft) !== filterSignature(applied)
  const patch = (next: Partial<AnalyticsFilter>): void => {
    setDraft((current) => ({ ...current, ...next }))
  }
  const apply = (): void => {
    setApplied(cleanFilter(draft))
  }
  const reset = (): void => {
    setDraft({})
    setApplied({})
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-screen-title">数据看板</h2>
        <span className="jh-muted">漏斗 · 归因 · 薪资分布 · 简历对比，各自回答一个复盘问题。</span>
        <span className="jh-spacer" />
        <FieldHint text={FILTER_SCOPE_HINT} />
      </div>

      {/* ── 全局筛选：一处改动，漏斗/归因/薪资一起重算 ─────────────── */}
      <section className="jh-card jh-panel jh-filter-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">筛选</h3>
          <span className="jh-muted">方向与简历版本只作用于投递段，完整口径见右上角问号。</span>
          <span className="jh-spacer" />
          {dirty ? (
            <span className="jh-warn">已改动，点「查询」生效</span>
          ) : (
            <span className="jh-muted">已生效 {activeCount} 项</span>
          )}
        </div>
        <div
          className="jh-filter-grid"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              apply()
            }
          }}
        >
          <label className="jh-field">
            <span>起</span>
            <input
              className="jh-input"
              type="date"
              value={(draft.from ?? '').slice(0, 10)}
              onChange={(event) =>
                patch({ from: event.target.value === '' ? '' : `${event.target.value}T00:00:00.000Z` })
              }
            />
          </label>
          <label className="jh-field">
            <span>止</span>
            <input
              className="jh-input"
              type="date"
              value={(draft.to ?? '').slice(0, 10)}
              onChange={(event) =>
                patch({ to: event.target.value === '' ? '' : `${event.target.value}T23:59:59.999Z` })
              }
            />
          </label>
          <label className="jh-field">
            <span>关键词（岗位名）</span>
            <input
              className="jh-input"
              placeholder="Java"
              value={draft.keyword ?? ''}
              onChange={(event) => patch({ keyword: event.target.value })}
            />
          </label>
          <label className="jh-field">
            <span>方向（简历）</span>
            <select
              className="jh-select"
              value={draft.direction ?? ''}
              onChange={(event) => patch({ direction: event.target.value })}
            >
              <option value="">全部方向</option>
              {directionOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="jh-field">
            <span>城市</span>
            <input
              className="jh-input"
              placeholder="深圳"
              value={draft.city ?? ''}
              onChange={(event) => patch({ city: event.target.value })}
            />
          </label>
          <label className="jh-field">
            <span>简历版本</span>
            <select
              className="jh-select"
              value={draft.resumeId === undefined ? '' : String(draft.resumeId)}
              onChange={(event) => patch({ resumeId: event.target.value === '' ? undefined : Number(event.target.value) })}
            >
              <option value="">全部版本</option>
              {resumeOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
        {/* 动作行独立成行并靠右：栅格里的字段不会因为按钮出现/消失而位移。
            类名不用 .jh-filter-actions —— 那个已经被岗位库的高级筛选块占着，
            两处意图不同（那边是标题行内右推），复用一个名字必然互相改坏。 */}
        <div className="jh-filter-foot">
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-quiet"
            disabled={activeCount === 0 && !dirty}
            onClick={reset}
          >
            重置
          </button>
          <button type="button" className="jh-btn jh-btn-inline jh-btn-primary" disabled={!dirty} onClick={apply}>
            查询
          </button>
        </div>
      </section>

      {/* ── 漏斗 ─────────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">漏斗</h3>
          <span className="jh-muted">接触段与投递段分开画 —— 它们是两个不可比的总体。</span>
          <span className="jh-spacer" />
          {funnelData === null ? null : (
            <SampleBadge sample={funnelData.sampleSize} enough={funnelData.enoughSample} hint={funnelData.note} />
          )}
        </div>
        {funnelData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : (
          <FunnelChart steps={funnelData.steps} onDrillDown={props.onDrillDown} />
        )}
      </section>

      {/* ── 归因 ─────────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">归因</h3>
          <span className="jh-muted">这些投递是哪条渠道、哪版简历换来的。</span>
          <span className="jh-spacer" />
          {attributionData === null ? null : (
            <SampleBadge
              sample={attributionData.sampleSize}
              enough={attributionData.enoughSample}
              hint={attributionData.note}
            />
          )}
        </div>
        {attributionData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : (
          <>
            <h4 className="jh-panel-sub">按渠道</h4>
            <AttributionTable rows={attributionData.byChannel} />
            <h4 className="jh-panel-sub">按简历版本</h4>
            <AttributionTable rows={attributionData.byResume} />
          </>
        )}
      </section>

      {/* ── 薪资分布 ─────────────────────────────────────────────────── */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">薪资分布</h3>
          <span className="jh-muted">箱线图 · 基准只来自你自己抓到的岗位库。</span>
          <span className="jh-spacer" />
          {/* F1：口径切换。**必须显式**：两个口径算出来的中位数可以差好几成 */}
          <span className="jh-muted">口径</span>
          <div className="jh-modes">
            {SALARY_BASES.map((value) => (
              <button
                key={value}
                type="button"
                className={`jh-mode${value === basis ? ' jh-mode-active' : ''}`}
                onClick={() => setBasis(value)}
              >
                {SALARY_BASIS_LABEL[value]}
              </button>
            ))}
          </div>
          {salaryBox.state.status === 'ok' ? (
            <SampleBadge
              sample={salaryBox.state.data.box.count}
              enough={salaryBox.state.data.enoughSample}
              hint={salaryBox.state.data.note}
            />
          ) : null}
        </div>

        {salaryBox.state.status !== 'ok' ? (
          <p className="jh-muted">正在统计…</p>
        ) : salaryBox.state.data.box.count === 0 ? (
          <p className="jh-muted">这个范围里没有符合该口径的岗位。</p>
        ) : (
          <>
            <SalaryBoxChart box={salaryBox.state.data.box} />
            {/* 样本量留在明面上（它是结论的一部分），算法与口径收进右下角的展开项 */}
            <div className="jh-panel-foot">
              <span className="jh-muted">
                样本 {salaryBox.state.data.box.count} 条 · 箱体（P25–P75）里装了{' '}
                {salaryBox.state.data.box.withinBox} 条
              </span>
              <span className="jh-spacer" />
              <details className="jh-details jh-details-inline">
                <summary>口径说明</summary>
                <p className="jh-note">{salaryBox.state.data.note}</p>
              </details>
            </div>
          </>
        )}

        {/* F2：本地基准对比 —— 基准只能是自己的岗位库 */}
        {baseline.state.status === 'ok' && (
          <div className="jh-baseline">
            <h4 className="jh-panel-sub">我投递过的 vs 全部在库（同一口径：月薪下限）</h4>
            {baseline.state.data.all.count === 0 ? (
              <p className="jh-muted">岗位库里还没有带薪资的岗位。</p>
            ) : (
              <>
                <div className="jh-table-scroll">
                  <table className="jh-table jh-table-board">
                    <thead>
                      <tr>
                        <th scope="col">分组</th>
                        <th scope="col" className="jh-num">样本</th>
                        <th scope="col" className="jh-num">P25</th>
                        <th scope="col" className="jh-num">中位</th>
                        <th scope="col" className="jh-num">P75</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>全部在库</td>
                        <td className="jh-num">{baseline.state.data.all.count}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.p25)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.median)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.all.p75)}</td>
                      </tr>
                      <tr>
                        <td>我投递过的</td>
                        <td className="jh-num">{baseline.state.data.applied.count}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.p25)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.median)}</td>
                        <td className="jh-num">{numOrDash(baseline.state.data.applied.p75)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="jh-panel-foot">
                  <span className={baseline.state.data.enoughSample ? 'jh-muted' : 'jh-warn'}>
                    中位数之差：
                    {baseline.state.data.medianGap === null
                      ? '无法计算（有一边没有样本）'
                      : `${baseline.state.data.medianGap > 0 ? '+' : ''}${String(baseline.state.data.medianGap)} 元/月`}
                    {baseline.state.data.enoughSample ? '' : ' —— 样本不足，别看差额'}
                  </span>
                  <span className="jh-spacer" />
                  <details className="jh-details jh-details-inline">
                    <summary>口径说明</summary>
                    <p className="jh-note">{baseline.state.data.note}</p>
                  </details>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* F3：简历版本 A/B 对比。**不做显著性**，每格带样本量 */}
      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">简历版本对比</h3>
          <span className="jh-muted">同一批投递里，哪版简历走得更远。</span>
          <span className="jh-spacer" />
          {resumeCompare.state.status === 'ok' ? (
            <SampleBadge
              sample={resumeCompare.state.data.sampleSize}
              enough={resumeCompare.state.data.enoughSample}
              hint={resumeCompare.state.data.note}
            />
          ) : null}
        </div>
          {resumeCompareData === null ? (
            <p className="jh-muted">正在统计…</p>
          ) : (
            <>
              <div className="jh-table-scroll">
                <table className="jh-table jh-table-board">
                  <thead>
                    <tr>
                      <th scope="col">简历版本</th>
                      <th scope="col" className="jh-num">投递数</th>
                      {resumeCompareData.stages.map((stage) => (
                        <th scope="col" className="jh-num" key={stage.stage}>{stage.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumeCompareData.rows.map((row) => {
                      const rowKey = String(row.resumeId)
                      const best = rowKey === bestResume
                      return (
                        <tr key={rowKey} className={best ? 'jh-row-best' : undefined}>
                          <td>
                            {row.label}
                            {row.enoughSample ? null : <span className="jh-tag jh-tag-quiet">样本少</span>}
                            {best ? (
                              <span className="jh-tag jh-tag-best" title={BEST_RESUME_HINT}>
                                进入面试最多
                              </span>
                            ) : null}
                          </td>
                          <td className="jh-num">{row.total}</td>
                          {row.cells.map((cell) => (
                            // 每格都标出"分子/分母"，而不是只给一个百分比 ——
                            // 2 条样本里的 1 条不是"50%"，是"1/2"
                            <td key={cell.stage} className={cell.thin ? 'jh-num jh-warn' : 'jh-num'}>
                              {cell.count === 0 ? (
                                <span className="jh-cell-empty">—</span>
                              ) : (
                                `${String(cell.count)}/${String(row.total)}`
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {resumeCompareData.rows.length === 0 && <p className="jh-muted">还没有投递记录。</p>}
              <div className="jh-panel-foot">
                <span className="jh-muted">每格是「分子/分母」；带颜色的格子样本不足 5，只看数字别下结论。</span>
                <span className="jh-spacer" />
                <details className="jh-details jh-details-inline">
                  <summary>口径说明</summary>
                  <p className="jh-note">{resumeCompareData.note}</p>
                </details>
              </div>
            </>
          )}
      </section>

      <section className="jh-card jh-panel">
        <div className="jh-panel-head">
          <h3 className="jh-panel-title">薪资分位</h3>
          <span className="jh-muted">
            {salaryData === null ? '岗位库口径' : `${salaryData.scope} · 只统计薪资下限`}
          </span>
          <span className="jh-spacer" />
          {/* 口径标注：这一块与上面两块**不同轴**，不写出来就会被误读 */}
          <FieldHint text="城市与关键词在这里筛的是岗位库；时间窗是岗位抓取时间，不是你的投递时间。" />
        </div>
        {salaryData === null ? (
          <p className="jh-muted">正在统计…</p>
        ) : salaryData.count === 0 ? (
          <p className="jh-muted">这个范围里没有带薪资下限的岗位。</p>
        ) : (
          <div className="jh-metric-row">
            <div className="jh-metric"><span>样本</span><b>{salaryData.count}</b></div>
            <div className="jh-metric"><span>最低</span><b>{salaryData.min}</b></div>
            <div className="jh-metric"><span>P25</span><b>{salaryData.p25}</b></div>
            {/* 中位数是这一块的结论，所以它是唯一带色的数字 */}
            <div className="jh-metric jh-metric-key"><span>中位</span><b>{salaryData.median}</b></div>
            <div className="jh-metric"><span>P75</span><b>{salaryData.p75}</b></div>
            <div className="jh-metric"><span>最高</span><b>{salaryData.max}</b></div>
          </div>
        )}
      </section>
    </div>
  )
}


/** 空值统一渲染成灰色的破折号（全项目同一个字符，见 UI-UX 审核 §9.1）。 */
function numOrDash(value: number | null): ReactNode {
  return value === null ? <span className="jh-cell-empty">—</span> : String(value)
}


const BEST_RESUME_HINT =
  '这一版的「面试中 + 已面试 + Offer」条数在所有样本足够的版本里最多；并列时不给高亮。'


/**
 * 简历对比里"走得更远"的一行。
 *
 * 定义写在这里、也写在标签的 title 里：**面试中 + 已面试 + Offer 之和**。
 * 不用"回复率"是因为这张表按**当前阶段**分列，根本没有回复那一列；
 * 而投递之后真正有意义的分水岭就是"进了面试"。
 */
function bestResumeKey(rows: ResumeCompareRowDto[]): string | null {
  const score = (row: ResumeCompareRowDto): number =>
    ['interviewing', 'interviewed', 'offer'].reduce(
      (sum, stage) => sum + (row.cells.find((cell) => cell.stage === stage)?.count ?? 0),
      0,
    )
  const candidates = rows.filter((row) => row.enoughSample && score(row) > 0)
  if (candidates.length < 2) return null
  const top = Math.max(...candidates.map(score))
  const winners = candidates.filter((row) => score(row) === top)
  const winner = winners.length === 1 ? winners[0] : undefined
  return winner === undefined ? null : String(winner.resumeId)
}




