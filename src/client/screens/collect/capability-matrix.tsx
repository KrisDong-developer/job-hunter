// 实验配置与能力矩阵（「诊断与明细」分区）。
// CapabilityMatrix 把"哪个平台支持打招呼而我们没写"这类横向可比的事实摊成一列列，
// CapabilityCell / DoneCell 是格子里的三态 / 两态徽标，LEVEL_SHORT 是高中低三档的中文短标签。

import {
  AUTH_REQUIREMENT_LABEL,
  MATURITY_LEVEL_SHORT,
  MATURITY_LEVEL_TONE,
} from '../../../shared/enums.js'
import type { PlatformOverviewDto } from '../../api.js'

/** 「高/中/低」三档的短标签（平台事实里没有中文名可取，这里只是把枚举翻成人话）。 */
const LEVEL_SHORT: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/**
 * 能力格：**三态**一个徽标 —— 已实现（绿）/ 平台支持但我们没实现（黄）/ 平台不支持（灰）。
 *
 * 三态而不是"有没有"：`51job` 的 `capabilities.supportsGreeting` 是 true
 * 而 `actions.sayHello` 尚未实现 —— 只写一个 ✗ 会让用户以为"这个平台坏了"，
 * 而事实是"我们还没写"。这正是 `AdapterImplementationDto` 那段注释要防的事。
 */
function CapabilityCell(props: { supported: boolean; implemented: boolean }) {
  if (props.implemented) return <span className="jh-tag jh-tone-ok">已实现</span>
  if (props.supported) return <span className="jh-tag jh-tone-warn">未实现</span>
  return <span className="jh-tag jh-tone-muted">不支持</span>
}

/** 两态能力格：平台侧没有对应的"支持"标记时用（列表采集 / 详情页 / 登录检测）。 */
function DoneCell(props: { done: boolean }) {
  return (
    <span className={`jh-tag jh-tone-${props.done ? 'ok' : 'muted'}`}>
      {props.done ? '已实现' : '未实现'}
    </span>
  )
}

/**
 * 实验配置与能力矩阵（「诊断与明细」分区）。
 *
 * 为什么是一张**矩阵**而不是原来那段一段段的散文：
 * 这些恰好是**横向可比**的东西 —— "哪个平台支持打招呼而我们没写"、
 * "哪几个平台还没做过登录检测"，扫一列就知道，而读十段散文要自己记住上面九段。
 * 散文版还有一个更实际的问题：十段每段五行，把页面拉得很长，
 * 而它和上面的「平台总览」说的是同一批平台。
 *
 * 成熟度那一格带 `notes`（已知缺口）—— 那是"实验配置"里最该被读到的一句话。
 */
export function CapabilityMatrix(props: { items: PlatformOverviewDto[] }) {
  return (
    <div className="jh-table-scroll">
      <table className="jh-table jh-table-caps">
        <thead>
          <tr>
            <th scope="col">平台</th>
            <th scope="col">成熟度</th>
            <th scope="col">上次验证</th>
            <th scope="col">列表采集</th>
            <th scope="col">详情页</th>
            <th scope="col">打招呼</th>
            <th scope="col">收件箱</th>
            <th scope="col">附件投递</th>
            <th scope="col">登录检测</th>
            <th scope="col">抓取需登录</th>
            <th scope="col">字段完整度</th>
            <th scope="col">反爬强度</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.id}>
              <td>
                <code>{item.id}</code>
                <div className="jh-muted">{item.displayName}</div>
              </td>
              <td>
                <span className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}>
                  {MATURITY_LEVEL_SHORT[item.maturity.level]}
                </span>
                {item.maturity.notes === undefined || item.maturity.notes === '' ? null : (
                  <div className="jh-muted">{item.maturity.notes}</div>
                )}
              </td>
              <td>{item.maturity.verifiedAt ?? '—'}</td>
              <td>
                <DoneCell done={item.implementation.crawl} />
              </td>
              <td>
                <DoneCell done={item.implementation.detail} />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsGreeting}
                  implemented={item.implementation.actions.sayHello}
                />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsInbox}
                  implemented={item.implementation.actions.readInbox}
                />
              </td>
              <td>
                <CapabilityCell
                  supported={item.capabilities.supportsAttachment}
                  implemented={item.implementation.actions.sendResume}
                />
              </td>
              <td>
                <DoneCell done={item.implementation.loginCheck} />
              </td>
              <td>{AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl]}</td>
              <td>{LEVEL_SHORT[item.capabilities.fieldCompleteness]}</td>
              {/* 反爬强是**对采集不利**的事实，所以高的一档染成警告色 */}
              <td className={item.capabilities.antiBot === 'high' ? 'jh-warn' : undefined}>
                {LEVEL_SHORT[item.capabilities.antiBot]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
