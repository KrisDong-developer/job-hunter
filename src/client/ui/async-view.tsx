import type { ReactNode } from 'react'
import type { AsyncState } from '../hooks/use-async.js'

/**
 * 「拉一次数据」的三态**写法**统一。
 *
 * ## 为什么只做这么薄
 *
 * 界面审计数过：12 个文件里有 42 处手写的三态分支。但其中结构复杂的那些 ——
 * 带重试按钮的失败卡、带 `hint` 的补充说明、空态卡片、重新取数期间要沿用上次数据 ——
 * 是**各屏自己的编排**，硬套一个组件只会把编排塞进 props 里，反而更难读也更容易出错。
 *
 * 真正在所有屏里重复的只有一件事：**加载与失败各占一行时，用哪个元素、哪个类名**。
 * 所以这里只固定这一件事，其余保持各屏自己写。
 *
 * （只按类型引用 `AsyncState`，不引入运行期依赖。）
 */

/** 加载态：一行「正在读取 X…」。默认 `jh-muted`；有的屏用 `jh-note`，按需覆盖。 */
export function LoadingLine(props: {
  children: ReactNode
  className?: string
  /** 对应 `aria-busy="true"`：这是一个正在取数据的长任务。 */
  busy?: boolean
  /** 对应 `aria-live`：提示出现的瞬间要让读屏播报（原来手写在 `p` 上的那几个口子）。 */
  live?: 'polite' | 'assertive'
}) {
  return (
    <p
      className={props.className ?? 'jh-muted'}
      aria-busy={props.busy === true ? true : undefined}
      aria-live={props.live}
    >
      {props.children}
    </p>
  )
}

/** 失败态：一行错误信息 —— 默认显示宿主给的 message。 */
export function ErrorLine(props: {
  children: ReactNode
  className?: string
  /** 对应 `role="alert"`：本地动作失败需要**立刻**打断读屏时用（拉取失败不用）。 */
  role?: 'alert' | 'status'
}) {
  return (
    <p className={props.className ?? 'jh-error'} role={props.role}>
      {props.children}
    </p>
  )
}

/**
 * 三态同处时的写法：加载一行、失败一行、有数据交给 `children`。
 *
 * ⚠️ 只在三个分支**本来就是相邻的兄弟表达式**时用它 —— 否则元素在 DOM 里的
 * 先后顺序会变。文案写成字符串参数（各屏不一样，而且它就是要显示给人看的那句话）。
 */
export function AsyncView<T>(props: {
  state: AsyncState<T>
  loading: string
  loadingClass?: string
  errorClass?: string
  children: (data: T) => ReactNode
}) {
  if (props.state.status === 'loading') {
    return <LoadingLine className={props.loadingClass}>{props.loading}</LoadingLine>
  }
  if (props.state.status === 'error') {
    return <ErrorLine className={props.errorClass}>{props.state.message}</ErrorLine>
  }
  return <>{props.children(props.state.data)}</>
}
