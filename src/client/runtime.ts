import type { LayoutService, PluginContext } from '../shared/dsh.js'
import { serviceOf } from '../shared/dsh.js'

/**
 * 面板里的按钮需要一个能力（回到对话区），但组件是纯函数，不该拿到活的 cordis 上下文
 * （§4.3 铁律：活对象不穿越 UI 与领域层）。
 *
 * 这里只保留上下文引用，**在点击时才解析** `layout`。这样就不依赖 `layout` 服务
 * 相对本插件的挂载顺序 —— 实测教训：在 `apply()` 里一次性抓服务，会拿到 undefined。
 */
let ctx: PluginContext | undefined

/** 绑定上下文；由 `apply()` 调用。 */
export function bindContext(context: PluginContext): void {
  ctx = context
}

/** 回到对话区。`selectPanel(null)` 的实测语义就是“显示 Conversation”。 */
export function backToConversation(): void {
  if (ctx === undefined) return
  serviceOf<LayoutService>(ctx, 'layout')?.selectPanel(null)
}

/**
 * 切到本插件的主面板（§22.3「点击后跳转到主面板对应位置」）。
 *
 * 同样**懒解析** `layout`：卡片可能在任何时刻被点击，那时服务早就在了；
 * 而 `apply()` 期间它可能还没有（见本文件顶部的实测教训）。
 * 选中未注册的 key 会抛错（R1），所以只在本插件已注册 `main` 之后调用。
 */
export function showPanel(panelKey: string): boolean {
  if (ctx === undefined) return false
  const layout = serviceOf<LayoutService>(ctx, 'layout')
  if (layout === undefined) return false
  try {
    layout.selectPanel(panelKey)
    return true
  } catch {
    // 面板还没注册（极少见）——不要因此让卡片点击变成一次未捕获异常
    return false
  }
}
