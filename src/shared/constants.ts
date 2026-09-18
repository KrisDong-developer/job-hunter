/**
 * host 与 client 共享的常量。只放标量，不放运行时对象（§4.3 字段级铁律）。
 */

/** 包名。同时是 cordis.patch.yml 的 `name`、client bundle id、`style[data-plugin]` 的值。 */
export const PLUGIN_ID = 'dsh-job-hunter'

/**
 * 侧栏入口 id，**必须**与 `main` 面板的 key 同值（§5.1）。
 * 槽位契约原文：“Each list id addresses the matching main panel.”
 */
export const PANEL_KEY = 'job-hunter'

/** HTTP 路由前缀。只注册这一条 prefix 路由，内部再分发（ADR-6）。 */
export const ROUTE_PREFIX = '/job-hunter'

/** locale 命名空间（§5.5 国际化）。 */
export const LOCALE_NS = 'job-hunter'

/**
 * 浮层提示的存活时间。
 * P0-VERIFICATION F1：`shell.overlay` 是常驻层，条目一旦渲染就永久占位，
 * 因此有内容的浮层必须自动消失。
 */
export const NOTICE_TTL_MS = 6000

/** 当前实施阶段，出现在 /health 与面板上，便于确认装的是哪一版。 */
export const PHASE = 'P8'

// ── 数据层（§4.1 / §8）────────────────────────────────────────────────

/** `$DSH_HOME` 下的数据目录名。 */
export const DATA_DIR_NAME = 'job-hunter'

/** 主库文件名。**必须是独立文件**：`node:sqlite` 的 application_id 自保护靠它区分。 */
export const DB_FILENAME = 'data.db'

/**
 * 本项目专属的 `PRAGMA application_id`。
 * 值是 ASCII "JHP1"（Job Hunter P1）。启动时校验，不符即拒绝打开 ——
 * 避免误开别人的库（`dsh-session-query-sqlite` 也是这么做的）。
 */
export const APPLICATION_ID = 0x4a485031

/** 覆盖数据目录的环境变量（测试与诊断用）。 */
export const DATA_DIR_ENV = 'DSH_JOB_HUNTER_DATA_DIR'

/** 单次请求体上限（§4.7）。 */
export const MAX_BODY_BYTES = 64 * 1024

/** 分页默认与上限（禁止无 LIMIT 的全表扫描进热路径，§4.1）。 */
export const PAGE_SIZE_DEFAULT = 20
export const PAGE_SIZE_MAX = 100

// ── 采集与健康（§4.2.3 / §4.2.4）───────────────────────────────────────

/** 任一核心字段连续缺失达到这个次数 → 适配器降级 + 主动告警。 */
export const CORE_FIELD_MISS_THRESHOLD = 3

/** 连续运行级失败达到这个次数 → 失效（broken）。 */
export const ADAPTER_FAIL_THRESHOLD = 3

/** 一批写入的行数（§4.1：抓取批量写入按 200 行一个事务分批）。 */
export const WRITE_BATCH_SIZE = 200

/** 抓取请求之间的随机延时区间（ms）——保守优先于效率（P5）。 */
export const REQUEST_DELAY_MIN_MS = 1200
export const REQUEST_DELAY_MAX_MS = 3200

// ── 定时与抑制（D-19 / SR-3 / SR-20 / SR-21）────────────────────────────

/**
 * 每个平台每天最多自动跑几轮（SR-3 的每日上限）。
 *
 * 为什么要有：窗口 + 随机点已经避免了"每天同一分钟"，但一个坏掉的适配器
 * 或者一个刚恢复的平台可能在一小时内被反复触发。上限是最后一道闸。
 * 默认给得很松（8 次）：这不是节流阀，是"防止失控"的保险丝。
 */
export const DAILY_CRAWL_LIMIT = 8

