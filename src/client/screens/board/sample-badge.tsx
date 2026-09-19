/**
 * 样本量徽章（面板卡右上角）。
 *
 * 它替换的是原来**压在卡片底部**的"⚠ 样本 2 条 · 悬停看口径"：
 * 位置从结论下面挪到标题行，语义从"一句提醒"变成"这张卡片的属性"。
 * 样本不足走 `.jh-tag-warn`（浅黄底 + 深色文字）—— 不用"饱和橙底配白字"，
 * 那个配方本项目已经因为 2.15:1 修过一次（见 styles.ts 顶部那段注释）。
 * 口径全文同时挂在 `title`（鼠标用户）与屏读文本上（读屏用户拿不到 title）。
 */
export function SampleBadge(props: { sample: number; enough: boolean; hint: string }) {
  return (
    <span className={`jh-tag ${props.enough ? 'jh-tag-quiet' : 'jh-tag-warn'}`} title={props.hint}>
      {props.enough ? '' : '⚠ '}样本 {props.sample} 条
      <span className="jh-sr-only">。{props.hint}</span>
    </span>
  )
}




