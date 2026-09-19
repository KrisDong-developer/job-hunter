import { PLUGIN_ID } from '../../shared/config/plugin.js'
import { CAMPUS } from './screens/campus.js'
import { COLLECT_BUTTONS, PLANS, COLLECT_USABILITY, PLAN_EDITOR_MODAL, RUNS_TABLE, PLATFORM_MATRIX } from './screens/collect.js'
import { ENTRY_ICON, SHELL, OVERLAY } from './shell.js'
import { FRESHNESS } from './views/freshness.js'
import { FUNNEL, BOARD_FILTERS, SALARY_BOX, BOARD_V2 } from './screens/board.js'
import { JOBS_FILTERS, JOBS, JOBS_DEDUP, PAGER, PAGER_CONTRAST_FIX, JOBS_SPLIT } from './screens/jobs.js'
import { MATCH_AND_FLAGS, DETAIL, TAILOR_AND_FILE, COMPANY_REVIEW_AND_SIBLINGS } from './views/job-detail.js'
import { MESSAGES } from './screens/messages.js'
import { PIPELINE_GROUP, PIPELINE } from './screens/pipeline.js'
import { RESUMES } from './screens/resumes.js'
import { SCREEN, CARD_TITLE, CONTROLS, TAG_AND_STATE, LINK, MODAL_SEG_TIMERANGE, DESTRUCTIVE_BUTTONS, QUALITY_GATES, EMPTY_AND_FEEDBACK, SWITCH_AND_NUMBER } from './primitives.js'
import { SEMANTIC_TEXT } from './tokens.js'
import { SETTINGS, SETTINGS_PURPOSES_AND_USAGE } from './screens/settings.js'
import { SMALL_TOP, SMALL } from './responsive.js'
import { TODAY, TODAY_HEALTH } from './screens/today.js'
import { TOOLVIEW_CARD } from './toolviews.js'

/**
 * 注入本插件的样式。
 *
 * 注意：真实客户端插件**没有** `styles` 服务 —— 那是动态插件的 sandbox builtin。
 * 页面上的惯例是插入 `<style data-plugin="<包名>">`；`dsh-client-hmr` 热重载时
 * 正是按 `style[data-plugin]` 清理旧样式的，所以这个属性必须写对。
 *
 * 颜色一律走主题 CSS 变量（§5.3），亮/暗主题共用一套，不硬编码颜色。
 */
export function installStyles(): () => void {
  for (const stale of document.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`)) stale.remove()
  const style = document.createElement('style')
  style.setAttribute('data-plugin', PLUGIN_ID)
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

/**
 * 层叠顺序 = 原来的行序，**不要重排**：这份列表就是 CSS 的覆盖关系本身。
 * 历史分节（"第三轮修复""第七轮"）刻意保留原名，改样式时先看清它在覆盖谁。
 */
const CSS = [ENTRY_ICON, SEMANTIC_TEXT, SHELL, SCREEN, CARD_TITLE, CONTROLS, JOBS_FILTERS, TODAY, COLLECT_BUTTONS, JOBS, JOBS_DEDUP, TAG_AND_STATE, PAGER, PAGER_CONTRAST_FIX, JOBS_SPLIT, MATCH_AND_FLAGS, DETAIL, OVERLAY, TOOLVIEW_CARD, RESUMES, TAILOR_AND_FILE, PIPELINE_GROUP, PIPELINE, MESSAGES, FUNNEL, BOARD_FILTERS, CAMPUS, FRESHNESS, TODAY_HEALTH, LINK, PLANS, COMPANY_REVIEW_AND_SIBLINGS, SALARY_BOX, COLLECT_USABILITY, MODAL_SEG_TIMERANGE, PLAN_EDITOR_MODAL, DESTRUCTIVE_BUTTONS, QUALITY_GATES, RUNS_TABLE, PLATFORM_MATRIX, EMPTY_AND_FEEDBACK, SETTINGS, SWITCH_AND_NUMBER, SETTINGS_PURPOSES_AND_USAGE, SMALL_TOP, SMALL, BOARD_V2].join('\n')
