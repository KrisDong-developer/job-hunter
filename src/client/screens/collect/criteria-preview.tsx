// 「各平台实际会请求什么」—— 采集方案表单里的**干跑预览**。
//
// 为什么要有它：界面上写的条件、保存前校验放行的条件、**真正发出去的请求**是三件事。
// 前两件事在界面上都看得见，第三件以前谁也看不见 —— 于是"筛了没结果"和"根本没筛"
// 长得一模一样（神仙外企的行业/职能就是这么丢了很久的）。
//
// 这一块把第三件事摊开：每个平台会请求哪个地址、哪个条件落到哪个参数上、
// 哪些条件**不进请求**（采集深度），以及哪个平台这一轮**会被跳过**（构造不出请求）。
//
// 它是干跑：宿主侧只调拼 URL / body 的纯函数，不开浏览器、不发请求、不写库。
import { useEffect, useState } from 'react'
import type { CriteriaPreviewDto } from '../../../shared/contract/dto/plan.js'
import { ApiError } from '../../net/client.js'
import { previewCriteria } from '../../net/collect/plans.js'

interface PreviewState {
  running: boolean
  items: CriteriaPreviewDto[]
  error: string | null
}

export function CriteriaPreview(props: {
  /** 当前方案里的平台（点开预览时用的就是它们）。 */
  platforms: string[]
  /**
   * **实际会生效**的那份条件。
   *
   * 调用方要把多关键词也算进来（调度是逐个关键词跑：`criteria.keyword` = 第一个），
   * 否则预览里会漏掉最要紧的那个参数。
   */
  criteria: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<PreviewState>({ running: false, items: [], error: null })

  /**
   * 请求键：平台集合 + 条件。
   *
   * 用它当依赖而不是 `props.platforms`（每次渲染都是新数组），否则会无限重取。
   * 条件里只有真正影响请求的键会进键 —— 改方案名不该触发一次干跑。
   */
  const requestKey = `${props.platforms.join(',')}\u0000${JSON.stringify(props.criteria)}`

  useEffect(() => {
    if (!open || props.platforms.length === 0) return
    let cancelled = false
    setState((current) => ({ ...current, running: true, error: null }))
    // 300ms 防抖：与保存前的校验同一个节奏，改一个下拉不会连打几次接口。
    const timer = window.setTimeout(() => {
      void previewCriteria(props.platforms, props.criteria)
        .then((result) => {
          if (!cancelled) setState({ running: false, items: result.items, error: null })
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              running: false,
              items: [],
              error: error instanceof ApiError ? error.display : String(error),
            })
          }
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // props.criteria 的内容已经被 requestKey 覆盖，见上方说明。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, open])

  return (
    <>
      <button
        type="button"
        className="jh-plan-toggle"
        aria-expanded={open}
        aria-controls="jh-plan-preview"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="jh-plan-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="jh-plan-toggle-text">各平台实际会请求什么</span>
        <span className="jh-filter-note">干跑，不发请求 —— 看条件有没有真的落到参数上</span>
      </button>

      <div className="jh-plan-panel" id="jh-plan-preview" hidden={!open}>
        {props.platforms.length === 0 ? (
          <p className="jh-muted">先在第一步勾上平台，这里才会算出请求。</p>
        ) : state.running ? (
          <p className="jh-muted" aria-live="polite">
            正在按采集用的同一套拼装算出各平台的请求…
          </p>
        ) : state.error === null ? null : (
          <p className="jh-error" role="alert">
            {state.error}
          </p>
        )}

        {state.items.map((item) => (
          <div className="jh-preview" key={item.platformId}>
            <div className="jh-preview-head">
              <b>{item.displayName}</b>
              <code className="jh-muted">{item.platformId}</code>
              {item.request === null ? null : (
                <span className="jh-tag jh-tone-muted">{item.request.method}</span>
              )}
            </div>

            {/* 构造不出请求 ≠ 没条件：这一轮这个平台**会被跳过**，必须说清楚。 */}
            {item.error === null ? null : <p className="jh-warn">{item.error}</p>}

            {item.request === null ? null : (
              <>
                <div className="jh-preview-url">
                  <code title={item.request.url}>{item.request.url}</code>
                </div>
                {Object.keys(item.request.params).length === 0 ? (
                  <p className="jh-muted">这次请求没有任何筛选参数（按平台默认列表抓）。</p>
                ) : (
                  <ul className="jh-kv">
                    {Object.entries(item.request.params).map(([key, value]) => (
                      <li key={key}>
                        <span>
                          <code>{key}</code>
                        </span>
                        <span>{value === '' ? '（空）' : value}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.request.crawlOnly.length === 0 ? null : (
                  <p className="jh-filter-note">
                    不进请求、只影响采集深度：{item.request.crawlOnly.join('、')}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
