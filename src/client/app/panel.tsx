import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PHASE, PLUGIN_ID } from '../../shared/config/plugin.js'
import { ScreenErrorBoundary } from './error-boundary.js'
import { markJobRead } from '../net/jobs.js'
import { consumePanelIntent, subscribePanelIntent } from './intent.js'
import { backToConversation } from './runtime.js'
import { STREAM_LABEL, TABS, tabLabelOf, type Screen } from './tabs.js'
import { JobDetailDrawer } from '../views/job-detail/drawer.js'
import { JobsScreen } from '../screens/jobs/index.js'
import { InboxScreen } from '../screens/inbox/index.js'
import { InterviewsScreen } from '../screens/interviews/index.js'
import { BoardScreen } from '../screens/board/index.js'
import { PipelineScreen } from '../screens/pipeline/index.js'
import { CampusScreen } from '../screens/campus/index.js'
import { CollectScreen } from '../screens/collect/index.js'
import { ResumesScreen } from '../screens/resumes/index.js'
import { SettingsScreen } from '../screens/settings/index.js'
import { TodayScreen } from '../screens/today/index.js'
import { useEventStream } from '../hooks/use-event-stream.js'

/**
 * 面板主体：滚动区 + **屏级错误边界**（审计 F-2）。
 *
 * 包这一层是因为 10 个屏共用一棵 React 树，单屏在渲染期抛错会带走整块 UI。
 * `key={screen}` 让切标签即重挂 —— 坏掉的那一屏不会一直被兜底卡片钉住。
 * 产出的 DOM 与原来逐字一致（仍是 `<div className="jh-body" role="main">`）。
 */
function ScreenBody(props: { screen: Screen; children: ReactNode }) {
  return (
    <div className="jh-body" role="main">
      <ScreenErrorBoundary key={props.screen} name={tabLabelOf(props.screen)}>
        {props.children}
      </ScreenErrorBoundary>
    </div>
  )
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
        {/* aria-label：读屏要先知道"这是什么导航"，否则只听到十个按钮。
            （同文件的 .jh-pager 早就这么做了，这里之前漏了。） */}
        <nav className="jh-tabs" aria-label="求职找工作分区">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`jh-tab${screen === tab.key ? ' jh-tab-active' : ''}`}
              /* aria-current：当前分区**只由 CSS 类表达**，读屏听不出来。
                 这里是"整屏替换"的分区导航，不是 tablist，所以用 aria-current 而不是 aria-selected。 */
              aria-current={screen === tab.key ? 'page' : undefined}
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
        {/* role="status"：SSE 断开是用户需要知道的状态变化，
            之前只靠颜色和文字，读屏完全静默（全项目 aria-live 计数为 0）。 */}
        <span className={`jh-live jh-live-${stream.status}`} title={PLUGIN_ID} role="status">
          <i className="jh-dot" aria-hidden="true" />
          {STREAM_LABEL[stream.status] ?? stream.status}
        </span>
        <button type="button" className="jh-btn jh-btn-inline" onClick={backToConversation}>
          返回对话区
        </button>
      </header>

      {/* role="main"：面板是这一屏的主内容，之前没有任何 main landmark（10 屏全部缺失）。
          错误边界包在同一层，产出的 DOM 不变。 */}
      <ScreenBody screen={screen}>
        {screen === 'today' ? (
          <TodayScreen
            revision={revision}
            onGoJobs={() => setScreen('jobs')}
            // 「待确认动作」待办要把用户带回目标岗位（正文不入库，只能回去重新发起）
            onGoJob={(jobId) => {
              setSelected(jobId)
              setScreen('jobs')
            }}
            onGoCollect={() => setScreen('collect')}
          />
        ) : screen === 'collect' ? (
          <CollectScreen revision={revision} onGoSettings={() => setScreen('settings')} />
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
      </ScreenBody>

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
