/**
 * 导航模型：屏的集合 + 顶栏标签顺序。
 *
 * 单独成文件是因为 `panel.tsx` 只负责"怎么编排"，"有哪些屏、按什么顺序"是另一件事 ——
 * 改导航只需要动这一个文件。
 */

export type Screen =
  | 'today'
  | 'jobs'
  | 'pipeline'
  | 'inbox'
  | 'interviews'
  | 'campus'
  | 'board'
  | 'resumes'
  | 'collect'
  | 'settings'

/**
 * 标签顺序 = 日常使用的顺序：先看今天，再看岗位，然后才是跟进与复盘。
 *
 * **「采集」就是 §5.4 规划过的 U9**（tab 显示「采集」，页面标题「数据采集」）——
 * 不另造页面。它承载采集方案配置 + 平台状态 + 触发与"为什么没跑"，
 * 而这些内容原来全挤在「今日」里（那正是今日屏拥挤的根因）。
 * 「设置」是 §5.4 的 U10，与 U11 合并成一屏（见「日志与诊断」子块）。
 */
export const TABS: Array<{ key: Screen; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'jobs', label: '岗位库' },
  { key: 'collect', label: '采集' },
  { key: 'pipeline', label: '流水线' },
  { key: 'inbox', label: '消息' },
  { key: 'interviews', label: '面试' },
  { key: 'campus', label: '校招' },
  { key: 'board', label: '看板' },
  { key: 'resumes', label: '简历中心' },
  { key: 'settings', label: '设置' },
]

export const STREAM_LABEL: Record<string, string> = {
  open: '实时已连接',
  connecting: '实时连接中',
  closed: '实时已断开',
}

/** 某个分区的中文名（认不出的 key 原样返回 —— 不假装认识）。 */
export function tabLabelOf(key: Screen): string {
  return TABS.find((tab) => tab.key === key)?.label ?? key
}
