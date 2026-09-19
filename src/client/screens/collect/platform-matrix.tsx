// 平台总览矩阵与其诊断明细（主从结构）。
// PlatformMatrix 给出横向可比的事实（今天能跑 / 登录 / 健康 / 成熟度 / 额度 / 产量 / 最近一轮），
// 展开行里的 PlatformDetail 只回答"它现在为什么是这样"（被什么挡住、登录态、连续缺失、产量掉没掉）。
// cooldownActive 是这两个组件共用的冷却判定，只在模块内使用。

import { Fragment } from 'react'
import {
  CRAWL_STATE_LABEL,
  HEALTH_STATE_LABEL,
  MATURITY_LEVEL_LABEL,
  MATURITY_LEVEL_SHORT,
  MATURITY_LEVEL_TONE,
  maturityNeedsWarning,
} from '../../../shared/enums.js'
import { formatClock } from '../../../shared/time-format.js'
import type { PlatformOverviewDto } from '../../api.js'
import { Term } from '../../terms.js'
import { StateTag } from './state-tag.js'

function cooldownActive(until: string | null, now: Date): Date | null {
  if (until === null) return null
  const at = new Date(until)
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at
}

/**
 * 平台总览**矩阵**（批次 5）—— 现在是**主从结构**：一行一个平台，
 * 展开就在该行下方看它的诊断明细。
 *
 * ## 为什么保留矩阵，而不是把明细竖着摊开
 *
 * 平台列表是**纵向**读的（一个平台一段，能写很多解释），而多平台真正要回答的问题
 * 恰恰是**横向**的 —— "这些平台里今天哪几个真的能跑"。纵向列表回答不了它：
 * 得逐段读完，还得自己记住上一段说了什么。
 * 但反过来，把"为什么"整段删掉也不行 —— 排障时那些信息就是全部。
 * 所以：矩阵负责横向可比的事实，**明细挂在该行下面按需展开**。
 * 页面上不再有"表格 + 长列表"两份关于同一批平台的东西（那正是这次要消掉的重复）。
 *
 * ## 状态一律用标准徽标
 *
 * 一格一个 `.jh-tag`，四档颜色定死：绿=正常/已登录/可以，黄=降级/未登录/被挡住，
 * 红=失效，灰=未启用/未检测/没跑过。原来「已登录」是**彩色文字**、「健康」是徽标、
 * 「今天能跑」又是另一段文字 —— 同一张表里三种形状，大小还不一样。
 *
 * 「今天能跑」那一列仍然用点号表示长原因（全文进 title）：短标签是**第二份文案**，
 * 迟早会和 `SKIP_REASON_LABEL` 漂移，用户就在两处读到两种说法。
 */
