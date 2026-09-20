/**
 * BOSS 直聘列表接口（薪资明文 + 字段回填通道）的页面内请求与响应解析。
 *
 * `fetchJoblistInPage` 是**页面上下文函数**（`page.evaluate` 序列化后送进浏览器执行）：
 * 不得引用任何模块级的值；`extrasMapOf` / `salaryMapOf` 是宿主机侧的纯解析，不受此限。
 * 完整实测记录见 `./index.ts` 的文件头。
 */
/**
 * **在页面上下文里**发 joblist 请求（自包含；用页面自己的 fetch 带 Cookie/指纹/TLS）。
 * 返回解析后的 JSON；任何失败返回 `null`（调用方**保持 DOM 结果**）。
 */
export function fetchJoblistInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: arg.body,
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/**
 * 从 joblist 响应里取 `encryptJobId → 补充字段`。
 *
 * 连接键是 `encryptJobId` ↔ 卡片 href 里那个 id（2026-09-18 实测重合 15/15）。
 * 结构不符就返回空表（**不抛错**：这条通道只是"锦上添花"，失败不该让整轮抓取失败）。
 */
export function extrasMapOf(payload) {
    const out = new Map();
    if (payload === null || typeof payload !== 'object')
        return out;
    const list = payload.zpData?.jobList;
    if (!Array.isArray(list))
        return out;
    for (const entry of list) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const item = entry;
        const id = typeof item['encryptJobId'] === 'string' ? item['encryptJobId'] : '';
        if (id === '')
            continue;
        const str = (key) => (typeof item[key] === 'string' ? item[key].trim() : '');
        const arr = (key) => Array.isArray(item[key])
            ? item[key].filter((value) => typeof value === 'string' && value.trim() !== '')
            : [];
        out.set(id, {
            salaryDesc: str('salaryDesc'),
            skills: arr('skills'),
            welfareList: arr('welfareList'),
            brandIndustry: str('brandIndustry'),
            brandScaleName: str('brandScaleName'),
            brandStageName: str('brandStageName'),
            areaDistrict: str('areaDistrict'),
            businessDistrict: str('businessDistrict'),
            securityId: str('securityId'),
        });
    }
    return out;
}
/**
 * 从 joblist 响应里取 `encryptJobId → salaryDesc`（探针与旧调用方的窄视图）。
 * 只是 `extrasMapOf` 的一层投影，契约不变：缺 salaryDesc 的条目要跳过。
 */
export function salaryMapOf(payload) {
    const out = new Map();
    for (const [id, extras] of extrasMapOf(payload)) {
        if (extras.salaryDesc === '')
            continue;
        out.set(id, extras.salaryDesc);
    }
    return out;
}
//# sourceMappingURL=api.js.map