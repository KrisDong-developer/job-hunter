import { CORE_FIELDS } from '../../../shared/enums.js';
import { humanDelayMs } from '../pacing.js';
import { platformFacts } from '../platform-facts.js';
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
export const DEFAULT_ZHAOPIN_CONFIG = {
    selectors: {
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
        keywordParam: 'kw',
        pageParam: 'p',
        sortParam: 'order',
        postedWithinParam: 'pd',
    },
    cityCodes: ZHAOPIN_CITY_CODES,
    detailUrlTemplate: ZHAOPIN_DETAIL_URL_TEMPLATE,
    detailSelectors: {
        title: '.summary-planes__title',
        jdText: '.describtion-card__detail-content',
        companyName: '.company-summary__name',
        companyTags: '.company-summary__list > li',
    },
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
    };
}
/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - 第 1 页：`https://www.zhaopin.com/sou/jl765?kw=Java&order=4`
 *   - 第 2 页起：**优先**用站点给的无 query path 形式；这里只能构造 query 兜底，
 *     真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`）。
 */
export function buildZhaopinSearchUrl(config, criteria) {
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        // 城市码未配置就返回 null —— **不猜**。猜错会静默搜到别的城市。
        if (code === undefined)
            return null;
    }
    // 城市码放路径段：`/sou/jl<code>`；没指定城市时用「全国」码，保持 URL 形状一致。
    const code = criteria.city !== undefined && criteria.city !== '' ? config.cityCodes[criteria.city] : config.cityCodes['全国'];
    const base = code === undefined ? config.urlParams.base : `${config.urlParams.base}/jl${code}`;
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.page !== undefined && criteria.page > 1) {
        params.set(config.urlParams.pageParam, String(criteria.page));
    }
    // SR-40：只在用户真的配了的时候才写进 URL，避免静默改变默认行为。
    if (criteria.sort !== undefined && criteria.sort !== '') {
        params.set(config.urlParams.sortParam, criteria.sort);
    }
    if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
        params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays));
    }
    for (const [key, value] of Object.entries(criteria.extra ?? {}))
        params.set(key, value);
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
/**
 * **在页面上下文里**把内嵌的 `__INITIAL_STATE__` 载荷读成紧凑数组。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。
 *
 * ⚠️ 也**绝不能返回整个 state** —— `page.evaluate` 只能回传标量 JSON，
 * 而这个载荷有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 为什么从 `document` 的 script 文本里解析，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 */
/**
 * 载荷解析**必须**留在 `extractJobsInPage` 内部，不能提成模块级函数：
 * 页面函数会被序列化后送进浏览器，闭包不存在，引用任何模块作用域的符号都会
 * `ReferenceError` 并导致整页解析失败（51job 踩过同一个坑）。
 */
/**
 * **在页面上下文里**解析列表页（DOM 为主，内嵌载荷补字段）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量或函数都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。所以**载荷解析与配平全部内联在函数体里** ——
 * 抽成模块级的 `readStateFromPage()` 看着更整洁，但一上真浏览器就整页失败。
 * `test/platform/zhaopin.test.ts` 的「按源码重建」护栏就是钉死这条的。
 *
 * ⚠️ 载荷**绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，
 * 而它在真实页面上有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 合并策略：`__INITIAL_STATE__.positionList` 与 `.joblist-box__item` **渲染顺序一致**
 * （实测都是 20 条、逐条对得上），按索引配对；DOM 能给的优先用 DOM
 * （它是"页面实际展示了什么"的直接证据），DOM 给不了的（发布时间/行业/公司规模）
 * 用载荷补。
 *
 * 为什么从 `document` 的 script 文本里解析载荷，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export function extractJobsInPage(config) {
    const maxCards = 200; // 列表页最多解析多少张卡片，防止异常页面把内存打满
    const maxStateItems = 200; // 同上，载荷侧的上限
    // ── 内联：把 __INITIAL_STATE__.positionList 读成紧凑数组（自包含，不可外提） ──
    const state = [];
    {
        const scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
        for (const script of scripts) {
            const text = script.textContent ?? '';
            if (text === '' || text.indexOf('__INITIAL_STATE__') < 0)
                continue;
            const braceStart = text.indexOf('{', text.indexOf('__INITIAL_STATE__'));
            if (braceStart < 0)
                continue;
            // 载荷是 `__INITIAL_STATE__={...}`，对象一直写到脚本结尾。
            // 用大括号配平（而不是正则）取完整 JSON —— 只有配平才能处理嵌套与字符串里的括号。
            let depth = 0;
            let inString = false;
            let escaped = false;
            let stop = -1;
            for (let i = braceStart; i < text.length; i += 1) {
                const ch = text.charAt(i);
                if (inString) {
                    if (escaped)
                        escaped = false;
                    else if (ch === '\\')
                        escaped = true;
                    else if (ch === '"')
                        inString = false;
                    continue;
                }
                if (ch === '"')
                    inString = true;
                else if (ch === '{')
                    depth += 1;
                else if (ch === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        stop = i;
                        break;
                    }
                }
            }
            if (stop < 0)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(text.slice(braceStart, stop + 1));
            }
            catch {
                continue;
            }
            const list = parsed.positionList;
            if (!Array.isArray(list))
                continue;
            for (const item of list.slice(0, maxStateItems)) {
                if (item === null || typeof item !== 'object')
                    continue;
                state.push(item);
            }
            break;
        }
    }
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const textOf = (node) => (node === null ? '' : clean(node.textContent));
    const attrOf = (node, name) => node === null ? '' : clean(node.getAttribute(name));
    const queryAll = (scope, selector) => {
        try {
            return Array.prototype.slice.call(scope.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    // 从详情链接里抽出岗位 id：`.../jobdetail/CC381381910J40896290805.htm`
    const jobIdOf = (href) => {
        const m = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(href);
        return m === null || m[1] === undefined ? '' : m[1];
    };
    const selectors = config.selectors;
    const cards = queryAll(document, selectors.card).slice(0, maxCards);
    const out = [];
    // ── AB 分流兜底：同一 `/sou/` URL 可能落到非目标路由（见文件头） ─────────────
    // 实测 `/sou/jl765?kw=Java` 两次访问，一次落到 jobinfo 明文页，一次被分流到旧的
    // `/jobs` 掩码页（卡片是 `.job-card`，不在 `selectors.card` 里，薪资还掩码成 `**-**元`）。
    // 这时 DOM 卡片为 0，但 `__INITIAL_STATE__.positionList` 往往仍带着 20 条真值
    // （`salary60` 明文）。与其把这一整轮判成"没岗位/被墙"白丢，不如凭载荷补开出数。
    if (cards.length === 0 && state.length > 0) {
        const textOfItem = (item, key) => {
            const value = item[key];
            if (typeof value === 'string')
                return clean(value);
            if (typeof value === 'number' && Number.isFinite(value))
                return String(value);
            return '';
        };
        for (let i = 0; i < state.length; i += 1) {
            const item = state[i];
            if (item === undefined)
                continue;
            const jobId = textOfItem(item, 'number');
            const salary = textOfItem(item, 'salary60');
            const notes = [];
            if (jobId === '')
                notes.push('jobId:missing');
            if (salary.indexOf('*') >= 0)
                notes.push('salary:masked-by-login');
            // 与 DOM 路径同款：技能/福利标签取载荷 showSkillTags，剔掉学历/经验项。
            const edu = textOfItem(item, 'education');
            const exp = textOfItem(item, 'workingExp');
            const tags = [];
            const rawTags = item['showSkillTags'];
            if (Array.isArray(rawTags)) {
                for (const t of rawTags) {
                    if (t === null || typeof t !== 'object')
                        continue;
                    const value = t['tag'];
                    const s = typeof value === 'string' ? clean(value) : '';
                    if (s === '' || s === edu || s === exp)
                        continue;
                    if (tags.indexOf(s) < 0)
                        tags.push(s);
                }
            }
            out.push({
                platformJobId: jobId,
                title: textOfItem(item, 'name'),
                // 载荷里的薪资是明文；万一哪天变成掩码，同样不许回流成占位符。
                salaryRaw: salary.indexOf('*') >= 0 ? '' : salary,
                company: textOfItem(item, 'companyName'),
                sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
                city: textOfItem(item, 'workCity'),
                district: textOfItem(item, 'cityDistrict'),
                expReq: exp,
                eduReq: edu,
                tags,
                publishedAt: textOfItem(item, 'publishTime') === '' ? null : textOfItem(item, 'publishTime'),
                industry: textOfItem(item, 'industryName') === '' ? null : textOfItem(item, 'industryName'),
                companySize: textOfItem(item, 'companySize') === '' ? null : textOfItem(item, 'companySize'),
                companyNature: textOfItem(item, 'propertyName') === '' ? null : textOfItem(item, 'propertyName'),
                notes,
            });
        }
        return out;
    }
    for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        if (card === undefined)
            continue;
        const notes = [];
        const fromState = state[index] ?? null;
        /**
         * 读载荷里的字段。
         *
         * ⚠️ 这里的 key 是**平台载荷自己的字段名**（`salary60` / `number` / `publishTime`…），
         * 不是本适配器 `RawJob` 的字段名 —— 载荷解析已内联进本函数，存的就是原始条目。
         * 早期版本把载荷先映射成 `salary`/`positionUrl` 再读，内联后就对不上号了，
         * 会让薪资/详情地址静默变成空串（正是 §4.2.4 要防的静默失败）。
         */
        const stateText = (key) => {
            if (fromState === null)
                return '';
            const value = fromState[key];
            if (typeof value === 'string')
                return clean(value);
            if (typeof value === 'number' && Number.isFinite(value))
                return String(value);
            return '';
        };
        // 技能/福利标签从载荷 `showSkillTags` 读（结构化数组），**不**用那个混了公司标签的
        // `.joblist-box__item-tag` DOM 选择器。注意它会把学历/经验当第一条 tag 混进来，
        // 这里按已解析出的 edu/exp 剔掉，剩下的才是"技能/福利"语义。
        const tags = (() => {
            if (fromState === null)
                return [];
            const raw = fromState['showSkillTags'];
            if (!Array.isArray(raw))
                return [];
            const edu = stateText('education');
            const exp = stateText('workingExp');
            const out = [];
            for (const item of raw) {
                if (item === null || typeof item !== 'object')
                    continue;
                const value = item['tag'];
                const s = typeof value === 'string' ? clean(value) : '';
                if (s === '' || s === edu || s === exp)
                    continue;
                if (out.indexOf(s) < 0)
                    out.push(s);
            }
            return out;
        })();
        // ── 标题 + 详情链接（同一个 <a>，所以我们才有岗位 id） ────────────
        const titleNode = queryAll(card, selectors.title)[0] ?? null;
        const domTitle = textOf(titleNode);
        const href = attrOf(titleNode, 'href');
        // 岗位 id 优先载荷里的 `number`（实测 126 字段全在，是最稳的权威 id），
        // DOM href 正则兜底。两处都是同一形式的 `CC{公司号}J{职位号}`。
        const stateJobId = stateText('number');
        const jobId = stateJobId !== '' ? stateJobId : jobIdOf(href);
        // ── 薪资（/sou/ 上是明文；掩码只应出现在老路由，识别出来就别当薪资用） ──
        const domSalary = textOf(queryAll(card, selectors.salary)[0] ?? null);
        const masked = domSalary !== '' && domSalary.indexOf('*') >= 0;
        // ── 地点 / 经验 / 学历：三项同构，**地点靠"有 location 图标/span"识别**，
        //    经验与学历才是后面两项。这样就不必依赖固定下标。
        let city = '';
        let district = '';
        const rest = [];
        for (const item of queryAll(card, selectors.otherInfoItem)) {
            const isLocation = item.querySelector(selectors.locationSpan) !== null ||
                queryAll(item, '.jobinfo__other-info-location-image').length > 0;
            const value = textOf(item);
            if (isLocation) {
                // 形如「深圳·宝安·新安」，分隔符实测是全角间隔点
                const parts = value.split('·');
                city = clean(parts[0] ?? '');
                district = clean(parts[1] ?? '');
            }
            else if (value !== '') {
                rest.push(value);
            }
        }
        if (fromState === null)
            notes.push('tracking:missing-element');
        if (masked)
            notes.push('salary:masked-by-login');
        if (jobId === '')
            notes.push('jobId:missing');
        out.push({
            platformJobId: jobId,
            title: domTitle !== '' ? domTitle : stateText('name'),
            // 掩码一律记成空：把 `**-**元` 当薪资写进库，会把 20 条岗位的薪资全污染成占位符。
            // 薪资优先级：DOM 的真实值 > 载荷的真实值 > 留空。
            // ⚠️ 掩码（`**-**元`）**绝不能回流**：拿它当薪资会把整页薪资污染成占位符。
            // 但掩码也**不能**直接把 salaryRaw 判死 —— 载荷里往往还有真实值
            // （老路由 `/jobs` 就是"DOM 掩码、载荷明文"），白白丢掉就是浪费已有数据。
            // 只有两边都没有真实值时才是空，那种记录由 platform/validate.ts 隔离。
            salaryRaw: domSalary !== '' && !masked ? domSalary : stateText('salary60'),
            company: textOf(queryAll(card, selectors.company)[0] ?? null) || stateText('companyName'),
            sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
            city: city !== '' ? city : stateText('workCity'),
            district: district !== '' ? district : stateText('cityDistrict'),
            // 经验/学历：DOM 上只有"后两项"这个位置信息，容易错位，
            // 所以只用载荷里的精确值；拿不到就留空，**不猜**。
            expReq: stateText('workingExp'),
            eduReq: stateText('education'),
            tags,
            publishedAt: stateText('publishTime') === '' ? null : stateText('publishTime'),
            industry: stateText('industryName') === '' ? null : stateText('industryName'),
            companySize: stateText('companySize') === '' ? null : stateText('companySize'),
            companyNature: stateText('propertyName') === '' ? null : stateText('propertyName'),
            notes,
        });
    }
    return out;
}
/**
 * **在页面上下文里**解析职位详情页，返回完整 `RawJobDetail`（列表扫码的字段 + `jdText`）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，闭包不存在。只依赖
 * `config`、`document`、`location` —— 任何模块级符号都会 `ReferenceError`。
 *
 * ⚠️ **关键掩码事实（2026-09-18 实测）**：详情页未登录时 **DOM 层薪资/地址被掩码**
 * （`**-**元` / `深圳**********`），但 `__INITIAL_STATE__.jobDetail.detailedPosition` 里
 * 是真实值（`salary: "1-1.1万"`）。所以薪资/JD 正文等**以载荷为准**，DOM 只兜底公司名
 * 这类页面本体就暴露的东西。
 *
 * 载荷字段名（平台自己的，不是 `RawJob` 的）：`positionName`（标题）、`salary`、
 * `positionWorkingExp`、`education`、`description`（JD 纯文本）、`welfareTags`。
 */
export function extractJobDetailInPage(config) {
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
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
            return Array.prototype.slice.call(document.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    // ── 载荷：__INITIAL_STATE__.jobDetail.detailedPosition（自包含内联解析） ──
    let pos = null;
    {
        const scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
        for (const script of scripts) {
            const text = script.textContent ?? '';
            const marker = text.indexOf('__INITIAL_STATE__');
            if (marker < 0)
                continue;
            const braceStart = text.indexOf('{', marker);
            if (braceStart < 0)
                continue;
            // 大括号配平取整份 JSON（只有配平能处理嵌套与字符串里的括号）。
            let depth = 0;
            let inString = false;
            let escaped = false;
            let stop = -1;
            for (let i = braceStart; i < text.length; i += 1) {
                const ch = text.charAt(i);
                if (inString) {
                    if (escaped)
                        escaped = false;
                    else if (ch === '\\')
                        escaped = true;
                    else if (ch === '"')
                        inString = false;
                    continue;
                }
                if (ch === '"')
                    inString = true;
                else if (ch === '{')
                    depth += 1;
                else if (ch === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        stop = i;
                        break;
                    }
                }
            }
            if (stop < 0)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(text.slice(braceStart, stop + 1));
            }
            catch {
                continue;
            }
            const detail = parsed['jobDetail'];
            if (detail !== null && typeof detail === 'object') {
                const dp = detail['detailedPosition'];
                if (dp !== null && typeof dp === 'object')
                    pos = dp;
            }
            break;
        }
    }
    const posText = (key) => {
        if (pos === null)
            return '';
        const value = pos[key];
        if (typeof value === 'string')
            return clean(value);
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
        return '';
    };
    // 岗位 id：从当前 URL 抽，`.../jobdetail/{id}.htm`
    const helmet = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(location.href);
    const jobId = helmet === null || helmet[1] === undefined ? '' : helmet[1];
    const ds = config.detailSelectors;
    // 薪资/JD 正文以载荷为准（DOM 层被掩码）；载荷缺失时才退 DOM。
    const salary = posText('salary');
    const jdText = posText('description') || textOf(queryOne(ds.jdText));
    // 技能/福利标签：载荷 welfareTags（字符串数组）。
    const tags = [];
    const welfare = pos === null ? null : pos['welfareTags'];
    if (Array.isArray(welfare)) {
        for (const w of welfare) {
            const s = typeof w === 'string' ? clean(w) : '';
            if (s !== '' && tags.indexOf(s) < 0)
                tags.push(s);
        }
    }
    // 公司标签（li 顺序固定：[融资, 规模, 行业]）→ size/industry；融资即"性质/融资状态"。
    const companyLis = queryAll(ds.companyTags);
    const companySize = companyLis[1] === undefined ? '' : textOf(companyLis[1]);
    const industry = companyLis[2] === undefined ? '' : textOf(companyLis[2]);
    const companyNature = companyLis[0] === undefined ? '' : textOf(companyLis[0]);
    return {
        platformJobId: jobId,
        title: posText('positionName') || textOf(queryOne(ds.title)),
        salaryRaw: salary,
        company: textOf(queryOne(ds.companyName)),
        sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
        expReq: posText('positionWorkingExp'),
        eduReq: posText('education'),
        tags,
        jdText: jdText === '' ? null : jdText,
        companySize: companySize === '' ? null : companySize,
        industry: industry === '' ? null : industry,
        companyNature: companyNature === '' ? null : companyNature,
    };
}
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 验证。
 *
 * 关键取舍：智联**加了筛选参数**时会返回 0 条 + 「登录之后再搜索」而不是报错，
 * 这是典型的**静默失败** —— 会被误读成"没有岗位"。所以这里必须把它识别成
 * `login-required`，让调用方知道是被墙了。
 *
 * 反过来，`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙。
 */
