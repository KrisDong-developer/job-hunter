import { InlineMd } from '../../../ui/inline-md.js'
import { JdText } from '../jd-text.js'

/**
 * JD 原文。此前详情只有标题 / 薪资 / 标签 / 经验学历 —— 想知道"这活到底干什么"
 * 只能点去原站；而原文其实早就抓下来存在库里，只是从来没送到界面上。
 *
 * `jdText` 为 `null` = **没抓到**（平台没实现详情解析，或抓取时详情页没打开），
 * 那时如实说"没抓到"，不用标签拼一份看起来像 JD 的东西。
 */
export function JdPanel(props: { jdText: string | null }) {
  return (
    <section className="jh-card jh-card-tight">
      <h3 className="jh-card-title">岗位描述</h3>
      {props.jdText === null ? (
        <p className="jh-note">
          <InlineMd text="**没有抓到 JD 原文** —— 该平台未提供详情页解析，或抓取时详情页没打开。可以点最下面的原站链接自己看。" />
        </p>
      ) : (
        <JdText text={props.jdText} />
      )}
    </section>
  )
}
