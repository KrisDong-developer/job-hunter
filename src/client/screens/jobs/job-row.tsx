import { JOB_FLAG_LABEL, type JobState } from '../../../shared/contract/enums/job.js'
import { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL } from '../../../shared/contract/enums/pipeline.js'
import { JOB_STATE_LABEL } from '../../../shared/contract/enums/job.js'
import type { JobDto } from '../../../shared/contract/dto/job.js'
import { relativeTime, localDateTime } from '../../format/job.js'
import { DedupComparePane } from './dedup-compare-pane.js'
import { IconChat, IconSend } from './icons.js'

/**
 * 列表里单个岗位的那一整块行：勾选框 / 卡片 / 行内三个动作 / 跨平台对照开关。
 *
 * 状态与回调**全部由父组件持有**（勾选集合、正在被标记的 id、展开着的那一组），
 * 这里只把它们画出来 —— 这样"翻页后勾选不丢"这类规则仍然只有一个地方在管。
 */
export function JobRow(props: {
  job: JobDto
  active: boolean
  picked: boolean
  marking: boolean
  openGroup: number | null
  onSelect: (id: number) => void
  onTogglePick: (id: number, checked: boolean) => void
  onGreet: (id: number) => void
  onDeliver: (id: number) => void
  onQuickMark: (id: number, state: JobState) => void
  onToggleGroup: (groupId: number) => void
}) {
  const job = props.job
  const active = props.active
  const requirements = [job.expReq, job.eduReq].filter((item) => item !== '').join('·')
  // 两个时间回答的是两个不同的问题，都要露在卡片上：
  //   抓取 = 这份记录是什么时候拿到手的（数据来路，也是列表默认排序用的那一列）
  //   最近见到 = 最近一次在平台上又看到它（新鲜度，"这岗还在招吗"）
  // 解析不出来就印原始串（与详情页一致），不硬凑一个"未知时间"。
  const crawled = relativeTime(job.crawledAt) ?? job.crawledAt
  const seen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt
  /** 落成局部 const 再判空：`job.dedupGroupId` 的属性收窄传不进箭头函数，展开开关的回调要用它。 */
  const dedupGroupId = job.dedupGroupId
  /**
   * 卡片可访问名称里的"信号"（第四轮修复，审核 P3）。
   *
   * 卡片正文整体 `aria-hidden`（否则读屏会把六类文本顺成一长串当按钮名），
   * 代价是粗筛分与风险标注也一起被藏了 —— 而"外包 / 高风险 / 僵尸岗"恰恰是
   * 决定要不要看这条的依据。所以把它们补回名称里；标签（tags）仍然不进，
   * 它们不是决策依据，只会把名称再撑长。
   */
  const signals = [
    job.matchScore === null ? '' : `粗筛 ${String(job.matchScore)}`,
    job.flagTypes.map((type) => JOB_FLAG_LABEL[type]).join('、'),
  ].filter((item) => item !== '').join('，')
  return (
    <li>
      <div className="jh-job-row">
        {/* 勾选框：单独一列，不嵌在"点开详情"的按钮里
            （按钮嵌控件是无效 HTML，读屏与键盘都会乱）。
            它的存在只为一件事：批量打招呼（D3 / U1）。
            ── 第四轮（审核 P2-11）：外面包一层 label —— 裸 input 的命中区只有
            控件自身（约 13×13px），触屏上很容易点成"打开详情"。包成 label 之后
            整块都能勾，尺寸与内边距见 .jh-job-pick。 */}
        <label className="jh-job-pick">
          <input
            type="checkbox"
            checked={props.picked}
            aria-label={`选中「${job.title}」（用于批量打招呼）`}
            onChange={(event) => props.onTogglePick(job.id, event.target.checked)}
          />
        </label>
        <button
          type="button"
          className={`jh-job${active ? ' jh-job-active' : ''}`}
          data-job-id={job.id}
          aria-current={active ? 'true' : undefined}
          /* 卡片里塞着标题/薪资/城市/公司/标签/分数/状态，读屏会把这一长串
             当成按钮名念完（实测约 60 字）。给一个**短而完整**的名称，
             卡内文本对读屏隐藏 —— 视觉完全不变。 */
          aria-label={`岗位：${job.title}，${job.salaryRaw}，${job.city}${job.district === '' ? '' : `·${job.district}`}，${JOB_STATE_LABEL[job.state]}${signals === '' ? '' : `，${signals}`}`}
          onClick={() => props.onSelect(job.id)}
        >
          <span className="jh-job-main" aria-hidden="true">
            <span className="jh-job-title">{job.title}</span>
            <span className="jh-job-meta">
              <b className="jh-salary">{job.salaryRaw}</b>
              <span>{job.city}{job.district === '' ? '' : `·${job.district}`}</span>
              {/* 经验与学历合成一格："3-5年·本科"。两个都缺就整格不占位 ——
                  宁可少一格，也不要出现"—·—"这种占位垃圾。 */}
              {requirements === '' ? null : <span>{requirements}</span>}
              <span className="jh-job-company">{job.companyName ?? '—'}</span>
            </span>
            {/* 来源平台 + 两个时间：一条岗位从哪来、这份记录什么时候拿到的、
                最近一次见到它是什么时候。抓取时间正是列表默认排序用的那一列
                （`crawled_at`），可它在界面上从来没露过面 —— 用户按"抓取时间"
                排完了，却指不出哪一列是它。两个都写 `title` 给出精确时刻：
                相对时间好读，绝对时间才是事实。
                ── 第四轮（审核 P2-9）：title 里原来直接放原始 ISO
                （2026-09-20T05:33:00.000Z，还是 UTC）—— 那对人不是一个时刻。
                改走 localDateTime：本地时间、跨年才带年份。 */}
            <span className="jh-job-origin">
              <span>{job.platformName ?? job.platformId}</span>
              <span title={localDateTime(job.crawledAt)}>抓取 {crawled}</span>
              <span title={localDateTime(job.lastSeenAt)}>最近见到 {seen}</span>
              {/* 批次 4：这条岗位在别的平台也在招（同一组）。
                  徽章只是**读数**；"展开对照"是卡片下面那枚开关。 */}
              {dedupGroupId === null ? null : (
                <span className="jh-dedup-badge" title="与其它平台的同一岗位合并成了一组">
                  跨平台
                </span>
              )}
            </span>
            {job.tags.length === 0 ? null : (
              <span className="jh-tags">
                {job.tags.slice(0, 8).map((tag) => (
                  <span key={tag} className="jh-tag">{tag}</span>
                ))}
              </span>
            )}
            {(job.flagTypes.length > 0 || job.matchScore !== null) && (
              <span className="jh-job-signals">
                {job.matchScore === null ? null : (
                  // 明确写「粗筛」：L1 规则分不是完整评估（§4.5.1）
                  <span className="jh-score">粗筛 {job.matchScore}</span>
                )}
                {job.flagTypes.map((type) => (
                  <span key={type} className={`jh-flag jh-flag-${type}`}>
                    {JOB_FLAG_LABEL[type]}
                  </span>
                ))}
              </span>
            )}
          </span>
          <span className={`jh-state jh-state-${job.state}`} aria-hidden="true">{JOB_STATE_LABEL[job.state]}</span>
        </button>
        {/* 卡片右侧的行内动作，自上而下：打招呼 → 投递简历 → 划掉。
            这一列只放"对这一条做什么"，「收藏」因此去掉了：★ 与 ✕ 本来是
            一对互斥的处置态开关，而现在这一列要放两个对外动作 —— 三个按钮
            各 34px 已经够高，收藏在详情里照样能改，不必两条路径并列。
            跨平台「对照」也移出了这一列（见下面那枚独立的开关）。 */}
        <span className="jh-job-quick" role="group" aria-label="行内动作">
          {/* 打招呼 / 投递简历：与 ✕ **同一种形态**（34px 方块 + 一个图标），
              三个按钮排成一列，宽度一致、不随文案长短抖动。
              动作含义靠 tooltip 与 aria-label 说，不占卡片宽度。
              点下去不直接发送：把这一条预置进既有弹窗，预览、话术、限额、
              回执与批量入口完全同一套，不另长一条发送链路。
              已经接触过 / 投过的置灰（`:disabled`），tooltip 里写明是哪个阶段。 */}
          <button
            type="button"
            className="jh-job-qk"
            aria-label={job.contactStage === 'none' ? '打招呼' : CONTACT_STAGE_LABEL[job.contactStage]}
            title={
              job.contactStage === 'none'
                ? '打招呼（先只读预览，确认后才发）'
                : `${CONTACT_STAGE_LABEL[job.contactStage]} —— 不重复发`
            }
            disabled={job.contactStage !== 'none'}
            onClick={() => props.onGreet(job.id)}
          >
            <IconChat />
          </button>
          <button
            type="button"
            className="jh-job-qk"
            aria-label={job.applicationStage === null ? '投递简历' : APPLICATION_STAGE_LABEL[job.applicationStage]}
            title={
              job.applicationStage === null
                ? '投递简历（不可逆，预览里确认后才发）'
                : `${APPLICATION_STAGE_LABEL[job.applicationStage]} —— 不重复投`
            }
            disabled={job.applicationStage !== null}
            onClick={() => props.onDeliver(job.id)}
          >
            <IconSend />
          </button>
          {/* 划掉 = ignored，再点一次回到中性的 seen。
              与详情里的动作条看同一份状态，改完整列重载。 */}
          <button
            type="button"
            className={`jh-job-qk${job.state === 'ignored' ? ' jh-job-qk-ign' : ''}`}
            aria-label={job.state === 'ignored' ? '恢复' : '划掉'}
            aria-pressed={job.state === 'ignored'}
            title={job.state === 'ignored' ? '取消划掉（回到已读）' : '划掉（忽略）'}
            disabled={props.marking}
            onClick={() => void props.onQuickMark(job.id, job.state === 'ignored' ? 'seen' : 'ignored')}
          >✕</button>
        </span>
      </div>
      {/* 跨平台对照的开关。放在卡片**下面**而不是卡片里面：卡片本身就是一个
          按钮（点它 = 看详情），按钮里再嵌按钮是无效 HTML，读屏与键盘都会乱 ——
          它原来挤在快捷列里也是这个原因。展开的内容仍落在这一行下面，
          不遮住列表其它行。 */}
      {dedupGroupId === null ? null : (
        <button
          type="button"
          className={`jh-dedup-toggle${props.openGroup === dedupGroupId ? ' jh-dedup-toggle-on' : ''}`}
          aria-expanded={props.openGroup === dedupGroupId}
          title="这条岗位在别的平台也在招 —— 点开看各平台的对照"
          onClick={() => props.onToggleGroup(dedupGroupId)}
        >
          {props.openGroup === dedupGroupId ? '收起跨平台对照' : '跨平台对照'}
        </button>
      )}
      {/* 跨平台对照：展开在那一行**下面**，不遮住列表其它行 */}
      {dedupGroupId === null || props.openGroup !== dedupGroupId ? null : (
        <DedupComparePane groupId={dedupGroupId} onSelect={props.onSelect} />
      )}
    </li>
  )
}
