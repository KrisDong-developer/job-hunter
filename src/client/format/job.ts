import type { JobState } from '../../shared/contract/enums/job.js'
import {
  JOB_FRESHNESS_COLD_DAYS,
  JOB_FRESHNESS_FRESH_DAYS,
  JOB_FRESHNESS_LABEL,
  JOB_STATE_LABEL,
  type FreshnessLevel,
} from '../../shared/contract/enums/job.js'
import { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL } from '../../shared/contract/enums/pipeline.js'
import { formatLocalDateTime } from '../../shared/text/time-format.js'
import type { JobDto } from '../../shared/contract/dto/job.js'

/**
 * 岗位的展示口径：动作文案、薪资明细、"多久以前"、进程徽章、时效档位、标签分组。
 *
 * 纯函数与常量 —— 不认识 cordis、不发请求，所以可以直接被单测引用。
 *
 * 岗位**状态**文案（新 / 已读 / 已收藏…）不在这里：它的权威定义在
 * `shared/contract/enums/job.ts` 的 `JOB_STATE_LABEL`（与取值域同住），
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
 * 列表卡片上那枚**进程徽章**（第五轮，批次 C1）——一个位置表达"最强的那件事实"。
 *
 * ## 为什么只给一枚，而不是并列三枚
 *
 * 一条岗位同时有**三种**状态：岗位处置态（`job.state`：新/已读/已收藏…）、
 * 接触态（`contactStage`：已打招呼/HR 已读…）、投递阶段（`applicationStage`：已投递/面试中/Offer…）。
 * 三个都摆出来是一屏三枚胶囊，而它们回答的是同一个问题的不同深度：
 * "这条走到哪一步了"。所以按**信息强度**取一个：
 *
 *   投递阶段 > 接触态 > 岗位处置态
 *
 * 有投递记录时，"已投递"比"已读"重要；有接触记录时，"HR 已回复"比"新"重要。
 * 另外两个状态并没有丢：详情页有完整的动作条与记录，tooltip 里也写明了这枚徽章
 * 说的是哪一层（见 `job-row.tsx`）。
 *
 * ## `variant` 与 CSS 类名的关系
 *
 * 返回的是 `.jh-state-<variant>` 的后缀（`''` = 只用基类）。取值刻意与既有
 * 处置态的类名对齐（`new` / `saved` / `ignored` / `archived` 直接复用），
 * 只为"在流程里"新增三档：`progress`（已发出，在等）、`ok`（有回音）、`closed`（已结束）。
 */
export type JobBadgeVariant = '' | 'new' | 'saved' | 'ignored' | 'archived' | 'progress' | 'ok' | 'closed'

export interface JobProgressBadge {
  /** 徽章文字。取自 shared 的标签表 —— 界面与模型返回文本用的是同一套词。 */
  label: string
  variant: JobBadgeVariant
  /** 这枚徽章说的是哪一层（tooltip 要靠它讲清楚，否则"已投递"会被读成"已收藏"那种处置态）。 */
  source: 'application' | 'contact' | 'state'
}

export function jobProgressBadgeOf(
  /**
   * `readAt` **可选**：它只服务一处兜底（见下面的 `readAlready`）。
   * 声明成可选是有意的 —— 调用方（含测试）只需给三格就能问"现在该显示哪枚徽章"，
   * 不必为了一个新字段去改所有构造点。
   */
  job: Pick<JobDto, 'state' | 'contactStage' | 'applicationStage'> & { readAt?: string | null },
): JobProgressBadge {
  if (job.applicationStage !== null) {
    const stage = job.applicationStage
    return {
      source: 'application',
      label: APPLICATION_STAGE_LABEL[stage],
      variant:
        // 已拒绝 / 无回复 = 这条走到头了（终态），用最安静的一档
        stage === 'rejected' || stage === 'no_reply'
          ? 'closed'
          // 已投递 / 已查看 = 刚出去，还没人理
          : stage === 'sent' || stage === 'viewed'
            ? 'progress'
            : 'ok',
    }
  }
  if (job.contactStage !== 'none') {
    const stage = job.contactStage
    return {
      source: 'contact',
      label: CONTACT_STAGE_LABEL[stage],
      // "已打招呼 / 已送达 / HR 已读"都还只是"发出去了"；**回**才算有回音。
      variant: stage === 'replied' || stage === 'interview_scheduled' ? 'ok' : 'progress',
    }
  }
  /**
   * `state` 还是 `new`、但 `read_at` 已经有值 → 按「已读」显示。
   *
   * 正常路径上不会出现（`markRead` 会顺手把 `new` 推成 `seen`），但两列是两次写，
   * 中间但凡有一次失败就会留下这个组合。而"新"这个徽章最招人烦的失败方式就是
   * **你明明看过了它还说你没看** —— 所以判据取两者的**并集**：读过就是读过。
   */
  const readAlready = job.state === 'new' && (job.readAt ?? null) !== null
  return {
    source: 'state',
    label: readAlready ? JOB_STATE_LABEL.seen : JOB_STATE_LABEL[job.state],
    // 处置态的类名与取值同名（.jh-state-new / -saved / -ignored / -archived），
    // 只有 `seen` 没有专属配色（它是最中性的"什么都没有"）→ 落到基类。
    variant: job.state === 'seen' || readAlready ? '' : job.state,
  }
}

