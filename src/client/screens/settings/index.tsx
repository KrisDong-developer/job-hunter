import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ApiError } from '../../net/client.js'
import { fetchSettings, updateSettings } from '../../net/ops.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import { useAsync } from '../../hooks/use-async.js'
import { ConfigPanel, type SettingsPatch } from './config-panel.js'
import { DataPanel } from './data-panel.js'
import { LogsPanel } from './logs-panel.js'

/**
 * U10 设置 + U11 日志与诊断（§5.4）。
 *
 * 这两块原来只有 HTTP 接口，界面上够不着 —— 而"模型用途开关"与"我发了什么给模型"
 * 恰恰是最需要被用户看见的两件事（I5 知情同意）。
 *
 * 一条硬约束直接在界面上写出来：**额度、审批开关、审计开关模型不能改**（§22.4 禁止项）。
 * 所以那几项写明是谁在管 —— 但它们**用户能改**（`guardToken.actor === 'gui'` 时才放行），
 * 所以界面上是真控件，不是读数。
 *
 * ## 2026-09-18 重排（界面评审：空间利用率低 / 功能区混杂 / 文本代替控件）
 *
 * 原实现把 6 个平级模块纵向排成一列：宽屏下右侧一大片空白，找"关掉某个用途"
 * 要先滚过整屏日志，而"开 / 关"与"打招呼 20 · 投递 10 · 回复 30"都只是**文字**。
 * 现在拆成三个标签页，配置页内部再排成两栏响应式网格：
 *   * 「模型与系统配置」—— 模型用途 + 系统控制中心 + 运行资源；
 *   * 「诊断与调用日志」—— 指标卡 + 数据文件 + 模型调用留痕 + 操作审计；
 *   * 「数据与存储」—— 保留期、磁盘占用、清理、导出导入。
 *
 * ## 2026-09-20（界面审核：P1 两条 / P2 五条）
 *
 *   1. **写入不再让整张表单闪成 loading**。每次写入都要回读设置，而回读期间
 *      `useAsync` 默认退回 `loading` —— 于是每拨一个开关，全部控件都卸载再重建，
 *      键盘焦点也跟着丢回文档开头。现在：`keepPrevious` + 本文件记最后一次成功值，
 *      `ConfigPanel` 只在**从没读到过**时才让位给提示。
 *   2. **日志与诊断数据改为切到那个分区才拉**（移进 `LogsPanel`）。默认落在配置页时
 *      不再白拉 100 行日志与一次诊断 —— 原来的四发请求里有两发是给看不见的东西付的钱。
 *   3. **反馈条补 `role`**：它是这一屏唯一的操作反馈通道，读屏必须能听到"已生效"；
 *      同时从标签栏**上方**挪到下方 —— 它不再把分区导航推走。
 */
type SettingsTab = 'config' | 'logs' | 'data'

const SETTINGS_TABS: Array<[SettingsTab, string]> = [
  // 这一格里有模型用途、系统控制中心（闸门）与运行资源三张卡，
  // 所以名字取"模型与**系统**配置"而不是"模型与安全配置" —— 见 config-panel 的注释。
  ['config', '模型与系统配置'],
  ['logs', '诊断与调用日志'],
  // 第三个分区（§18 / J8）：保留期、磁盘占用、清理、导出导入。
  // 为什么不塞进「诊断」：那一屏回答"出问题时怎么自查"，这一屏回答"我的数据现在多大、
  // 能不能搬走" —— 使用时机不同（前者出事才看，后者隔几个月看一次），放一起会互相干扰。
  ['data', '数据与存储'],
]

