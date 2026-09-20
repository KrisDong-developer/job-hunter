/**
 * BOSS 直聘的配置面：选择器集 / 城市码 / 接口参数 / 默认配置与 merge。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import { numberRange } from '../../config-merge.js';
/**
 * 列表接口（**薪资明文的唯一来源**）—— 2026-09-19 实测它的调用形态：
 * `POST` + 表单体（不是 JSON！），体形如
 * `page=1&pageSize=15&city=101280600&query=Java&…&scene=1`，
 * 响应 `{code:0, zpData:{resCount, hasMore, jobList:[{encryptJobId, salaryDesc, …}]}}`。
 *
 * ⚠️ 顺带纠正一条旧结论：**接口的 `page` 参数是有效的**（实测站点滚动时会依次发
 * page=1,2,3…）。之前"BOSS 只能滚动加载、`&page=2` 无效"说的是**搜索页 URL 上的
 * `page` 参数被 SPA 忽略**，两件事不是一回事 —— 但本适配器的翻页模型没变
 * （`hasNextPage` 仍恒 false、深度仍走 `scrollRounds`），因为**列表仍以 DOM 为准**。
 */
export const ZHIPIN_JOBLIST_API_PATH = '/wapi/zpgeek/search/joblist.json';
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export const ZHIPIN_CITY_CODES = {
    北京: '101010100',
    上海: '101020100',
    广州: '101280100',
    深圳: '101280600',
    杭州: '101210100',
    成都: '101270100',
    南京: '101190100',
    苏州: '101190400',
    天津: '101030100',
    重庆: '101040100',
    武汉: '101200100',
    西安: '101110100',
    长沙: '101250100',
    郑州: '101180100',
    青岛: '101120200',
    合肥: '101220100',
    大连: '101070200',
    东莞: '101281600',
    佛山: '101280800',
    厦门: '101230200',
};
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export const ZHIPIN_JOB_ID_PATTERN = '/job_detail/([0-9a-zA-Z~_-]+)\\.html';
/** 会话页筛选 tab 的文案（2026-09-18 实测：全部 / 未读 / 新招呼 / 仅沟通）。 */
export const INBOX_TAB_LABELS = {
    all: '全部',
    unread: '未读',
    newGreet: '新招呼',
    communicated: '仅沟通',
};
/** 求职者端会话页（登录后可见；收件箱与投递入口）。 */
export const ZHIPIN_CHAT_URL = 'https://www.zhipin.com/web/geek/chat';
/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export const ZHIPIN_MAX_PAGES = 1;
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export const ZHIPIN_PAGE_SIZE = 15;
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export const ZHIPIN_MAX_SCROLL_ROUNDS = 20;
export const DEFAULT_ZHIPIN_CONFIG = {
    selectors: {
        card: '.job-card-wrap',
        cardBox: '.job-card-box',
        jobName: '.job-name',
        salary: '.job-salary',
        tagList: '.tag-list li',
        company: '.boss-name, .company-name',
        location: '.company-location',
    },
    detailSelectors: {
        title: '.info-primary .name h1, .name h1',
        salary: '.info-primary .salary, .salary',
        // 2026-09-18 实测：`.text-experiece` 是官方自己的拼写（不是笔误）
        experience: '.info-primary .text-experiece',
        degree: '.info-primary .text-degree',
        // 旧版标签：新页面已命中 0，留作兜底
        tags: '.info-primary .tag-list span',
        keywordList: '.job-keyword-list li',
        jdText: '.job-sec-text',
        // 公司介绍里也有一份 `.job-sec-text`（带 fold-text）——必须排除，否则会把公司简介当 JD
        jdExclude: '.job-detail-company',
        companySider: '.sider-company',
        companyLink: '.sider-company .company-info a',
        companyFacts: '.sider-company p',
        companyTags: '.sider-company .res-industry-item, .company-info-item',
    },
    chatSelectors: {
        /**
         * 「立即沟通 / 继续沟通」入口候选。
         *
         * 2026-09-18 真实登录态详情页实测（两个不同岗位各一次）命中数：
         * `a[redirect-url*="/web/geek/chat"]` 2 · `a[data-url*="/friend/add"]` 2 ·
         * `a.btn-startchat` 2 · `[ka^="go_chat"]` 1 · `[ka*="gochat"]` 1；
         * `[ka="job_detail_chat"]` 0 · `.op-btn-chat` 0（保留作其它版式兜底）。
         * 命中 2 是因为页面顶部与底部各有一个沟通入口。
         *
         * ⚠️ 刻意**不含** `.btn-startchat-wrap`（BossHunter 原候选里有，且给它减分）：
         * 它是**容器 div**，里面才是 `a.btn-startchat`；而逗号选择器返回的是**文档顺序**，
         * 容器总排在链接之前 —— 带上它就会点到容器而不是链接本身。
         */
        chatButton: '.btn-startchat, a[redirect-url*="/web/geek/chat"], a[data-url*="/friend/add"], ' +
            '[ka^="go_chat"], [ka*="gochat"], [ka="job_detail_chat"], .op-btn-chat',
        presetPopup: '.greet-boss-pop, .greet-pop',
        startchatDialog: '.dialog-wrap.startchat-dialog',
        startchatInput: 'textarea.input-area, textarea',
        dialogConfirm: '[ka="dialog_confirm"], .btn-sure',
        dialogSend: '.send-message, [ka="dialog_confirm"], .btn-sure, .btn-send',
        /** 会话输入框：✅ 2026-09-18 实测 `div#chat-input.chat-input[contenteditable=true]`。 */
        chatInput: '#chat-input',
        /** 发送按钮：✅ 实测 `button.btn-v2.btn-sure-v2.btn-send`（文案「发送」；空内容时带 `disabled`）。 */
        sendButton: '.btn-send',
        /** 消息列表容器：✅ 实测 `div.chat-record`。 */
        messageList: '.chat-record',
        /** 「我发出的」消息：✅ 实测 `li.message-item.item-myself`。 */
        myMessage: '.message-item.item-myself, .item-myself, [class*="item-my"]',
        /** 消息正文：✅ 实测 `div.message-content`。 */
        messageText: '.message-content, .text, .message-text',
        /** 送达状态：✅ 实测 `i.message-status.status-delivery`，文案形如 `[送达]`。 */
        messageStatus: '.message-status',
        /**
         * 工具条「发简历 / 换电话 / 换微信」。
         *
         * ⚠️ 2026-09-18 实测：求职者端工具条按钮是 **`.toolbar-btn`**（`.operate-btn` /
         * `.operate-icon-item` 是**招聘者端**的，命中 0）。且「发简历」带 `unable`、
         * `aria-label="求简历：双方回复后可用"` —— **对方回复之后才可用**。
         */
        resumeButton: '.toolbar-btn, .toolbar-btn-content .toolbar-btn',
        /** 工具条按钮不可用的类名标记（实测：`unable`）。 */
        resumeButtonDisabledClass: 'unable',
        /**
         * 平台简历选择弹窗。⚠️ **未实测** —— 本次会话里「发简历」是 `unable`（双方未回复），
         * 弹窗根本没机会打开。保留 BossHunter 的类名待下次校准。
         */
        resumeDialog: '.choose-resume-dialog',
        resumeDialogItem: '.choose-resume-dialog .list-item',
        resumeDialogConfirm: '.choose-resume-dialog .btn-confirm',
        /** 会话里已发出的简历卡片（用于校验）。⚠️ 同上，未实测。 */
        resumeCard: '.resume-card, [class*="resume-card"], [class*="resumeCard"]',
        /**
         * 本地文件选择器。
         *
         * ⚠️ 2026-09-18 实测：页面上**确实有** `input[type=file]`，但**都不是"在会话里发本地简历"**：
         *   * `.upload-resume-dialog` 里的那个（accept 含 `.doc/.docx/.pdf`）是
         *     **「上传附件简历」到"我的简历"**（弹窗文案「拖拽文件到这里…上传附件简历」）；
         *   * `.btn-sendimg` 里的那个（accept 只有图片）是**发图片**。
         * 所以 `sendResume(filePath≠null)` **不能**拿它们冒充投递 —— 见该方法里的说明。
         */
        fileInput: 'input[type=file]',
    },
    inboxSelectors: {
        // ✅ 实测（2026-09-18 空列表外壳）：容器与空态都在 `.chat-content .user-list` 里
        listContainer: '.chat-content .user-list',
        emptyState: '.user-list .no-data, .chat-no-data .no-data-text',
        filterTabs: '.label-list',
        tabItem: '.label-list li',
        // ✅ 实测（2026-09-18 真实会话行）：行就是 `li[role=listitem]`，位于
        //    `.user-list > .user-list-content > ul[role=group] > li` —— 注意**不是** `.user-list` 的直接子级。
        //    后面两条是同一元素的结构式/宽松写法，作版式变动时的兜底。
        row: 'li[role=listitem], .user-list-content > ul[role="group"] > li, .chat-content .user-list li',
        // 行内字段：✅ 2026-09-18 全部实测通过（`.name-box` 的 span 依次是 名字 / 公司 / 头衔）
        name: '.name-text, .geek-name, .user-name',
        nameBox: '.name-box, .name-contet',
        lastMessage: '.last-msg-text, .push-text',
        status: '.message-status',
        // ⚠️ 未读标记仍未实测：本次那条会话是我们刚发的（`status-delivery`），没有未读徽章可看
        unread: '.unread-count, .badge-count, .notice-badge, .red-dot, [class*="unread"]',
        // ✅ 实测：时间节点确实存在，就是 `.time`（形如 `00:53`）
        time: '.time, .time-shadow',
    },
    urlParams: {
        base: 'https://www.zhipin.com/web/geek/job',
        keywordParam: 'query',
        cityParam: 'city',
    },
    chatUrl: ZHIPIN_CHAT_URL,
    inboxTab: 'all',
    cityCodes: ZHIPIN_CITY_CODES,
    jobIdPattern: ZHIPIN_JOB_ID_PATTERN,
    // 一轮滚动给站点留 12 秒（实测每轮 1–3 秒就追加完，留足余量但不至于卡死整轮预算）
    scrollStepTimeoutMs: 12_000,
    // BossHunter `browse_before_greet` 同款区间：打开岗位页先"看一会儿"再动手
    dwellBeforeGreetMs: [15_000, 30_000],
    // 会话里回复前的"读完再回"（3–8s）；发简历是不可逆的一步，给得更长（8–16s）
    dwellBeforeReplyMs: [3_000, 8_000],
    dwellBeforeResumeMs: [8_000, 16_000],
    actionWaitMs: 15_000,
    deliveryPoll: { attempts: 12, intervalMs: 500 },
    loginSelectors: {
        // 已登录：页头那个「求职者」下拉（未登录夹具里命中 0，登录态 1）
        loggedIn: 'a[ka="header-username"]',
        // 未登录：页头「登录/注册」按钮（未登录夹具 1，登录态 0）
        notLoggedIn: 'a[ka="header-login"]',
    },
    salaryApiEnabled: true,
    joblistApiPath: ZHIPIN_JOBLIST_API_PATH,
    joblistPageSize: 15,
    joblistMaxPages: 5,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_ZHIPIN_CONFIG;
    const patch = override;
    const pattern = (value, fallback) => typeof value === 'string' && value !== '' ? value : fallback;
    const positive = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    const poll = (value, fallback) => {
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
        selectors: { ...DEFAULT_ZHIPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        detailSelectors: { ...DEFAULT_ZHIPIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
        chatSelectors: { ...DEFAULT_ZHIPIN_CONFIG.chatSelectors, ...(patch.chatSelectors ?? {}) },
        inboxSelectors: { ...DEFAULT_ZHIPIN_CONFIG.inboxSelectors, ...(patch.inboxSelectors ?? {}) },
        urlParams: { ...DEFAULT_ZHIPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        chatUrl: pattern(patch.chatUrl, DEFAULT_ZHIPIN_CONFIG.chatUrl),
        inboxTab: patch.inboxTab === 'unread' || patch.inboxTab === 'newGreet' || patch.inboxTab === 'communicated'
            ? patch.inboxTab
            : DEFAULT_ZHIPIN_CONFIG.inboxTab,
        cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
        scrollStepTimeoutMs: positive(patch.scrollStepTimeoutMs, DEFAULT_ZHIPIN_CONFIG.scrollStepTimeoutMs),
        dwellBeforeGreetMs: numberRange(patch.dwellBeforeGreetMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeGreetMs),
        dwellBeforeReplyMs: numberRange(patch.dwellBeforeReplyMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeReplyMs),
        dwellBeforeResumeMs: numberRange(patch.dwellBeforeResumeMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeResumeMs),
        actionWaitMs: positive(patch.actionWaitMs, DEFAULT_ZHIPIN_CONFIG.actionWaitMs),
        deliveryPoll: poll(patch.deliveryPoll, DEFAULT_ZHIPIN_CONFIG.deliveryPoll),
        loginSelectors: { ...DEFAULT_ZHIPIN_CONFIG.loginSelectors, ...(patch.loginSelectors ?? {}) },
        salaryApiEnabled: typeof patch.salaryApiEnabled === 'boolean' ? patch.salaryApiEnabled : DEFAULT_ZHIPIN_CONFIG.salaryApiEnabled,
        joblistApiPath: pattern(patch.joblistApiPath, DEFAULT_ZHIPIN_CONFIG.joblistApiPath),
        joblistPageSize: positive(patch.joblistPageSize, DEFAULT_ZHIPIN_CONFIG.joblistPageSize),
        joblistMaxPages: positive(patch.joblistMaxPages, DEFAULT_ZHIPIN_CONFIG.joblistMaxPages),
    };
}
//# sourceMappingURL=config.js.map