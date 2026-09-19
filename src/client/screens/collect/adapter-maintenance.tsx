/**
 * 适配器维护（U9 采集页的「异常日志」旁边）：**待修复队列** + **配置覆盖**。
 *
 * ## 这两块为什么必须存在
 *
 * B13（适配器健康监控）与 J2（可维护性）都是 P0，而它们此前**只有告警、没有处置**：
 *   * 字段断言拦下的记录只以一个数字出现在「今日 / 设置」上，点不进去 ——
 *     看不到坏在哪个字段、样本是哪个岗位，于是"修选择器"这件事没有入口；
 *   * `ADAPTERS.md` 的修复流程第 ③ 步要求"写 DB 覆盖"，而那个写入路径**根本不存在**
 *     （文档自己的注脚写着"目前只能直接写 sqlite"）。
 *
 * ## 为什么没有「重放」按钮
 *
 * `pending_repair` 表里有 `raw_html` 一列，但抓取入队时**不传**它（§18：原始页面默认不存）。
 * 没有原始 HTML 就没有"离线重放"这种能力 —— 给一个点下去什么都不会发生的按钮，
 * 正是本仓库明令避免的形态。所以这里的动作只有两个，对应真实工作流：
 * 改配置（热生效）→ 重跑一轮 → **丢弃 / 清空这一队**。
 */
import { useEffect, useState } from 'react'
import type { AdapterConfigDto } from '../../../shared/dto.js'
import { ApiError } from '../../net/client.js'
import { clearRepairs, discardRepair, fetchAdapterConfig, fetchRepairs, updateAdapterConfig } from '../../net/collect/platforms.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { FieldHint } from '../../ui/field-hint.js'
import { Modal } from '../../ui/modal.js'
import { useAsync } from '../../hooks/use-async.js'

/** 时间戳的紧凑显示（与消息页同一口径：切掉秒与 T）。 */
function stamp(at: string): string {
  return at.slice(0, 16).replace('T', ' ')
}

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? error.display : String(error)
}

// ── 待修复队列 ───────────────────────────────────────────────────────

/**
 * 被字段断言拦下的记录（`pending_repair`）。
 *
 * 每条给三个信息：坏在哪个平台、**缺哪些字段**、以及当时**已经解析出来**的原始标量
 * （后者能区分"整页解析崩了"与"只差一列" —— 修法完全不同）。
 */
