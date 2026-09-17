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
  AnalyticsFilter,
  AttributionDto,
  AttributionRowDto,
  FunnelDto,
  FunnelStepDto,
  ResumeCompareDto,
  ResumeCompareRowDto,
  SalaryBandDto,
  SalaryBaselineDto,
  SalaryBasis,
  SalaryBoxChartDto,
  SalaryBoxDto,
} from '../../shared/dto.js'
import {
  RESUME_COMPARE_CAVEAT,
  SALARY_BASIS_LABEL,
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
  /**
   * 漏斗。`filter` 里的时间窗对两个总体都成立；
   * **`resumeId` / `direction` 只作用于投递段** —— 打招呼那几张表没有 `resume_id` 这一列，
   * 对接触段套用它们会把数字静默清零（详见 `AnalyticsFilter` 的注释）。
   */
  funnel(filter?: AnalyticsFilter): FunnelDto
  attribution(filter?: AnalyticsFilter): AttributionDto
  salaryBand(options?: { city?: string; keyword?: string; from?: string; to?: string }): SalaryBandDto

  // ── 批次 F：看板遗留 ───────────────────────────────────────────────
  /** F1：薪资箱线图（P25–P75 高亮）+ 口径切换。 */
  salaryBox(options?: { city?: string; keyword?: string; basis?: SalaryBasis }): SalaryBoxChartDto
  /** F2：本地基准对比 —— 用**自己抓到的岗位库**当基准，不联网、不编行业数据。 */
  salaryBaseline(filter?: AnalyticsFilter): SalaryBaselineDto
  /** F3：简历版本 A/B 对比（每格带样本量，不做显著性）。 */
  resumeCompare(filter?: AnalyticsFilter): ResumeCompareDto
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

  /**
   * 时间窗：两端都可缺省（缺省即不设该端）。ISO 字符串直接比大小 —— 我们全库都用
   * `toISOString()` 落库，同格式的字符串比较与时间先后一致。
   */
  const inWindow = (at: string, filter: AnalyticsFilter): boolean => {
    if (filter.from !== undefined && at < filter.from) return false
    if (filter.to !== undefined && at > filter.to) return false
    return true
  }

  /** 投递记录是否命中「简历版本 / 方向」。这两个维度只有 application 有。 */
  const matchesResume = (record: ApplicationRecord, filter: AnalyticsFilter): boolean => {
    if (filter.resumeId !== undefined && record.resumeId !== filter.resumeId) return false
    if (filter.direction !== undefined && filter.direction !== '') {
      const resume = record.resumeId === null ? undefined : store.resume.get(record.resumeId)
      if (resume === undefined || resume.direction !== filter.direction) return false
    }
    return true
  }

  interface JobFacts {
    city: string
    title: string
    firstSeenAt: string
  }

  /**
   * 岗位索引：`city` / `keyword` 两个维度长在 `job` 表上，而流水线的三张表只有 `job_id`。
   * 一次查询建成 Map，而不是逐条查库 —— 几百条记录逐条查会明显变慢。
   * 只有真的要按这两个维度筛时才建（否则白跑一次全表查询）。
   */
  const jobIndex = (filter: AnalyticsFilter): Map<number, JobFacts> => {
    const index = new Map<number, JobFacts>()
    const wanted = (filter.city ?? '') !== '' || (filter.keyword ?? '') !== ''
    if (!wanted) return index
    for (const job of store.job.query({}, 2000, 0)) {
      index.set(job.id, { city: job.city, title: job.title, firstSeenAt: job.firstSeenAt })
    }
    return index
  }

  /** 岗位维度：城市做精确匹配（与岗位库的筛法一致），关键词做包含匹配。 */
  const matchesJob = (jobId: number | null, filter: AnalyticsFilter, index: Map<number, JobFacts>): boolean => {
    if ((filter.city ?? '') === '' && (filter.keyword ?? '') === '') return true
    const facts = jobId === null ? undefined : index.get(jobId)
    // 岗位被删了就证不出它命中城市/关键词 —— 宁可不算，也不要"猜它算"。
    if (facts === undefined) return false
    if ((filter.city ?? '') !== '' && facts.city !== filter.city) return false
    if ((filter.keyword ?? '') !== '' && !facts.title.toLowerCase().includes((filter.keyword ?? '').toLowerCase())) {
      return false
    }
    return true
  }

  return {
    funnel(filter: AnalyticsFilter = {}): FunnelDto {
      // 时间窗 + 岗位维度对**两个总体都成立**；简历版本/方向只挑投递段。
      const index = jobIndex(filter)
      const applications = store.pipeline
        .listApplications({ limit: 1000 })
        .filter(
          (record) =>
            inWindow(record.sentAt, filter) &&
            matchesJob(record.jobId, filter, index) &&
            matchesResume(record, filter),
        )
      const greetings = store.pipeline
        .listGreetings({ limit: 1000 })
        .filter(
          (item) =>
            item.jobId !== null && inWindow(item.sentAt, filter) && matchesJob(item.jobId, filter, index),
        )

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

    attribution(filter: AnalyticsFilter = {}): AttributionDto {
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
          // 归因的口径是"每一次投递"，所以时间窗与简历维度都直接作用在这一层
          if (!inWindow(record.sentAt, filter)) continue
          if (!matchesResume(record, filter)) continue
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

    /** F1：薪资箱线图。口径必须显式，否则同一个库能算出好几个"中位数"。 */
    salaryBox(options = {}): SalaryBoxChartDto {
      const basis: SalaryBasis = options.basis ?? 'monthly_min'
      const jobs = store.job.query(
        {
          ...(options.city === undefined || options.city === '' ? {} : { city: options.city }),
          ...(options.keyword === undefined || options.keyword === '' ? {} : { keyword: options.keyword }),
        },
        2000,
        0,
      )

      const box = salaryBoxOf(jobs, basis)
      const alternate = salaryBoxOf(jobs, basis === 'monthly_min' ? 'annualized' : 'monthly_min')
      return {
        box,
        alternate: alternate.count === 0 ? null : alternate,
        note:
          `口径：${SALARY_BASIS_LABEL[basis]}。P25–P75 是高亮的箱体，` +
          '两端的须是极值（不是离群点剔除后的结果）—— 本工具不做离群点剔除，' +
          '因为它会悄悄把真实的高薪岗删掉。',
      }
    },

    /**
     * F2：本地基准对比。
     *
     * **只用自己抓到的岗位库**：本项目没有服务器、没有行业数据源。
     * 编一个"行业 P75"画在界面上，用户会拿它当真 —— 那是这份文档明令禁止的事。
     */
    salaryBaseline(filter = {}): SalaryBaselineDto {
      const jobs = store.job.query(
        {
          ...(filter.city === undefined || filter.city === '' ? {} : { city: filter.city }),
          ...(filter.keyword === undefined || filter.keyword === '' ? {} : { keyword: filter.keyword }),
        },
        2000,
        0,
      )
      const all = salaryBoxOf(jobs, 'monthly_min')

      // "我投递过的"：按**岗位**去重 —— 同一个岗位投两次不该把分布往它那边拉两倍
      const appliedJobIds = new Set<number>()
      for (const application of store.pipeline.listApplications()) {
        if (application.jobId !== null) appliedJobIds.add(application.jobId)
      }
      const appliedJobs = jobs.filter((job) => appliedJobIds.has(job.id))
      const applied = salaryBoxOf(appliedJobs, 'monthly_min')

      const scope =
        [filter.city ?? '', filter.keyword ?? ''].filter((part) => part !== '').join(' / ') || '全部岗位'
      const enoughSample = applied.count >= MIN_SAMPLE
      const medianGap =
        all.median === null || applied.median === null ? null : applied.median - all.median

      return {
        scope,
        all,
        applied,
        medianGap,
        enoughSample,
        note:
          `基准来自**你自己抓到的岗位库**（${String(all.count)} 条有薪资下限的岗位），不是行业数据 —— ` +
          `本项目没有数据源，编一个基准会误导你。` +
          (enoughSample
            ? '投递样本够看分布了，但仍然只是你自己这一次求职的样本。'
            : `投递过且带薪资的只有 ${String(applied.count)} 条，**不足 ${String(MIN_SAMPLE)} 条**：` +
              '只看"全体分布"和两者的形状，不要从差额里读结论。'),
      }
    },

    /**
     * F3：简历版本 A/B 对比。
     *
     * **不做显著性检验**：现在投递样本个位数，任何 p 值都是装饰。
     * 这里给的是"每格带样本量的对比表"，样本够了才有资格谈显著。
     */
    resumeCompare(filter = {}): ResumeCompareDto {
      const applications = store.pipeline.listApplications().filter((application) => {
        if (filter.from !== undefined && application.sentAt < filter.from) return false
        if (filter.to !== undefined && application.sentAt > filter.to) return false
        if (filter.resumeId !== undefined && application.resumeId !== filter.resumeId) return false
        if (filter.city !== undefined || filter.keyword !== undefined) {
          const job = application.jobId === null ? undefined : store.job.detail(application.jobId)
          if (job === undefined) return false
          if (filter.city !== undefined && filter.city !== '' && job.city !== filter.city) return false
          if (
            filter.keyword !== undefined &&
            filter.keyword !== '' &&
            !job.title.includes(filter.keyword)
          ) {
            return false
          }
        }
        return true
      })

      const resumeNames = new Map<number, string>()
      for (const resume of store.resume.list()) resumeNames.set(resume.id, resume.name)

      // 阶段列按漏斗顺序（从"已投递"到"Offer"），不要按枚举里的顺序 ——
      // 那个顺序是给状态机用的，读起来不是一条时间线。
      const stageOrder: ApplicationStage[] = [
        'sent',
        'viewed',
        'interviewing',
        'interviewed',
        'offer',
        'rejected',
        'no_reply',
      ]
      const stages = stageOrder.map((stage) => ({ stage, label: APPLICATION_STAGE_LABEL[stage] }))

      const groups = new Map<number | null, typeof applications>()
      for (const application of applications) {
        const key = application.resumeId
        const bucket = groups.get(key) ?? []
        bucket.push(application)
        groups.set(key, bucket)
      }

      const rows: ResumeCompareRowDto[] = []
      for (const [resumeId, bucket] of groups) {
        const total = bucket.length
        rows.push({
          resumeId,
          label:
            resumeId === null
              ? '未记录简历版本'
              : (resumeNames.get(resumeId) ?? `简历 #${String(resumeId)}`),
          total,
          enoughSample: total >= MIN_SAMPLE,
          cells: stageOrder.map((stage) => {
            const count = bucket.filter((application) => application.stage === stage).length
            return {
              stage,
              label: APPLICATION_STAGE_LABEL[stage],
              count,
              rate: total === 0 ? null : count / total,
              // 薄格子必须在界面上被标出来：2 条样本里 1 条 = "50% 回复率"，那是噪音
              thin: count > 0 && count < MIN_SAMPLE,
            }
          }),
        })
      }
      rows.sort((a, b) => b.total - a.total)

      return {
        rows,
        stages,
        sampleSize: applications.length,
        enoughSample: applications.length >= MIN_SAMPLE,
        note:
          applications.length === 0
            ? '还没有投递记录 —— 这张表要有投递才有意义。'
            : applications.length < MIN_SAMPLE
              ? `${RESUME_COMPARE_CAVEAT} 现在只有 ${String(applications.length)} 条投递。`
              : `${RESUME_COMPARE_CAVEAT} 现在有 ${String(applications.length)} 条投递，够看趋势了。`,
      }
    },

    salaryBand(options = {}): SalaryBandDto {
      const jobs = store.job
        .query(
          {
            ...(options.city === undefined || options.city === '' ? {} : { city: options.city }),
            ...(options.keyword === undefined || options.keyword === '' ? {} : { keyword: options.keyword }),
          },
          2000,
          0,
        )
        // 时间窗在**岗位库**的时间轴上（`first_seen_at`）—— 与投递时间不是一回事，
        // 所以调用方必须把这一点写给用户看（看板上的那句标注）。
        .filter((job) => {
          if (options.from !== undefined && job.firstSeenAt < options.from) return false
          if (options.to !== undefined && job.firstSeenAt > options.to) return false
          return true
        })
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

/**
 * 把一组岗位换算成某个口径下的数字。
 *
 * 两种口径**都只用一个数**（不做 min/max 混算）：
 *   * `monthly_min` —— 直接用薪资下限，最保守，也最不容易被"上限虚标"带偏；
 *   * `annualized` —— 取区间中点（只有下限时就用下限）再乘月数（缺省 12），得到年薪。
 *
 * 为什么不用"上限"：上限是最容易被平台/HR 写高的那个数。
 */
function salaryValuesOf(jobs: ReadonlyArray<{ salaryMin: number | null; salaryMax: number | null; salaryMonths: number | null }>, basis: SalaryBasis): number[] {
  const values: number[] = []
  for (const job of jobs) {
    if (job.salaryMin === null || job.salaryMin <= 0) continue
    if (basis === 'monthly_min') {
      values.push(job.salaryMin)
      continue
    }
    const anchor = job.salaryMax === null ? job.salaryMin : Math.round((job.salaryMin + job.salaryMax) / 2)
    values.push(anchor * (job.salaryMonths ?? 12))
  }
  return values.sort((a, b) => a - b)
}

/** F1：一个口径下的箱体（含"箱里装了多少条"）。 */
export function salaryBoxOf(
  jobs: ReadonlyArray<{ salaryMin: number | null; salaryMax: number | null; salaryMonths: number | null }>,
  basis: SalaryBasis,
): SalaryBoxDto {
  const values = salaryValuesOf(jobs, basis)
  if (values.length === 0) {
    return {
      basis,
      basisLabel: SALARY_BASIS_LABEL[basis],
      count: 0,
      min: null,
      p25: null,
      median: null,
      p75: null,
      max: null,
      withinBox: 0,
    }
  }
  const p25 = quantile(values, 0.25)
  const p75 = quantile(values, 0.75)
  return {
    basis,
    basisLabel: SALARY_BASIS_LABEL[basis],
    count: values.length,
    min: values[0] ?? null,
    p25,
    median: quantile(values, 0.5),
    p75,
    max: values[values.length - 1] ?? null,
    // "箱体里有多少条"必须有据可查：一个装了 1 条样本的箱体画出来是骗人的
    withinBox: p25 === null || p75 === null ? 0 : values.filter((value) => value >= p25 && value <= p75).length,
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
