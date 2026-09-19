/**
 * 插件标识、路由前缀与数据目录。
 */
/**
 * plugin 相关常量（host 与 client 共享）。只放标量，不放运行时对象（§4.3）。
 */
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

// 数据层（§4.1 / §8）
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
