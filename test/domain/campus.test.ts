/**
 * 校招支线领域测试（§4.L / §12.7 / D-10）。
 *
 * 这条支线与社招主线最大的差别是**两个不可逆节点**：笔试有硬截止（错过即终态）、
 * 三方协议签署前后必须显著区分。所以这里守的不是 CRUD，而是三件事：
 *
 *   1. **每次阶段变化都要留事件** —— `stage_event` 是"谁、什么时候、凭什么"的唯一答案，
 *      校招流程要跑好几个月，没有留痕就无法回溯；
 *   2. **`deadlines()` 不能漏掉任何一个"再不做就来不及"的节点** —— 漏一个就少一次提醒，
 *      而校招的提醒没有第二次机会（决策记录第 3 条）；
 *   3. **`missed` 是终态不是进度** —— 错过的笔试不能被当成"往下走了一格"（§12.7）。
 *
 * 时间一律固定：`hoursLeft` / `urgent` / `nextCloseAt` 这类断言只要碰真实时间就是随机失败源。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ASSESSMENT_STATES,
  CAMPUS_BATCHES,
  CAMPUS_STAGES,
  TRIPARTITE_STATES,
} from '../../src/shared/enums.js'
import type { AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../src/shared/enums.js'
import { createCampusService, URGENT_WITHIN_HOURS, WARN_WITHIN_HOURS } from '../../src/host/domain/campus.js'
import { currentVersion, MIGRATIONS } from '../../src/host/store/migrate.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
const T0 = Date.parse(T)

/** 相对固定时刻的小时数 → ISO 串。所有时间断言都从这里取，不碰真实时间。 */
const at = (hours: number): string => new Date(T0 + hours * 3_600_000).toISOString()

/** P8 新增的六张支线表（§7 校招与海外支线表）。 */
const P8_TABLES = [
  'campus_application',
  'assessment',
  'talk_session',
  'tripartite',
  'visa_requirement',
  'cover_letter',
] as const

/** job 上的三个"识别列"：识别不出来就留 NULL（schema 注释：猜一个值比留空更糟）。 */
const JOB_BRANCH_COLUMNS = ['campus_batch', 'remote_kind', 'visa_stance'] as const

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p8-1',
    title: '2026 届校招 · 前端工程师',
    companyId: null,
    salaryRaw: '15-25K',
    salaryMin: 15000,
    salaryMax: 25000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '应届生',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/p8-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。任职要求：熟悉 react。',
    ...overrides,
  }
}

function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): number {
  const company = store.company.ensure({ name: '腾讯科技（深圳）有限公司', nameNorm: '腾讯科技' }, T)
  return store.job.upsert({ ...jobInput(overrides), companyId: company.id }, T).id
}

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

/** 故意传非法值：要验证白名单真的拦得住，所以显式绕过类型系统。 */
function bogus<T>(value: string): T {
  return value as unknown as T
}

// ─────────────────────────────────────────────────────────────────────
// 迁移：P8 的表与识别列必须真的建出来
// ─────────────────────────────────────────────────────────────────────

