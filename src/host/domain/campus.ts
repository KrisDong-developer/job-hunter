/**
 * 校招支线（§4.L / §12.7）。
 *
 * 校招与社招主线最大的差别是**两个不可逆节点**：
 *   * **笔试/测评有硬截止，错过即终态**；
 *   * **三方协议签署前后必须显著区分**（违约有真实代价）。
 *
 * 所以这个服务的核心不是 CRUD，而是 `deadlines()` 与 `overdue()`：
 * 把"再不做就来不及了"这件事单独挑出来。它们会被 U0 与待办系统当 **urgent** 处理，
 * 而不是普通通知 —— 这类错误没有第二次机会（决策记录第 3 条）。
 */
import type {
  AssessmentKind,
  AssessmentState,
  CampusBatch,
  CampusStage,
  TripartiteState,
} from '../../shared/enums.js'
import {
  ASSESSMENT_KINDS,
  ASSESSMENT_STATES,
  CAMPUS_BATCHES,
  CAMPUS_STAGES,
  TRIPARTITE_STATES,
} from '../../shared/enums.js'
import type { CampusApplicationDto, AssessmentDto, DeadlineDto, TalkSessionDto, TripartiteDto } from '../../shared/dto.js'
import type { BranchDeadline } from '../store/repo/campus.js'
import type { Store } from '../store/store.js'
import { systemClock, type Clock } from '../util/time.js'
import { DomainError } from '../util/errors.js'
import { normalizeCompanyName } from '../util/company-name.js'

/** 距截止多久开始算"紧急"。24 小时以内的硬截止才是 urgent —— 再早会变成狼来了。 */
export const URGENT_WITHIN_HOURS = 24
/** 距截止多久开始进入"要提醒"的范围。 */
export const WARN_WITHIN_HOURS = 72

export interface CampusService {
  // 批次与时间窗（L1）
  create(input: {
    companyId?: number | null
    /** 界面只给用户一个「公司名」输入框（他手里没有 company id），这里按归一化键幂等登记。 */
    companyName?: string | null
    jobId?: number | null
    batch?: CampusBatch
    applyOpenAt?: string | null
    applyCloseAt?: string | null
    note?: string | null
  }): CampusApplicationDto
  advance(id: number, stage: CampusStage, options?: { allowBackward?: boolean; note?: string | null }): CampusApplicationDto
  get(id: number): CampusApplicationDto
  list(filter?: { batch?: CampusBatch; stage?: CampusStage; companyId?: number; limit?: number }): CampusApplicationDto[]
  /** 秋招/春招的时间窗概览 —— 校招是季节性的事，得先看到窗口。 */
  windows(): Array<{ batch: CampusBatch; count: number; openCount: number; nextCloseAt: string | null }>

  // 笔试/测评（L3，硬截止）
  addAssessment(input: {
    campusApplicationId?: number | null
    platform?: string
    kind?: AssessmentKind
    at?: string | null
    dueAt?: string | null
    durationMin?: number | null
  }): AssessmentDto
  setAssessmentState(id: number, state: AssessmentState, result?: string | null): AssessmentDto
  listAssessments(filter?: { campusApplicationId?: number; state?: AssessmentState }): AssessmentDto[]

  // 宣讲会（L4）
  addTalkSession(input: {
    companyId?: number | null
    at: string
    place?: string | null
    online?: boolean
    url?: string | null
    worthGoing?: string | null
    note?: string | null
  }): TalkSessionDto
  listTalkSessions(): TalkSessionDto[]

  // 三方协议（L5，不可逆）
  addTripartite(input: {
    campusApplicationId?: number | null
    issuedAt?: string | null
    signDeadline?: string | null
    penaltySummary?: string | null
  }): TripartiteDto
  setTripartiteState(id: number, state: TripartiteState): TripartiteDto
  listTripartite(): TripartiteDto[]

  /** 所有硬截止，按到期时间升序（**这是这个服务最重要的方法**）。 */
  deadlines(): DeadlineDto[]
  /** 已经错过的硬截止 —— 不可逆的事必须显式认账，不能默默消失。 */
  overdue(): DeadlineDto[]
}

export interface CampusDeps {
  store: Store
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
}


