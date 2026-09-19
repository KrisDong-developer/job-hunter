import { PANEL_KEY } from '../../shared/config/plugin.js'
import { requestPanelIntent } from '../app/intent.js'
import { showPanel } from '../app/runtime.js'

/**
 * 把一次「在主面板里打开这个岗位」的意图送过去。
 *
 * 顺序有讲究：**先记意图、再切面板**。
 * `main` 是 keyed 槽位，切过去时面板可能是**刚挂载**的 ——
 * 先记意图，面板挂载时的 `consumePanelIntent()` 就能取到它；
 * 反过来则要看运气（面板若在切过去之后才订阅，通知已经错过了）。
 */
export function openJobInPanel(jobId: number, action: 'open' | 'draft' = 'open'): void {
  requestPanelIntent(jobId, action)
  showPanel(PANEL_KEY)
}
