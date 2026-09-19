// 采集方案表单的本地形状与双向换算（纯逻辑，无 JSX）。
// 负责 PlanForm 类型、方案 ↔ 表单的转换、空白表单、以及表单 → 写入体的收敛。
// 关键词文本的拆分清洗、时间解析、覆盖项收敛都集中在这里，是这些规则的单一事实源。

import type { PlanDto, PlanSchedule } from '../../../shared/dto.js'
import type { PlanWriteInput } from '../../net/types.js'
import { clockValueOf, parseClockValue } from '../../../shared/time-format.js'

/** 表单的本地形状：条件在这里是字符串，提交前才收敛。 */
export interface PlanForm {
  name: string
  platforms: string[]
  /**
   * 多关键词的**原始文本**（每行一个）。用文本而不是 string[] 承载：
   * 用户打字过程中随时会出现空行/半截行，拆分与清洗放到 `writeOf` 统一做，
   * 输入框就不会在编辑中途"自己跳字"。
   */
  keywordsText: string
  /**
   * 每平台的覆盖项（批次 3）。表单里 `maxPages` 用**字符串**：
   * 空串表示"用方案级页数"，与"0 页"必须区分得开。
   */
  overrides: Record<string, { enabled: boolean; maxPages: string }>
  criteria: Record<string, string>
  /** `HH:MM`（原生时间选择器的值）。空串 = 用户清空了，**不是** 00:00。 */
  windowStart: string
  windowEnd: string
  weekdays: number[]
  scheduleEnabled: boolean
  score: boolean
  flag: boolean
  dedup: boolean
}

/** 方案 → 表单的覆盖项：**每个平台都补一条**（缺省即"启用 + 用方案级页数"）。 */
export function overridesOf(
  platforms: string[],
  source: Record<string, { enabled: boolean; maxPages: number | null }>,
): Record<string, { enabled: boolean; maxPages: string }> {
  const out: Record<string, { enabled: boolean; maxPages: string }> = {}
  for (const id of platforms) {
    const entry = source[id]
    out[id] = {
      enabled: entry?.enabled !== false,
      maxPages: entry?.maxPages === undefined || entry.maxPages === null ? '' : String(entry.maxPages),
    }
  }
  return out
}

/**
 * 表单 → 写入体的覆盖项。
 *
 * 空串或解析不出数字 → `null`（= 用方案级），**绝不发 0** ——
 * 0 会被下游当成"0 页"，那是"永远抓不到东西"。
 */
export function buildOverrides(
  overrides: Record<string, { enabled: boolean; maxPages: string }>,
): Record<string, { enabled: boolean; maxPages: number | null }> {
  const out: Record<string, { enabled: boolean; maxPages: number | null }> = {}
  for (const [id, entry] of Object.entries(overrides)) {
    const parsed = Number.parseInt(entry.maxPages, 10)
    out[id] = {
      enabled: entry.enabled,
      maxPages: entry.maxPages.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
    }
  }
  return out
}

/** 关键词文本 → 列表：trim、丢空行、去重（保首个出现序）。清洗只在这一处。 */
export function parseKeywordsText(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split('\n')) {
    const keyword = line.trim()
    if (keyword === '' || seen.has(keyword)) continue
    seen.add(keyword)
    out.push(keyword)
  }
  return out
}

export function formOf(plan: PlanDto): PlanForm {
  const schedule: PlanSchedule = plan.schedule
  return {
    name: plan.name,
    platforms: [...plan.platforms],
    // 多关键词方案直接回填列表；老方案把 criteria.keyword 翻成单行 ——
    // 用户看到的永远是"这个方案实际会跑的关键词"，不用关心新老形态。
    keywordsText:
      plan.keywords.length > 0
        ? plan.keywords.join('\n')
        : (plan.criteria['keyword'] ?? ''),
    overrides: overridesOf(plan.platforms, plan.platformOverrides),
    criteria: { ...plan.criteria },
    windowStart: clockValueOf(schedule.windowStartHour, schedule.windowStartMinute),
    windowEnd: clockValueOf(schedule.windowEndHour, schedule.windowEndMinute),
    weekdays: [...schedule.weekdays],
    scheduleEnabled: schedule.enabled,
    score: plan.postProcess.score,
    flag: plan.postProcess.flag,
    dedup: plan.postProcess.dedup,
  }
}

/**
 * 新建方案的空白表单。**平台默认一个不勾**（用户要求：不需要同时很多平台）——
 * 第 1 步的门槛会引导选至少一个，勾选时覆盖项自动补上默认条目。
 */
export function emptyForm(): PlanForm {
  return {
    name: '新方案',
    platforms: [],
    keywordsText: '',
    overrides: {},
    criteria: {},
    windowStart: '09:00',
    windowEnd: '11:00',
    weekdays: [1, 2, 3, 4, 5],
    scheduleEnabled: true,
    score: true,
    flag: true,
    dedup: true,
  }
}

/**
 * 表单 → 写入体。
 *
 * 时间在这里解析；解析不出来（用户清空了输入框）就退回默认时段，
 * 而不是把 `NaN` 发出去 —— `parseClockValue` 返回 null 的语义是"没填"，不是"00:00"。
 */
export function writeOf(form: PlanForm): PlanWriteInput {
  const start = parseClockValue(form.windowStart) ?? { hour: 9, minute: 0 }
  const end = parseClockValue(form.windowEnd) ?? { hour: 11, minute: 0 }
  const keywords = parseKeywordsText(form.keywordsText)
  const criteria = { ...form.criteria }
  // 单一事实源：keywords 非空时 criteria 里不再带 keyword（宿主也会再剔一次）。
  if (keywords.length > 0) delete criteria['keyword']
  return {
    name: form.name,
    platforms: form.platforms,
    keywords,
    platformOverrides: buildOverrides(form.overrides),
    criteria,
    schedule: {
      enabled: form.scheduleEnabled,
      windowStartHour: start.hour,
      windowStartMinute: start.minute,
      windowEndHour: end.hour,
      windowEndMinute: end.minute,
      weekdays: form.weekdays,
    },
    postProcess: { score: form.score, flag: form.flag, dedup: form.dedup },
  }
}