export function detectBlockInPage(arg) {
    const body = document.body;
    const text = body === null ? '' : String(body.textContent ?? '');
    const compact = text.replace(/\s+/g, '');
    let cards = 0;
    try {
        cards = document.querySelectorAll(arg.card).length;
    }
    catch {
        cards = 0;
    }
    // payload 里有没有真岗位。AB 分流会把这路由丢到老 `/jobs` 掩码页：其卡片是
    // `.job-card`（不在 `arg.card` 里），但 `__INITIAL_STATE__.positionList` 往往仍有真数据。
    // **有真数据就不算撞墙** —— 否则这一整轮会被误判成 login-required 直接跳过。
    const hasStateJobs = (() => {
        const scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
        for (const script of scripts) {
            const src = script.textContent ?? '';
            const marker = src.indexOf('__INITIAL_STATE__');
            if (marker < 0)
                continue;
            const pKey = src.indexOf('"positionList"', marker);
            if (pKey < 0)
                continue;
            const open = src.indexOf('[', pKey);
            if (open < 0)
                continue;
            // 配平 positionList 数组到它的收尾 ']'，看中间有没有元素（元素必有 '{'）。
            let depth = 0;
            let inString = false;
            let escaped = false;
            let sawItem = false;
            for (let i = open; i < src.length; i += 1) {
                const ch = src.charAt(i);
                if (inString) {
                    if (escaped)
                        escaped = false;
                    else if (ch === '\\')
                        escaped = true;
                    else if (ch === '"')
                        inString = false;
                    continue;
                }
                if (ch === '"')
                    inString = true;
                else if (ch === '[')
                    depth += 1;
                else if (ch === ']') {
                    depth -= 1;
                    if (depth === 0)
                        break;
                }
                else if (ch === '{' && depth === 1)
                    sawItem = true;
            }
            return sawItem;
        }
        return false;
    })();
    // 极验（geetest）与阿里云 nc 两套验证码都点名；智联登录环节用的是极验/易盾。
    const captcha = document.querySelector('.geetest_panel, .geetest_holder, .geetest_box, #nc_1_wrapper, iframe[src*="captcha"], [class*="verify-wrap"], .waf-nc-title, script[name^="aliyunwaf_"]');
    if (captcha !== null)
        return 'captcha';
    if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量/.test(compact))
        return 'rate-limited';
    // 平台侧"额度用完"（智联投递上限约 100，文案含"达到上限"）≠ 频控：今天就此打住。
    if (/今日投递太多|休息一下明天再来|达到上限|次数过多/.test(compact))
        return 'quota-exhausted';
    if (cards === 0) {
        // 载荷里有真数据 → 页面其实是好的（AB 分流落到老路由），不是被墙。
        if (hasStateJobs)
            return null;
        // 加了筛选参数但没登录 → 站点返回 0 条 + 这句文案（**静默失败**，必须显式点出）
        if (/登录之后再搜索|登录查看更多相关职位/.test(compact))
            return 'login-required';
        let noJobTip = false;
        try {
            noJobTip = document.querySelector(arg.noJobTip) !== null;
        }
        catch {
            noJobTip = false;
        }
        // `noJobTip` 在"真没结果"和"被墙"两种情况下都会出现，所以它**不能单独**当登录依据。
        if (noJobTip && compact.length < 400 && /登录|注册/.test(compact))
            return 'login-required';
        if (/很抱歉/.test(compact) && /登录/.test(compact))
            return 'login-required';
        if (compact.length < 80)
            return 'blank';
    }
    return null;
}
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 只认**结构性信号**，不认文案：实测 `/sou/` 结果页在未登录时会给列表容器和
 * 每张卡片加上 `-unlogin` 修饰类（`positionlist__list-unlogin` /
 * `joblist-box__item-unlogin`），底部还有一个 `positionlist__login-foot`。
 * 这些比"页面上有没有『登录』两个字"稳得多 —— 后者在**正常结果页**上同样成立
 * （右上角一直有登录入口），拿它判断会导致"永远判定为未登录"。
 */
