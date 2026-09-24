/**
 * 51job 的配置面：选择器集、字段 → URL 参数映射、默认值与合并函数、排序/时间窗取值域、
 * 城市码表、页数上限、判墙信号常量 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * 完整实测记录（排序取值来源、`issueDate` 恒空、城市码与判墙信号的逐条理由）见 `./index.ts` 文件头。
 * 各选择器分组的**证据状态**（✅ 实测 / ⚠️ 候选待校准）逐条写在类型与默认值的注释里。
 */
import { mergeAdapterConfig, numberRange } from '../../config-merge.js';
/**
 * 51job 支持的排序取值域（探针实测 2026-09，搜索页「综合/活跃/最新/薪资/距离」五个按钮）。
 *
 * 取值来自探针逐项点击排序按钮后，读取 API `we.51job.com/api/job/search-pc` 请求里
 * `sortType=` 的实值（并用激活态 `.ss.on` 双重确认）：
 *
 * | 按钮文字 | sortType |
 * |---|---|
 * | 综合排序 | `0` |
 * | 最新优先 | `1` |
 * | 薪资优先 | `3` |
 * | 活跃职位优先 | `5` |
 * | 距离优先 | （未启用，无实值） |
 *
 * ⚠️ **「距离优先」故意不列出**：探针点击后按钮无「on」高亮、也不发请求（疑似依赖
 * 定位/经纬度上下文，当前未启用时点击不生效）。没测出实值就不编 —— 编错了用户选了
 * 只会静默拿到另一种排序（更糟）。所以 `render` 里只有上面四档。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export const SORT_OPTIONS = [
    { value: '0', label: '综合排序' },
    { value: '1', label: '最新优先' },
    { value: '3', label: '薪资优先' },
    { value: '5', label: '活跃职位优先' },
];
/**
 * 发布时间窗取值域（天）。
 *
 * **探针实测：本页面不存在「发布时间」筛选控件**（全文无「24小时/三天/一周/一个月」等文案）。
 * API 虽保留 `issueDate` 参数但恒为空。所以值域为空 —— 界面据此禁用该维度并给出原因，
 * 而不是摆一堆点击后不生效的选项。
 */
export const POSTED_WITHIN_OPTIONS = [];
/**
 * ── 六个筛选维度的完整取值域（2026-09-23 点击探针全量补齐）──────────────────────
 *
 * ## 证据链
 *
 * 1. **逐项点击**：真机打开搜索页，hook fetch/XHR 后逐项点击筛选条
 *    （`.custom-select-wrapper` 六组下拉共 42 个选项），每点一项读站点自己发出的
 *    `we.51job.com/api/job/search-pc` 请求 —— 累积多选里**新增的尾码**即该选项的码；
 * 2. **五个历史锚点吻合**：本科=04 / 1-3年=02 / 国企=04 / 500-1000人=04 / 全职=01，
 *    与 2026-09-21 点击探针逐对一致；
 * 3. **URL 通道效果验证**（适配器走的就是 URL 导航）：带参数直开
 *    `?keyword=java&salary=201` 等，SPA 把参数原样转进 search-pc 请求（7/7 到达 ✓），
 *    且结果集全部变化：total 907 → salary=201 得 159、salary=12 得 33、
 *    companySize=07 得 95、companyType=05 得 499、jobType=03 得 16、workYear=01 得 72
 *    （阳性对照 degree=04 → 717，方法有效）。
 *
 * ## 站点的多选形态
 *
 * 页面筛选是**多选**（值逗号连接，如 `companySize=01%2C02`）；本适配器声明的是
 * **单选**（每维一个下拉）—— 单值经 URL 验证同样生效（上面的 total 变化全是单值跑出来的）。
 * 要支持多选得改 `CriteriaDimension` 的形态，收益边际低，先不做。
 */
