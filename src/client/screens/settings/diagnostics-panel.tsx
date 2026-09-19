import { useEffect, useState } from 'react'
import type { HealthDto } from '../../../shared/contract/dto/crawl.js'
import type { AsyncState } from '../../hooks/use-async.js'
import { ApiError } from '../../net/client.js'
import { revealDataDir } from '../../net/ops.js'
import { IconCopy, IconFolder } from '../../ui/icons.js'
import { copyToClipboard } from './clipboard.js'

export function DiagnosticsPanel(props: {
  health: AsyncState<HealthDto>
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  const health = props.health

  const copyPath = async (path: string): Promise<void> => {
    // 复制失败必须说出来：不然按钮点了没反应，用户会以为界面坏了
    if (await copyToClipboard(path)) {
      props.notify('ok', '已复制数据文件路径。')
      return
    }
    props.notify('error', '复制失败 —— 浏览器不允许写剪贴板，请手动选中路径复制。')
  }

  const revealDir = async (): Promise<void> => {
    try {
      const result = await revealDataDir()
      // 宿主说没打开就别说"已打开"：没有文件管理器的环境里，谎报成功比报错更难查
      props.notify(
        result.ok ? 'ok' : 'error',
        result.ok
          ? `已在系统文件管理器中打开：${result.dir}`
          : `打不开文件夹：${result.reason ?? '未知原因'}（${result.dir}）`,
      )
    } catch (error) {
      props.notify('error', error instanceof ApiError ? error.display : String(error))
    }
  }

  const dataPath =
    health.status === 'ok' && health.data.dataReady ? health.data.dataPath : null

  return (
    <section className="jh-card">
      <h2 className="jh-card-title">诊断</h2>
      {health.status !== 'ok' ? (
        <p className="jh-muted">正在读取诊断信息…</p>
      ) : (
        <>
          {/* 指标卡：版本 / 运行时长 / 工具数这类核心读数从 kv 列表里提出来，
              横排一眼扫完；剩下的才是路径、离线模式这种"要看细节"的项。
              数据层没起来时**不摆一排 0** —— 那会读成"真的 0 个岗位"，
              而此时该被看见的是打不开库的原因（dataError）。 */}
          {health.data.dataReady ? (
            <>
              <div className="jh-stats">
                <div className="jh-stat">
                  <b>{health.data.version}</b>
                  <span>版本 · {health.data.phase}</span>
                </div>
                <LiveUptimeCard uptimeMs={health.data.hostUptimeMs} />
                <div className="jh-stat">
                  <b>{health.data.tools === null ? '—' : health.data.tools.registered.length}</b>
                  <span>已挂载工具</span>
                </div>
                <div className="jh-stat">
                  <b>
                    {health.data.jobCount} / {health.data.companyCount}
                  </b>
                  <span>岗位 / 公司</span>
                </div>
                <div
                  className={`jh-stat${health.data.pendingRepairCount > 0 ? ' jh-stat-warn' : ''}`}
                >
                  <b>{health.data.pendingRepairCount}</b>
                  <span>待修复</span>
                </div>
              </div>

              {dataPath === null ? null : (
                <div className="jh-field">
                  <span className="jh-field-label">数据文件</span>
                  <div className="jh-path">
                    <code title={dataPath}>{dataPath}</code>
                    <button
                      type="button"
                      className="jh-icon-btn"
                      title="复制路径"
                      aria-label="复制数据文件路径"
                      onClick={() => void copyPath(dataPath)}
                    >
                      <IconCopy />
                    </button>
                    <button
                      type="button"
                      className="jh-icon-btn"
                      title="打开所在文件夹"
                      aria-label="打开数据文件所在文件夹"
                      onClick={() => void revealDir()}
                    >
                      <IconFolder />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="jh-alert jh-alert-error" role="alert">
              <div className="jh-alert-head">
                <span className="jh-alert-title">数据层未就绪</span>
              </div>
              <p className="jh-alert-body">
                {health.data.dataError ?? '没有可读的失败原因 —— 数据层尚未就绪。'}
              </p>
            </div>
          )}

          <div className="jh-ctl">
            <span className="jh-field-label">离线模式</span>
            <span className={health.data.offline ? 'jh-warn' : 'jh-muted'}>
              {health.data.offline ? '已开启 —— 抓取与登录引导会被拒绝' : '关闭'}
            </span>
          </div>

          {health.data.tools !== null && health.data.tools.failed.length > 0 && (
            <p className="jh-error">
              工具注册失败：
              {health.data.tools.failed.map((item) => `${item.name}（${item.reason}）`).join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/**
 * 「运行时长」指标卡。
 *
 * 为什么单独一个组件：`health` 只在 revision 变化（真实 SSE 事件）时重拉，
 * 而心跳是注释帧（`: ping`）、不会触发 `onmessage` —— 直接渲染 `hostUptimeMs`
 * 会让这个数字**冻住**，"活的"指标不动比不显示更容易误判。
 * 这里按"面板读取时的宿主时长 + 本地经过时间"每秒自增；单独成组件是为了让
 * 每秒的重渲染只落在这张卡上，不带着整张日志表一起重画。
 */
function LiveUptimeCard(props: { uptimeMs: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [props.uptimeMs])

  return (
    <div className="jh-stat" title="面板读取时的宿主运行时长 + 本地经过时间，每秒自增">
      <b>{Math.round(props.uptimeMs / 1000) + elapsed}s</b>
      <span>运行时长</span>
    </div>
  )
}
