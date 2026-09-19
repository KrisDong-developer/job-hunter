import { useCallback, useEffect, useMemo, useState } from 'react'
import { RESUME_LANGUAGE_LABEL } from '../../../shared/contract/enums/resume.js'
import type { ResumeSummaryDto } from '../../../shared/contract/dto/resume.js'
import type { ResumeIssue } from '../../../shared/domain/resume-content.js'
import { emptyResumeContent } from '../../../shared/domain/resume-content.js'
import { createResume, fetchResume, fetchResumes } from '../../net/resumes.js'
import { useAsync } from '../../hooks/use-async.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { ResumeWork } from './resume-work.js'

/**
 * U3 简历中心（§13）。
 *
 * 布局：**左边版本列表（约 1/4）+ 右边工作区**，工作区里可切「编辑 / 分屏 / 预览」。
 *
 * 2026-09-17 重构（用户反馈原文："开发思维主导、操作门槛高、视觉焦点涣散"）：
 * - **彻底去掉手拼语法**。原先"工作经历"要求用户自己写 `## 公司｜职位` 再一行一条成果，
 *   少一个空格就渲染错乱 —— 现在改成结构化表单（公司/职位/起止/城市/成果分条/技术栈）。
 * - 短字段同行并排（姓名+目标岗位、城市+年限+年龄、起止时间…），纵向空间留给长文本。
 * - 体检结果从"预览区的一行绿字"搬到编辑区顶部的提示条 —— 它指导的是"改表单"。
 * - 导出（主操作）与版本操作（复制/删除/设为启用）分开：前者在预览区，后者在工作区标题栏。
 * - 预览给"纸张"隐喻：深灰底 + 白纸 + 阴影（`bg-mask-2` 实测 = 12% 黑，压在白底上就是浅灰）。
 *
 * 与 §3.2 的产品判断一致：这里的编辑是**版本级**的（维护 2–3 版），
 * 不是"每投一个岗位改一次"；针对单个岗位的定制在岗位详情里（U4）。
 */
