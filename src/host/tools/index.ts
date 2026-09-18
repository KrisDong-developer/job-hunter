/**
 * 模型工具注册（§22）。
 *
 * 三条硬规则贯穿这个文件：
 *
 * 1. **单一实现**（§22.1）：每个工具都调用 `HostRuntime` 上与 HTTP 路由**同一批**方法，
 *    不新写一套读写。所以"界面上能做的事"与"对话里能做的事"必然产生同样的数据变更。
 * 2. **结构化 + 可读摘要**（§22.1）：`output.schema` 是给宿主的，`output.render` 是给模型的。
 *    `render` 的输出**就是模型的上下文**，所以它必须短、必须克制（§22.5 不塞整段 JD）。
 * 3. **危险动作过闸门**（§22.4）：`greeting_send` / `job_settings` 都走 `runtime` 上的 guard 方法，
 *    工具层**没有**任何绕过闸门的能力 —— 它连危险实现的引用都拿不到。
 *
 * ⚠️ **与 §22.2 清单的一处命名偏差（实测逼出来的）**：
 * 文档里的 `job_list` 与宿主自带的 `job_list`（列出后台任务，见 `@deepseek-ai/dsh-tool-jobs`）
 * **同名**。`tools.register` 对重名会抛错，于是插件版压根没注册上，
 * 而客户端的 toolview（按工具名 keyed）反而**接管**了宿主那个工具的渲染 ——
 * 结果是"列出后台任务"被画成了一张岗位卡片。实测就是这样被发现的。
 * 所以这里叫 `job_query`：语义与文档一致，只是换了个不撞车的名字。
 * 同时：注册失败**不再被静默吞掉**，会记进 `ToolRegistrationReport` 并经 `/health` 暴露。
 */
import { PLUGIN_ID } from '../../shared/constants.js'
// 窗口说明、条件标签、状态词在 host 与 client 之间**共用同一份实现** ——
// 对话里说的和面板上写的必须一致（否则用户在两个地方看到两套说法，只会信其中一套）。
import { formatCriteriaLine } from '../../shared/criteria-label.js'
import { humanizeFailure } from '../../shared/error-text.js'
import { CRAWL_STATE_LABEL, HEALTH_STATE_LABEL, runReasonLabel } from '../../shared/enums.js'
import { formatLocalMoment, formatWeekdays } from '../../shared/time-format.js'
import { describeWindow } from '../scheduler/schedule.js'
import {
  APPLICATION_CHANNELS,
  APPLICATION_CHANNEL_LABEL,
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABEL,
  ASSESSMENT_KINDS,
  ASSESSMENT_KIND_LABEL,
  ASSESSMENT_STATES,
  ASSESSMENT_STATE_LABEL,
  CAMPUS_BATCHES,
  CAMPUS_BATCH_LABEL,
  CAMPUS_STAGES,
  CAMPUS_STAGE_LABEL,
  COVER_LETTER_LANGUAGES,
  INTERVIEW_KINDS,
  INTERVIEW_KIND_LABEL,
  INTERVIEW_STATES,
  INTERVIEW_STATE_LABEL,
  JOB_STATES,
  JOB_FLAG_LABEL,
  REMOTE_KINDS,
  REMOTE_KIND_LABEL,
  RESUME_FORMATS,
  RESUME_LANGUAGES,
  RESUME_TEMPLATES,
  TRIPARTITE_STATES,
  TRIPARTITE_STATE_LABEL,
  VISA_STANCES,
  VISA_STANCE_LABEL,
  type ApplicationChannel,
  type ApplicationStage,
  type AssessmentKind,
  type AssessmentState,
  type CampusBatch,
  type CampusStage,
  type CoverLetterLanguage,
  type InterviewKind,
  type InterviewState,
  type JobState,
  type RemoteKind,
  type TripartiteState,
  type VisaStance,
} from '../../shared/enums.js'
import { JOB_STATE_LABEL, TONE_LABEL, RESUME_LANGUAGE_LABEL } from '../../shared/labels.js'
import { normalizeResumeContent } from '../../shared/resume.js'
import {
  DETAIL_KEYS,
  formatDetailLine,
  formatJobDetailTitle,
  formatJobListLine,
  summarizeJd,
} from '../../shared/tool-format.js'
import type {
  ContentBlock,
  Disposer,
  JsonSchemaNode,
  PluginContext,
  ToolDefinition,
  ToolRunContext,
  ToolsService,
} from '../../shared/dsh.js'
import { serviceOf } from '../../shared/dsh.js'
import type { JobDto } from '../../shared/dto.js'
import type { JobQuery } from '../store/repo/jobs.js'
import type { DedupSweepResult } from '../domain/dedupe-sweep.js'
import type { HostRuntime } from '../runtime.js'
import type { SettingsSnapshot } from '../settings.js'
import { DomainError, messageOf } from '../util/errors.js'
import { toolExec } from './exec-context.js'

/** 工具单次返回的岗位条数上限：模型上下文不该被一张长列表挤满（§22.5）。 */
export const TOOL_LIST_MAX = 20
/** 批量类工具（模型发起）的岗位数上限，与 §22.4「≤5」一致。 */
export const TOOL_BATCH_MAX = 5

const schema = (
  properties: Record<string, JsonSchemaNode>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const str = (description: string): JsonSchemaNode => ({ type: 'string', description })
const num = (description: string): JsonSchemaNode => ({ type: 'number', description })
const int = (description: string): JsonSchemaNode => ({ type: 'integer', description })

const ARRAY_OF_OBJECT: JsonSchemaNode = { type: 'array', items: { type: 'object' } }

interface ToolSpec<A, V> {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: JsonSchemaNode
  /** 返回**模型看到的文本**（一行行，人可读，客户端 toolview 也解析它）。 */
  render(args: A, value: V): string
  timeoutMs?: number
  run(args: A, ctx: ToolRunContext, runtime: HostRuntime): Promise<V>
}

/** 定义一个工具：把「怎么执行」与「怎么渲染」放在一起，避免两处走散。 */
function defineTool<A, V>(runtime: HostRuntime, spec: ToolSpec<A, V>): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    ...(spec.timeoutMs === undefined ? {} : { timeoutMs: spec.timeoutMs }),
    output: {
      schema: spec.outputSchema,
      render: (args, value): ContentBlock[] => [
        { type: 'text', text: spec.render(args as A, value as V) },
      ],
    },
    async execute(rawArgs, exec): Promise<unknown> {
      const args = (rawArgs ?? {}) as A
      // 审批需要 agent/toolName/callId —— 在这里放进异步上下文，
      // 领域的其它层完全不知道"模型"这件事存在。
      return await toolExec.run(
        {
          toolName: spec.name,
          agent: exec.agent,
          callId: exec.callId,
          signal: exec.signal,
        },
        async () => await spec.run(args, exec, runtime),
      )
    },
  }
}

