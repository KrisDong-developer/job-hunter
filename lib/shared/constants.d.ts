/**
 * host 与 client 共享的常量。只放标量，不放运行时对象（§4.3 字段级铁律）。
 */
/** 包名。同时是 cordis.patch.yml 的 `name`、client bundle id、`style[data-plugin]` 的值。 */
export declare const PLUGIN_ID = "dsh-job-hunter";
/**
 * 侧栏入口 id，**必须**与 `main` 面板的 key 同值（§5.1）。
 * 槽位契约原文：“Each list id addresses the matching main panel.”
 */
export declare const PANEL_KEY = "job-hunter";
/** HTTP 路由前缀。只注册这一条 prefix 路由，内部再分发（ADR-6）。 */
export declare const ROUTE_PREFIX = "/job-hunter";
/** locale 命名空间（§5.5 国际化）。 */
export declare const LOCALE_NS = "job-hunter";
/**
 * 浮层提示的存活时间。
 * P0-VERIFICATION F1：`shell.overlay` 是常驻层，条目一旦渲染就永久占位，
 * 因此有内容的浮层必须自动消失。
 */
export declare const NOTICE_TTL_MS = 6000;
/** 当前实施阶段，出现在 /health 与面板上，便于确认装的是哪一版。 */
export declare const PHASE = "P8";
/** `$DSH_HOME` 下的数据目录名。 */
export declare const DATA_DIR_NAME = "job-hunter";
/** 主库文件名。**必须是独立文件**：`node:sqlite` 的 application_id 自保护靠它区分。 */
export declare const DB_FILENAME = "data.db";
/**
 * 本项目专属的 `PRAGMA application_id`。
 * 值是 ASCII "JHP1"（Job Hunter P1）。启动时校验，不符即拒绝打开 ——
 * 避免误开别人的库（`dsh-session-query-sqlite` 也是这么做的）。
 */
export declare const APPLICATION_ID = 1246253105;
/** 覆盖数据目录的环境变量（测试与诊断用）。 */
export declare const DATA_DIR_ENV = "DSH_JOB_HUNTER_DATA_DIR";
/** 单次请求体上限（§4.7）。 */
export declare const MAX_BODY_BYTES: number;
/** 分页默认与上限（禁止无 LIMIT 的全表扫描进热路径，§4.1）。 */
export declare const PAGE_SIZE_DEFAULT = 20;
export declare const PAGE_SIZE_MAX = 100;
/** 任一核心字段连续缺失达到这个次数 → 适配器降级 + 主动告警。 */
export declare const CORE_FIELD_MISS_THRESHOLD = 3;
/** 连续运行级失败达到这个次数 → 失效（broken）。 */
export declare const ADAPTER_FAIL_THRESHOLD = 3;
/** 一批写入的行数（§4.1：抓取批量写入按 200 行一个事务分批）。 */
export declare const WRITE_BATCH_SIZE = 200;
/** 抓取请求之间的随机延时区间（ms）——保守优先于效率（P5）。 */
export declare const REQUEST_DELAY_MIN_MS = 1200;
export declare const REQUEST_DELAY_MAX_MS = 3200;
/**
 * 每个平台每天最多自动跑几轮（SR-3 的每日上限）。
 *
 * 为什么要有：窗口 + 随机点已经避免了"每天同一分钟"，但一个坏掉的适配器
 * 或者一个刚恢复的平台可能在一小时内被反复触发。上限是最后一道闸。
 * 默认给得很松（8 次）：这不是节流阀，是"防止失控"的保险丝。
 */
export declare const DAILY_CRAWL_LIMIT = 8;
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
export declare const ROUND_BUDGET_MS: number;
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
export declare const MAX_CONCURRENT_PLATFORMS = 3;
/**
 * 一个方案最多多少个关键词。
 *
 * 上限不是随意的：自动调度的每日抓取上限按**站点访问次数**计（`DAILY_CRAWL_LIMIT=8`），
 * N 个关键词的一轮就是 N 次访问 —— 10 是"一轮还能留下额度跑补跑"与"够覆盖一组
 * 目标岗位"之间的平衡点。需要更多就拆成两个方案（各自的额度与时段独立）。
 */