export function ResumesScreen(props: { revision: number; onChanged: () => void }) {
  const list = useAsync((signal) => fetchResumes(signal), [props.revision])
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [issuesById, setIssuesById] = useState<Record<number, ResumeIssue[]>>({})

  const items: ResumeSummaryDto[] = list.state.status === 'ok' ? list.state.data.items : []
  const shown = useMemo(() => {
    const key = query.trim().toLowerCase()
    if (key === '') return items
    return items.filter((item) =>
      `${item.name} ${item.direction}`.toLowerCase().includes(key),
    )
  }, [items, query])

  // 第一次拿到列表时自动选中当前启用版本 —— 空白详情页看着像坏了
  useEffect(() => {
    if (selected !== null || items.length === 0) return
    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null)
  }, [items, selected])

  /** 悬停"体检 N 项"时按需取明细：列表接口只给数量，不给具体是哪几项。 */
  const loadIssues = useCallback(
    (id: number) => {
      if (issuesById[id] !== undefined) return
      void fetchResume(id)
        .then((detail) => {
          setIssuesById((current) => ({ ...current, [id]: detail.issues }))
        })
        .catch(() => {
          /* 悬停提示取不到就算了，不该弹错 */
        })
    },
    [issuesById],
  )

  const onCreate = useCallback(async () => {
    setCreating(true)
    try {
      const created = await createResume({ name: '新简历', direction: '', content: emptyResumeContent() })
      setSelected(created.id)
      props.onChanged()
    } finally {
      setCreating(false)
    }
  }, [props])

  const pick = (id: number): void => {
    if (id === selected) return
    if (dirty && !window.confirm('这一版还有未保存的改动，切走就丢了。确定切换？')) return
    setSelected(id)
  }

  return (
    <div className="jh-screen jh-screen-wide">
      <div className="jh-row-head">
        <h2 className="jh-card-title">简历中心</h2>
        <span className="jh-muted">
          按方向维护 2–3 版就够了 —— 每投一个岗位改一次简历，面试时反而讲不一致。
        </span>
      </div>

      {list.state.status === 'loading' && <LoadingLine>正在读取简历…</LoadingLine>}
      {list.state.status === 'error' && (
        <div className="jh-card">
          <ErrorLine>{list.state.message}</ErrorLine>
          <button type="button" className="jh-btn" onClick={list.reload}>重试</button>
        </div>
      )}
      {list.state.status === 'ok' && items.length === 0 && (
        <div className="jh-card">
          <p className="jh-muted">
            还没有简历。建一版之后，附件（PDF / Word）与岗位定制都会围绕它工作。
          </p>
        </div>
      )}

      <div className="jh-resume-shell">
        <aside className="jh-resume-side">
          <div className="jh-resume-side-head">
            <input
              className="jh-input"
              placeholder="搜索版本…"
              aria-label="搜索版本"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={creating}
              onClick={() => void onCreate()}
            >
              {creating ? '…' : '新建'}
            </button>
          </div>

          <ul className="jh-resume-list">
            {shown.map((item) => {
              const issues = issuesById[item.id]
              const active = selected === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`jh-resume-item${active ? ' jh-resume-item-active' : ''}`}
                    data-resume-id={item.id}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => pick(item.id)}
                  >
                    <span className="jh-resume-item-top">
                      <span className="jh-resume-name">{item.name}</span>
                      {item.isDefault ? <i className="jh-badge-on">启用中</i> : null}
                    </span>
                    <span className="jh-resume-sub">
                      {item.direction || '未填方向'} · {RESUME_LANGUAGE_LABEL[item.language]}
                      {/* 不再把 state 印在这里：`state==='active'` 只表示"没归档"，
                          而"启用中"是 isDefault —— 两个概念混着写会让人以为每份都启用了
                          （实测就这样：6 张卡副行全是「启用中」，徽章却只有一个）。 */}
                      {item.state === 'archived' ? ' · 已归档' : ''}
                    </span>
                    <span className="jh-resume-chips">
                      {/* 只显示非零项：一串「技能 0 · 经历 0」是纯噪音 */}
                      {item.counts.skills > 0 ? <i className="jh-chip">技能 {item.counts.skills}</i> : null}
                      {item.counts.experiences > 0 ? (
                        <i className="jh-chip">经历 {item.counts.experiences}</i>
                      ) : null}
                      {item.counts.projects > 0 ? <i className="jh-chip">项目 {item.counts.projects}</i> : null}
                      {item.counts.files > 0 ? <i className="jh-chip">附件 {item.counts.files}</i> : null}
                      {item.issues > 0 ? (
                        <i
                          className="jh-chip jh-chip-warn"
                          onMouseEnter={() => loadIssues(item.id)}
                          title={
                            issues === undefined
                              ? '鼠标停一下看是哪几项'
                              : issues.map((issue) => `${issue.level === 'error' ? '必改' : '建议'}：${issue.message}`).join('\n')
                          }
                        >
                          ⚠ 体检 {item.issues} 项
                        </i>
                      ) : null}
                      {item.counts.skills === 0 && item.counts.experiences === 0 && item.issues === 0 ? (
                        <i className="jh-chip jh-chip-quiet">还是空的</i>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && items.length > 0 ? (
              <li><p className="jh-muted">没有匹配「{query}」的版本。</p></li>
            ) : null}
          </ul>
        </aside>

        <section className="jh-resume-work">
          {selected === null ? (
            <p className="jh-muted">选左边一版简历开始编辑。</p>
          ) : (
            <ResumeWork
              key={String(selected)}
              id={selected}
              onChanged={props.onChanged}
              onDirtyChange={setDirty}
              onDeleted={() => {
                setSelected(null)
                setDirty(false)
                props.onChanged()
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}