export const FIFTYONE_FILTER_OPTIONS = {
    /** URL 参数 `salary`（站点自己叫「月薪范围」；201 是特档码，其余 06-12 顺序）。 */
    salary: [
        { value: '201', label: '8千以下' },
        { value: '06', label: '0.8-1万' },
        { value: '07', label: '1-1.5万' },
        { value: '08', label: '1.5-2万' },
        { value: '09', label: '2-3万' },
        { value: '10', label: '3-4万' },
        { value: '11', label: '4-5万' },
        { value: '12', label: '5万以上' },
    ],
    /** URL 参数 `jobType`。 */
    jobType: [
        { value: '01', label: '全职' },
        { value: '02', label: '兼职' },
        { value: '03', label: '实习' },
    ],
    /** URL 参数 `workYear`（01 在校生/应届生 与 06 无需经验 为 2026-09-23 补齐的两端）。 */
    workYear: [
        { value: '01', label: '在校生/应届生' },
        { value: '02', label: '1-3年' },
        { value: '03', label: '3-5年' },
        { value: '04', label: '5-10年' },
        { value: '05', label: '10年以上' },
        { value: '06', label: '无需经验' },
    ],
    /** URL 参数 `degree`（01/02/07 为 2026-09-23 补齐；04 本科是 2026-09-21 锚点）。 */
    degree: [
        { value: '01', label: '初中及以下' },
        { value: '02', label: '高中/中技/中专' },
        { value: '03', label: '大专' },
        { value: '04', label: '本科' },
        { value: '05', label: '硕士' },
        { value: '06', label: '博士' },
        { value: '07', label: '无学历要求' },
    ],
    /** URL 参数 `companyType`（注意 **04=国企** 而 03=合资、05=民营 —— 顺序不是 01 起的
     * 界面顺序；10 已上市 / 11 创业公司 为 2026-09-23 补齐）。 */
    companyType: [
        { value: '01', label: '外资（欧美）' },
        { value: '02', label: '外资（非欧美）' },
        { value: '03', label: '合资' },
        { value: '04', label: '国企' },
        { value: '05', label: '民营' },
        { value: '06', label: '外企代表处' },
        { value: '07', label: '政府机关' },
        { value: '08', label: '事业单位' },
        { value: '09', label: '非营利组织' },
        { value: '10', label: '已上市' },
        { value: '11', label: '创业公司' },
    ],
    /** URL 参数 `companySize`（01-07 顺序档；04 为 2026-09-21 锚点）。 */
    companySize: [
        { value: '01', label: '少于50人' },
        { value: '02', label: '50-150人' },
        { value: '03', label: '150-500人' },
        { value: '04', label: '500-1000人' },
        { value: '05', label: '1000-5000人' },
        { value: '06', label: '5000-10000人' },
        { value: '07', label: '10000人以上' },
    ],
};
/** 页数上限：再大也不会更"全"，只会更容易触发风控。 */
export const FIFTYONE_MAX_PAGES = 5;
export const DEFAULT_FIFTYONE_CONFIG = {
    selectors: {
        card: '.joblist-item',
        title: '.jname',
        salary: '.sal',
        // ⚠️ 顶栏筛选区也有同名 `.area`，必须限定在卡片内（`.joblist-item .area`），
        //    否则可能抓到顶栏的「地点」筛选而非某张卡片的地址（探针 2026-09 提示）。
        area: '.joblist-item .area',
        tags: '.joblist-item-tags .tag',
        company: '.cname',
        companyMeta: '.bc .dc',
        tracking: '[sensorsname="JobShortExposure"]',
        trackingAttr: 'sensorsdata',
    },
    urlParams: {
        base: 'https://we.51job.com/pc/search',
        keywordParam: 'keyword',
        cityParam: 'jobArea',
        pageParam: 'pageNum',
        sortParam: 'sortType',
        postedWithinParam: 'issueDate',
        degreeParam: 'degree',
        workYearParam: 'workYear',
        companyTypeParam: 'companyType',
        companySizeParam: 'companySize',
        jobTypeParam: 'jobType',
        salaryParam: 'salary',
    },
    cityCodes: {
        北京: '010000',
        上海: '020000',
        广州: '030200',
        深圳: '040000',
        天津: '050000',
        重庆: '060000',
        南京: '070200',
        苏州: '070300',
        杭州: '080200',
        成都: '090200',
        青岛: '120300',
        郑州: '170200',
        武汉: '180200',
        长沙: '190200',
        西安: '200200',
    },
    detailUrlTemplate: 'https://jobs.51job.com/all/{jobId}.html',
    detailSelectors: {
        // ⚠️ 候选链（未实测，DB 可覆盖）：老版经典类名在前、结构式兜底在后
        title: '.cn h1, h1, .job-name, .jname',
        salary: '.cn strong, .sal, .salary, [class*="sal"]',
        tags: '.jtag span, .job-tags .tag, .tags .tag, .cn p span',
        jdText: '.job_msg, .job-desc, .job_detail_msg, [class*="job_msg"]',
        company: '.cname, .company-name, .comp_name, [class*="company_name"]',
        companyMeta: '.dc, .company-meta span, .tCompany_sidebar .compay_list li',
    },
    chatSelectors: {
        // ✅ 实测（搜索卡片右侧）：`.chat`（内文「去聊聊」）；详情页入口形态为候选
        chatButton: '.chat, .btn-chat, [trace-name*="聊天"], [class*="chat-btn"]',
        chatQrPopover: '.chat-popover',
        chatQrTip: '.hr-tip',
        chatQrCode: '.qrcode',
        hrName: '.hr-name',
        hrPosition: '.hr-position',
        // ⚠️ 候选（登录态站内会话未实测）。刻意不含 `.msg-list`：
        // 那是收件箱会话列表容器的候选（inboxSelectors.listContainer），两处共用一个类名
        // 会让"会话页上读消息"与"消息页读会话列表"互相串台（离线测试已撞过一次）。
        chatInput: 'textarea.chat-input, .chat-input, [contenteditable="true"]',
        sendButton: '.btn-send, .send-btn, [class*="send-btn"]',
        messageList: '.chat-record, .chat-message-list, .message-list',
        myMessage: '.item-myself, [class*="myself"], [class*="item-my"]',
        messageText: '.message-content, .text, .msg-text',
        messageStatus: '.message-status, [class*="msg-status"]',
        // ✅ 实测（搜索卡片 `button.btn.apply`，trace-name="申请职位-职位下"）
        applyButton: 'button.apply, .btn.apply, [trace-name^="申请职位"]',
        applyDialog: '.apply-component-resume-dialog',
        applyResumeRow: '.pc-apply-resume__row',
        applyResumeSelect: '.pc-apply-resume__select--resume',
        applyDialogConfirm: '.el-dialog__footer .el-button--primary, .btn-sure, [class*="confirm"]',
        applyHintDialog: '.apply-component-hint-dialog',
        applySuccess: '.success_title, .el-message--success',
    },
    inboxSelectors: {
        // ⚠️ 整组候选（消息页未实测，DB 可覆盖）
        listContainer: '.msg-list, .chat-list, [class*="conversation-list"]',
        emptyState: '.no-data, .empty, [class*="no-data"]',
        row: 'li[role=listitem], .msg-item, [class*="conversation-item"]',
        name: '.name-text, .hr-name, [class*="user-name"]',
        company: '.company, [class*="company-name"]',
        lastMessage: '.last-msg-text, .msg-text, [class*="last-msg"]',
        status: '.message-status, [class*="msg-status"]',
        unread: '.notice-badge, .unread-count, .badge, [class*="unread"]',
        time: '.time, [class*="time"]',
    },
    // ⚠️ 候选地址（未实测）：真机校准后经 DB 覆盖
    chatUrl: 'https://i.51job.com/message/',
    loginSelectors: {
        // 已登录：⚠️ 候选（登录态夹具缺位）
        loggedIn: '.header .user-name, .userName, [class*="user-info"]',
        // 未登录：✅ 实测（页头 `.login.loginBtnClick`「登录/注册」）
        notLoggedIn: '.loginBtnClick',
    },
    actionWaitMs: 15_000,
    deliveryPoll: { attempts: 12, intervalMs: 500 },
    dwellBeforeGreetMs: [15_000, 30_000],
    dwellBeforeReplyMs: [3_000, 8_000],
    dwellBeforeApplyMs: [8_000, 16_000],
};
/**
 * 把 DB 里的覆盖合并到默认配置上。
 *
 * 选择器分组走通用 `mergeAdapterConfig`（分组浅合并 + 空串保护）；
 * **形状敏感的字段**（轮询对象 / 停留区间）单独校验 —— 一份写坏的 DB 覆盖
 * （`deliveryPoll: {attempts: 0}`、`dwell: [8000, 1000]`）会让动作链静默变成
 * "永不轮询 / 停留恒 0ms"，那正是校验要拦的形态。
 */
