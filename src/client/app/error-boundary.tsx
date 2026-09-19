import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 屏级错误边界。
 *
 * ## 为什么必须有它
 *
 * 界面审计 F-2：面板的 10 个屏共用一个 React 树，任一屏在**渲染期**抛错会带走
 * 整块 UI —— 而 `index.tsx` 里的 try/catch 只覆盖槽位注册那一段，管不到渲染。
 * "一个屏写坏了整个面板消失"正是本项目明确拒绝过的失败模式
 * （见 `index.tsx` 里对 `slots` 缺失的保底处理）。
 *
 * ## 兜底文案按本项目的标准来（审计 F-1）
 *
 * 说清**哪一屏**坏了、**什么错**、**怎么办**。「重试」只重挂这一屏
 * （清掉错误状态），不动其它分区，也不丢已经取到的数据。
 */
export class ScreenErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 本地插件没有上报通道，控制台是唯一的留痕处；把组件栈一起打出来便于定位。
    console.error(`[job-hunter] 「${this.props.name}」渲染失败`, error, info.componentStack)
  }

  override render(): ReactNode {
    const error = this.state.error
    if (error === null) return this.props.children
    return (
      <div className="jh-card">
        <h2 className="jh-card-title">「{this.props.name}」这一屏出错了</h2>
        <p className="jh-error">{error.message}</p>
        <p className="jh-muted">其它分区不受影响 —— 可以切到别的标签继续用。</p>
        <button
          type="button"
          className="jh-btn"
          onClick={() => {
            this.setState({ error: null })
          }}
        >
          重试这一屏
        </button>
      </div>
    )
  }
}
