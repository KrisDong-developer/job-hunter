/**
 * 看板与归因（§4.3 `analytics` / §13 U8 / E7）。
 *
 * ## 一条贯穿始终的原则：**样本量小的时候不要给百分比**
 *
 * 投了 3 个岗位，"内推渠道回复率 100%" 和 "平台渠道回复率 0%" 都是噪声。
 * 这种数字看起来很有说服力，会让用户据此做错决策 —— 比不给数字更糟。
 * 所以每个结果都带 `sampleSize`，低于阈值时用 `note` 明确说"样本太少，别当真"。
 *
 * ## 归因看的是**投递**而不是岗位
 *
 * "哪版简历/哪个渠道转化好"必须以**每一次投递**为单位：
 * 同一个岗位可能投了两次、用了不同简历；按岗位聚合会把它们糊在一起。
 */
import type {
  AttributionDto,
  AttributionRowDto,
  FunnelDto,
  FunnelStepDto,
  SalaryBandDto,
} from '../../shared/dto.js'
import {
  APPLICATION_CHANNEL_LABEL,
  APPLICATION_STAGE_LABEL,
  CONTACT_STAGE_LABEL,
} from '../../shared/enums.js'
import type { ApplicationStage, ContactStage } from '../../shared/enums.js'
import type { Store } from '../store/store.js'
import type { ApplicationRecord } from '../store/repo/pipeline.js'
import { systemClock, type Clock } from '../util/time.js'

/** 低于这个样本量就不下结论。 */
export const MIN_SAMPLE = 5

export interface AnalyticsService {
  funnel(): FunnelDto
  attribution(): AttributionDto
  salaryBand(options?: { city?: string; keyword?: string }): SalaryBandDto
}

export interface AnalyticsDeps {
  store: Store
  clock?: Clock
}

