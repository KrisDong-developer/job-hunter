/**
 * 一个收纳在问号里的字段说明。
 *
 * 为什么抽出来：它原本是 `collect.tsx` 里的一个私有组件，而设置页也要用同一种
 * "长解释收进问号"的写法。复制一份两个文件会各自漂移（本项目已经在别处吃过
 * 重复规则的亏），所以放到共用位置。
 *
 * 无障碍：`title` 给鼠标用户、`aria-label` 给读屏用户；问号本身是**文字**（`?`）
 * 而不是图标字体，所以缩放与强制色彩模式下都还在。
 */
export function FieldHint(props: { text: string }) {
  return (
    <span className="jh-field-hint" title={props.text} aria-label={props.text}>
      ?
    </span>
  )
}
