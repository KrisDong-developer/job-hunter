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
        // **分步滚到底**，不是一帧跳到底：`scrollTo(0, scrollHeight)` 是"整页瞬间跳完"，
        // 真人是一段一段滚下去的（每段之间还有几十毫秒的间隔）。步数上限 10 步，
        // 免得超长列表把每一轮的 `stepTimeoutMs` 预算全吃在滚动上。
        try {
            const start = typeof window.scrollY === 'number' ? window.scrollY : 0;
            const target = document.body.scrollHeight;
            const steps = Math.min(10, Math.max(2, Math.ceil((target - start) / 700)));
            for (let index = 1; index <= steps; index += 1) {
                window.scrollTo(0, Math.round(start + ((target - start) * index) / steps));
                await sleep(60 + Math.floor(Math.random() * 120));
            }
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
        // ⚠️ 薪资数字是**字体混淆**的私有区码点（见文件头「薪资混淆」）——
        //    把乱码当薪资写库，比留空更坏：下游会把它当成一份"读到的"薪资去排序/展示。
        //    实测登录态 15/15 张卡片都带私有区码点 ⇒ 一律置空 + 记 note。
        if (/[\uE000-\uF8FF]/.test(salaryRaw)) {
            salaryRaw = '';
            notes.push('salary:obfuscated');
        }
        else if (salaryRaw === '') {
            notes.push('未登录视图薪资隐藏（登录后可升级）');
        }
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
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标。
 *
 * 规则：只统计**可见**（有尺寸且没被 display/visibility/pointer-events 关掉）的元素；
 * `textIncludes` 非空时再按文本过滤；取**第一个命中的**。
 *
 * ⚠️ 逗号选择器返回的是**文档顺序**，不是候选优先级 —— 所以候选里只能放**同类可点元素**
 * （别放容器 div：容器总排在里面的链接之前，会被先选中）。
 * 2026-09-18 实测因此把 `.btn-startchat-wrap` 从候选里剔除，见 `chatButton` 的注释。
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
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据来自两份真实快照的对比 —— 未登录夹具 `test/fixtures/zhipin-search.html`
 * vs 真实登录态快照 `test/fixtures/zhipin-search-logged-in.html`：
 *
 * | 锚点 | 未登录 | 已登录 |
 * |---|---|---|
 * | `a[ka="header-username"]`（页头「求职者」下拉） | 无 | **有** |
 * | `a[ka="header-login"]`（页头「登录/注册」） | **有** | 无 |
 *
 * 两者都不在 ⇒ 返回 `null`（**判不出来**），由适配器落成 `false`（保守：
 * 宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export function isLoggedInByMarkersInPage(arg) {
    const has = (selector) => {
        if (selector === '')
            return false;
        try {
            return document.querySelector(selector) !== null;
        }
        catch {
            return false;
        }
    };
    if (has(arg.loggedIn))
        return true;
    if (has(arg.notLoggedIn))
        return false;
    return null;
}
//# sourceMappingURL=list.js.map