test('P8 的六张支线表与 job 的三个识别列都建出来了，库停在迁移清单的最高版本', async () => {
  await withStore((store) => {
    assert.equal(
      currentVersion(store.db),
      MIGRATIONS.at(-1)?.version,
      '库里记的版本必须是迁移清单的最高版本（不写死版本号：迁移只追加）',
    )
    for (const table of P8_TABLES) {
      assert.ok(
        MIGRATIONS.some((migration) => migration.sql.includes(`CREATE TABLE ${table}`)),
        `迁移清单里没有建 ${table}`,
      )
    }
    for (const column of JOB_BRANCH_COLUMNS) {
      assert.ok(
        MIGRATIONS.some((migration) => migration.sql.includes(`ALTER TABLE job ADD COLUMN ${column}`)),
        `迁移清单里没有给 job 加 ${column}`,
      )
    }

    const tableNames = new Set(
      (store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    )
    for (const table of P8_TABLES) assert.ok(tableNames.has(table), `库里没有 ${table}`)

    const jobColumns = new Set(
      (store.db.prepare('PRAGMA table_info(job)').all() as Array<{ name: string }>).map((row) => row.name),
    )
    for (const column of JOB_BRANCH_COLUMNS) assert.ok(jobColumns.has(column), `job 表没有 ${column} 列`)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 状态变更必须留事件
// ─────────────────────────────────────────────────────────────────────

test('create 写一条 fromStage=null → intent 的事件，advance 再写一条完整的 from/to', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const application = campus.create({ batch: 'autumn' })

    assert.equal(application.stage, 'intent', '新建校招记录从"意向"开始（§12.7）')
    assert.equal(application.batch, 'autumn')

    const afterCreate = store.pipeline.listStageEvents('campus', application.id)
    assert.equal(afterCreate.length, 1, '建档本身就是一次状态变更，必须留痕')
    assert.equal(afterCreate[0]?.entity, 'campus')
    assert.equal(afterCreate[0]?.entityId, application.id)
    assert.equal(afterCreate[0]?.fromStage, null, '新建记录没有"上一个状态"')
    assert.equal(afterCreate[0]?.toStage, 'intent')
    assert.equal(afterCreate[0]?.source, 'manual', '界面发起的动作记成"人工"')

    const advanced = campus.advance(application.id, 'applied', { note: '官网投了前端岗' })
    assert.equal(advanced.stage, 'applied')

    const events = store.pipeline.listStageEvents('campus', application.id)
    assert.equal(events.length, 2)
    // 最新一条在前
    assert.equal(events[0]?.fromStage, 'intent')
    assert.equal(events[0]?.toStage, 'applied')
    assert.equal(events[0]?.source, 'manual')
    assert.equal(events[0]?.note, '官网投了前端岗', '推进的原因要留在事件里')
    assert.equal(events[1]?.toStage, 'intent')
  })
})

test('回退校招状态必须显式带 allowBackward：不带就拒（不改数据、不留事件），带了才改', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const application = campus.create({})
    campus.advance(application.id, 'interviewing')

    assert.throws(
      () => campus.advance(application.id, 'applied'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        // 提示要告诉用户"怎么才能回退"，而不只是"不行"
        assert.ok((error.hint ?? '').includes('allowBackward'), `提示不可操作：${String(error.hint)}`)
        assert.equal(error.detail?.['from'], 'interviewing')
        assert.equal(error.detail?.['to'], 'applied')
        return true
      },
      '把"面试中"点回"已网申"属于回退，必须显式确认 —— 三方协议那类不可逆节点尤其不该被随手改回去',
    )
    assert.equal(campus.get(application.id).stage, 'interviewing', '被拒的回退不该改数据')
    assert.equal(
      store.pipeline.listStageEvents('campus', application.id).length,
      2,
      '被拒的回退不该留事件',
    )

    const backward = campus.advance(application.id, 'applied', { allowBackward: true, note: '岗位重开，从头再走' })
    assert.equal(backward.stage, 'applied')
    const events = store.pipeline.listStageEvents('campus', application.id)
    assert.equal(events[0]?.fromStage, 'interviewing')
    assert.equal(events[0]?.toStage, 'applied')
    assert.equal(events[0]?.note, '岗位重开，从头再走')
  })
})

