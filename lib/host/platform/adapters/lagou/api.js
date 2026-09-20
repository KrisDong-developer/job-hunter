/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整 Cookie/指纹/TLS，
 * 与猎聘/神仙外企同一铁律：绝不回退宿主 Node 的 fetch）。返回解析后的 JSON；
 * 任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    let body = '';
    try {
        body = new URLSearchParams(arg.form).toString();
    }
    catch {
        body = '';
    }
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        // 拉勾 positionAjax 是表单编码。X-Requested-With 是 jQuery `$.ajax` 的默认头
        // （站点自己也带），加上它才是"同一种请求"。
        //
        // ⚠️ 两个 `X-Anit-Forge-*` 是**未经实测验证的占位值**（`0` / `None`）：真实站点上它们
        // 是会话级动态 token，这里的常量是"经典爬虫写法 + 配套 cookie"那一路。**不删**的原因是
        // 删掉只会让这条通道更容易被拒，而当前没有证据说它被校验；但也不能当它已经过了校准 ——
        // 这条通道一旦失败就是静默回退 DOM，而本适配器的 DOM 选择器还是 `experimental`。
        //
        // ⚠️ 原先这里还手写了一个 `Referer` —— 那是 **fetch 规范的禁止头**（forbidden header name），
        // 浏览器会直接忽略它。"以为设了其实没设"比不设更糟：它会让人误以为 Referer 已经复刻了。
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Anit-Forge-Code': '0',
            'X-Anit-Forge-Token': 'None',
        },
        body,
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/**
 * 解析搜索接口响应（Node 侧纯函数；结构经典：`content.positionResult.result[]`）。
 * 字段比 DOM 富：createTime（毫秒）/ companySize / financeStage / industryField / positionAdvantage。
 */
export function parseSearchApiResponse(payload) {
    const out = [];
    if (payload === null || typeof payload !== 'object')
        return out;
    const root = payload;
    const result = root.content?.positionResult?.result;
    if (!Array.isArray(result))
        return out;
    for (const entry of result) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const item = entry;
        const text = (key) => item[key] === null || item[key] === undefined
            ? ''
            : String(item[key]).replace(/\s+/g, ' ').trim();
        const rawId = item['positionId'];
        // 广告/异常卡 positionId 可能缺或为 0 —— 跳过（真实岗位 id 是正整数）。
        if (rawId === null || rawId === undefined || rawId === '' || rawId === 0)
            continue;
        const platformJobId = String(rawId);
        // createTime 是毫秒时间戳（本地时）→ ISO
        let publishedAt = null;
        const rawTime = item['createTime'];
        if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0) {
            const date = new Date(rawTime);
            if (!Number.isNaN(date.getTime()))
                publishedAt = date.toISOString();
        }
        const company = text('companyFullName') || text('companyName');
        const sourceUrl = text('positionURL') || `https://www.lagou.com/wn/jobs/${platformJobId}.html`;
        const tags = [];
        const advantage = text('positionAdvantage');
        if (advantage !== '')
            tags.push(advantage);
        const notes = [];
        if (text('salary') === '')
            notes.push('薪资未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        out.push({
            platformJobId,
            title: text('positionName'),
            salaryRaw: text('salary'),
            company,
            sourceUrl,
            city: text('city'),
            district: text('district'),
            expReq: text('workYear'),
            eduReq: text('education'),
            ...(tags.length === 0 ? {} : { tags }),
            ...(publishedAt === null ? {} : { publishedAt }),
            industry: text('industryField') === '' ? null : text('industryField'),
            companySize: text('companySize') === '' ? null : text('companySize'),
            companyNature: text('financeStage') === '' ? null : text('financeStage'),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
//# sourceMappingURL=api.js.map