import type { LlmCallDto } from '../../../shared/contract/dto/settings.js'
import { ErrorLine } from '../../ui/async-view.js'
import type { LlmState } from './logs-panel.js'

export function LlmCallsTable(props: {
  llm: LlmState
  labelOf: (purpose: string) => string
  purpose: string
  setPurpose: (value: string) => void
  status: 'all' | 'ok' | 'fail'
  setStatus: (value: 'all' | 'ok' | 'fail') => void
  query: string
  setQuery: (value: string) => void
  onOpenPayload: (call: LlmCallDto) => void
}) {
  const llmItems = props.llm.status === 'ok' ? props.llm.data.items : []
  // 场景下拉用**日志里实际出现过的**用途，而不是用途枚举 ——
  // 留痕表里可能有历史用途（枚举改过名、或某项已下线），按枚举筛就查不到它们。
  const purposes = [...new Set(llmItems.map((item) => item.purpose))].sort()
  const needle = props.query.trim().toLowerCase()
  const shown = llmItems.filter((item) => {
    if (props.purpose !== '' && item.purpose !== props.purpose) return false
    if (props.status === 'ok' && !item.ok) return false
    if (props.status === 'fail' && item.ok) return false
    if (needle === '') return true
    return [item.purpose, props.labelOf(item.purpose), item.model ?? '', item.errorCode ?? '', item.fields.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  // 按用途汇总（宿主已经算好，随响应一起回来）。按 token 从多到少排 —— 一眼看到"谁最贵"。
  const usage = (props.llm.status === 'ok' ? props.llm.data.stats : [])
    .map((item) => ({
      purpose: item.purpose,
      calls: item.calls,
      tokens: item.promptTokens + item.completionTokens,
    }))
    .sort((left, right) => right.tokens - left.tokens)

  return (
    <section className="jh-card">
      <h2 className="jh-card-title">模型调用留痕（我发了什么给模型）</h2>
      {props.llm.status === 'error' && <ErrorLine>{props.llm.message}</ErrorLine>}
      {props.llm.status === 'ok' && (
        <>
          <div className="jh-filters">
            <select
              className="jh-select"
              aria-label="按场景筛选"
              value={props.purpose}
              onChange={(event) => props.setPurpose(event.target.value)}
            >
              <option value="">全部场景</option>
              {purposes.map((item) => (
                <option key={item} value={item}>
                  {props.labelOf(item)}（{item}）
                </option>
              ))}
            </select>
            <select
              className="jh-select"
              aria-label="按状态筛选"
              value={props.status}
              onChange={(event) => props.setStatus(event.target.value as 'all' | 'ok' | 'fail')}
            >
              <option value="all">全部状态</option>
              <option value="ok">成功</option>
              <option value="fail">失败</option>
            </select>
            <input
              className="jh-input jh-input-grow"
              type="search"
              aria-label="搜索调用记录"
              placeholder="搜索场景 / 模型 / 字段 / 错误…"
              value={props.query}
              onChange={(event) => props.setQuery(event.target.value)}
            />
            <span className="jh-filter-note">
              显示 {shown.length} / {llmItems.length} 条
            </span>
          </div>

          {/* 按用途汇总：回答"哪几项在烧 token"，它正是"该关掉哪个用途"的依据。
              口径要说清 —— 它是**全部**调用的汇总，不受上面的筛选影响。 */}
          {usage.length === 0 ? null : (
            <>
              <h3 className="jh-section-title">按用途汇总（不受上面的筛选影响）</h3>
              <div className="jh-usage">
                {usage.map((item) => (
                  <span className="jh-usage-item" key={item.purpose}>
                    <span className="jh-usage-name">{props.labelOf(item.purpose)}</span>
                    <span className="jh-usage-num">{item.calls}</span>
                    <span className="jh-usage-unit">次</span>
                    <span className="jh-usage-num">{item.tokens}</span>
                    <span className="jh-usage-unit">token</span>
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="jh-table-scroll">
            <table className="jh-table jh-table-roomy">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">用途</th>
                  <th scope="col">模型</th>
                  <th scope="col">外发字段</th>
                  <th scope="col" className="jh-num">
                    Token
                  </th>
                  <th scope="col" className="jh-cell-status">
                    结果
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((call: LlmCallDto) => {
                  const result = resultOf(call)
                  return (
                    <tr key={call.id}>
                      {/* 时间列不加 .jh-num：表头是左对齐的，单元格右对齐会让列内错位 */}
                      <td>{call.at.slice(5, 16).replace('T', ' ')}</td>
                      <td>{props.labelOf(call.purpose)}</td>
                      <td>{call.model ?? '—'}</td>
                      {/* 开发字段的长串占满表格宽度：这里只留数量，点开看完整 payload */}
                      <td>
                        {call.fields.length === 0 ? (
                          <span className="jh-muted">—</span>
                        ) : (
                          <button
                            type="button"
                            className="jh-link jh-payload-link"
                            aria-label={`查看这次调用的完整留痕（外发 ${String(call.fields.length)} 个字段）`}
                            onClick={() => props.onOpenPayload(call)}
                          >
                            已选中 {call.fields.length} 项
                          </button>
                        )}
                      </td>
                      <td className="jh-num">{call.promptTokens + call.completionTokens}</td>
                      <td className="jh-cell-status">
                        <span className={`jh-tag jh-tag-clip ${result.tone}`} title={result.full}>
                          {result.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {llmItems.length === 0 && <p className="jh-muted">还没有调用记录。</p>}
          {llmItems.length > 0 && shown.length === 0 && (
            <p className="jh-muted">没有匹配的调用记录 —— 清掉上面的筛选条件再看看。</p>
          )}
          <p className="jh-note">{props.llm.data.note}</p>
        </>
      )}
    </section>
  )
}

/** 调用结果 → 状态标签的文案与配色。 */
function resultOf(call: LlmCallDto): { text: string; tone: string; full: string } {
  if (call.ok) return { text: '成功', tone: 'jh-tone-ok', full: '成功' }
  // `errorCode` 这一列存的其实是宿主的**错误消息**（如「模型返回了空内容」），
  // 所以「返回空内容」这种软失败（重试往往就好）与调用真的报错分开配色。
  const raw = call.errorCode ?? '失败'
  const soft = raw.includes('空内容')
  return {
    text: soft ? '模型返回空内容' : raw,
    tone: soft ? 'jh-tone-warn' : 'jh-tone-error',
    full: raw,
  }
}
