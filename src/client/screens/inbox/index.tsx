import type { MessageDto } from '../../../shared/contract/dto/message.js'
import type { InterviewKind } from '../../../shared/contract/enums/interview.js'
import type { ReplyScenario } from '../../../shared/contract/enums/message.js'
import { INTERVIEW_KINDS, INTERVIEW_KIND_LABEL } from '../../../shared/contract/enums/interview.js'
import { REPLY_SCENARIOS, REPLY_SCENARIO_LABEL } from '../../../shared/contract/enums/message.js'
import { useAsync } from '../../hooks/use-async.js'
import { ApiError } from '../../net/client.js'
import { fetchPlatforms } from '../../net/collect/platforms.js'
import { createInterview, draftReply, extractInterview, fetchInbox, markMessageRead, recordMessage, replyMessage, syncInbox } from '../../net/inbox.js'
import { useState } from 'react'

/**
 * U6 消息中心（§13）。
 *
 * 一条刻意的产品规则：**识别面试邀约 != 改状态**。
 * 规则命中只标一个 ⚠ 提示，改状态要用户自己点 —— 误判一次就会让一个真在推进的岗位被漏掉。
 * 这里也允许手动录入消息：平台收件箱的自动解析属于 P8，现在不假装能做。
 */
export function InboxScreen(props: { revision: number; onChanged: () => void; onSelectJob: (id: number) => void }) {
  const inbox = useAsync((signal) => fetchInbox({}, signal), [props.revision])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const filtered = useAsync(
    (signal) => fetchInbox({ unreadOnly }, signal),
    [props.revision, unreadOnly],
  )
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [draftingScenario, setDraftingScenario] = useState<ReplyScenario | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * 收件箱同步：把所有可同步的平台依次读一遍。
   *
   * 选平台的条件是**两个都要**：适配器实现了 `readInbox`（我们真能读）**且**该平台已登录
   * （否则会撞登录墙，读到的是"失败"而不是"没人回我"）。某个平台失败会直接抛出来 ——
   * 这里**不吞掉**，因为"读不到"和"没人回我"必须让用户分得清。
   */
  const syncFromPlatforms = async (): Promise<void> => {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const listed = await fetchPlatforms()
      const targets = listed.items.filter(
        (item) => item.implementation.actions.readInbox && item.account.loggedIn,
      )
      if (targets.length === 0) {
        setNotice(
          '没有可同步的平台：需要**已登录**且适配器实现了收件箱读取' +
            '（目前是 BOSS 直聘 / 智联招聘）。先去「采集」页完成登录。',
        )
        return
      }
      const parts: string[] = []
      for (const item of targets) {
        const result = await syncInbox({ platformId: item.id })
        parts.push(
          `${item.displayName} 读到 ${String(result.fetched)} 条` +
            `（新增 ${String(result.recorded)}、重复 ${String(result.duplicates)}、未读 ${String(result.unread)}）`,
        )
      }
      setNotice(`收件箱同步完成 —— ${parts.join('；')}`)
      props.onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setSyncing(false)
    }
  }

  /** 「识别日程」面板：从消息抽出并让用户确认后再建面试（识别 ≠ 改状态）。 */
  const [extracting, setExtracting] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [extractPanel, setExtractPanel] = useState<{
    messageId: number
    jobId: number | null
    at: string
    kind: InterviewKind
    place: string
    link: string
    via: 'llm' | 'fallback'
    notes: string[]
  } | null>(null)

  const patchExtract = (patch: Partial<NonNullable<typeof extractPanel>>): void => {
    setExtractPanel((current) => (current === null ? null : { ...current, ...patch }))
  }

  const handleExtract = async (message: MessageDto): Promise<void> => {
    setExtracting(message.id)
    setError(null)
    try {
      const suggestion = await extractInterview(message.id)
      setExtractPanel({
        messageId: message.id,
        jobId: message.jobId,
        at: suggestion.at ?? '',
        kind: suggestion.kind ?? 'video',
        place: suggestion.place ?? '',
        link: suggestion.link ?? '',
        via: suggestion.via,
        notes: suggestion.notes,
      })
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setExtracting(null)
    }
  }

  const handleDraftReply = async (id: number, scenario: ReplyScenario): Promise<void> => {
    setDraftingScenario(scenario)
    setError(null)
    try {
      const draft = await draftReply(id, scenario)
      setReplyText(draft.text)
      setNotice(
        draft.via === 'llm'
          ? `已按「${REPLY_SCENARIO_LABEL[scenario]}」拟稿（模型）—— 可编辑后发送。`
          : `已用内置模板拟稿（未配置模型）—— 请改成你的真实语气。`,
      )
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setDraftingScenario(null)
    }
  }

  const confirmInterview = async (): Promise<void> => {
    const panel = extractPanel
    if (panel === null || panel.at === '') return
    setCreating(true)
    setError(null)
    try {
      await createInterview({
        at: new Date(panel.at).toISOString(),
        kind: panel.kind,
        ...(panel.jobId === null ? {} : { jobId: panel.jobId }),
        ...(panel.place.trim() === '' ? {} : { place: panel.place.trim() }),
        ...(panel.link.trim() === '' ? {} : { link: panel.link.trim() }),
      })
      setNotice('已加入面试日程 —— 建议到「面试日程」里再核对一遍时间与形式。')
      setExtractPanel(null)
      props.onChanged()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught),
      )
    } finally {
      setCreating(false)
    }
  }

  const data = filtered.state.status === 'ok' ? filtered.state.data : inbox.state.status === 'ok' ? inbox.state.data : null

  const run = async (fn: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(done)
      props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jh-screen">
      <div className="jh-row-head">
        <h2 className="jh-card-title">消息中心</h2>
        <span className="jh-muted">未读 {data?.unread ?? 0} 条</span>
        <span className="jh-spacer" />
        {/* 收件箱同步：把所有"已登录 + 适配器实现了 readInbox"的平台依次读一遍。
            低危（不对外发任何东西），所以没有二次确认 —— 与对话里的 inbox_sync 是同一条链路。 */}
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          disabled={syncing}
          onClick={() => void syncFromPlatforms()}
        >
          {syncing ? '同步中…' : '同步收件箱'}
        </button>
        <button
          type="button"
          className={`jh-btn jh-btn-inline${unreadOnly ? ' jh-btn-active' : ''}`}
          onClick={() => setUnreadOnly((value) => !value)}
        >
          只看未读
        </button>
      </div>

      {error === null ? null : <p className="jh-error">{error}</p>}
      {notice === null ? null : <p className="jh-ok">{notice}</p>}

      <div className="jh-card">
        <h3 className="jh-card-title">手动录入一条消息</h3>
        <p className="jh-muted">
          平台收件箱可以**自动同步**（右上角「同步收件箱」，或直接让我调 `inbox_sync`）：
          它读平台会话列表并去重入库，读不到时会**如实报错**而不是返回 0 条。
          这里的手动录入留给"平台读不到、或你想自己补一条"的场合。
        </p>
        <textarea
          className="jh-textarea"
          rows={2}
          /* 录入框必须有可访问名称：原来只有 placeholder，
             输入一次之后 placeholder 就消失，读屏也拿不到标签。 */
          aria-label="要录入的消息内容"
          placeholder="把 HR 发来的消息贴在这里…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="jh-detail-actions">
          <button
            type="button"
            className="jh-btn"
            disabled={busy || draft.trim() === ''}
            onClick={() =>
              void run(
                async () => await recordMessage({ platformId: 'manual', direction: 'hr', content: draft.trim() }),
                '已录入（如果是面试邀约，下面会标出来 —— 但状态要你自己改）',
              ).then(() => setDraft(''))
            }
          >
            录入
          </button>
        </div>
      </div>

      {data === null ? (
        <p className="jh-muted">正在读取消息…</p>
      ) : data.items.length === 0 ? (
        <p className="jh-muted">没有消息。消息目前靠手动录入，或在岗位详情里跟进。</p>
      ) : (
        <ul className="jh-messages">
          {data.items.map((message) => (
            <li className={`jh-message jh-message-${message.direction}`} key={message.id}>
              <div className="jh-message-head">
                <b>{message.direction === 'hr' ? 'HR' : '我'}</b>
                <span className="jh-muted">{message.at.slice(0, 16).replace('T', ' ')}</span>
                {message.jobTitle === null ? null : (
                  <button
                    type="button"
                    className="jh-link"
                    onClick={() => message.jobId !== null && props.onSelectJob(message.jobId)}
                  >
                    {message.companyName ?? ''} {message.jobTitle}
                  </button>
                )}
                <span className="jh-spacer" />
                {message.readAt === null && message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={busy}
                    onClick={() => void run(async () => await markMessageRead(message.id), '已标记已读')}
                  >
                    标记已读
                  </button>
                ) : null}
                {message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    disabled={extracting !== null}
                    onClick={() => void handleExtract(message)}
                  >
                    {extracting === message.id ? '识别中…' : '识别日程'}
                  </button>
                ) : null}
                {message.direction === 'hr' ? (
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline"
                    onClick={() => {
                      setReplyTo(replyTo === message.id ? null : message.id)
                      setReplyText('')
                    }}
                  >
                    {replyTo === message.id ? '取消' : '回复'}
                  </button>
                ) : null}
              </div>
              <p className="jh-message-body">{message.content}</p>
              {message.inviteSignal?.hit === true ? (
                <p className="jh-warn">
                  ⚠ 疑似面试邀约（命中：{message.inviteSignal.keywords.join('、')}）
                  —— 这只是提示，改状态请到「面试日程」里显式新建一场。
                </p>
              ) : null}
              {extractPanel !== null && extractPanel.messageId === message.id ? (
                <div className="jh-message-reply">
                  <p className="jh-muted">
                    识别结果（来源：{extractPanel.via === 'llm' ? '模型' : '规则'}）—— 核对后确认才进日程。
                  </p>
                  <div className="jh-inline">
                    <input
                      className="jh-input"
                      type="datetime-local"
                      aria-label="面试时间"
                      value={extractPanel.at}
                      onChange={(event) => patchExtract({ at: event.target.value })}
                    />
                    <select
                      className="jh-select jh-input-sm"
                      aria-label="面试形式"
                      value={extractPanel.kind}
                      onChange={(event) => patchExtract({ kind: event.target.value as InterviewKind })}
                    >
                      {INTERVIEW_KINDS.map((kind) => (
                        <option key={kind} value={kind}>{INTERVIEW_KIND_LABEL[kind]}</option>
                      ))}
                    </select>
                    <input
                      className="jh-input jh-input-sm"
                      placeholder="地点"
                      aria-label="地点"
                      value={extractPanel.place}
                      onChange={(event) => patchExtract({ place: event.target.value })}
                    />
                    <input
                      className="jh-input"
                      placeholder="会议链接"
                      aria-label="会议链接"
                      value={extractPanel.link}
                      onChange={(event) => patchExtract({ link: event.target.value })}
                    />
                  </div>
                  {extractPanel.notes.length === 0 ? null : (
                    <p className="jh-muted">{extractPanel.notes.join('；')}</p>
                  )}
                  <div className="jh-detail-actions">
                    <button
                      type="button"
                      className="jh-btn"
                      disabled={creating || extractPanel.at === ''}
                      onClick={() => void confirmInterview()}
                    >
                      加入面试日程
                    </button>
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-quiet"
                      disabled={creating}
                      onClick={() => setExtractPanel(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              {replyTo === message.id ? (
                <div className="jh-message-reply">
                  <div className="jh-chips" role="group" aria-label="按情境拟稿">
                    <span className="jh-muted">拟稿：</span>
                    {REPLY_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.key}
                        type="button"
                        className="jh-btn jh-btn-tiny"
                        disabled={draftingScenario !== null}
                        onClick={() => void handleDraftReply(message.id, scenario.key)}
                      >
                        {draftingScenario === scenario.key ? '拟稿中…' : REPLY_SCENARIO_LABEL[scenario.key]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="jh-textarea"
                    rows={2}
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="回复内容…"
                  />
                  <button
                    type="button"
                    className="jh-btn"
                    disabled={busy || replyText.trim() === ''}
                    onClick={() =>
                      void run(
                        async () => await replyMessage(message.id, replyText.trim()),
                        '已回复（回复是会真的发出去的动作，走的是同一道闸门）',
                      ).then(() => {
                        setReplyTo(null)
                        setReplyText('')
                      })
                    }
                  >
                    发送回复
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}




