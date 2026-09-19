// DedupGroupsCard：跨平台去重分组（A2）卡片，列出合并分组并支持"拆组 / 拆出"。
// 合并了哪些 / 依据是什么 / 能不能拆开都可查可逆（去重必须可逆）。
// 全库复核的按钮不在这里 —— 已搬到页面顶部固定工具条，结果由统一 Alert 播报。
import { useState } from 'react'
import { ApiError } from '../../net/client.js'
import { deleteDedupGroup, fetchDedupGroups, splitDedupMember } from '../../net/dedup.js'
import { useAsync } from '../../hooks/use-async.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { FieldHint } from '../../ui/field-hint.js'
import { Modal } from '../../ui/modal.js'

/**
 * 跨平台去重分组（A2）。
 *
 * 多平台落地后，同一岗位可能被多个平台各抓一条并被合并进同一组。这里把它们列出来，
 * 让"合并了哪些 / 依据是什么 / 能不能拆开"都可查可逆（§4.10.1 铁律 2：去重必须可逆）。
 *
 * **全库复核的按钮不在这里**：它已经搬到页面顶部的固定工具条
 * （「运行全库去重」），结果也由那条统一的 Alert 播报 ——
 * 那个动作与"你现在在哪个分区"无关，藏在卡片里就等于必须先进这个分区才想得起来。
 * 这个卡片只负责一件事：列分组、拆组。
 */
export function DedupGroupsCard(props: { revision: number }) {
  const groups = useAsync((signal) => fetchDedupGroups(signal), [props.revision])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  /** 拆组 / 拆出失败的原因。**必须说出来** —— 这两颗按钮失败时界面原本毫无变化。 */
  const [error, setError] = useState<string | null>(null)

  const act = async (id: number, fn: () => Promise<void>): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      groups.reload()
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.display : String(thrown))
    } finally {
      setBusyId(null)
    }
  }

  const items = groups.state.status === 'ok' ? groups.state.data.items : []
  /** 库里一共有多少组。接口只回前 50 组，差多少要说出来，不能看着像"就这些"。 */
  const total = groups.state.status === 'ok' ? groups.state.data.count : 0

  return (
    <section className="jh-card">
      <div className="jh-form-head">
        <h2 className="jh-card-title">跨平台去重</h2>
        {/* 原来这里是一段常驻的灰字说明，占一整行却只在第一次看时有用。
            收进问号：需要时悬停/聚焦可读，不需要时不占版面。 */}
        <FieldHint text="同一岗位被多个平台各抓一条时合并到同一组，依据是跨平台 + 同公司同城 + 薪资不冲突 + 标题相似。合并是可逆的：误合并随时可以在下面拆开。补做一次全库复核用顶部的「运行全库去重」。" />
      </div>

      {error === null ? null : (
        <ErrorLine role="alert">
          {error}
        </ErrorLine>
      )}

      {groups.state.status === 'loading' ? (
        <LoadingLine busy>正在读取去重分组…</LoadingLine>
      ) : items.length === 0 ? (
        <p className="jh-muted">
          目前没有去重分组。多平台同时在抓同一批岗位时，重复的那几条才会被合并到这里。
        </p>
      ) : (
        <ul className="jh-tailor-notes">
          {items.map((group) => (
            <li key={group.id}>
              <span className="jh-muted">组 #{group.id}（{group.basis}）</span>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost"
                disabled={busyId !== null}
                onClick={() => setPendingDelete(group.id)}
              >
                拆组
              </button>
              <ul className="jh-tailor-notes">
                {group.members.map((member) => (
                  <li key={member.id}>
                    {/* 平台一律显示**名字**：DTO 里的 `platformName` 就是服务端 JOIN 出来
                        给人看的（平台被卸载时为 null），本页其它地方（平台总览、运行表）
                        也都显示"前程无忧 / BOSS直聘"。这里原来直接印 `platformId`，
                        于是同一屏里同一批平台有两套叫法（51job / zhipin）。 */}
                    · {member.isPrimary ? '主' : '从'}｜{member.platformName ?? member.platformId}｜
                    {member.title}
                    {member.companyName === null ? '' : `｜${member.companyName}`}
                    {'　'}({member.city})
                    {member.isPrimary ? null : (
                      <button
                        type="button"
                        className="jh-link"
                        disabled={busyId !== null}
                        onClick={() => void act(group.id, async () => splitDedupMember(group.id, member.id))}
                      >
                        拆出
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {total > items.length ? (
        <p className="jh-muted">
          共 {total} 组，这里列出最新的 {items.length} 组。
        </p>
      ) : null}

      {/* 拆组确认：不删岗位，只是整组解散（成员全部独立） */}
      {pendingDelete === null ? null : (
        <Modal
          title="拆散这个去重组"
          label="拆组确认"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <button type="button" className="jh-btn jh-btn-inline" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-danger"
                disabled={busyId !== null}
                onClick={() => {
                  const id = pendingDelete
                  setPendingDelete(null)
                  void act(id, async () => deleteDedupGroup(id))
                }}
              >
                确认拆组
              </button>
            </>
          }
        >
          <p className="jh-alert-body">
            拆组后这组里的岗位全部变回独立岗位。**岗位本身不会删** —— 只是想撤销一次合并判断。
          </p>
        </Modal>
      )}
    </section>
  )
}