export interface JobFreshness {
  level: FreshnessLevel
  /** 档位的中文说法（如「近来活跃」）。 */
  label: string
  /** 距现在多少小时（向下取整，负数一律当 0 —— 见下）。 */
  hours: number
}

/**
 * 岗位**时效档位**（第五轮，批次 C2）：基准是 `lastSeenAt`（我们最近一次在平台上见到它）。
 *
 * 固定档 3 天 / 14 天，阈值常量在 `shared/contract/enums/job.ts`（那里也写了
 * 为什么**不**复用采集新鲜度那套随频率浮动的阈值）。
 *
 * * 解析不出来的时间返回 `null` —— 与 `relativeTime` 同一套纪律：不硬凑一个"未知档位"，
 *   调用方据此退回显示原始串、且不染色（"不知道"不该被画成"陈旧"）。
 * * 未来的时间（平台给的发布时间异常 / 机器时钟偏差）按 0 小时处理：
 *   报一个负数小时只会让人怀疑整个列表。
 */
export function jobFreshnessOf(iso: string, now: Date = new Date()): JobFreshness | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const hours = Math.max(0, (now.getTime() - at.getTime()) / 3_600_000)
  const level: FreshnessLevel =
    hours <= JOB_FRESHNESS_FRESH_DAYS * 24
      ? 'fresh'
      : hours <= JOB_FRESHNESS_COLD_DAYS * 24
        ? 'stale'
        : 'cold'
  return { level, label: JOB_FRESHNESS_LABEL[level], hours: Math.floor(hours) }
}

/**
 * 把选中的岗位拼成一张 **Markdown 表格**（第五轮，批次 D2 的「复制为表格」）。
 *
 * 用途是"带走"：贴进备忘录、发给朋友、或者丢给模型做比较。所以列只挑一眼能判断的字段，
 * 时间用**本地绝对时刻**（与 CSV 导出的写法一致 —— 都是要被带走的文本，"3 天前"离开上下文就没意义）。
 *
 * 单元格里的 `|` 换成 `/`、换行换成空格：Markdown 表格没有转义竖线的通用写法，
 * 一个竖线就能把整张表的结构弄坏。
 */
export function jobsToMarkdown(jobs: ReadonlyArray<JobDto>, now: Date = new Date()): string {
  const header = ['公司', '岗位', '薪资', '城市', '平台', '状态', '最近见到', '原链接']
  const cell = (value: string): string => value.replace(/\|/g, '/').replace(/\r?\n/g, ' ')
  const rows = jobs.map((job) =>
    [
      job.companyName ?? '',
      job.title,
      job.salaryRaw,
      job.district === '' ? job.city : `${job.city}·${job.district}`,
      job.platformName ?? job.platformId,
      JOB_STATE_LABEL[job.state],
      formatLocalDateTime(job.lastSeenAt, now),
      job.sourceUrl,
    ]
      .map((value) => cell(String(value)))
      .join(' | '),
  )
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row} |`),
  ].join('\n')
}

/**
 * ISO 串 → **本地**时间的可读写法见 `shared/text/time-format.ts` 的 `formatLocalDateTime`。
 *
 * 它放在 shared 而不是这里：同一个时刻在界面上（悬停提示 / 回执）与导出的 CSV 里
 * 必须是同一套写法，而 CSV 由宿主生成 —— 两边各写一份就会"文件里的时间与界面不一样"。
 * 本文件只留"岗位特有的展示口径"（薪资明细、相对时间、标签分组）。
 */

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
