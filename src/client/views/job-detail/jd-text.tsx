import { useState } from 'react'

/** JD 收起时露出的字数。约五六行，够看清"这活到底干什么"。 */
const JD_PREVIEW_CHARS = 320


/**
 * JD 原文。默认只露开头一段 —— 详情栏是"一个一个往下比"的地方，
 * 一份三千字的 JD 会把评分、风险、公司画像全挤到屏幕外。
 */
export function JdText(props: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = props.text.length > JD_PREVIEW_CHARS
  const shown = long && !expanded ? `${props.text.slice(0, JD_PREVIEW_CHARS)}…` : props.text
  return (
    <>
      <p className="jh-jd">{shown}</p>
      {long ? (
        <button
          type="button"
          className="jh-btn jh-btn-inline"
          aria-expanded={expanded}
          onClick={() => { setExpanded(!expanded) }}
        >
          {expanded ? '收起原文' : `展开全文（共 ${String(props.text.length)} 字）`}
        </button>
      ) : null}
    </>
  )
}


