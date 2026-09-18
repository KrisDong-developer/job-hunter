import { humanClick, humanType } from '../humanize.js';
import { humanDelayMs } from '../pacing.js';
import { platformFacts } from '../platform-facts.js';
import { detectBlockWithSignals, signalsOf } from '../block-signals.js';
import { platformCriterion } from '../types.js';
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
        tags: '.info-primary .tag-list span',
        jdText: '.job-sec-text',
        companySider: '.sider-company',
        companyLink: '.sider-company .company-info a',
        companyTags: '.sider-company .res-industry-item, .company-info-item',
    },
    chatSelectors: {
        // BossHunter `CHAT_BUTTON_SELECTOR`：8 条候选，命中后按可见性打分（本适配器取第一个可见+命中者）
        chatButton: 'a[redirect-url*="/web/geek/chat"], a[data-url*="/friend/add"], a.btn-startchat, ' +
            '[ka="job_detail_chat"], [ka^="go_chat"], [ka*="gochat"], .op-btn-chat, .btn-startchat-wrap',
        presetPopup: '.greet-boss-pop, .greet-pop',
        startchatDialog: '.dialog-wrap.startchat-dialog',
        startchatInput: 'textarea.input-area, textarea',
        dialogConfirm: '[ka="dialog_confirm"], .btn-sure',
        dialogSend: '.send-message, [ka="dialog_confirm"], .btn-sure, .btn-send',
        chatInput: '#chat-input',
        sendButton: '.btn-send',
        messageList: '.chat-record',
        myMessage: '.message-item.item-myself, .item-myself, [class*="item-my"]',
        messageText: '.message-content, .text, .message-text',
        messageStatus: '.message-status',
        resumeButton: '.operate-btn, .operate-icon-item, .toolbar-box .operate-btn',
        resumeDialog: '.choose-resume-dialog',
        resumeDialogItem: '.choose-resume-dialog .list-item',
        resumeDialogConfirm: '.choose-resume-dialog .btn-confirm',
        resumeCard: '.resume-card, [class*="resume-card"], [class*="resumeCard"]',
        fileInput: 'input[type=file]',
    },
    inboxSelectors: {
        row: 'li[role=listitem]',
        name: '.name-text',
        nameBox: '.name-box',
        lastMessage: '.last-msg-text',
        status: '.message-status',
        unread: '.unread-count, .badge-count, .notice-badge, [class*="unread"]',
    },
    urlParams: {
        base: 'https://www.zhipin.com/web/geek/job',
        keywordParam: 'query',
        cityParam: 'city',
    },
    chatUrl: ZHIPIN_CHAT_URL,
    cityCodes: ZHIPIN_CITY_CODES,
    jobIdPattern: ZHIPIN_JOB_ID_PATTERN,
    // 一轮滚动给站点留 12 秒（实测每轮 1–3 秒就追加完，留足余量但不至于卡死整轮预算）
    scrollStepTimeoutMs: 12_000,
    // BossHunter `browse_before_greet` 同款区间：打开岗位页先"看一会儿"再动手
    dwellBeforeGreetMs: [15_000, 30_000],
    actionWaitMs: 15_000,
    deliveryPoll: { attempts: 12, intervalMs: 500 },
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_ZHIPIN_CONFIG;
    const patch = override;
    const pattern = (value, fallback) => typeof value === 'string' && value !== '' ? value : fallback;
    const positive = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    const range = (value, fallback) => {
        if (!Array.isArray(value) || value.length < 2)
            return fallback;
        const [min, max] = value;
        if (typeof min !== 'number' ||
            typeof max !== 'number' ||
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            min < 0 ||
            max < min) {
            return fallback;
        }
        return [min, max];
    };
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
        cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
        scrollStepTimeoutMs: positive(patch.scrollStepTimeoutMs, DEFAULT_ZHIPIN_CONFIG.scrollStepTimeoutMs),
        dwellBeforeGreetMs: range(patch.dwellBeforeGreetMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeGreetMs),
        actionWaitMs: positive(patch.actionWaitMs, DEFAULT_ZHIPIN_CONFIG.actionWaitMs),
        deliveryPoll: poll(patch.deliveryPoll, DEFAULT_ZHIPIN_CONFIG.deliveryPoll),
    };
}
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
        params.set(config.urlParams.cityParam, code);
    }
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
/**
 * **在页面上下文里**滚动加载：滚到底 → 等新卡片出现 → 重复。
 *
 * 为什么需要它：BOSS 的搜索结果**没有可寻址的第 N 页**（`&page=2` 实测无效），
 * 唯一的翻页手段就是滚动触发的懒加载。所以"抓得更深"只能在一次页面加载之内做厚。
 *
 * 两个刻意的收手条件：
 *   * 某一轮**没有新增卡片**就停（平台封顶 300 条时就是这个表现，再滚也是白滚）；
 *   * 每轮只等到 `stepTimeoutMs` —— 站点不响应时不能让整轮预算被一个页面吃干。
 *
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export async function scrollToLoadInPage(arg) {
    const count = () => {
        try {
            return document.querySelectorAll(arg.card).length;
        }
        catch {
            return 0;
        }
    };
    const sleep = (ms) => new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
    let loaded = count();
    for (let round = 0; round < arg.rounds; round += 1) {
        try {
            window.scrollTo(0, document.body.scrollHeight);
        }
        catch {
            /* 离线夹具没有滚动（静态 DOM），靠下面的超时收手 */
        }
        const deadline = Date.now() + arg.stepTimeoutMs;
        let grew = false;
        while (Date.now() < deadline) {
            await sleep(400);
            const current = count();
            if (current > loaded) {
                loaded = current;
                grew = true;
                break;
            }
        }
        if (!grew)
            break;
    }
    return loaded;
}
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export function extractJobsInPage(arg) {
    const out = [];
    let cards = null;
    try {
        cards = document.querySelectorAll(arg.selectors.card);
    }
    catch {
        return out;
    }
    if (cards === null)
        return out;
    let idRe = null;
    try {
        idRe = new RegExp(arg.jobIdPattern);
    }
    catch {
        idRe = null;
    }
    for (const card of Array.from(cards)) {
        let box = card;
        try {
            box = card.querySelector(arg.selectors.cardBox) ?? card;
        }
        catch {
            box = card;
        }
        let nameEl = null;
        try {
            nameEl = box.querySelector(arg.selectors.jobName);
        }
        catch {
            nameEl = null;
        }
        if (nameEl === null)
            continue;
        const href = nameEl.getAttribute('href') ?? '';
        if (href === '')
            continue;
        let sourceUrl = href;
        try {
            sourceUrl = new URL(href, location.origin).href;
        }
        catch {
            /* 原样给，字段断言会兜 */
        }
        const title = (nameEl.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '')
            continue;
        const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null;
        const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : '';
        // 未登录薪资隐藏：元素在、文本空 —— 留空（requiredFields 不含 salary_raw）。
        let salaryRaw = '';
        try {
            salaryRaw = (box.querySelector(arg.selectors.salary)?.textContent ?? '').replace(/\s+/g, '').trim();
        }
        catch {
            salaryRaw = '';
        }
        // tag-list 固定顺序：经验 / 学历（夹具实测）。
        let expReq = '';
        let eduReq = '';
        try {
            const tags = Array.from(box.querySelectorAll(arg.selectors.tagList))
                .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
                .filter((text) => text !== '');
            expReq = tags[0] ?? '';
            eduReq = tags[1] ?? '';
        }
        catch {
            /* 留空 */
        }
        let company = '';
        try {
            company = (box.querySelector(arg.selectors.company)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            company = '';
        }
        // 「城市·区域·地标」→ city / district（夹具实测如「深圳·福田区·车公庙」）。
        let city = '';
        let district = '';
        try {
            const locationText = (box.querySelector(arg.selectors.location)?.textContent ?? '')
                .replace(/\s+/g, '')
                .trim();
            const parts = locationText.split('·');
            city = parts[0] ?? '';
            district = parts[1] ?? '';
        }
        catch {
            /* 留空 */
        }
        const notes = [];
        if (platformJobId === '')
            notes.push('jobIdPattern 未命中，待校准');
        if (salaryRaw === '')
            notes.push('未登录视图薪资隐藏（登录后可升级）');
        out.push({
            platformJobId,
            title,
            salaryRaw,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(district === '' ? {} : { district }),
            ...(expReq === '' ? {} : { expReq }),
            ...(eduReq === '' ? {} : { eduReq }),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**解析详情页（BossHunter `JS_EXTRACT_DETAIL` 对齐）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 */
export function extractDetailInPage(arg) {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const textOf = (node) => (node === null ? '' : clean(node.textContent));
    const queryOne = (selector) => {
        try {
            return document.querySelector(selector);
        }
        catch {
            return null;
        }
    };
    const queryAll = (selector) => {
        try {
            return Array.from(document.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    // 标题：`.info-primary .name h1` → `.name h1` → 文档标题去后缀（BossHunter 同款兜底链）
    let title = textOf(queryOne(arg.selectors.title));
    if (title === '') {
        const documentTitle = clean(document.title);
        const head = documentTitle.split('-')[0];
        title = head === undefined ? '' : clean(head);
    }
    const salaryRaw = textOf(queryOne(arg.selectors.salary)).replace(/\s+/g, '');
    // tag-list 顺序固定：先经验、后学历（夹具实测）。
    const tags = queryAll(arg.selectors.tags)
        .map((tag) => clean(tag.textContent))
        .filter((text) => text !== '');
    const expReq = tags[0] ?? '';
    const eduReq = tags[1] ?? '';
    // JD 正文
    const jdText = textOf(queryOne(arg.selectors.jdText));
    // 公司名：取公司链接里第一个不含 http 的文本，兜底用标题里的 `_XXX招聘`
    let company = '';
    for (const link of queryAll(arg.selectors.companyLink)) {
        const text = clean(link.textContent);
        if (text !== '' && !text.includes('http')) {
            company = text;
            break;
        }
    }
    if (company === '') {
        const match = /_(.+?)招聘/.exec(clean(document.title));
        company = match === null ? '' : clean(match[1]);
    }
    // 规模/行业：含「人」的是规模，其余第一个是行业（BossHunter 同款判定）
    let companySize = '';
    let industry = '';
    for (const tag of queryAll(arg.selectors.companyTags)) {
        const text = clean(tag.textContent);
        if (text === '')
            continue;
        if (text.includes('人'))
            companySize = text;
        else if (industry === '')
            industry = text;
    }
    const notes = [];
    if (jdText === '')
        notes.push('JD 未锚定（job-sec-text 待校准）');
    if (title === '')
        notes.push('详情标题未锚定，待校准');
    if (company === '')
        notes.push('详情公司名未锚定，待校准');
    if (salaryRaw === '')
        notes.push('详情薪资未锚定，待校准');
    return {
        platformJobId: '',
        title,
        salaryRaw,
        company,
        // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
        sourceUrl: location.href,
        ...(expReq === '' ? {} : { expReq }),
        ...(eduReq === '' ? {} : { eduReq }),
        ...(industry === '' ? {} : { industry }),
        ...(companySize === '' ? {} : { companySize }),
        ...(jdText === '' ? {} : { jdText }),
        ...(notes.length === 0 ? {} : { notes }),
    };
}
/**
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标。
 *
 * 打分规则（BossHunter `CHAT_BUTTON_SCRIPT_FOR_TESTS` 的简化版，保留关键判据）：
 * 只统计**可见**（有尺寸且没被 display/visibility/pointer-events 关掉）的元素；
 * `textIncludes` 非空时再按文本过滤。取第一个命中即可 —— 候选选择器本身已经按优先级排好。
 *
 * ⚠️ 必须完全自包含。`scrollIntoView` 在离线夹具里不存在，故整段 try/catch。
 */
export function elementCenterInPage(arg) {
    const empty = { found: false, x: 0, y: 0, text: '', href: '' };
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    let nodes = [];
    try {
        nodes = Array.from(document.querySelectorAll(arg.selector));
    }
    catch {
        return empty;
    }
    const wanted = norm(arg.textIncludes);
    const visible = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            // ⚠️ 必须写成 `window.getComputedStyle`：本函数会被序列化送进页面执行，
            // 裸 `getComputedStyle` 只有浏览器全局有；离线夹具（jsdom）里只挂了 `window`。
            const style = window.getComputedStyle(el);
            return (rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none');
        }
        catch {
            return false;
        }
    };
    const chosen = nodes.find((el) => visible(el) && (wanted === '' || norm(el.textContent).includes(wanted)));
    if (chosen === undefined)
        return empty;
    try {
        chosen.scrollIntoView({ block: 'center', inline: 'center' });
    }
    catch {
        /* 离线夹具没有布局引擎 */
    }
    let rect;
    try {
        rect = chosen.getBoundingClientRect();
    }
    catch {
        return empty;
    }
    const viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 1024;
    const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 768;
    const x = Math.min(Math.max(rect.x + rect.width / 2, 0), Math.max(0, viewportWidth - 1));
    const y = Math.min(Math.max(rect.y + rect.height / 2, 0), Math.max(0, viewportHeight - 1));
    const href = chosen.getAttribute('redirect-url') ?? chosen.getAttribute('data-url') ?? chosen.getAttribute('href') ?? '';
    return { found: true, x, y, text: norm(chosen.textContent).slice(0, 120), href };
}
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export function hasSelectorInPage(arg) {
    try {
        return document.querySelector(arg.selector) !== null;
    }
    catch {
        return false;
    }
}
/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export function detectGreetPopupInPage(arg) {
    const visible = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden');
        }
        catch {
            return false;
        }
    };
    try {
        const preset = Array.from(document.querySelectorAll(arg.selectors.presetPopup)).some((el) => visible(el));
        if (preset)
            return { kind: 'preset' };
        for (const dialog of Array.from(document.querySelectorAll(arg.selectors.startchatDialog))) {
            if (!visible(dialog))
                continue;
            if (dialog.querySelector(arg.selectors.startchatInput) !== null)
                return { kind: 'startchat' };
        }
    }
    catch {
        /* 选择器非法 → none */
    }
    return { kind: 'none' };
}
/**
 * **在页面上下文里**读会话消息，判断"我们发的那条"到了哪一步。
 *
 * 判据取自 BossHunter `_message_delivery_state`：
 *   * 消息文本比对前先去掉零宽字符与「发送中/已读/未读/送达」这类尾标；
 *   * `.message-status` 带 `status-error` → 发送失败；`status-loading` → 发送中；
 *     其余视为已送达。
 * 找不到对应消息 → `missing`（**绝不能**把"没看到"当成"已送达"）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readChatMessagesInPage(arg) {
    const norm = (value) => (value ?? '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    const stripTail = (value) => norm(value)
        .replace(/(发送中|已读|未读|送达|发送成功|重试|重新发送)$/g, '')
        .trim();
    const expected = norm(arg.expectText);
    if (expected === '')
        return { state: 'missing' };
    let list = null;
    try {
        list = document.querySelector(arg.selectors.messageList);
    }
    catch {
        list = null;
    }
    if (list === null)
        return { state: 'missing' };
    let nodes = [];
    try {
        nodes = Array.from(list.querySelectorAll(arg.selectors.myMessage));
    }
    catch {
        nodes = [];
    }
    const states = [];
    for (const node of nodes) {
        let text = '';
        try {
            const content = node.querySelector(arg.selectors.messageText);
            text = stripTail(content === null ? node.textContent : content.textContent);
        }
        catch {
            text = '';
        }
        if (text === '' || !text.includes(expected))
            continue;
        let statusClass = '';
        try {
            statusClass = node.querySelector(arg.selectors.messageStatus)?.getAttribute('class') ?? '';
        }
        catch {
            statusClass = '';
        }
        states.push(statusClass.includes('error') ? 'failed' : statusClass.includes('loading') ? 'pending' : 'delivered');
    }
    if (states.length === 0)
        return { state: 'missing' };
    if (states.includes('delivered'))
        return { state: 'delivered' };
    if (states.includes('pending'))
        return { state: 'pending' };
    return { state: 'failed' };
}
/**
 * **在页面上下文里**解析收件箱（求职者端会话列表）。
 *
 * 结构（BossHunter `JS_EXTRACT_CHAT_LIST` 实测）：
 *   li[role=listitem]
 *     ├ .name-box                              ← 名字容器
 *     │    ├ span[0] = HR 名
 *     │    ├ span[1] = 公司名
 *     │    └ span[last] = HR 头衔
 *     ├ .name-text                             ← HR 名（独立节点，更稳）
 *     ├ .last-msg-text                         ← 最后一条消息
 *     └ .message-status                        ← 方向线索（status-read/status-delivery 是"我发的"）
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记**
 * —— 收件箱的用途是"有没有人回我"，漏报比误报贵（BossHunter 同样把不确定行
 * 当作候选回复来处理）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readInboxInPage(arg) {
    const out = [];
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    let rows = [];
    try {
        rows = Array.from(document.querySelectorAll(arg.selectors.row));
    }
    catch {
        return out;
    }
    rows.forEach((row, index) => {
        let name = '';
        try {
            name = norm(row.querySelector(arg.selectors.name)?.textContent);
        }
        catch {
            name = '';
        }
        if (name === '')
            return;
        let company = '';
        try {
            const spans = Array.from(row.querySelectorAll(`${arg.selectors.nameBox} span`));
            const second = spans[1];
            company = second === undefined ? '' : norm(second.textContent);
        }
        catch {
            company = '';
        }
        let lastMessage = '';
        let lastClass = '';
        try {
            const node = row.querySelector(arg.selectors.lastMessage);
            lastMessage = norm(node?.textContent);
            lastClass = (node?.getAttribute('class') ?? '').toLowerCase();
        }
        catch {
            lastMessage = '';
        }
        let statusClass = '';
        try {
            statusClass = (row.querySelector(arg.selectors.status)?.getAttribute('class') ?? '').toLowerCase();
        }
        catch {
            statusClass = '';
        }
        // 「我发的」有明确的送达/已读标记；分不清就按 HR 记（见函数头）。
        const isOurs = statusClass.includes('status-read') ||
            statusClass.includes('status-delivery') ||
            /(myself|self|mine|outgoing|send)/.test(lastClass);
        let unread = false;
        try {
            unread = row.querySelector(arg.selectors.unread) !== null;
        }
        catch {
            unread = false;
        }
        const rawId = row.getAttribute('id') ?? '';
        const conversationId = rawId !== '' ? rawId : company === '' ? `${name}#${String(index)}` : `${name}|${company}`;
        out.push({
            conversationId,
            hrName: name,
            company,
            lastMessage,
            direction: isOurs ? 'me' : 'hr',
            unread,
            // 时间：求职者端会话行的时间节点**尚无实测证据**，不编选择器 —— 留 null。
            at: null,
        });
    });
    return out;
}
/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export function chatRowMatchesInPage(arg) {
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const company = norm(arg.company);
    const expected = norm(arg.expectText);
    if (company === '' || expected === '')
        return false;
    let rows = [];
    try {
        rows = Array.from(document.querySelectorAll(arg.selectors.row));
    }
    catch {
        return false;
    }
    return rows.some((row) => {
        const text = norm(row.textContent);
        return text.includes(company) && text.includes(expected);
    });
}
/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_ZHIPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 本次要滚动加载几轮（`scrollRounds` 维度，方案里配）。
     *
     * 缺省 1 = 只读当前这一屏 15 条（**与改动前行为一致**：保守是默认，加深度要显式配）。
     * 上限取平台自报的 `totalCount / 15`，不是我们拍的保守值 —— 再多滚平台也不给。
     */
    const scrollRoundsOf = (criteria) => {
        const parsed = Number.parseInt(platformCriterion(criteria, 'scrollRounds'), 10);
        if (!Number.isFinite(parsed) || parsed <= 1)
            return 1;
        return Math.min(parsed, ZHIPIN_MAX_SCROLL_ROUNDS);
    };
    /**
     * 等元素出现。
     *
     * 两条路径的**失败形态不同**，必须都归一成布尔：
     *   * 真页面 = Playwright `waitForSelector`：超时**抛错**，成功返回 Locator；
     *   * 离线夹具 = 返回 `true` / `false`（静态 DOM 查一次）。
     * 所以既不能只看"有没有抛错"（会漏掉夹具的 false），也不能只看返回值。
     */
    const waitFor = async (page, selector, timeoutMs) => {
        if (page.waitForSelector !== undefined) {
            try {
                const ready = await page.waitForSelector(selector, timeoutMs);
                return ready !== false;
            }
            catch {
                return false;
            }
        }
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            if (await page.evaluate(hasSelectorInPage, { selector }))
                return true;
            if (Date.now() >= deadline)
                return false;
            await page.waitForTimeout(150);
        }
    };
    /** 定位一个可见元素并返回它的信息（不点击）。 */
    const locate = async (page, selector, textIncludes) => await page.evaluate(elementCenterInPage, textIncludes === undefined ? { selector } : { selector, textIncludes });
    /** 拟人点击一个选择器；返回定位信息（失败返回 null）。没有 CDP 鼠标 → 直接 null。 */
    const clickSelector = async (page, selector, textIncludes) => {
        const mouse = page.mouse;
        if (mouse === undefined)
            return null;
        const info = await locate(page, selector, textIncludes);
        if (!info.found)
            return null;
        await humanClick(mouse, info.x, info.y, { wait: (ms) => page.waitForTimeout(ms) });
        return info;
    };
    /** 等某个选择器出现（轮询）；超时返回 false。 */
    const waitForPopup = async (page, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const state = await page.evaluate(detectGreetPopupInPage, {
                selectors: config.chatSelectors,
            });
            if (state.kind !== 'none')
                return state.kind;
            if (Date.now() >= deadline)
                return 'none';
            await page.waitForTimeout(250);
        }
    };
    /** 读当前会话里这条消息的送达状态。 */
    const readDelivery = async (page, text) => (await page.evaluate(readChatMessagesInPage, {
        selectors: config.chatSelectors,
        expectText: text,
    })).state;
    /**
     * 轮询确认送达。看到 `delivered` 后**再等一拍复核一次** ——
     * 消息可能在"曾经出现"之后被平台回滚，一次采样不足以记为送达
     * （BossHunter `_message_delivery_state` 的稳定性复核同款）。
     */
    const waitForDelivery = async (page, text) => {
        const { attempts, intervalMs } = config.deliveryPoll;
        let last = 'missing';
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            last = await readDelivery(page, text);
            if (last === 'failed')
                return 'failed';
            if (last === 'delivered') {
                await page.waitForTimeout(Math.max(800, intervalMs));
                const confirm = await readDelivery(page, text);
                return confirm === 'delivered' ? 'delivered' : confirm;
            }
            await page.waitForTimeout(intervalMs);
        }
        return last;
    };
    /** 打开某公司的会话（收件箱 → 点那一行）。 */
    const openConversation = async (page, job) => {
        const hint = job.company !== '' ? job.company : job.title;
        if (hint === '')
            return false;
        await page.goto(config.chatUrl);
        if (!(await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)))
            return false;
        const row = await clickSelector(page, config.inboxSelectors.row, hint);
        if (row === null)
            return false;
        return await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs);
    };
    /** 清空并逐字符输入（走 humanize；没有修饰键能力时跳过清空）。 */
    const clearAndType = async (page, selector, text) => {
        const keyboard = page.keyboard;
        if (keyboard === undefined)
            return false;
        if ((await clickSelector(page, selector)) === null)
            return false;
        if (keyboard.down !== undefined && keyboard.up !== undefined) {
            const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
            await keyboard.down(modifier);
            await keyboard.press('KeyA');
            await keyboard.up(modifier);
            await keyboard.press('Backspace');
        }
        await humanType(keyboard, text, { wait: (ms) => page.waitForTimeout(ms) });
        return true;
    };
    /** 打招呼前在岗位页停留一段时间（BossHunter `browse_before_greet`）。 */
    const dwellBeforeGreet = async (page) => {
        const [min, max] = config.dwellBeforeGreetMs;
        if (max <= 0)
            return;
        await page.waitForTimeout(Math.round(min + Math.random() * Math.max(0, max - min)));
    };
    const missingInputSurface = () => ({
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '当前页面没有提供 CDP 输入能力（page.mouse / page.keyboard）—— 拒绝用 DOM 事件冒充真人点击' +
            '（isTrusted=false 是最廉价的自动化特征）。这条动作按未发送处理。',
    });
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: ZHIPIN_MAX_PAGES,
            hint: 'BOSS 搜索页**没有可寻址的第 N 页**（2026-09-18 实测 `&page=2` 返回同一批数据）—— 深度改用「滚动加载轮数」',
        },
        {
            key: 'scrollRounds',
            label: '加载轮数',
            values: [],
            max: ZHIPIN_MAX_SCROLL_ROUNDS,
            hint: `BOSS 没有页码翻页，只能滚动加载：每滚一次 +${String(ZHIPIN_PAGE_SIZE)} 条。` +
                '填 1 = 只读第一屏 15 条；填 4 ≈ 60 条。平台自报 totalCount 封顶 300 条（= 20 轮），' +
                '再滚也没有新数据。轮数越大请求越密、风控风险越高 —— 保守起见先配 2–4 试。',
        },
    ];
    return {
        id: 'zhipin',
        ...platformFacts('zhipin'),
        displayName: 'BOSS直聘',
        capabilities: {
            // 夹具实测：未登录可见列表；但薪资隐藏 → 如实两说。
            searchWithoutLogin: true,
            // 平台能发简历（工具条「发简历」→ 选择简历 → 确认）；但我们**不能**把本地 PDF 传进会话
            // —— sendResume 只在页面存在 input[type=file] 时才上传本地文件，否则走平台简历。
            supportsAttachment: true,
            // 会话里区分 status-read / status-delivery（BossHunter 实测），平台有回执可读。
            supportsReadReceipt: true,
            supportsInbox: true,
            supportsGreeting: true,
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        // 未登录薪资隐藏：salary_raw 不进必需字段（否则全部被隔离）。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: ZHIPIN_MAX_PAGES,
        // 没有可寻址的页码（滚动加载走 scrollRounds 维度）—— 页数恒 1。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildZhipinSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildZhipinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    try {
                        await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                    }
                    catch {
                        /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
                    }
                }
                // 滚动加载（`scrollRounds`，方案里配）：BOSS 的"翻页"只发生在页面内 ——
                // 第一屏已经在上面等到了，这里再滚 (rounds - 1) 次把它读厚。
                const rounds = scrollRoundsOf(criteria);
                if (rounds > 1) {
                    await page.evaluate(scrollToLoadInPage, {
                        card: config.selectors.card,
                        rounds: rounds - 1,
                        stepTimeoutMs: config.scrollStepTimeoutMs,
                    });
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                });
            },
            async hasNextPage() {
                // 恒 false 是**平台事实**，不是没实现：2026-09-18 登录态实测，搜索页没有页码分页区，
                // 且 `&page=2` 返回的前 3 个岗位 id 与第 1 页完全相同（SPA 忽略该参数）——
                // 也就是说"下一页"这个东西在这个站点**不可寻址**。深度靠滚动加载（见 gotoSearch）。
                // 证据：test/fixtures/zhipin-pagination-report.json 的 `urlPaging.changed === false`。
                return false;
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        guard: {
            async detectBlock(page) {
                // 判墙的**通用那一半**（验证码选择器、限流/配额/登录墙文案、blank 阈值）
                // 已抽到 `block-signals.ts`；这里只声明 BOSS 特有的 URL 特征：
                // 滑块页 `https://www.zhipin.com/web/user/safe/verify-slider`（get_jobs 实证）。
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
                    card: config.selectors.card,
                });
            },
        },
        /**
         * 高危动作（§4.2.2 的 `actions`）。
         *
         * ⚠️ 这三个方法**不允许被 domain 直接调用** —— 实现放在这里，但必须由 `guard.run()`
         * 签发一次性令牌后经 `guard/actions/` 调用（§4.4.1）。适配器只负责"怎么点"。
         */
        actions: {
            /**
             * 打招呼。
             *
             * 流程（BossHunter `executor/sender.py` 的 `_send_greeting_once` 同款）：
             *   ① 打开岗位详情页 → ② 等「立即沟通」入口 → ③ 幂等检查（会话里已有同文本就不重发）
             *   → ④ 拟人停留 → ⑤ CDP 输入级点击入口 → ⑥ 处理弹窗（预设招呼语 / 首次沟通）
             *   → ⑦ 进入会话、逐字符输入话术、发送 → ⑧ 校验送达。
             *
             * 三种弹窗分支的**送达语义各不相同**，返回值里必须说清：
             *   * 预设招呼语弹窗：点确认即由平台发出**平台预设文案**（不是本次生成的话术）；
             *   * 首次沟通弹窗：在弹窗里填本次话术并提交；
             *   * 无弹窗（「继续沟通」）：直接进会话发本次话术。
             */
            async sayHello(page, job, text) {
                if (page.mouse === undefined || page.keyboard === undefined)
                    return missingInputSurface();
                await page.goto(job.sourceUrl);
                if (!(await waitFor(page, config.chatSelectors.chatButton, config.actionWaitMs))) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '岗位详情页没出现「立即沟通 / 继续沟通」入口 —— 可能岗位已关闭、未登录，或已被风控拦截。不重试。',
                    };
                }
                await dwellBeforeGreet(page);
                const entry = await clickSelector(page, config.chatSelectors.chatButton);
                if (entry === null) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '找到沟通入口但坐标定位失败（元素不可见/无尺寸），未点击。',
                    };
                }
                const popup = await waitForPopup(page, Math.min(config.actionWaitMs, 6_000));
                if (popup === 'preset') {
                    const confirmed = await clickSelector(page, config.chatSelectors.dialogConfirm);
                    if (confirmed === null) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: '平台弹出了预设招呼语弹窗，但点不到「确定」。',
                        };
                    }
                    return {
                        ok: true,
                        delivery: 'delivered',
                        evidence: 'dom',
                        message: '平台弹出了**预设招呼语**，已点确认发送 —— 发出去的是平台自带文案，不是本次生成的话术。',
                    };
                }
                let submittedInDialog = false;
                if (popup === 'startchat') {
                    if (!(await clearAndType(page, config.chatSelectors.startchatInput, text))) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: '首次沟通弹窗里找不到可输入的招呼语输入框。',
                        };
                    }
                    if ((await clickSelector(page, config.chatSelectors.dialogSend)) === null) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: '招呼语已填入首次沟通弹窗，但点不到发送按钮。',
                        };
                    }
                    submittedInDialog = true;
                }
                // 进会话：先等同页跳转；若点击另开了标签页（当前页没动），用入口自带的 redirect-url 导航过去。
                let inChat = await waitFor(page, config.chatSelectors.chatInput, 5_000);
                if (!inChat && entry.href !== '') {
                    const target = entry.href.startsWith('http') ? entry.href : `https://www.zhipin.com${entry.href}`;
                    await page.goto(target);
                    inChat = await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs);
                }
                if (!inChat && !submittedInDialog) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '点了沟通入口但没有进入会话（没出现聊天输入框），未发送。',
                    };
                }
                // 消息级幂等：进入会话后先看这条话术是否已经在里面（重新点「继续沟通」会走这里）。
                // 必须放在**进会话之后** —— 岗位详情页上没有会话消息列表，在详情页上查等于永远查不到。
                if (inChat) {
                    const existing = await readDelivery(page, text);
                    if (existing === 'delivered') {
                        return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true };
                    }
                    if (existing === 'failed' || existing === 'pending') {
                        return {
                            ok: false,
                            delivery: existing,
                            evidence: 'dom',
                            message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
                        };
                    }
                }
                if (!submittedInDialog && inChat) {
                    if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: '会话已打开，但没能把话术输入到输入框。',
                        };
                    }
                    await page.keyboard.press('Enter');
                }
                const state = await waitForDelivery(page, text);
                if (state === 'delivered')
                    return { ok: true, delivery: 'delivered', evidence: 'dom' };
                // 交叉验证：当前页看不到消息列表（例如会话在另一个标签页）时，去会话列表核对
                // 「公司 + 完整话术」是否同一行命中（BossHunter `_verify_greeting_in_chat_list`）。
                if (job.company !== '') {
                    await page.goto(config.chatUrl);
                    if (await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)) {
                        const matched = await page.evaluate(chatRowMatchesInPage, {
                            selectors: config.inboxSelectors,
                            company: job.company,
                            expectText: text,
                        });
                        if (matched)
                            return { ok: true, delivery: 'delivered', evidence: 'dom' };
                    }
                }
                if (state === 'failed') {
                    return {
                        ok: false,
                        delivery: 'failed',
                        evidence: 'dom',
                        message: '平台把这条消息标记为发送失败。',
                    };
                }
                if (state === 'pending') {
                    return {
                        ok: false,
                        delivery: 'pending',
                        evidence: 'dom',
                        message: '消息已出现在会话里但仍在「发送中」，未能确认送达。',
                    };
                }
                return {
                    ok: false,
                    delivery: 'missing',
                    evidence: 'none',
                    message: '已点击发送，但会话里没有确认到这条消息 —— 按未发送处理（不重试，避免重复发送；请人工检查会话）。',
                };
            },
            /**
             * 收件箱：读会话列表（HR 消息）。
             *
             * 这是纯读动作 —— 只要页面能打开就能做，不需要 CDP 输入面。
             * ⚠️ 未登录会停在登录墙，此处会返回空数组；调用方（domain）应结合登录态判断，
             * 「0 条」不等于「没人回我」。
             */
            async readInbox(page) {
                await page.goto(config.chatUrl);
                await waitFor(page, config.inboxSelectors.row, config.actionWaitMs);
                return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors });
            },
            /**
             * 附件投递（发简历）。
             *
             * BOSS 求职者网页端**没有会话内上传任意本地文件的入口**（BossHunter 实测：
             * 定制 PDF 只能人工发送）。所以这里分两条路，且**绝不假装成功**：
             *   * `filePath === null`：走平台原生「发简历」→ 选择简历 → 确认（发出的是平台内简历）；
             *   * `filePath !== null`：只有页面真的存在 `input[type=file]`（平台改版后可能有）
             *     才用 `setInputFiles` 上传；没有就如实返回 `delivery: 'missing'` 并说明原因。
             */
            async sendResume(page, job, filePath) {
                if (page.mouse === undefined)
                    return missingInputSurface();
                // ── 路径一：本地文件上传（仅在页面提供 file input 时）─────────────────
                if (filePath !== null) {
                    const hasFileInput = await page.evaluate(hasSelectorInPage, {
                        selector: config.chatSelectors.fileInput,
                    });
                    if (!hasFileInput || page.setInputFiles === undefined) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: 'BOSS 求职者网页端的会话里没有本地文件上传入口，无法把本地简历文件发出去。' +
                                '请改用平台内简历投递（filePath 传 null），或先在「我的简历」里上传附件简历。',
                        };
                    }
                    if (!(await openConversation(page, job))) {
                        return {
                            ok: false,
                            delivery: 'missing',
                            evidence: 'none',
                            message: `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话，未上传附件。`,
                        };
                    }
                    await page.setInputFiles(config.chatSelectors.fileInput, [filePath]);
                    const uploaded = await waitFor(page, config.chatSelectors.resumeCard, config.actionWaitMs);
                    return uploaded
                        ? { ok: true, delivery: 'delivered', evidence: 'dom' }
                        : {
                            ok: false,
                            delivery: 'pending',
                            evidence: 'none',
                            message: '文件已交给页面，但会话里没有确认到简历卡片。',
                        };
                }
                // ── 路径二：平台内简历（工具条「发简历」→ 选择 → 确认）────────────────
                if (!(await openConversation(page, job))) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话，未发简历。`,
                    };
                }
                const resumeButton = await clickSelector(page, config.chatSelectors.resumeButton, '简历');
                if (resumeButton === null) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '会话工具条里找不到「发简历」按钮（可能双方尚未互发消息，平台要求先有往来）。',
                    };
                }
                if (!(await waitFor(page, config.chatSelectors.resumeDialog, config.actionWaitMs))) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '点了「发简历」但没有出现简历选择弹窗。',
                    };
                }
                if ((await clickSelector(page, config.chatSelectors.resumeDialogItem)) === null) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '简历选择弹窗里没有可选项（平台里可能还没有可用简历）。',
                    };
                }
                if ((await clickSelector(page, config.chatSelectors.resumeDialogConfirm)) === null) {
                    return {
                        ok: false,
                        delivery: 'missing',
                        evidence: 'none',
                        message: '已选中简历，但点不到弹窗的确认按钮。',
                    };
                }
                const visible = await waitFor(page, config.chatSelectors.resumeCard, config.actionWaitMs);
                if (visible)
                    return { ok: true, delivery: 'delivered', evidence: 'dom' };
                return {
                    ok: false,
                    delivery: 'pending',
                    evidence: 'none',
                    message: '已在平台弹窗里确认发送简历，但会话里还没出现简历卡片，未能确认送达。',
                };
            },
        },
    };
}
//# sourceMappingURL=zhipin.js.map