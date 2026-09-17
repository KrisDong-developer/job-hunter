import type { ReactNode } from 'react'

/**
 * 极简**行内** Markdown → React 节点（只支持 `**粗体**` 与 `` `代码` ``）。
 *
 * ## 为什么必须有它
 *
 * 实测的界面缺陷：顶部警告直接显示成 `**连手动跑也会被拒绝**` ——
 * 因为文案里写了 Markdown，而界面上**没有任何解析**。这不是个别文案写错，
 * 而是"文案里的强调标记"这个约定从来没有落地实现（同一类问题在今日/简历/看板都有）。
 *
 * ## 为什么是自己写十行，而不是引一个 markdown 库
 *
 *   1. **零新增运行时依赖**是硬约束（C5）—— 这里只需要两个行内标记，
 *      而任何 markdown 库都会把整个块级语法、HTML 直通、插件体系一起带进来；
 *   2. **安全**：返回的是 React 节点，**从不**用 `dangerouslySetInnerHTML`。
 *      抓来的 JD 与 HR 消息是不可信输入（P9），一旦走 HTML 直通就等于开了个注入口子。
 *      这里构造节点，结构上就不可能被注入。
 *
 * ## 刻意不支持的语法
 *
 * 不处理标题、列表、链接、表格、图片、HTML。理由同上：**不支持的东西不会出意外**。
 * 需要一个链接就写按钮，需要一段块级内容就写组件 —— 而不是把 Markdown 引进来。
 */
export function InlineMd(props: { text: string }): ReactNode {
  return <>{parseInline(props.text)}</>
}

/**
 * 把一段文本切成节点数组。导出它是因为有些地方需要把结果嵌进已有的 `<p>` 里
 * （而 `<InlineMd/>` 会多出一层 Fragment，虽然无害，但显式一些更好读）。
 */
export function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // 一次扫描同时认 `**粗体**` 与 `` `代码` ``：顺序无关，先出现的先切
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let cursor = 0
  let index = 0
  let match = pattern.exec(text)

  while (match !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const bold = match[1]
    const code = match[2]
    if (bold !== undefined) {
      nodes.push(<b key={`b${String(index)}`}>{bold}</b>)
    } else if (code !== undefined) {
      nodes.push(
        <code key={`c${String(index)}`} className="jh-inline-code">
          {code}
        </code>,
      )
    }
    index += 1
    cursor = match.index + match[0].length
    match = pattern.exec(text)
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

/**
 * 去掉标记只留纯文本。
 *
 * 给**非 JSX 场合**用（`title` 属性、`aria-label`、工具返回文本）——
 * 那些地方塞 `**` 进去同样是漏出源码（`title="导出渲染的是**已保存**的内容"`）。
 */
export function stripInlineMd(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
}