test('非法批次与非法校招状态都被白名单拦下，并列出合法取值', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    assert.throws(
      () => campus.create({ batch: bogus<CampusBatch>('autumn_2026') }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('autumn_2026'), `报错要点出非法值：${error.message}`)
        for (const batch of CAMPUS_BATCHES) {
          assert.ok((error.hint ?? '').includes(batch), `提示要列出合法取值 ${batch}：${String(error.hint)}`)
        }
        return true
      },
      '非法批次要被拦下，且提示要能照着改',
    )

    const application = campus.create({})
    assert.throws(
      () => campus.advance(application.id, bogus<CampusStage>('pending')),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('pending'))
        for (const stage of CAMPUS_STAGES) {
          assert.ok((error.hint ?? '').includes(stage), `提示要列出合法取值 ${stage}：${String(error.hint)}`)
        }
        return true
      },
    )
    assert.equal(campus.get(application.id).stage, 'intent', '非法输入不该改数据')
    assert.equal(store.pipeline.listStageEvents('campus', application.id).length, 1)

    assert.throws(
      () => campus.get(9999),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
    assert.throws(
      () => campus.advance(9999, 'applied'),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// 笔试/测评：硬截止（L3）
// ─────────────────────────────────────────────────────────────────────

test('addAssessment 必须有 dueAt：没有就报可读错误，并说清"没有截止时间=做不出提醒"', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    const check = (input: Parameters<typeof campus.addAssessment>[0]): void => {
      assert.throws(
        () => campus.addAssessment(input),
        (error: unknown) => {
          assert.ok(error instanceof DomainError)
          assert.equal(error.code, 'INVALID_INPUT')
          assert.ok(error.message.includes('dueAt'), `报错要点出缺的字段：${error.message}`)
          assert.ok(
            (error.hint ?? '').includes('错过'),
            `提示要说清为什么（错过就出局）：${String(error.hint)}`,
          )
          assert.ok(
            (error.hint ?? '').includes('提醒'),
            `提示要说清这条记录是干嘛的（没有截止时间做不出提醒）：${String(error.hint)}`,
          )
          return true
        },
        '笔试截止是整条支线的核心：没有截止时间的测评等于没有提醒',
      )
    }

    check({ kind: 'written' })
    check({ dueAt: null })
    check({ dueAt: '' })
    assert.equal(campus.listAssessments().length, 0, '被拒的测评不该落库')
  })
})

test('给"已网申"的校招记录建测评：自动推进到待笔试，并留一条 source=auto 的事件', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const application = campus.create({ batch: 'autumn' })
    campus.advance(application.id, 'applied')

    const assessment = campus.addAssessment({
      campusApplicationId: application.id,
      platform: '牛客',
      kind: 'written',
      dueAt: at(24),
      durationMin: 90,
    })

    assert.equal(campus.get(application.id).stage, 'assessment_pending', '建档即推进到"待笔试"')
    const events = store.pipeline.listStageEvents('campus', application.id)
    assert.equal(events[0]?.fromStage, 'applied')
    assert.equal(events[0]?.toStage, 'assessment_pending')
    assert.equal(events[0]?.source, 'auto', '这一步是人建记录触发的，不是人工点状态 —— 来源要如实记')
    assert.equal(events[0]?.evidenceRef, `assessment:${String(assessment.id)}`, '要能追到是哪条测评把它推过去的')
    assert.equal(assessment.state, 'pending')
    assert.equal(assessment.hoursLeft, 24)
    assert.equal(assessment.durationMin, 90)
  })
})

test('还没网申（意向）时建测评不会跳过"已网申"这一格', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const application = campus.create({})
    campus.addAssessment({ campusApplicationId: application.id, dueAt: at(24) })

    assert.equal(
      campus.get(application.id).stage,
      'intent',
      '§12.7 的顺序是 意向 → 已网申 → 待笔试，自动推进不能越过"已网申"',
    )
    assert.equal(store.pipeline.listStageEvents('campus', application.id).length, 1, '没有推进就不该多出事件')
  })
})