export function createCampusService(deps: CampusDeps): CampusService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  const decorateCampus = (record: ReturnType<Store['branch']['createCampusApplication']>): CampusApplicationDto => {
    const company = record.companyId === null ? undefined : store.company.get(record.companyId)
    const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
    return {
      ...record,
      companyName: company?.name ?? null,
      jobTitle: job?.title ?? null,
      assessments: store.branch
        .listAssessments({ campusApplicationId: record.id })
        .map((item) => ({
          ...item,
          hoursLeft: item.dueAt === null ? null : hoursBetween(clock(), item.dueAt),
        })),
    }
  }

  const decorateAssessment = (record: ReturnType<Store['branch']['createAssessment']>): AssessmentDto => ({
    ...record,
    hoursLeft: record.dueAt === null ? null : hoursBetween(clock(), record.dueAt),
  })

  /**
   * 硬截止的"主体名" —— 这个节点属于哪一家。
   *
   * 仓储给的标签只说到**哪一类**（"笔试截止" / "秋招网申截止"），但校招是十几家同时在跑，
   * 光看"笔试截止"回答不了"我现在该做哪一件"。主体名在这里补一次，
   * 界面、工具、待办三个消费方就不用各拼一遍（也就不会各漏一处）。
   */
  const deadlineOwner = (deadline: BranchDeadline): string => {
    const campusId =
      deadline.kind === 'apply-close'
        ? deadline.refId
        : deadline.kind === 'assessment'
          ? (store.branch.getAssessment(deadline.refId)?.campusApplicationId ?? null)
          : (store.branch.listTripartite({ limit: 500 }).find((item) => item.id === deadline.refId)
              ?.campusApplicationId ?? null)
    if (campusId === null) return ''
    const record = store.branch.getCampusApplication(campusId)
    if (record === undefined) return ''
    const company = record.companyId === null ? undefined : store.company.get(record.companyId)
    return company?.name ?? record.note ?? ''
  }

  const toDeadlineDto = (deadline: BranchDeadline): DeadlineDto => {
    const owner = deadlineOwner(deadline)
    return {
      ...deadline,
      label: owner === '' ? deadline.label : `${owner} · ${deadline.label}`,
      urgent: deadline.hoursLeft <= URGENT_WITHIN_HOURS,
      overdue: deadline.hoursLeft < 0,
    }
  }

  /**
   * 推进校招状态**并留痕**。
   *
   * 抽成一个内部函数，是因为"改了状态却忘了写事件"这件事在实测里发生了三次
   * （测评完成、建三方、三方签署各漏一次）—— 而事件表是唯一能回答
   * "这个状态是谁改的、凭什么"的地方。把两条动作绑在一个函数里，
   * 以后新增路径就不可能只做一半。
   */
  const advanceCampusStage = (campusId: number, to: CampusStage, evidenceRef?: string): void => {
    const before = store.branch.getCampusApplication(campusId)
    if (before === undefined || before.stage === to) return
    // 自动推进**只能向前**。`advance()` 那边回退要显式带 `allowBackward`，到这里若不管方向，
    // 「新建三方」就会把一条已结束/已拒的记录悄悄推回"待发三方" —— 终态被自动改回去，
    // 而且不留人工痕迹。方向不对就什么都不做，交给人来点。
    if (CAMPUS_STAGES.indexOf(to) < CAMPUS_STAGES.indexOf(before.stage)) return
    store.branch.updateCampusApplication(campusId, { stage: to }, clock())
    store.pipeline.appendStageEvent(
      {
        entity: 'campus',
        entityId: campusId,
        fromStage: before.stage,
        toStage: to,
        source: 'auto',
        evidenceRef: evidenceRef ?? null,
      },
      clock(),
    )
  }

  return {
    create(input): CampusApplicationDto {
      if (input.batch !== undefined && !CAMPUS_BATCHES.includes(input.batch)) {
        throw new DomainError('INVALID_INPUT', `不支持的批次：${String(input.batch)}`, {
          hint: `合法取值：${CAMPUS_BATCHES.join(' / ')}`,
        })
      }
      /**
       * 公司名 → 公司实体。
       *
       * 界面上用户只能打一行名字，所以这里按 `normalizeCompanyName` 的键幂等登记
       * （与采集/导入同一条路径），让校招记录真正挂到公司维度上 —— 否则 `company_id`
       * 永远是 null，公司页里一条校招都看不到。
       *
       * 归一化不出键（名字太短、只剩后缀）就退回 `note`：**宁可只在备注里留一行字，
       * 也不为一个认不出来的字符串造一条公司**（铁律 1：不确定宁可不合并）。
       */
      let companyId = input.companyId ?? null
      let note = input.note ?? null
      const companyName = input.companyName?.trim() ?? ''
      if (companyId === null && companyName !== '') {
        const nameNorm = normalizeCompanyName(companyName)
        if (nameNorm === '') note = note ?? companyName
        else companyId = store.company.ensure({ name: companyName, nameNorm }, clock()).id
      }
      const record = store.branch.createCampusApplication(
        {
          companyId,
          jobId: input.jobId ?? null,
          ...(input.batch === undefined ? {} : { batch: input.batch }),
          applyOpenAt: input.applyOpenAt ?? null,
          applyCloseAt: input.applyCloseAt ?? null,
          note,
        },
        clock(),
      )
      // 与社招投递共用同一张事件表：状态机不同，但"每次变更都要留痕"是同一条规则
      store.pipeline.appendStageEvent(
        { entity: 'campus', entityId: record.id, fromStage: null, toStage: 'intent', source: 'manual' },
        clock(),
      )
      deps.logger?.info(`[campus] 新建校招记录 #${String(record.id)}（批次 ${record.batch}）`)
      return decorateCampus(record)
    },

    advance(id, stage, options = {}): CampusApplicationDto {
      const current = store.branch.getCampusApplication(id)
      if (current === undefined) {
        throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`, { detail: { campusApplicationId: id } })
      }
      if (!CAMPUS_STAGES.includes(stage)) {
        throw new DomainError('INVALID_INPUT', `不支持的校招状态：${String(stage)}`, {
          hint: `合法取值：${CAMPUS_STAGES.join(' / ')}`,
        })
      }
      if (stage === current.stage) return decorateCampus(current)

      const backward = CAMPUS_STAGES.indexOf(stage) < CAMPUS_STAGES.indexOf(current.stage)
      if (backward && options.allowBackward !== true) {
        throw new DomainError('INVALID_INPUT', `不允许把校招状态从「${current.stage}」回退到「${stage}」`, {
          hint: '回退要显式带 allowBackward: true。三方协议那类不可逆节点尤其不该被随手改回去。',
          detail: { from: current.stage, to: stage },
        })
      }
      const updated = store.branch.updateCampusApplication(id, { stage }, clock())
      if (updated === undefined) throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`)
      store.pipeline.appendStageEvent(
        {
          entity: 'campus',
          entityId: id,
          fromStage: current.stage,
          toStage: stage,
          source: 'manual',
          note: options.note ?? null,
        },
        clock(),
      )
      return decorateCampus(updated)
    },

    get(id): CampusApplicationDto {
      const record = store.branch.getCampusApplication(id)
      if (record === undefined) {
        throw new DomainError('NOT_FOUND', `校招记录不存在：${String(id)}`)
      }
      return decorateCampus(record)
    },

    list(filter = {}): CampusApplicationDto[] {
      return store.branch.listCampusApplications(filter).map(decorateCampus)
    },

    windows() {
      const now = clock()
      return CAMPUS_BATCHES.map((batch) => {
        const items = store.branch.listCampusApplications({ batch, limit: 500 })
        const upcoming = items
          .map((item) => item.applyCloseAt)
          .filter((value): value is string => value !== null && value >= now)
          .sort()
        return {
          batch,
          count: items.length,
          openCount: items.filter((item) => item.stage === 'intent').length,
          nextCloseAt: upcoming[0] ?? null,
        }
      })
    },

    addAssessment(input): AssessmentDto {
      if (input.kind !== undefined && !ASSESSMENT_KINDS.includes(input.kind)) {
        throw new DomainError('INVALID_INPUT', `不支持的测评类型：${String(input.kind)}`, {
          hint: `合法取值：${ASSESSMENT_KINDS.join(' / ')}`,
        })
      }
      // 笔试截止是**不可逆**的，所以建的时候就必须有截止时间 ——
      // 没有截止时间的测评等于没有提醒，等于没用。
      if (input.dueAt === undefined || input.dueAt === null || input.dueAt === '') {
        throw new DomainError('INVALID_INPUT', '笔试/测评必须给截止时间（dueAt）', {
          hint: '校招的笔试错过就出局，没有截止时间的记录做不出提醒。',
        })
      }
      const record = store.branch.createAssessment(
        {
          campusApplicationId: input.campusApplicationId ?? null,
          ...(input.platform === undefined ? {} : { platform: input.platform }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          at: input.at ?? null,
          dueAt: input.dueAt,
          durationMin: input.durationMin ?? null,
        },
        clock(),
      )
      // 建档即把校招记录推进到"待笔试"，但**只在已经网申之后**。
      //
      // 为什么停在 `intent` 时不动它：§12.7 的顺序是 意向 → 已网申 → 待笔试，
      // 从 `intent` 直接跳到 `assessment_pending` 会**凭空发明"已网申"这一步**；
      // 而只走到 `applied` 又是在替用户改状态。项目的既定哲学是
      // 「自动识别提出，人工确认」（§12.1 的"自动识别 + 人工确认"）——
      // 所以这里只做**不产生歧义的那一步**：已网申之后才有"待笔试"可言。
      if (record.campusApplicationId !== null) {
        const campus = store.branch.getCampusApplication(record.campusApplicationId)
        if (campus !== undefined && campus.stage === 'applied') {
          advanceCampusStage(campus.id, 'assessment_pending', `assessment:${String(record.id)}`)
        } else if (campus !== undefined && campus.stage === 'intent') {
          deps.logger?.warn(
            `[campus] 校招记录 #${String(campus.id)} 还在"意向"就先记了笔试 —— ` +
              '状态没有自动改（不替用户改状态），但如果确实已经网申，请把状态推到「已网申」。',
          )
        }
      }
      deps.logger?.info(`[campus] 新增测评 #${String(record.id)}，截止 ${record.dueAt ?? '未填'}`)
      return decorateAssessment(record)
    },

    setAssessmentState(id, state, result): AssessmentDto {
      if (!ASSESSMENT_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', `不支持的测评状态：${String(state)}`)
      }
      const current = store.branch.getAssessment(id)
      if (current === undefined) throw new DomainError('NOT_FOUND', `测评不存在：${String(id)}`)

      /**
       * `missed` 是**终态且不可逆**（§12.7：笔试错过即出局）。
       *
       * 允许把它改回 `pending` 会让"错过"变成一件可以抹掉的事 ——
       * 而现实里错过的笔试没有第二次。所以这里显式挡住，并给出可读原因。
       */
      if (current.state === 'missed' && state !== 'missed') {
        throw new DomainError('INVALID_INPUT', '已经错过的笔试/测评不能改回未完成状态', {
          hint:
            '校招的笔试错过就是终态（§12.7）。如果实际上参加了，请让学校/公司重置后重新记录一条，' +
            '而不是把这条改成"完成" —— 那会让记录与事实不符。',
          detail: { assessmentId: id, from: current.state, to: state },
        })
      }

      const updated = store.branch.updateAssessment(id, { state, result: result ?? null }, clock())
      if (updated === undefined) throw new DomainError('NOT_FOUND', `测评不存在：${String(id)}`)
      store.pipeline.appendStageEvent(
        { entity: 'assessment', entityId: id, fromStage: current.state, toStage: state, source: 'manual' },
        clock(),
      )
      // 完成了就推进校招记录；**错过了不推进** —— 错过是终态，不是进度
      if (updated.campusApplicationId !== null && state === 'done') {
        advanceCampusStage(updated.campusApplicationId, 'assessment_done', `assessment:${String(id)}`)
      }
      return decorateAssessment(updated)
    },

    listAssessments(filter = {}): AssessmentDto[] {
      return store.branch.listAssessments(filter).map(decorateAssessment)
    },

    addTalkSession(input): TalkSessionDto {
      const record = store.branch.createTalkSession(
        {
          companyId: input.companyId ?? null,
          at: input.at,
          place: input.place ?? null,
          online: input.online === true,
          url: input.url ?? null,
          worthGoing: input.worthGoing ?? null,
          note: input.note ?? null,
        },
        clock(),
      )
      return { ...record, companyName: record.companyId === null ? null : (store.company.get(record.companyId)?.name ?? null) }
    },

    listTalkSessions(): TalkSessionDto[] {
      return store.branch.listTalkSessions().map((record) => ({
        ...record,
        companyName: record.companyId === null ? null : (store.company.get(record.companyId)?.name ?? null),
      }))
    },

    addTripartite(input): TripartiteDto {
      const record = store.branch.createTripartite(
        {
          campusApplicationId: input.campusApplicationId ?? null,
          issuedAt: input.issuedAt ?? null,
          signDeadline: input.signDeadline ?? null,
          penaltySummary: input.penaltySummary ?? null,
        },
        clock(),
      )
      if (record.campusApplicationId !== null) {
        const campus = store.branch.getCampusApplication(record.campusApplicationId)
        // 与 addAssessment 同一条口径：**不替用户发明没发生过的步骤**。
        // 还在"意向"就先建了三方，说明它其实连网申都还没交 —— 从 intent 直接跳到
        // "待发三方"会把网申/笔试/面试整段抹掉，所以只提醒、不改状态。
        if (campus !== undefined && campus.stage === 'intent') {
          deps.logger?.warn(
            `[campus] 校招记录 #${String(campus.id)} 还在"意向"就先建了三方 —— ` +
              '状态没有自动改（不替用户改状态），如果确实已经走到发三方请手动推进状态。',
          )
        } else {
          advanceCampusStage(record.campusApplicationId, 'tripartite_pending', `tripartite:${String(record.id)}`)
        }
      }
      deps.logger?.warn(
        `[campus] 新增三方协议 #${String(record.id)}：这是**不可逆**节点，签署前请确认违约条款`,
      )
      return { ...record }
    },

    setTripartiteState(id, state): TripartiteDto {
      if (!TRIPARTITE_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', `不支持的三方状态：${String(state)}`)
      }
      const current = store.branch.listTripartite({ limit: 500 }).find((item) => item.id === id)
      if (current === undefined) throw new DomainError('NOT_FOUND', `三方协议不存在：${String(id)}`)

      /**
       * 已签不能改回待签（§4.L L5：**三方协议是不可逆节点**，违约有真实代价）。
       *
       * 真的违约了要改成 `breached`，而不是假装没签过 ——
       * 抹掉签署记录等于把"我签过"这件事从数据里删掉，而那正是违约纠纷里最要紧的事实。
       */
      if (current.state === 'signed' && state !== 'signed' && state !== 'breached') {
        throw new DomainError('INVALID_INPUT', '已签署的三方协议不能改回待签', {
          hint: '三方签署是不可逆节点。如果确实违约了，请把状态改为「违约」并在违约条款里写清代价。',
          detail: { tripartiteId: id, from: current.state, to: state },
        })
      }

      const updated = store.branch.updateTripartite(id, { state }, clock())
      if (updated === undefined) throw new DomainError('NOT_FOUND', `三方协议不存在：${String(id)}`)
      store.pipeline.appendStageEvent(
        { entity: 'tripartite', entityId: id, fromStage: current.state, toStage: state, source: 'manual' },
        clock(),
      )
      if (updated.campusApplicationId !== null && state === 'signed') {
        advanceCampusStage(updated.campusApplicationId, 'tripartite_signed', `tripartite:${String(id)}`)
      }
      return { ...updated }
    },

    listTripartite(): TripartiteDto[] {
      return store.branch.listTripartite().map((record) => ({ ...record }))
    },

    deadlines(): DeadlineDto[] {
      return store.branch.deadlines(clock()).map(toDeadlineDto)
    },

    overdue(): DeadlineDto[] {
      return store.branch
        .deadlines(clock())
        .map(toDeadlineDto)
        .filter((deadline) => deadline.overdue)
    },
  }
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  // 负数**向下取整**：刚过期 20 分钟时 `Math.round(-0.33)` 得到 `-0`，而 `-0 < 0` 是 false ——
  // 界面会显示"还剩 0 小时"、也不再标"已过期"。硬截止系统里最不该出现的就是
  // "明明过期了却看起来没过期"。
  const raw = (to - from) / 3_600_000
  return raw < 0 ? Math.floor(raw) : Math.round(raw)
}
