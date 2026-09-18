import type { RawInboxMessage, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 列表页选择器集（BossHunter 生产选择器 + 本项目夹具双重验证）。 */
export interface ZhipinSelectors {
    card: string;
    cardBox: string;
    /** 职位名链接（标题 + href 三合一）。 */
    jobName: string;
    /** 薪资（未登录为空元素）。 */
    salary: string;
    /** 「经验 / 学历」标签列表。 */
    tagList: string;
    /** 公司名（未登录视图装在 boss-name 里；BossHunter 兜底 company-name）。 */
    company: string;
    /** 「城市·区域·地标」文本。 */
    location: string;
}
/** 详情页选择器集（BossHunter site-patterns 2026-05-26 验证 + `JS_EXTRACT_DETAIL` 对齐）。 */
export interface ZhipinDetailSelectors {
    title: string;
    salary: string;
    /** 经验/学历 span（顺序固定：先经验后学历）。 */
    tags: string;
    jdText: string;
    /** 公司侧栏（旧字段，保留兼容）。 */
    companySider: string;
    /** 公司名链接（逐个取第一个不含 http 的文本）。 */
    companyLink: string;
    /** 规模/行业标签（含「人」的是规模，其余第一个是行业）。 */
    companyTags: string;
}
/**
 * 会话/动作选择器集（BossHunter 求职者端 `sender.py` / `monitor.py` 生产实测）。
 */
export interface ZhipinChatSelectors {
    /** 岗位详情页「立即沟通 / 继续沟通」入口候选（逗号列表，命中后按可见性打分）。 */
    chatButton: string;
    /** 平台预设招呼语弹窗（点确认即发，文案不由我们控制）。 */
    presetPopup: string;
    /** 首次沟通弹窗（内含可编辑招呼语 textarea）。 */
    startchatDialog: string;
    /** 首次沟通弹窗里的招呼语输入框。 */
    startchatInput: string;
    /** 弹窗「确定」按钮。 */
    dialogConfirm: string;
    /** 首次沟通弹窗的提交按钮。 */
    dialogSend: string;
    /** 会话输入框（contenteditable，挂 Vue 实例）。 */
    chatInput: string;
    /** 发送按钮。 */
    sendButton: string;
    /** 消息列表容器。 */
    messageList: string;
    /** 「我发出的」消息条目。 */
    myMessage: string;
    /** 消息正文节点。 */
    messageText: string;
    /** 消息送达/失败状态节点。 */
    messageStatus: string;
    /** 工具条「发简历」候选（按文案「简历」过滤）。 */
    resumeButton: string;
    /** 简历选择弹窗。 */
    resumeDialog: string;
    /** 弹窗里的简历条目。 */
    resumeDialogItem: string;
    /** 弹窗确认发送按钮。 */
    resumeDialogConfirm: string;
    /** 会话里已发出的简历卡片（用于校验）。 */
    resumeCard: string;
    /** 本地文件选择器（存在才说明平台允许上传本地附件）。 */
    fileInput: string;
}
/** 收件箱（求职者端会话列表）选择器集。 */
export interface ZhipinInboxSelectors {
    /** 会话行（求职者端实测是 `li[role=listitem]`，与招聘者端的 `.geek-item-wrap` 不同）。 */
    row: string;
    /** HR 名字。 */
    name: string;
    /** 名字容器（第 2 个 span 是公司名，最后一个是 HR 头衔）。 */
    nameBox: string;
    /** 最后一条消息。 */
    lastMessage: string;
    /** 送达/已读状态（区分方向用）。 */
    status: string;
    /** 未读标记。 */
    unread: string;
}
/** 发送后轮询确认送达的节奏。 */
export interface ZhipinDeliveryPoll {
    attempts: number;
    intervalMs: number;
}
export interface ZhipinConfig {
    selectors: ZhipinSelectors;
    detailSelectors: ZhipinDetailSelectors;
    chatSelectors: ZhipinChatSelectors;
    inboxSelectors: ZhipinInboxSelectors;
    urlParams: {
        base: string;
        keywordParam: string;
        cityParam: string;
    };
    /** 求职者端会话页（收件箱与投递都从这里进）。 */
    chatUrl: string;
    cityCodes: Record<string, string>;
    jobIdPattern: string;
    /**
     * 滚动加载时，**每一轮等新卡片出现的上限**（ms）。
     *
     * 为什么进配置：离线夹具是静态 DOM，永远等不到"新卡片"，只能靠超时收手 ——
     * 测试要把它调到几十毫秒，否则每个用例白等十几秒。
     */
    scrollStepTimeoutMs: number;
    /**
     * 打招呼前在岗位页「看一会儿」的时长区间（ms）—— BossHunter `browse_before_greet`
     * 的 15–30s 同款。打开岗位页立刻动手是最强的机器信号之一。
     * `[0, 0]` = 关闭（离线测试必须关掉，否则每个用例白等十几秒）。
     */
    dwellBeforeGreetMs: [number, number];
    /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
    actionWaitMs: number;
    /** 发送后的送达校验轮询（次数 × 间隔）。 */
    deliveryPoll: ZhipinDeliveryPoll;
}
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export declare const ZHIPIN_CITY_CODES: Record<string, string>;
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export declare const ZHIPIN_JOB_ID_PATTERN = "/job_detail/([0-9a-zA-Z~_-]+)\\.html";
/** 求职者端会话页（登录后可见；收件箱与投递入口）。 */
export declare const ZHIPIN_CHAT_URL = "https://www.zhipin.com/web/geek/chat";
/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export declare const ZHIPIN_MAX_PAGES = 1;
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export declare const ZHIPIN_PAGE_SIZE = 15;
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export declare const ZHIPIN_MAX_SCROLL_ROUNDS = 20;
export declare const DEFAULT_ZHIPIN_CONFIG: ZhipinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeZhipinConfig(override: unknown): ZhipinConfig;
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export declare function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null;
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
export declare function scrollToLoadInPage(arg: {
    card: string;
    rounds: number;
    stepTimeoutMs: number;
}): Promise<number>;
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function extractJobsInPage(arg: {
    selectors: ZhipinSelectors;
    jobIdPattern: string;
}): RawJob[];
/**
 * **在页面上下文里**解析详情页（BossHunter `JS_EXTRACT_DETAIL` 对齐）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 */
export declare function extractDetailInPage(arg: {
    selectors: ZhipinDetailSelectors;
}): RawJobDetail;
/** 页面上下文的元素定位结果（拟人点击的坐标来源 + 跳转线索）。 */
export interface ZhipinElementInfo {
    found: boolean;
    x: number;
    y: number;
    text: string;
    /**
     * 元素自带的跳转线索（`redirect-url` / `data-url` / `href`）。
     *
     * BOSS 的「立即沟通」按钮带 `redirect-url="/web/geek/chat/..."`。当点击**没能让
     * 当前页跳转**时（例如按钮 `target=_blank` 另开了标签页，而我们的 PageLike 只看得到
     * 当前页），用这个地址让当前页自己导航过去 —— BossHunter `_navigate_to_chat_redirect`
     * 就是为这个坑写的。
     */
    href: string;
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
export declare function elementCenterInPage(arg: {
    selector: string;
    textIncludes?: string;
}): ZhipinElementInfo;
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export declare function hasSelectorInPage(arg: {
    selector: string;
}): boolean;
/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export declare function detectGreetPopupInPage(arg: {
    selectors: ZhipinChatSelectors;
}): {
    kind: 'preset' | 'startchat' | 'none';
};
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
export declare function readChatMessagesInPage(arg: {
    selectors: ZhipinChatSelectors;
    expectText: string;
}): {
    state: 'delivered' | 'pending' | 'failed' | 'missing';
};
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
export declare function readInboxInPage(arg: {
    selectors: ZhipinInboxSelectors;
}): RawInboxMessage[];
/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export declare function chatRowMatchesInPage(arg: {
    selectors: ZhipinInboxSelectors;
    company: string;
    expectText: string;
}): boolean;
export interface ZhipinAdapterOptions {
    config?: ZhipinConfig;
    delayRangeMs?: [number, number];
    waitForListMs?: number;
}
/** 构造 BOSS 直聘适配器。 */
export declare function createZhipinAdapter(options?: ZhipinAdapterOptions): SiteAdapter;
//# sourceMappingURL=zhipin.d.ts.map