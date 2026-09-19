import { useId, useState } from 'react'

/**
 * 一个可以**展开**的字段说明。
 *
 * ## 为什么要从 `title` 改成"点开"
 *
 * 原来它只是一个 `<span title={...}>?`：说明文字**只有鼠标悬停一条通路**。
 * 后果有两个 —— 键盘用户永远看不到（`title` 不响应焦点），读屏用户也拿不到
 * （`aria-label` 挂在没有角色的 `span` 上，按 ARIA 1.2 属于"禁止命名"的角色，
 * 多数读屏直接忽略，念出来只剩一个"问号"）。
 * 而本项目的做法恰恰是把**关键信息**收进这些问号里（"一天都不选运行日等于每天都跑"、
 * "注册表里有平台 ≠ 这个平台能用"），于是那些话对键盘/读屏用户等于不存在。
 *
 * 现在：它是一个真正的 `<button>`（天然可聚焦、可回车/空格触发），点开把说明
 * **就地摊在控件下面**。三种输入方式都能拿到同一段文字。
 *
 * ## 为什么是就地展开，而不是浮层
 *
 * 这些问号大多在弹窗里，而 `.jh-modal-body` 是 `overflow:auto` —— 绝对定位的
 * 浮层会被它裁掉，靠近底部的字段尤其明显。就地展开不依赖 z-index，也没有裁切风险。
 * 折叠时不占任何版面（说明落在 `.jh-hint-text` 之外的 `.jh-sr-only` 里），
 * 所以**默认外观与改之前完全一致**。
 *
 * ## 两个变体（视觉不同，都是有意的，不要合并成一个类名）
 *
 *   * `field`（默认）—— 描边小圆，跟在**字段标签**后面（表单里那一排）；
 *   * `inline` —— 实心小圆，跟在**一句正文**后面（岗位详情里的匹配分与风险依据）。
 *
 * ## 无障碍
 *
 *   * 按钮的可访问名是「查看说明」，状态由 `aria-expanded` 表达；
 *   * 说明文字通过 `aria-controls` 指向，并始终留在无障碍树里（折叠时用
 *     `.jh-sr-only` 视觉隐藏，而不是 `display:none`）—— 读屏即使不展开也能读到全文；
 *   * `title` 保留给鼠标悬停，行为与改之前一致。
 *
 * ⚠️ 因为折叠时说明文字仍在无障碍树里，说明文字会落进**外层 `<label>` 的文本内容**，
 * 从而变成长长的可访问名。所以凡是把 `FieldHint` 放进 `<label>` 里的地方，
 * 都要给那个控件写显式的 `aria-label`（见采集方案弹窗的 `renderDimension`）。
 */
export function FieldHint(props: { text: string; variant?: 'field' | 'inline' }) {
  const [open, setOpen] = useState(false)
  const textId = useId()
  const inline = props.variant === 'inline'

  return (
    <span className="jh-hint-wrap">
      <button
        type="button"
        className={inline ? 'jh-hint' : 'jh-field-hint'}
        aria-label="查看说明"
        aria-expanded={open}
        aria-controls={textId}
        title={props.text}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      <span id={textId} role="note" className={open ? 'jh-hint-text' : 'jh-sr-only'}>
        {props.text}
      </span>
    </span>
  )
}