export function PlatformMatrix(props: {
  items: PlatformOverviewDto[]
  reasonText: Record<string, string>
  /** 当前展开的是哪一个平台（主从结构里的"主"的选择）。 */
  expandedId: string | null
  onToggle: (platformId: string) => void
  running: boolean
  onLogin: (platformId: string) => void
  onGoSettings: () => void
}) {
  const now = new Date()
  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-matrix">
        <thead>
          <tr>
            <th scope="col" className="jh-col-sticky">平台</th>
            <th scope="col">今天能跑</th>
            <th scope="col">登录</th>
            <th scope="col" className="jh-cell-status">健康</th>
            <th scope="col" className="jh-col-hide-sm">成熟度</th>
            <th scope="col" className="jh-num">今日额度</th>
            <th scope="col" className="jh-num jh-col-hide-sm">产量</th>
            <th scope="col">最近一轮</th>
            <th scope="col"><span className="jh-sr-only">明细</span></th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => {
            const blocked =
              item.governance.blocked === null
                ? null
                : (props.reasonText[item.governance.blocked] ?? item.governance.blocked)
            const cooldown = cooldownActive(item.governance.cooldownUntil, now)
            const quotaFull = item.governance.todayRuns >= item.governance.dailyLimit
            const lastRun = item.governance.lastRun
            const open = props.expandedId === item.id
            const detailId = `jh-plat-detail-${item.id}`
            return (
              <Fragment key={item.id}>
                <tr>
                  <td className="jh-col-sticky">
                    <code>{item.id}</code>
                    {item.enabled ? null : <span className="jh-tag jh-tone-muted">未启用</span>}
                    <div className="jh-muted">{item.displayName}</div>
                  </td>
                  <td className={blocked === null ? 'jh-ok' : 'jh-warn'}>
                    <div>
                      {blocked === null ? (
                        '可以'
                      ) : (
                        <span className="jh-clip" title={blocked}>
                          {blocked}
                        </span>
                      )}
                    </div>
                    {cooldown === null ? null : (
                      <div className="jh-muted">冷却至 {formatClock(cooldown)}</div>
                    )}
                  </td>
                  <td>
                    {/* 「没检测过」与「确定未登录」是两件事：前者不该被念成后者 */}
                    <span
                      className={`jh-tag jh-tone-${
                        item.account.loggedIn
                          ? 'ok'
                          : item.account.lastCheckAt === null
                            ? 'muted'
                            : 'warn'
                      }`}
                    >
                      {item.account.loggedIn
                        ? '已登录'
                        : item.account.lastCheckAt === null
                          ? '未检测'
                          : '未登录'}
                    </span>
                    {/* 登录动作**留在这一行里**，不藏进展开的明细。
                        理由：「这个平台今天能不能跑」最常见的拦路虎就是没登录，
                        而修它的成本只有点一下；把它放到"先展开一行才能点"的后面，
                        等于给最高频的修复动作加了一道没有意义的门。
                        已登录时**不显示**按钮 —— 那时它没有任何事可做。
                        明细里也因此不放第二颗登录按钮（两个按钮做同一件事是重复）。 */}
                    {item.login.state === 'running' ? (
                      <span className="jh-warn"> 检测中…</span>
                    ) : item.account.loggedIn ? null : (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={props.running}
                        title={
                          props.running
                            ? '有另一个操作正在进行，请稍候。'
                            : '打开登录页，在弹出的浏览器窗口里完成登录。'
                        }
                        onClick={() => props.onLogin(item.id)}
                      >
                        登录
                      </button>
                    )}
                  </td>
                  <td className="jh-cell-status">
                    <StateTag state={item.health} kind="health" />
                    {item.failStreak > 0 ? (
                      <span className="jh-muted"> ×{item.failStreak}</span>
                    ) : null}
                  </td>
                  <td className="jh-col-hide-sm">
                    {/* 成熟度用**短档**：全称（"可用（真实夹具 + 冒烟验证）"）会把这一列
                        撑到必须横向滚动，而它只是十几个平台的横向比较。全文进 title。 */}
                    <span
                      className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}
                      title={
                        item.maturity.notes === undefined || item.maturity.notes === ''
                          ? MATURITY_LEVEL_LABEL[item.maturity.level]
                          : `${MATURITY_LEVEL_LABEL[item.maturity.level]}：${item.maturity.notes}`
                      }
                    >
                      {MATURITY_LEVEL_SHORT[item.maturity.level]}
                    </span>
                  </td>
                  <td className={`jh-num${quotaFull ? ' jh-warn' : ''}`}>
                    {item.governance.todayRuns}/{item.governance.dailyLimit}
                  </td>
                  <td className="jh-num jh-col-hide-sm">
                    {/* 产量写成"最近/常态"：单看一个数字看不出它是多是少 */}
                    {item.yield.baseline === null ? (
                      <span className="jh-muted">—</span>
                    ) : (
                      <span className={item.yield.level === 'dropped' ? 'jh-warn' : undefined}>
                        {item.yield.lastFound ?? '—'}/{item.yield.baseline}
                      </span>
                    )}
                  </td>
                  <td>
                    {lastRun === null ? (
                      <span className="jh-muted">没跑过</span>
                    ) : (
                      <>
                        <span className="jh-muted">
                          {formatClock(new Date(lastRun.startedAt))}
                        </span>{' '}
                        <StateTag state={lastRun.state} kind="run" />
                      </>
                    )}
                  </td>
                  <td className="jh-cell-actions">
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      aria-expanded={open}
                      {...(open ? { 'aria-controls': detailId } : {})}
                      title={open ? '收起这个平台的诊断' : '展开这个平台的诊断（能不能跑、被什么挡住、登录态、产量）'}
                      onClick={() => props.onToggle(item.id)}
                    >
                      {open ? '收起' : '明细'}
                    </button>
                  </td>
                </tr>

                {/* 展开行：诊断明细。colSpan 覆盖整行宽度 —— 明细属于**这一行**，
                    不是另起一段与表格并列的内容。 */}
                {open ? (
                  <tr className="jh-row-detail">
                    <td colSpan={9} id={detailId}>
                      <PlatformDetail
                        item={item}
                        reasonText={props.reasonText}
                        onGoSettings={props.onGoSettings}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 一个平台的**诊断明细**（主从结构里的"从"）。
 *
 * 分工很明确 —— 这里只回答"它**现在**为什么是这样"：能不能跑、被什么挡住、
 * 登录态、连续缺失、产量掉没掉、上一轮什么时候跑的。
 * 而"它**是什么**"（成熟度档位、能力、实现度、认证要求）是**改了代码才会变**的
 * 静态事实，放在「诊断与明细」分区的能力矩阵里横向比较。
 * 两类混在一张表里，用户就分不清"这个平台一直需要登录"与"它现在正好在冷却"。
 *
 * 所以原来那段"已实现：列表采集 · 详情页 ｜ 平台支持但尚未实现：打招呼"
 * 在这里**不再出现** —— 它是能力矩阵那几列的文字版，两处都写就是两处都会漂移。
 */
export function PlatformDetail(props: {
  item: PlatformOverviewDto
  reasonText: Record<string, string>
  onGoSettings: () => void
}) {
  const { item } = props
  const blocked =
    item.governance.blocked === null
      ? null
      : (props.reasonText[item.governance.blocked] ?? item.governance.blocked)
  const cooldown = cooldownActive(item.governance.cooldownUntil, new Date())
  const missing = item.fields.filter((field) => field.consecutiveMiss > 0)
  const lastRun = item.governance.lastRun
  /* 需要登录、但本机还没实现登录检测 → 未登录时可能静默抓到空结果。
     「没实现检测」与「不需要登录」是两件事，用户得知道是哪一种。 */
  const needsLoginCheck =
    !item.implementation.loginCheck && Object.values(item.authRequirement).includes('required')

  return (
    <div className="jh-plat-detail">
      <ul className="jh-kv">
        <li>
          <span>现在能跑吗</span>
          <span className={blocked === null ? 'jh-ok' : 'jh-warn'}>
            {blocked ?? '可以 —— 到点真的会跑'}
          </span>
        </li>
        <li>
          <span>今日额度</span>
          <span
            className={
              item.governance.todayRuns >= item.governance.dailyLimit ? 'jh-warn' : undefined
            }
          >
            {item.governance.todayRuns} / {item.governance.dailyLimit} 轮
          </span>
        </li>
        <li>
          <span>冷却</span>
          <span>{cooldown === null ? '没在冷却' : `至 ${formatClock(cooldown)}`}</span>
        </li>
        <li>
          <span>最近一轮</span>
          <span>
            {lastRun === null
              ? '没跑过'
              : `${new Date(lastRun.startedAt).toLocaleString()} · ${CRAWL_STATE_LABEL[lastRun.state]}`}
          </span>
        </li>
        <li>
          <span>上次成功</span>
          <span>{item.lastOkAt === null ? '从来没有' : new Date(item.lastOkAt).toLocaleString()}</span>
        </li>
      </ul>

      {item.governance.riskPaused ? (
        <div className="jh-warn">
          <Term term="风险暂停">已被暂停自动采集</Term>
          {item.governance.riskReason === null ? '' : `：${item.governance.riskReason}`}
          {' '}—— 系统不会自动恢复，确认环境正常后在方案卡上点「确认恢复」。
        </div>
      ) : null}

      {/* 登录在这里**不重复**：状态徽标与「登录」按钮都在上面那一行（矩阵的登录格），
          明细只补状态之外的说明（正在检测的消息、账号提示）。
          曾经把按钮放在这里，结果是"要登录得先展开一行" —— 那是个更差的设计：
          折叠把动作藏起来，而登录恰恰是这张表里最高频的一下。 */}
      {item.login.message === null ? null : <div className="jh-muted">{item.login.message}</div>}
      {item.account.hint === null ? null : <div className="jh-muted">{item.account.hint}</div>}

      {/* 只在有话说的时候重复健康态：全绿时矩阵那一格已经说过了 */}
      {item.healthReason === null && item.failStreak === 0 ? null : (
        <div className="jh-warn">
          健康：{HEALTH_STATE_LABEL[item.health]}
          {item.failStreak > 0 ? `（连续失败 ${item.failStreak} 次）` : ''}
          {item.healthReason === null ? '' : ` —— ${item.healthReason}`}
        </div>
      )}

      {/* 成熟度：注册表里有平台 ≠ 这个平台能用。用户勾它进方案**之前**
          就该看到"这个还只是实验性的、可能返回空"，而不是事后对着 0 条发懵。 */}
      {maturityNeedsWarning(item.maturity.level) ? (
        <div className="jh-warn">
          <Term term="成熟度">{MATURITY_LEVEL_LABEL[item.maturity.level]}</Term>
          {item.maturity.notes === undefined || item.maturity.notes === ''
            ? null
            : `：${item.maturity.notes}`}
        </div>
      ) : null}

      {needsLoginCheck ? (
        <div className="jh-warn">
          该平台需要登录，但本机还没有登录态检测 —— 未登录时可能静默抓到空结果。
        </div>
      ) : null}

      {/* 量级（批次 5）：逐字段健康可能全绿，坏的只是**条数**。
          这是从数据里查不出来的一类故障 —— 必须跟该平台自己的历史比。 */}
      {item.yield.baseline === null ? null : (
        <div className={item.yield.level === 'dropped' ? 'jh-warn' : 'jh-muted'}>
          <Term term="量级">产量</Term>：近 {item.yield.samples} 轮的常态约 {item.yield.baseline} 条，
          最近一轮 {item.yield.lastFound ?? '—'} 条
          {item.yield.level === 'dropped'
            ? ' —— 明显偏低。字段健康可能是全绿的，先查翻页与懒加载。'
            : ''}
        </div>
      )}

      {missing.length === 0 ? null : (
        <div className="jh-warn">
          <Term term="逐字段健康">连续缺失</Term>：
          {missing
            .map((field) => `${field.field}×${String(field.consecutiveMiss)}`)
            .join(' · ')}
        </div>
      )}

      <div className="jh-plat-detail-actions">
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-tiny"
          onClick={props.onGoSettings}
          title="看诊断信息（版本、数据路径、计数、工具注册结果）"
        >
          排查方案
        </button>
      </div>
    </div>
  )
}
