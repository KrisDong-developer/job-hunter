/**
 * 触达域路由：`POST /jobs/:id/greeting/draft`（生成话术）、`POST /greeting/send`（发送，两段式确认）、
 * `POST /inbox/sync`（同步收件箱）、`POST /jobs/:id/detect-stage`（探测接触阶段）、
 * `POST /jobs/:id/contact-stage`（**人工标记**接触态）、`GET /greetings`（打招呼记录）、
 * `GET|POST /greeting/templates`（话术模板）。
 *
 * 归属规则：`/jobs/:id/greeting/draft`、`/jobs/:id/detect-stage` 与 `/jobs/:id/contact-stage`
 * 虽然挂在 `/jobs` 前缀下，但按**行为**归属在本模块 —— 它们调用的是
 * `runtime.draftGreeting` / `runtime.probeContactStage` / `runtime.pipeline().advanceContact`，
 * 而不是 jobs.ts 里的岗位读写。
 */
import { dataNotReady } from '../../runtime/contract.js'
import { CONTACT_STAGES, MANUAL_CONTACT_STAGES } from '../../../shared/enums.js'
import type { ContactStage, ManualContactStage } from '../../../shared/enums.js'
import { TONE_LABEL } from '../../../shared/labels.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 原 router.ts L1111-1135。 */
export async function greetingDraft(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // ── 打招呼话术与发送（P5）──────────────────────────────────────────
  // 生成是低危的；发送是高危的，`POST /greeting/send` 第一次会返回 409 + 确认文案，
  // 用户确认后带 `confirm: true` 重发。模型工具走的是同一道闸门（只是"问"的方式不同）。
  if (segments.length >= 2 && segments[0] === 'jobs' && segments[2] === 'greeting' && segments[3] === 'draft') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '生成话术只支持 POST')
    requireData(runtime)
    const id = Number.parseInt(segments[1] ?? '', 10)
    if (!Number.isFinite(id)) throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`)
    const body = await readObject(req)
    const tone = body['tone']
    if (tone !== undefined && (typeof tone !== 'string' || !(tone in TONE_LABEL))) {
      throw new DomainError('INVALID_INPUT', 'tone 取值不合法', {
        hint: `合法取值：${Object.keys(TONE_LABEL).join(' / ')}`,
      })
    }
    const highlights = Array.isArray(body['highlights'])
      ? body['highlights'].filter((item): item is string => typeof item === 'string').slice(0, 3)
      : undefined
    const draft = await runtime.draftGreeting({
      jobId: id,
      ...(tone === undefined ? {} : { tone: tone as 'formal' | 'warm' | 'concise' }),
      ...(highlights === undefined ? {} : { highlights }),
    })
    return json(200, { ok: true, draft })
  }

  return undefined
}

/** 原 router.ts L1137-1155。 */
export async function greetingSend(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (segments.length === 2 && segments[0] === 'greeting' && segments[1] === 'send') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '发送打招呼只支持 POST')
    requireData(runtime)
    const body = await readObject(req)
    const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN
    if (!Number.isFinite(jobId) || jobId <= 0) {
      throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
    }
    const text = typeof body['text'] === 'string' && body['text'].trim() !== '' ? body['text'] : undefined
    // `confirm: true` 是**界面上的用户**这一次的确认（两段式 HTTP）。
    // 模型工具没有这条路径 —— 它的确认只能来自 `ctx.approval`。
    const result = await runtime.sendGreeting({
      jobId,
      ...(text === undefined ? {} : { text }),
      actor: 'gui',
      ...(body['confirm'] === true ? { guiConfirmed: true } : {}),
    })
    return json(200, { ok: true, result })
  }

  return undefined
}

/** 原 router.ts L1157-1174。 */
export async function inboxSync(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  /**
   * 同步收件箱（§13 U6）：把平台会话列表读进本地消息表。
   *
   * 低危，所以**没有两段式确认** —— 它不对外发任何东西。仍然经闸门（会开真实页面）。
   */
  if (segments.length === 2 && segments[0] === 'inbox' && segments[1] === 'sync') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '同步收件箱只支持 POST')
    requireData(runtime)
    const body = await readObject(req)
    const platformId = typeof body['platformId'] === 'string' ? body['platformId'].trim() : ''
    if (platformId === '') {
      throw new DomainError('INVALID_INPUT', 'platformId 不能为空', {
        hint: '例如 {"platformId":"zhipin"}。',
      })
    }
    const result = await runtime.syncInbox({ platformId, actor: 'gui' })
    return json(200, { ok: true, result })
  }

  return undefined
}

/** 原 router.ts L1176-1190。 */
export async function detectStage(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  /**
   * 探测某岗位在平台上的**接触阶段**（HR 是否已读/已回）。
   *
   * 低危（只看不发）→ 没有两段式确认，但仍然经闸门（会开真实页面）。
   * ⚠️ **只探测、不改状态**（识别 ≠ 改状态，§4.3）：返回的是平台事实，
   * 要不要据此推进接触态由用户显式决定 —— 误判一次会漏掉一个真在推进的岗位。
   */
  if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'detect-stage') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '探测接触阶段只支持 POST')
    requireData(runtime)
    const id = Number.parseInt(segments[1] ?? '', 10)
    if (!Number.isFinite(id)) throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`)
    const result = await runtime.probeContactStage({ jobId: id, actor: 'gui' })
    return json(200, { ok: true, result })
  }

  return undefined
}

