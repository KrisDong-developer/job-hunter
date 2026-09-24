import type { CompanyProfileDto } from '../../../shared/contract/dto/job.js'
import { IconList } from './icons.js'

/**
 * 风险信号胶囊的显示阈值：分数（0–100）达到它才显示。
 *
 * 与岗位标注（`flags.ts`）同档语义：低分不是"安全"，只是"证据不足"——
 * 冷启动时统计信号弱（见 CompanyPanel 的说明），把 12 分也画成"外包 12"
 * 只会教用户忽略这些胶囊。
 */
const SIGNAL_THRESHOLD = 60

/**
 * 公司维度列表里的一行：与岗位行（`job-row.tsx`）同一套卡片语言 ——
 * 标题 15px/600、数字读数占"薪资位"（业务色加粗）、来源行带 tooltip 说明口径、
 * 右侧 34px 方块行内动作。不引入第二种卡片形状：公司维度换的是**内容**，不是风格。
 *
 * 与岗位行的差别：
 *   * 没有勾选框 —— 岗位侧的勾选服务于批量打招呼，公司侧暂无批量动作；
 *   * 行内动作是「查看岗位 / 拉黑」而不是「打招呼 / 投递」。
 */
export function CompanyRow(props: {
  company: CompanyProfileDto
  active: boolean
  /** 拉黑切换进行中（禁用动作，避免连点）。 */
  marking: boolean
  onSelect: (id: number) => void
  /** 查看岗位：切到岗位维度，只看这家公司（头栏会有一枚可移除的 chip）。 */
  onViewJobs: (company: CompanyProfileDto) => void
  onBlacklist: (company: CompanyProfileDto, blacklisted: boolean) => void
}) {
  const c = props.company
  const showOutsourcing = (c.outsourcingScore ?? 0) >= SIGNAL_THRESHOLD
  const showRisk = (c.fraudScore ?? 0) >= SIGNAL_THRESHOLD
  /**
   * 卡片可访问名称：照 job-row 的模式给**短而完整**的名称，卡内文本对读屏隐藏 ——
   * 名称里带上风险信号（它们恰恰是"要不要看这家"的判断依据），画像读数不进。
   */
  const signals = [
    showOutsourcing ? `外包分 ${String(Math.round(c.outsourcingScore ?? 0))}` : '',
    showRisk ? `风险分 ${String(Math.round(c.fraudScore ?? 0))}` : '',
    c.blacklisted ? '已拉黑' : '',
  ]
    .filter((item) => item !== '')
    .join('，')
  return (
    <li>
      <div className="jh-job-row">
        <button
          type="button"
          className={`jh-job${props.active ? ' jh-job-active' : ''}`}
          data-company-id={c.id}
          aria-current={props.active ? 'true' : undefined}
          aria-label={`公司：${c.name}，岗位 ${String(c.jobCount)} 条${signals === '' ? '' : `，${signals}`}`}
          onClick={() => props.onSelect(c.id)}
        >
          <span className="jh-job-main" aria-hidden="true">
            <span className="jh-job-title">
              {c.name}
              {/* 人工标签是用户自己打的标记 —— 复核时打的，不是规则算的 */}
              {c.manualLabel === null ? null : (
                <span className="jh-tag" title="人工标签（复核时打的，不是规则算的）">{c.manualLabel}</span>
              )}
            </span>
            {/* 岗位数占岗位行里"薪资"的那个位置：业务色加粗 —— 公司列表的第一问
                就是"谁在招人"，它得是扫视时的第二个落点（第一个是公司名）。 */}
            <span className="jh-job-meta">
              <b className="jh-salary">岗位 {String(c.jobCount)} 条</b>
              {c.industry === null ? null : <span>{c.industry}</span>}
              {c.size === null ? null : <span>{c.size}</span>}
              {c.nature === null ? null : <span>{c.nature}</span>}
            </span>
            {/* 画像读数：每个都带 tooltip 说明口径 —— 裸数字（"地域跨度 6"）没人知道是什么。 */}
            <span className="jh-job-origin">
              <span title="这家公司在库里抓到的不同技术栈方向数">技术栈广度 {String(c.stackDiversity)}</span>
              <span title="岗位分布的城市数">地域跨度 {String(c.geoSpread)}</span>
              {c.onsiteRatio === null ? null : (
                <span title="岗位描述里出现驻场/外派字样的比例（外包形态的统计信号）">
                  驻场 {String(Math.round(c.onsiteRatio * 100))}%
                </span>
              )}
              <span title="公司名命中的外包/外服类识别关键词个数">关键词命中 {String(c.nameKeywordHits)}</span>
            </span>
            {/* 备注：为什么拉黑 / 曾经投过，截断显示，完整内容在详情里 */}
            {c.note === null || c.note === '' ? null : (
              <span className="jh-jobs-co-note" title={c.note}>备注 {c.note}</span>
            )}
            {/* 风险信号：≥60 分才显示（低分不是"安全"，是"证据不足"）。
                形态沿用岗位标注的小圆角胶囊，颜色分向：外包橙、风险红。 */}
            {showOutsourcing || showRisk ? (
              <span className="jh-tags">
                {showOutsourcing ? (
                  <span
                    className="jh-signal jh-signal-out"
                    title={`外包分 ${String(Math.round(c.outsourcingScore ?? 0))}/100：驻场比例、名称关键词等信号加权得出`}
                  >
                    外包 {String(Math.round(c.outsourcingScore ?? 0))}
                  </span>
                ) : null}
                {showRisk ? (
                  <span
                    className="jh-signal jh-signal-risk"
                    title={`风险分 ${String(Math.round(c.fraudScore ?? 0))}/100：薪资虚标、黑话密度等信号加权得出`}
                  >
                    风险 {String(Math.round(c.fraudScore ?? 0))}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          {/* 已拉黑：安静的中性底 + 红点（与岗位行「已收藏」徽章同一套语言，只是点换成红）。
              tooltip 说清拉黑现在的实际作用 —— 写"会隐藏"而实际不隐藏是骗人。 */}
          {c.blacklisted ? (
            <span
              className="jh-state jh-state-blacked"
              title="已拉黑：岗位库默认不显示这家公司的岗位（筛选里可显示回来）"
              aria-hidden="true"
            >
              已拉黑
            </span>
          ) : null}
        </button>
        {/* 行内动作：与岗位行同一种 34px 方块，自上而下「查看岗位 → 拉黑/恢复」。
            动作含义靠 tooltip 与 aria-label 说，不占卡片宽度。 */}
        <span className="jh-job-quick" role="group" aria-label="行内动作">
          <button
            type="button"
            className="jh-job-qk"
            aria-label={`查看${c.name}的岗位`}
            title="切到岗位维度，只看这家公司的岗位（列表头栏有可移除的标记）"
            onClick={() => props.onViewJobs(c)}
          >
            <IconList />
          </button>
          <button
            type="button"
            className={`jh-job-qk${c.blacklisted ? ' jh-job-qk-ign' : ''}`}
            aria-label={c.blacklisted ? '取消拉黑' : '拉黑'}
            aria-pressed={c.blacklisted}
            title={
              c.blacklisted
                ? '取消拉黑（岗位库恢复默认显示它的岗位）'
                : '拉黑（岗位库默认不再显示它的岗位，隐藏条数会写明、可显示回来）'
            }
            disabled={props.marking}
            onClick={() => props.onBlacklist(c, !c.blacklisted)}
          >
            ✕
          </button>
        </span>
      </div>
    </li>
  )
}
