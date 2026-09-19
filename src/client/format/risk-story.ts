import type { SettingsDto } from '../../shared/contract/dto/settings.js'
import { parseWindow } from '../../shared/text/time-format.js'

/**
 * 「当前风控态势」一句话 —— 与采集页 `.jh-story` 同一个定位（同一件事只有一个说法）。
 *
 * 只陈述**配置事实**，不预测"现在能不能发"：窗口是否命中、今天是不是休息日，
 * 那是闸门的判断，客户端再算一遍就是第二份实现。这里只把散在五六处的开关收成一句，
 * 回答"我这一屏到底调成了什么样"。
 */
export function riskStory(current: SettingsDto): { text: string; tone: string } {
  const { levels, dailyLimits, cooldownMinutes, requireApproval, auditEnabled } = current.guard
  const windowRaw = current.guard.sendWindow.trim()
  const allowed: string[] = []
  if (levels.l3Greeting) allowed.push('打招呼')
  if (levels.l4Application) allowed.push('投递')
  if (levels.l4Reply) allowed.push('回复')

  const parts: string[] = []
  if (allowed.length === 0) {
    parts.push('三个发送分层全关着 —— 这个工具一步都不会替你发出去')
  } else {
    parts.push(`允许发送：${allowed.join(' / ')}`)
    parts.push(
      `每天每平台 打招呼 ${String(dailyLimits.greeting)} · 投递 ${String(dailyLimits.application)} · 回复 ${String(dailyLimits.reply)}`,
    )
    if (windowRaw === '') parts.push('不限发送时段')
    else if (parseWindow(windowRaw) === null) parts.push(`发送时段配置无法解析：「${windowRaw}」—— 闸门会拒绝所有发送`)
    else parts.push(`发送时段 ${windowRaw}（本地时间）`)
    parts.push(
      current.guard.dayOffProbability > 0
        ? `随机休息日 ${String(Math.round(current.guard.dayOffProbability * 100))}%`
        : '没有随机休息日',
    )
    parts.push(cooldownMinutes > 0 ? `同公司冷却 ${String(cooldownMinutes)} 分钟` : '没有冷却期')
  }
  parts.push(requireApproval ? '高危动作需你确认' : '高危动作不再二次确认')
  parts.push(auditEnabled ? '审计已开' : '审计已关（额度计数会失真）')
  if (!current.ai.enabled) parts.push('模型已关（全部走规则 / 模板）')

  // 需要用户马上注意的三件事：发不出去、不可逆动作无人把关、出事了没有留痕。
  const needsAttention =
    allowed.length === 0 ||
    !requireApproval ||
    !auditEnabled ||
    (windowRaw !== '' && parseWindow(windowRaw) === null)
  return { text: `${parts.join('；')}。`, tone: needsAttention ? 'jh-story-warn' : 'jh-story-ok' }
}