export declare const PLAN_KEYWORDS_MAX = 10;
/**
 * 一轮里**最多逐条点进多少个新岗位的详情页**（P2 详情补抓）。
 *
 * 只对本轮**新增**的岗位做（老岗位已有 JD 或已被判定），所以日常轮次接近零开销；
 * 上限防的是"首轮 + 多关键词"的极端量（3 词 × 3 页 ≈ 120 新增）一次全点进去 ——
 * 那既是风控灾难，也会把任何预算吃光。超出的新岗位**这一轮拿不到 JD**
 * （列表字段照常入库；打分/标注按无 JD 口径降级），它们在下一轮已是"老岗位"。
 */
export declare const DETAIL_FETCH_MAX_PER_ROUND = 20;
/** 设置表里"一轮采集最多跑多少分钟"的键（scope='global'）。 */
export declare const CRAWL_ROUND_BUDGET_KEY = "crawlRoundBudgetMinutes";
/** 默认 20 分钟（沿用原 ROUND_BUDGET_MS 的值）。 */
export declare const CRAWL_ROUND_BUDGET_DEFAULT_MIN = 20;
/** 允许范围 5–240 分钟。下限防"设成 1 分钟等于每轮都截断"；上限与浏览器空闲档对齐。 */
export declare const CRAWL_ROUND_BUDGET_MIN_MIN = 5;
export declare const CRAWL_ROUND_BUDGET_MAX_MIN = 240;
/**
 * 设置表里"浏览器空闲多少分钟后关闭"的键（`scope='global'`、`scope_ref=''`）。
 * 放在 shared：界面要显示它、HTTP 路由要校验它、宿主半要读它。
 */
export declare const BROWSER_IDLE_KEY = "browserIdleCloseMinutes";
/**
 * 默认空闲关闭时间（分钟）。
 *
 * 为什么是 10 分钟而不是 PDF 渲染器那样的 90 秒：抓取浏览器是 headful 的，
 * 启动要几秒、还要复用登录态；连续补跑 / 手动连点两次采集很常见，
 * 90 秒会让第二次采集每次都重新冷启动。10 分钟既盖住"连着跑几次"，
 * 又不至于让一个 Chromium 整晚挂在内存里（NFR-7：单轮资源可控）。
 */
export declare const BROWSER_IDLE_DEFAULT_MIN = 10;
/** 允许范围：0 = 不自动关（保持旧行为）；上限 240 分钟。 */
export declare const BROWSER_IDLE_MIN_MIN = 0;
export declare const BROWSER_IDLE_MAX_MIN = 240;
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
export declare const BROWSER_CLOSE_AFTER_RUN_MS = 3000;
/** 保留策略在 `setting` 表里的键（`scope='global'`、`scope_ref=''`）。 */
export declare const RETENTION_KEY = "retentionPolicy";
/**
 * 各数据类型的默认保留天数（§18.2 分层保留）。
 *
 * `0` = **永不自动清理**。几条刻意的取值：
 *   * 岗位结构化数据 730 天（24 个月）——§18.2 的原值。但删岗位有条件：
 *     只有"从没被碰过"的才会被删（见 `store/cleanup.ts` 的 NOT EXISTS 条件），
 *     因为 `application` / `greeting` / `message` / `interview` / `tailoring` 的外键是
 *     **SET NULL** —— 删掉父行会把用户资产变成孤儿，那比占空间糟得多。
 *   * 投递 / 打招呼 / 消息记录 = 0：它们是归因与复盘的核心，也是用户自己的资产（§18.2「长期」）。
 *   * 简历与附件不在本表 —— 它们**只能由用户显式删除**（`/files/:id`），绝不进自动清理。
 */