export function isLoggedInInPage(_arg) {
    // 优先信载荷里的明确信号：`__INITIAL_STATE__.isLogged` 是平台的权威判定（实测为布尔）。
    // 只有它是 **true** 时才短路 —— false 不直接下结论（老结构页可能没有该字段），
    // 好继续用结构类名兜底。
    for (const script of Array.prototype.slice.call(document.querySelectorAll('script'))) {
        const text = script.textContent ?? '';
        if (text.indexOf('__INITIAL_STATE__') < 0)
            continue;
        const m = /"isLogged"\s*:\s*(true|false)/.exec(text);
        if (m !== null && m[1] === 'true')
            return true;
    }
    if (document.querySelector('.joblist-box__item-unlogin') !== null)
        return false;
    if (document.querySelector('.positionlist__list-unlogin') !== null)
        return false;
    // `positionlist__login-foot` 这个块**在已登录时也存在于 DOM 里**（只是 display:none），
    // 所以不能"存在即未登录" —— 必须先判断它是不是真的显示出来了。
    let foot = null;
    try {
        foot = document.querySelector('.positionlist__login-foot');
    }
    catch {
        foot = null;
    }
    if (foot !== null) {
        const style = foot.getAttribute('style') ?? '';
        const hiddenByStyle = style.replace(/\s+/g, '').indexOf('display:none') >= 0;
        if (!hiddenByStyle && foot.getAttribute('hidden') === null)
            return false;
    }
    return true;
}
/**
 * **在页面上下文里**取下一页的无 query path 地址。
 *
 * 为什么读真实 href 而不是自己拼：站点把关键词编码成了自己的 token
 * （`/sou/jl765/kw01500O80EO062/p2`），明文塞进 path 会被判无效并返回 0 条。
 * 分页区的 href 是**站点自己生成的**，直接用它最稳，也顺带满足 robots（无 query）。
 */
