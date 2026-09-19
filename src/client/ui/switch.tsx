/**
 * Switch 开关：真 `<input type="checkbox" role="switch">` + 一层视觉拨杆。
 *
 * 为什么不用 `.jh-check` 那套复选框：这类开关都是**即时生效**的
 * （不是"选完再提交"的表单项），拨杆形态更直接地表达"现在就是开着的"。
 * 反过来说：**要按键提交的表单项就不该用开关** —— 拨杆在视觉上就是"已经生效"，
 * 放在一个还要点「筛选」的地方，用户没法从外观上判断当前到底生效了没有。
 *
 * 为什么抽出来：它原本是 `settings.tsx` 里的私有组件，而岗位库的「跨平台折叠」
 * 也是同一种"即时生效的开关"。复制一份两边会各自漂移（本项目已经在别处吃过
 * 重复规则的亏 —— 见 styles.ts 里 `.jh-tag` 那段历史注释），所以放到共用位置。
 */
export function Switch(props: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <span className="jh-switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled === true}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="jh-switch-track" aria-hidden="true">
        <span className="jh-switch-thumb" />
      </span>
    </span>
  )
}
