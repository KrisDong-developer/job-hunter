// 「运行仪表盘 · 最近运行」与「异常日志」两张表。
// RunHistoryTable 是每一轮发生了什么的完整流水（带日期、平台、命中/新增/更新/隔离、耗时）；
// RunLogCard 只列没跑成的轮次（失败或有 skipReason），排障时不必在成功行里找失败。
// 两处都把失败收成"状态胶囊 + 一句人话 + 详情"，完整 trace 交给外层弹窗。

import { runReasonLabel } from '../../../shared/enums.js'
import { humanizeFailure, type FailureText } from '../../../shared/error-text.js'
import { formatDuration, formatLocalMoment, formatRelative } from '../../../shared/time-format.js'
import type { RecentRunDto } from '../../../shared/dto.js'
import { StateTag } from './state-tag.js'

/**
 * 最近运行小表（SR-28）。
 *
 * 标题由外层卡片给（`h2`），所以这里不再自带一个 `h3` —— 同一个模块名写两遍
 * 只会让标题层级多出一层没有意义的嵌套。
 *
 * ## 这一轮补了什么（原表只有 开始/状态/触发/新增/更新/结果说明）
 *
 *   1. **「开始」带日期**。原来只打 `HH:MM` —— 一张跨天的表于是**看起来是乱序的**：
 *      `16:16 / 09:34 / 16:15` 其实是"今天 16:16 → 今天 09:34 → 昨天 16:15"，
 *      严格倒序，但只看时分根本看不出来。这是"最近运行没倒序"这个印象的来源。
 *   2. **平台**。多平台之后，"这一轮是哪个平台跑的"是读这张表的第一问题，
 *      而原表没有这一列 —— 10 行混在一起分不清谁是谁。
 *   3. **命中 / 耗时**。`found` 是每轮的头号数字（抓到多少条）；耗时回答
 *      "为什么这一轮跑了 12 分钟"。原表只给"新增/更新"，那是**入库**量，
 *      一页抓 300 条而全是旧的时，两个数字都是 0 —— 看起来像"什么都没干"。
 *   4. **隔离**（进 `pending_repair` 的条数）：数据质量信号，全为 0 时整列不出现。
 *      页数（`pages`）不进列：它是"命中"的解释，挂在那个格子的 `title` 上。
 *
 * ## 顺序
 *
 * 表**不排序**，按接口给的顺序渲染（`GET /scheduler/status` 的 `recentRuns`）。
 * 那个顺序现在由 host 侧按 `started_at DESC` 定义（见 `store/repo/crawl-runs.ts`
 * 里 `list()` 的注释）：界面不自己再排一遍，否则"界面看到的顺序"与
 * "接口承诺的顺序"会变成两套，将来只能靠猜。
 *
 * 错误不再把一整段堆栈摊在单元格里 —— 单元格只放**状态胶囊 + 一句人话 + 详情**，
 * 点开是弹窗（`Modal`）看完整 trace 与排查步骤。
 */