export declare const RETENTION_DEFAULTS: {
    readonly crawlRunsDays: 30;
    readonly auditLogDays: 365;
    /** 模型调用留痕：§18.2 定的是「长期」，所以默认 0（永久）。 */
    readonly llmCallsDays: 0;
    readonly pendingRepairDays: 30;
    /** JD 纯文本：体积大头，中保留（§18.2）。清的是**字段**，不删岗位行。 */
    readonly jdTextDays: 180;
    readonly jobsDays: 730;
};
/** `0` 是合法值（= 永久保留），但负数与超大值不是。 */
export declare const RETENTION_MIN_DAYS = 0;
export declare const RETENTION_MAX_DAYS = 3650;
/**
 * 定时清理**默认关闭**。
 *
 * §18.3 的 P1 只要求"可关闭"，没说默认开。默认关的理由是删除不可逆，
 * 而当前实现**不存原始 HTML/截图**（§18.1 估算出的"几十 GB"在实现里并不存在），
 * 所以磁盘压力远小于文档假设 —— 让用户先手动跑一次预览、看清要删什么再打开。
 */
export declare const RETENTION_AUTO_CLEAN_DEFAULT = false;
/**
 * 一次导入的**行数上限**。
 *
 * 存在的理由不是洁癖：导入的行会直接落进岗位库，而"粘了一份几万行的表进来"
 * 既会撑爆内存，也会把岗位库变成噪音。超过就明确拒绝，让用户分批。
 */
export declare const IMPORT_MAX_ROWS = 2000;
/**
 * 数据导出归档里**允许的附件总字节上限**。
 *
 * 归档把 `files/` 的原文件一起打包，而用户可以导出很多版简历附件；
 * 无上限会让一次 GET 把宿主内存吃光（响应体是先在内存里拼出来的）。
 * 超限时**只导出结构化数据**并在响应里如实说明少了什么。
 */
export declare const EXPORT_ARCHIVE_MAX_BYTES: number;
/** 导出归档落盘的子目录名（`<dataDir>/exports`）。也是模型工具唯一允许读写的目录。 */
export declare const EXPORTS_DIR_NAME = "exports";
/**
 * 一次批量动作里最多几条。
 *
 * 这个数由两个**互相独立**的约束推出来，都不是洁癖：
 *   * **请求时长**：每条要开页面、逐字符输入、校验送达（实测是秒级到十几秒），
 *     服务端还会在条与条之间插入随机间隔（见下）—— 一次请求塞 20 条就是十几分钟不返回；
 *   * **审批粒度**：§4.4.2 要求用户看到**正文全文**（投递则是"用哪版简历"）再确认。
 *     一次问 20 条，人只会无脑点"确认"，那等于没有审批。
 *
 * 打招呼与投递**共用一个数**：两者的约束是同一套（都是"人在平台上的一次动作"），
 * 而投递更重、更不可逆 —— 更没有理由给它更大的批量。
 *
 * 界面按同一个数**串行分批**，并在批与批之间也插入间隔（跨请求的间隔只能由界面负责，
 * 宿主没法约束两次独立请求之间的时间）。
 *
 * （原名 `GREETING_BATCH_MAX`；L4 批量投递落地时收口成这一个。）
 */
export declare const BATCH_MAX_ITEMS = 5;
/**
 * 批量发送时**条与条之间**的随机间隔（毫秒）。
 *
 * D3 的原话是"分平台、限速、随机间隔、每日上限"—— 连点是最典型的机器信号。
 * 区间取 3–9 秒：短于 3 秒看起来像脚本；长于 9 秒会让一批 5 条变成一分半。
 *
 * 插在**宿主**里而不是界面：这样模型工具与定时任务走的是同一条路径，绕不过去。
 *
 * （原名 `GREETING_BATCH_INTERVAL_MS`；同上收口。）
 */
export declare const BATCH_ITEM_INTERVAL_MS: {
    readonly min: 3000;
    readonly max: 9000;
};
//# sourceMappingURL=constants.d.ts.map