export function SettingsScreen(props: { revision: number }) {
  const settings = useAsync((signal) => fetchSettings(signal), [props.revision], {
    keepPrevious: true,
  })
  const [tab, setTab] = useState<SettingsTab>('config')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * 最后一次**成功**读到的设置 —— 状态离开 `ok` 时拿它顶上。
   *
   * 直接读 `settings.state.data` 是不够的：每次写入都要回读，而回读期间（哪怕只有
   * 几十毫秒）状态会离开 `ok`。这时若把 `current` 当成 null，ConfigPanel 会把整张表单
   * 换成"正在读取设置…"再换回来 —— 每拨一个开关都来一次，焦点也一起丢。
   */
  const lastSettings = useRef<SettingsDto | null>(null)
  if (settings.state.status === 'ok') lastSettings.current = settings.state.data
  const current: SettingsDto | null =
    settings.state.status === 'ok' ? settings.state.data : lastSettings.current

  /**
   * 所有配置写入走同一条路径（`settings.write` 闸门）。
   *
   * 界面上有 8 个开关 + 5 个数字框，各自拼 patch 会写八遍 try/catch 与提示文案；
   * 这里统一 —— 也保证"写不进去时一定看得见原因"（`ApiError.display` 优先用宿主的 hint）。
   */
  const write = async (patch: SettingsPatch, okText: string): Promise<void> => {
    setBusy(true)
    try {
      await updateSettings(patch)
      setMessage({ tone: 'ok', text: okText })
      settings.reload()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof ApiError ? error.display : String(error) })
      // 写失败要把服务端的真值回读回来：数字框此刻显示的是用户刚输的值，
      // 不回读的话它会一直显示一个"没生效的数"，比报错本身更容易误导。
      settings.reload()
    } finally {
      setBusy(false)
    }
  }

  const labelOf = (purpose: string): string =>
    current?.derived.purposes.find((item) => item.purpose === purpose)?.label ?? purpose

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  /** 左右方向键在标签之间移动（tablist 的契约之一；切换后焦点跟着走）。 */
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length
    const next = SETTINGS_TABS[nextIndex]
    if (next === undefined) return
    setTab(next[0])
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="jh-screen jh-screen-settings">
      <div className="jh-row-head">
        <h2 className="jh-card-title">设置与诊断</h2>
        <span className="jh-muted">
          抓取额度、审批与审计开关只能由你在界面上改 —— 模型改不了（§22.4）
        </span>
      </div>

      {/* 二级分区。用 role=tablist 而不是 aria-current：这里是同屏内的两个视图，
          不是"整屏替换"的页面级分区（顶部那排导航才属于后者）。
          既然是 tablist，就把它该有的契约补齐：aria-controls 指向面板、
          roving tabindex（当前项 0 / 其余 -1）+ 左右方向键 —— 否则
          读屏用户听到"标签页"却按不动它，比不声明这个角色更糟。 */}
      <div className="jh-modes jh-set-tabs" role="tablist" aria-label="设置分区">
        {SETTINGS_TABS.map(([key, label], index) => (
          <button
            key={key}
            id={`jh-set-tab-${key}`}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`jh-set-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`jh-mode${tab === key ? ' jh-mode-active' : ''}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 反馈条放在标签栏**下方**：它是每个分区共用的状态，但不该把分区导航推走。
          `role` 不能省 —— 这一屏所有写入的结果（含失败原因）只在这一个元素里，
          没有 live region 的话读屏用户拨完开关得不到任何确认（WCAG 4.1.3）。
          失败用 alert（打断），成功用 status（等当前朗读结束）。 */}
      {message === null ? null : (
        <div className="jh-card jh-card-tight">
          <p
            className={message.tone === 'error' ? 'jh-error' : 'jh-ok'}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        </div>
      )}

      {tab === 'config' ? (
        <div role="tabpanel" id="jh-set-panel-config" aria-labelledby="jh-set-tab-config">
          <ConfigPanel
            current={current}
            /* 读失败也优先用宿主给的那句可执行提示（`ApiError.display` 的规则），
               与写入失败走同一条口径。 */
            error={
              settings.state.status === 'error'
                ? (settings.state.hint ?? settings.state.message)
                : null
            }
            busy={busy}
            write={write}
          />
        </div>
      ) : tab === 'logs' ? (
        <div role="tabpanel" id="jh-set-panel-logs" aria-labelledby="jh-set-tab-logs">
          <LogsPanel
            revision={props.revision}
            labelOf={labelOf}
            notify={(tone, text) => setMessage({ tone, text })}
          />
        </div>
      ) : (
        <div role="tabpanel" id="jh-set-panel-data" aria-labelledby="jh-set-tab-data">
          <DataPanel
            current={current}
            busy={busy}
            write={write}
            notify={(tone, text) => setMessage({ tone, text })}
          />
        </div>
      )}
    </div>
  )
}
