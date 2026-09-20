// 平台总览矩阵与其诊断明细。
// PlatformMatrix 给出横向可比的事实（今天能跑 / 健康 / 成熟度 / 额度 / 产量 / 最近一轮 / 操作），
// PlatformDetail 只回答"它现在为什么是这样"（被什么挡住、登录态、连续缺失、产量掉没掉），
// 由「操作」列上的「明细」按钮**弹窗**呈现。
// cooldownActive 是这两个组件共用的冷却判定，只在模块内使用。

import { CRAWL_STATE_LABEL, HEALTH_STATE_LABEL } from '../../../shared/contract/enums/crawl.js'
import { MATURITY_LEVEL_LABEL, MATURITY_LEVEL_SHORT, MATURITY_LEVEL_TONE, maturityNeedsWarning } from '../../../shared/contract/enums/platform.js'
import { formatClock } from '../../../shared/text/time-format.js'
import type { PlatformOverviewDto } from '../../../shared/contract/dto/platform.js'
import { Term } from '../../ui/terms.js'
import { StateTag } from './state-tag.js'

function cooldownActive(until: string | null, now: Date): Date | null {
  if (until === null) return null
  const at = new Date(until)
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at
}

/** 矩阵的列。表头按这个顺序渲染。 */
const MATRIX_COLUMNS: ReadonlyArray<{ key: string; label: string; className?: string }> = [
  { key: 'platform', label: '平台', className: 'jh-col-sticky' },
  { key: 'runnable', label: '今天能跑' },
  { key: 'health', label: '健康', className: 'jh-cell-status' },
  { key: 'maturity', label: '成熟度', className: 'jh-col-hide-sm' },
  { key: 'quota', label: '今日额度', className: 'jh-num' },
  { key: 'yield', label: '产量', className: 'jh-num jh-col-hide-sm' },
  { key: 'lastRun', label: '最近一轮' },
  /* 「操作」列**必须在最后**：这一列放的是"对这一个平台做什么"，
     而做完之后要看的（能不能跑 / 健康 / 额度）都在它左边 —— 扫一行是
     从左到右"看事实"，最后落到"动手"。放在中间会把这条读序打断。 */
  { key: 'actions', label: '操作' },
]

/**
 * 平台总览**矩阵**——一行一个平台，横向回答"这些平台里今天哪几个真的能跑"。
 *
 * ## 为什么保留矩阵，而不是把明细竖着摊开
 *
 * 平台列表是**纵向**读的（一个平台一段，能写很多解释），而多平台真正要回答的问题
 * 恰恰是**横向**的 —— "这些平台里今天哪几个真的能跑"。纵向列表回答不了它：
 * 得逐段读完，还得自己记住上一段说了什么。
 * 但反过来，把"为什么"整段删掉也不行 —— 排障时那些信息就是全部。
 * 所以：矩阵负责横向可比的事实，**明细挂在本行的「明细」按钮上，点开是弹窗**。
 *
 * ## 为什么明细是弹窗，而不是行内展开
 *
 * 行内展开会把表格**撑高**：展开的那一行下面插进一整块诊断，之后每一行的位置都变了，
 * 想对照两个平台就得先收起一个 —— 而"对照"恰恰是这张表存在的理由。
 * 弹窗把这份"从"信息**临时**抬到最前面（与方案表单同一套做法），看完就还回去，
 * 表格本身的高度与行位置一动不动。
 *
 * ## 状态一律用标准徽标
 *
 * 一格一个 `.jh-tag`，四档颜色定死：绿=正常/已登录/可以，黄=降级/未登录/被挡住，
 * 红=失效，灰=未启用/未检测/没跑过。
 *
 * 「今天能跑」那一列仍然用点号表示长原因（全文进 title）：短标签是**第二份文案**，
 * 迟早会和 `SKIP_REASON_LABEL` 漂移，用户就在两处读到两种说法。
 */
export function PlatformMatrix(props: {
  items: PlatformOverviewDto[]
  reasonText: Record<string, string>
  /** 有别的操作正在进行（登录 / 采集 / 检测）——盘点类按钮此时都点不动。 */
  running: boolean
  onLogin: (platformId: string) => void
  /** 只检测登录态（打开平台页面判一次）。 */
  onCheck: (platformId: string, displayName: string) => void
  /** 打开某个平台的诊断明细弹窗。快照整个 item：弹窗不跟着后台刷新闪。 */
  onDetail: (item: PlatformOverviewDto) => void
}) {
  const now = new Date()
  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-matrix">
        <thead>
          <tr>
            {MATRIX_COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.label}
              </th>
            ))}
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
            const loginRunning = item.login.state === 'running'
            return (
              <tr key={item.id}>
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
                {/* 「操作」列：登录态徽标 + 三颗按钮。
                    徽标跟过来是因为它说的正是这几颗按钮**在什么状态下**点 ——
                    单独留在左边的话，"未登录"与"登录"会被一整张表隔开。
                    登录动作**留在这一行里**，不藏进弹窗：「这个平台今天能不能跑」最常见的
                    拦路虎就是没登录，而修它的成本只有点一下；把它放到"先点开明细才能点"
                    的后面，等于给最高频的修复动作加了一道没有意义的门。
                    已登录时**不显示**登录按钮 —— 那时它没有任何事可做。 */}
                <td className="jh-cell-actions">
                  <div className="jh-row-actions">
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
                    {loginRunning ? (
                      <span className="jh-warn">引导中…</span>
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
                    {/* 「检测」与「登录」的分工：检测**只回答**"现在登没登"，
                        不会把登录页留在那儿等你操作。所以它在已登录时也留着 ——
                        "我到底登没登"是随时会问的问题。 */}
                    {item.implementation.loginCheck ? (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline jh-btn-tiny"
                        disabled={props.running}
                        title={
                          props.running
                            ? '有另一个操作正在进行，请稍候。'
                            : '打开这个平台的页面检测一次登录态（不会替你登录），结果在弹窗里。'
                        }
                        onClick={() => props.onCheck(item.id, item.displayName)}
                      >
                        检测
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline jh-btn-tiny"
                      title="看这个平台的完整诊断（能不能跑、被什么挡住、登录态、产量）。"
                      onClick={() => props.onDetail(item)}
                    >
                      明细
                    </button>
                  </div>
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
 * 一个平台的**诊断明细**（弹窗内容）。
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

      {/* 登录在这里**不重复**：状态徽标与「登录 / 检测」按钮都在矩阵那一行的「操作」列，
          明细只补状态之外的说明（正在引导的消息、账号提示）。 */}
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
        {/* 文案改成「去设置看诊断」：原来说的是「排查方案」，而这一页的「方案」
            一律指**采集方案** —— 这个按钮其实是要跳去设置页。同一屏里同一个词
            指两件事，用户会以为它去编辑这个平台的采集方案。
            措辞与「运行失败」弹窗底栏那颗同名按钮保持一致。 */}
        <button
          type="button"
          className="jh-btn jh-btn-inline jh-btn-tiny"
          onClick={props.onGoSettings}
          title="看诊断信息（版本、数据路径、计数、工具注册结果）"
        >
          去设置看诊断
        </button>
      </div>
    </div>
  )
}