/**
 * `POST /jobs/:id/contact-stage` —— **人工标记**接触态（§12.2）。
 *
 * 为什么必须有这一条：`probeContactStage`（探测）是刻意"只报事实、不改状态"的，
 * 而在此之前**没有任何入口能把结果落成状态** —— `pipeline.advanceContact` 写好了
 * 却零调用。后果不是少一个按钮：接触态永远停在 `greeted`，而
 * `followUpSuggestions()` 的"未读超时 / 已读未回"两条分支分别挂在
 * `delivered` / `read` 上 → **整条跟进链路是空的**。
 *
 * 低危（只写本地库、不碰平台）→ 不过闸门，但过同源校验（`POST` 自动过，见 router.ts）。
 * 每次变更都写一条 `stage_event`（`source='manual'`），所以回退也有痕迹。
 */
export async function contactStageUpdate(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'contact-stage')) {
    return undefined
  }
  requireData(runtime)
  const id = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(id)) throw new DomainError('INVALID_INPUT', `非法岗位 id：${segments[1] ?? ''}`)

  const body = await readObject(req)
  const to = body['to']
  if (typeof to !== 'string' || !(MANUAL_CONTACT_STAGES as readonly string[]).includes(to)) {
    throw new DomainError('INVALID_INPUT', 'to 必须是可手工标记的接触态', {
      hint:
        `合法取值：${MANUAL_CONTACT_STAGES.join(' / ')}。` +
        '「未接触」不在其中 —— 它的含义是"没有打招呼记录"，标不出来。',
    })
  }
  const pipeline = runtime.pipeline()
  const from = pipeline.contactStage(id)
  const greeting = pipeline.advanceContact({
    jobId: id,
    to: to as ManualContactStage,
    source: 'manual',
    ...(typeof body['evidenceRef'] === 'string' && body['evidenceRef'] !== ''
      ? { evidenceRef: body['evidenceRef'] }
      : {}),
    ...(typeof body['note'] === 'string' && body['note'] !== '' ? { note: body['note'] } : {}),
  })
  runtime.events().publish('contact.stage.changed', { jobId: id, from, stage: greeting.stage })
  return json(200, {
    ok: true,
    contactStage: greeting.stage,
    /** 承载这次接触态的那条打招呼记录（§7.0：最新一条即当前接触态）。 */
    greetingId: greeting.id,
    stageAt: greeting.stageAt,
    repliedAt: greeting.repliedAt,
    /** 改之前是什么（界面据此显示"从 X → Y"，回退也看得见）。 */
    previousStage: from,
  })
}

/**
 * `GET /greetings` —— 打招呼记录（D6：说了什么、几点发的、结果如何）。
 *
 * 在它之前，这些事实只以 `stage_event` 的形式散在 `/jobs/:id/history` 里，
 * 拿不到"实际发送内容 + 模板 + 渠道"这张表 —— 于是话术效果对比（D2）没有数据面。
 */
export async function greetings(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'greetings')) return undefined
  requireData(runtime)

  const jobId = Number.parseInt(req.query.get('jobId') ?? '', 10)
  const stageRaw = req.query.get('stage')
  if (stageRaw !== null && stageRaw !== '' && !(CONTACT_STAGES as readonly string[]).includes(stageRaw)) {
    throw new DomainError('INVALID_INPUT', `非法接触态：${stageRaw}`, {
      hint: `合法取值：${CONTACT_STAGES.join(' / ')}`,
    })
  }
  return json(200, {
    items: runtime.pipeline().listGreetings({
      ...(Number.isFinite(jobId) ? { jobId } : {}),
      ...(stageRaw === null || stageRaw === '' ? {} : { stage: stageRaw as ContactStage }),
      limit: parsePositiveInt(req.query.get('limit'), 50, 1, 200),
    }),
  })
}

/** 原 router.ts L1908-1941。 */
export async function greetingTemplates(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // 话术模板（§11.3 `GreetingTemplate`）
  if (segments.length >= 1 && segments[0] === 'greeting' && segments[1] === 'templates') {
    requireData(runtime)
    const store = runtime.store()
    if (store === undefined) throw dataNotReady(runtime)
    if (method === 'GET') {
      return json(200, {
        items: store.pipeline.listTemplates().map((template) => ({
          ...template,
          // 回复率：次数太少时不给百分比（与 analytics 同一条原则）
          replyRate: template.uses === 0 ? null : template.replies / template.uses,
        })),
      })
    }
    if (method === 'POST') {
      const body = await readObject(req)
      if (typeof body['name'] !== 'string' || typeof body['body'] !== 'string') {
        throw new DomainError('INVALID_INPUT', 'name 与 body 都必填')
      }
      const template = store.pipeline.upsertTemplate(
        {
          ...(typeof body['id'] === 'number' ? { id: body['id'] } : {}),
          name: body['name'],
          body: body['body'],
          ...(Array.isArray(body['vars'])
            ? { vars: body['vars'].filter((item): item is string => typeof item === 'string') }
            : {}),
          ...(typeof body['scene'] === 'string' ? { scene: body['scene'] } : {}),
        },
        new Date().toISOString(),
      )
      return json(201, { ok: true, template })
    }
  }

  return undefined
}