test('setAssessmentState(done) 把校招记录推进到已笔试；missed 是终态，绝不推进（§12.7）', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    const doneApp = campus.create({})
    campus.advance(doneApp.id, 'applied')
    const done = campus.addAssessment({ campusApplicationId: doneApp.id, dueAt: at(24), kind: 'aptitude' })
    campus.setAssessmentState(done.id, 'done', '82 分')
    assert.equal(campus.get(doneApp.id).stage, 'assessment_done', '做完了才谈得上"已笔试"')
    assert.equal(campus.listAssessments({ state: 'done' })[0]?.result, '82 分')

    const missedApp = campus.create({})
    campus.advance(missedApp.id, 'applied')
    const missed = campus.addAssessment({ campusApplicationId: missedApp.id, dueAt: at(24) })
    const afterMissed = campus.setAssessmentState(missed.id, 'missed')

    assert.equal(afterMissed.state, 'missed')
    assert.equal(
      campus.get(missedApp.id).stage,
      'assessment_pending',
      '错过的笔试是**终态**不是进度：不得把校招记录推进到"已笔试"（§12.7）',
    )
    assert.equal(
      campus.listAssessments({ state: 'missed' }).length,
      1,
      '"错过"必须留下一条可查的记录，不能默默消失',
    )

    assert.throws(
      () => campus.setAssessmentState(missed.id, bogus<AssessmentState>('unknown')),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('不支持的测评状态'), `报错要说清是哪类取值不对：${error.message}`)
        assert.ok(error.message.includes('unknown'))
        return true
      },
      `测评状态是白名单：${ASSESSMENT_STATES.join(' / ')}`,
    )
    assert.throws(
      () => campus.setAssessmentState(9999, 'done'),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// 硬截止汇总 —— 这个服务最重要的方法
// ─────────────────────────────────────────────────────────────────────

test('deadlines()：笔试/网申/三方三类硬截止按到期升序，hoursLeft/urgent/overdue 都算对', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    const intent = campus.create({ batch: 'autumn', applyCloseAt: at(48) })
    const overdueAssessment = campus.addAssessment({ dueAt: at(-5), platform: '牛客', kind: 'written' })
    const tripartite = campus.addTripartite({ signDeadline: at(5) })
    const urgentAssessment = campus.addAssessment({ dueAt: at(10), kind: 'personality' })
    const edgeUrgent = campus.addAssessment({ dueAt: at(URGENT_WITHIN_HOURS) })
    const justOver = campus.addAssessment({ dueAt: at(URGENT_WITHIN_HOURS + 1) })
    const laterAssessment = campus.addAssessment({ dueAt: at(30), kind: 'video' })

    const deadlines = campus.deadlines()
    assert.deepEqual(
      deadlines.map((deadline) => deadline.refId),
      [
        overdueAssessment.id,
        tripartite.id,
        urgentAssessment.id,
        edgeUrgent.id,
        justOver.id,
        laterAssessment.id,
        intent.id,
      ],
      '三类节点混在一张表里，只有"按到期时间升序"才排得出今天该先干哪件',
    )
    assert.deepEqual(
      deadlines.map((deadline) => deadline.kind),
      ['assessment', 'tripartite', 'assessment', 'assessment', 'assessment', 'assessment', 'apply-close'],
    )
    assert.deepEqual(
      deadlines.map((deadline) => deadline.dueAt),
      [at(-5), at(5), at(10), at(URGENT_WITHIN_HOURS), at(URGENT_WITHIN_HOURS + 1), at(30), at(48)],
      '排序必须真的按 dueAt 升序',
    )
    assert.deepEqual(
      deadlines.map((deadline) => deadline.hoursLeft),
      [-5, 5, 10, URGENT_WITHIN_HOURS, URGENT_WITHIN_HOURS + 1, 30, 48],
      'hoursLeft 是"距现在多少小时"，负数表示已过期',
    )
    assert.deepEqual(
      deadlines.map((deadline) => deadline.urgent),
      [true, true, true, true, false, false, false],
      `正好卡在紧急线（${URGENT_WITHIN_HOURS} 小时）上算紧急，过线一小时就不算 —— 动不动就报警等于不报警`,
    )
    assert.deepEqual(
      deadlines.map((deadline) => deadline.overdue),
      [true, false, false, false, false, false, false],
    )
    assert.ok(
      deadlines.every((deadline) => deadline.irreversible),
      '这三类都是"错过即出局/等一年"，irreversible 必须全为 true',
    )
    assert.ok(justOver.hoursLeft !== null)
    assert.ok(
      justOver.hoursLeft > URGENT_WITHIN_HOURS && justOver.hoursLeft <= WARN_WITHIN_HOURS,
      `刚过紧急线但还在"要提醒"的区间（${URGENT_WITHIN_HOURS}-${WARN_WITHIN_HOURS} 小时）`,
    )
    assert.ok(
      laterAssessment.hoursLeft !== null && laterAssessment.hoursLeft > URGENT_WITHIN_HOURS,
      '过了紧急线就不再当 urgent 处理',
    )

    assert.deepEqual(
      campus.overdue().map((deadline) => deadline.refId),
      [overdueAssessment.id],
      'overdue() 只挑已经错过的',
    )
  })
})

