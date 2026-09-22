/**
 * 智联适配器的配置面：选择器 / URL 参数 / 值域 / 城市码 / 判墙信号 + 默认配置与覆盖合并。
 *
 * 纯数据与纯函数：不碰 `document`、不发请求、不编排流程；DB 覆盖（ADR-19）也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import { numberRange } from '../../config-merge.js';
/**
 * 排序取值域。
 *
 * 页面上的排序控件只有三项：**智能匹配 / 薪酬最高 / 最新发布**。
 * 其中只有 `order=4`（最新发布）是**实测**出来的 —— `__INITIAL_STATE__` 的
 * `queryParams` 与 `displayParams` 都回显 `order:4`，且控件高亮「最新发布」。
 * 另外两项的参数值**没有证据，所以不编** —— 编一个错的取值，用户选了不会报错，
 * 只会静默拿到另一种排序，那比缺功能更糟。
 */
export const ZHAOPIN_SORT_OPTIONS = [
    { value: '4', label: '最新发布' },
];
/** 发布时间窗：智联的搜索 URL 不暴露这个维度，所以值域为空（界面据此禁用并给出原因）。 */
export const ZHAOPIN_POSTED_WITHIN_OPTIONS = [];
/**
 * 四个筛选维度的取值域 —— **全部照抄站点自己那份字典**。
 *
 * 来源：登录态搜索页后台请求 `GET /c/i/search/base/data`，响应 `data` 里有
 * `educationType` / `workExpType` / `companyType` / `jobStatus` 等字典（2026-09-21 实测，
 * 转储见 `test/fixtures/zhaopin-base-data-filters.json` —— 夹具就是那份响应的原样摘录，
 * 单测逐条对账，防止有人手改这些码）。
 *
 * 两条刻意的取舍：
 *   * **不提供「不限」类取值**（`-1` / `-99` / `?`）：语义上等于"不带这个参数"，
 *     收进值域只会让用户选出一个与不选完全等价的选项（界面上的"不填"已经表达了它）。
 *   * 公司性质里的 `6;10`（机关/事业单位）与 `7;14;15`（其他）**不提供**：
 *     它们是**分号拼的多码**，而 `URLSearchParams` 会把 `;` 转义成 `%3B` ——
 *     站点自己怎么发这两个值没有被实测过，宁缺勿编。
 */
export const ZHAOPIN_EDUCATION_OPTIONS = [
    { value: '9', label: '初中及以下' },
    { value: '7', label: '高中' },
    { value: '12', label: '中专/中技' },
    { value: '5', label: '大专' },
    { value: '4', label: '本科' },
    { value: '3', label: '硕士' },
    { value: '10', label: 'MBA/EMBA' },
    { value: '1', label: '博士' },
];
export const ZHAOPIN_WORK_EXPERIENCE_OPTIONS = [
    { value: '0001', label: '1年以下' },
    { value: '0103', label: '1-3年' },
    { value: '0305', label: '3-5年' },
    { value: '0510', label: '5-10年' },
    { value: '1099', label: '10年以上' },
];
export const ZHAOPIN_COMPANY_TYPE_OPTIONS = [
    { value: '1', label: '国企' },
    { value: '2', label: '外企' },
    { value: '4', label: '中外合资' },
    { value: '16', label: '港澳台企业' },
    { value: '5', label: '民营' },
];
export const ZHAOPIN_JOB_STATUS_OPTIONS = [
    { value: '2', label: '全职' },
    { value: '1', label: '兼职/临时' },
    { value: '4', label: '实习' },
    { value: '5', label: '校园' },
];
/**
 * 单次抓取的页数上限（默认）。
 *
 * 实测：`/sou/jl765` 无关键词时站点自报 `pages:5 / positionCount:100`；
 * 带关键词时同样按 20 条一页。所以默认 5 页足够覆盖一次搜索，
 * 也更保守（§P5 保守优先）。**上限**给 10 页，供用户在方案里显式放宽。
 */
export const ZHAOPIN_DEFAULT_MAX_PAGES = 5;
export const ZHAOPIN_MAX_PAGES = 10;
/**
 * 城市名 → 平台城市码（`jl`）。
 *
 * 与 51job 那张表**来源完全不同，别混淆**：51job 的城市码是人工从搜索页 URL 里抄的；
 * 这张表是**从智联自己的城市落地页第一方抓出来的** ——
 * 流程是：打开 `https://www.zhaopin.com/<拼音>/`，页面的搜索链接就是 `/sou/jl<code>`。
 * 实测 20 个城市全部命中，且与三份独立开源城市表**逐项一致**（无冲突）。
 *
 * 城市码**无法推导**：`/citymap` 只给拼音 slug，不给数字码。
 * 所以这里只放**已验证过**的城市；未列出的城市请在 DB 覆盖里补
 * （`setting(scope='platform', scope_ref='zhaopin', key='adapter-config')` 的 `cityCodes`）。
 */
