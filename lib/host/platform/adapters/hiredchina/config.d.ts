/**
 * HiredChina 适配器的配置面：payload 锚点 / 详情选择器 / URL 参数 / 值域 / 判墙信号。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/** 用户面向的默认域名（对外入口）。raw HTTP 会吃 Cloudflare 挑战；真浏览器 + 登录态可过。 */
export declare const HIREDCHINA_WEB_BASE = "https://www.hiredchina.com";
/** 页面语言路径段（决定页面文案是英文还是中文；payload 里的 i18n key 不随它变）。 */
export declare const HIREDCHINA_LANG = "en";
/**
 * 判墙锚：岗位详情链接。
 *
 * ⚠️ 2026-09-20 实测后这个选择器**只用于判墙**（`detectBlockWithSignals` 的 `card`
 * 参数 = "0 卡片 + 短文本"判 blank/登录墙的那条判据），**不再用于列表解析** ——
 * 列表页 raw HTML 里没有卡片 DOM（数据在 RSC 流里，见 `HiredChinaPayloadAnchors`）。
 * 真浏览器 hydrate 后这个选择器会命中渲染出来的卡片，语义仍是"页面上有没有岗位"。
 */
export declare const HIREDCHINA_CARD_SELECTOR = "a[href*=\"/job/\"]";
/** jobId 是 UUID：`8-4-4-4-12` 十六进制。 */
export declare const HIREDCHINA_JOB_ID_PATTERN = "/(?:en|zh)/job/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
/**
 * RSC 流里的岗位数据锚点（2026-09-20 实测定案，取代原先的 DOM 卡片解析）。
 *
 * 为什么换通道：真实抓取（`test/fixtures/hiredchina-search.html`）证明列表卡片是
 * **客户端组件渲染的** —— raw HTML 里没有任何 `/job/` 链接、没有 `data-slot="card"`，
 * 岗位数据整包躺在 `self.__next_f.push([1,"f:…{\"initialData\":{\"list\":[…]}…"]])`
 * 的 RSC 流里（`JobsClientWrapper` 的 props）。DOM 解析在真路径上**只有等 hydrate
 * 完成才可能工作**，而 payload 通道在 HTML 送达那一刻就完整可用，且字段比 DOM 富
 * （`refreshAt` 绝对时间戳 vs DOM 的 "2d ago"；i18n key 可归一）。
 */
export interface HiredChinaPayloadAnchors {
    /** RSC 流里岗位数据的顶层键（2026-09-20 实测：`initialData`）。 */
    dataKey: string;
    /** 顶层键下岗位数组的键（实测：`list`）。 */
    listKey: string;
    /** 详情页路径模板，`{id}` 会被替换成岗位的 `line` UUID（实测形态 `/<lang>/job/<uuid>`；lang 段由宿主按 `config.lang` 拼，不写死在这里）。 */
    detailPathPattern: string;
}
/** 每页条数（2026-09-20 实测 p1/p2 各 10 条；也是「满页即有下一页」判据的分母）。 */
export declare const HIREDCHINA_PAGE_SIZE = 10;
/** Job Type（类别筛选 `?type=`）取值 —— 键来自页面内嵌 i18n 字典；`marketing` 已实测。 */
export declare const HIREDCHINA_TYPE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 雇佣类型筛选 `?employmentId=`（已实测：1=Full-time/全职，2=Part-time/兼职）。 */
export declare const HIREDCHINA_EMPLOYMENT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 工作模式筛选 `?isOnline=`（已实测：1=Remote/远程，0=On-site/现场）。 */
export declare const HIREDCHINA_WORK_MODE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 单次抓取的页数上限。
 *
 * 翻页契约**已实测有效**（`?page=N` 在 payload 层真换数据：p1/p2 首条 UUID 不同），
 * 但主站带 Cloudflare 挑战层，且我们是保守优先（§P5），按 `maxPages = 5` 封顶。
 * 这不是平台限制，是我们对风控的取舍 —— 写清楚，避免后人误以为「上限 5 是平台事实」。
 */
