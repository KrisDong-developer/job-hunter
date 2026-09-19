/**
 * 「设置 → 数据」分区（§18 / J8）。
 *
 * 四块，对应四件真实的事：
 *   1. **保留策略** —— 多久之后可以清（§18.2 分层保留；投递/打招呼/消息/简历不在清理范围内）；
 *   2. **磁盘占用** —— 到底占了多大、占在哪（§18.3 P3）；
 *   3. **清理** —— **先预览再执行**（§18.3 P2 是 P0，删除不可逆）；
 *   4. **导出 / 导入** —— 数据搬家（J8：工具会坏，数据不能死）。
 *
 * ## 界面上的三条硬约束
 *
 * * **执行清理必须经过预览 + 弹窗确认**：宿主要求 `confirm: true`，
 *   而这一层保证"用户看到过将删什么"。按钮在没拉过预览时是禁用的。
 * * **执行结果显示 VACUUM 前后真实文件大小**：R16 的教训是"删了但文件没小"
 *   会被当成功能失效，所以"实际可用"必须是真数字，不是"已完成"。
 * * **导入按行分批**：宿主请求体上限 64KB（安全常量，不抬）。分批的前提是内容里
 *   没有引号（引号内可能有换行，按行切会把一行切成两半）—— 有引号时不分批并说明。
 */
import { useState } from 'react'
import { ApiError } from '../../net/client.js'
import { dataExportUrl, fetchStorage, importJobsPayload, previewCleanup, runCleanup } from '../../net/ops.js'
import type { SettingsDto } from '../../../shared/contract/dto/settings.js'
import type { CleanupPlanDto, DataImportResultDto, RetentionPolicy } from '../../../shared/contract/dto/storage.js'
import { ErrorLine, LoadingLine } from '../../ui/async-view.js'
import { FieldHint } from '../../ui/field-hint.js'
import { Modal } from '../../ui/modal.js'
import { Switch } from '../../ui/switch.js'
import { useAsync } from '../../hooks/use-async.js'

/** 一次导入请求最多带多少行（64KB 上限下留足余量）。 */
const CHUNK_ROWS = 300

/** 保留期里"天数"那几项（`autoCleanEnabled` 是开关，不在其中）。 */
type RetentionDaysKey = Exclude<keyof RetentionPolicy, 'autoCleanEnabled'>

