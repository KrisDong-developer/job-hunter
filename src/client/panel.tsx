import { useCallback, useEffect, useRef, useState } from 'react'
import { PHASE, PLUGIN_ID } from '../shared/constants.js'
import { consumePanelIntent, subscribePanelIntent } from './intent.js'
import { backToConversation } from './runtime.js'
import { JobDetailDrawer } from './screens/job-detail.js'
import { JobsScreen } from './screens/jobs.js'
import { InboxScreen, InterviewsScreen } from './screens/messages.js'
import { BoardScreen, PipelineScreen } from './screens/pipeline.js'
import { CampusScreen } from './screens/campus.js'
import { CollectScreen } from './screens/collect.js'
import { ResumesScreen } from './screens/resumes.js'
import { SettingsScreen } from './screens/settings.js'
import { TodayScreen } from './screens/today.js'
import { useEventStream } from './use-event-stream.js'

type Screen =
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
const TABS: Array<{ key: Screen; label: string }> = [
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

const STREAM_LABEL: Record<string, string> = {
  open: '实时已连接',
  connecting: '实时连接中',
  closed: '实时已断开',
}

/**
 * 面板外壳：顶栏（标签 + 实时状态）+ 各屏。
 *
 * 岗位详情有两种呈现：岗位库里是**右侧内嵌栏**（列表不动，方便逐个比较），
 * 流水线 / 消息 / 面试里是**抽屉**（那三个屏是"处理一件事"，临时看一眼更合适）。
 *
 * SSE 的用法严格按 ADR-24：事件只当作「去重新拉一次」的提示，
 * 收到后合并成一次 revision 自增，各屏用这个 revision 作依赖重新取数。
 * 前端**不**从事件内容构建状态。
 */
export function JobHunterPanel() {
  const [screen, setScreen] = useState<Screen>('today')
  const [selected, setSelected] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const onHint = useCallback((type: string) => {
    // resync 表示宿主的有界缓冲接不上了：立刻整体重拉，不合并
    if (type === 'resync') {
      setRevision((value) => value + 1)
      return
    }
    // 其它事件可能连发（一轮抓取会发好几条），合并成一次重拉
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setRevision((value) => value + 1)
    }, 250)
  }, [])

  const stream = useEventStream(onHint)

  /**
   * 对话里的卡片点「在面板里打开」时，跳到这里（§22.3）。
   *
   * 挂载时先消费一次待处理意图 —— 卡片可能比面板**先**被点击
   *（`main` 是 keyed 槽位，切过来时本组件才刚挂载）。
   */
  useEffect(() => {
    const apply = (intent: { jobId: number }): void => {
      setScreen('jobs')
      setSelected(intent.jobId)
    }
    const first = consumePanelIntent()
    if (first !== null) apply(first)
    return subscribePanelIntent(apply)
  }, [])

  return (
    <div className="jh-root">
      <header className="jh-topbar">
        <h1 className="jh-title">求职找工作</h1>
        <span className="jh-badge">{PHASE}</span>
        <nav className="jh-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`jh-tab${screen === tab.key ? ' jh-tab-active' : ''}`}
              onClick={() => {
                setScreen(tab.key)
                // 换标签就丢掉选中的岗位：详情要么在岗位库里当右栏，要么当抽屉盖在上面，
                // 两个屏之间带着走只会让人莫名其妙（抽屉会凭空在别的标签上弹出来）。
                setSelected(null)
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <span className="jh-spacer" />
        <span className={`jh-live jh-live-${stream.status}`} title={PLUGIN_ID}>
          <i className="jh-dot" />
          {STREAM_LABEL[stream.status] ?? stream.status}
        </span>
        <button type="button" className="jh-btn jh-btn-inline" onClick={backToConversation}>
          返回对话区
        </button>
      </header>

      <div className="jh-body">
        {screen === 'today' ? (
          <TodayScreen
            revision={revision}
            onGoJobs={() => setScreen('jobs')}
            onGoCollect={() => setScreen('collect')}
          />
        ) : screen === 'collect' ? (
          <CollectScreen revision={revision} />
        ) : screen === 'settings' ? (
          <SettingsScreen revision={revision} />
        ) : screen === 'pipeline' ? (
          <PipelineScreen
            revision={revision}
            onChanged={() => setRevision((value) => value + 1)}
            onSelectJob={setSelected}
          />
        ) : screen === 'inbox' ? (
          <InboxScreen
            revision={revision}
            onChanged={() => setRevision((value) => value + 1)}
            onSelectJob={setSelected}
          />
        ) : screen === 'interviews' ? (
          <InterviewsScreen
            revision={revision}
            onChanged={() => setRevision((value) => value + 1)}
            onSelectJob={setSelected}
          />
        ) : screen === 'campus' ? (
          <CampusScreen revision={revision} onChanged={() => setRevision((value) => value + 1)} />
        ) : screen === 'board' ? (
          <BoardScreen
            revision={revision}
            // 下钻：漏斗上的数字点下去 → 去「流水线」看那一段的明细（§13 U8 → U5）
            onDrillDown={() => {
              setSelected(null)
              setScreen('pipeline')
            }}
          />
        ) : screen === 'resumes' ? (
          <ResumesScreen revision={revision} onChanged={() => setRevision((value) => value + 1)} />
        ) : (
          <JobsScreen
            revision={revision}
            selected={selected}
            onSelect={setSelected}
            onChanged={() => setRevision((value) => value + 1)}
          />
        )}
      </div>

      {/* 岗位库的详情是右侧内嵌栏（见 JobsScreen）；抽屉只服务其它三个屏。 */}
      {screen === 'jobs' || selected === null ? null : (
        <JobDetailDrawer
          id={selected}
          revision={revision}
          onClose={() => setSelected(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  )
}
