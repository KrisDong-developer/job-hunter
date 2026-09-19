import type { CompanyProfileDto } from '../../../shared/contract/dto/job.js'
import { ApiError } from '../../net/client.js'
import { updateCompanyReview } from '../../net/companies.js'
import type { FormEvent } from 'react'
import { useState } from 'react'

/**
 * 人工复核（§4.3 / D-16）：规则会认错，用户必须能纠正。
 *
 * 这套能力此前是**后端完整、界面为零** —— `PATCH /companies/:id` 支持拉黑与打标签，
 * 而界面上连已经打过的标签都看不到。这里补最小的一份：标签 + 拉黑 + 保存。
 */
export function CompanyReview(props: { company: CompanyProfileDto; onSaved: () => void }) {
  const [label, setLabel] = useState(props.company.manualLabel ?? '')
  const [blacklisted, setBlacklisted] = useState(props.company.blacklisted)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    try {
      const trimmed = label.trim()
      await updateCompanyReview(props.company.id, {
        blacklisted,
        // 空串 = 清除标签（后端把空串收敛成 null，不会存一个空标签）
        manualLabel: trimmed === '' ? null : trimmed,
      })
      props.onSaved()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.display : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="jh-review" onSubmit={(event) => void save(event)}>
      <label className="jh-review-field">
        <span>人工标签</span>
        <input
          className="jh-input jh-input-sm"
          value={label}
          maxLength={40}
          placeholder="如：外包 / 已投过"
          onChange={(event) => { setLabel(event.target.value) }}
        />
      </label>
      <label className="jh-check">
        <input
          type="checkbox"
          checked={blacklisted}
          onChange={(event) => { setBlacklisted(event.target.checked) }}
        />
        <span>拉黑该公司</span>
      </label>
      <button type="submit" className="jh-btn jh-btn-inline" disabled={busy}>
        {busy ? '保存中…' : '保存复核'}
      </button>
      {failure === null ? null : <span className="jh-error">{failure}</span>}
    </form>
  )
}


