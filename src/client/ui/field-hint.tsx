/**
 * 一个收纳在问号里的字段说明。
 *
 * 为什么抽出来：它原本是 `collect.tsx` 里的一个私有组件，而设置页也要用同一种
 * "长解释收进问号"的写法。复制一份两个文件会各自漂移（本项目已经在别处吃过
 * 重复规则的亏），所以放到共用位置。
 *
 * 两个**变体**（视觉不同，都是有意的，不要合并成一个类名）：
 *   * `field`（默认）—— 描边小圆，跟在**字段标签**后面（表单里那一排）；
 *   * `inline` —— 实心小圆，跟在**一句正文**后面（岗位详情里的匹配分与风险依据）。
 *     它等价于原先岗位详情里私有的那个 `Hint`，只是搬到了这里。
 *
 * 无障碍：`title` 给鼠标用户、`aria-label` 给读屏用户；问号本身是**文字**（`?`）
 * 而不是图标字体，所以缩放与强制色彩模式下都还在。
 */
export function FieldHint(props: { text: string; variant?: 'field' | 'inline' }) {
  if (props.variant === 'inline') {
    return (
      <span className="jh-hint" role="img" aria-label={props.text} title={props.text}>
        ?
      </span>
    )
  }
  return (
    <span className="jh-field-hint" title={props.text} aria-label={props.text}>
      ?
    </span>
  )
}