export const ZHAOPIN_CITY_CODES = {
    全国: '489',
    北京: '530',
    上海: '538',
    广州: '763',
    深圳: '765',
    杭州: '653',
    成都: '801',
    南京: '635',
    武汉: '736',
    西安: '854',
    苏州: '639',
    天津: '531',
    重庆: '551',
    长沙: '749',
    郑州: '719',
    青岛: '703',
    合肥: '664',
    济南: '702',
    厦门: '682',
    大连: '600',
    东莞: '779',
    // 2026-09-18 二轮实测补齐（城市落地页逐城抓取 /sou/jl<码>，并用 /jobs?jl= 标题反查归属）
    福州: '681',
    宁波: '654',
    无锡: '636',
    佛山: '768',
    昆明: '831',
    贵阳: '822',
    南昌: '691',
    太原: '576',
    石家庄: '565',
    沈阳: '599',
    长春: '613',
    哈尔滨: '622',
    呼和浩特: '587',
    南宁: '785',
    兰州: '864',
    乌鲁木齐: '890',
    海口: '799',
    银川: '886',
    珠海: '766',
    惠州: '773',
    中山: '780',
    温州: '655',
    泉州: '685',
    徐州: '637',
    常州: '638',
    嘉兴: '656',
};
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id（形如 `CC381381910J40896290805`）。 */
export const ZHAOPIN_DETAIL_URL_TEMPLATE = 'https://www.zhaopin.com/jobdetail/{jobId}.htm';
/** 未登录时薪资被掩码的样子（`/jobs` 老路由上会出现；`/sou/` 上实测是明文）。 */
export const ZHAOPIN_SALARY_MASK = '**-**元';
/** 投递入口在"可以投"状态时的文案（实测值；投过之后这里会变成「继续沟通」）。 */
export const ZHAOPIN_APPLY_ENTRY_TEXT = '立即投递';
export const DEFAULT_ZHAOPIN_CONFIG = {
    selectors: {
        /**
         * 卡片容器 —— ⚠️ **不要把 `.job-card` 加进来**（2026-09-21 探针实测）。
         *
         * 现状：`/sou/jl765?kw=Java` 这条路由现在渲染的是 **`.job-card`** 那套新标记
         *（实测：`.joblist-box__item` = 0，`[class*="job-card"]` ≈ 400，登录/匿名都一样），
         * 也就是**这个选择器已经匹配不到卡片**。看起来该改成 `.job-card`，但**不能改**：
         *   * 新卡片的标题**没有 `<a href>`**（实测整张卡只有一个公司链接），而岗位 id 只能从
         *     `jobdetail/CC…J….htm` 里抽 → DOM 路径拿不到 `sourceUrl`（必需字段）；
         *   * 现在"卡片 0 条"恰好触发 `page/list.ts` 的**载荷兜底**：页面仍内联
         *     `__INITIAL_STATE__`（实测 217KB，含 `positionList`），它带 id/薪资明文/公司/城市/学历/经验；
         *   * 一旦这里能匹配到卡片，兜底就不会触发 → 20 条**没有 sourceUrl**的记录。
         * 真要迁到 DOM 路径，先解决"新卡片上岗位 id 从哪来"。
         */
        card: '.joblist-box__item',
        title: '.jobinfo__name',
        salary: '.jobinfo__salary',
        otherInfo: '.jobinfo__other-info',
        otherInfoItem: '.jobinfo__other-info-item',
        locationSpan: '.jobinfo__other-info-location-image',
        company: '.companyinfo__name',
        companyTags: '.joblist-box__item-tag',
        pagination: '.pagination',
        nextLink: '.soupager__btn',
        loginPopup: '.login-popups, #zpPassportWidget, .register__new',
        noJobTip: 'img[src*="noJobTip"]',
    },
    urlParams: {
        base: 'https://www.zhaopin.com/sou',
        // 带筛选的路由（实测：点「本科」后站点自己跳到的就是它）。
        filterBase: 'https://www.zhaopin.com/jobs',
        keywordParam: 'kw',
        pageParam: 'p',
        sortParam: 'order',
        postedWithinParam: 'pd',
        // 下面这组字母表与站点自己登录表单 URL 上的 `jl/kw/el/we/et/ct` 一致；
        // 其中 el/we/et/ct 四个是**点击实测**出来的（点一下、看它跳哪）。
        cityParam: 'jl',
        educationParam: 'el',
        workExperienceParam: 'we',
        companyTypeParam: 'ct',
        jobStatusParam: 'et',
    },
    cityCodes: ZHAOPIN_CITY_CODES,
    detailUrlTemplate: ZHAOPIN_DETAIL_URL_TEMPLATE,
    detailSelectors: {
        title: '.summary-planes__title',
        jdText: '.describtion-card__detail-content',
        companyName: '.company-summary__name',
        companyTags: '.company-summary__list > li',
    },
    imUrl: 'https://i.zhaopin.com/im',
    imSelectors: {
        // 实测：列表在 `.im-container` 里（外层 `.zp-im-root > .im-page-wrap > .im-page__inner`）
        listContainer: '.im-container',
        sessionRow: '.im-session-item',
        name: '.im-session-item__name',
        company: '.im-session-item__company-name',
        job: '.im-session-item__job',
        preview: '.im-session-item__preview-text',
        time: '.im-session-item__time',
        badge: '.im-session-item__badge',
    },
    talkListApi: 'https://cgate.zhaopin.com/imapi/imV2/getTalkList',
    talkListPageSize: 20,
    talkListMaxPages: 3,
    applySelectors: {
        entry: '.summary-planes__action',
        successModal: '.deliver-greeting-modal',
        successText: '已向对方发送简历',
    },
    applyWaitMs: 20_000,
    // 不可逆动作前的停留：投递一次 = 简历 + 平台替你发的招呼语，撤不回来（15–30s）
    dwellBeforeApplyMs: [15_000, 30_000],
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhaopinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_ZHAOPIN_CONFIG;
    const patch = override;
    return {
        selectors: { ...DEFAULT_ZHAOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        urlParams: { ...DEFAULT_ZHAOPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        detailSelectors: {
            ...DEFAULT_ZHAOPIN_CONFIG.detailSelectors,
            ...(patch.detailSelectors ?? {}),
        },
        cityCodes: { ...DEFAULT_ZHAOPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        detailUrlTemplate: typeof patch.detailUrlTemplate === 'string' && patch.detailUrlTemplate !== ''
            ? patch.detailUrlTemplate
            : DEFAULT_ZHAOPIN_CONFIG.detailUrlTemplate,
        imUrl: typeof patch.imUrl === 'string' && patch.imUrl !== ''
            ? patch.imUrl
            : DEFAULT_ZHAOPIN_CONFIG.imUrl,
        imSelectors: { ...DEFAULT_ZHAOPIN_CONFIG.imSelectors, ...(patch.imSelectors ?? {}) },
        talkListApi: typeof patch.talkListApi === 'string' && patch.talkListApi !== ''
            ? patch.talkListApi
            : DEFAULT_ZHAOPIN_CONFIG.talkListApi,
        applySelectors: { ...DEFAULT_ZHAOPIN_CONFIG.applySelectors, ...(patch.applySelectors ?? {}) },
        talkListPageSize: typeof patch.talkListPageSize === 'number' && patch.talkListPageSize > 0
            ? patch.talkListPageSize
            : DEFAULT_ZHAOPIN_CONFIG.talkListPageSize,
        talkListMaxPages: typeof patch.talkListMaxPages === 'number' && patch.talkListMaxPages > 0
            ? patch.talkListMaxPages
            : DEFAULT_ZHAOPIN_CONFIG.talkListMaxPages,
        applyWaitMs: typeof patch.applyWaitMs === 'number' && patch.applyWaitMs > 0
            ? patch.applyWaitMs
            : DEFAULT_ZHAOPIN_CONFIG.applyWaitMs,
        dwellBeforeApplyMs: numberRange(patch.dwellBeforeApplyMs, DEFAULT_ZHAOPIN_CONFIG.dwellBeforeApplyMs),
    };
}
/**
 * 智联特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 智联走"共享词表、自有结构"：这里只声明**它比通用词表多的那几条**，
 * 加上它自己的 `blank` 阈值（80，比通用的 120 更严 —— 它的"搜到 0 条"结果页
 * 也有一两百字筛选器文案，120 会把那种页面误判成空白）。
 */
export const ZHAOPIN_BLOCK_SIGNALS = {
    // 极验的 `.geetest_box` / 易盾的 `#nc_1_wrapper` / 阿里云 WAF 的文案与脚本名
    captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
    blankTextLength: 80,
};
//# sourceMappingURL=config.js.map