test('deadlines() 排除已处理/已终态的节点：done/missed 测评、closed/rejected 校招、已签/违约三方', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    const doneAssessment = campus.addAssessment({ dueAt: at(2) })
    campus.setAssessmentState(doneAssessment.id, 'done')
    const missedAssessment = campus.addAssessment({ dueAt: at(3) })
    campus.setAssessmentState(missedAssessment.id, 'missed')

    const closed = campus.create({ batch: 'autumn', applyCloseAt: at(4) })
    campus.advance(closed.id, 'closed')
    const rejected = campus.create({ batch: 'spring', applyCloseAt: at(6) })
    campus.advance(rejected.id, 'rejected')

    const signed = campus.addTripartite({ signDeadline: at(7) })
    campus.setTripartiteState(signed.id, 'signed')
    const breached = campus.addTripartite({ signDeadline: at(8) })
    campus.setTripartiteState(breached.id, 'breached')

    assert.deepEqual(
      campus.deadlines(),
      [],
      '已经做完/已经错过/已经结束的节点都不该再出现在"再不做就来不及"的列表里',
    )
    assert.deepEqual(campus.overdue(), [])
  })
})

test('deadlines() 只看网申还没截止的窗口；没有 applyCloseAt 的记录不产生节点', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const withClose = campus.create({ batch: 'autumn', applyCloseAt: at(60) })
    campus.create({ batch: 'autumn' })
    campus.create({ batch: 'spring', applyCloseAt: null })

    const deadlines = campus.deadlines()
    assert.deepEqual(
      deadlines.map((deadline) => deadline.refId),
      [withClose.id],
      '没写网申截止时间的记录做不出提醒，也不该凭空造一个',
    )
    assert.equal(deadlines[0]?.kind, 'apply-close')
    assert.equal(deadlines[0]?.hoursLeft, 60)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 时间窗（L1）
// ─────────────────────────────────────────────────────────────────────

test('windows()：按批次统计在办数量与"还开着的"最近一次网申截止', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })

    campus.create({ batch: 'autumn', applyCloseAt: at(100) })
    campus.create({ batch: 'autumn', applyCloseAt: at(-10) })
    const spring = campus.create({ batch: 'spring', applyCloseAt: at(50) })
    campus.advance(spring.id, 'applied', { note: '已经投了，但窗口还没关' })
    campus.create({ batch: 'spring' })

    const windows = campus.windows()
    assert.deepEqual(
      windows.map((window) => window.batch),
      [...CAMPUS_BATCHES],
      '批次清单就是枚举本身，不能因为某批没数据就不显示',
    )

    const autumn = windows.find((window) => window.batch === 'autumn')
    assert.equal(autumn?.count, 2)
    assert.equal(autumn?.openCount, 2, '还在"意向"的才算待网申')
    assert.equal(autumn?.nextCloseAt, at(100), '已经过去的截止时间不算"下一次"')

    const springWindow = windows.find((window) => window.batch === 'spring')
    assert.equal(springWindow?.count, 2)
    assert.equal(springWindow?.openCount, 1, '已网申的那条不再计入待网申')
    assert.equal(springWindow?.nextCloseAt, at(50), '窗口还没关就仍然要提醒')

    const other = windows.find((window) => window.batch === 'other')
    assert.equal(other?.count, 0)
    assert.equal(other?.nextCloseAt, null, '没有数据时给 null，不要编一个时间')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 宣讲会（L4）与三方协议（L5，不可逆）
// ─────────────────────────────────────────────────────────────────────

