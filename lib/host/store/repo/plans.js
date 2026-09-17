import { detectTimezone } from '../../util/time.js';
import { asBool, asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
/**
 * 默认排程（D-19 / SR-1）：**工作日 09:00–11:00 之间随机选点**。
 *
 * 注意这里没有"09:30"这个单点 —— SR-32 明确不提供"精确到分钟的单点时刻"。
 * 旧的"固定时刻"配置在 `normalizeSchedule` 里被翻译成等价的 1 小时窗口，
 * 所以历史数据不会失效，只是语义升级了。
 */
export const DEFAULT_SCHEDULE = {
    enabled: true,
    windowStartHour: 9,
    windowStartMinute: 0,
    windowEndHour: 11,
    windowEndMinute: 0,
    weekdays: [1, 2, 3, 4, 5],
    jitterMs: 40 * 60 * 1000,
    missedGraceMs: 6 * 60 * 60 * 1000,
};
/** SR-44：抓取后处理默认**全开** —— 默认行为不变是升级的底线。 */
export const DEFAULT_POST_PROCESS = { score: true, flag: true, dedup: true };
/**
 * 本机时区名（SR-5：存本地墙钟 + 时区快照）。
 *
 * 实现搬到了 `util/time.ts`（调度器也要用它），这里转出去让既有调用方不用改。
 */
export { detectTimezone };
/** 一天 24 小时的分钟表示，用来比较窗口边界。 */
function minuteOfDay(hour, minute) {
    return hour * 60 + minute;
}
export function normalizeSchedule(patch, base = DEFAULT_SCHEDULE) {
    const merged = { ...base, ...(patch ?? {}) };
    const clamp = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, Math.trunc(value)))
        : fallback;
    const hasWindowField = patch !== undefined &&
        (patch.windowStartHour !== undefined ||
            patch.windowEndHour !== undefined ||
            patch.windowStartMinute !== undefined ||
            patch.windowEndMinute !== undefined);
    let startHour = clamp(merged['windowStartHour'], 0, 23, base.windowStartHour);
    let startMinute = clamp(merged['windowStartMinute'], 0, 59, base.windowStartMinute);
    let endHour = clamp(merged['windowEndHour'], 0, 23, base.windowEndHour);
    let endMinute = clamp(merged['windowEndMinute'], 0, 59, base.windowEndMinute);
    // 旧形状（或显式给了 hour/minute 而没给窗口）→ 等价的 1 小时窗口
    const legacy = merged['hour'];
    if (!hasWindowField && typeof legacy === 'number' && Number.isFinite(legacy)) {
        startHour = clamp(legacy, 0, 23, base.windowStartHour);
        startMinute = clamp(merged['minute'], 0, 59, 0);
        const endTotal = minuteOfDay(startHour, startMinute) + 60;
        endHour = Math.floor((endTotal % (24 * 60)) / 60);
        endMinute = endTotal % 60;
    }
    // 零长度窗口 = 永不触发。用户不会以为自己配了个永不触发的东西，所以纠正成 1 小时。
    if (minuteOfDay(startHour, startMinute) === minuteOfDay(endHour, endMinute)) {
        endHour = (startHour + 1) % 24;
        endMinute = startMinute;
    }
    const weekdays = Array.isArray(merged['weekdays'])
        ? [
            ...new Set(merged['weekdays'].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
        ].sort((a, b) => a - b)
        : base.weekdays;
    const jitterMs = clamp(merged['jitterMs'], 0, 60 * 60 * 1000, base.jitterMs);
    const missedGraceMs = clamp(merged['missedGraceMs'], 0, 7 * 24 * 60 * 60 * 1000, base.missedGraceMs);
    return {
        enabled: merged['enabled'] !== false,
        windowStartHour: startHour,
        windowStartMinute: startMinute,
        windowEndHour: endHour,
        windowEndMinute: endMinute,
        weekdays,
        jitterMs,
        missedGraceMs,
    };
}
/** 后处理开关收敛（SR-44）：默认全开，只有显式 `false` 才关。 */
export function normalizePostProcess(patch) {
    return {
        score: patch?.score !== false,
        flag: patch?.flag !== false,
        dedup: patch?.dedup !== false,
    };
}
function toDto(row) {
    const lastRunAt = asTextOrNull(row['last_run_at']);
    // SR-7：新库的 last_success_at 是权威；旧库（迁移前写入的行）回退到 last_run_at，
    // 这样"升级后第一次打开"不会显示成"从来没成功过"。
    const lastSuccessAt = asTextOrNull(row['last_success_at']) ?? lastRunAt;
    const lastAttemptAt = asTextOrNull(row['last_attempt_at']) ?? lastRunAt;
    return {
        id: asInt(row['id']),
        name: asText(row['name']),
        platforms: asJson(row['platforms_json'], []),
        criteria: asJson(row['criteria_json'], {}),
        schedule: normalizeSchedule(asJson(row['schedule_json'], {})),
        enabled: asBool(row['enabled'], true),
        lastAttemptAt,
        lastSuccessAt,
        lastRunAt: lastSuccessAt,
        nextRunAt: asTextOrNull(row['next_run_at']),
        // 没有快照时**真的问一次本机时区**，而不是退回字符串 'UTC' ——
        // 那是假的：排程用的是本地墙钟，显示 UTC 会让用户以为时间算错了。
        timezone: asTextOrNull(row['timezone']) ?? detectTimezone(),
        postProcess: normalizePostProcess(asJson(row['post_process_json'], {})),
        createdAt: asText(row['created_at']),
    };
}
export function createPlanRepo(db) {
    const insert = db.prepare(`INSERT INTO plan (
       name, platforms_json, criteria_json, keywords_json, exclude_json, schedule_json,
       enabled, timezone, post_process_json, created_at
     ) VALUES (?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?)`);
    const selectById = db.prepare('SELECT * FROM plan WHERE id = ?');
    const selectAll = db.prepare('SELECT * FROM plan ORDER BY id');
    const updateStmt = db.prepare(`UPDATE plan SET name = ?, platforms_json = ?, criteria_json = ?, schedule_json = ?,
       enabled = ?, timezone = ?, post_process_json = ? WHERE id = ?`);
    const deleteStmt = db.prepare('DELETE FROM plan WHERE id = ?');
    // last_run_at 与 last_success_at **一起**推进：last_run_at 只是兼容字段，
    // 权威在 last_attempt_at / last_success_at（SR-7）。
    const setTimes = db.prepare(`UPDATE plan SET
       last_run_at = coalesce(?, last_run_at),
       last_attempt_at = coalesce(?, last_attempt_at),
       last_success_at = coalesce(?, last_success_at),
       next_run_at = ?
     WHERE id = ?`);
    const setAttempt = db.prepare(`UPDATE plan SET
       last_attempt_at = coalesce(?, last_attempt_at),
       last_success_at = coalesce(?, last_success_at),
       last_run_at = coalesce(?, last_run_at)
     WHERE id = ?`);
    const setBackoff = db.prepare('UPDATE plan SET fail_streak = coalesce(?, fail_streak), backoff_until = ? WHERE id = ?');
    const setRisk = db.prepare('UPDATE plan SET risk_paused = ?, risk_reason = ? WHERE id = ?');
    const selectEngine = db.prepare('SELECT fail_streak, backoff_until, risk_paused, risk_reason FROM plan WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM plan');
    const require = (id) => {
        const row = selectById.get(id);
        if (row === undefined)
            throw new Error(`plan ${String(id)} 不存在`);
        return toDto(row);
    };
    return {
        create(input, now) {
            const schedule = normalizeSchedule(input.schedule);
            const postProcess = normalizePostProcess(input.postProcess);
            const result = insert.run(input.name, JSON.stringify(input.platforms), JSON.stringify(input.criteria ?? {}), JSON.stringify(schedule), input.enabled === false ? 0 : 1, detectTimezone(), JSON.stringify(postProcess), now);
            return require(asId(result.lastInsertRowid));
        },
        update(id, patch, _now) {
            const current = require(id);
            const schedule = normalizeSchedule(patch.schedule, current.schedule);
            const postProcess = normalizePostProcess({ ...current.postProcess, ...(patch.postProcess ?? {}) });
            updateStmt.run(patch.name ?? current.name, JSON.stringify(patch.platforms ?? current.platforms), JSON.stringify(patch.criteria ?? current.criteria), JSON.stringify(schedule), (patch.enabled ?? current.enabled) ? 1 : 0, current.timezone, JSON.stringify(postProcess), id);
            return require(id);
        },
        get(id) {
            const row = selectById.get(id);
            return row === undefined ? undefined : toDto(row);
        },
        list() {
            return selectAll.all().map(toDto);
        },
        remove(id) {
            return asInt(deleteStmt.run(id).changes) > 0;
        },
        setRunTimes(id, times) {
            const lastRunAt = times.lastRunAt ?? null;
            setTimes.run(lastRunAt, lastRunAt, lastRunAt, times.nextRunAt ?? null, id);
        },
        setEngine(id, patch) {
            if (patch.lastAttemptAt !== undefined || patch.lastSuccessAt !== undefined) {
                setAttempt.run(patch.lastAttemptAt ?? null, patch.lastSuccessAt ?? null, patch.lastSuccessAt ?? null, id);
            }
            if (patch.failStreak !== undefined || patch.backoffUntil !== undefined) {
                setBackoff.run(patch.failStreak ?? null, patch.backoffUntil === undefined ? null : patch.backoffUntil, id);
            }
            if (patch.riskPaused !== undefined || patch.riskReason !== undefined) {
                setRisk.run(patch.riskPaused === true ? 1 : 0, patch.riskReason ?? null, id);
            }
        },
        engineState(id) {
            const row = selectEngine.get(id);
            return {
                failStreak: asInt(row?.['fail_streak']),
                backoffUntil: asTextOrNull(row?.['backoff_until']),
                riskPaused: asBool(row?.['risk_paused'], false),
                riskReason: asTextOrNull(row?.['risk_reason']),
            };
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=plans.js.map