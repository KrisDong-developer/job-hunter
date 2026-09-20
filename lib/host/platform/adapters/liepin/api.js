/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 *
 * ⚠️ 请求头**不是可选的**：少一组 `x-fscp-*` 服务端就回 `{"flag":0,"code":"-1400"}`
 * （HTTP 200！），而调用方会静默回退 DOM —— 见 `LIEPIN_API_HEADERS` 的实测表。
 * 其中三项必须在**页面里现造**（序列化进来的函数不能引用闭包）：
 *   * `x-fscp-trace-id`：每请求一个 UUID（实测服务端不校验其内容，格式对即可）；
 *   * `x-fscp-bi-stat`：`{"location": <当前页 URL>}`；
 *   * `x-fscp-fe-version`：实测是**空字符串**（但必须存在）。
 *
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    const uuid = (() => {
        const cryptoImpl = globalThis.crypto;
        if (typeof cryptoImpl?.randomUUID === 'function')
            return cryptoImpl.randomUUID();
        // 退化形态：**保持 UUID 的形状**（实测只验形状，不验出处），别退成别的格式。
        const hex = (length) => {
            let out = '';
            while (out.length < length)
                out += Math.floor(Math.random() * 16).toString(16);
            return out.slice(0, length);
        };
        return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
    })();
    const headers = {
        ...arg.headers,
        'x-fscp-trace-id': uuid,
        'x-fscp-bi-stat': JSON.stringify({ location: globalThis.location?.href ?? '' }),
        'x-fscp-fe-version': '',
    };
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(arg.body),
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export function refreshTimeToIso(raw) {
    if (!/^\d{14}$/.test(raw))
        return null;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export function parseSearchApiResponse(payload) {
    const out = [];
    if (payload === null || typeof payload !== 'object')
        return out;
    const root = payload;
    const cards = root.data?.data?.jobCardList ?? root.data?.jobCardList;
    if (!Array.isArray(cards))
        return out;
    for (const entry of cards) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const item = entry;
        const job = item.job;
        const comp = item.comp;
        if (job === undefined)
            continue;
        const jobId = job['jobId'];
        if (jobId === undefined || jobId === null || String(jobId) === '')
            continue;
        const text = (value) => (typeof value === 'string' ? value.trim() : '');
        const refreshIso = refreshTimeToIso(text(job['refreshTime']));
        const labels = job['labels'];
        const tags = Array.isArray(labels)
            ? labels.filter((label) => typeof label === 'string' && label !== '').slice(0, 6)
            : undefined;
        out.push({
            platformJobId: String(jobId),
            title: text(job['title']),
            salaryRaw: text(job['salary']),
            company: comp === undefined ? '' : text(comp['compName']),
            sourceUrl: text(job['link']),
            city: text(job['dq']),
            expReq: text(job['requireWorkYears']),
            eduReq: text(job['requireEduLevel']),
            industry: comp === undefined ? null : text(comp['compIndustry']) || null,
            companySize: comp === undefined ? null : text(comp['compScale']) || null,
            publishedAt: refreshIso,
            ...(tags === undefined || tags.length === 0 ? {} : { tags }),
        });
    }
    return out;
}
//# sourceMappingURL=api.js.map