export declare const HIREDCHINA_MAX_PAGES = 5;
/** 判墙选择器（只有 `card` 一项 —— 列表解析已走 payload，DOM 卡片组已删，见文件头）。 */
export interface HiredChinaSelectors {
    /** 判墙锚：岗位详情链接（0 条 + 短文本 → blank / 登录墙的那条判据）。 */
    card: string;
}
/**
 * 详情页选择器（2026-09-20 由真实详情页夹具 `hiredchina-detail.html` 校准 ——
 * 详情页与列表页相反，是 **SSR 直出 DOM**，h1/薪资/徽章/JD 都在 HTML 里）。
 *
 * 渐变卡真实结构（夹具原文）：
 * ```
 * div.rounded-xl.bg-gradient-to-br…
 *   ├─ div.flex.items-center.gap-3 > div
 *   │    ├─ p.font-medium          ← 公司名（"Hank Times"）
 *   │    └─ p.text-sm              ← 行业（"IT"）
 *   ├─ div.flex.flex-col.gap-4 > h1 ← 标题
 *   │    └─ div.flex.flex-col.items-start.shrink-0
 *   │         └─ div.text-lg…text-primary ← 薪资（"Negotiable" / "20K - 25K…"）
 *   └─ div.flex.flex-wrap.gap-2      ← 徽章行（地点→行业→雇佣→工作模式→语言，SSR 已翻好文本）
 * ```
 * ⚠️ 薪资**不是** `text-3xl`（那是 h1 的 `md:text-3xl`）：金额元素是
 * `text-lg md:text-xl font-bold text-primary`，外层容器 `items-start shrink-0`
 * 是它的唯一判别锚（页头 avatar 也带 `shrink-0` 但不带 `items-start`）。
 * JD 正文按**标题锚定**：`Job Description` 与 `Requirements` 两段 prose 拼接
 * （夹具实测 prose 有两处，直接取第一处会丢任职要求）。
 */
export interface HiredChinaDetailSelectors {
    title: string;
    /** 渐变卡（公司/薪资/徽章行的共同容器）。 */
    card: string;
    /** 公司名（渐变卡内 `p.font-medium`）。 */
    company: string;
    /** 行业（渐变卡内公司名兄弟行 `p.text-sm`，夹具实测 "IT"）。 */
    industry: string;
    /** 薪资：`items-start shrink-0` 容器下的金额元素。 */
    salary: string;
    /** 徽章行容器（地点 → 行业 → 雇佣 → 工作模式 → 语言；文本已由 SSR 翻译）。 */
    badgeRow: string;
    /** JD 正文段（可能多处，解析按 jdSectionTitles 锚定拼接）。 */
    jdText: string;
    /** JD 各段的标题元素（取其 textContent 与词表比对）。 */
    jdHeading: string;
    /** 段落标题词表：命中则该段进 jdText（en/zh 两站都列；空 = 取第一段）。 */
    jdSectionTitles: readonly string[];
}
export interface HiredChinaUrlParams {
    jobsPath: string;
    keywordParam: string;
    typeParam: string;
    employmentParam: string;
    workModeParam: string;
    pageParam: string;
}
export interface HiredChinaConfig {
    webBase: string;
    lang: string;
    selectors: HiredChinaSelectors;
    payloadAnchors: HiredChinaPayloadAnchors;
    detailSelectors: HiredChinaDetailSelectors;
    urlParams: HiredChinaUrlParams;
    /** 城市码。⚠️ 本平台**没有城市 URL 筛选**（见文件头）→ 恒空，带城市即拒绝。 */
    cityCodes: Record<string, string>;
    jobIdPattern: string;
    /** 每页条数（满页判据的分母）。 */
    pageSize: number;
    /** 抓取深度上限（页数）。 */
    maxPages: number;
}
export declare const DEFAULT_HIREDCHINA_CONFIG: HiredChinaConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeHiredChinaConfig(override: unknown): HiredChinaConfig;
/**
 * HiredChina 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare managed challenge**（实测第一层墙：raw HTTP 返回 "Just a moment..." +
 *     注入 `_cf_chl_opt` 脚本）：`challenge-platform` / `cf_chl` / `cf-browser-verification`
 *     这一组选择器与文案，通用词表里没有 Cloudflare；
 *   * `人机验证` 留在 **`rateText`**（同 guopin）：搬去 `captchaText` 会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginText` 带上**英文**（`login` / `Sign in`）—— 这是外企站，通用词表只有中文短语。
 */
export declare const HIREDCHINA_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly ["script[src*=\"challenge-platform\"]", "form[action*=\"cf_chl\"]", "iframe[src*=\"challenge-platform\"]", "[class*=\"cf-browser-verification\"]"];
    readonly captchaText: readonly ["_cf_chl_opt", "cf_chl_", "cf-browser-verification", "justamoment"];
    readonly rateText: readonly ["人机验证"];
    readonly loginText: readonly ["login", "Sign in", "登录"];
};
//# sourceMappingURL=config.d.ts.map