/**
 * **单轮预算**（SR-46 / NFR-7）：一个方案的一次运行最多占用多久。
 *
 * "一轮" = 一个方案的一次运行，可能覆盖多个平台。预算用完时两处会停：
 *   * **平台之间**：还没开始的平台不再开始（如实报 `round_budget`，不假装跑过）；
 *   * **平台之内**：正在跑的那一轮在**页与页之间**停下（`crawl_run.state='aborted'`），
 *     已经解析出来的记录照常入库。
 *
 * 为什么给到 20 分钟这么松：它不是节流阀（节流是每日上限与平台额度的事），
 * 而是**保险丝** —— 一个卡住的页面、一个不返回的站点不该把整轮拖到天亮。
 * 给紧了只会让正常但慢的站点被腰斩，那比失控常见得多。
 *
 * 为什么只在页与页之间停：请求中途打断会留下一个状态未知的页面，
 * 同一个浏览器上下文的下一次使用行为不可预期 —— 宁可将就跑完当前这一页。
 */
export const ROUND_BUDGET_MS = 20 * 60 * 1000

/**
 * 一轮里**同时**在跑的平台数上限（跨平台并发 / 同平台串行）。
 *
 * 为什么是 3 而不是"全部一起"：
 *   * 风控是**按站点**看的 —— 不同平台互不相干，并发不增加任何一个站点的请求速率；
 *     但 10 个 tab 同时开页对**本机**是实打实的内存与解析压力（headful Chromium）；
 *   * 3 条泳道已把"等页间延时"的时间重叠掉大半（延时是高斯的，本来就不密集），
 *     再加泳道的边际收益递减；
 *   * 留出余量给登录引导（它也从这个页面池拿页，不占平台锁）。
 *
 * 同一平台绝不并发：`platform/locks.ts` 保证（两个方案打同一个站点仍串行）。
 * 这是把原 §4.2.1「全局互斥」收窄成「按平台互斥」—— 收窄的依据是
 * 互斥真正要保护的共享资源只有两类：**同一站点的请求节奏**与**页面**，
 * 而这两类都可以按平台切分（页面池见 browser.ts 的 createPagePool）。
 */
export const MAX_CONCURRENT_PLATFORMS = 3

// ── 浏览器空闲自关（NFR-7 / C12）───────────────────────────────────────

/**
 * 设置表里"浏览器空闲多少分钟后关闭"的键（`scope='global'`、`scope_ref=''`）。
 * 放在 shared：界面要显示它、HTTP 路由要校验它、宿主半要读它。
 */
export const BROWSER_IDLE_KEY = 'browserIdleCloseMinutes'

/**
 * 默认空闲关闭时间（分钟）。
 *
 * 为什么是 10 分钟而不是 PDF 渲染器那样的 90 秒：抓取浏览器是 headful 的，
 * 启动要几秒、还要复用登录态；连续补跑 / 手动连点两次采集很常见，
 * 90 秒会让第二次采集每次都重新冷启动。10 分钟既盖住"连着跑几次"，
 * 又不至于让一个 Chromium 整晚挂在内存里（NFR-7：单轮资源可控）。
 */
export const BROWSER_IDLE_DEFAULT_MIN = 10

/** 允许范围：0 = 不自动关（保持旧行为）；上限 240 分钟。 */
export const BROWSER_IDLE_MIN_MIN = 0
export const BROWSER_IDLE_MAX_MIN = 240

/**
 * 「每轮采集结束后就关」时实际用的空闲时长（毫秒）。
 *
 * 为什么不直接"跑完立刻关"：`release()` 是在**互斥锁还握着**的时候被调用的，
 * 而"正在采集"恰恰是必须拦住的场景（`browser.ts` 的 `shouldKeepAlive`）——
 * 立刻关等于永远关不掉。所以给一个**几秒**的短时长，交给既有的
 * 「到点复问 + 重新计时」逻辑去等这一轮真正结束：
 *   * 一轮里多个方案串行跑时，前一个 `release()` 之后锁仍被下一个握着 → 复问被拦 → 改期，
 *     于是窗口**不会在方案之间被关掉又打开**（那比一直开着更难看）；
 *   * 等全部跑完，那一次复问没人再拦 → 关掉。
 *
 * 3 秒是"跑完就走"与"别在方案之间闪窗"之间的取舍值。登录引导轮询中同样会被拦住
 * （用户正在那个窗口里输密码），所以不用担心把登录页关掉。
 */
export const BROWSER_CLOSE_AFTER_RUN_MS = 3_000