export function createAnalyticsService(deps: AnalyticsDeps): AnalyticsService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  /**
   * 这次投递**有没有走到过**某一层。
   *
   * 必须查 `stage_event`，不能只看当前 `stage`：
   * 一个"面试完被拒"的投递当前状态是 `rejected`，只看当前状态的话
   * 它就从"已面试"这一层凭空消失了 —— 漏斗会**少报**，而少报比多报更难发现
   * （数字看起来完全正常）。这也正是当初把每次状态变更都记事件的原因。
   *
   * 另外漏斗是**累计**口径：拿到 Offer 的人一定面试过，所以 `interviewed`
   * 要把 `offer` 也算进去。否则会出现"1 个 Offer，但只有 0 个人面试过"这种自相矛盾的分层。
   */
  const everReached = (record: ApplicationRecord, stages: readonly ApplicationStage[]): boolean => {
    if (stages.includes(record.stage)) return true
    return store.pipeline
      .listStageEvents('application', record.id, 200)
      .some((event) => stages.includes(event.toStage as ApplicationStage))
  }

  return {
    funnel(): FunnelDto {
      const applications = store.pipeline.listApplications({ limit: 1000 })
      const greetings = store.pipeline.listGreetings({ limit: 1000 }).filter((item) => item.jobId !== null)

      const greeted = greetings.length
      const delivered = greetings.filter((item) => item.stage !== 'greeted' && item.stage !== 'none').length
      const read = greetings.filter((item) =>
        ['read', 'replied', 'interview_scheduled'].includes(item.stage),
      ).length
      const replied = greetings.filter((item) =>
        ['replied', 'interview_scheduled'].includes(item.stage),
      ).length
      const applied = applications.length
      const interviewed = applications.filter((record) =>
        everReached(record, ['interviewed', 'offer']),
      ).length
      const offered = applications.filter((record) => everReached(record, ['offer'])).length

      /**
       * 漏斗的层，从"我做了动作"到"结果"。
       *
       * 第一层用**打招呼**而不是投递：在求职里"接触"是比"投递"更靠前的一步，
       * 而且很多人只打招呼不投递 —— 从投递开始画会看不出这一步的流失。
       *
       * ⚠️ 但这张图里其实有**两个总体**：接触（打招呼/送达/已读/回复）与投递（投递/面试/Offer）。
       * "投递数 ÷ 回复数"会算出 >100% 的转化率 —— 一个能算出 120% 的转化率会让人
       * 不再信任整张图。所以总体切换的那一层 `rate` 必须是 `null`，并且标出 `population`。
       */
      const raw: Array<{ key: string; label: string; count: number; population: 'contact' | 'application' }> = [
        { key: 'greeted', label: '打招呼', count: greeted, population: 'contact' },
        { key: 'delivered', label: '已送达', count: delivered, population: 'contact' },
        { key: 'read', label: 'HR 已读', count: read, population: 'contact' },
        { key: 'replied', label: 'HR 已回复', count: replied, population: 'contact' },
        { key: 'applied', label: '已投递', count: applied, population: 'application' },
        { key: 'interviewed', label: '已面试', count: interviewed, population: 'application' },
        { key: 'offered', label: 'Offer', count: offered, population: 'application' },
      ]

      const steps: FunnelStepDto[] = raw.map((step, index) => {
        const previous = index === 0 ? null : (raw[index - 1] ?? null)
        // 总体不同就不算转化率 —— 跨总体比较没有意义，而且会算出 >1 的值
        const comparable = previous !== null && previous.population === step.population
        return {
          ...step,
          rate:
            !comparable || previous === null || previous.count === 0 ? null : step.count / previous.count,
        }
      })

      const sampleSize = Math.max(greeted, applied)
      return {
        steps,
        sampleSize,
        note:
          sampleSize === 0
            ? '还没有任何接触记录 —— 先去岗位库打招呼或投递，这里才有东西可看。'
            : sampleSize < MIN_SAMPLE
              ? `样本只有 ${String(sampleSize)} 条，转化率还不具备参考意义，别据此改策略。`
              : `基于 ${String(sampleSize)} 次接触/投递统计。` +
                '注意「已投递」这一层之后换了总体（接触 → 投递），跨总体的转化率没有意义，所以留空。',
      }
    },

    attribution(): AttributionDto {
      const applications = store.pipeline.listApplications({ limit: 1000 })
      const greetings = store.pipeline.listGreetings({ limit: 1000 })

      /** 该投递对应的岗位有没有被联系过/回复过 —— 归因要跨表看。 */
      const contactOf = (jobId: number | null): ContactStage => {
        if (jobId === null) return 'none'
        return store.pipeline.latestGreeting(jobId)?.stage ?? 'none'
      }

      const summarize = (
        keyOf: (record: ApplicationRecord) => string,
        labelOf: (key: string) => string,
      ): AttributionRowDto[] => {
        const buckets = new Map<string, ApplicationRecord[]>()
        for (const record of applications) {
          const key = keyOf(record)
          const list = buckets.get(key) ?? []
          list.push(record)
          buckets.set(key, list)
        }
        return [...buckets.entries()]
          .map(([key, list]) => {
            const total = list.length
            const replied = list.filter((record) =>
              ['replied', 'interview_scheduled'].includes(contactOf(record.jobId)),
            ).length
            const interviewed = list.filter((record) =>
              everReached(record, ['interviewed', 'offer']),
            ).length
            const offered = list.filter((record) => everReached(record, ['offer'])).length
            return {
              key,
              label: labelOf(key),
              total,
              replied,
              interviewed,
              offered,
              replyRate: total === 0 ? 0 : replied / total,
              interviewRate: total === 0 ? 0 : interviewed / total,
              offerRate: total === 0 ? 0 : offered / total,
            }
          })
          .sort((a, b) => b.total - a.total || b.replyRate - a.replyRate)
      }

      // 按渠道
      const byChannel = summarize(
        (record) => record.channel,
        (key) => APPLICATION_CHANNEL_LABEL[key as keyof typeof APPLICATION_CHANNEL_LABEL] ?? key,
      )

      // 按简历版本 —— 这是 §3.3「已读不回 → 改简历」的直接依据
      //
      // 标签里**不再写 rev**：`application` 表只记了 `resume_id`，没有记"投递当时是哪一版"，
      // 所以拿简历的**当前** rev 去标注历史投递是在说假话（简历改过之后就错了）。
      // 带上 `#id` 则保证同名简历之间可区分 —— 实测库里就有三份同名的"P7 验收简历"，
      // 标签只写「名字（rev 1）」时两行看起来完全一样，像重复记录。
      // 真要显示"当时那一版"，得给 application 加一列（数据模型改动，另议）。
      const byResume = summarize(
        (record) => (record.resumeId === null ? 'none' : String(record.resumeId)),
        (key) => {
          if (key === 'none') return '（未记录简历）'
          const resume = store.resume.get(Number(key))
          return resume === undefined ? `简历 #${key}（已删除）` : `${resume.name} #${key}`
        },
      )

      const total = applications.length + greetings.length
      return {
        byChannel,
        byResume,
        sampleSize: applications.length,
        note:
          applications.length === 0
            ? '还没有投递记录 —— 投递时系统会记下"用了哪版简历"，之后这里才能比较。'
            : applications.length < MIN_SAMPLE
              ? `投递样本只有 ${String(applications.length)} 条（对话一共 ${String(total)} 条动作），` +
                '下面的比率仅供参考，不要据此下结论。'
              : `基于 ${String(applications.length)} 次投递统计；每条都记录了当时用的简历版本与渠道。`,
      }
    },

    salaryBand(options = {}): SalaryBandDto {
      const jobs = store.job.query(
        {
          ...(options.city === undefined || options.city === '' ? {} : { city: options.city }),
          ...(options.keyword === undefined || options.keyword === '' ? {} : { keyword: options.keyword }),
        },
        2000,
        0,
      )
      // 只用**薪资下限**做分位：上下限混在一起算出来的中位数没有意义
      const values = jobs
        .map((job) => job.salaryMin)
        .filter((value): value is number => typeof value === 'number' && value > 0)
        .sort((a, b) => a - b)

      const scope = [options.city ?? '', options.keyword ?? ''].filter((part) => part !== '').join(' / ') || '全部'
      if (values.length === 0) {
        return { scope, count: 0, min: null, p25: null, median: null, p75: null, max: null }
      }
      return {
        scope,
        count: values.length,
        min: values[0] ?? null,
        p25: quantile(values, 0.25),
        median: quantile(values, 0.5),
        p75: quantile(values, 0.75),
        max: values[values.length - 1] ?? null,
      }
    },
  }
}

/** 线性插值分位。样本很小时它等于"附近的值"，这是诚实的近似。 */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower]
  const high = sorted[upper]
  if (low === undefined || high === undefined) return null
  if (lower === upper) return low
  return Math.round(low + (high - low) * (position - lower))
}

export { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL }
export type { ApplicationStage }
