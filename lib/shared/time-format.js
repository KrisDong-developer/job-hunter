/**
 * 时间显示（host 与 client 共用）。
 *
 * 存在的唯一理由：**绝不把裸 UTC 直接印给用户看**。
 *
 * 实测踩过（OPTIMIZATION-PLAN §2.2 第 1 条）：今日屏把 `nextRunAt` 原样打印，
 * 用户看到 `2026-09-18T01:34:08.060Z`，而计划里写的是 09:30（本地）——
 * 第一反应是"排程算错了"，而其实只差一个 `toLocaleString`。
 *
 * 这里不做 i18n 框架：本项目界面是中文，就地写中文格式化。
 * 函数全部是**纯函数且注入 `now`**，所以能离线断言，不依赖真实时间流逝。
 */
/** 两位补零。 */
function pad(value) {
    return String(value).padStart(2, '0');
}
/** 本地墙钟 `HH:MM`。 */
export function formatClock(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 本地日期 `M月D日`。 */
export function formatDay(date) {
    return `${String(date.getMonth() + 1)}月${String(date.getDate())}日`;
}
/** 同一天（按本地日历比较，不是"相差不到 24 小时"）。 */
export function isSameDay(a, b) {
    return (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}
/**
 * 把一段毫秒差写成**人话**。
 *
 * 分档刻意粗：用户要的是"大概多久"，不是"3 小时 17 分 42 秒"。
 * 未来与过去分别是 `还有 …` / `…前`。
 */
export function formatRelative(target, now) {
    const deltaMs = target.getTime() - now.getTime();
    const abs = Math.abs(deltaMs);
    const future = deltaMs >= 0;
    if (abs < 60_000)
        return future ? '马上' : '刚刚';
    const minutes = Math.round(abs / 60_000);
    const text = abs < 60 * 60_000
        ? `${String(minutes)} 分钟`
        : abs < 24 * 60 * 60_000
            ? `${String(Math.floor(abs / (60 * 60_000)))} 小时`
            : `${String(Math.floor(abs / (24 * 60 * 60_000)))} 天`;
    return future ? `还有 ${text}` : `${text}前`;
}
/**
 * 一个时刻的完整体：本地时间 + 相对时间。
 *
 * 三段拼在一起而不是只给一段，是为了让**错的时区自己露出来**：
 * 只有相对时间看不出"算的是哪个时刻"，只有绝对时间又看不出"离现在多远"。
 *
 * @example "今天 09:34 · 还有 1 小时"
 */
export function formatLocalMoment(iso, now, options = {}) {
    if (iso === null || iso === '')
        return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        // 解析不了就**原样返回**，别假装格式化成功 —— 静默吞掉会让排程 bug 更难查
        return iso;
    }
    const day = isSameDay(date, now)
        ? '今天'
        : isSameDay(new Date(now.getTime() + 24 * 60 * 60 * 1000), date)
            ? '明天'
            : isSameDay(new Date(now.getTime() - 24 * 60 * 60 * 1000), date)
                ? '昨天'
                : formatDay(date);
    const absolute = `${day} ${formatClock(date)}`;
    return options.withRelative === false ? absolute : `${absolute} · ${formatRelative(date, now)}`;
}
/** 抖动的说明文案；没有抖动时返回 `null`（不给一句"含 0 分钟抖动"的废话）。 */
export function formatJitter(jitterMs) {
    if (!Number.isFinite(jitterMs) || jitterMs <= 0)
        return null;
    const minutes = Math.round(jitterMs / 60_000);
    return minutes <= 0 ? '含不到 1 分钟抖动' : `含 ${String(minutes)} 分钟抖动`;
}
/** 星期标签（0=周日）。 */
const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** 按索引取星期标签（越界返回 `?` 而不是 undefined）。 */
export function weekdayLabel(day) {
    return WEEKDAY_LABEL[day] ?? '?';
}
/** 把 `weekdays` 写成"每天 / 工作日 / 周一、周三"这类人话。 */
export function formatWeekdays(weekdays) {
    const days = [...new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
    if (days.length === 0 || days.length === 7)
        return '每天';
    if (days.length === 5 && days.every((day, index) => day === index + 1))
        return '工作日';
    return days.map((day) => WEEKDAY_LABEL[day] ?? String(day)).join('、');
}
/** 本地墙钟 `HH:MM`（从 时/分 两个数字，而不是 Date）。 */
export function formatHourMinute(hour, minute) {
    return `${pad(hour)}:${pad(minute)}`;
}
/**
 * 一个"偏好时段"的人话标签。
 *
 * 跨零点（如 22:00–02:00）如实写成 `22:00–次日 02:00` —— 不能把它压成 `22:00–02:00`，
 * 那看起来像一个不存在的负长度区间。
 */
export function formatWindow(startHour, startMinute, endHour, endMinute) {
    const start = formatHourMinute(startHour, startMinute);
    const end = formatHourMinute(endHour, endMinute);
    const overnight = endHour * 60 + endMinute <= startHour * 60 + startMinute;
    return overnight ? `${start}–次日 ${end}` : `${start}–${end}`;
}
/**
 * `时/分` → `<input type="time">` 需要的值（`HH:MM`，24 小时制）。
 *
 * 存在的理由：偏好时段原来是**四个独立的数字框**（起时/起分/止时/止分），
 * 改一个时段要点四次、还得自己想清楚 09 和 00 各填哪里。
 * 换成原生时间选择器之后，这一对函数就是**唯一的转换点**（也可离线测）。
 */
export function clockValueOf(hour, minute) {
    return formatHourMinute(hour, minute);
}
/**
 * 解析时间选择器的值。
 *
 * **越界或格式不对一律返回 `null`**，由调用方决定保留旧值 ——
 * 悄悄钳到 23:59 会让"我明明填的是 25:00"变成一次没人发现的静默改动。
 * 空字符串同样返回 `null`（用户清空了输入框，那时不该当成 00:00）。
 */
export function parseClockValue(text) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(text.trim());
    if (match === null)
        return null;
    const hour = Number.parseInt(match[1] ?? '', 10);
    const minute = Number.parseInt(match[2] ?? '', 10);
    if (!Number.isInteger(hour) || !Number.isInteger(minute))
        return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59)
        return null;
    return { hour, minute };
}
/**
 * 常用工作日组合（界面上"一键切换"用它）。
 *
 * 放在 shared 里而不是 JSX 里：这四组数字是**产品决定**（我们怎么定义"工作日"），
 * 散在组件里就会在下一次改界面时漂移。
 */
export const WEEKDAY_PRESETS = [
    { key: 'workdays', label: '工作日', days: [1, 2, 3, 4, 5] },
    { key: 'weekend', label: '周末', days: [0, 6] },
    { key: 'all', label: '每天', days: [0, 1, 2, 3, 4, 5, 6] },
    { key: 'none', label: '清空', days: [] },
];
//# sourceMappingURL=time-format.js.map