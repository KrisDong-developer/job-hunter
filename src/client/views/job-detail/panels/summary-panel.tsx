import type { JobDto } from '../../../../shared/contract/dto/job.js'
import type { GreetingDto, StageEventDto } from '../../../../shared/contract/dto/pipeline.js'
import type { ContactStage } from '../../../../shared/contract/enums/pipeline.js'
import { CONTACT_STAGE_LABEL, MANUAL_CONTACT_STAGES } from '../../../../shared/contract/enums/pipeline.js'
import { JOB_STATE_LABEL } from '../../../../shared/contract/enums/job.js'

/** 基本信息表：公司 / 地点 / 经验 / 学历 / 来源平台 / 发布 / 首次见到 / 最近见到 / 当前状态。 */
export function JobFacts(props: { job: JobDto; /** 「最近见到」的显示串（相对时间，解析不出来时是 ISO）。 */ lastSeen: string }) {
  return (
    <ul className="jh-kv">
      <li><span>公司</span><span>{props.job.companyName ?? '—'}</span></li>
      <li><span>地点</span><span>{props.job.city}{props.job.district === '' ? '' : `·${props.job.district}`}</span></li>
      <li><span>经验</span><span>{props.job.expReq === '' ? '—' : props.job.expReq}</span></li>
      <li><span>学历</span><span>{props.job.eduReq === '' ? '—' : props.job.eduReq}</span></li>
      <li><span>来源平台</span><span>{props.job.platformName ?? props.job.platformId}</span></li>
      <li><span>发布</span><span>{props.job.publishedAt ?? '—'}</span></li>
      <li><span>首次见到</span><span>{props.job.firstSeenAt}</span></li>
      {/* 「最近见到」是判断"这岗还在招吗"的依据：它一直只是排序字段，
          界面上从来没显示过。相对时间比 ISO 串更能直接读出结论。 */}
      <li><span>最近见到</span><span>{props.lastSeen}</span></li>
      <li><span>当前状态</span><span>{JOB_STATE_LABEL[props.job.state]}</span></li>
    </ul>
  )
}

/**
 * 接触态（§12.2）—— 上下两块，界线是刻意的：
 * · **本地**那条是可以改的记录（状态机，改了要留事件）；
 * · **平台**上那条是只读的事实（探测），所以永远跟着 probe.note
 *   （它明说"没有改动任何本地状态"）。
 * 在此之前本地接触态**在界面上根本看不到也改不了** —— `advanceContact` 写好了却零调用，
 * 于是它永远停在「已打招呼」，而"未读超时 / 已读未回"两条跟进建议分别挂在
 * 「已送达」/「HR 已读」上 …… 整条跟进链路是空的。
 */
export function ContactStagePanel(props: {
  /** 平台侧探测结果；`null` = 还没探测过。 */
  probe: { stage: ContactStage | null; note: string } | null
  probing: boolean
  probeError: string | null
  /** 本地那条接触态（最新一条打招呼记录即当前接触态）。 */
  localStage: ContactStage
  /** 接触记录还在读（决定那句提示文案）。 */
  contactLoading: boolean
  /** 正在保存的接触态（按钮禁用用）。 */
  staging: ContactStage | null
  /** 平台探测到的态与本地不一致时，才值得提"要不要采纳"。 */
  adoptable: ContactStage | null
  sentGreetings: GreetingDto[]
  contactEvents: StageEventDto[]
  onProbe: () => void
  onSaveStage: (to: ContactStage) => void
}) {
  /* 取成 const：属性访问的收窄穿不过下面的 onClick 闭包（TS 只对 const 保持收窄）。 */
  const { adoptable } = props
  return (
    <div className="jh-card jh-card-tight">
      <div className="jh-row-head">
        <span className="jh-tag-group-name">接触态</span>
        <span className="jh-spacer" />
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={props.probing}
          onClick={props.onProbe}
        >
          {props.probing ? '探测中…' : '探测平台状态'}
        </button>
      </div>

      {props.probeError === null ? null : <p className="jh-error">{props.probeError}</p>}

      <p className="jh-muted">
        {props.contactLoading
          ? '正在读取接触记录…'
          : props.localStage === 'none'
            ? '还没有本地接触记录（打过招呼之后才会有）。下面是人工标记的入口。'
            : `本地记录：${CONTACT_STAGE_LABEL[props.localStage]}。改动只写本地账，平台上不会有任何动作。`}
      </p>
      <div className="jh-detail-actions">
        {MANUAL_CONTACT_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            className={`jh-btn jh-btn-inline${stage === props.localStage ? ' jh-btn-active' : ''}`}
            disabled={props.staging !== null || stage === props.localStage}
            title={
              stage === props.localStage
                ? '当前就是这一态'
                : `记成「${CONTACT_STAGE_LABEL[stage]}」（只改本地记录，不碰平台）`
            }
            onClick={() => void props.onSaveStage(stage)}
          >
            {props.staging === stage ? '…' : CONTACT_STAGE_LABEL[stage]}
          </button>
        ))}
      </div>

      {props.probe === null ? (
        <p className="jh-muted">
          还没探测过。探测只**读**平台上的状态（不发消息、不投递），也不会改动本地状态。
        </p>
      ) : (
        <>
          <p>
            平台上：<b>{props.probe.stage === null ? '判不出来' : CONTACT_STAGE_LABEL[props.probe.stage]}</b>
            {adoptable === null ? null : (
              <button
                type="button"
                className="jh-link"
                disabled={props.staging !== null}
                onClick={() => void props.onSaveStage(adoptable)}
              >
                采纳为本地状态
              </button>
            )}
          </p>
          <p className="jh-muted">{props.probe.note}</p>
        </>
      )}

      {props.sentGreetings.length === 0 ? null : (
        <details className="jh-details">
          <summary>发送记录（{props.sentGreetings.length} 条，最近在前）</summary>
          <ul className="jh-tailor-notes">
            {props.sentGreetings.map((greeting) => (
              <li key={greeting.id}>
                <div className="jh-muted">
                  {greeting.sentAt.slice(0, 16).replace('T', ' ')} · {CONTACT_STAGE_LABEL[greeting.stage]}
                  {greeting.templateName === null ? '' : ` · 模板「${greeting.templateName}」`}
                  {greeting.actor === 'model' ? ' · 模型发起' : ''}
                </div>
                <div>{greeting.content}</div>
              </li>
            ))}
          </ul>
          <p className="jh-muted">
            这里是你实际发出去的那段话（要改简历还是改话术，看这个）；上面「变更记录」记的是状态怎么变的。
          </p>
        </details>
      )}

      {props.contactEvents.length === 0 ? null : (
        <details className="jh-details">
          <summary>变更记录（{props.contactEvents.length} 条，最近在前）</summary>
          <ul className="jh-tailor-notes">
            {props.contactEvents.map((event) => (
              <li key={event.id} className="jh-muted">
                {event.at.slice(0, 16).replace('T', ' ')} ·{' '}
                {event.fromStage === null ? '—' : event.fromStage} → {event.toStage}
                {' · '}
                {event.source === 'model' ? '模型' : event.source === 'auto' ? '自动识别' : '人工'}
                {event.note === null ? '' : ` · ${event.note}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
