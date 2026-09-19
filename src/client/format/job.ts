import type { JobState } from '../../shared/enums.js'
import type { JobDto } from '../../shared/dto.js'

/**
 * 岗位的展示口径：动作文案、薪资明细、"多久以前"、标签分组。
 *
 * 纯函数与常量 —— 不认识 cordis、不发请求，所以可以直接被单测引用。
 *
 * 岗位**状态**文案（新 / 已读 / 已收藏…）不在这里：它的权威定义在 `shared/labels.js`，
 * 因为模型工具的返回文本也要用同一套词（客户端直接引那一个）。
 */

/** 详情抽屉里的动作按钮文案（是**动作**，不是状态，所以用祈使式）。 */
export const JOB_ACTION_LABEL: Record<JobState, string> = {
  new: '标为新',
  seen: '标为已读',
  saved: '收藏',
  ignored: '忽略',
  archived: '归档',
}

/**
 * 薪资展示：原文优先，归一化结果只作补充（§4.10.2：解析结果不覆盖原文）。
 *
 * 放在这里而不是 `screens/jobs/index.tsx`：岗位库的左右两栏都要用它，
 * 而右侧详情又必须被岗位库 import —— 留在岗位库屏里会形成两个屏之间的循环 import。
 */
export function salaryDetail(job: JobDto): string | null {
  if (job.salaryMin === null) return null
  const range =
    job.salaryMax === null || job.salaryMax === job.salaryMin
      ? String(job.salaryMin)
      : `${String(job.salaryMin)}-${String(job.salaryMax)}`
  return `${range} 元/月${job.salaryMonths === null ? '' : ` · ${String(job.salaryMonths)} 薪`}`
}

/**
 * 把 ISO 时间转成"多久以前"。
 *
 * 为什么要它：`lastSeenAt` 这类字段存的是 ISO 串，直接印出来用户得自己做减法，
 * 而 `2026-09-17T02:11:00.000Z` 这种串在回答"这岗还在招吗"时几乎没用。
 *
 * 超过 30 天就不再报相对时间：**"43 天前"不如"08-05"直观** ——
 * 跨度大了以后，人脑要的是日期本身。
 *
 * 解析不出来返回 `null`（调用方据此退回不显示），而不是硬凑一个"未知时间"。
 */
export function relativeTime(iso: string, now: Date = new Date()): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${String(minutes)} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)} 小时前`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${String(days)} 天前`
  return iso.slice(0, 10)
}

/**
 * 福利 / 待遇类措辞 —— **只用于展示分组**，把平台给的平铺标签分成
 * 「技能要求」与「公司福利」两组。
 *
 * 这是展示层的启发式，不是新的领域概念：平台返回的 `tags` 本来就是一串平铺文本，
 * 这里只按措辞归组。**判不出来的一律留在「技能要求」**——宁可少分一组，
 * 也不要把不确定的东西硬塞进"福利"里去误导人。
 */
const BENEFIT_KEYWORDS = [
  '五险', '一金', '公积金', '年终', '奖金', '提成', '补贴', '补助', '福利', '体检',
  '旅游', '团建', '年假', '双休', '弹性', '住宿', '包吃', '包住', '班车', '培训',
  '股票', '期权', '餐饮', '节日', '生日', '下午茶', '健身', '补充医疗', '意外险', '带薪',
]

/** 把标签拆成两组；顺序保持平台给的原始顺序。 */
export function splitJobTags(tags: string[]): { skills: string[]; benefits: string[] } {
  const skills: string[] = []
  const benefits: string[] = []
  for (const tag of tags) {
    if (BENEFIT_KEYWORDS.some((keyword) => tag.includes(keyword))) benefits.push(tag)
    else skills.push(tag)
  }
  return { skills, benefits }
}
