// 调度归属的唯一说法：把调度器状态收敛成「谁在调度 + 下次何时跑 + 补充说明」。
// 供采集页顶部 `.jh-story` 使用，避免同一句"定时已暂停"在页面里重复出现。

import type { SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'
import { formatClock, formatJitter, formatRelative } from '../../../shared/text/time-format.js'

/**
 * 调度归属的**唯一说法**。
 *
 * 修的是两个叠在一起的问题：
 *   1. 「调度：未启动」与「下次运行：还有 9 小时」并排 → 读起来自相矛盾；
 *   2. 顶部同时出现**三段**黄色提示都在说"定时已暂停"（归属叙述 + 一个 jh-warn 段 + 按钮文案），
 *      同一句话说三遍，用户反而不知道该看哪一条。
 *
 * 现在归属只由 `.jh-story` 说一句；"需要你处理的事"只由**一条** Alert 说。
 */
export interface ScheduleStory {
  owner: string
  tone: 'ok' | 'warn' | 'muted'
  nextRun: string | null
  detail: string | null
}

export function scheduleStoryOf(status: SchedulerStatusDto, now: Date): ScheduleStory {
  const nextRun =
    status.triggers.length === 0
      ? null
      : status.triggers
          .map((trigger) => {
            const at = new Date(trigger.nextRunAt)
            const jitter = formatJitter(trigger.jitterMs)
            return `${trigger.planName} ${formatClock(at)}（${formatRelative(at, now)}${jitter === null ? '' : ` · ${jitter}`}）`
          })
          .join(' / ')

  if (status.paused) {
    // 暂停时"下次运行"是**条件句**：不写"还有 9 小时"那种肯定口径。
    // 这里**只说归属**，不再写"定时已暂停" —— 那几个字由顶部那条 Alert 说
    // （它还带着「恢复定时」按钮，是这句话的动作落点）。改之前这一屏有三处
    // 同时说"定时已暂停"：工具条的圆点、那条 Alert、还有这里的 owner。
    return {
      owner: status.readOnly ? '由另一个窗口负责调度' : '本窗口负责调度',
      tone: 'warn',
      nextRun,
      detail: '「到点自动跑」已关掉；手动「立即采集」不受影响。',
    }
  }
  if (status.readOnly) {
    return {
      owner: '由另一个窗口负责调度',
      tone: 'warn',
      nextRun: nextRun === null ? null : `那个窗口会在 ${nextRun} 自动采集`,
      detail:
        '同一台电脑只允许一个窗口真正去采集（否则会抢同一份浏览器登录态）。本窗口可以看，但不能触发采集。',
    }
  }
  if (!status.scheduling) {
    return {
      owner: '本窗口负责调度，但还没启动',
      tone: 'warn',
      nextRun,
      detail: status.readOnlyReason ?? '数据层可能还没就绪，稍等几秒会自动开始。',
    }
  }
  return {
    owner: status.armed ? '本窗口负责调度，已排好下一次' : '本窗口负责调度',
    tone: 'ok',
    nextRun,
    detail: status.armed ? null : '当前没有启用定时的方案 —— 只会在你点「立即采集」时跑。',
  }
}
