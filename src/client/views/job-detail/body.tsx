import type { JobState } from '../../../shared/contract/enums/job.js'
import type { ContactStage } from '../../../shared/contract/enums/pipeline.js'
import { DELIVERY_STATE_LABEL } from '../../../shared/contract/enums/job.js'
import { JOB_ACTION_LABEL, relativeTime, salaryDetail, splitJobTags } from '../../format/job.js'
import { useAsync } from '../../hooks/use-async.js'
import { ApiError, NeedsConfirmError } from '../../net/client.js'
import { fetchJobDetail, fetchJobHistory, markJob } from '../../net/jobs.js'
import { fetchGreetings, probeContactStage, updateContactStage } from '../../net/outreach.js'
import { deliverApplication } from '../../net/pipeline.js'
import { TailorPanel } from './tailor-panel.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { InlineMd } from '../../ui/inline-md.js'
import { OverseasPanel } from './overseas-panel.js'
import { ApplyEntry, ApplyModal } from './panels/apply-panel.js'
import { CompanyJobsPanel } from './panels/company-jobs-panel.js'
import { CompanyPanel } from './panels/company-panel.js'
import { JdPanel } from './panels/jd-panel.js'
import { MatchPanel } from './panels/match-panel.js'
import { RiskPanel } from './panels/risk-panel.js'
import { ContactStagePanel, JobFacts } from './panels/summary-panel.js'
import { TagGroups } from './panels/tag-groups.js'
import { useState } from 'react'

/** 详情里给得出的动作（不提供"标为新"——回退到未读没有意义）。 */
const ACTION_STATES: JobState[] = ['saved', 'ignored', 'seen', 'archived']


/**
 * U2 岗位详情的**正文**。
 *
 * 抽屉（流水线 / 消息 / 面试里临时看一眼）与岗位库的右侧内嵌栏共用这一份 ——
 * 两块地方的详情必须逐字一致，复制两套迟早会漂。
 *
 * 顶部是**吸顶操作条**（标题 + 薪资 + 动作）：早先动作按钮在正文最底部，
 * 右侧一屏那么长，用户根本滚不到，反馈就是"详情里没有任何操作按钮"。
 *
 * 正文按**决策距离**排列（2026-09-23 重排）：判读 → 事实 → 推进 → 原文 → 公司 → 备战。
 *   * 判读（粗筛分 + 标注依据）放最前：用户是从列表带着「粗筛 N」「外包」这两个
 *     token 点进来求证的，依据要一屏内可达 —— 低分 + 重标语的岗根本不必读 JD；
 *     分数过期的警示也**长在分数旁边**，而不是沉成页尾脚注。
 *   * 接触态从"事实与 JD 之间"移到事实卡之后：它是**推进记录**不是判读依据，
 *     与发送 / 变更记录构成一个叙事区，不打断"判读 → 求证"的主线。
 *
 * 各段正文已拆进 `./panels/*`：这里只留**编排骨架** —— 状态与请求都在本文件（hooks 不外移），
 * 子组件只收 state 值与回调；`Hint` 也留在这里，以组件形式传给要用它的两段。
 */
