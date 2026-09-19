import { dataNotReady } from '../../runtime/contract.js';
import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, parseRecordId, readObject, requireData } from './kit.js';
/** `replay_state = 'pending'` 的对外形状。不含 `rawHtml`（本来也没存）。 */
function repairDto(record) {
    return {
        id: record.id,
        platformId: record.platformId,
        crawlRunId: record.crawlRunId,
        capturedAt: record.capturedAt,
        missingFields: record.missingFields,
        raw: record.raw !== null && typeof record.raw === 'object' && !Array.isArray(record.raw)
            ? record.raw
            : null,
        sourceUrl: record.sourceUrl,
    };
}
const REPAIR_NOTE = '这些记录**被字段断言拦下**，所以没有进主表（宁可少一条，不写脏数据）。' +
    '队列里**没有原始 HTML**（§18 默认不存），因此没有"离线重放"这个动作 —— ' +
    '正确顺序是：改这个平台的选择器覆盖 → 重跑一轮抓取 → 确认数据正常 → 清空这一队。';
// ── GET /repairs ───────────────────────────────────────────────────
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'repairs'))
        return undefined;
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const platformId = req.query.get('platformId');
    const scoped = platformId === null || platformId === '' ? undefined : platformId;
    const limit = parsePositiveInt(req.query.get('limit'), 50, 1, 200);
    const body = {
        items: store.repair.listPending(scoped, limit).map(repairDto),
        total: store.repair.countPending(scoped),
        // 按平台汇总：平台行上的角标要能说明"这个平台攒了多少"
        byPlatform: runtime
            .registry()
            .list()
            .map((adapter) => ({ platformId: adapter.id, count: store.repair.countPending(adapter.id) }))
            .filter((entry) => entry.count > 0),
        note: REPAIR_NOTE,
    };
    return json(200, body);
}
// ── POST /repairs/:id/discard ──────────────────────────────────────
export async function discard(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 3 && segments[0] === 'repairs' && segments[2] === 'discard')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const id = parseRecordId(segments[1] ?? null, '待修复');
    // 先看存在性，再丢弃：`discard` 只改 pending 行，两者混淆时错误信息会指向错误的原因
    const record = store.repair.get(id);
    if (record === undefined) {
        throw new DomainError('NOT_FOUND', `待修复记录不存在：${String(id)}`);
    }
    if (!store.repair.discard(id)) {
        throw new DomainError('NOT_FOUND', `待修复记录 #${String(id)} 已经处理过了（状态：${record.replayState}）`);
    }
    runtime.events().publish('repair.discarded', { id, platformId: record.platformId });
    return json(200, { ok: true });
}
// ── POST /repairs/clear ────────────────────────────────────────────
export async function clear(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'repairs' && segments[1] === 'clear')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const body = await readObject(req);
    const platformId = typeof body['platformId'] === 'string' ? body['platformId'].trim() : '';
    if (platformId === '') {
        throw new DomainError('INVALID_INPUT', 'platformId 必填', {
            hint: '清空**按平台**进行：`{"platformId":"51job"}`。' +
                '没有"一键清空全部平台" —— 那会让一次手滑抹掉所有平台的诊断线索，而它并不对应任何真实场景。',
        });
    }
    if (runtime.registry().get(platformId) === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`);
    }
    const cleared = store.repair.clear(platformId);
    runtime.events().publish('repair.cleared', { platformId, cleared });
    return json(200, { ok: true, cleared });
}
//# sourceMappingURL=repairs.js.map