export function RepairQueueCard(props: { revision: number; platforms: Array<{ id: string; displayName: string }> }) {
  const repairs = useAsync((signal) => fetchRepairs(undefined, signal), [props.revision])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const all = repairs.state.status === 'ok' ? repairs.state.data.items : []
  const byPlatform = repairs.state.status === 'ok' ? repairs.state.data.byPlatform : []
  const total = repairs.state.status === 'ok' ? repairs.state.data.total : 0
  const note = repairs.state.status === 'ok' ? repairs.state.data.note : ''
  const items = filter === '' ? all : all.filter((item) => item.platformId === filter)

  const nameOf = (id: string): string => props.platforms.find((item) => item.id === id)?.displayName ?? id

  const act = async (id: number, run: () => Promise<unknown>): Promise<void> => {
    setBusy(id)
    setError(null)
    try {
      await run()
      repairs.reload()
    } catch (thrown) {
      setError(reasonOf(thrown))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="jh-card">
      <div className="jh-form-head">
        <h2 className="jh-card-title">待修复记录</h2>
        <span className="jh-spacer" />
        {byPlatform.length === 0 ? null : (
          <select
            className="jh-select jh-select-inline"
            value={filter}
            aria-label="按平台筛选待修复记录"
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">全部平台（{total}）</option>
            {byPlatform.map((entry) => (
              <option key={entry.platformId} value={entry.platformId}>
                {nameOf(entry.platformId)}（{entry.count}）
              </option>
            ))}
          </select>
        )}
        <FieldHint text={note} />
      </div>

      {error === null ? null : (
        <ErrorLine role="alert">
          {error}
        </ErrorLine>
      )}

      {repairs.state.status === 'error' ? <ErrorLine>{repairs.state.message}</ErrorLine> : null}

      {repairs.state.status === 'loading' ? (
        <LoadingLine busy>
          正在读取待修复记录…
        </LoadingLine>
      ) : items.length === 0 ? (
        <p className="jh-muted">
          {total === 0
            ? '没有待修复的记录 —— 最近抓到的每一条都通过了字段断言。'
            : '当前筛选下没有记录。'}
        </p>
      ) : (
        <ul className="jh-tailor-notes">
          {items.map((item) => (
            <li key={item.id}>
              <div className="jh-row-head">
                <span>
                  <b>#{item.id}</b> · {nameOf(item.platformId)} · 缺{' '}
                  <b>{item.missingFields.join('、')}</b> · {stamp(item.capturedAt)}
                  {item.crawlRunId === null ? '' : ` · 抓取轮次 #${String(item.crawlRunId)}`}
                </span>
                <span className="jh-spacer" />
                <button
                  type="button"
                  className="jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost"
                  disabled={busy !== null}
                  title="这条确实没价值（平台自己的脏数据）→ 标记为已丢弃。记录保留，不删行。"
                  onClick={() => void act(item.id, async () => discardRepair(item.id))}
                >
                  丢弃
                </button>
              </div>
              {item.sourceUrl === null ? (
                <span className="jh-muted">没解析出样本地址（连 source_url 那一列也坏了）</span>
              ) : (
                <a className="jh-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                  {item.sourceUrl}
                </a>
              )}
              {item.raw === null ? null : (
                <details className="jh-details">
                  <summary>当时解析出来的字段（判断是整页崩了，还是只差一列）</summary>
                  <pre className="jh-json">{JSON.stringify(item.raw, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {byPlatform.length === 0 ? null : (
        <div className="jh-details-actions">
          {byPlatform.map((entry) => (
            <button
              key={entry.platformId}
              type="button"
              className="jh-btn jh-btn-inline jh-btn-tiny"
              disabled={busy !== null}
              onClick={() => setClearing(entry.platformId)}
            >
              选择器已修好 · 清空 {nameOf(entry.platformId)} 的 {entry.count} 条
            </button>
          ))}
        </div>
      )}

      {clearing === null ? null : (
        <Modal
          title={`清空 ${nameOf(clearing)} 的待修复队列`}
          label="清空待修复队列"
          onClose={() => setClearing(null)}
          footer={
            <>
              <button type="button" className="jh-btn jh-btn-inline" onClick={() => setClearing(null)}>
                取消
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-danger"
                disabled={busy !== null}
                onClick={() => {
                  const platformId = clearing
                  setClearing(null)
                  void act(0, async () => clearRepairs(platformId))
                }}
              >
                确认清空
              </button>
            </>
          }
        >
          <p className="jh-alert-body">
            只清 <b>{nameOf(clearing)}</b> 这一队，其它平台不受影响。记录不会删除，只是标记为已丢弃
            （留痕，便于下次遇到同样形态时回看）。
            <br />
            请先确认：选择器覆盖已经改好、并且<b>重跑过一轮抓取</b>、新数据正常。
            否则下一轮仍会把这些记录重新拦下来（那说明还没修好，不是队列的问题）。
          </p>
        </Modal>
      )}
    </section>
  )
}

// ── 适配器配置覆盖 ────────────────────────────────────────────────────

/**
 * 适配器配置覆盖的读写（J2）。
 *
 * 三层同屏：**代码默认 / DB 覆盖 / 实际生效**。少任何一层都会让"改了没生效"无法自查 ——
 * 只给生效值看不出哪些是覆盖来的，只给覆盖又不知道默认是什么。
 *
 * 保存后宿主会**重建适配器**（热生效），所以不需要重启插件 —— 这正是 J2 的要求。
 */
export function AdapterConfigCard(props: {
  revision: number
  platforms: Array<{ id: string; displayName: string }>
  /** 配置改了要通知父级重拉平台总览（能力/维度可能变）—— 热生效是宿主侧的，界面这边得跟上。 */
  onChanged?: (() => void) | undefined
}) {
  const [selected, setSelected] = useState('')
  const platformId = selected !== '' ? selected : (props.platforms[0]?.id ?? '')
  const config = useAsync<AdapterConfigDto | null>(
    async (signal) => (platformId === '' ? null : await fetchAdapterConfig(platformId, signal)),
    [platformId, props.revision],
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  // 配置一到就把编辑框填成"当前覆盖"（没有覆盖就是 `{}`）——
  // 让用户是从现状改起，而不是面对一个空框猜格式
  const current = config.state.status === 'ok' ? config.state.data : null
  useEffect(() => {
    if (current === null) return
    setDraft(current.override === null ? '{}' : JSON.stringify(current.override, null, 2))
    setSaved(null)
    setError(null)
  }, [current?.platformId, current?.override, current?.overrideKeys.length])

  const save = async (override: unknown): Promise<void> => {
    if (platformId === '') return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await updateAdapterConfig(platformId, override)
      setSaved(override === null ? '已清除覆盖，回到代码默认。已热生效。' : '已保存并热生效（适配器已重建）。')
      config.reload()
      props.onChanged?.()
    } catch (thrown) {
      setError(reasonOf(thrown))
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = (): void => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (thrown) {
      setError(`编辑框里不是合法 JSON：${thrown instanceof Error ? thrown.message : String(thrown)}`)
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('覆盖必须是一个 JSON 对象（例如 {"selectors":{"card":".joblist-item"}}）。要清除覆盖请用下面的按钮。')
      return
    }
    void save(parsed)
  }

  return (
    <section className="jh-card">
      <div className="jh-form-head">
        <h2 className="jh-card-title">适配器配置覆盖</h2>
        <span className="jh-spacer" />
        {props.platforms.length === 0 ? null : (
          <select
            className="jh-select jh-select-inline"
            value={platformId}
            aria-label="选择平台"
            onChange={(event) => setSelected(event.target.value)}
          >
            {props.platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.displayName}
              </option>
            ))}
          </select>
        )}
        <FieldHint text="平台改版把选择器打坏时，只写你要改的那几个键即可 —— 会和代码默认值合并。保存后立刻生效（适配器会被重建），不需要重启插件。留空回到代码默认。" />
      </div>

      {props.platforms.length === 0 ? (
        <p className="jh-muted">还没有注册平台。</p>
      ) : config.state.status === 'loading' ? (
        <LoadingLine busy>
          正在读取…
        </LoadingLine>
      ) : config.state.status === 'error' ? (
        <ErrorLine>{config.state.message}</ErrorLine>
      ) : current === null ? null : (
        <>
          {error === null ? null : (
            <ErrorLine role="alert">
              {error}
            </ErrorLine>
          )}
          {saved === null ? null : <p className="jh-note">{saved}</p>}

          <p className="jh-muted">
            当前覆盖：{current.overrideKeys.length === 0 ? '无（一切走代码默认）' : current.overrideKeys.join('、')}
          </p>

          <textarea
            className="jh-textarea"
            rows={8}
            spellCheck={false}
            aria-label="配置覆盖 JSON"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />

          <div className="jh-details-actions">
            <button type="button" className="jh-btn jh-btn-inline" disabled={busy} onClick={saveDraft}>
              {busy ? '保存中…' : '保存并热生效'}
            </button>
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-danger-ghost"
              disabled={busy || current.overrideKeys.length === 0}
              title="删除这份覆盖，回到代码默认值。"
              onClick={() => void save(null)}
            >
              清除覆盖
            </button>
          </div>

          <details className="jh-details">
            <summary>看实际生效值与代码默认值</summary>
            <p className="jh-muted">实际生效（适配器此刻拿在手里的那一份）：</p>
            <pre className="jh-json">{JSON.stringify(current.effective, null, 2)}</pre>
            <p className="jh-muted">代码默认：</p>
            <pre className="jh-json">{JSON.stringify(current.defaults, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  )
}