export function JobDetailBody(props: {
  id: number
  revision: number
  onChanged: () => void
  /** 有它时，"这家公司的其它岗位"可点击切换；抽屉场景没有这个上下文。 */
  onSelect?: ((id: number) => void) | undefined
}) {
  const { state, reload } = useAsync((signal) => fetchJobDetail(props.id, signal), [props.id, props.revision])
  const history = useAsync((signal) => fetchJobHistory(props.id, signal), [props.id, props.revision])
  /**
   * 打招呼记录（D6）。
   *
   * 与 `history`（状态变更事件）**不是一回事**，所以两个都要：
   *   * 这一条给的是"我实际发出去的那段话 + 用了哪套模板"—— 改简历/改话术（§3.2）要看它；
   *   * `history` 给的是"状态怎么变的、谁改的"。
   */
  const greetings = useAsync(
    (signal) => fetchGreetings({ jobId: props.id, limit: 5 }, signal),
    [props.id, props.revision],
  )
  const [busy, setBusy] = useState<JobState | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  /** 平台侧接触阶段的探测结果（**只读**：不改本地状态、不发任何消息）。 */
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<{ stage: ContactStage | null; note: string } | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  /** 正在保存的接触态（按钮禁用用）。 */
  const [staging, setStaging] = useState<ContactStage | null>(null)
  /** 投递简历（L4）：两步（选简历 → 看确认文案 → 确认）、进行中、结果提示。 */
  const [deliverOpen, setDeliverOpen] = useState(false)
  /** 这一步投递**登记**用哪份简历（附件 id）；`null` = 平台内简历。 */
  const [deliverResumeId, setDeliverResumeId] = useState<number | null>(null)
  const [deliverAsk, setDeliverAsk] = useState<string | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [deliverNote, setDeliverNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  /**
   * 投递简历（L4）——**真的把简历投出去**，不可逆。
   *
   * 两段式确认**走 HTTP 协议**：第一次不带 `confirm` → 宿主 409 带回 `confirmText`，
   * 用户看过之后再带 `confirm: true` 重发。界面不自己编那段文案 ——
   * §4.4.2 要求它含平台、岗位、用了哪版简历（以及**这份文件到底传不传得上去**），
   * 而只有宿主知道这些。
   *
   * 平台能力与闸门（L4 开关、隐身、额度…）都不在界面里判：这里只负责把宿主的
   * 说法原样端出来。投不了的时候，用户看到的是"哪个平台没接投递"而不是一句"失败"。
   */
  const deliver = async (confirm: boolean): Promise<void> => {
    setDelivering(true)
    setDeliverNote(null)
    try {
      const result = await deliverApplication({
        jobId: props.id,
        resumeFileId: deliverResumeId,
        ...(confirm ? { confirm: true } : {}),
      })
      // 不带 confirm 时宿主必定 409（走 catch），所以走到这里就是真的执行了
      setDeliverOpen(false)
      setDeliverAsk(null)
      setDeliverNote({
        tone: 'ok',
        text:
          `已投递（送达状态：${DELIVERY_STATE_LABEL[result.delivery]}）` +
          (result.detail === undefined ? '' : ` —— ${result.detail}`),
      })
      // 投递会写一条投递记录与状态事件，两边都要重取
      history.reload()
      props.onChanged()
    } catch (error) {
      if (error instanceof NeedsConfirmError) {
        // 第一步的回复：宿主把"要你确认什么"交回来，原样展示
        setDeliverAsk(error.confirmText)
        return
      }
      setDeliverAsk(null)
      setDeliverOpen(false)
      setDeliverNote({ tone: 'error', text: error instanceof ApiError ? error.display : String(error) })
    } finally {
      setDelivering(false)
    }
  }

  const probeStage = async (): Promise<void> => {
    setProbing(true)
    setProbeError(null)
    try {
      const result = await probeContactStage(props.id)
      setProbe({ stage: result.stage, note: result.note })
    } catch (error) {
      setProbeError(error instanceof ApiError ? error.display : String(error))
    } finally {
      setProbing(false)
    }
  }

  /**
   * 保存**本地**接触态（§12.2）。
   *
   * ⚠️ 它不改平台上任何东西 —— 探测只报事实，要不要落成状态由用户显式点。
   * 这正是 §4.3「识别 ≠ 改状态」的落点：规则识别会误判，而误判一次会让一个
   * 真在推进的岗位被漏掉。
   */
  const saveContactStage = async (to: ContactStage): Promise<void> => {
    setStaging(to)
    setProbeError(null)
    try {
      await updateContactStage(props.id, { to })
      history.reload()
      // 那条打招呼记录的 stage 也变了，所以要一起重取（否则"发送记录"里显示的还是旧态）
      greetings.reload()
      props.onChanged()
    } catch (error) {
      setProbeError(error instanceof ApiError ? error.display : String(error))
    } finally {
      setStaging(null)
    }
  }

  const mark = async (next: JobState): Promise<void> => {
    setBusy(next)
    setFailure(null)
    try {
      await markJob(props.id, next)
      props.onChanged()
      reload()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.display : String(error))
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading') {
    return <LoadingLine>正在读取详情…</LoadingLine>
  }

  if (state.status === 'error') {
    return (
      <div>
        <ErrorLine>{state.message}</ErrorLine>
        {state.hint === undefined ? null : <p className="jh-muted">{state.hint}</p>}
        <button type="button" className="jh-btn" onClick={reload}>重试</button>
      </div>
    )
  }

  const { job, jdText, company, flags, matchReasons } = state.data
  const grouped = splitJobTags(job.tags)
  /** 本地那条接触态（§12.2：最新一条打招呼记录即当前接触态）。 */
  const localStage: ContactStage = history.state.status === 'ok' ? history.state.data.contactStage : 'none'
  const contactEvents = history.state.status === 'ok' ? history.state.data.items.slice(0, 6) : []
  const sentGreetings = greetings.state.status === 'ok' ? greetings.state.data.items : []
  /** 平台探测到的态与本地不一致时，才值得提"要不要采纳"。 */
  const adoptable = probe?.stage != null && probe.stage !== localStage ? probe.stage : null
  // 解析不出来就退回原始串：宁可显示 ISO，也不要留一格空白
  const lastSeen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt

  return (
    <>
      <header className="jh-detail-head">
        <div className="jh-detail-headline">
          <h2 className="jh-detail-title">{job.title}</h2>
          <div className="jh-detail-salary">
            <b className="jh-salary">{job.salaryRaw}</b>
            {salaryDetail(job) === null ? null : (
              <span className="jh-muted">（{salaryDetail(job)}）</span>
            )}
          </div>
        </div>
        <div className="jh-detail-actions">
          {ACTION_STATES.map((action) => (
            <button
              key={action}
              type="button"
              className={`jh-btn jh-btn-inline${job.state === action ? ' jh-btn-active' : ''}`}
              disabled={busy !== null}
              onClick={() => void mark(action)}
            >
              {busy === action ? '…' : JOB_ACTION_LABEL[action]}
            </button>
          ))}
          <ApplyEntry
            delivering={delivering}
            onOpen={() => {
              setDeliverAsk(null)
              setDeliverOpen(true)
            }}
          />
        </div>
      </header>
      {failure === null ? null : <p className="jh-error">{failure}</p>}
      {deliverNote === null ? null : (
        <p className={deliverNote.tone === 'ok' ? 'jh-ok' : 'jh-error'}>{deliverNote.text}</p>
      )}

      <ApplyModal
        open={deliverOpen}
        ask={deliverAsk}
        resumeId={deliverResumeId}
        delivering={delivering}
        onClose={() => {
          setDeliverOpen(false)
          setDeliverAsk(null)
        }}
        onCancel={() => {
          setDeliverOpen(false)
        }}
        onBack={() => {
          setDeliverAsk(null)
        }}
        onResumeChange={setDeliverResumeId}
        onNext={() => void deliver(false)}
        onConfirm={() => void deliver(true)}
      />

      {/* ① 判读（2026-09-23 重排，提到 JD 之前）：用户从列表带着「粗筛 N」「外包」
          点进来就是来求证的，依据要一屏内可达 —— 低分 + 重标语的岗不必读 JD。 */}
      <MatchPanel score={job.matchScore} reasons={matchReasons} />

      {/* 分数过期的警示**长在分数旁边**（原先是沉在页面最底部的一条脚注）：它是
          分数的限定词，离开分数就没人读得到。 */}
      {job.scoreStale ? (
        <p className="jh-warn">
          <InlineMd text="这个匹配分是**旧版简历**下算出来的 —— 简历改过之后它就不再有效。用「重算」或在对话里让模型跑 `job_match_explain` 才是当前分数。" />
        </p>
      ) : null}

      <RiskPanel flags={flags} />

      {/* ② 事实：客观是什么（基本信息 + 按性质分组的标签）。 */}
      <JobFacts job={job} lastSeen={lastSeen} />

      {job.tags.length === 0 ? null : <TagGroups grouped={grouped} />}

      {/* ③ 推进（重排，从"事实与 JD 之间"移到事实卡之后）：接触态是**推进记录**
          不是判读依据，与下面的发送 / 变更记录构成一个叙事区。 */}
      <ContactStagePanel
        probe={probe}
        probing={probing}
        probeError={probeError}
        localStage={localStage}
        contactLoading={history.state.status === 'loading'}
        staging={staging}
        adoptable={adoptable}
        sentGreetings={sentGreetings}
        contactEvents={contactEvents}
        onProbe={() => void probeStage()}
        onSaveStage={(to) => void saveContactStage(to)}
      />

      {/* ④ 原文：自己求证。 */}
      <JdPanel jdText={jdText} />

      {/* ⑤ 公司情报：画像 + 人工复核 + 其它岗位（背景调查）。 */}
      {company === null ? null : (
        <>
          <CompanyPanel company={company} onSaved={reload} />

          <CompanyJobsPanel
            companyId={company.id}
            jobCount={company.jobCount}
            currentJobId={job.id}
            onSelect={props.onSelect}
          />
        </>
      )}

      {/* ⑥ 备战 —— U4：针对这个岗位的简历定制（§13）。产出的是**建议**，采用与否在你。 */}
      <TailorPanel jobId={props.id} revision={props.revision} onChanged={props.onChanged} />

      {/* ⑦ 海外支线（P8 / §4.M）—— 工签/远程识别、时区双重换算、Cover Letter */}
      <OverseasPanel jobId={props.id} onChanged={props.onChanged} />

      {/* 尾注：求证的最终出口。 */}
      <p className="jh-note">
        原始页面：
        <a className="jh-link" href={job.sourceUrl} target="_blank" rel="noreferrer noopener">
          {job.sourceUrl}
        </a>
      </p>
    </>
  )
}