/** 数据层没就绪时给出可读错误，而不是让模型收到一个空对象。 */
function requireData(runtime: HostRuntime) {
  const store = runtime.store()
  const jobs = runtime.jobs()
  if (store === undefined || jobs === undefined) {
    const failure = runtime.failure()
    throw new DomainError('DATA_UNAVAILABLE', failure?.message ?? '数据层尚未就绪', {
      hint: failure?.hint ?? '稍等几秒再试；若一直如此，用 /health 看具体原因。',
    })
  }
  return { store, jobs }
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function jobLines(jobs: JobDto[]): string[] {
  return jobs.map((job) =>
    formatJobListLine({
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      city: job.city,
      district: job.district,
      salaryRaw: job.salaryRaw,
      matchScore: job.matchScore,
      flagTypes: job.flagTypes,
    }),
  )
}

/** 岗位谓词：把工具参数翻成 `JobQuery`（与 HTTP 的 `buildJobQuery` 同一套字段）。 */
function queryOf(args: Record<string, unknown>): JobQuery {
  const state = asString(args['state'])
  if (state !== undefined && !JOB_STATES.includes(state as JobState)) {
    throw new DomainError('INVALID_INPUT', `state 取值不合法：${state}`, {
      hint: `合法取值：${JOB_STATES.join(' / ')}`,
    })
  }
  const city = asString(args['city'])
  const keyword = asString(args['keyword'])
  const minSalary = typeof args['minSalary'] === 'number' ? args['minSalary'] : undefined
  // 「只看新增」：与 HTTP 层同一条规则 —— 非法时刻**显式报错**，不当没传
  // （否则模型会拿到一份"以为筛了、其实没筛"的列表去做判断）。
  const firstSeenSince = asString(args['firstSeenSince'])
  if (firstSeenSince !== undefined && Number.isNaN(new Date(firstSeenSince).getTime())) {
    throw new DomainError('INVALID_INPUT', `firstSeenSince 不是合法时刻：${firstSeenSince}`, {
      hint: '传 ISO 时刻，如 2026-09-17T00:00:00.000Z。',
    })
  }
  return {
    ...(state === undefined ? {} : { state: state as JobState }),
    ...(city === undefined ? {} : { city }),
    ...(keyword === undefined ? {} : { keyword }),
    ...(minSalary === undefined ? {} : { minSalaryAtLeast: minSalary }),
    ...(firstSeenSince === undefined ? {} : { firstSeenSince }),
    orderBy: 'last_seen_at',
    descending: true,
  }
}

// ─────────────────────────────────────────────────────────────────────
// 工具定义
// ─────────────────────────────────────────────────────────────────────

function buildTools(runtime: HostRuntime): ToolDefinition[] {
  /** 把 runtime 绑进来，调用点就不必每次重复写。 */
  const tool = <A, V>(spec: ToolSpec<A, V>): ToolDefinition => defineTool<A, V>(runtime, spec)

  return [
    tool<Record<string, unknown>, { summary: string; jobs: JobDto[] }>({
      name: 'job_search',
      description:
        '按关键词/城市搜索岗位并入库（会真的打开浏览器抓取一次），然后返回库里匹配的岗位。' +
        '想只看已入库的岗位用 job_list，不要用这个。',
      // 抓一次要几十秒：给足超时，否则模型会看到"超时"而实际抓取仍在跑
      timeoutMs: 5 * 60 * 1000,
      parameters: schema({
        keyword: str('搜索关键词，如 "Java"、"前端"'),
        city: str('城市，如 "深圳"'),
        platformId: str('平台 id；不填用第一个已注册平台'),
        planId: int('用已有搜索方案抓取（填了它就不用给 keyword/city）'),
        limit: int(`返回条数上限（默认 10，最多 ${String(TOOL_LIST_MAX)}）`),
      }),
      outputSchema: {
        type: 'object',
        properties: { summary: { type: 'string' }, jobs: ARRAY_OF_OBJECT },
      },
      render: (_args, value) => value.summary,
      async run(args) {
        const { jobs } = requireData(runtime)
        const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined
        const limit = toInt(args['limit'], 10, 1, TOOL_LIST_MAX)
        const keyword = asString(args['keyword'])
        const city = asString(args['city'])

        let headline: string
        if (planId !== undefined) {
          const summary = await runtime.runPlan(planId, 'manual')
          headline =
            `按方案 #${String(planId)} 抓取完成：发现 ${String(summary.run.found)} 条，` +
            `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}`
        } else {
          const platformId = asString(args['platformId']) ?? runtime.registry().list()[0]?.id
          if (platformId === undefined) {
            throw new DomainError('NOT_FOUND', '没有已注册的平台，无法搜索', {
              hint: '先在界面里确认平台适配器已加载。',
            })
          }
          const summary = await runtime.crawl({
            platformId,
            criteria: {
              ...(keyword === undefined ? {} : { keyword }),
              ...(city === undefined ? {} : { city }),
            },
          })
          const what = [keyword, city].filter((part) => part !== undefined).join(' / ') || '（无关键词）'
          headline =
            `搜索「${what}」完成：发现 ${String(summary.run.found)} 条，` +
            `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}` +
            (summary.quarantined > 0 ? `，${String(summary.quarantined)} 条字段不合格被隔离` : '')
        }

        const filters = queryOf({
          ...(keyword === undefined ? {} : { keyword }),
          ...(city === undefined ? {} : { city }),
        })
        const items = jobs.query(filters, limit, 0)
        const total = jobs.countMatching(filters)
        const summary = [
          headline,
          `库里匹配 ${String(total)} 条，显示前 ${String(items.length)} 条：`,
          ...jobLines(items),
        ].join('\n')
        return { summary, jobs: items }
      },
    }),

    tool<Record<string, unknown>, { total: number; jobs: JobDto[] }>({
      // 注意：**不能**叫 job_list —— 宿主自带一个同名的「列出后台任务」工具（见文件头说明）
      name: 'job_query',
      description: '查询已经入库的岗位（筛选/排序/分页）。不抓取，只读库。',
      parameters: schema({
        state: { type: 'string', enum: [...JOB_STATES], description: '处置态筛选' },
        city: str('按城市筛选'),
        keyword: str('标题关键词（模糊匹配，只作粗筛）'),
        minSalary: num('月薪下限（K）不低于该值'),
        firstSeenSince: str(
          '只看新增：只返回首次见到时间 ≥ 该 ISO 时刻的岗位（如 2026-09-17T00:00:00.000Z）。' +
            '「存量/增量」的分界就是它 —— 再抓一轮不会让老岗位变成新增。',
        ),
        page: int('页码，从 1 开始'),
        pageSize: int(`每页条数（默认 10，最多 ${String(TOOL_LIST_MAX)}）`),
      }),
      outputSchema: {
        type: 'object',
        properties: { total: { type: 'integer' }, jobs: ARRAY_OF_OBJECT },
      },
      render: (_args, value) =>
        [
          `库里共 ${String(value.total)} 条，返回 ${String(value.jobs.length)} 条：`,
          ...jobLines(value.jobs),
        ].join('\n'),
      async run(args) {
        const { jobs } = requireData(runtime)
        const filters = queryOf(args)
        const page = toInt(args['page'], 1, 1, 10_000)
        const pageSize = toInt(args['pageSize'], 10, 1, TOOL_LIST_MAX)
        const items = jobs.query(filters, pageSize, (page - 1) * pageSize)
        return { total: jobs.countMatching(filters), jobs: items }
      },
    }),

    tool<{ jobId: number }, { text: string }>({
      name: 'job_detail',
      description: '一个岗位的详情：薪资/城市/要求、匹配分与逐条理由、风险标注、JD 摘要与来源链接。',
      parameters: schema({ jobId: int('岗位 id（列表里的 #数字）') }, ['jobId']),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        const { jobs, store } = requireData(runtime)
        const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const detail = jobs.detailFull(id)
        const job = detail.job

        const lines = [formatJobDetailTitle(job.id, job.title, job.companyName)]
        const place = job.district === '' ? job.city : `${job.city} ${job.district}`
        lines.push(formatDetailLine(DETAIL_KEYS.company, job.companyName ?? '未知公司'))
        lines.push(formatDetailLine(DETAIL_KEYS.place, place === '' ? '未知' : place))
        lines.push(formatDetailLine(DETAIL_KEYS.salary, job.salaryRaw === '' ? '面议' : job.salaryRaw))
        lines.push(
          formatDetailLine(
            DETAIL_KEYS.requirement,
            [job.expReq, job.eduReq].filter((part) => part !== '').join(' · ') || '未写明',
          ),
        )
        if (job.matchScore === null) {
          lines.push(formatDetailLine(DETAIL_KEYS.match, '还没算（可以用 job_match_explain 算）'))
        } else {
          const reasons = detail.matchReasons
            .slice(0, 4)
            .map((reason) => `${reason.text}(${String(reason.weight)})`)
            .join('；')
          lines.push(
            formatDetailLine(
              DETAIL_KEYS.match,
              `${String(Math.round(job.matchScore))}（规则粗筛分，不是完整评估）${reasons === '' ? '' : `｜${reasons}`}`,
            ),
          )
        }
        if (detail.flags.length > 0) {
          lines.push(
            formatDetailLine(
              DETAIL_KEYS.flags,
              detail.flags
                .map((flag) => `${JOB_FLAG_LABEL[flag.flagType]}（${flag.evidence[0] ?? '见详情'}）`)
                .join('；'),
            ),
          )
        }
        lines.push(formatDetailLine(DETAIL_KEYS.jd, summarizeJd(store.job.jdText(job.id))))
        lines.push(formatDetailLine(DETAIL_KEYS.url, job.sourceUrl))
        lines.push(`当前处置态：${JOB_STATE_LABEL[job.state]}`)

        return { text: lines.join('\n') }
      },
    }),

    tool<{ jobId: number; state: JobState }, { job: JobDto }>({
      name: 'job_mark',
      description: '给岗位打处置态：收藏 / 忽略 / 归档 / 标为新 / 标为已读。低危，不需要审批。',
      parameters: schema(
        {
          jobId: int('岗位 id'),
          state: { type: 'string', enum: [...JOB_STATES], description: '目标处置态' },
        },
        ['jobId', 'state'],
      ),
      outputSchema: { type: 'object', properties: { job: { type: 'object' } } },
      render: (_args, value) =>
        `已把 #${String(value.job.id)}「${value.job.title}」标记为「${JOB_STATE_LABEL[value.job.state]}」。`,
      async run(args) {
        const { jobs } = requireData(runtime)
        const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        const state = args.state
        if (!JOB_STATES.includes(state)) {
          throw new DomainError('INVALID_INPUT', `state 取值不合法：${String(state)}`, {
            hint: `合法取值：${JOB_STATES.join(' / ')}`,
          })
        }
        const job = jobs.mark(id, state)
        runtime.events().publish('job.updated', { id: job.id, state: job.state })
        return { job }
      },
    }),

    tool<Record<string, never>, DedupSweepResult & { text: string }>({
      name: 'job_dedup',
      description:
        '把全库跨平台重复的岗位**复核一遍**：同一个岗位在多个平台各抓一条时，合并成一组。' +
        '低危、可逆（分组随时可拆），不需要审批。' +
        '用在"刚打开去重开关"或"刚改过抓取范围"之后补做一次 —— 否则要干等下一轮抓取，' +
        '而那一轮可能一条新岗位都没有。',
      parameters: schema({}),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run() {
        requireData(runtime)
        const result = runtime.sweepDedup()
        const text = [
          `全库复核完成：看过 ${String(result.scanned)} 条` +
            (result.skippedGrouped > 0 ? `（跳过已在分组里的 ${String(result.skippedGrouped)} 条）` : '') +
            '。',
          `合并 ${String(result.merged)} 条，新建 ${String(result.newGroups)} 组，现在共 ${String(result.groups)} 组。`,
          result.candidates > 0
            ? `另有 ${String(result.candidates)} 条**疑似**跨平台重复（标题相似度不够，没自动合并）—— 需要人看一眼。`
            : '没有疑似待确认的。',
          '合并是可逆的：在「采集」页的跨平台去重卡片里可以随时拆开。',
        ].join('\n')
        return { ...result, text }
      },
    }),

    tool<Record<string, unknown>, { text: string; planId?: number }>({
      name: 'job_plan_manage',
      description:
        '采集方案（抓什么 + 抓多深 + 什么时候抓 + 抓完做什么）的查看、创建、修改、启停、删除、立即跑一次。' +
        '写入校验与界面完全同一套（SR-45）—— 工具塞非法条件与界面报同样的错。',
      parameters: schema(
        {
          action: {
            type: 'string',
            enum: ['list', 'create', 'update', 'enable', 'disable', 'remove', 'run', 'dimensions', 'pause', 'resume'],
            description:
              '要做的操作。dimensions = 看当前平台支持哪些筛选维度；pause/resume = 全局一键暂停定时（只停定时，手动仍可用）',
          },
          planId: int('方案 id（update/enable/disable/remove/run 需要）'),
          name: str('方案名（create 需要）'),
          keyword: str('搜索关键词（单数；多关键词用 keywords）'),
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description:
              '多关键词（最多 10 个，逐个采集：第 1 个抓完再抓第 2 个，各自一条运行记录）。' +
              '给了它就忽略 keyword/criteria.keyword',
          },
          city: str('城市'),
          platforms: {
            type: 'array',
            items: { type: 'string' },
            description: '平台集合；不填 = 全部已注册平台。未注册的平台会被明确拒绝（SR-39）',
          },
          sort: str('排序方式（取值域见 dimensions）'),
          postedWithinDays: int('只要多少天内发布的岗位'),
          maxPages: int('抓取页数上限（受适配器声明的上限约束）'),
          platformOverrides: {
            type: 'object',
            description:
              '每平台的覆盖项（批次 3）。形状：`{ "<平台id>": { "enabled": true|false, "maxPages": 数字|null } }`。' +
              '`enabled:false` = 这个方案里暂时不抓它（不必把它从 platforms 里删掉）；' +
              '`maxPages:null` = 用上面方案级的页数。键必须是 platforms 里有的平台，否则会被明确拒绝。',
          },
          weekdays: {
            type: 'array',
            items: { type: 'integer' },
            description: '0=周日…6=周六；空数组 = 每天。这是**偏好时段**的工作日掩码',
          },
          windowStartHour: int('偏好时段起点（本地时，0-23）。**不提供单点时刻**（SR-32）'),
          windowEndHour: int('偏好时段终点（本地时，0-23）。终点 ≤ 起点表示跨零点'),
          score: { type: 'boolean', description: '抓完是否打分（SR-44，默认开）' },
          flag: { type: 'boolean', description: '抓完是否做风险/黑话标注（SR-44，默认开）' },
          dedup: { type: 'boolean', description: '抓完是否做跨平台去重（SR-44，默认开）' },
          enabled: { type: 'boolean', description: '是否启用' },
        },
        ['action'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      timeoutMs: 5 * 60 * 1000,
      async run(args) {
        requireData(runtime)
        const plans = runtime.plans()
        const scheduler = runtime.schedulerStatus()
        const action = asString(args['action'])
        const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined
        const name = asString(args['name'])

        /**
         * 一行一个方案的摘要。
         *
         * 窗口用「工作日 09:00–11:00」而不是「09:30」：**配置里本来就没有单点时刻**（SR-32），
         * 显示成单点会让用户以为他配的是个固定时刻，然后奇怪为什么每天时间不一样。
         */
        const describe = (): string =>
          [
            '现有方案：',
            ...plans.list().map((plan) => {
              const status = scheduler.planStatus.find((item) => item.planId === plan.id)
              const window = plan.schedule.enabled
                ? `${describeWindow(plan.schedule, formatWeekdays(plan.schedule.weekdays))}`
                : '不定时'
              const freshness = status?.freshness.level ?? 'cold'
              const hold = status?.riskPaused === true ? '｜**风控暂停**' : ''
              const why =
                status?.lastDecision?.decision === 'skipped' && status.lastDecision.message !== null
                  ? `｜最近一次跳过：${status.lastDecision.message}`
                  : ''
              // 条件行：多关键词方案把关键词列出来（criteria 里已经没有它了），
              // 其余条件照旧翻人话；两者都没有才写"不限"。
              const condition =
                plan.keywords.length > 0
                  ? [
                      `关键词：${plan.keywords.join('、')}`,
                      formatCriteriaLine(plan.criteria) ?? '',
                    ]
                      .filter((part) => part !== '')
                      .join('｜')
                  : (formatCriteriaLine(plan.criteria) ?? '条件：不限')
              return (
                `#${String(plan.id)} ${plan.name}｜${plan.platforms.join(',')}｜` +
                `${condition}｜${plan.enabled ? '已启用' : '已停用'}｜` +
                `${window}｜新鲜度 ${freshness}${hold}${why}`
              )
            }),
          ].join('\n')

        /** 把工具参数翻译成方案写入输入（缺的键不传，交给领域层沿用现值）。 */
        const configPatch = (): Record<string, unknown> => {
          const patch: Record<string, unknown> = {}
          if (name !== undefined) patch['name'] = name

          // 多关键词：数组透传，收敛与上限校验在领域层（与界面同一套，SR-45）。
          if (Array.isArray(args['keywords'])) {
            patch['keywords'] = args['keywords'].filter(
              (item): item is string => typeof item === 'string',
            )
          }

          const criteria: Record<string, string> = {}
          const keyword = asString(args['keyword'])
          const city = asString(args['city'])
          const sort = asString(args['sort'])
          if (keyword !== undefined) criteria['keyword'] = keyword
          if (city !== undefined) criteria['city'] = city
          if (sort !== undefined) criteria['sort'] = sort
          const posted = args['postedWithinDays']
          if (typeof posted === 'number') criteria['postedWithinDays'] = String(posted)
          const maxPages = args['maxPages']
          if (typeof maxPages === 'number') criteria['maxPages'] = String(maxPages)

          const platforms = Array.isArray(args['platforms'])
            ? args['platforms'].filter((item): item is string => typeof item === 'string')
            : undefined
          if (platforms !== undefined) patch['platforms'] = platforms

          // 每平台覆盖项（批次 3）：原样透传，收敛与校验都在 `planService.validate` 里
          // —— 三条入口共用同一份校验（SR-45），这里不做第二套判断。
          const rawOverrides = args['platformOverrides']
          if (
            typeof rawOverrides === 'object' &&
            rawOverrides !== null &&
            !Array.isArray(rawOverrides)
          ) {
            patch['platformOverrides'] = rawOverrides
          }

          const schedule: Record<string, unknown> = {}
          if (Array.isArray(args['weekdays'])) {
            schedule['weekdays'] = args['weekdays'].filter((item): item is number => typeof item === 'number')
          }
          if (typeof args['windowStartHour'] === 'number') schedule['windowStartHour'] = args['windowStartHour']
          if (typeof args['windowEndHour'] === 'number') schedule['windowEndHour'] = args['windowEndHour']
          if (Object.keys(schedule).length > 0) patch['schedule'] = schedule

          const postProcess: Record<string, unknown> = {}
          for (const key of ['score', 'flag', 'dedup']) {
            if (typeof args[key] === 'boolean') postProcess[key] = args[key]
          }
          if (Object.keys(postProcess).length > 0) patch['postProcess'] = postProcess

          if (typeof args['enabled'] === 'boolean') patch['enabled'] = args['enabled']

          // 读取现有条件后合并：`criteria` 在 DTO 里是"整体替换"，
          // 所以只改一个键时必须把现有条件带上，否则会静默丢掉其它键。
          if (Object.keys(criteria).length > 0) {
            const current = planId === undefined ? undefined : plans.get(planId)
            patch['criteria'] = { ...(current?.criteria ?? {}), ...criteria }
          }
          return patch
        }

        switch (action) {
          case 'list':
            return { text: describe() }

          case 'dimensions': {
            const platforms = Array.isArray(args['platforms'])
              ? (args['platforms'] as unknown[]).filter((item): item is string => typeof item === 'string')
              : runtime.registry().list().map((adapter) => adapter.id)
            const dimensions = plans.dimensions(platforms)
            return {
              text: [
                `平台 ${platforms.join(',')} 支持的筛选维度：`,
                ...dimensions.map((dimension) => {
                  if (!dimension.supported) {
                    return `· ${dimension.label}：**不支持** —— ${dimension.disabledReason ?? ''}`
                  }
                  const values =
                    dimension.values.length === 0
                      ? dimension.max === null
                        ? '自由文本'
                        : `正整数，上限 ${String(dimension.max)}`
                      : dimension.values.map((item) => `${item.value}=${item.label}`).join(' / ')
                  return `· ${dimension.label}：${values} —— ${dimension.hint}`
                }),
              ].join('\n'),
            }
          }

          case 'create': {
            if (name === undefined) throw new DomainError('INVALID_INPUT', 'create 需要 name')
            const patch = configPatch()
            // 校验先跑一次，好把"和哪个方案重复"如实回报（SR-43：只提示，不合并）
            const checked = plans.validate({
              ...patch,
              name,
              platforms:
                (patch['platforms'] as string[] | undefined) ??
                runtime.registry().list().map((adapter) => adapter.id),
            } as never)
            const plan = plans.create({
              ...patch,
              name,
              platforms:
                (patch['platforms'] as string[] | undefined) ??
                runtime.registry().list().map((adapter) => adapter.id),
            } as never)
            const duplicateNote =
              checked.duplicates.length === 0
                ? ''
                : `\n注意：与 ${checked.duplicates.map((item) => `#${String(item.planId)}「${item.name}」`).join('、')} 条件重复（${checked.duplicates[0]?.reason ?? ''}）。只提示，不会自动合并（SR-43）。`
            // 非致命提示（多平台：城市不支持 / 平台未校准 / 深度被截断）也要转述给模型 ——
            // 它对应的都是"平台安静地返回 0 条"，不转述的话用户永远不知道
            const noticeNote =
              checked.notices.length === 0
                ? ''
                : `\n提示（只提示，方案仍已保存）：\n${checked.notices.map((item) => `- ${item}`).join('\n')}`
            return {
              text: `已创建方案 #${String(plan.id)}「${plan.name}」。${duplicateNote}${noticeNote}\n${describe()}`,
              planId: plan.id,
            }
          }

          case 'update':
          case 'enable':
          case 'disable': {
            if (planId === undefined) throw new DomainError('INVALID_INPUT', `${String(action)} 需要 planId`)
            const patch = configPatch()
            if (action === 'enable') patch['enabled'] = true
            if (action === 'disable') patch['enabled'] = false
            const plan = plans.update(planId, patch as never)
            return { text: `已更新方案 #${String(plan.id)}。\n${describe()}` }
          }

          case 'remove': {
            if (planId === undefined) throw new DomainError('INVALID_INPUT', 'remove 需要 planId')
            if (!plans.remove(planId)) throw new DomainError('NOT_FOUND', `方案不存在：${String(planId)}`)
            return { text: `已删除方案 #${String(planId)}。` }
          }

          case 'run': {
            if (planId === undefined) throw new DomainError('INVALID_INPUT', 'run 需要 planId')
            const summary = await runtime.runPlan(planId, 'manual')
            return {
              text:
                `方案 #${String(planId)} 已跑完：发现 ${String(summary.run.found)} 条，` +
                `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}。`,
            }
          }

          case 'pause':
            runtime.setSchedulePaused(true, asString(args['name']) ?? '模型工具发起的一键暂停')
            return { text: '已暂停**定时**抓取。手动「立即采集」仍然可用（SR-30）。' }

          case 'resume':
            runtime.setSchedulePaused(false)
            return { text: '已恢复定时抓取。' }

          default:
            throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`, {
              hint: '合法取值：list / create / update / enable / disable / remove / run / dimensions / pause / resume',
            })
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'crawl_run',
      description:
        '手动触发一次抓取（会真的打开浏览器访问招聘站）。模型发起时这是中危操作，需要用户审批。',
      timeoutMs: 5 * 60 * 1000,
      parameters: schema({
        platformId: str('平台 id；不填用第一个已注册平台'),
        keyword: str('搜索关键词'),
        city: str('城市'),
        planId: int('改用某个方案的条件抓取'),
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const platformId = asString(args['platformId'])
        const keyword = asString(args['keyword'])
        const city = asString(args['city'])
        const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined

        // 中危 + 模型发起 → 必然走审批。审批文案要说清"要访问哪个站、抓什么"。
        return await runtime.guard().run(
          {
            action: 'crawl.run',
            actor: 'model',
            danger: 'mid',
            target: { ...(platformId === undefined ? {} : { platformId }) },
            payload: {
              platformId: platformId ?? '第一个已注册平台',
              keyword: keyword ?? '（沿用方案条件）',
              city: city ?? '',
              planId: planId ?? null,
              note: '这次动作会真实打开招聘网站页面。',
            },
          },
          async () => {
            const summary =
              planId === undefined
                ? await runtime.crawl({
                    platformId: platformId ?? runtime.registry().list()[0]?.id ?? '',
                    criteria: {
                      ...(keyword === undefined ? {} : { keyword }),
                      ...(city === undefined ? {} : { city }),
                    },
                  })
                : await runtime.runPlan(planId, 'manual')
            return {
              text:
                `抓取完成（${summary.run.platformId}）：发现 ${String(summary.run.found)} 条，` +
                `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}` +
                (summary.quarantined > 0 ? `，隔离 ${String(summary.quarantined)} 条` : '') +
                '。',
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'crawl_status',
      description: '抓取/适配器/登录态健康查询：在跑什么、哪个平台不健康、调度下次什么时候跑。',
      parameters: schema({}),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run() {
        const status = runtime.crawlStatus()
        const scheduler = runtime.schedulerStatus()
        const platforms = runtime.platforms()
        const now = new Date()
        // 调度归属只说一句话：/「未运行」+「下次还有 9 小时」并排会让模型转述出互相矛盾的话
        const owner = scheduler.paused
          ? '定时已暂停（手动仍可用）'
          : scheduler.readOnly
            ? `由另一个实例负责（本实例只读：${scheduler.readOnlyReason ?? '原因未知'}）`
            : scheduler.scheduling
              ? '本实例负责'
              : '未启动（数据层可能还没就绪）'
        const skipNotes = scheduler.planStatus
          .filter((item) => item.lastDecision?.decision === 'skipped')
          .map(
            (item) =>
              `· ${item.name}：${item.lastDecision?.message ?? item.lastDecision?.reason ?? '原因未知'}`,
          )
        const lines = [
          `抓取：${status.busy ? '正在跑' : '空闲'}`,
          `调度：${owner}` +
            `${scheduler.nextRunAt === null ? '' : `，下次 ${formatLocalMoment(scheduler.nextRunAt, now) ?? ''}`}` +
            `${scheduler.planStatus.length === 0 ? '' : `｜新鲜度 ${scheduler.planStatus.map((item) => `${item.name} ${item.freshness.level}`).join('、')}`}`,
          `租约：${scheduler.lease.held ? `本实例持有（进程 ${String(scheduler.lease.pid ?? '?')}）` : `另一个实例持有（进程 ${String(scheduler.lease.pid ?? '?')}）`}`,
          ...(skipNotes.length === 0 ? [] : ['上次到点没跑：', ...skipNotes]),
          '平台：',
          ...platforms.map(
            (platform) =>
              `· ${platform.displayName}｜健康 ${HEALTH_STATE_LABEL[platform.health]}｜` +
              `${platform.account.loggedIn ? '已登录' : '未登录'}｜` +
              `${platform.account.hiddenFromCurrentEmployer === true ? '已设隐身' : '隐身未确认'}` +
              `${platform.healthReason === null ? '' : `｜${platform.healthReason}`}`,
          ),
          ...(status.recentRuns.length === 0
            ? ['最近抓取：还没有记录']
            : [
                '最近抓取：',
                ...status.recentRuns.slice(0, 5).map((run) => {
                  const reason = runReasonLabel(run.reason)
                  // 失败原因转成人话：模型转述一串堆栈对用户毫无帮助
                  const failure = humanizeFailure(run.errorCode, run.errorMsg)
                  return (
                    `· ${formatLocalMoment(run.startedAt, now) ?? run.startedAt}` +
                    `${reason === null ? '' : `（${reason}）`} ${run.platformId} ` +
                    `${CRAWL_STATE_LABEL[run.state]}｜发现 ${String(run.found)} ` +
                    `新增 ${String(run.inserted)} 更新 ${String(run.updated)}` +
                    `${failure === null ? '' : `｜${failure.short}`}`
                  )
                }),
              ]),
        ]
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'job_match_explain',
      description:
        '批量算 L1 规则粗筛分并给出逐条理由（薪资/城市/经验/学历/关键词命中/风险标注）。' +
        '这是**规则打分**，不是模型评估；关掉模型也能用。',
      parameters: schema({
        jobIds: {
          type: 'array',
          items: { type: 'integer' },
          description: `要算的岗位 id；不填则取最近 ${String(TOOL_BATCH_MAX)} 条`,
        },
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        const { jobs } = requireData(runtime)
        const intel = runtime.intel()
        const raw = Array.isArray(args['jobIds']) ? args['jobIds'] : []
        if (raw.length > TOOL_BATCH_MAX) {
          throw new DomainError(
            'GUARD_DENIED',
            `一次最多算 ${String(TOOL_BATCH_MAX)} 个岗位（§22.4 批量上限）`,
            {
              hint: `请分批，每批不超过 ${String(TOOL_BATCH_MAX)} 个。`,
              detail: { reason: 'batch' },
            },
          )
        }
        const ids: number[] =
          raw.length > 0
            ? raw.map((value) => toInt(value, 0, 1, Number.MAX_SAFE_INTEGER)).filter((id) => id > 0)
            : jobs.latest(TOOL_BATCH_MAX).map((job) => job.id)

        const now = new Date().toISOString()
        const lines: string[] = [`算分范围：${ids.map((id) => `#${String(id)}`).join('、')}`]
        for (const id of ids) {
          intel.evaluateJob(id, now)
          const detail = jobs.detailFull(id)
          const score = detail.job.matchScore === null ? '—' : String(Math.round(detail.job.matchScore))
          lines.push(`#${String(id)} ${detail.job.title}｜粗筛 ${score}`)
          if (detail.matchReasons.length === 0) {
            lines.push('  （没有命中任何规则项）')
          } else {
            for (const reason of detail.matchReasons.slice(0, 6)) {
              lines.push(`  · ${reason.text}（权重 ${String(reason.weight)}）`)
            }
          }
          if (detail.flags.length > 0) {
            lines.push(`  ⚠ ${detail.flags.map((flag) => JOB_FLAG_LABEL[flag.flagType]).join('、')}`)
          }
        }
        lines.push('说明：这是规则粗筛分，不是完整评估；需要语义分析要显式开模型（P9）。')
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'greeting_draft',
      description:
        '为某个岗位生成打招呼话术。**只生成，不发送** —— 发送要用 greeting_send 并经过用户审批。' +
        '模型不可用时会退回内置模板，返回里会如实说明是哪种。',
      parameters: schema(
        {
          jobId: int('岗位 id'),
          tone: { type: 'string', enum: ['formal', 'warm', 'concise'], description: '语气' },
          highlights: {
            type: 'array',
            items: { type: 'string' },
            description: '要突出的经历要点（最多 3 条）',
          },
        },
        ['jobId'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const tone = asString(args['tone'])
        if (tone !== undefined && !(tone in TONE_LABEL)) {
          throw new DomainError('INVALID_INPUT', `tone 取值不合法：${tone}`, {
            hint: `合法取值：${Object.keys(TONE_LABEL).join(' / ')}`,
          })
        }
        const highlights = Array.isArray(args['highlights'])
          ? args['highlights'].filter((item): item is string => typeof item === 'string').slice(0, 3)
          : undefined

        const draft = await runtime.draftGreeting({
          jobId: id,
          ...(tone === undefined ? {} : { tone: tone as 'formal' | 'warm' | 'concise' }),
          ...(highlights === undefined ? {} : { highlights }),
        })

        const source =
          draft.via === 'llm' ? '来源：模型生成' : `来源：内置模板（${draft.notes.join('；') || '未调用模型'}）`
        const egress =
          draft.outboundFields.length === 0
            ? '本次没有数据发给模型'
            : `发给模型的字段：${draft.outboundFields.join('、')}`
        return {
          text: [
            `#${String(draft.jobId)} 打招呼话术（${source}）`,
            '',
            draft.text,
            '',
            `（${String(draft.text.length)} 字）${egress}`,
            '这段还没有发送。要发的话用 greeting_send，它会先让你确认。',
          ].join('\n'),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string; jobId: number }>({
      name: 'greeting_send',
      description:
        '**发送**打招呼（高危，必须经用户审批）。会依次检查：功能开关 → 隐身 → 额度 → 冷却期 → 用户审批。' +
        '不传 text 就先按岗位生成一段再交给用户确认。',
      timeoutMs: 6 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          text: str('要发送的话术全文；不填则先生成一段'),
        },
        ['jobId'],
      ),
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, jobId: { type: 'integer' } },
      },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const text = asString(args['text'])

        // 注意：这里**没有** guiConfirmed —— 模型不能自我确认，
        // guard 会因为 actor='model' 走 ctx.approval。
        const result = await runtime.sendGreeting({
          jobId: id,
          ...(text === undefined ? {} : { text }),
          actor: 'model',
        })
        return {
          jobId: result.jobId,
          text:
            `已向「${result.company || result.title}」发送打招呼` +
            `（${result.platformId}，${String(result.textLength)} 字，${result.sentAt}）。`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'inbox_sync',
      description:
        '**同步收件箱**：把平台会话列表（HR 消息）读进本地消息表，之后用 inbox 工具即可看到。' +
        '低危（不对外发任何消息），因此**不需要审批**。未登录、或该平台适配器没实现收件箱读取时' +
        '会如实失败 —— 不会静默返回 0 条让你以为"今天没人回复"。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          platformId: str('平台 id，例如 zhipin'),
        },
        ['platformId'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const platformId = asString(args['platformId'])
        if (platformId === undefined || platformId === '') {
          throw new DomainError('INVALID_INPUT', 'platformId 不能为空')
        }
        // 低危动作：模型发起也不需要审批（guard 只在 high / 模型发起的 mid 时问用户）
        const result = await runtime.syncInbox({ platformId, actor: 'model' })
        return {
          text:
            `${platformId} 收件箱同步完成：读到 ${String(result.fetched)} 条，` +
            `新增 ${String(result.recorded)}、重复 ${String(result.duplicates)}、未读 ${String(result.unread)}。`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'application_deliver',
      description:
        '**投递简历**（高危，必须经用户审批）。与 `application_send`（"记一笔我投了"）不同 —— ' +
        '这条会**真的用适配器把简历发出去**，成功后自动记一笔投递。' +
        '不传 filePath 时用平台内简历（BOSS 求职者网页端只支持这种）；传了本地文件而平台不支持上传时会如实失败。',
      timeoutMs: 6 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          filePath: str('本地简历文件的绝对路径；不填 = 用平台内简历'),
        },
        ['jobId'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const filePath = asString(args['filePath'])

        // 注意：这里**没有** guiConfirmed —— 模型不能自我确认，guard 会走 ctx.approval。
        const result = await runtime.sendApplication({
          jobId: id,
          filePath: filePath ?? null,
          actor: 'model',
        })
        return {
          text:
            `已向「${result.company || result.title}」投递简历` +
            `（${result.platformId}，送达状态 ${result.delivery}，${result.sentAt}）。` +
            (result.detail === undefined ? '' : `\n${result.detail}`),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'job_settings',
      description:
        '读写插件配置：模型用途开关、发送分层（L3 打招呼 / L4 投递 / L4 回复）。' +
        '审计开关、审批开关、额度与冷却期**模型一律不能改**（§22.4 禁止项，会被直接拒绝）。',
      parameters: schema(
        {
          action: { type: 'string', enum: ['get', 'set'], description: '读还是写' },
          ai: {
            type: 'object',
            description: '模型配置：{ enabled, purposes: { greeting_draft: true, ... } }',
          },
          guard: {
            type: 'object',
            description: '闸门配置：{ levels: { l3Greeting, l4Application, l4Reply } }',
          },
        },
        ['action'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action'])

        const render = (snapshot: SettingsSnapshot): string =>
          [
            '模型用途：',
            ...snapshot.derived.purposes.map(
              (purpose) => `· ${purpose.label}（${purpose.purpose}）：${purpose.enabled ? '开' : '关'}`,
            ),
            `总开关：${snapshot.ai.enabled ? '开' : '关'}`,
            '发送分层：',
            `· L3 打招呼：${snapshot.guard.levels.l3Greeting ? '开' : '关'}`,
            `· L4 投递：${snapshot.guard.levels.l4Application ? '开' : '关'}`,
            `· L4 回复：${snapshot.guard.levels.l4Reply ? '开' : '关'}`,
            `每日额度：打招呼 ${String(snapshot.guard.dailyLimits.greeting)} / 投递 ${String(
              snapshot.guard.dailyLimits.application,
            )} / 回复 ${String(snapshot.guard.dailyLimits.reply)}`,
            `冷却期：${String(snapshot.guard.cooldownMinutes)} 分钟｜批量上限：${String(
              snapshot.guard.batchLimit,
            )}`,
            `审批：${snapshot.guard.requireApproval ? '必须' : '已关闭'}｜审计：${
              snapshot.guard.auditEnabled ? '开' : '已关闭'
            }`,
            `模型可改：${snapshot.derived.modelEditable.join('、')}`,
            `模型禁止改：${snapshot.derived.modelForbidden.join('、')}`,
          ].join('\n')

        const settings = runtime.settings()
        if (action === 'get') return { text: render(settings.snapshot()) }
        if (action !== 'set') {
          throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`, {
            hint: '合法取值：get / set',
          })
        }

        const ai =
          args['ai'] !== null && typeof args['ai'] === 'object'
            ? (args['ai'] as Record<string, unknown>)
            : undefined
        const guard =
          args['guard'] !== null && typeof args['guard'] === 'object'
            ? (args['guard'] as Record<string, unknown>)
            : undefined
        if (ai === undefined && guard === undefined) {
          throw new DomainError('INVALID_INPUT', 'set 需要至少给出 ai 或 guard')
        }

        const next = await runtime.updateSettings(
          {
            ...(ai === undefined ? {} : { ai: ai as never }),
            ...(guard === undefined ? {} : { guard: guard as never }),
          },
          'model',
        )
        return { text: `配置已更新。\n${render(next)}` }
      },
    }),

    // ── P6：简历（§22.2 的 resume_* 五个）────────────────────────────
    // 注意分工：查询是**低危**（只读）；保存/定制/导出是**中危** ——
    // 模型发起时会走审批（`needsApproval` 对 model+mid 返回 true）。
    // 更要紧的是 `resume_tailor`：它会把简历正文发给模型，所以那条路径上
    // 用途开关（默认关）+ 隐私闸门 + 防编造检查三样缺一不可。

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_list',
      description: '列出简历版本（方向、语言、启用状态、填写完整度、体检问题数）。低危，只读。',
      parameters: schema({}),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run() {
        requireData(runtime)
        const items = runtime.resumes().list()
        if (items.length === 0) {
          return { text: '还没有任何简历版本。用 resume_save 建一版，或到「简历中心」里填。' }
        }
        const lines = [`共 ${String(items.length)} 版简历：`]
        for (const item of items) {
          lines.push(
            `#${String(item.id)} ${item.name}` +
              `${item.isDefault ? '（当前启用）' : ''}｜${item.direction || '未填方向'}｜` +
              `${RESUME_LANGUAGE_LABEL[item.language]}｜rev ${String(item.rev)}`,
          )
          lines.push(
            `  技能 ${String(item.counts.skills)} · 经历 ${String(item.counts.experiences)} · ` +
              `项目 ${String(item.counts.projects)} · 教育 ${String(item.counts.education)} · ` +
              `附件 ${String(item.counts.files)}` +
              `${item.issues === 0 ? '' : `｜体检 ${String(item.issues)} 项待改`}`,
          )
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<{ resumeId: number }, { text: string }>({
      name: 'resume_get',
      description: '读某一版简历的完整结构化内容 + 体检问题。低危，只读。',
      parameters: schema({ resumeId: int('简历 id（resume_list 里的 #数字）') }, ['resumeId']),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.resumeId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'resumeId 必须是正整数')
        const service = runtime.resumes()
        const resume = service.get(id)
        const issues = service.inspect(id)
        const c = resume.content
        const lines = [
          `#${String(resume.id)} ${resume.name}（rev ${String(resume.rev)}，${RESUME_LANGUAGE_LABEL[resume.language]}）`,
          `姓名：${c.basics.name || '（未填）'}｜目标：${c.basics.title || '（未填）'}`,
          `城市：${c.basics.city ?? '（未填）'}｜年限：${c.basics.years === undefined ? '（未填）' : `${String(c.basics.years)} 年`}`,
          `简介：${c.summary === '' ? '（未填）' : c.summary.slice(0, 120)}`,
          `技能（${String(c.skills.length)}）：${c.skills.slice(0, 20).map((s) => s.name).join('、') || '（空）'}`,
        ]
        for (const experience of c.experiences.slice(0, 5)) {
          lines.push(
            `经历：${experience.company}｜${experience.title}｜${experience.start ?? '?'}–${experience.end ?? '至今'}` +
              `（${String(experience.highlights.length)} 条成果）`,
          )
        }
        for (const project of c.projects.slice(0, 5)) {
          lines.push(`项目：${project.name}（${String(project.highlights.length)} 条）`)
        }
        for (const education of c.education) {
          lines.push(`教育：${education.school}｜${education.major ?? ''}｜${education.degree ?? ''}`)
        }
        lines.push('', '体检：')
        if (issues.length === 0) {
          lines.push('· 规则体检没有发现问题')
        } else {
          for (const issue of issues.slice(0, 8)) {
            lines.push(`· [${issue.level === 'error' ? '必改' : '建议'}] ${issue.message}`)
          }
        }
        if (resume.files.length > 0) {
          lines.push(
            '',
            `已有附件：${resume.files.map((file) => `${file.format}（${String(file.bytes)} 字节）`).join('、')}`,
          )
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_save',
      description:
        '新建或修改一版简历。**中危**：模型发起时需要用户审批（简历是用户资产，不该被悄悄改）。' +
        '不传 resumeId 就是新建。',
      parameters: schema({
        resumeId: int('要修改的简历 id；不传则新建'),
        name: str('版本名，如「Java 后端 · 2026 春」'),
        direction: str('岗位方向'),
        language: { type: 'string', enum: [...RESUME_LANGUAGES], description: '简历语言' },
        content: { type: 'object', description: '完整简历内容对象（结构与 resume_get 返回的一致）' },
        isDefault: { type: 'boolean', description: '是否设为当前启用版本' },
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const resumeId = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const content = args['content']
        if (content === undefined || content === null || typeof content !== 'object') {
          throw new DomainError('INVALID_INPUT', 'content 必须是完整的简历对象', {
            hint: '先用 resume_get 读一份现有简历当模板，再整体改。不接受局部合并。',
          })
        }
        const patch = {
          content: normalizeResumeContent(content),
          ...(asString(args['name']) === undefined ? {} : { name: asString(args['name']) as string }),
          ...(asString(args['direction']) === undefined
            ? {}
            : { direction: asString(args['direction']) as string }),
          ...(typeof args['isDefault'] === 'boolean' ? { isDefault: args['isDefault'] } : {}),
        }

        return await runtime.guard().run(
          {
            action: 'resume.save',
            actor: 'model',
            danger: 'mid',
            payload: {
              resumeId: resumeId ?? null,
              name: patch.name ?? '(沿用原版本名)',
              mode: resumeId === undefined ? '新建' : '修改',
              // 审计里只留摘要：正文不进审计表（§4.1）
              contentBytes: JSON.stringify(patch.content).length,
              skills: patch.content.skills.length,
              experiences: patch.content.experiences.length,
            },
          },
          async () => {
            const service = runtime.resumes()
            const resume =
              resumeId === undefined
                ? service.create({
                    name: patch.name ?? patch.content.basics.title ?? '新简历',
                    ...(patch.direction === undefined ? {} : { direction: patch.direction }),
                    ...(typeof args['language'] === 'string' ? { language: args['language'] as never } : {}),
                    content: patch.content,
                    ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
                  })
                : service.update(resumeId, patch)
            runtime.events().publish('resume.updated', { id: resume.id, rev: resume.rev })
            return {
              text:
                `${resumeId === undefined ? '已新建' : '已更新'}简历 #${String(resume.id)}「${resume.name}」` +
                `（rev ${String(resume.rev)}）。\n` +
                '注意：简历改了之后，**之前算过的匹配分全部标记为过期** —— ' +
                '用 job_match_explain 重算才是新简历下的分数。',
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_tailor',
      description:
        '针对某个岗位生成简历定制建议（**只产出建议，不改你手上的简历**）。**中危**，模型发起时需要审批。' +
        '简历正文会发给模型，所以受「简历定制」用途开关与隐私闸门约束；结果一律过防编造检查。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('目标岗位 id'),
          resumeId: int('用哪一版简历；不传用当前启用版本'),
          useLlm: { type: 'boolean', description: '是否允许调用模型（false = 只用规则）' },
        },
        ['jobId'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const jobId = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (jobId === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const resumeId = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const useLlm = typeof args['useLlm'] === 'boolean' ? args['useLlm'] : undefined

        return await runtime.guard().run(
          {
            action: 'resume.tailor',
            actor: 'model',
            danger: 'mid',
            target: { jobId },
            payload: {
              jobId,
              resumeId: resumeId ?? null,
              useLlm: useLlm ?? true,
              note: '会把简历正文发给模型做对齐改写（不含联系方式）。',
            },
          },
          async () => {
            const tailoring = await runtime.resumes().tailor({
              jobId,
              ...(resumeId === undefined ? {} : { resumeId }),
              ...(useLlm === undefined ? {} : { useLlm }),
            })
            const matched = tailoring.content.skills.slice(0, 8).map((skill) => skill.name).join('、')
            return {
              text: [
                `已为岗位 #${String(jobId)}「${tailoring.jobTitle ?? ''}」生成定制建议 #${String(tailoring.id)}` +
                  `（来源：${tailoring.via === 'llm' ? '模型' : '规则'}）`,
                tailoring.notes.length === 0 ? '' : `改动说明：${tailoring.notes.join('；')}`,
                matched === '' ? '' : `调整后的技能顺序：${matched}`,
                '',
                '**这只是建议，你的简历没有被改动。** 要采用的话到「岗位详情 → 简历定制」里逐条确认。',
              ]
                .filter((line) => line !== '')
                .join('\n'),
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'resume_export',
      description:
        '把某一版简历导出成附件（pdf / docx / html）。**中危**，模型发起时需要审批。' +
        'PDF 走独立的无头 Chromium 渲染；docx 是真正的 OOXML 文件。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema({
        resumeId: int('简历 id；不传用当前启用版本'),
        format: { type: 'string', enum: [...RESUME_FORMATS], description: '导出格式' },
        template: { type: 'string', enum: [...RESUME_TEMPLATES], description: '排版模板' },
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const format = asString(args['format']) ?? 'pdf'
        const template = asString(args['template']) ?? 'concise'
        const explicit = typeof args['resumeId'] === 'number' ? args['resumeId'] : undefined
        const target =
          explicit ?? runtime.resumes().list().find((item) => item.isDefault)?.id ?? runtime.resumes().list()[0]?.id
        if (target === undefined) {
          throw new DomainError('NOT_FOUND', '还没有任何简历版本可以导出', {
            hint: '先用 resume_save 建一版。',
          })
        }

        return await runtime.guard().run(
          {
            action: 'resume.export',
            actor: 'model',
            danger: 'mid',
            payload: { resumeId: target, format, template },
          },
          async () => {
            const file = await runtime.resumes().exportResume(target, {
              format: format as never,
              template: template as never,
            })
            runtime.events().publish('resume.exported', {
              resumeId: target,
              fileId: file.id,
              format: file.format,
              bytes: file.bytes,
            })
            return {
              text:
                `已导出简历 #${String(target)} 的 ${file.format} 附件：${file.fileName}` +
                `（${String(file.bytes)} 字节，附件 #${String(file.id)}）。\n` +
                '在「简历中心」里可以预览或下载。',
            }
          },
        )
      },
    }),
    // ── P7：跟进、消息、面试、看板（§22.2）──────────────────────────
    // 危险级与文档一致：投递/回复是**高危**（会真的对外发东西），
    // 状态流转与面试管理是中危，只读的与看板是低危。

    tool<Record<string, unknown>, { text: string; applicationId: number }>({
      name: 'application_send',
      description:
        '记录一次投递（简历发出）。**高危**，必须经用户审批 —— 审批文案会显示岗位、渠道与用了哪版简历。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          resumeId: int('用了哪一版简历；不传用当前启用版本'),
          resumeFileId: int('用了哪份附件；不传表示用在线简历'),
          channel: { type: 'string', enum: [...APPLICATION_CHANNELS], description: '投递渠道' },
          note: str('备注'),
        },
        ['jobId'],
      ),
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, applicationId: { type: 'integer' } },
      },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const jobId = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (jobId === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const channel = asString(args['channel'])
        if (channel !== undefined && !(APPLICATION_CHANNELS as readonly string[]).includes(channel)) {
          throw new DomainError('INVALID_INPUT', `不支持的渠道：${channel}`, {
            hint: `合法取值：${APPLICATION_CHANNELS.join(' / ')}`,
          })
        }

        // actor='model' → 高危必然走审批；这里**没有** guiConfirmed（模型不能自我确认）
        const application = await runtime.pipeline().recordApplication({
          jobId,
          actor: 'model',
          ...(typeof args['resumeId'] === 'number' ? { resumeId: args['resumeId'] } : {}),
          ...(typeof args['resumeFileId'] === 'number' ? { resumeFileId: args['resumeFileId'] } : {}),
          ...(channel === undefined ? {} : { channel: channel as ApplicationChannel }),
          ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
        })
        runtime.events().publish('application.created', { id: application.id, jobId })
        return {
          applicationId: application.id,
          text:
            `已记录投递 #${String(application.id)}：${application.companyName ?? ''}「${application.jobTitle ?? ''}」` +
            `（渠道 ${APPLICATION_CHANNEL_LABEL[application.channel]}，简历 #${String(application.resumeId ?? 0)}）。\n` +
            '后面的进展用 application_update 推进；看板在「投递流水线」里。',
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'application_update',
      description:
        '推进/修正一条投递的阶段（已投递→已查看→面试中→已面试→Offer/已拒绝/无回复）。' +
        '**中危**：模型发起时需要审批。回退需要显式 allowBackward。',
      parameters: schema(
        {
          applicationId: int('投递记录 id（board 或 job_detail 里能看到）'),
          to: { type: 'string', enum: [...APPLICATION_STAGES], description: '目标阶段' },
          note: str('变更原因（会写进状态事件，便于回溯）'),
          allowBackward: { type: 'boolean', description: '允许回退到更早的阶段' },
          evidenceRef: str('依据（比如消息 id），自动识别时必填'),
        },
        ['applicationId', 'to'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.applicationId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'applicationId 必须是正整数')
        const to = asString(args['to'])
        if (to === undefined) throw new DomainError('INVALID_INPUT', 'to 必填')

        return await runtime.guard().run(
          {
            action: 'application.update',
            actor: 'model',
            danger: 'mid',
            payload: { applicationId: id, to, note: asString(args['note']) ?? null },
          },
          async () => {
            const before = runtime.pipeline().get(id)
            const application = runtime.pipeline().advance({
              applicationId: id,
              to: to as ApplicationStage,
              actor: 'model',
              source: 'model',
              ...(typeof args['allowBackward'] === 'boolean' ? { allowBackward: args['allowBackward'] } : {}),
              ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
              ...(asString(args['evidenceRef']) === undefined
                ? {}
                : { evidenceRef: asString(args['evidenceRef']) as string }),
            })
            runtime.events().publish('application.advanced', { id, stage: application.stage })
            return {
              text:
                `投递 #${String(id)}：${APPLICATION_STAGE_LABEL[before.stage]} → ` +
                `${APPLICATION_STAGE_LABEL[application.stage]}（已记入状态事件）。`,
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'inbox_list',
      description: '看消息（默认最近 50 条，可只看未读）。低危，只读。会标出疑似面试邀约。',
      parameters: schema({
        jobId: int('只看某个岗位的消息'),
        unreadOnly: { type: 'boolean', description: '只看未读' },
        limit: int('返回条数，默认 20'),
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const jobId = typeof args['jobId'] === 'number' ? args['jobId'] : undefined
        const inbox = runtime.messages().inbox({
          ...(jobId === undefined ? {} : { jobId }),
          ...(args['unreadOnly'] === true ? { unreadOnly: true } : {}),
          limit: toInt(args['limit'], 20, 1, 100),
        })
        if (inbox.items.length === 0) {
          return {
            text:
              inbox.total === 0
                ? '没有消息。消息目前靠手动录入（平台适配器的收件箱解析属于 P8）。'
                : '没有未读消息。',
          }
        }
        const lines = [`共 ${String(inbox.total)} 条，未读 ${String(inbox.unread)} 条：`]
        for (const message of inbox.items.slice(0, 20)) {
          const who = message.direction === 'hr' ? 'HR' : '我'
          lines.push(
            `#${String(message.id)} [${who}] ${message.at.slice(0, 16).replace('T', ' ')}` +
              `${message.readAt === null ? '（未读）' : ''}` +
              `${message.jobTitle === null ? '' : `｜${message.companyName ?? ''} ${message.jobTitle}`}`,
          )
          lines.push(`  ${message.content.slice(0, 120)}`)
          if (message.inviteSignal?.hit === true) {
            lines.push(`  ⚠ 疑似面试邀约（命中：${message.inviteSignal.keywords.join('、')}）—— 仅供参考，改状态请显式确认`)
          }
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'message_reply',
      description:
        '回复一条 HR 消息。**高危**，必须经用户审批（审批文案会显示回复正文全文）。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          messageId: int('要回复的消息 id（inbox_list 里的 #数字）'),
          content: str('回复正文'),
        },
        ['messageId', 'content'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const messageId = toInt(args.messageId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (messageId === 0) throw new DomainError('INVALID_INPUT', 'messageId 必须是正整数')
        const content = asString(args['content'])
        if (content === undefined) throw new DomainError('INVALID_INPUT', 'content 不能为空')

        const message = await runtime.messages().reply({ messageId, content, actor: 'model' })
        runtime.events().publish('message.replied', { id: message.id })
        return {
          text: `已回复消息 #${String(messageId)}（新消息 #${String(message.id)}，${String(content.length)} 字）。`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'interview_manage',
      description:
        '面试日程：新增/改期/改状态/查冲突。**中危**：模型发起时需要审批。' +
        '改期必须显式 allowReschedule。',
      parameters: schema(
        {
          action: { type: 'string', enum: ['list', 'upsert', 'state', 'conflicts'], description: '要做的操作' },
          interviewId: int('面试 id（state 需要）'),
          applicationId: int('关联的投递 id'),
          jobId: int('关联岗位 id'),
          at: str('面试时间（ISO，如 2026-09-20T14:00:00+08:00）'),
          round: int('第几轮'),
          kind: { type: 'string', enum: [...INTERVIEW_KINDS], description: '面试形式' },
          state: { type: 'string', enum: [...INTERVIEW_STATES], description: '目标状态' },
          place: str('地点（现场面试）'),
          link: str('会议链接（视频面试）'),
          contact: str('联系人'),
          commuteMin: int('单程通勤分钟数（现场面试）'),
          allowReschedule: { type: 'boolean', description: '确认改期' },
          days: int('list 时往后看几天，默认 30'),
        },
        ['action'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action'])
        const service = runtime.interviews()

        if (action === 'conflicts') {
          const conflicts = service.conflicts()
          return {
            text:
              conflicts.length === 0
                ? '没有面试时间冲突。'
                : ['有面试时间冲突：', ...conflicts.map((item) => `· #${String(item.a)} 与 #${String(item.b)}：${item.reason}（重叠 ${String(item.overlapMin)} 分钟）`)].join('\n'),
          }
        }

        if (action === 'list') {
          const days = toInt(args['days'], 30, 1, 365)
          const now = new Date()
          const list = service.list({
            from: new Date(now.getTime() - 86_400_000).toISOString(),
            to: new Date(now.getTime() + days * 86_400_000).toISOString(),
            limit: 50,
          })
          if (list.length === 0) return { text: `未来 ${String(days)} 天没有面试安排。` }
          return {
            text: [
              `共 ${String(list.length)} 场：`,
              ...list.map(
                (item) =>
                  `#${String(item.id)} ${item.at.slice(0, 16).replace('T', ' ')}｜` +
                  `${item.companyName ?? ''} ${item.jobTitle ?? ''}｜第 ${String(item.round)} 轮｜` +
                  `${INTERVIEW_KIND_LABEL[item.kind]}｜${INTERVIEW_STATE_LABEL[item.state]}` +
                  `${item.conflicts.length === 0 ? '' : ` ⚠ 与 #${item.conflicts.join('、#')} 冲突`}` +
                  `${item.commuteMin === null ? '' : `｜通勤 ${String(item.commuteMin)} 分钟`}`,
              ),
            ].join('\n'),
          }
        }

        if (action === 'state') {
          const id = toInt(args['interviewId'], 0, 1, Number.MAX_SAFE_INTEGER)
          const state = asString(args['state'])
          if (id === 0 || state === undefined) {
            throw new DomainError('INVALID_INPUT', 'state 需要 interviewId 与 state')
          }
          return await runtime.guard().run(
            {
              action: 'interview.state',
              actor: 'model',
              danger: 'mid',
              payload: { interviewId: id, state },
            },
            async () => {
              const interview = service.setState(id, state as InterviewState, {
                ...(args['allowReschedule'] === true ? { allowReschedule: true } : {}),
                source: 'model',
              })
              return {
                text: `面试 #${String(id)} 状态改为「${INTERVIEW_STATE_LABEL[interview.state]}」（已记入状态事件）。`,
              }
            },
          )
        }

        // upsert
        const at = asString(args['at'])
        if (at === undefined) throw new DomainError('INVALID_INPUT', 'at（面试时间）必填')
        return await runtime.guard().run(
          {
            action: 'interview.upsert',
            actor: 'model',
            danger: 'mid',
            ...(typeof args['jobId'] === 'number' ? { target: { jobId: args['jobId'] } } : {}),
            payload: { at, round: args['round'] ?? 1, kind: args['kind'] ?? 'video' },
          },
          async () => {
            const interview = service.upsert({
              at,
              ...(typeof args['interviewId'] === 'number' ? { id: args['interviewId'] } : {}),
              ...(typeof args['applicationId'] === 'number' ? { applicationId: args['applicationId'] } : {}),
              ...(typeof args['jobId'] === 'number' ? { jobId: args['jobId'] } : {}),
              ...(typeof args['round'] === 'number' ? { round: args['round'] } : {}),
              ...(asString(args['kind']) === undefined ? {} : { kind: asString(args['kind']) as InterviewKind }),
              ...(asString(args['place']) === undefined ? {} : { place: asString(args['place']) as string }),
              ...(asString(args['link']) === undefined ? {} : { link: asString(args['link']) as string }),
              ...(asString(args['contact']) === undefined ? {} : { contact: asString(args['contact']) as string }),
              ...(typeof args['commuteMin'] === 'number' ? { commuteMin: args['commuteMin'] } : {}),
            })
            runtime.events().publish('interview.scheduled', { id: interview.id, at: interview.at })
            return {
              text:
                `${String(args['interviewId'] ?? '') === '' ? '已新增' : '已更新'}面试 #${String(interview.id)}：` +
                `${interview.at}｜${INTERVIEW_KIND_LABEL[interview.kind]}｜${INTERVIEW_STATE_LABEL[interview.state]}` +
                `${interview.conflicts.length === 0 ? '' : ` ⚠ 与 #${interview.conflicts.join('、#')} 时间冲突`}`,
            }
          },
        )
      },
    }),

    tool<{ interviewId: number }, { text: string }>({
      name: 'interview_prep',
      description:
        '面试准备包：技能差距、公司风险标注、之前记过的错题、通勤提醒与检查清单。低危，只读。',
      parameters: schema({ interviewId: int('面试 id') }, ['interviewId']),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const id = toInt(args.interviewId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (id === 0) throw new DomainError('INVALID_INPUT', 'interviewId 必须是正整数')
        const prep = runtime.interviews().prep(id)
        const lines = [
          `#${String(prep.interviewId)} ${prep.companyName ?? ''}「${prep.jobTitle ?? ''}」面试准备`,
          '',
          `通勤：${prep.commute.advice}`,
          prep.matchedSkills.length === 0
            ? '技能匹配：岗位文本里没抽到与你简历重合的技术词'
            : `你有的：${prep.matchedSkills.join('、')}`,
          prep.missingSkills.length === 0
            ? ''
            : `你没有的（会被追问）：${prep.missingSkills.slice(0, 10).join('、')}`,
          prep.companyFlags.length === 0 ? '公司风险：规则没有命中' : `公司风险：${prep.companyFlags.join('；')}`,
          prep.questionNotes.length === 0
            ? '错题本：还没有记录'
            : `错题本（问过 ${String(prep.questionNotes[0]?.times ?? 0)} 次以上的排前面）：\n${prep.questionNotes
                .slice(0, 5)
                .map((note) => `  · ${note.question}（${String(note.times)} 次）`)
                .join('\n')}`,
          '',
          '检查清单：',
          ...prep.checklist.map((item) => `· ${item}`),
          ...prep.notes.map((note) => `\n注意：${note}`),
        ]
        return { text: lines.filter((line) => line !== '').join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'job_report',
      description:
        '数据看板：投递漏斗、渠道/简历版本归因、薪资分位、薪资箱线图、本地基准对比、简历版本 A/B 对比。' +
        '低危，只读。样本量太小时会明确说明"别据此下结论"，不会硬给你一个百分比。',
      parameters: schema({
        what: {
          type: 'string',
          enum: ['funnel', 'attribution', 'salary', 'box', 'baseline', 'resume', 'all'],
          description:
            '要看哪一块，默认 all。box = 箱线图（P25–P75）；baseline = 与**你自己岗位库**的基准对比；' +
            'resume = 简历版本 A/B 对比（每格带样本量，不做显著性）',
        },
        city: str('薪资与基准的城市范围'),
        q: str('薪资与基准的岗位关键词'),
        basis: {
          type: 'string',
          enum: ['monthly_min', 'annualized'],
          description: '箱线图口径：月薪下限 / 年薪折算。**必须显式** —— 两个口径算出来的中位数不一样',
        },
      }),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const what = asString(args['what']) ?? 'all'
        const analytics = runtime.analytics()
        const lines: string[] = []

        if (what === 'funnel' || what === 'all') {
          const funnel = analytics.funnel()
          lines.push('【漏斗】')
          for (const step of funnel.steps) {
            lines.push(
              `· ${step.label}：${String(step.count)}` +
                `${step.rate === null ? '' : `（上一层转化 ${(step.rate * 100).toFixed(0)}%）`}`,
            )
          }
          lines.push(`  ${funnel.note}`)
        }

        if (what === 'attribution' || what === 'all') {
          const attribution = analytics.attribution()
          lines.push('', '【渠道归因】')
          if (attribution.byChannel.length === 0) lines.push('· 还没有投递记录')
          for (const row of attribution.byChannel) {
            lines.push(
              `· ${row.label}：投 ${String(row.total)}｜回复 ${String(row.replied)}｜` +
                `面试 ${String(row.interviewed)}｜Offer ${String(row.offered)}`,
            )
          }
          lines.push('', '【简历版本归因】')
          if (attribution.byResume.length === 0) lines.push('· 还没有投递记录')
          for (const row of attribution.byResume) {
            lines.push(
              `· ${row.label}：投 ${String(row.total)}｜回复 ${String(row.replied)}｜面试 ${String(row.interviewed)}`,
            )
          }
          lines.push(`  ${attribution.note}`)
        }

        const city = asString(args['city'])
        const keyword = asString(args['q'])
        const basisRaw = asString(args['basis'])
        const basis = basisRaw === 'annualized' ? 'annualized' : 'monthly_min'

        if (what === 'salary' || what === 'all') {
          const band = analytics.salaryBand({
            ...(city === undefined ? {} : { city }),
            ...(keyword === undefined ? {} : { keyword }),
          })
          lines.push('', `【薪资分位 · ${band.scope}】`)
          lines.push(
            band.count === 0
              ? '· 没有带薪资下限的岗位样本'
              : `· 样本 ${String(band.count)} 条（只看薪资下限）｜P25 ${String(band.p25)}｜` +
                `中位 ${String(band.median)}｜P75 ${String(band.p75)}`,
          )
        }

        if (what === 'box' || what === 'all') {
          const chart = analytics.salaryBox({
            ...(city === undefined ? {} : { city }),
            ...(keyword === undefined ? {} : { keyword }),
            basis,
          })
          lines.push('', `【薪资箱线图 · ${chart.box.basisLabel}】`)
          lines.push(
            chart.box.count === 0
              ? '· 没有符合该口径的岗位样本'
              : `· 样本 ${String(chart.box.count)} 条｜最小 ${String(chart.box.min)}｜P25 ${String(chart.box.p25)}｜` +
                `中位 ${String(chart.box.median)}｜P75 ${String(chart.box.p75)}｜最大 ${String(chart.box.max)}` +
                `（P25–P75 区间里 ${String(chart.box.withinBox)} 条）`,
          )
          lines.push(`  ${chart.note}`)
        }

        // F2：本地基准 —— 基准**只能**是自己抓到的岗位库（本项目没有数据源）
        if (what === 'baseline' || what === 'all') {
          const baseline = analytics.salaryBaseline({
            ...(city === undefined ? {} : { city }),
            ...(keyword === undefined ? {} : { keyword }),
          })
          lines.push('', `【与本地基准对比 · ${baseline.scope}】`)
          lines.push(
            `· 全部在库：${String(baseline.all.count)} 条｜中位 ${String(baseline.all.median)}｜` +
              `P25 ${String(baseline.all.p25)}｜P75 ${String(baseline.all.p75)}`,
          )
          lines.push(
            `· 我投递过的：${String(baseline.applied.count)} 条｜中位 ${String(baseline.applied.median)}`,
          )
          lines.push(
            baseline.medianGap === null
              ? '· 差额：无法计算（有一边没有样本）'
              : `· 中位数之差：${baseline.medianGap > 0 ? '+' : ''}${String(baseline.medianGap)} 元/月` +
                (baseline.enoughSample ? '' : '（样本不足，别看差额）'),
          )
          lines.push(`  ${baseline.note}`)
        }

        // F3：简历 A/B 对比 —— 每格给分子/分母，薄格子标出来
        if (what === 'resume' || what === 'all') {
          const compare = analytics.resumeCompare()
          lines.push('', '【简历版本 A/B 对比】')
          if (compare.rows.length === 0) lines.push('· 还没有投递记录')
          for (const row of compare.rows) {
            const cells = row.cells
              .filter((cell) => cell.count > 0)
              .map((cell) => `${cell.label} ${String(cell.count)}/${String(row.total)}${cell.thin ? '（样本少）' : ''}`)
              .join('｜')
            lines.push(`· ${row.label}（投 ${String(row.total)}）：${cells === '' ? '—' : cells}`)
          }
          lines.push(`  ${compare.note}`)
        }

        return { text: lines.join('\n') }
      },
    }),
    // ── P8：校招与海外支线（§22.2 的对等原则同样适用）────────────────
    // 校招与海外各有**不可逆节点**，所以工具面把它们单独暴露出来：
    // 硬截止必须能被模型主动查到并提醒，而不是等用户在界面上发现。

    tool<Record<string, unknown>, { text: string }>({
      name: 'campus_manage',
      description:
        '校招支线：网申记录、批次时间窗、笔试/测评（**硬截止**）、三方协议、宣讲会。' +
        '**中危**：模型发起的写操作需要审批。查看来龙去脉用 action=list / action=deadlines。',
      parameters: schema(
        {
          action: {
            type: 'string',
            enum: ['list', 'windows', 'create', 'advance', 'assessment', 'assessment-state', 'tripartite', 'tripartite-state', 'talks'],
            description: '要做的操作',
          },
          campusId: int('校招记录 id'),
          companyId: int('公司 id'),
          jobId: int('关联岗位 id'),
          batch: { type: 'string', enum: [...CAMPUS_BATCHES], description: '秋招/春招' },
          stage: { type: 'string', enum: [...CAMPUS_STAGES], description: '目标校招状态' },
          applyOpenAt: str('网申开放时间（ISO）'),
          applyCloseAt: str('网申截止时间（ISO）'),
          assessmentId: int('测评 id'),
          assessmentKind: { type: 'string', enum: [...ASSESSMENT_KINDS], description: '笔试/测评类型' },
          dueAt: str('测评截止时间（ISO）—— 必填，校招的笔试错过就出局'),
          durationMin: int('测评时长（分钟）'),
          assessmentState: { type: 'string', enum: [...ASSESSMENT_STATES], description: '测评状态' },
          platform: str('测评平台'),
          tripartiteId: int('三方协议 id'),
          signDeadline: str('三方签署截止（ISO）'),
          penaltySummary: str('违约条款摘要'),
          tripartiteState: { type: 'string', enum: [...TRIPARTITE_STATES], description: '三方状态' },
          talkAt: str('宣讲会时间（ISO）'),
          talkPlace: str('宣讲会地点'),
          talkOnline: { type: 'boolean', description: '是否线上' },
          note: str('备注'),
        },
        ['action'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const service = runtime.campus()
        const action = asString(args['action'])

        if (action === 'list') {
          const items = service.list({
            ...(asString(args['batch']) === undefined ? {} : { batch: asString(args['batch']) as CampusBatch }),
            ...(asString(args['stage']) === undefined ? {} : { stage: asString(args['stage']) as CampusStage }),
          })
          if (items.length === 0) return { text: '还没有校招记录。用 action=create 建一条。' }
          return {
            text: [
              `共 ${String(items.length)} 条校招记录：`,
              ...items.map(
                (item) =>
                  `#${String(item.id)} ${item.companyName ?? '未知公司'}｜${CAMPUS_BATCH_LABEL[item.batch]}｜` +
                  `${CAMPUS_STAGE_LABEL[item.stage]}` +
                  `${item.applyCloseAt === null ? '' : `｜网申截止 ${item.applyCloseAt.slice(0, 10)}`}` +
                  `${item.assessments.length === 0 ? '' : `｜测评 ${String(item.assessments.length)} 场`}`,
              ),
            ].join('\n'),
          }
        }

        if (action === 'windows') {
          return {
            text: [
              '批次时间窗：',
              ...service.windows().map(
                (window) =>
                  `· ${CAMPUS_BATCH_LABEL[window.batch]}：${String(window.count)} 条记录，` +
                  `${String(window.openCount)} 个还在"意向"` +
                  `${window.nextCloseAt === null ? '' : `，最近一个截止 ${window.nextCloseAt.slice(0, 10)}`}`,
              ),
              '校招是季节性的，错过窗口就等一年 —— 截止时间要盯着。',
            ].join('\n'),
          }
        }

        if (action === 'talks') {
          const talks = service.listTalkSessions()
          if (talks.length === 0) return { text: '还没有宣讲会记录。' }
          return {
            text: [
              `共 ${String(talks.length)} 场宣讲会：`,
              ...talks.map(
                (talk) =>
                  `· ${talk.at.slice(0, 16).replace('T', ' ')}｜${talk.companyName ?? ''}｜` +
                  `${talk.online ? '线上' : (talk.place ?? '地点未填')}`,
              ),
            ].join('\n'),
          }
        }

        // 以下都是写操作 → 中危，模型发起时走审批
        return await runtime.guard().run(
          {
            action: `campus.${action}`,
            actor: 'model',
            danger: 'mid',
            ...(typeof args['jobId'] === 'number' ? { target: { jobId: args['jobId'] } } : {}),
            payload: { action, args: { ...args } },
          },
          async () => {
            switch (action) {
              case 'create': {
                const campus = service.create({
                  ...(typeof args['companyId'] === 'number' ? { companyId: args['companyId'] } : {}),
                  ...(typeof args['jobId'] === 'number' ? { jobId: args['jobId'] } : {}),
                  ...(asString(args['batch']) === undefined ? {} : { batch: asString(args['batch']) as CampusBatch }),
                  ...(asString(args['applyOpenAt']) === undefined ? {} : { applyOpenAt: asString(args['applyOpenAt']) as string }),
                  ...(asString(args['applyCloseAt']) === undefined ? {} : { applyCloseAt: asString(args['applyCloseAt']) as string }),
                  ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
                })
                return { text: `已建校招记录 #${String(campus.id)}（${CAMPUS_BATCH_LABEL[campus.batch]}）。` }
              }
              case 'advance': {
                const id = toInt(args['campusId'], 0, 1, Number.MAX_SAFE_INTEGER)
                const stage = asString(args['stage'])
                if (id === 0 || stage === undefined) {
                  throw new DomainError('INVALID_INPUT', 'advance 需要 campusId 与 stage')
                }
                const campus = service.advance(id, stage as CampusStage, {
                  ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
                })
                return { text: `校招 #${String(id)} 状态改为「${CAMPUS_STAGE_LABEL[campus.stage]}」。` }
              }
              case 'assessment': {
                const dueAt = asString(args['dueAt'])
                if (dueAt === undefined) {
                  throw new DomainError('INVALID_INPUT', 'dueAt（截止时间）必填', {
                    hint: '校招的笔试错过就出局，没有截止时间的记录做不出提醒。',
                  })
                }
                const assessment = service.addAssessment({
                  ...(typeof args['campusId'] === 'number' ? { campusApplicationId: args['campusId'] } : {}),
                  ...(asString(args['platform']) === undefined ? {} : { platform: asString(args['platform']) as string }),
                  ...(asString(args['assessmentKind']) === undefined
                    ? {}
                    : { kind: asString(args['assessmentKind']) as AssessmentKind }),
                  dueAt,
                  ...(typeof args['durationMin'] === 'number' ? { durationMin: args['durationMin'] } : {}),
                })
                return {
                  text:
                    `已记录测评 #${String(assessment.id)}：${ASSESSMENT_KIND_LABEL[assessment.kind]}，` +
                    `截止 ${assessment.dueAt ?? ''}（还剩 ${String(assessment.hoursLeft ?? 0)} 小时）。\n` +
                    '⚠ 这是**不可逆**节点：错过就是终态。',
                }
              }
              case 'assessment-state': {
                const id = toInt(args['assessmentId'], 0, 1, Number.MAX_SAFE_INTEGER)
                const state = asString(args['assessmentState'])
                if (id === 0 || state === undefined) {
                  throw new DomainError('INVALID_INPUT', 'assessment-state 需要 assessmentId 与 assessmentState')
                }
                const assessment = service.setAssessmentState(id, state as AssessmentState)
                return { text: `测评 #${String(id)} 状态改为「${ASSESSMENT_STATE_LABEL[assessment.state]}」。` }
              }
              case 'tripartite': {
                const tripartite = service.addTripartite({
                  ...(typeof args['campusId'] === 'number' ? { campusApplicationId: args['campusId'] } : {}),
                  ...(asString(args['signDeadline']) === undefined
                    ? {}
                    : { signDeadline: asString(args['signDeadline']) as string }),
                  ...(asString(args['penaltySummary']) === undefined
                    ? {}
                    : { penaltySummary: asString(args['penaltySummary']) as string }),
                })
                return {
                  text:
                    `已记录三方协议 #${String(tripartite.id)}` +
                    `${tripartite.signDeadline === null ? '' : `（签署截止 ${tripartite.signDeadline}）`}。\n` +
                    '⚠ 三方是**不可逆**节点，签署前请确认违约条款。',
                }
              }
              case 'tripartite-state': {
                const id = toInt(args['tripartiteId'], 0, 1, Number.MAX_SAFE_INTEGER)
                const state = asString(args['tripartiteState'])
                if (id === 0 || state === undefined) {
                  throw new DomainError('INVALID_INPUT', 'tripartite-state 需要 tripartiteId 与 tripartiteState')
                }
                return {
                  text: `三方协议 #${String(id)} 状态改为「${TRIPARTITE_STATE_LABEL[service.setTripartiteState(id, state as TripartiteState).state]}」。`,
                }
              }
              default:
                throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`)
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'campus_deadlines',
      description:
        '所有**不可逆硬截止**：校招笔试/测评截止、网申截止、三方签署截止（按到期时间排序）。低危，只读。' +
        '这些节点错过就是终态，所以 24 小时以内的会被标为紧急。',
      parameters: schema({}),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run() {
        requireData(runtime)
        const service = runtime.campus()
        const items = service.deadlines()
        const overdue = service.overdue()
        if (items.length === 0) {
          return {
            text:
              overdue.length === 0
                ? '没有待处理的硬截止。'
                : `有 ${String(overdue.length)} 个已过期的硬截止 —— 见下面的过期清单。`,
          }
        }
        return {
          text: [
            `共 ${String(items.length)} 个硬截止（按到期时间）：`,
            ...items.map(
              (item) =>
                `${item.overdue ? '⛔ 已过期' : item.urgent ? '⚠ 紧急' : '·'} ${item.label}｜` +
                `${item.dueAt.slice(0, 16).replace('T', ' ')}｜` +
                `${item.hoursLeft < 0 ? `已过 ${String(-item.hoursLeft)} 小时` : `还剩 ${String(item.hoursLeft)} 小时`}`,
            ),
            '',
            '这些节点都是**不可逆**的：校招笔试错过即终态，网申错过要等下一季。',
          ].join('\n'),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'overseas_check',
      description:
        '海外/远程支线：识别岗位的**工签/Sponsorship 立场**与工作模式，做**时区双重换算**，' +
        '并给英文简历做体检（**只检查，不翻译**）。低危，只读（识别结果会落库）。',
      parameters: schema({
        action: { type: 'string', enum: ['analyze', 'visa', 'filter', 'timezone', 'english-check'], description: '要做的操作' },
        jobId: int('岗位 id'),
        resumeId: int('简历 id（english-check 用）'),
        at: str('面试时间（ISO，timezone 用）'),
        tz: str('对方时区（如 America/New_York，timezone 用）'),
        stance: { type: 'string', enum: [...VISA_STANCES], description: '按工签立场筛选' },
        remote: { type: 'string', enum: [...REMOTE_KINDS], description: '按工作模式筛选' },
      }, ['action']),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const service = runtime.overseas()
        const action = asString(args['action'])

        if (action === 'analyze') {
          const jobId = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
          if (jobId === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
          const result = service.analyzeJob(jobId)
          return {
            text: [
              `岗位 #${String(jobId)} 的海外属性：`,
              `· 工签立场：${VISA_STANCE_LABEL[result.stance]}` +
                `${result.evidence.length === 0 ? '' : `（依据：${result.evidence.join('、')}）`}`,
              `· 工作模式：${REMOTE_KIND_LABEL[result.remoteKind]}`,
              `· 校招批次：${result.campusBatch === null ? '未识别' : result.campusBatch}`,
              result.uncertainty === null ? '' : `\n注意：${result.uncertainty}`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          }
        }

        if (action === 'visa') {
          const jobId = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
          if (jobId === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
          const visa = service.getVisa(jobId)
          return {
            text:
              `岗位 #${String(jobId)}：${VISA_STANCE_LABEL[visa.stance]}` +
              `${visa.identityLimit === null ? '' : `（身份限制：${visa.identityLimit}）`}` +
              `${visa.evidence.length === 0 ? '' : `\n依据：${visa.evidence.join('、')}`}` +
              `${visa.uncertainty === null ? '' : `\n注意：${visa.uncertainty}`}`,
          }
        }

        if (action === 'filter') {
          const stance = asString(args['stance'])
          const remote = asString(args['remote'])
          if (stance !== undefined && !(VISA_STANCES as readonly string[]).includes(stance)) {
            throw new DomainError('INVALID_INPUT', `不支持的工签立场：${stance}`, {
              hint: `合法取值：${VISA_STANCES.join(' / ')}`,
            })
          }
          const items = service.filterJobs({
            ...(stance === undefined ? {} : { stance: stance as VisaStance }),
            ...(remote === undefined ? {} : { remoteKind: remote as RemoteKind }),
          })
          if (items.length === 0) {
            return {
              text:
                '没有匹配的岗位。注意：**没有识别过的岗位不会出现在这里** —— ' +
                '先用 action=analyze 识别一下，别把"没识别"当成"不符合"。',
            }
          }
          return {
            text: [
              `匹配 ${String(items.length)} 个岗位：`,
              ...items.slice(0, 20).map(
                (item) =>
                  `#${String(item.jobId)} ${item.title}｜${item.companyName ?? ''}｜` +
                  `工签 ${item.stance === null ? '未识别' : VISA_STANCE_LABEL[item.stance]}｜` +
                  `${item.remoteKind === null ? '模式未识别' : REMOTE_KIND_LABEL[item.remoteKind]}`,
              ),
            ].join('\n'),
          }
        }

        if (action === 'timezone') {
          const at = asString(args['at'])
          const tz = asString(args['tz'])
          if (at === undefined || tz === undefined) {
            throw new DomainError('INVALID_INPUT', 'timezone 需要 at 与 tz')
          }
          const display = service.displayInterviewTime(at, tz)
          return {
            text: [
              `面试时间（同一时刻，两个时区都显示）：`,
              `· 对方（${display.counterpart.tz}）：${display.counterpart.text}`,
              `· 本地（${display.local.tz}）：${display.local.text}`,
              `· 时差：${String(display.diffHours)} 小时`,
              display.warning === null ? '' : `\n⚠ ${display.warning}`,
            ]
              .filter((line) => line !== '')
              .join('\n'),
          }
        }

        // english-check
        const resumeId = toInt(args.resumeId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (resumeId === 0) throw new DomainError('INVALID_INPUT', 'english-check 需要 resumeId')
        const issues = service.inspectEnglish(resumeId)
        return {
          text: [
            issues.length === 0 ? '英文简历体检没有发现问题。' : `英文简历体检发现 ${String(issues.length)} 项：`,
            ...issues.map((issue) => `· [${issue.level === 'error' ? '必改' : '建议'}] ${issue.message}`),
            '',
            '（这里只做检查，不提供中→英翻译 —— 机翻简历是海外求职最致命的错误。）',
          ].join('\n'),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'cover_letter_draft',
      description:
        '为某个岗位写 Cover Letter。**中危**：模型发起时需要审批（会调用模型并读取简历）。' +
        'Cover Letter **不是简历的复述**，要说明"为什么是这个岗位、为什么是我"。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          language: { type: 'string', enum: [...COVER_LETTER_LANGUAGES], description: '语言，默认英文' },
          resumeId: int('用哪一版简历；不传用当前启用版本'),
          useLlm: { type: 'boolean', description: '是否允许调用模型（false = 只用模板）' },
        },
        ['jobId'],
      ),
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => value.text,
      async run(args) {
        requireData(runtime)
        const jobId = toInt(args.jobId, 0, 1, Number.MAX_SAFE_INTEGER)
        if (jobId === 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
        const language = asString(args['language']) ?? 'en'

        return await runtime.guard().run(
          {
            action: 'cover-letter.draft',
            actor: 'model',
            danger: 'mid',
            target: { jobId },
            payload: { jobId, language, note: '会调用模型并读取简历（不含联系方式）。' },
          },
          async () => {
            const letter = await runtime.overseas().draftCoverLetter({
              jobId,
              language: language as CoverLetterLanguage,
              ...(typeof args['resumeId'] === 'number' ? { resumeId: args['resumeId'] } : {}),
              ...(typeof args['useLlm'] === 'boolean' ? { useLlm: args['useLlm'] } : {}),
            })
            return {
              text: [
                `Cover Letter #${String(letter.id)}（来源：${letter.via === 'llm' ? '模型' : '模板'}，${letter.language}）`,
                '',
                letter.content,
                letter.notes.length === 0 ? '' : `\n改动说明：${letter.notes.join('；')}`,
              ]
                .filter((line) => line !== '')
                .join('\n'),
            }
          },
        )
      },
    }),
  ]
}

/** 一次注册的结果。**失败必须能被看到**，不能只写进日志就完事。 */
export interface ToolRegistrationReport {
  registered: string[]
  failed: Array<{ name: string; reason: string }>
  /** 注册前就已经被别的插件占用的名字（我们没去抢）。 */
  conflicts: string[]
}

export interface ToolRegistration {
  report: ToolRegistrationReport
  dispose: Disposer
}

/**
 * 注册全部工具。
 *
 * 为什么返回一份 report：实测踩过 —— 宿主自带 `job_list`，我们的同名工具注册失败，
 * 而失败被 `catch` 吞成了日志里的一行，界面上什么都没说。
 * 「工具静默少了一个」是模型能力缺失里最难查的一类问题，所以这里把它变成可见状态。
 */
export function registerJobHunterTools(ctx: PluginContext, runtime: HostRuntime): ToolRegistration {
  const report: ToolRegistrationReport = { registered: [], failed: [], conflicts: [] }
  const tools = serviceOf<ToolsService>(ctx, 'tools')
  if (tools === undefined) {
    ctx.logger?.warn(`[${PLUGIN_ID}] tools 服务缺失，模型工具未注册（对话里将无法操作岗位）`)
    return { report, dispose: () => {} }
  }

  // 先看一眼已经存在的名字：这时候别的 bundle 可能还没注册完，
  // 所以这只是"早知道一步"，真正的兜底是下面的 try/catch。
  let taken = new Set<string>()
  try {
    taken = new Set((tools.schemas?.() ?? []).map((schema) => schema.name))
  } catch (error) {
    ctx.logger?.warn(`[${PLUGIN_ID}] 读取已有工具清单失败：${messageOf(error)}`)
  }

  const definitions = buildTools(runtime)
  const disposers: Disposer[] = []
  for (const definition of definitions) {
    if (taken.has(definition.name)) {
      report.conflicts.push(definition.name)
      ctx.logger?.error(
        `[${PLUGIN_ID}] 工具名 ${definition.name} 已被宿主或其它插件占用 —— ` +
          '本插件这个工具没有注册（重名会被 tools.register 拒绝）。请改名后重试。',
      )
    }
    try {
      disposers.push(tools.register(definition))
      report.registered.push(definition.name)
    } catch (error) {
      const reason = messageOf(error)
      report.failed.push({ name: definition.name, reason })
      if (!report.conflicts.includes(definition.name)) report.conflicts.push(definition.name)
      // 这条必须是 error 级：静默少一个工具会让模型"莫名其妙做不到某件事"
      ctx.logger?.error(
        `[${PLUGIN_ID}] 工具 ${definition.name} 注册失败：${reason} —— ` +
          `本次会话里模型将无法使用它（已注册 ${String(report.registered.length)}/${String(definitions.length)}）。`,
      )
    }
  }

  ctx.logger?.info(
    `[${PLUGIN_ID}] 已注册 ${String(report.registered.length)}/${String(definitions.length)} 个模型工具（§22.2）` +
      (report.conflicts.length === 0 ? '' : `；没注册上：${report.conflicts.join('、')}`),
  )

  return {
    report,
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose()
        } catch {
          /* 单个注销失败不影响其余 */
        }
      }
    },
  }
}

export { buildTools }
