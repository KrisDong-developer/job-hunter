/** 取最近多少轮做基线。30 轮足够稳，也不会被半年前的老数据绑架。 */
export const YIELD_HISTORY_LIMIT = 30;
/** 少于这么多轮就不下结论。 */
export const YIELD_MIN_SAMPLES = 5;
/** 基线本身小于这个数就不下结论（比例在小编量上没有意义）。 */
export const YIELD_MIN_BASELINE = 5;
/** 低于基线的这个比例即告警。 */
export const YIELD_DROP_RATIO = 0.3;
/** 中位数（不改动入参）。空数组返回 `null` —— 没有中位数可言，不假装是 0。 */
export function medianOf(values) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return sorted[middle] ?? null;
    const left = sorted[middle - 1];
    const right = sorted[middle];
    if (left === undefined || right === undefined)
        return null;
    return (left + right) / 2;
}
/** 从若干轮 `found` 算基线。样本不足时 `baseline` 为 `null`（而不是猜一个 0）。 */
export function baselineFrom(found) {
    const samples = found.length;
    if (samples < YIELD_MIN_SAMPLES)
        return { baseline: null, samples };
    return { baseline: medianOf(found), samples };
}
/**
 * 判定一轮的量级。
 *
 * **0 条也算掉量**：它带着"平时是 20 条"这个上下文，而那正是用户需要的
 * （`crawl.ts` 的 `NO_RECORDS` 说的是"这轮解析出 0 条"，那是**另一件事** ——
 * 它进的是运行记录，不是告警，两者回答的问题不同，不重复）。
 */
export function assessYield(base, current) {
    const { baseline, samples } = base;
    if (baseline === null || baseline < YIELD_MIN_BASELINE) {
        return { level: 'insufficient', reason: null };
    }
    if (current >= baseline * YIELD_DROP_RATIO)
        return { level: 'ok', reason: null };
    return {
        level: 'dropped',
        reason: `本轮只抓到 ${String(current)} 条，而这个平台最近 ${String(samples)} 轮的常态是 ` +
            `${String(baseline)} 条 —— 页面正常、字段也都解析出来了，所以很可能是**量级**出了问题：` +
            '懒加载没触发、翻页静默失效、或卡片容器只匹配到一部分',
    };
}
/** 读某平台近期的量级快照（给 `/platforms` 与诊断用，不发请求、不改状态）。 */
export function readYieldSnapshot(store, platformId) {
    const runs = store.crawlRun.list(YIELD_HISTORY_LIMIT, platformId);
    // 只拿 `ok` 的轮次做基线：`partial`（含隔离/暂停）与 `failed` 的条数
    // 本来就不代表平台给多少，混进来会把基线压低 -> 越坏越不告警。
    const history = runs.filter((run) => run.state === 'ok').map((run) => run.found);
    const base = baselineFrom(history);
    const lastFound = runs[0]?.found ?? null;
    if (lastFound === null)
        return { ...base, lastFound: null, level: 'insufficient' };
    return { ...base, lastFound, level: assessYield(base, lastFound).level };
}
/**
 * 把一轮的量级落成告警 / 关闭过期的告警。
 *
 * 恢复即关闭 —— 与逐字段健康的恢复规则一致：告警挂着不清，用户很快就会
 * 学会无视它，那比没有告警更糟。
 *
 * @param excludeRunId 本轮自己的 run id。**必须排除**：它刚被 `finish` 写进库，
 *   把"掉量的那一轮"算进基线会自己拉低标准（掉得越多越不告警）。
 */
export function applyYieldBaseline(store, platformId, current, now, excludeRunId) {
    const runs = store.crawlRun
        .list(YIELD_HISTORY_LIMIT, platformId)
        .filter((run) => run.id !== excludeRunId);
    const history = runs.filter((run) => run.state === 'ok').map((run) => run.found);
    const base = baselineFrom(history);
    const assessment = assessYield(base, current);
    if (assessment.level === 'dropped') {
        store.todo.createOnce({
            kind: 'yield-drop',
            level: 'warn',
            title: `${platformId} 本轮的岗位数明显偏低`,
            ref: platformId,
            detail: {
                platformId,
                current,
                baseline: base.baseline,
                samples: base.samples,
                ratio: base.baseline === null ? null : current / base.baseline,
                hint: '字段健康可能是全绿的 —— 这类故障查的是**量级**：先看翻页与懒加载，再看卡片容器选择器。',
            },
        }, now);
    }
    else if (assessment.level === 'ok') {
        store.todo.closeByRef('yield-drop', platformId, now);
    }
    return { ...base, lastFound: current, level: assessment.level };
}
/** 待办正文用的人话（`applyYieldBaseline` 里已经拼好，这里给界面复用同一句）。 */
export function yieldReasonOf(snapshot) {
    if (snapshot.baseline === null || snapshot.lastFound === null)
        return null;
    return assessYield({ baseline: snapshot.baseline, samples: snapshot.samples }, snapshot.lastFound).reason;
}
//# sourceMappingURL=yield-baseline.js.map