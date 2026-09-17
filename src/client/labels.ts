import type { JobState } from '../shared/enums.js'
import type { JobDto } from '../shared/dto.js'

/**
 * 岗位处置态的中文标签。
 *
 * **只此一份**：列表（U1）与详情（U2）必须用同一套文案。
 * 早先两处各写了一份，结果详情里「已收藏」写成「收藏」，与动作按钮的文案撞在一起，
 * 既让人分不清「这是状态还是按钮」，也让端到端断言假失败。
 *
 * P5 起真正的定义搬到了 `src/shared/labels.ts` —— 模型工具的返回文本也要用它。
 * 这里保留转发，是为了让客户端的既有 import 不用改。
 */
export { JOB_STATE_LABEL } from '../shared/labels.js'

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
 * 放在这里而不是 `screens/jobs.tsx`：岗位库的左右两栏都要用它，
 * 而右侧详情又必须被岗位库 import —— 留在 jobs.tsx 会形成两个屏之间的循环 import。
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
