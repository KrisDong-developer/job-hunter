import type { AttributionRowDto } from '../../../shared/contract/dto/analytics.js'
import { formatRate } from './format.js'

/**
 * 回复率最高的一行（只有**样本够**且**唯一最高**时才给高亮）。
 *
 * 并列不高亮：随便挑一行当"最好"是在说假话，而这张表本来就只有几行。
 * `enoughSample` 由 host 判定（`MIN_SAMPLE`），前端不重算阈值。
 */
function bestReplyKey(rows: AttributionRowDto[]): string | null {
  const candidates = rows.filter((row) => row.enoughSample && row.replied > 0)
  if (candidates.length < 2) return null
  const top = Math.max(...candidates.map((row) => row.replyRate))
  const winners = candidates.filter((row) => row.replyRate === top)
  const winner = winners.length === 1 ? winners[0] : undefined
  return winner === undefined ? null : winner.key
}


const BEST_REPLY_HINT = '这一组的回复率在所有样本足够的组里最高；并列时不给高亮。'

/**
 * 归因表。
 *
 * 数值列右对齐 + 等宽数字（纵向比大小要位数对齐）、分组列左对齐；
 * 样本足够且回复率唯一最高的那一行给浅绿底 —— 高亮的是**结论**，
 * 所以它必须由 host 的 `enoughSample` 把关，而不是"看着最高就标"。
 */
export function AttributionTable(props: { rows: AttributionRowDto[] }) {
  const best = bestReplyKey(props.rows)
  if (props.rows.length === 0) return <p className="jh-muted">还没有投递记录。</p>
  return (
    /* 表格自己横向滚动，而不是把整块面板撑宽：
       实测 320px 下面板只有 252px 可用，而 8 列表格的 min-content 是 369px ——
       不套这一层，`.jh-body` 会整体横向滚动（顶部筛选条跟着跑掉）。 */
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-board">
        <thead>
          <tr>
            <th scope="col">分组</th>
            <th scope="col" className="jh-num">投递</th>
            <th scope="col" className="jh-num">已回复</th>
            <th scope="col" className="jh-num">面试</th>
            <th scope="col" className="jh-num">Offer</th>
            <th scope="col" className="jh-num">回复率</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.key} className={row.key === best ? 'jh-row-best' : undefined}>
              <td>
                {row.label}
                {row.key === best ? (
                  <span className="jh-tag jh-tag-best" title={BEST_REPLY_HINT}>
                    回复率最高
                  </span>
                ) : null}
              </td>
              <td className="jh-num">{row.total}</td>
              <td className="jh-num">{row.replied}</td>
              <td className="jh-num">{row.interviewed}</td>
              <td className="jh-num">{row.offered}</td>
              <td className="jh-num">{formatRate(row.replyRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}




