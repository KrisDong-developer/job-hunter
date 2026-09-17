/** 空 weekdays 视为每天。 */
function effectiveWeekdays(schedule) {
    return schedule.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : schedule.weekdays;
}
/** `from` 之后的下一个触发时刻；`jitter` 直接加到结果上。 */
export function nextRunAt(schedule, from, jitterMs = 0) {
    const weekdays = effectiveWeekdays(schedule);
    for (let offset = 0; offset <= 8; offset += 1) {
        const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, schedule.hour, schedule.minute, 0, 0);
        if (!weekdays.includes(candidate.getDay()))
            continue;
        if (candidate.getTime() <= from.getTime())
            continue;
        return new Date(candidate.getTime() + jitterMs);
    }
    // 八天内必有匹配的工作日，这里只是兜底
    return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}
/** `now` 之前最近的那个理论触发时刻（可能就在今天）。 */
export function previousRunAt(schedule, now) {
    const weekdays = effectiveWeekdays(schedule);
    for (let offset = 0; offset <= 8; offset += 1) {
        const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, schedule.hour, schedule.minute, 0, 0);
        if (!weekdays.includes(candidate.getDay()))
            continue;
        if (candidate.getTime() > now.getTime())
            continue;
        return candidate;
    }
    return null;
}
/**
 * 启动时判断「这一轮是不是被错过了」（C9 / §4.6）。
 *
 * 两条都要成立才算错过：
 *   1. 距上次运行已经超过 `missedGraceMs`；
 *   2. 期间**确实有一个**理论触发点。
 *
 * 第 2 条很关键：新装的方案 `last_run_at` 是空的，如果只按第 1 条判断，
 * 每次开机都会弹一个「要不要补跑」—— 那是骚扰，不是提醒。
 * 从没跑过的方案就等下一个触发点，不补跑。
 */
export function missedRun(schedule, lastRunAt, now) {
    if (lastRunAt === null)
        return { missed: false, expectedAt: previousRunAt(schedule, now) };
    const last = new Date(lastRunAt);
    if (Number.isNaN(last.getTime()))
        return { missed: false, expectedAt: previousRunAt(schedule, now) };
    const expected = previousRunAt(schedule, now);
    if (expected === null)
        return { missed: false, expectedAt: null };
    const overdue = now.getTime() - last.getTime() > schedule.missedGraceMs;
    const skippedOne = last.getTime() < expected.getTime();
    return { missed: overdue && skippedOne, expectedAt: expected };
}
/** 抖动：把准点整点打散，避免每天同一秒打同一个接口。 */
export function jitterFor(schedule, random = Math.random) {
    if (schedule.jitterMs <= 0)
        return 0;
    return Math.round(random() * schedule.jitterMs);
}
//# sourceMappingURL=schedule.js.map