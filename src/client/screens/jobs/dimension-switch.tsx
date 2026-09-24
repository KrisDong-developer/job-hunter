/**
 * 维度切换小按钮（视图行末尾，两种维度下同一位置）。
 *
 * 只写"**要去的地方**"：岗位维度下写「公司」，公司维度下写「岗位」——
 * 位置永远不变，用户学会了它在哪，切过去它就还在那。
 *
 * 拆成共享组件而不是两边各写一份 button：按钮的形态、title 文案、
 * a11y 语义必须一起改才安全，两份拷贝迟早改一漏一。
 */
export function DimensionSwitch(props: { to: 'jobs' | 'companies'; onSwitch: () => void }) {
  const isCompanies = props.to === 'companies'
  return (
    <button
      type="button"
      className="jh-jobs-dimswitch"
      title={
        isCompanies
          ? '按公司汇总查看：岗位数与画像信号（外包 / 风险）。岗位筛选与列表保持不动，随时切回来'
          : '切回岗位列表（公司的筛选与选中保持不动，随时切回来）'
      }
      onClick={props.onSwitch}
    >
      <span aria-hidden="true">⇄</span> {isCompanies ? '公司' : '岗位'}
    </button>
  )
}