/** 保留期的可编辑项（顺序即界面顺序）。 */
const RETENTION_FIELDS: Array<{ key: RetentionDaysKey; label: string; hint: string }> = [
  { key: 'crawlRunsDays', label: '抓取运行记录', hint: '每轮抓取的执行记录。清掉只影响「运行历史」。' },
  { key: 'auditLogDays', label: '操作审计', hint: '每次过闸门动作的留痕（字段摘要，不含正文）。' },
  { key: 'llmCallsDays', label: '模型调用留痕', hint: '每次模型调用的外发字段清单。默认永久保留。' },
  { key: 'pendingRepairDays', label: '已处理的待修复记录', hint: '已丢弃/已修复的隔离记录；仍待处理的不会被清。' },
  { key: 'jdTextDays', label: 'JD 原文与摘要', hint: '体积大头。只清字段、不删岗位 —— 代价是回看不了原文。' },
  { key: 'jobsDays', label: '从没被碰过的老岗位', hint: '收藏过、投过、聊过的岗位永不自动删。' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? error.display : String(error)
}

export function DataPanel(props: {
  current: SettingsDto | null
  busy: boolean
  write: (patch: { retention?: Record<string, unknown> }, okText: string) => Promise<void>
  notify: (tone: 'ok' | 'error', text: string) => void
}) {
  /** 占用统计的重取版本号（清理完要重新统计 —— 不重取的话用户看到的还是清理前的数字）。 */
  const [storageRevision, setStorageRevision] = useState(0)
  const storage = useAsync((signal) => fetchStorage(signal), [storageRevision])
  const retention = props.current?.retention ?? null
  const defaults = props.current?.derived.defaults.retention ?? null

  // 保留策略用本地草稿：6 个数字框各自请求一次既慢又会在中途出现半保存状态
  const [draft, setDraft] = useState<Partial<Record<RetentionDaysKey, number>> | null>(null)
  /** 编辑框显示的值：草稿优先，缺的用服务端现值。 */
  const shownDays = (key: RetentionDaysKey): number => draft?.[key] ?? retention?.[key] ?? 0

  const [plan, setPlan] = useState<CleanupPlanDto | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [planning, setPlanning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)

  const [importResult, setImportResult] = useState<DataImportResultDto | null>(null)
  const [importing, setImporting] = useState(false)

  const loadPlan = async (): Promise<void> => {
    setPlanning(true)
    setCleanupResult(null)
    try {
      const next = await previewCleanup()
      setPlan(next)
      // 默认勾上"真的会删东西"的那些；保留期为 0 的项取消勾选（它们本来就执行不了）
      setSelected(next.items.filter((item) => item.willRun).map((item) => item.id))
    } catch (error) {
      props.notify('error', reasonOf(error))
    } finally {
      setPlanning(false)
    }
  }

  const execute = async (): Promise<void> => {
    setConfirming(false)
    setRunning(true)
    try {
      const result = await runCleanup({ only: selected })
      setCleanupResult(
        result.totalRows === 0
          ? '没有需要清理的数据 —— 一个字节都没动。'
          : `已清理 ${String(result.totalRows)} 行：文件 ${formatBytes(result.dbBytesBefore)} → ${formatBytes(result.dbBytesAfter)}` +
            `${result.vacuumed ? '（已 VACUUM）' : '（VACUUM 未执行，文件暂时不会变小）'}`,
      )
      props.notify('ok', '清理完成')
      setPlan(null)
      setStorageRevision((value) => value + 1)
    } catch (error) {
      props.notify('error', reasonOf(error))
    } finally {
      setRunning(false)
    }
  }

  const importFile = async (file: File): Promise<void> => {
    setImporting(true)
    setImportResult(null)
    try {
      const buffer = await file.arrayBuffer()
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch {
        // 中文 Excel 默认另存 GBK：浏览器有该解码器，先替用户试一次
        try {
          text = new TextDecoder('gbk').decode(buffer)
        } catch {
          throw new Error('读不出这个文件的文字编码。请另存为 CSV UTF-8 再试。')
        }
      }
      const format: 'csv' | 'json' = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'
      if (format === 'json') {
        setImportResult(await importJobsPayload({ format, content: text }))
      } else {
        setImportResult(await importCsvInBatches(text))
      }
      props.notify('ok', '导入完成')
    } catch (error) {
      props.notify('error', reasonOf(error))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="jh-screen">
      {/* ── 保留策略 ───────────────────────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">保留策略</h2>
          <span className="jh-spacer" />
          <FieldHint text="单位是「天」，0 = 永久保留。投递记录、打招呼、消息、面试、简历与附件**不在清理范围内**（下面「磁盘占用」里列为长期保留）—— 它们是归因与复盘的资产，只能由你自己删。" />
        </div>
        {retention === null ? (
          <LoadingLine>正在读取…</LoadingLine>
        ) : (
          <>
            {RETENTION_FIELDS.map((field) => (
              <div key={field.key} className="jh-ctl">
                <span className="jh-field-label">
                  {field.label}
                  <FieldHint
                    text={`${field.hint}（出厂默认 ${String(defaults?.[field.key] ?? 0)} 天；0 = 永久保留）`}
                  />
                </span>
                <input
                  className="jh-input jh-input-narrow"
                  type="number"
                  min={0}
                  max={3650}
                  aria-label={field.label}
                  value={String(shownDays(field.key))}
                  disabled={props.busy}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    setDraft({ ...(draft ?? {}), [field.key]: Number.isFinite(value) ? value : 0 })
                  }}
                />
              </div>
            ))}
            <div className="jh-ctl">
              <span className="jh-field-label">
                启动时自动清理
                <FieldHint text="默认关。开启后每次启动插件时按上面的保留期清一次（并 VACUUM）。删除不可逆，建议先手动跑一次「预览清理」看清会删什么再打开。" />
              </span>
              <Switch
                checked={retention?.autoCleanEnabled === true}
                disabled={props.busy}
                label="启动时自动清理"
                onChange={(next) =>
                  void props.write(
                    { retention: { autoCleanEnabled: next } },
                    next ? '已开启启动时自动清理' : '已关闭启动时自动清理',
                  )
                }
              />
            </div>
            <div className="jh-details-actions">
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                disabled={props.busy || draft === null}
                onClick={() => {
                  const patch = draft
                  setDraft(null)
                  void props.write({ retention: patch ?? {} }, '保留策略已保存（下次预览 / 清理即生效）')
                }}
              >
                保存保留期
              </button>
              <button
                type="button"
                className="jh-btn jh-btn-inline"
                disabled={props.busy || defaults === null}
                onClick={() => {
                  setDraft(null)
                  void props.write(
                    { retention: defaults as unknown as Record<string, unknown> },
                    '已恢复出厂默认保留期',
                  )
                }}
              >
                恢复默认
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── 磁盘占用 ───────────────────────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">磁盘占用</h2>
          <span className="jh-spacer" />
          <button type="button" className="jh-btn jh-btn-inline" onClick={storage.reload}>
            刷新
          </button>
          <FieldHint text={storage.state.status === 'ok' ? storage.state.data.note : '按表字节数来自 SQLite 的 dbstat（真实分页大小）。'} />
        </div>
        {storage.state.status === 'error' ? <ErrorLine>{storage.state.message}</ErrorLine> : null}
        {storage.state.status !== 'ok' ? (
          <LoadingLine>正在统计…</LoadingLine>
        ) : (
          <>
            <ul className="jh-kv">
              <li>
                <span>数据目录</span>
                {/* 路径要显示出来：用户问"我的数据到底在哪"时，这一页就该能回答
                    （「诊断」页那个「打开所在文件夹」在另一个分区，不该逼人来回找） */}
                <span title={storage.state.data.dataDir}>{storage.state.data.dataDir}</span>
              </li>
              <li>
                <span>数据库文件</span>
                <span>
                  {formatBytes(storage.state.data.db.bytes)}
                  {storage.state.data.db.walBytes > 0
                    ? ` + WAL ${formatBytes(storage.state.data.db.walBytes)}`
                    : ''}
                </span>
              </li>
              <li>
                <span>简历附件</span>
                <span>
                  {storage.state.data.attachments.fileCount} 个文件 · {formatBytes(storage.state.data.attachments.bytes)}
                </span>
              </li>
              <li>
                <span>导出归档</span>
                <span>
                  {storage.state.data.exports.fileCount} 个文件 · {formatBytes(storage.state.data.exports.bytes)}
                </span>
              </li>
            </ul>
            <details className="jh-details">
              <summary>看按表 / 按类型的明细</summary>
              <p className="jh-muted">占用最大的表：</p>
              <table className="jh-table jh-table-roomy">
                <thead>
                  <tr>
                    <th scope="col">表</th>
                    <th scope="col" className="jh-num">占用</th>
                    <th scope="col" className="jh-num">行数</th>
                  </tr>
                </thead>
                <tbody>
                  {storage.state.data.tables.slice(0, 12).map((table) => (
                    <tr key={table.table}>
                      <td>{table.table}</td>
                      <td className="jh-num">{formatBytes(table.bytes)}</td>
                      <td className="jh-num">{table.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="jh-muted">按类型（清理口径）：</p>
              <ul className="jh-kv">
                {storage.state.data.types.map((type) => (
                  <li key={type.id}>
                    <span title={type.note}>
                      {type.label}
                      {type.auto ? '' : '（长期保留）'}
                    </span>
                    <span>
                      {type.rows} 行 · {formatBytes(type.bytes)}
                      {type.auto && type.retentionDays > 0 ? ` · 保留 ${String(type.retentionDays)} 天` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </section>

      {/* ── 清理 ──────────────────────────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">清理</h2>
          <span className="jh-spacer" />
          <button
            type="button"
            className="jh-btn jh-btn-inline"
            disabled={planning || running}
            onClick={() => void loadPlan()}
          >
            {planning ? '正在预览…' : '预览清理（不改任何数据）'}
          </button>
          <FieldHint text="预览只读、可反复点。执行清理会真的删数据，而且不可逆 —— 所以必须先预览、勾选、再在弹窗里确认。执行后会跑一次 VACUUM，文件才会真的变小。" />
        </div>
        {cleanupResult === null ? null : <p className="jh-note">{cleanupResult}</p>}
        {plan === null ? (
          <p className="jh-muted">还没有预览。点上面的按钮看"按现在的保留期会删掉什么"。</p>
        ) : (
          <>
            <p className="jh-muted">
              共 {plan.totalRows} 行 · 预计释放 {formatBytes(plan.totalBytes)} · 数据库当前{' '}
              {formatBytes(plan.dbBytesBefore)}（VACUUM 后才会真的变小）
            </p>
            <ul className="jh-tailor-notes">
              {plan.items.map((item) => (
                <li key={item.id}>
                  <label className="jh-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      disabled={!item.willRun}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      <b>{item.label}</b>：{item.rows} 行 / {formatBytes(item.bytes)}
                    </span>
                  </label>
                  <div className="jh-muted">{item.reason}</div>
                  <div className="jh-muted">{item.describe}</div>
                </li>
              ))}
            </ul>
            <p className="jh-muted">{plan.note}</p>
            <div className="jh-details-actions">
              <button
                type="button"
                className="jh-btn jh-btn-inline jh-btn-danger"
                disabled={running || selected.length === 0}
                onClick={() => setConfirming(true)}
              >
                {running ? '清理中…' : `执行清理（${String(plan.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.rows, 0))} 行）`}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── 导出 / 导入 ───────────────────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">导出与导入</h2>
          <FieldHint text="导出的 JSON 是全量结构化备份（换机器留底认准它）；CSV 是给 Excel 看的（带 BOM，打开不乱码）；归档多带简历附件的原文件。导入只做**岗位**，且是幂等的 —— 同一份表导两次只会更新。" />
        </div>
        <div className="jh-details-actions">
          <a className="jh-btn jh-btn-inline" href={dataExportUrl('json')} download>
            导出 JSON（全量备份）
          </a>
          <a className="jh-btn jh-btn-inline" href={dataExportUrl('csv')} download>
            导出 CSV（Excel 可读）
          </a>
          <a className="jh-btn jh-btn-inline" href={dataExportUrl('archive')} download>
            导出归档（含简历附件）
          </a>
        </div>

        <div className="jh-row-head">
          <label className="jh-field">
            <span className="jh-field-label">导入岗位清单</span>
            <input
              className="jh-input"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              disabled={importing || props.busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                // 清掉 value：否则同一个文件第二次选不会触发 change（用户会以为"点了没反应"）
                event.target.value = ''
                if (file !== undefined) void importFile(file)
              }}
            />
          </label>
          <FieldHint text="支持 CSV（UTF-8；GBK 会自动试一次）与 JSON 的岗位数组。Excel 的 .xlsx 二进制不支持 —— 请另存为 CSV UTF-8。表头可以用「岗位标题 / 标题 / 职位」，也认「公司 / 薪资 / 城市 / 来源链接」等常见叫法。" />
        </div>
        {importing ? <p className="jh-muted">正在导入…</p> : null}
        {importResult === null ? null : (
          <div>
            <p className="jh-note">
              新增 {importResult.inserted} · 更新 {importResult.updated} · 跳过 {importResult.skipped}（共解析{' '}
              {importResult.received} 行）
            </p>
            <p className="jh-muted">{importResult.note}</p>
            {importResult.errors.length === 0 ? null : (
              <details className="jh-details" open>
                <summary>逐行问题（{importResult.errors.length} 条）</summary>
                <ul className="jh-tailor-notes">
                  {importResult.errors.map((error, index) => (
                    <li key={`${String(error.row)}-${String(index)}`} className="jh-muted">
                      第 {error.row} 行：{error.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {confirming ? (
        <Modal
          title="确认清理数据"
          label="清理数据确认"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="jh-btn jh-btn-inline" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="jh-btn jh-btn-inline jh-btn-danger" onClick={() => void execute()}>
                确认清理，且不可恢复
              </button>
            </>
          }
        >
          <p className="jh-alert-body">
            将会清理 {selected.length} 类、共{' '}
            {plan?.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.rows, 0) ?? 0} 行。
            这一步**不可撤销**，且只清理上面列出的那几类（投递记录、打招呼、消息、面试、简历与附件都不在其中）。
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

/**
 * CSV 分批导入。
 *
 * 只有内容里**没有引号**时才分批：引号字段里可能有换行，按行切会把一行切成两半
 * （而"半个岗位"比拒绝导入糟得多）。有引号时整份一次发 —— 超过请求体上限就如实报错，
 * 让用户自己拆文件，而不是猜一个可能切错的方式。
 */
async function importCsvInBatches(text: string): Promise<DataImportResultDto> {
  const quoted = text.includes('"')
  const lines = text.split(/\r?\n/)
  const header = lines[0] ?? ''
  const body = lines.slice(1).filter((line) => line.trim() !== '')

  if (quoted || body.length <= CHUNK_ROWS) {
    return await importJobsPayload({ format: 'csv', content: text })
  }

  const aggregate: DataImportResultDto = {
    format: 'csv',
    received: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    moreErrors: 0,
    note: '',
  }
  for (let start = 0; start < body.length; start += CHUNK_ROWS) {
    const chunk = [header, ...body.slice(start, start + CHUNK_ROWS)].join('\r\n')
    const result = await importJobsPayload({ format: 'csv', content: chunk })
    aggregate.received += result.received
    aggregate.inserted += result.inserted
    aggregate.updated += result.updated
    aggregate.skipped += result.skipped
    aggregate.errors.push(...result.errors)
    aggregate.moreErrors += result.moreErrors
    aggregate.note = result.note
  }
  return { ...aggregate, errors: aggregate.errors.slice(0, 20) }
}
