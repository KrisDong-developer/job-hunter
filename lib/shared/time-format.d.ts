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
/** 本地墙钟 `HH:MM`。 */
export declare function formatClock(date: Date): string;
/** 本地日期 `M月D日`。 */
export declare function formatDay(date: Date): string;
/** 同一天（按本地日历比较，不是"相差不到 24 小时"）。 */
export declare function isSameDay(a: Date, b: Date): boolean;
/**
 * 把一段毫秒差写成**人话**。
 *
 * 分档刻意粗：用户要的是"大概多久"，不是"3 小时 17 分 42 秒"。
 * 未来与过去分别是 `还有 …` / `…前`。
 */
export declare function formatRelative(target: Date, now: Date): string;
/**
 * 一个时刻的完整体：本地时间 + 相对时间。
 *
 * 三段拼在一起而不是只给一段，是为了让**错的时区自己露出来**：
 * 只有相对时间看不出"算的是哪个时刻"，只有绝对时间又看不出"离现在多远"。
 *
 * @example "今天 09:34 · 还有 1 小时"
 */
export declare function formatLocalMoment(iso: string | null, now: Date, options?: {
    withRelative?: boolean;
}): string | null;
/** 抖动的说明文案；没有抖动时返回 `null`（不给一句"含 0 分钟抖动"的废话）。 */
export declare function formatJitter(jitterMs: number): string | null;
/** 按索引取星期标签（越界返回 `?` 而不是 undefined）。 */
export declare function weekdayLabel(day: number): string;
/** 把 `weekdays` 写成"每天 / 工作日 / 周一、周三"这类人话。 */
export declare function formatWeekdays(weekdays: number[]): string;
/** 本地墙钟 `HH:MM`（从 时/分 两个数字，而不是 Date）。 */
export declare function formatHourMinute(hour: number, minute: number): string;
/**
 * 一个"偏好时段"的人话标签。
 *
 * 跨零点（如 22:00–02:00）如实写成 `22:00–次日 02:00` —— 不能把它压成 `22:00–02:00`，
 * 那看起来像一个不存在的负长度区间。
 */
export declare function formatWindow(startHour: number, startMinute: number, endHour: number, endMinute: number): string;
/**
 * `时/分` → `<input type="time">` 需要的值（`HH:MM`，24 小时制）。
 *
 * 存在的理由：偏好时段原来是**四个独立的数字框**（起时/起分/止时/止分），
 * 改一个时段要点四次、还得自己想清楚 09 和 00 各填哪里。
 * 换成原生时间选择器之后，这一对函数就是**唯一的转换点**（也可离线测）。
 */
export declare function clockValueOf(hour: number, minute: number): string;
/**
 * 解析时间选择器的值。
 *
 * **越界或格式不对一律返回 `null`**，由调用方决定保留旧值 ——
 * 悄悄钳到 23:59 会让"我明明填的是 25:00"变成一次没人发现的静默改动。
 * 空字符串同样返回 `null`（用户清空了输入框，那时不该当成 00:00）。
 */
export declare function parseClockValue(text: string): {
    hour: number;
    minute: number;
} | null;
/**
 * 常用工作日组合（界面上"一键切换"用它）。
 *
 * 放在 shared 里而不是 JSX 里：这四组数字是**产品决定**（我们怎么定义"工作日"），
 * 散在组件里就会在下一次改界面时漂移。
 */
export declare const WEEKDAY_PRESETS: ReadonlyArray<{
    key: string;
    label: string;
    days: number[];
}>;
//# sourceMappingURL=time-format.d.ts.map