/**
 * 「用哪份简历」选择器（投递用）。
 *
 * ## 为什么选项落在**附件**上，而不是「版本」
 *
 * 投递这条链路的输入就是一个附件 id（`resumeFileId`）：服务端据此解析出路径、
 * 并在成功之后把它所属的版本写进 `application.resume_id`（R6 的归因靠它）。
 * 所以"选版本 + 选文件"两步在这里合成一步 —— 选项写成「版本名 · 文件名」，
 * 用户看到的仍是版本，落库的是版本 + 附件两份信息。
 *
 * ## 一条必须说清的事（写进 `title`，不占版面但可查）
 *
 * 选了附件**不等于**平台会收到这个文件：接入的平台（实测 zhipin / zhaopin）都只吃
 * 平台上已有的那份。选它仍然是**有意义**的 —— 它决定这次投递在你的记录里归到哪一版
 * （"哪版回复率高"要看这一格）。详情由调用方按 `plan.uploadsResumeFile` 说明。
 */
import { fetchResumes } from '../api.js'
import { useAsync } from '../use-async.js'

export function ResumeFilePicker(props: {
  /** 选中的附件 id；`null` = 用平台内简历（不登记版本）。 */
  value: number | null
  onChange: (resumeFileId: number | null) => void
  disabled?: boolean
}) {
  const resumes = useAsync((signal) => fetchResumes(signal), [])

  if (resumes.state.status === 'loading') {
    return <span className="jh-muted">正在读取简历…</span>
  }
  if (resumes.state.status === 'error') {
    return <span className="jh-error">读取简历失败：{resumes.state.message}</span>
  }

  const options = resumes.state.data.items.flatMap((resume) =>
    resume.files.map((file) => ({
      id: file.id,
      label: `${resume.name} · ${file.fileName}${resume.isDefault ? '（当前默认版本）' : ''}`,
    })),
  )

  if (options.length === 0) {
    // 没有附件时**不装作能选**：如实说去哪儿弄一个出来
    return (
      <span className="jh-muted">
        还没有简历附件 —— 到「简历」页导出 PDF / Word 之后，才能在这里指定用哪一份。
      </span>
    )
  }

  return (
    <select
      className="jh-select"
      value={props.value === null ? '' : String(props.value)}
      disabled={props.disabled === true}
      aria-label="用哪份简历"
      title="选的是这次投递在你的记录里归到哪一版（附件 id）。平台侧用的是它自己那份简历 —— 能不能把本地文件真的传上去，见下面的说明。"
      onChange={(event) => {
        props.onChange(event.target.value === '' ? null : Number(event.target.value))
      }}
    >
      <option value="">平台内简历（不登记版本）</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
