/**
 * 情报引擎（intel 域）的路由（P4）：词表读写与重算。
 *
 * 两条路径都在 `/intel` 前缀下、第二段是字面量（`dictionary` / `recompute`）：
 * `dictionary` 内部再按 GET / POST 分派；`recompute` 只接 POST，且是单次有上限的重算。
 */
import { dataNotReady } from '../../runtime/contract.js';
import { PAGE_SIZE_MAX } from '../../../shared/config/limits.js';
import { DomainError } from '../../util/errors.js';
import { DICTIONARY_KINDS } from '../../store/repo/dictionary.js';
import { json, readObject, requireData } from './kit.js';
// ── 情报引擎：词表与重算（P4）──────────────────────────────────────
export async function dictionary(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(segments.length === 2 && segments[0] === 'intel' && segments[1] === 'dictionary')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    if (method === 'GET') {
        return json(200, { items: store.dictionary.list() });
    }
    if (method === 'POST') {
        const body = await readObject(req);
        const kind = body['kind'];
        const term = body['term'];
        if (typeof kind !== 'string' || !DICTIONARY_KINDS.includes(kind)) {
            throw new DomainError('INVALID_INPUT', 'kind 必须是合法的词表类别', {
                hint: `合法取值：${DICTIONARY_KINDS.join(' / ')}`,
            });
        }
        if (typeof term !== 'string' || term.trim() === '') {
            throw new DomainError('INVALID_INPUT', 'term 不能为空');
        }
        store.dictionary.upsert({
            kind: kind,
            term: term.trim(),
            ...(typeof body['meaning'] === 'string' ? { meaning: body['meaning'] } : {}),
            ...(typeof body['weight'] === 'number' ? { weight: body['weight'] } : {}),
            ...(typeof body['enabled'] === 'boolean' ? { enabled: body['enabled'] } : {}),
        });
        return json(200, { ok: true, items: store.dictionary.list() });
    }
}
/**
 * POST /intel/recompute —— 重算标注与匹配分。
 *
 * 两种范围（第五轮，批次 A2 增加的第二种）：
 *   * `latest`（默认，行为不变）：最近 `PAGE_SIZE_MAX` 条岗位 —— 首次建库、
 *     词表大改之后想刷新一遍时用。
 *   * `stale`：**只重算分数已过期的岗位**（有分，但算分时的简历版本与当前启用简历不一致）。
 *     换了一份简历之后，库里成百上千条分数全部作废；没有这个范围，用户只能等下一轮
 *     抓取把它们逐条刷回来（抓取只覆盖"这一轮见到的"），于是"按匹配分排序"会长期
 *     排在一堆旧分上。它每次也最多 `PAGE_SIZE_MAX` 条，并回报**剩余条数**，
 *     界面据此说"还剩 312 条，再点一次继续"，而不是假装一次就修完了。
 */
export async function recompute(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(segments.length === 2 && segments[0] === 'intel' && segments[1] === 'recompute')) {
        return undefined;
    }
    if (method !== 'POST')
        throw new DomainError('INVALID_INPUT', '重算只支持 POST');
    requireData(runtime);
    const store = runtime.store();
    const jobService = runtime.jobs();
    if (store === undefined || jobService === undefined)
        throw dataNotReady(runtime);
    const body = await readObject(req);
    const scope = body['scope'] ?? 'latest';
    if (scope !== 'latest' && scope !== 'stale') {
        throw new DomainError('INVALID_INPUT', `不认识的 scope：${String(scope)}`, {
            hint: '合法取值：latest（最近若干条） / stale（只重算分数过期的）',
        });
    }
    const intel = runtime.intel();
    const now = new Date().toISOString();
    if (scope === 'stale') {
        // 当前启用简历的版本标识（与 `JobDto.scoreStale` 用的是同一个来源）。
        const stamp = store.resume.revision();
        const ids = store.job.listStaleScoreIds(stamp, PAGE_SIZE_MAX);
        for (const id of ids)
            intel.evaluateJob(id, now);
        // 重算完再数一次：可能还有更多（超过单次上限），如实回报剩余量。
        const remaining = store.job.countStaleScores(stamp);
        return json(200, {
            ok: true,
            scope,
            jobs: ids.length,
            remaining,
            note: ids.length === 0
                ? '没有分数过期的岗位'
                : `重算了 ${String(ids.length)} 条过期分数${remaining > 0 ? `，还剩 ${String(remaining)} 条（单次上限 ${String(PAGE_SIZE_MAX)}）` : ''}`,
        });
    }
    let jobs = 0;
    for (const job of jobService.query({}, PAGE_SIZE_MAX, 0)) {
        intel.evaluateJob(job.id, now);
        jobs += 1;
    }
    return json(200, {
        ok: true,
        scope,
        jobs,
        note: `重算了最近 ${String(jobs)} 条岗位（单次上限 ${String(PAGE_SIZE_MAX)}）；超出部分等后续阶段接调度做全量重算`,
    });
}
//# sourceMappingURL=intel.js.map