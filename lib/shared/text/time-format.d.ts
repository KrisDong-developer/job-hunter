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
/**
 * 一个时刻的**绝对本地时间**：`2026-09-20 13:33`（同一年则省去年份 → `09-20 13:33`）。
 *
 * ## 为什么与 `formatLocalMoment` 并存，而不是合成一个
 *
 * 两者回答的问题不同，排版也就必须不同：
 *   * `formatLocalMoment` 面向**对话文本**（"今天 09:34 · 还有 1 小时"）——
 *     "今天/明天"这类相对日期读起来最省力，因为读者知道"现在"是什么时候；
 *   * 这个函数面向**落进文件或被拷贝走的时刻**（导出的 CSV、悬停提示、回执），
 *     那里没有"现在"这个上下文：文件明天再打开，"今天 09:34"就变成了假话。
 *     所以它一律给绝对日期，并且**跨年时补上年份**（去年的回执不能只写 `09-17`）。
 *
 * 之所以进 shared 而不是留在客户端：导出的 CSV 由宿主生成，两边必须是同一套写法 ——
 * "同一个时刻在界面与文件里长得不一样"这种事解释不清。
 */
export declare function formatLocalDateTime(iso: string, now?: Date): string;
/**
 * 把一段**时长**写成 `12 秒` / `3 分 20 秒` / `1 小时 5 分`。
 *
 * 与 `formatRelative` 分开：那个回答"距离现在多久"（带 还有/前），
 * 这个回答"这一轮花了多久" —— 两者都是时间，但在界面上是两件事。
 *
 * 负值或非有限数返回 `null`（不是 `-3 秒`）：`endedAt < startedAt` 只可能来自
 * 系统时钟被往回拨，那时显示一个负数比显示 `—` 更让人困惑。
 */
export declare function formatDuration(ms: number): string | null;
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
/** 一个时段（发送窗口）的四个数字。 */
export interface ClockWindow {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}
/**
 * 解析 `'HH:MM-HH:MM'` —— **发送窗口格式唯一的解析点**。
 *
 * 为什么必须只有一处：这个串由 `formatWindow` 产出、由宿主闸门与界面共同消费。
 * 客户端曾经自己写了一份正则与补零（`format/settings-window.ts`），
 * 于是"改了一边的格式、另一边悄悄认不出来"，而表现是"时段配置无法解析，闸门拒绝所有发送"。
 *
 * 分钟**必须两位**（`9:5` 不算合法）：与宿主闸门 `parseSendWindow` 的历史行为一致，
 * 而界面上的 `<input type="time">` 产出的永远是两位。
 *
 * 只判格式与范围，**不判"现在能不能发"** —— 那个裁决点在宿主闸门里，不能有第二份。
 */
export declare function parseClockWindow(raw: string): ClockWindow | null;
/**
 * 发送窗口 → 两个 `<input type="time">` 需要的 `'HH:MM'`。
 *
 * 单独一个函数而不是让调用方自己拼：时间控件只认 `HH:MM`，而库里存的是
 * `'HH:MM-HH:MM'`，中间这一步转换出现在界面两处（设置页与风险提示），
 * 各写一遍就会在两处对同一个串给出不同结论。
 */
export declare function parseWindow(raw: string): {
    start: string;
    end: string;
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