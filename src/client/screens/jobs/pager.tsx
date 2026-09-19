import { pageNumbers } from './filters.js'

export function Pager(props: {
  page: number
  pages: number
  hasMore: boolean
  onGo: (page: number) => void
}) {
  return (
    <nav className="jh-pager" aria-label="分页">
      <button
        type="button"
        className="jh-pg"
        aria-label="上一页"
        disabled={props.page <= 1}
        onClick={() => props.onGo(props.page - 1)}
      >
        ‹
      </button>
      {pageNumbers(props.page, props.pages).map((item, index) =>
        item === '…' ? (
          <span key={`gap-${String(index)}`} className="jh-pg-gap">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={`jh-pg${item === props.page ? ' jh-pg-active' : ''}`}
            aria-current={item === props.page ? 'page' : undefined}
            onClick={() => props.onGo(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="jh-pg"
        aria-label="下一页"
        disabled={!props.hasMore}
        onClick={() => props.onGo(props.page + 1)}
      >
        ›
      </button>
    </nav>
  )
}
