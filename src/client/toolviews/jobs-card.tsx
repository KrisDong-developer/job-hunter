import type { ToolCallOwnerProps } from '../../shared/contract/dsh.js'
import { headlineOf, isSettled, JobRow, jobLinesOf, textOf, CardShell } from './parts.js'
import { openJobInPanel } from './open-panel.js'

/**
 * `job_search` / `job_list` 的卡片（§22.3：把结果渲染成**岗位卡片**而不是 JSON）。
 *
 * 两个工具的结果形状一样（摘要行 + 若干 `#id 标题 · 公司 · 城市 · 薪资 · 分数` 行），
 * 所以共用一张卡 —— 少一份会走散的渲染逻辑。
 */
export function JobsCard(props: ToolCallOwnerProps) {
  const { block, toolName, inspect } = props
  const settled = isSettled(block)
  const text = textOf(block)
  const jobs = jobLinesOf(text)
  const headline = headlineOf(text)
  const failed = block.isError === true
  const running = !settled

  const title = toolName === 'job_search' ? '岗位搜索' : '岗位库'
  const subtitle = running
    ? '正在跑…'
    : failed
      ? (block.error?.code ?? '失败')
      : headline

  return (
    <CardShell
      title={title}
      subtitle={subtitle}
      tone={failed ? 'error' : 'normal'}
      {...(inspect === undefined ? {} : { inspect })}
    >
      {running ? (
        <p className="jh-tv-note">
          {toolName === 'job_search'
            ? '正在抓取 —— 会真的打开浏览器，通常十几秒到一分钟。'
            : '正在读取…'}
        </p>
      ) : failed ? (
        <p className="jh-tv-error">{text === '' ? '这次调用失败了。' : text}</p>
      ) : jobs.length === 0 ? (
        <p className="jh-tv-note">{text === '' ? '没有结果。' : text}</p>
      ) : (
        <div className="jh-tv-jobs">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onOpen={(id) => openJobInPanel(id)} />
          ))}
        </div>
      )}

      {running || failed || jobs.length === 0 ? null : (
        <div className="jh-tv-foot">
          <button type="button" className="jh-btn jh-btn-inline" onClick={() => openJobInPanel(jobs[0]!.id)}>
            去面板看全部
          </button>
        </div>
      )}
    </CardShell>
  )
}