export function mergeFiftyOneConfig(override) {
    // 通用合并（`platform/config-merge.ts`）：分组浅合并 + 字符串空值保护 +
    // 只认默认值里已有的键。以前这里是一份手写实现 —— 10 个适配器各写一遍
    // 同一套语义，漏掉哪一条都只会以"某平台配置突然被清空"的形式暴露。
    const merged = mergeAdapterConfig(DEFAULT_FIFTYONE_CONFIG, override);
    const poll = (value) => {
        const fallback = DEFAULT_FIFTYONE_CONFIG.deliveryPoll;
        if (value === null || typeof value !== 'object')
            return fallback;
        const candidate = value;
        return {
            attempts: typeof candidate.attempts === 'number' &&
                Number.isInteger(candidate.attempts) &&
                candidate.attempts > 0
                ? candidate.attempts
                : fallback.attempts,
            intervalMs: typeof candidate.intervalMs === 'number' &&
                Number.isFinite(candidate.intervalMs) &&
                candidate.intervalMs >= 0
                ? candidate.intervalMs
                : fallback.intervalMs,
        };
    };
    return {
        ...merged,
        deliveryPoll: poll(override?.deliveryPoll),
        dwellBeforeGreetMs: numberRange(override?.dwellBeforeGreetMs, DEFAULT_FIFTYONE_CONFIG.dwellBeforeGreetMs),
        dwellBeforeReplyMs: numberRange(override?.dwellBeforeReplyMs, DEFAULT_FIFTYONE_CONFIG.dwellBeforeReplyMs),
        dwellBeforeApplyMs: numberRange(override?.dwellBeforeApplyMs, DEFAULT_FIFTYONE_CONFIG.dwellBeforeApplyMs),
    };
}
/**
 * 51job 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 两条必须显式带上，否则会**悄悄改变行为**：
 *   * 阿里云 WAF 滑块：`waf-nc-title` 文案 + `aliyunwaf_` 脚本名（get_jobs 实战特征）；
 *   * 登录墙用的是**很宽的词**（`登录|注册|扫码`），而不是通用词表里那几个完整短语 ——
 *     收紧成"扫码登录"这类短语会让一条"登录后继续"的墙**判不出来**，
 *     而 `auth.isLoggedIn` 正是靠 `block !== 'login-required'` 反推的：
 *     判不出来就会报告"已登录"，然后安静地抓到 0 条（正是本项目一直在修的那类静默失败）；
 *   * `loginTextLength` 放到极大 = **保留**它原本"没有长度上限"的语义。
 *     通用词表的 800 上限是为了防"导航栏里有『登录』但没卡片"的误判，
 *     那是个**收紧**，应当作为独立改动 + 独立断言来做，不能混在迁移里。
 */
export const FIFTYONE_BLOCK_SIGNALS = {
    captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
    loginText: ['登录', '注册', '扫码'],
    loginTextLength: 1_000_000,
    // 51job 的 blank 阈值是 80（不是通用的 120）：它的空结果页有一两百字的筛选器文案，
    // 阈值放大到 120 会让"搜到 0 条"被误判成"页面空白"，错误码与界面提示都跟着变。
    blankTextLength: 80,
};
//# sourceMappingURL=config.js.map