test('addTalkSession / listTalkSessions：按时间升序，带上公司名', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const company = store.company.ensure({ name: '腾讯科技（深圳）有限公司', nameNorm: '腾讯科技' }, T)

    const later = campus.addTalkSession({
      companyId: company.id,
      at: at(48),
      place: '深大科技楼',
      online: false,
      worthGoing: '值得去：现场收简历',
    })
    const earlier = campus.addTalkSession({
      at: at(24),
      online: true,
      url: 'https://example.com/talk',
      note: '线上宣讲',
    })

    const list = campus.listTalkSessions()
    assert.deepEqual(
      list.map((session) => session.id),
      [earlier.id, later.id],
      '宣讲会日历要按时间顺序排',
    )
    assert.equal(list[0]?.companyName, null, '没填公司就留 null，不猜')
    assert.equal(list[0]?.online, true)
    assert.equal(list[0]?.url, 'https://example.com/talk')
    assert.equal(list[1]?.companyName, '腾讯科技（深圳）有限公司')
    assert.equal(list[1]?.worthGoing, '值得去：现场收简历')
  })
})

test('addTripartite 把校招记录推到"待发三方"；setTripartiteState(signed) 推到"已签三方"，非法状态被拦', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const application = campus.create({ batch: 'autumn' })
    campus.advance(application.id, 'final')

    const tripartite = campus.addTripartite({
      campusApplicationId: application.id,
      issuedAt: at(1),
      signDeadline: at(72),
      penaltySummary: '违约金 5000 元',
    })
    assert.equal(tripartite.state, 'pending')
    assert.equal(tripartite.penaltySummary, '违约金 5000 元', '违约代价必须在记录里，签署前才看得到')
    assert.equal(
      campus.get(application.id).stage,
      'tripartite_pending',
      '发了三方就该在显著位置标成"待发三方"（L5：签署前后必须显著区分）',
    )

    const signed = campus.setTripartiteState(tripartite.id, 'signed')
    assert.equal(signed.state, 'signed')
    assert.equal(campus.get(application.id).stage, 'tripartite_signed')

    assert.throws(
      () => campus.setTripartiteState(tripartite.id, bogus<TripartiteState>('unknown')),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('三方状态'), `报错要说清是哪类状态：${error.message}`)
        assert.ok(error.message.includes('unknown'))
        return true
      },
      `三方状态是白名单：${TRIPARTITE_STATES.join(' / ')}`,
    )
    assert.equal(campus.listTripartite()[0]?.state, 'signed', '非法输入不该改数据')

    assert.throws(
      () => campus.setTripartiteState(9999, 'signed'),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// 列表与装饰
// ─────────────────────────────────────────────────────────────────────

test('list()：带出公司与岗位标题，并按批次/状态筛得动', async () => {
  await withStore((store) => {
    const campus = createCampusService({ store, clock: () => T })
    const jobId = seedJob(store)
    const company = store.company.ensure({ name: '字节跳动', nameNorm: '字节跳动' }, T)

    const linked = campus.create({ companyId: company.id, jobId, batch: 'autumn' })
    campus.create({ batch: 'spring' })

    const autumn = campus.list({ batch: 'autumn' })
    assert.equal(autumn.length, 1)
    assert.equal(autumn[0]?.id, linked.id)
    assert.equal(autumn[0]?.companyName, '字节跳动', '列表要能直接显示投的是哪家')
    assert.equal(autumn[0]?.jobTitle, '2026 届校招 · 前端工程师')
    assert.deepEqual(autumn[0]?.assessments, [])

    assert.equal(campus.list({ stage: 'intent' }).length, 2)
    assert.equal(campus.list({ stage: 'applied' }).length, 0)
    assert.equal(campus.list({ companyId: company.id }).length, 1)
  })
})

test('校招记录的测评列表带 hoursLeft，并随固定时钟走', async () => {
  await withStore((store) => {
    let now = T
    const campus = createCampusService({ store, clock: () => now })
    const application = campus.create({})
    campus.addAssessment({ campusApplicationId: application.id, dueAt: at(24), platform: '牛客' })

    assert.equal(campus.get(application.id).assessments[0]?.hoursLeft, 24)

    now = at(20)
    assert.equal(campus.get(application.id).assessments[0]?.hoursLeft, 4, '倒计时必须跟着当前时间走')
    assert.equal(campus.listAssessments({ campusApplicationId: application.id })[0]?.hoursLeft, 4)
  })
})
