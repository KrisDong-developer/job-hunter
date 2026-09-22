/**
 * **在页面上下文里**解析列表。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以薪资拼接、日期截取这些逻辑在函数体内**各写一遍**，
 * 并由 `test/platform/waiqi.test.ts` 的「按源码重建函数」护栏守住。
 *
 * @param config 选择器与字段配置（由宿主序列化传入）
 */
export function extractJobsInPage(config) {
    // 下面这段是**同步**的：真正的网络请求在 `fetchListInPage` 里。
    // 这样"解析"与"取数"分开，解析逻辑可以被 jsdom 直接喂一段 JSON 验证。
    const maxCards = 200; // 异常页面兜底：最多解析多少条
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const asNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const queryAll = (scope, selector) => {
        try {
            return Array.prototype.slice.call(scope.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    const fields = config.fields;
    // 数据来源优先级：接口载荷（`window.__WAIQI_LIST_PAYLOAD__`，由 fetchListInPage 写入）
    //   → 内联夹具载荷（离线测试用 `<script id="waiqi-fixture-payload">`）
    // 两者都没有时返回空数组 —— 上层会把它判成"没解析出记录"。
    const globalScope = globalThis;
    let payload = globalScope.__WAIQI_LIST_PAYLOAD__;
    if (payload === undefined || payload === null) {
        const holder = queryAll(document, '#waiqi-fixture-payload')[0] ?? null;
        if (holder !== null) {
            try {
                payload = JSON.parse(holder.textContent ?? '');
            }
            catch {
                payload = null;
            }
        }
    }
    const root = payload;
    const data = (root?.data ?? {});
    const positionVo = (data['positionVO'] ?? {});
    const rawRecords = positionVo['records'];
    if (!Array.isArray(rawRecords))
        return [];
    const records = rawRecords.slice(0, maxCards);
    const out = [];
    for (const item of records) {
        if (item === null || typeof item !== 'object')
            continue;
        const record = item;
        const text = (key) => clean(record[fields[key] ?? key]);
        const id = text('id');
        // 广告卡片没有 id —— 直接跳过（needAd=1 时它们与岗位混在同一数组里）。
        if (id === '')
            continue;
        const notes = [];
        // ── 薪资：平台的展示规则是 `{min}-{max}K`，`coefficient>12` 时挂 `*{n}薪` ──
        // `salary_raw` 是**核心字段**，空串会被 `partitionByRequiredFields` 拦下；
        // 这个平台大量岗位薪资为 null，所以必须给"面议"这个可读兜底，
        // 否则整轮抓取会全部进 `pending_repair`，看起来像适配器坏了。
        const min = asNumber(record[fields.salaryMin]);
        const max = asNumber(record[fields.salaryMax]);
        const months = asNumber(record[fields.salaryMonths]);
        const negotiable = record[fields.negotiable] === 1;
        let salaryRaw = '面议';
        if (!negotiable && (min !== null || max !== null)) {
            salaryRaw = `${String(min ?? 0)}-${String(max ?? min ?? 0)}K`;
            if (months !== null && months > 12)
                salaryRaw = `${salaryRaw}*${String(months)}薪`;
        }
        else if (min === null && max === null) {
            notes.push('salary:absent');
        }
        const title = text('title');
        const titleEn = text('titleEn');
        if (title === '' && titleEn === '')
            notes.push('title:missing');
        if (title === '' && titleEn !== '')
            notes.push('title:from-en');
        // ── 标签：`tagNameList`（数组）+ `attribute`（逗号分隔的另一套） ──
        const tags = [];
        const tagList = record[fields.tags];
        if (Array.isArray(tagList)) {
            for (const tag of tagList) {
                const value = clean(tag);
                if (value !== '' && !tags.includes(value))
                    tags.push(value);
            }
        }
        const attribute = text('attribute');
        if (attribute !== '') {
            for (const part of attribute.split(/[,，、]/)) {
                const value = clean(part);
                if (value !== '' && !tags.includes(value))
                    tags.push(value);
            }
        }
        // 外企国别是"神仙外企"最有信息量的一个标签，单独缀到标签里（原始字段仍在记录里）。
        const foreignTag = text('foreignTag');
        if (foreignTag !== '')
            tags.push(`外企·${foreignTag}`);
        // 岗位职能分类（`posCategoryName`，如 人事/行政 / IT技术）—— 与行业 `industry` 互补，
        // 单独缀一个便于按"岗位性质"识别与检索。
        const posCategory = text('posCategory');
        if (posCategory !== '')
            tags.push(`职能·${posCategory}`);
        // ── 来源与投递方式（给后续"哪些要走官网 ATS"用） ──
        const sourceCode = text('source');
        if (sourceCode !== '')
            notes.push(`source:${sourceCode}`);
        const outsideUrl = text('outsideUrl');
        if (outsideUrl !== '')
            notes.push('apply:external-site');
        // `informationSource` 更具体：不只看是否外投，还指名背后是哪套渠道 / ATS
        // （`workday` / `successfactors` / `oraclecloud` / `万豪官网招聘`……）。实测常驻、很有信息量。
        const ats = text('informationSource');
        if (ats !== '')
            notes.push(`ats:${ats}`);
        const positionType = text('positionType');
        const posType = positionType === '' ? config.defaultPosType : positionType;
        // ── 发布时间：平台给的是 `YYYY-MM-DD HH:mm:ss`（本地时、无时区） ──
        // **只取日期段**：`new Date("2026-09-17 11:18:51")` 在不同引擎上按本地时解析，
        // 跨时区会前后漂一天；而我们只需要"哪一天发的"。
        const createTime = text('publishedAt');
        const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(createTime);
        out.push({
            platformJobId: id,
            title: title !== '' ? title : titleEn,
            salaryRaw,
            company: text('company'),
            sourceUrl: config.detailUrlTemplate
                .split('{jobId}')
                .join(id)
                .split('{posType}')
                .join(posType),
            city: text('city'),
            // 有的岗位 `districtName` 为空，但 `address` 有真实办公地点（如"深圳龙岗区…"）。
            // 用 address 兜底落到 district，让用户至少知道岗位在哪儿。
            district: text('district') === '' ? text('address') : text('district'),
            expReq: text('exp'),
            eduReq: text('edu'),
            tags,
            publishedAt: dateMatch === null ? null : dateMatch[1],
            industry: text('industry') === '' ? null : text('industry'),
            companySize: text('companySize') === '' ? null : text('companySize'),
            companyNature: text('companyNature') === '' ? null : text('companyNature'),
            notes,
        });
    }
    return out;
}
/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 为什么分两步而不是一个 async 函数干完：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果，不必给 jsdom 装 fetch。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export async function fetchListInPage(arg) {
    // ⚠️ 不写 `window.fetch`：真浏览器里 `fetch` 挂在 `window`（= globalThis）上，
    // 而离线夹具里 `window` 是 jsdom 的 window、**没有** fetch（见 `test/support/jsdom-page.ts`）。
    // `globalThis` 在两条路径上都拿得到"当前上下文"的东西，是唯一两边都成立的说法。
    const scope = globalThis;
    // ⚠️ 只认**页面上下文自己的** fetch —— 也就是"上一次 evaluate 时装上的那个"
    // （真浏览器里是 `window.fetch`）。绝不回退到宿主 Node 的 fetch：
    // 那会让一次本该走浏览器登录态的采集，变成宿主直连接口；
    // 在离线测试里更糟 —— 它会**真的打到线上**（这条是被 `test/platform/waiqi.test.ts`
    // 的「页面上下文没有 fetch」用例逼出来的：当时它没抛错，而是把真实接口抓回来了）。
    if (scope.__WAIQI_FETCH__ !== scope.fetch || typeof scope.fetch !== 'function') {
        return { ok: false, code: null, message: 'fetch 不可用（页面上下文异常）', status: 0 };
    }
    let payload = null;
    let status = 0;
    try {
        const response = await scope.fetch(arg.url, {
            method: 'POST',
            // 带上同源 Cookie / 登录态 —— 与用户自己在页面上翻列表走同一条链路。
            credentials: 'include',
            headers: {
                'content-type': 'application/json;charset=UTF-8',
                accept: 'application/json, text/plain, */*',
                // 前端 axios 拦截器固定带 `source: 24`；缺了它服务端会走另一套分支。
                source: '24',
            },
            body: JSON.stringify(arg.body),
        });
        status = typeof response.status === 'number' ? response.status : 0;
        payload = await response.json();
    }
    catch (error) {
        const name = error !== null && typeof error === 'object' && 'name' in error
            ? String(error.name)
            : 'Error';
        return { ok: false, code: null, message: `网络请求失败（${name}）`, status };
    }
    // 把响应交给 `extractJobsInPage` —— 它在**同一次 evaluate 的后续调用**里读这个全局。
    scope.__WAIQI_LIST_PAYLOAD__ = payload;
    const parsed = payload;
    const code = parsed !== null && parsed !== undefined && typeof parsed.code === 'number' ? parsed.code : null;
    const message = parsed !== null && parsed !== undefined && typeof parsed.message === 'string' ? parsed.message : '';
    // 实测成功码：1000。0/200 一并容忍（不同网关层的写法）。
    const ok = code === 1000 || code === 0 || code === 200;
    return { ok, code, message, status };
}
/**
 * **在页面上下文里**解析详情接口响应 → `RawJobDetail`（同步、自包含）。
 *
 * 数据来源与列表同一协议：`fetchDetailInPage` 写 `globalThis.__WAIQI_DETAIL_PAYLOAD__`，
 * 这里读它；离线测试可改用 `<script id="waiqi-detail-fixture-payload">` 内联夹具。
 *
 * JD 的拼法（2026-09-21 实测定案）：`description` 是**原文**（外企岗常为纯英文），
 * `translateDescription` 是**平台提供的完整中文翻译**（实测可与原文逐段对上）。
 * 下游（打分 / 技能差距分析）按中文关键词匹配，纯英文 JD 会系统性漏配 ——
 * 所以两者都在时拼接为「原文 + 【平台中文翻译】标记 + 译文」；原文缺失时用译文兜底并记 note。
 *
 * ⚠️ 详情响应的城市键是 `cityNamelist`（小写 l），与列表不同 —— 字段表来自 `config.detailFields`。
 */
export function extractDetailInPage(config) {
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const asNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const queryAll = (scope, selector) => {
        try {
            return Array.prototype.slice.call(scope.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    const fields = config.detailFields;
    const globalScope = globalThis;
    let payload = globalScope.__WAIQI_DETAIL_PAYLOAD__;
    if (payload === undefined || payload === null) {
        const holder = queryAll(document, '#waiqi-detail-fixture-payload')[0] ?? null;
        if (holder !== null) {
            try {
                payload = JSON.parse(holder.textContent ?? '');
            }
            catch {
                payload = null;
            }
        }
    }
    const root = payload;
    const record = (root?.data ?? null) ?? {};
    const text = (key) => clean(record[fields[key] ?? key]);
    // 岗位 id：以**当前页 URL** 里的 `?id=` 为准（与列表侧 upsert 的 platformJobId 同键），
    // 响应里的 id 只作兜底 —— URL 是主链按 sourceUrl 导航过来的，两侧不一致时信导航。
    let idFromUrl = '';
    try {
        const match = /[?&]id=(\d+)/.exec(String(location.href));
        idFromUrl = match === null ? '' : (match[1] ?? '');
    }
    catch {
        idFromUrl = '';
    }
    const id = idFromUrl !== '' ? idFromUrl : text('id');
    const notes = [];
    // ── JD：原文 + 平台中文翻译（见函数头注释） ──
    const jdOriginal = text('jdText');
    const jdTranslate = text('jdTranslate');
    let jdText = '';
    if (jdOriginal !== '' && jdTranslate !== '' && jdOriginal !== jdTranslate) {
        jdText = `${jdOriginal}\n\n【平台中文翻译】\n${jdTranslate}`;
    }
    else if (jdOriginal !== '') {
        jdText = jdOriginal;
    }
    else if (jdTranslate !== '') {
        jdText = jdTranslate;
        notes.push('jd:from-translate');
    }
    if (jdText === '')
        notes.push('jd:absent');
    // ── 薪资：与列表同一条展示规则（面议兜底，`coefficient>12` 挂 `*N薪`） ──
    const min = asNumber(record[fields.salaryMin]);
    const max = asNumber(record[fields.salaryMax]);
    const months = asNumber(record[fields.salaryMonths]);
    const negotiable = record[fields.negotiable] === 1;
    let salaryRaw = '面议';
    if (!negotiable && (min !== null || max !== null)) {
        salaryRaw = `${String(min ?? 0)}-${String(max ?? min ?? 0)}K`;
        if (months !== null && months > 12)
            salaryRaw = `${salaryRaw}*${String(months)}薪`;
    }
    else if (min === null && max === null) {
        notes.push('salary:absent');
    }
    const title = text('title');
    const titleEn = text('titleEn');
    if (title === '' && titleEn === '')
        notes.push('title:missing');
    // ── 标签：福利（`welfareList` 数组）+ `attribute`（逗号分隔） ──
    const tags = [];
    const welfareList = record[fields.welfare];
    if (Array.isArray(welfareList)) {
        for (const item of welfareList) {
            const value = clean(item);
            if (value !== '' && !tags.includes(value))
                tags.push(value);
        }
    }
    const attribute = text('attribute');
    if (attribute !== '') {
        for (const part of attribute.split(/[,，、]/)) {
            const value = clean(part);
            if (value !== '' && !tags.includes(value))
                tags.push(value);
        }
    }
    // ── 来源与投递方式（与列表同款 note 口径，供下游判断"投递走哪套渠道"） ──
    const sourceCode = text('source');
    if (sourceCode !== '')
        notes.push(`source:${sourceCode}`);
    if (text('outsideUrl') !== '')
        notes.push('apply:external-site');
    const ats = text('informationSource');
    if (ats !== '')
        notes.push(`ats:${ats}`);
    // 与 zhipin 详情同口径：地址给**实际导航到的** location.href（主链只用 jdText，
    // sourceUrl 在这里只是回显；重建模板反而会引入第二份 URL 拼接逻辑）。
    let currentUrl = '';
    try {
        currentUrl = String(location.href);
    }
    catch {
        currentUrl = '';
    }
    return {
        platformJobId: id,
        title: title !== '' ? title : titleEn,
        salaryRaw,
        company: text('company'),
        sourceUrl: currentUrl,
        // JD 是详情补抓的**唯一目的**：空值如实给 null（主链记"没解析出 JD"），不编。
        jdText: jdText === '' ? null : jdText,
        city: text('city'),
        district: text('district') === '' ? text('address') : text('district'),
        expReq: text('exp'),
        eduReq: text('edu'),
        tags,
        publishedAt: (() => {
            const createTime = text('publishedAt');
            const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(createTime);
            return dateMatch === null ? null : (dateMatch[1] ?? null);
        })(),
        industry: text('industry') === '' ? null : text('industry'),
        companySize: text('companySize') === '' ? null : text('companySize'),
        companyNature: text('companyNature') === '' ? null : text('companyNature'),
        notes,
    };
}
/**
 * **在页面上下文里**发详情接口请求（GET，自包含），把响应挂到全局供 `extractDetailInPage` 解析。
 *
 * 与 `fetchListInPage` 同一套纪律：只认**页面上下文自己的** fetch（`__WAIQI_FETCH__` 护栏），
 * 绝不回退宿主 Node 的 fetch（那会脱离浏览器登录态、在离线测试里还会真的打到线上）。
 */
export async function fetchDetailInPage(arg) {
    const scope = globalThis;
    if (scope.__WAIQI_FETCH__ !== scope.fetch || typeof scope.fetch !== 'function') {
        return { ok: false, code: null, message: 'fetch 不可用（页面上下文异常）', status: 0 };
    }
    let payload = null;
    let status = 0;
    try {
        const response = await scope.fetch(arg.url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'content-type': 'application/json;charset=UTF-8',
                accept: 'application/json, text/plain, */*',
                source: '24',
            },
        });
        status = typeof response.status === 'number' ? response.status : 0;
        payload = await response.json();
    }
    catch (error) {
        const name = error !== null && typeof error === 'object' && 'name' in error
            ? String(error.name)
            : 'Error';
        return { ok: false, code: null, message: `网络请求失败（${name}）`, status };
    }
    scope.__WAIQI_DETAIL_PAYLOAD__ = payload;
    const parsed = payload;
    const code = parsed !== null && parsed !== undefined && typeof parsed.code === 'number' ? parsed.code : null;
    const message = parsed !== null && parsed !== undefined && typeof parsed.message === 'string' ? parsed.message : '';
    const ok = code === 1000 || code === 0 || code === 200;
    return { ok, code, message, status };
}
export function detectBlockInPage(arg) {
    const body = document.body;
    const text = body === null ? '' : String(body.textContent ?? '');
    const compact = text.replace(/\s+/g, '');
    for (const selector of arg.signals.captchaSelectors) {
        try {
            if (document.querySelector(selector) !== null)
                return 'captcha';
        }
        catch {
            // 单个选择器非法不影响其它判据
        }
    }
    for (const word of arg.signals.rateText) {
        if (compact.includes(word))
            return 'rate-limited';
    }
    // 平台侧"额度用完"≠ 频控：退避重试没用，今天就此打住。
    for (const word of arg.signals.quotaText) {
        if (compact.includes(word))
            return 'quota-exhausted';
    }
    if (arg.code === 1022)
        return 'login-required';
    // 实时探针触发过：匿名接口短时间高频访问 → `code=429 访问行为异常，请稍后再试`。
    // 判成 rate-limited，主链据此**停手退避**，而不是按 PARSE_FAILED 继续撞卷这堵墙。
    if (arg.code === 429)
        return 'rate-limited';
    // 阈值来自共享词表（80，比通用的 120 更严）
    if (arg.cardCount === 0 && compact.length < arg.signals.blankTextLength)
        return 'blank';
    return null;
}
/** 在页面上下文里找「下一页」是否可用。**注意**：真正的闸门是 `maxPages=1`。 */
export function hasNextPageInPage(arg) {
    try {
        return document.querySelector(arg.selector) !== null;
    }
    catch {
        return false;
    }
}
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递、收藏、订阅。
 * 所以这里只看一个结构性信号：页面上是否有用户头像（未登录时是"登录"按钮）。
 *
 * ⚠️ **不认"页面上有没有『登录』两个字"**：正常结果页右上角一直有登录入口，
 * 拿它判断会导致"永远判定为未登录"，定时任务就永远不跑了（那是个很隐蔽的死锁）。
 */
export function isLoggedInInPage() {
    return (document.querySelector('.head-avatar') !== null || document.querySelector('[class*="user-icon"]') !== null);
}
/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export function countCardsInPage(arg) {
    try {
        return document.querySelectorAll(arg.selector).length;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=page.js.map