export function RunHistoryTable(props: {
  runs: RecentRunDto[]
  loading: boolean
  reasonFor: (skipReason: string | null) => string | null
  /** 平台 id → 显示名；认不出来返回 null（那就不编一个名字给它）。 */
  platformName?: (platformId: string) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  // 加载态与空态必须分开（见上面 `plansLoading` 的注释）
  if (props.loading) {
    return (
      <p className="jh-muted" aria-busy="true" aria-live="polite">
        正在读取运行记录…
      </p>
    )
  }
  if (props.runs.length === 0) {
    return (
      <div className="jh-empty">
        <p className="jh-muted">还没有运行记录。</p>
        <p className="jh-note">第一次「立即采集」或等到偏好时段自动触发之后，这里会出现每一轮的结果。</p>
      </div>
    )
  }

  const now = new Date()
  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null)
  // 全 0 的列不出现：一个从头到尾都是 0 的「隔离」列只是在占宽度
  const showQuarantined = props.runs.some((run) => run.quarantined > 0)

  return (
    <div className="jh-table-scroll">
      {/* 小屏策略：**有意的横向滚动**（quality-gates §5 允许，但要求保留行身份与主操作）。
          第一列（开始）做粘性，横向滚动时仍能认行；「更新」「隔离」列在小屏隐藏以降低密度。 */}
      <table className="jh-table jh-table-runs">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">开始</th>
            <th scope="col">平台</th>
            <th scope="col" className="jh-cell-status">状态</th>
            {showReason ? <th scope="col">触发</th> : null}
            <th scope="col" className="jh-num">命中</th>
            <th scope="col" className="jh-num">新增</th>
            <th scope="col" className="jh-num jh-col-hide-sm">更新</th>
            {showQuarantined ? <th scope="col" className="jh-num jh-col-hide-sm">隔离</th> : null}
            <th scope="col" className="jh-num">耗时</th>
            <th scope="col">结果说明</th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => {
            const skip = props.reasonFor(run.skipReason)
            const failure: FailureText | null =
              skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null
            const startedAt = new Date(run.startedAt)
            const duration =
              run.endedAt === null
                ? null
                : formatDuration(new Date(run.endedAt).getTime() - startedAt.getTime())
            // 平台列给人看的名字优先；认不出来就退回 id（不编名字）
            const platformName = props.platformName?.(run.platformId) ?? null
            return (
              <tr key={run.id}>
                {/* 带日期：跨天的表必须看得出"越过了一天"，否则倒序会读成乱序 */}
                <td
                  className="jh-col-sticky"
                  title={`${startedAt.toLocaleString()} · ${formatRelative(startedAt, now)}`}
                >
                  {formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt}
                </td>
                <td title={platformName === null ? run.platformId : `${platformName}（${run.platformId}）`}>
                  {platformName ?? <code>{run.platformId}</code>}
                </td>
                <td className="jh-cell-status">
                  <StateTag state={run.state} kind="run" />
                </td>
                {showReason ? <td>{runReasonLabel(run.reason) ?? '—'}</td> : null}
                {/* 页数挂在命中的 title 上：它是"命中多少"的解释，不值得单独占一列 */}
                <td className="jh-num" title={`翻了 ${String(run.pages)} 页`}>
                  {run.found}
                </td>
                <td className="jh-num">{run.inserted}</td>
                <td className="jh-num jh-col-hide-sm">{run.updated}</td>
                {showQuarantined ? (
                  <td
                    className={`jh-num jh-col-hide-sm${run.quarantined > 0 ? ' jh-warn' : ''}`}
                    title={
                      run.quarantined > 0
                        ? `${String(run.quarantined)} 条被字段断言拦下，进了待修队列（数据本身没写进岗位库）`
                        : undefined
                    }
                  >
                    {run.quarantined}
                  </td>
                ) : null}
                <td className="jh-num">{duration ?? (run.state === 'running' ? '进行中' : '—')}</td>
                <td>
                  {skip !== null ? (
                    <span>{skip}</span>
                  ) : failure === null ? (
                    <span className="jh-muted">—</span>
                  ) : (
                    // 单元格里只留"图标 + 一句人话（过长则截断）+ 详情"；点开是弹窗。
                    // 图标让"这是错误"不只靠颜色表达；截断是为了不再把状态列撑宽。
                    <button
                      type="button"
                      className="jh-err-chip"
                      title={failure.detail === null ? failure.short : failure.detail.split('\n')[0]}
                      onClick={() => props.onOpenError(run, failure)}
                    >
                      <span className="jh-err-chip-icon" aria-hidden="true">⚠</span>
                      <span className="jh-err-chip-short">{failure.short}</span>
                      <span className="jh-err-chip-more">详情</span>
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 异常日志（「诊断与明细」分区）。
 *
 * 只列**没跑成**的轮次：失败（有错误码）与被跳过（有 skipReason）。
 * 与「运行仪表盘 · 最近运行」的分工是：那边是"每一轮发生了什么"的完整流水，
 * 这边是"哪几轮没跑成、为什么" —— 排障时不该在一张多数是成功行的表里找失败。
 *
 * 失败原因仍然是**胶囊 + 点击弹窗**（与最近运行同一套），不把堆栈摊进单元格。
 */
export function RunLogCard(props: {
  runs: RecentRunDto[]
  loading: boolean
  reasonFor: (skipReason: string | null) => string | null
  /** 平台 id → 显示名；与「最近运行」同一套回调（两处都显示同一个名字）。 */
  platformName?: (platformId: string) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  if (props.loading) {
    return (
      <p className="jh-muted" aria-busy="true" aria-live="polite">
        正在读取运行记录…
      </p>
    )
  }

  const now = new Date()
  const rows = props.runs
    .map((run) => ({
      run,
      skip: props.reasonFor(run.skipReason),
      failure: humanizeFailure(run.errorCode, run.errorMsg),
    }))
    .filter((row) => row.skip !== null || row.failure !== null)

  if (rows.length === 0) {
    return (
      <div className="jh-empty">
        <p className="jh-muted">最近这些轮次里没有失败或跳过。</p>
        <p className="jh-note">
          这不等于"以后不会失败" —— 下一轮真失败了，完整原因与排查步骤会出现在这里。
        </p>
      </div>
    )
  }

  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-runs">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">开始</th>
            <th scope="col">平台</th>
            <th scope="col" className="jh-cell-status">状态</th>
            <th scope="col">原因</th>
            <th scope="col">触发</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ run, skip, failure }) => {
            const startedAt = new Date(run.startedAt)
            const platformName = props.platformName?.(run.platformId) ?? null
            return (
              <tr key={run.id}>
                {/* 与「最近运行」同一个理由：跨天的表必须带日期，否则倒序读不出来 */}
                <td
                  className="jh-col-sticky"
                  title={`${startedAt.toLocaleString()} · ${formatRelative(startedAt, now)}`}
                >
                  {formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt}
                </td>
                <td title={platformName === null ? run.platformId : `${platformName}（${run.platformId}）`}>
                  {platformName ?? <code>{run.platformId}</code>}
                </td>
                <td className="jh-cell-status">
                  <StateTag state={run.state} kind="run" />
                </td>
                <td>
                  {skip !== null ? (
                    <span>{skip}</span>
                  ) : failure === null ? (
                    <span className="jh-muted">—</span>
                  ) : (
                    <button
                      type="button"
                      className="jh-err-chip"
                      title={failure.detail === null ? failure.short : failure.detail.split('\n')[0]}
                      onClick={() => props.onOpenError(run, failure)}
                    >
                      <span className="jh-err-chip-icon" aria-hidden="true">⚠</span>
                      <span className="jh-err-chip-short">{failure.short}</span>
                      <span className="jh-err-chip-more">详情</span>
                    </button>
                  )}
                </td>
                <td>{runReasonLabel(run.reason) ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
