import { PANEL_KEY, PLUGIN_ID } from '../shared/constants.js'
import type { Disposer, PluginContext, SlotsService } from '../shared/dsh.js'
import { serviceOf } from '../shared/dsh.js'
import { JobHunterEntryIcon } from './entry-icon.js'
import { JobHunterNotice } from './notice.js'
import { JobHunterPanel } from './panel.js'
import { bindContext } from './runtime.js'
import { installStyles } from './styles.js'
import { GreetingCard } from './toolviews/greeting-card.js'
import { JobDetailCard } from './toolviews/job-detail-card.js'
import { JobsCard } from './toolviews/jobs-card.js'

/** cordis 插件名（客户端半）。 */
export const name = PLUGIN_ID

/**
 * 硬依赖 `slots`。
 *
 * 这是实测踩出来的坑：客户端插件树里，本插件被挂载时 `slots` 服务**还没出现**，
 * 用 `ctx.get('slots')` 会拿到 undefined，整个 UI 就静默消失（不报错、不告警）。
 * 声明 inject 后 cordis 会把本插件驻留到 `slots` 就绪再激活 —— 这正是 inject 的用途。
 *
 * `layout` 故意**不**在这里声明：它只在“返回对话区”时用一次，改为点击时懒解析
 * （见 runtime.ts），避免为了一个按钮把整个插件挂起。
 */
export const inject = ['slots']

/**
 * 客户端半：把面板挂进 shell 的槽位。
 *
 * **注册顺序是硬要求**（§5.1 / R1 实测）：`layout.selectPanel(key)` 对未注册的 key
 * 会抛错并保留当前选择，所以必须先有 `main` 面板，再有指向它的侧栏入口。
 * 用 `slots.inject` 时槽位已由 shell 声明、回调**同步**执行，因此两者在同一 tick 内
 * 完成注册，那个“点了就报错”的窗口期实际不存在。
 *
 * 所有贡献都挂在本 fiber 上：停止/热重载时 `ctx.effect` 的清理函数会逆序摘除，
 * 对应 C15 的幂等要求（dispose → apply 反复发生不产生残留）。
 */
export function apply(ctx: PluginContext): void {
  const slots = serviceOf<SlotsService>(ctx, 'slots')
  if (slots === undefined) {
    // inject 已声明 slots，正常不会走到这里；保底不抛，免得一个 UI 问题拖垮整个客户端树。
    ctx.logger?.warn(`[${PLUGIN_ID}] slots 服务缺失，UI 未注册`)
    return
  }
  bindContext(ctx)

  const disposers: Disposer[] = []

  ctx.effect(() => {
    try {
      disposers.push(installStyles())

      // ① main 面板 —— 必须先注册
      disposers.push(
        slots.inject('main', () => slots.register({ name: 'main', key: PANEL_KEY }, JobHunterPanel)),
      )

      // ② 侧栏入口 —— id 与 main 的 key 同值，shell 据此把点击派发到 selectPanel(id)
      disposers.push(
        slots.inject('sidebar.panellist', () =>
          slots.register(
            { name: 'sidebar.panellist', id: PANEL_KEY, order: 50, label: () => '求职找工作' },
            JobHunterEntryIcon,
          ),
        ),
      )

      // ③ 浮层 —— 补偿 panellist 没有徽标位（C7）；渲染条件与自动消失见 notice.tsx
      disposers.push(
        slots.inject('shell.overlay', () =>
          slots.register({ name: 'shell.overlay', id: `${PANEL_KEY}-notice`, order: 50 }, JobHunterNotice),
        ),
      )

      // ④ 对话里的工具卡片（§22.3）。
      //    key = wire 工具名；未注册 key 的调用会退回通用工具行，所以这是**加法**。
      //    卡片上的按钮打的是与界面完全相同的端点 —— GUI 与对话共享同一份状态（§22.5）。
      //    注意 key 必须与**实际注册成功**的工具名逐字一致：宿主自带一个叫 `job_list`
      //    的后台任务工具，我们的同名工具会被拒绝注册，卡片就会去画别人的结果。
      for (const [key, component] of [
        ['job_search', JobsCard],
        ['job_query', JobsCard],
        ['job_detail', JobDetailCard],
        ['greeting_draft', GreetingCard],
      ] as const) {
        disposers.push(
          slots.inject('tool.call.toolview', () =>
            slots.register({ name: 'tool.call.toolview', key }, component),
          ),
        )
      }
    } catch (error) {
      disposeAll(disposers)
      throw error
    }
    return () => disposeAll(disposers)
  }, `${PLUGIN_ID}: client slots`)
}

/** 逆序清理，且单个清理失败不阻断其余清理（卸载链不能断）。 */
function disposeAll(disposers: Disposer[]): void {
  for (const dispose of disposers.splice(0).reverse()) {
    try {
      dispose()
    } catch {
      /* 已由调用方记录；这里不向上抛 */
    }
  }
}
