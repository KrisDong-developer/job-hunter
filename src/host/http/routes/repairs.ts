/**
 * 待修复队列（`pending_repair`）的路由：`GET /repairs`、`POST /repairs/:id/discard`、
 * `POST /repairs/clear`。
 *
 * ## 这一屏为什么必须存在（B13 / J2）
 *
 * 字段断言拦下的记录**不进主表**（§4.2.4 铁律：宁可少一条，不写脏数据），
 * 而在此之前它们只以一个数字出现 —— 「今日」「设置」上写着"待修复 20"，
 * 点不进去，看不到坏在哪个字段、样本是哪个岗位。于是"修选择器"这件事没有入口：
 * 用户知道坏了，却不知道坏在哪、也没法确认修好没有。
 *
 * ## 为什么**没有**「重放」这个动作（诚实性说明）
 *
 * `repairs` 表里有 `raw_html` 一列，但 `crawl.ts` 入队时**不传**它
 * （§18：原始页面是体积杀手，默认不存）。没有原始 HTML 就没有"离线重放解析"这种东西，
 * 加一个 `/replay` 端点会是**"没有能力、但有入口"** —— 那正是本仓库明令避免的形态
 * （见 `domain/messages.ts` 里那段被删掉的假 `reply`）。
 *
 * 正确的工作流（ADAPTERS.md §4）：**改选择器覆盖（`PUT /platforms/:id/adapter-config`，热生效）
 * → 重跑一轮抓取（`POST /crawl` 或 `POST /plans/:id/run`）→ 确认新数据正常 → 清空这一队**。
 * 所以这里给的是"看得到 + 能清掉"，而不是一个点下去什么都不会发生的按钮。
 *
 * ## 为什么 `clear` 必须指定平台
 *
 * 「重放完成后清空该平台的队列」是真实的收尾动作（`RepairRepo.clear` 的语义），
 * 而"一键清空全部平台"既不对应任何真实场景，又会让一个手滑抹掉所有平台的诊断线索。
 * 要清多个平台就多按几次 —— 代价远小于一个误触的全局清空。
 */
import type { RepairDto, RepairListDto } from '../../../shared/dto.js'
import type { RepairRecord } from '../../store/repo/repairs.js'
import { dataNotReady } from '../../runtime/contract.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, parseRecordId, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** `replay_state = 'pending'` 的对外形状。不含 `rawHtml`（本来也没存）。 */
function repairDto(record: RepairRecord): RepairDto {
  return {
    id: record.id,
    platformId: record.platformId,
    crawlRunId: record.crawlRunId,
    capturedAt: record.capturedAt,
    missingFields: record.missingFields,
    raw:
      record.raw !== null && typeof record.raw === 'object' && !Array.isArray(record.raw)
        ? (record.raw as Record<string, unknown>)
        : null,
    sourceUrl: record.sourceUrl,
  }
}

const REPAIR_NOTE =
  '这些记录**被字段断言拦下**，所以没有进主表（宁可少一条，不写脏数据）。' +
  '队列里**没有原始 HTML**（§18 默认不存），因此没有"离线重放"这个动作 —— ' +
  '正确顺序是：改这个平台的选择器覆盖 → 重跑一轮抓取 → 确认数据正常 → 清空这一队。'

// ── GET /repairs ───────────────────────────────────────────────────
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'repairs')) return undefined
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const platformId = req.query.get('platformId')
  const scoped = platformId === null || platformId === '' ? undefined : platformId
  const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 200)
  const body: RepairListDto = {
    items: store.repair.listPending(scoped, limit).map(repairDto),
    total: store.repair.countPending(scoped),
    // 按平台汇总：平台行上的角标要能说明"这个平台攒了多少"
    byPlatform: runtime
      .registry()
      .list()
      .map((adapter) => ({ platformId: adapter.id, count: store.repair.countPending(adapter.id) }))
      .filter((entry) => entry.count > 0),
    note: REPAIR_NOTE,
  }
  return json(200, body)
}

// ── POST /repairs/:id/discard ──────────────────────────────────────
export async function discard(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'repairs' && segments[2] === 'discard')) {
    return undefined
  }
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const id = parseRecordId(segments[1] ?? null, '待修复')
  // 先看存在性，再丢弃：`discard` 只改 pending 行，两者混淆时错误信息会指向错误的原因
  const record = store.repair.get(id)
  if (record === undefined) {
    throw new DomainError('NOT_FOUND', `待修复记录不存在：${String(id)}`)
  }
  if (!store.repair.discard(id)) {
    throw new DomainError('NOT_FOUND', `待修复记录 #${String(id)} 已经处理过了（状态：${record.replayState}）`)
  }
  runtime.events().publish('repair.discarded', { id, platformId: record.platformId })
  return json(200, { ok: true })
}

// ── POST /repairs/clear ────────────────────────────────────────────
export async function clear(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'repairs' && segments[1] === 'clear')) {
    return undefined
  }
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const body = await readObject(req)
  const platformId = typeof body['platformId'] === 'string' ? body['platformId'].trim() : ''
  if (platformId === '') {
    throw new DomainError('INVALID_INPUT', 'platformId 必填', {
      hint:
        '清空**按平台**进行：`{"platformId":"51job"}`。' +
        '没有"一键清空全部平台" —— 那会让一次手滑抹掉所有平台的诊断线索，而它并不对应任何真实场景。',
    })
  }
  if (runtime.registry().get(platformId) === undefined) {
    throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`)
  }
  const cleared = store.repair.clear(platformId)
  runtime.events().publish('repair.cleared', { platformId, cleared })
  return json(200, { ok: true, cleared })
}