export function nextPageUrlInPage(arg) {
    const links = Array.prototype.slice.call(document.querySelectorAll(arg.pagination + ' a'));
    for (const link of links) {
        const href = link.getAttribute('href');
        if (href === null || href === '')
            continue;
        const label = (link.textContent ?? '').replace(/\s+/g, '');
        const disabled = link.getAttribute('disabled') !== null || /disable/.test(link.className);
        if (label === '下一页' && !disabled) {
            // 相对地址补全成绝对地址，交给 goto 处理。
            if (href.indexOf('http') === 0)
                return href;
            return 'https://www.zhaopin.com' + (href.indexOf('/') === 0 ? href : '/' + href);
        }
    }
    return null;
}
/** 站点自报的总页数（用于"别翻过实际页数"）。 */
export function totalPagesInPage() {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
    for (const script of scripts) {
        const text = script.textContent ?? '';
        const marker = text.indexOf('__INITIAL_STATE__');
        if (marker < 0)
            continue;
        const m = /"pages"\s*:\s*(\d+)/.exec(text.slice(marker));
        if (m !== null && m[1] !== undefined)
            return Number.parseInt(m[1], 10);
    }
    return 0;
}
/** 构造智联招聘适配器。 */
export function createZhaopinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_ZHAOPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码写在路径段里（/sou/jl<码>），且只能逐城实测 —— 城市导航页只给拼音 slug，推导不出数字码',
        },
        {
            key: 'sort',
            label: '排序方式',
            values: ZHAOPIN_SORT_OPTIONS,
            hint: '页面只有「智能匹配 / 薪酬最高 / 最新发布」三项，其中只有「最新发布」（order=4）是实测值；其余取值无证据，故不提供',
        },
        {
            key: 'postedWithinDays',
            label: '发布时间',
            values: ZHAOPIN_POSTED_WITHIN_OPTIONS,
            hint: '智联的搜索 URL 不暴露发布时间维度（只能在页面上点筛选，且加筛选会撞登录墙），因此该维度不可用',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: ZHAOPIN_MAX_PAGES,
            hint: `默认 ${String(ZHAOPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(ZHAOPIN_MAX_PAGES)} 页；站点自报一次搜索约 20 条/页`,
        },
    ];
    return {
        id: 'zhaopin',
        ...platformFacts('zhaopin'),
        displayName: '智联招聘',
        capabilities: {
            // 实测：免登录能按关键词搜、能翻页、薪资明文；但**加任何筛选参数就撞登录墙**。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            // 打招呼：智联的沟通入口要登录，且未登录 DOM 里没有"在线沟通"按钮。
            // 这里**声明为不支持**，让 guard 明确拒绝，而不是让用户以为能发。
            supportsGreeting: false,
            fieldCompleteness: 'high',
            antiBot: 'medium',
        },
        // §4.2.4：适配器自己声明必需字段。
        requiredFields: CORE_FIELDS,
        criteriaDimensions: dimensions,
        maxPages: ZHAOPIN_MAX_PAGES,
        auth: {
            loginUrl: 'https://passport.zhaopin.com/login',
            async isLoggedIn(page) {
                return await page.evaluate(isLoggedInInPage, {
                    loginPopup: config.selectors.loginPopup,
                    loginGateText: '登录之后再搜索',
                });
            },
        },
        criteria: {
            buildSearchUrl(criteria) {
                return buildZhaopinSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildZhaopinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`智联招聘：无法为城市「${criteria.city ?? ''}」构造搜索 URL（城市码未配置）`);
                }
                await page.goto(url);
                // 页面是**服务端渲染**（无 JS 也能拿到 20 条），但仍等一次卡片容器：
                // 风控/降级时站点会返回没有列表的骨架页，而"0 条"最容易被误读成"今天没有新岗位"。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, config);
            },
            /**
             * 还有没有下一页。
             *
             * 用**下一页链接**判断，而不是"卡片数 == 20"这种启发式 ——
             * 后者在最后一页刚好 20 条时会多跑一轮空请求。
             * 同时读站点自报的 `pages`，避免翻过实际页数。
             */
            async hasNextPage(page) {
                const next = await page.evaluate(nextPageUrlInPage, { pagination: config.selectors.pagination });
                if (next === null)
                    return false;
                const total = await page.evaluate(totalPagesInPage, undefined);
                if (total > 0) {
                    const current = await page.evaluate(currentPageInPage, undefined);
                    if (current > 0 && current >= total)
                        return false;
                }
                return true;
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockInPage, {
                    card: config.selectors.card,
                    loginPopup: config.selectors.loginPopup,
                    noJobTip: config.selectors.noJobTip,
                });
            },
        },
        // 详情页解析（P2 详情抓取）。未登录即可访问详情页拿 JD 全文；薪资/DOM 层会掩码，
        // 但载荷 `detailedPosition` 里是真实值（见 `extractJobDetailInPage`）。
        detail: {
            async extract(page) {
                return await page.evaluate(extractJobDetailInPage, config);
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
        // 智联的打招呼与投递都要登录态，且实测未登录 DOM 里连"在线沟通"都没有，
        // 没有任何可靠的按钮契约可依。按「不编选择器」的原则，宁可让 guard
        // 以 ADAPTER_BROKEN 明确拒绝（fail-closed），也不上线一个会乱点的实现。
        // 详见 docs/ADAPTERS.md 的待办。
    };
}
/** 当前页码（从内嵌载荷里读）。 */
export function currentPageInPage() {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
    for (const script of scripts) {
        const text = script.textContent ?? '';
        const marker = text.indexOf('__INITIAL_STATE__');
        if (marker < 0)
            continue;
        const m = /"pageIndex"\s*:\s*(\d+)/.exec(text.slice(marker));
        if (m !== null && m[1] !== undefined)
            return Number.parseInt(m[1], 10);
    }
    return 0;
}
//# sourceMappingURL=zhaopin.js.map