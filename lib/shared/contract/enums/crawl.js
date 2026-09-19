/**
 * crawl 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 抓取运行态 —— `crawl_run.state`。 */
/** 抓取运行态 —— `crawl_run.state`。 */
export const CRAWL_STATES = ['queued', 'running', 'ok', 'partial', 'failed', 'aborted'];
/**
 * 运行态的中文标签。**界面上一律用这一份。**
 *
 * 把 `ok` / `partial` / `failed` 直接印给用户看等于漏出内部枚举 ——
 * 而非技术用户读不懂 `partial` 到底是成了还是没成。
 * 放在 shared 里，所以面板上的词与模型工具返回文本里的词必然一致。
 */
export const CRAWL_STATE_LABEL = {
    queued: '排队中',
    running: '进行中',
    ok: '成功',
    partial: '部分成功',
    failed: '失败',
    aborted: '已中止',
};
/** 状态徽章的色调（界面据此上色，不自己猜）。 */
export const CRAWL_STATE_TONE = {
    queued: 'muted',
    running: 'muted',
    ok: 'ok',
    partial: 'warn',
    failed: 'error',
    aborted: 'muted',
};
/**
 * 适配器健康态（§4.2.3）：
 *   healthy ──连续失败 N 次──→ degraded ──仍失败──→ broken ──修复并自检──→ healthy
 */
export const HEALTH_STATES = ['healthy', 'degraded', 'broken'];
/** 健康态的中文标签（同上：不把 `degraded` 直接印出来）。 */
export const HEALTH_STATE_LABEL = {
    healthy: '正常',
    degraded: '降级',
    broken: '失效',
};
export const HEALTH_STATE_TONE = {
    healthy: 'ok',
    degraded: 'warn',
    broken: 'error',
};
/**
 * 核心字段（§4.2.4）：每个适配器都必须声明的一组字段。
 * 任一字段**连续 3 次缺失**即触发降级；不合格的**单条**记录不写主表，进 `pending_repair`。
 */
export const CORE_FIELDS = ['title', 'salary_raw', 'company', 'source_url'];
/**
 * 风控命中类型（§4.2.2 `detectBlock`）。
 *
 * `quota-exhausted`（P1/D-17a 增强）：平台侧"今日额度用完"（如 51job「今日投递太多」、
 * 智联「达到上限」）。与 `rate-limited` 的本质区别：退避重试**没用**（额度不随时间恢复），
 * 正确动作是当天对该平台停手。
 */
export const BLOCK_KINDS = [
    'captcha',
    'login-required',
    'rate-limited',
    'quota-exhausted',
    'blank',
];
//# sourceMappingURL=crawl.js.map