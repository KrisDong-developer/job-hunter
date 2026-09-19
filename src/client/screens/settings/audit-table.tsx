import type { AuditRecordDto } from '../../../shared/contract/dto/settings.js'
import { actorLabel } from '../../../shared/contract/enums/guard.js'
import { ErrorLine } from '../../ui/async-view.js'
import type { AuditState } from './logs-panel.js'

export function AuditTable(props: { audit: AuditState }) {
  return (
    <section className="jh-card">
      <h2 className="jh-card-title">操作审计</h2>
      {props.audit.status === 'error' && <ErrorLine>{props.audit.message}</ErrorLine>}
      {props.audit.status === 'ok' && (
        <>
          <div className="jh-filters">
            {/* 说清"这是最近多少条"：接口按 limit 取，表里不会显示全部 */}
            <span className="jh-filter-note">
              共 {props.audit.data.count} 条 · 表里显示最近 {props.audit.data.items.length} 条
            </span>
          </div>
          <div className="jh-table-scroll">
            <table className="jh-table jh-table-roomy">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">谁</th>
                  <th scope="col">动作</th>
                  <th scope="col" className="jh-cell-status">
                    结果
                  </th>
                  <th scope="col">说明</th>
                </tr>
              </thead>
              <tbody>
                {props.audit.data.items.map((record: AuditRecordDto) => (
                  <tr key={record.id}>
                    <td>{record.at.slice(5, 16).replace('T', ' ')}</td>
                    <td>{actorLabel(record.actor)}</td>
                    <td>
                      <code>{record.action}</code>
                    </td>
                    <td className="jh-cell-status">
                      <span
                        className={`jh-tag ${
                          record.result === 'ok' ? 'jh-tone-ok' : 'jh-tone-warn'
                        }`}
                      >
                        {record.result}
                      </span>
                    </td>
                    <td className="jh-muted">{record.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {props.audit.data.items.length === 0 && <p className="jh-muted">还没有审计记录。</p>}
          {/* 与留痕卡同一类"我们存了什么、没存什么"的声明 —— 一张有一张没有是说不通的 */}
          <p className="jh-note">{props.audit.data.note}</p>
        </>
      )}
    </section>
  )
}
